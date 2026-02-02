const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const http = require('http'); 
const { Server } = require('socket.io'); 
const bcrypt = require('bcryptjs'); 
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app); 
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5433,
});

// Mapa auxiliar para contar conectados por sala de forma más confiable
const conectadosPorSala = {}; // codigo → Set<socket.id>

// --- FUNCIONES AUXILIARES ---

function actualizarConectados(codigo) {
    if (!conectadosPorSala[codigo]) {
        conectadosPorSala[codigo] = new Set();
    }

    const sala = io.sockets.adapter.rooms.get(codigo);
    if (!sala) {
        conectadosPorSala[codigo].clear();
    } else {
        // Limpiamos los que ya no están en el room
        for (const sid of conectadosPorSala[codigo]) {
            if (!sala.has(sid)) {
                conectadosPorSala[codigo].delete(sid);
            }
        }
        // Agregamos los que sí están (evitamos duplicados porque es Set)
        for (const sid of sala) {
            const s = io.sockets.sockets.get(sid);
            if (s && s.data.rol === 'alumno') {  // solo alumnos
                conectadosPorSala[codigo].add(sid);
            }
        }
    }

    const cantidad = conectadosPorSala[codigo].size;
    const nombres = [];

    for (const sid of conectadosPorSala[codigo]) {
        const s = io.sockets.sockets.get(sid);
        if (s && s.data.nombre) {
            nombres.push(s.data.nombre);
        }
    }

    io.to(codigo).emit('conectados_actualizados', { cantidad, nombres });
    // También mantenemos compatibilidad con el evento viejo si lo usas en algún lado
    io.to(codigo).emit('actualizar_lista_alumnos', nombres);
}

// --- SOCKETS ---

io.on('connection', (socket) => {
    console.log('⚡ Usuario conectado:', socket.id);

    // 1. Unirse a la sala de actividad (usado por docente y alumno)
    // Dentro de socket.on('unirse_sala', ...) en backend/index.js
socket.on('unirse_sala', ({ codigo, nombre }) => {
    const salaId = codigo.toUpperCase().trim();
    const esDocente = nombre === 'Docente_Master';

    // 🛡️ NUEVA LÓGICA: Permitir re-entrada si el socket ID es el mismo o si el anterior ya no existe
    if (!esDocente) {
        const sala = io.sockets.adapter.rooms.get(salaId);
        if (sala) {
            for (const clientId of sala) {
                const s = io.sockets.sockets.get(clientId);
                // Solo bloqueamos si el nombre es igual PERO el socket ID es diferente (otro usuario real)
                if (s && s.data.nombre?.toLowerCase() === nombre.toLowerCase().trim() && s.id !== socket.id) {
                    socket.emit('error_unirse', '⚠️ Este nombre ya está en uso en esta sala.');
                    return;
                }
            }
        }
    }

    socket.join(salaId);
    socket.data = { nombre, rol: esDocente ? 'docente' : 'alumno', codigoActividad: salaId };
    console.log(`✅ ${nombre} conectado a sala: ${salaId}`);
    actualizarConectados(salaId);
});

    // 2. Cambio de grupo (ya lo tenías)
    socket.on('unirse_grupo', async ({ estudianteId, grupoId, codigoActividad }) => {
        try {
            await pool.query('UPDATE estudiantes SET grupo_id = NULL WHERE id = $1', [estudianteId]);
            await pool.query('UPDATE estudiantes SET grupo_id = $1 WHERE id = $2', [grupoId, estudianteId]);
            io.to(codigoActividad).emit('grupos_actualizados');
        } catch (err) {
            console.error("Error unirse_grupo:", err);
        }
    });

    // 3. Acciones de actividad (sin cambios mayores)
    socket.on('iniciar_actividad', ({ codigoActividad, tiempoLimite }) => {
        io.to(codigoActividad).emit('actividad_iniciada', { tiempoLimite });
    });

    socket.on('terminar_actividad', (datos) => {
        const codigo = typeof datos === 'string' ? datos : datos.codigoActividad;
        if (!codigo) return;

        console.log(`🏁 Finalizando actividad: ${codigo}`);
        io.to(codigo).emit('actividad_terminada');

        // ✅ CORRECCIÓN: Usar el nombre correcto de la variable mapa
        if (conectadosPorSala && conectadosPorSala[codigo]) {
            delete conectadosPorSala[codigo];
        }

        io.in(codigo).socketsLeave(codigo);
    });

    socket.on('solicitar_accion', ({ codigoActividad, tipo, datos }) => {
    // IMPORTANTE: Forzamos el código a mayúsculas para que coincida con la sala
    const salaId = codigoActividad.toUpperCase().trim();
    console.log(`📩 Retransmitiendo ${tipo} a la sala: ${salaId}`);
    
    const payload = { 
        tipo, 
        datos, 
        socketId: socket.id,
        tiempo: new Date().toLocaleTimeString() 
    };

    // Enviamos a todos en la sala (incluyendo al profe)
    io.to(salaId).emit('notificacion_profe', payload);
});

    socket.on('responder_solicitud', ({ socketIdAlumno, aprobado, tipo }) => {
        io.to(socketIdAlumno).emit('respuesta_solicitud', { aprobado, tipo });
    });

    // 4. Limpieza al desconectar (más confiable sin setTimeout)
    socket.on('disconnect', () => {
        console.log('🔥 Usuario desconectado:', socket.id);

        if (socket.data && socket.data.codigoActividad) {
            const codigo = socket.data.codigoActividad;
            if (conectadosPorSala[codigo] && socket.data.rol === 'alumno') {
                conectadosPorSala[codigo].delete(socket.id);
            }
            actualizarConectados(codigo);
        }
    });

});
// --- RUTAS API ---

