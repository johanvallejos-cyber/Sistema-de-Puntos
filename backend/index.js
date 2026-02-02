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
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'sistema_puntos',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

// Mapa auxiliar para contar conectados por sala
const conectadosPorSala = {}; 

// --- FUNCIONES AUXILIARES ---

function actualizarConectados(codigo) {
    if (!conectadosPorSala[codigo]) {
        conectadosPorSala[codigo] = new Set();
    }
    
    const sala = io.sockets.adapter.rooms.get(codigo);
    if (!sala) {
        conectadosPorSala[codigo].clear();
    } else {
        conectadosPorSala[codigo].clear();
        for (const sid of sala) {
            const s = io.sockets.sockets.get(sid);
            if (s && s.data.rol === 'alumno') {
                conectadosPorSala[codigo].add(sid);
            }
        }
    }
    
    const cantidad = conectadosPorSala[codigo].size;
    const nombres = [];
    for (const sid of conectadosPorSala[codigo]) {
        const s = io.sockets.sockets.get(sid);
        if (s && s.data.nombre) nombres.push(s.data.nombre);
    }
    
    io.to(codigo).emit('conectados_actualizados', { cantidad, nombres });
    io.to(codigo).emit('actualizar_lista_alumnos', nombres);
}

// --- SOCKETS ---

io.on('connection', (socket) => {
    console.log('⚡ Usuario conectado:', socket.id);
    
    socket.on('unirse_sala', ({ codigo, nombre }) => {
        const salaId = codigo.toUpperCase().trim();
        const esDocente = nombre === 'Docente_Master';
        
        // Evitar duplicados de nombres para alumnos
        if (!esDocente) {
            const sala = io.sockets.adapter.rooms.get(salaId);
            if (sala) {
                for (const clientId of sala) {
                    const s = io.sockets.sockets.get(clientId);
                    if (s && s.data.nombre?.toLowerCase() === nombre.toLowerCase().trim() && s.id !== socket.id) {
                        socket.emit('error_unirse', '⚠️ Este nombre ya está en uso en esta sala.');
                        return;
                    }
                }
            }
        }
        
        socket.data = { 
            nombre, 
            rol: esDocente ? 'docente' : 'alumno', 
            codigoActividad: salaId 
        };
        
        // Suscripción a salas
        socket.join(salaId); 
        if (esDocente) {
            socket.join(`docente_${salaId}`); // Sala especial para alertas
            console.log(`👨‍🏫 Docente unido a sala: ${salaId} y docente_${salaId}`);
        } else {
            console.log(`🎓 Alumno ${nombre} unido a sala: ${salaId}`);
        }
        
        actualizarConectados(salaId);
    });
    
    socket.on('solicitar_accion', ({ codigoActividad, tipo, datos }) => {
        const salaId = codigoActividad.toUpperCase().trim();
        console.log(`📩 Solicitud ${tipo} de ${datos.nombre} para sala: ${salaId}`);
        
        const payload = { 
            tipo, 
            datos, 
            socketId: socket.id,
            tiempo: new Date().toLocaleTimeString() 
        };
        
        // ✅ CLAVE: Enviamos a la sala general Y a la sala privada del docente
        io.to(salaId).to(`docente_${salaId}`).emit('notificacion_profe', payload);
    });

    socket.on('responder_solicitud', ({ socketIdAlumno, aprobado, tipo }) => {
        if (!socketIdAlumno) return;
        console.log(`📤 Respuesta enviada a ${socketIdAlumno}: ${aprobado}`);
        io.to(socketIdAlumno).emit('respuesta_solicitud', { aprobado, tipo });
    });

    socket.on('iniciar_actividad', ({ codigoActividad, tiempoLimite }) => {
        const salaId = codigoActividad.toUpperCase().trim();
        console.log(`🚀 Actividad iniciada en sala ${salaId}`);
        io.to(salaId).emit('actividad_iniciada', { tiempoLimite, estado: 'ACTIVA' });
    });

    socket.on('terminar_actividad', (datos) => {
        const codigo = typeof datos === 'string' ? datos : datos.codigoActividad;
        if (!codigo) return;
        const salaId = codigo.toUpperCase().trim();
        io.to(salaId).emit('actividad_terminada');
        if (conectadosPorSala[salaId]) delete conectadosPorSala[salaId];
    });
    
    socket.on('disconnect', () => {
        if (socket.data && socket.data.codigoActividad) {
            const codigo = socket.data.codigoActividad;
            if (conectadosPorSala[codigo] && socket.data.rol === 'alumno') {
                conectadosPorSala[codigo].delete(socket.id);
            }
            actualizarConectados(codigo);
        }
        console.log('🔥 Desconectado:', socket.id);
    });
});

// --- RUTAS API ---

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
    } catch (err) { res.status(500).json({ error: 'Error login' }); }
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
        const codigoGrupo = 'GRP-' + Math.floor(1000 + Math.random() * 9000); 
        const nuevoGrupo = await pool.query('INSERT INTO grupos (codigo, nombre, actividad_id) VALUES ($1, $2, $3) RETURNING id, codigo, nombre', [codigoGrupo, nombreGrupo, act.rows[0].id]);
        const nuevoEstudiante = await pool.query('INSERT INTO estudiantes (nombre, grupo_id) VALUES ($1, $2) RETURNING id, nombre', [nombreLider, nuevoGrupo.rows[0].id]);
        await pool.query('UPDATE grupos SET lider_id = $1 WHERE id = $2', [nuevoEstudiante.rows[0].id, nuevoGrupo.rows[0].id]);
        io.to(codigoActividad).emit('grupos_actualizados'); 
        res.json({ grupo: nuevoGrupo.rows[0], estudiante: nuevoEstudiante.rows[0] });
    } catch (err) { res.status(500).json({ error: 'Error creando grupo' }); }
});

app.post('/api/unirse', async (req, res) => {
    try {
        const { codigoGrupo, nombreEstudiante } = req.body;
        const grupo = await pool.query('SELECT * FROM grupos WHERE codigo = $1', [codigoGrupo]);
        if (grupo.rows.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
        const nuevoEstudiante = await pool.query('INSERT INTO estudiantes (nombre, grupo_id) VALUES ($1, $2) RETURNING *', [nombreEstudiante, grupo.rows[0].id]);
        res.json(nuevoEstudiante.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Error al unirse al grupo' }); }
});

app.get('/api/grupo/:codigo/miembros', async (req, res) => {
    try {
        const { codigo } = req.params;
        const grupo = await pool.query('SELECT id FROM grupos WHERE codigo = $1', [codigo]);
        const miembros = await pool.query('SELECT id, nombre FROM estudiantes WHERE grupo_id = $1', [grupo.rows[0].id]);
        res.json(miembros.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/evaluar', async (req, res) => {
    try {
        const { evaluadorId, grupoId, evaluaciones } = req.body;
        for (const voto of evaluaciones) {
            const { tipo, puntaje, evaluadoId } = voto; 
            await pool.query(
                `INSERT INTO evaluaciones (evaluador_id, evaluado_grupo_id, evaluado_estudiante_id, tipo, puntaje) 
                VALUES ($1, $2, $3, $4, $5) ON CONFLICT ON CONSTRAINT voto_unico DO UPDATE SET puntaje = EXCLUDED.puntaje`,
                [evaluadorId, grupoId, evaluadoId || null, tipo, puntaje]
            );
        }
        res.json({ message: 'Guardado correctamente' });
    } catch (err) { res.status(500).json({ error: 'Error al guardar evaluación' }); }
});

app.get('/api/reporte-global', async (req, res) => {
    try {
        const query = `
        SELECT a.nombre as nombre_actividad, g.codigo as codigo_grupo, g.nombre as grupo, 
        ROUND(AVG(CASE WHEN e.tipo = 'GRUPAL' THEN e.puntaje END), 2) as nota_grupal,
        ROUND(AVG(CASE WHEN e.tipo = 'INDIVIDUAL' THEN e.puntaje END), 2) as nota_individual_externa,
        ROUND(AVG(CASE WHEN e.tipo = 'INTRAGRUPAL' THEN e.puntaje END), 2) as nota_intragrupal,
        ROUND((COALESCE(AVG(CASE WHEN e.tipo = 'GRUPAL' THEN e.puntaje END), 0) * (a.peso_grupal / 100.0) +
               COALESCE(AVG(CASE WHEN e.tipo = 'INDIVIDUAL' THEN e.puntaje END), 0) * (a.peso_individual / 100.0) +
               COALESCE(AVG(CASE WHEN e.tipo = 'INTRAGRUPAL' THEN e.puntaje END), 0) * (a.peso_intragrupal / 100.0)), 2) as promedio_final
        FROM grupos g JOIN actividades a ON g.actividad_id = a.id 
        LEFT JOIN evaluaciones e ON g.id = e.evaluado_grupo_id 
        GROUP BY g.id, g.codigo, g.nombre, a.nombre, a.id, a.peso_grupal, a.peso_individual, a.peso_intragrupal
        ORDER BY promedio_final DESC;`;
        const resultados = await pool.query(query);
        res.json(resultados.rows);
    } catch (err) { res.status(500).json({ error: 'Error en reporte' }); }
});

app.get('/api/actividad/:codigo/grupos-detalle', async (req, res) => {
    try {
        const { codigo } = req.params;
        const grupos = await pool.query(`SELECT g.id, g.nombre, g.codigo, g.lider_id FROM grupos g JOIN actividades a ON g.actividad_id = a.id WHERE a.codigo = $1`, [codigo]);
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
        const idActividad = act.rows[0].id;
        await pool.query('DELETE FROM evaluaciones WHERE evaluado_grupo_id IN (SELECT id FROM grupos WHERE actividad_id = $1)', [idActividad]);
        await pool.query('DELETE FROM estudiantes WHERE grupo_id IN (SELECT id FROM grupos WHERE actividad_id = $1)', [idActividad]);
        await pool.query('DELETE FROM grupos WHERE actividad_id = $1', [idActividad]);
        await pool.query('DELETE FROM actividades WHERE id = $1', [idActividad]);
        res.json({ message: 'Actividad eliminada' });
    } catch (err) { res.status(500).json({ error: 'Error al eliminar' }); }
});

app.post('/api/estudiante/salir', async (req, res) => {
    try {
        const { idEstudiante, idNuevoLider } = req.body; 
        const est = await pool.query('SELECT grupo_id FROM estudiantes WHERE id = $1', [idEstudiante]);
        const grupoId = est.rows[0].grupo_id;
        const grupo = await pool.query('SELECT lider_id, actividad_id FROM grupos WHERE id = $1', [grupoId]);
        
        await pool.query('DELETE FROM evaluaciones WHERE evaluador_id = $1 OR evaluado_estudiante_id = $1', [idEstudiante]);
        if (grupo.rows[0].lider_id === idEstudiante) {
            const miembros = await pool.query('SELECT id FROM estudiantes WHERE grupo_id = $1 AND id != $2', [grupoId, idEstudiante]);
            if (miembros.rows.length === 0) {
                await pool.query('DELETE FROM estudiantes WHERE id = $1', [idEstudiante]);
                await pool.query('DELETE FROM grupos WHERE id = $1', [grupoId]);
            } else {
                await pool.query('UPDATE grupos SET lider_id = $1 WHERE id = $2', [idNuevoLider || miembros.rows[0].id, grupoId]);
                await pool.query('DELETE FROM estudiantes WHERE id = $1', [idEstudiante]);
            }
        } else {
            await pool.query('DELETE FROM estudiantes WHERE id = $1', [idEstudiante]);
        }
        res.json({ message: 'Salida procesada' });
    } catch (err) { res.status(500).json({ error: 'Error al salir' }); }
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