// Login & Register
app.post('/api/register', async (req, res) => {
    try {
        const { nombre, email, password } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const nuevoDocente = await pool.query('INSERT INTO docentes (nombre, email, password) VALUES ($1, $2, $3) RETURNING id, nombre, email', [nombre, email, hashedPassword]);
        res.json(nuevoDocente.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Error server' }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const usuario = await pool.query('SELECT * FROM docentes WHERE email = $1', [email]);
        if (usuario.rows.length === 0) return res.status(400).json({ error: 'Usuario no encontrado' });
        const validPassword = await bcrypt.compare(password, usuario.rows[0].password);
        if (!validPassword) return res.status(400).json({ error: 'Contraseña incorrecta' });
        res.json({ id: usuario.rows[0].id, nombre: usuario.rows[0].nombre, email: usuario.rows[0].email });
    } catch (err) { 
        console.error("❌ ERROR EN LOGIN:", err); // <--- AGREGA ESTO
        res.status(500).json({ error: 'Error login' }); 
    }
});

app.post('/api/actividad', async (req, res) => {
    try {
        const { nombre, docenteId, pesos } = req.body; 
        const pG = pesos?.grupal || 34;
        const pI = pesos?.individual || 33;
        const pIntra = pesos?.intragrupal || 33;
        const codigo = Math.random().toString(36).substring(2, 7).toUpperCase(); 
        
        const result = await pool.query(
            `INSERT INTO actividades (codigo, nombre, docente_id, estado, peso_grupal, peso_individual, peso_intragrupal) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, 
            [codigo, nombre, docenteId, 'ESPERA', pG, pI, pIntra]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Error crear actividad' }); }
});

app.get('/api/docente/:id/actividades', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`SELECT a.*, COUNT(DISTINCT g.id) as grupos_count FROM actividades a LEFT JOIN grupos g ON a.id = g.actividad_id WHERE a.docente_id = $1 GROUP BY a.id ORDER BY a.created_at DESC`, [id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Error obtener' }); }
});

app.post('/api/actividad/iniciar', async (req, res) => {
    try {
        const { codigo, duracionMinutos } = req.body;
        await pool.query(`UPDATE actividades SET estado = 'ACTIVA', fecha_inicio = NOW(), duracion_minutos = $2 WHERE codigo = $1`, [codigo, duracionMinutos]);
        res.json({ message: 'Iniciada' });
    } catch (err) { res.status(500).json({ error: 'Error iniciar' }); }
});

app.post('/api/actividad/terminar', async (req, res) => {
    try {
        const { codigo } = req.body;
        await pool.query(`UPDATE actividades SET estado = 'FINALIZADA' WHERE codigo = $1`, [codigo]);
        
        // ✅ CORRECCIÓN: Nombre de variable correcto
        if (conectadosPorSala[codigo]) delete conectadosPorSala[codigo];

        res.json({ message: 'Terminada' });
    } catch (err) { res.status(500).json({ error: 'Error al terminar' }); }
});
app.get('/api/actividad/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        const act = await pool.query('SELECT nombre, estado, duracion_minutos, fecha_inicio, codigo FROM actividades WHERE codigo = $1', [codigo]);
        if (act.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
        res.json(act.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/grupo', async (req, res) => {
    try {
        const { codigoActividad, nombreGrupo, nombreLider } = req.body;
        const act = await pool.query('SELECT id, estado FROM actividades WHERE codigo = $1', [codigoActividad]);
        if (act.rows.length === 0) return res.status(404).json({ error: 'Código inválido' });
        if (act.rows[0].estado === 'FINALIZADA') return res.status(400).json({ error: 'Actividad cerrada' });

        const codigoGrupo = 'GRP-' + Math.floor(1000 + Math.random() * 9000); 
        const nuevoGrupo = await pool.query(
            'INSERT INTO grupos (codigo, nombre, actividad_id) VALUES ($1, $2, $3) RETURNING id, codigo, nombre', 
            [codigoGrupo, nombreGrupo, act.rows[0].id]
        );
        const grupoId = nuevoGrupo.rows[0].id;

        const nuevoEstudiante = await pool.query(
            'INSERT INTO estudiantes (nombre, grupo_id) VALUES ($1, $2) RETURNING id, nombre',
            [nombreLider, grupoId]
        );
        const liderId = nuevoEstudiante.rows[0].id;

        await pool.query('UPDATE grupos SET lider_id = $1 WHERE id = $2', [liderId, grupoId]);
        io.to(codigoActividad).emit('grupos_actualizados'); 
        res.json({ grupo: nuevoGrupo.rows[0], estudiante: nuevoEstudiante.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Error creando grupo' }); }
});

app.post('/api/unirse', async (req, res) => {
    try {
        const { codigoGrupo, nombreEstudiante } = req.body;
        const grupo = await pool.query('SELECT * FROM grupos WHERE codigo = $1', [codigoGrupo]);
        if (grupo.rows.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
        
        const idGrupo = grupo.rows[0].id;
        const nuevoEstudiante = await pool.query(
            `INSERT INTO estudiantes (nombre, grupo_id) 
             VALUES ($1, $2)
             ON CONFLICT ON CONSTRAINT nombre_unico_por_grupo 
             DO UPDATE SET nombre = EXCLUDED.nombre 
             RETURNING *`,
            [nombreEstudiante, idGrupo]
        );
        res.json(nuevoEstudiante.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Error al unirse al grupo' }); }
});

app.get('/api/grupo/:codigo/miembros', async (req, res) => {
    try {
        const { codigo } = req.params;
        const grupo = await pool.query('SELECT id FROM grupos WHERE codigo = $1', [codigo]);
        if (grupo.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
        const miembros = await pool.query('SELECT id, nombre FROM estudiantes WHERE grupo_id = $1', [grupo.rows[0].id]);
        res.json(miembros.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/evaluar', async (req, res) => {
    try {
        const { evaluadorId, grupoId, evaluaciones } = req.body;
        const checkEstado = await pool.query(
            `SELECT a.estado FROM actividades a JOIN grupos g ON g.actividad_id = a.id WHERE g.id = $1`,
            [grupoId]
        );

        if (checkEstado.rows.length > 0 && checkEstado.rows[0].estado === 'FINALIZADA') {
            return res.status(403).json({ error: '⛔ La actividad ya terminó. No se aceptan más votos.' });
        }

        for (const voto of evaluaciones) {
            const { tipo, puntaje, evaluadoId } = voto; 
             await pool.query(
                `INSERT INTO evaluaciones (evaluador_id, evaluado_grupo_id, evaluado_estudiante_id, tipo, puntaje) 
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT ON CONSTRAINT voto_unico 
                 DO UPDATE SET puntaje = EXCLUDED.puntaje`,
                [evaluadorId, grupoId, evaluadoId || null, tipo, puntaje]
            );
        }
        res.json({ message: 'Guardado correctamente' });
    } catch (err) { res.status(500).json({ error: 'Error al guardar evaluación' }); }
});

app.get('/api/reporte-global', async (req, res) => {
    try {
        const query = `
            SELECT 
                a.nombre as nombre_actividad, 
                g.codigo as codigo_grupo, 
                g.nombre as grupo, 
                COUNT(DISTINCT e.id) as total_votos,
                ROUND(AVG(CASE WHEN e.tipo = 'GRUPAL' THEN e.puntaje END), 2) as nota_grupal,
                ROUND(AVG(CASE WHEN e.tipo = 'INDIVIDUAL' THEN e.puntaje END), 2) as nota_individual_externa,
                ROUND(AVG(CASE WHEN e.tipo = 'INTRAGRUPAL' THEN e.puntaje END), 2) as nota_intragrupal,
                ROUND(
                    (
                        COALESCE(AVG(CASE WHEN e.tipo = 'GRUPAL' THEN e.puntaje END), 0) * (a.peso_grupal / 100.0) +
                        COALESCE(AVG(CASE WHEN e.tipo = 'INDIVIDUAL' THEN e.puntaje END), 0) * (a.peso_individual / 100.0) +
                        COALESCE(AVG(CASE WHEN e.tipo = 'INTRAGRUPAL' THEN e.puntaje END), 0) * (a.peso_intragrupal / 100.0)
                    ), 2
                ) as promedio_final
            FROM grupos g 
            JOIN actividades a ON g.actividad_id = a.id 
            LEFT JOIN evaluaciones e ON g.id = e.evaluado_grupo_id 
            GROUP BY g.id, g.codigo, g.nombre, a.nombre, a.id, a.peso_grupal, a.peso_individual, a.peso_intragrupal
            ORDER BY a.id DESC, promedio_final DESC;
        `;
        const resultados = await pool.query(query);
        res.json(resultados.rows);
    } catch (err) { res.status(500).json({ error: 'Error en reporte' }); }
});

app.get('/api/exportar-todo-detalle', async (req, res) => {
    try {
        const query = `SELECT act.nombre as actividad, g_origen.nombre as grupo_evaluador, est_origen.nombre as evaluador, e.tipo as tipo_voto, e.puntaje, CASE WHEN e.tipo = 'GRUPAL' THEN g_destino.nombre ELSE est_destino.nombre END as evaluado_nombre, g_destino.nombre as grupo_evaluado FROM evaluaciones e JOIN estudiantes est_origen ON e.evaluador_id = est_origen.id JOIN grupos g_origen ON est_origen.grupo_id = g_origen.id JOIN grupos g_destino ON e.evaluado_grupo_id = g_destino.id JOIN actividades act ON g_origen.actividad_id = act.id LEFT JOIN estudiantes est_destino ON e.evaluado_estudiante_id = est_destino.id ORDER BY act.nombre, g_origen.nombre, est_origen.nombre, e.tipo;`;
        const resultado = await pool.query(query);
        res.json(resultado.rows);
    } catch (err) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/actividad/:codigo/grupos-detalle', async (req, res) => {
    try {
        const { codigo } = req.params;
        const grupos = await pool.query(`
            SELECT g.id, g.nombre, g.codigo, g.lider_id 
            FROM grupos g 
            JOIN actividades a ON g.actividad_id = a.id 
            WHERE a.codigo = $1 ORDER BY g.id DESC`, 
            [codigo]
        );
        const listaCompleta = await Promise.all(grupos.rows.map(async (grupo) => {
            const miembros = await pool.query('SELECT id, nombre FROM estudiantes WHERE grupo_id = $1', [grupo.id]);
            return { ...grupo, miembros: miembros.rows };
        }));
        res.json(listaCompleta);
    } catch (err) { res.status(500).json({ error: 'Error cargando grupos' }); }
});

app.delete('/api/actividad/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        const act = await pool.query('SELECT id FROM actividades WHERE codigo = $1', [codigo]);
        if (act.rows.length === 0) return res.status(404).json({ error: 'No existe' });
        const idActividad = act.rows[0].id;
        const grupos = await pool.query('SELECT id FROM grupos WHERE actividad_id = $1', [idActividad]);
        const idsGrupos = grupos.rows.map(g => g.id);
        if (idsGrupos.length > 0) {
            await pool.query('DELETE FROM evaluaciones WHERE evaluado_grupo_id = ANY($1)', [idsGrupos]);
            await pool.query('DELETE FROM estudiantes WHERE grupo_id = ANY($1)', [idsGrupos]);
            await pool.query('DELETE FROM grupos WHERE actividad_id = $1', [idActividad]);
        }
        await pool.query('DELETE FROM actividades WHERE id = $1', [idActividad]);
        res.json({ message: 'Actividad eliminada y datos limpiados' });
    } catch (err) { res.status(500).json({ error: 'Error al eliminar actividad' }); }
});

app.post('/api/estudiante/salir', async (req, res) => {
    try {
        const { idEstudiante, idNuevoLider } = req.body; 
        const est = await pool.query('SELECT grupo_id, nombre FROM estudiantes WHERE id = $1', [idEstudiante]);
        if (est.rows.length === 0) return res.status(404).json({ error: 'Estudiante no encontrado' });
        
        const grupoId = est.rows[0].grupo_id;
        const grupo = await pool.query('SELECT lider_id, codigo, actividad_id FROM grupos WHERE id = $1', [grupoId]);
        const esLider = grupo.rows[0].lider_id === idEstudiante;

        await pool.query('DELETE FROM evaluaciones WHERE evaluador_id = $1 OR evaluado_estudiante_id = $1', [idEstudiante]);

        if (esLider) {
            const miembros = await pool.query('SELECT id FROM estudiantes WHERE grupo_id = $1 AND id != $2', [grupoId, idEstudiante]);
            if (miembros.rows.length === 0) {
                await pool.query('DELETE FROM estudiantes WHERE id = $1', [idEstudiante]); 
                await pool.query('DELETE FROM evaluaciones WHERE evaluado_grupo_id = $1', [grupoId]); 
                await pool.query('DELETE FROM grupos WHERE id = $1', [grupoId]); 
            } else {
                let nuevoLider = idNuevoLider;
                if (!nuevoLider) nuevoLider = miembros.rows[0].id;
                await pool.query('UPDATE grupos SET lider_id = $1 WHERE id = $2', [nuevoLider, grupoId]);
                await pool.query('DELETE FROM estudiantes WHERE id = $1', [idEstudiante]);
            }
        } else {
            await pool.query('DELETE FROM estudiantes WHERE id = $1', [idEstudiante]);
        }

        const act = await pool.query('SELECT codigo FROM actividades WHERE id = $1', [grupo.rows[0].actividad_id]);
        const codigoActividad = act.rows[0].codigo;
        io.to(codigoActividad).emit('grupos_actualizados'); 
        res.json({ message: 'Salida procesada', codigoActividad });
    } catch (err) { res.status(500).json({ error: 'Error al procesar salida' }); }
});

app.delete('/api/estudiante/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM evaluaciones WHERE evaluador_id = $1 OR evaluado_estudiante_id = $1', [id]);
        await pool.query('DELETE FROM estudiantes WHERE id = $1', [id]);
        res.json({ message: 'Eliminado' });
    } catch (err) { res.status(500).json({ error: 'Error eliminar' }); }
});

app.get('/api/exportar-excel', async (req, res) => {
    try {
        const query = `
            SELECT 
                a.nombre as actividad, 
                g.codigo as codigo_grupo,
                g.nombre as grupo, 
                ROUND(AVG(CASE WHEN e.tipo = 'GRUPAL' THEN e.puntaje END), 2) as nota_grupal,
                ROUND(AVG(CASE WHEN e.tipo = 'INDIVIDUAL' THEN e.puntaje END), 2) as nota_individual,
                ROUND(AVG(CASE WHEN e.tipo = 'INTRAGRUPAL' THEN e.puntaje END), 2) as nota_intragrupal,
                -- ✅ CORRECCIÓN: Usar los pesos reales de la actividad
                ROUND(
                    (COALESCE(AVG(CASE WHEN e.tipo = 'GRUPAL' THEN e.puntaje END), 0) * (a.peso_grupal / 100.0)) +
                    (COALESCE(AVG(CASE WHEN e.tipo = 'INDIVIDUAL' THEN e.puntaje END), 0) * (a.peso_individual / 100.0)) +
                    (COALESCE(AVG(CASE WHEN e.tipo = 'INTRAGRUPAL' THEN e.puntaje END), 0) * (a.peso_intragrupal / 100.0)), 
                2) as promedio_final
            FROM grupos g 
            JOIN actividades a ON g.actividad_id = a.id 
            LEFT JOIN evaluaciones e ON g.id = e.evaluado_grupo_id 
            GROUP BY g.id, g.nombre, g.codigo, a.nombre, a.peso_grupal, a.peso_individual, a.peso_intragrupal
            ORDER BY promedio_final DESC;
        `;
        const resultado = await pool.query(query);
        res.json(resultado.rows);
    } catch (err) { 
        console.error("Error exportar:", err);
        res.status(500).json({ error: 'Error al obtener datos para Excel' }); 
    }
});

server.listen(4000, () => { console.log(`✅ Servidor OK en puerto 4000`); });