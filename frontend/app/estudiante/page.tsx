"use client";
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
// Importamos los iconos bonitos
import { LogOut, User, Users, Play, Clock, Star, CheckCircle, AlertCircle, ArrowRight, DoorOpen, LogIn } from 'lucide-react';

let socket: Socket | null = null;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const esMismoID = (id1: any, id2: any) => {
    if (!id1 || !id2) return false;
    return String(id1) === String(id2);
};

function ContenidoEstudiante() {
    const searchParams = useSearchParams();

    // ESTADOS
    const [vista, setVista] = useState('CARGANDO');
    const [form, setForm] = useState({ codigoActividad: '', nombre: '' });
    const [actividadInfo, setActividadInfo] = useState<any>(null);
    const [miDatos, setMiDatos] = useState<any>(null);
    const [tiempoRestante, setTiempoRestante] = useState<number | null>(null);
    const [gruposDisponibles, setGruposDisponibles] = useState<any[]>([]);
    
    // EVALUACIÓN
    const [grupoObjetivo, setGrupoObjetivo] = useState<any>(null);
    const [miembrosObjetivo, setMiembrosObjetivo] = useState<any[]>([]);
    const [notaGrupal, setNotaGrupal] = useState(0);
    const [notasIndividuales, setNotasIndividuales] = useState<{ [key: number]: number }>({});

    // ────────────────────────────────────────────────
    // 1. LÓGICA DE ENTRADA Y LIMPIEZA AUTOMÁTICA
    // ────────────────────────────────────────────────
    useEffect(() => {
        const codigoURL = searchParams.get('codigo');
        const sesionGuardada = sessionStorage.getItem('class_eval_sesion');

        // 🛡️ SEGURIDAD EXTRA: Si cambiamos de código, limpiar FORMULARIO visual
        if (codigoURL && form.codigoActividad !== codigoURL) {
            setForm(prev => ({ ...prev, codigoActividad: codigoURL, nombre: '' }));
        }

        if (sesionGuardada) {
            const datos = JSON.parse(sesionGuardada);

            // CASO: Hay sesión vieja pero el código URL es nuevo
            if (codigoURL && datos.codigoActividad !== codigoURL) {
                console.log("Detectado cambio de actividad: Limpiando sesión anterior...");
                sessionStorage.removeItem('class_eval_sesion');
                sessionStorage.removeItem('class_eval_votos');
                setMiDatos(null);
                setForm({ codigoActividad: codigoURL, nombre: '' });
                verificarCodigoBackend(codigoURL);
                return;
            }

            // CASO: Es la misma actividad, recuperamos sesión
            setMiDatos(datos);
            setForm({ nombre: datos.nombre, codigoActividad: datos.codigoActividad });

            fetch(`${API_URL}/api/actividad/${datos.codigoActividad}`)
                .then(r => r.json())
                .then(act => {
                    setActividadInfo(act);
                    if (act.estado === 'FINALIZADA') {
                        setVista('FINALIZADO');
                    } else if (datos.grupo_id) {
                        if (act.estado === 'ACTIVA') {
                            setTiempoRestante(act.duracion_minutos * 60); // segundos
                            setVista('DASHBOARD');
                        } else setVista('SELECCION_GRUPO');
                    } else setVista('SELECCION_GRUPO');
                })
                .catch(() => setVista('PASO_1_CODIGO'));
            return;
        }

        // Si no hay sesión, asegurar que el formulario tenga el código pero NO nombre
        if (codigoURL) {
            setForm(prev => ({ ...prev, codigoActividad: codigoURL, nombre: '' }));
            verificarCodigoBackend(codigoURL);
        } else {
            setVista('PASO_1_CODIGO');
        }
    }, [searchParams]);

    // ────────────────────────────────────────────────
    // 2. SOCKETS + UNIÓN A SALA (CORREGIDO)
    // ────────────────────────────────────────────────
    // Effect 1: Inicialización del socket (sin vista en deps para no perder listeners)
    useEffect(() => {
        if (!form.codigoActividad) return;

        if (!socket || !socket.connected) {
            socket = io(API_URL, { 
                reconnection: true,
                reconnectionAttempts: 5,
                timeout: 5000 
            });

            socket.on('connect', () => {
                console.log("✅ [SOCKET] Conectado → ID:", socket?.id);
                const nombreAEnviar = miDatos?.nombre || form.nombre;
                const codLimpio = form.codigoActividad.toUpperCase().trim();
                if (nombreAEnviar && codLimpio) {
                    socket?.emit('unirse_sala', { codigo: codLimpio, nombre: nombreAEnviar.trim() });
                }
            });

            socket.on('error_unirse', (mensaje: string) => {
                alert(mensaje);
                sessionStorage.removeItem('class_eval_sesion');
                setMiDatos(null);
                setForm(prev => ({ ...prev, nombre: '' }));
                setVista('PASO_1_CODIGO');
            });

            socket.on('actividad_iniciada', ({ tiempoLimite }: any) => {
                console.log("🚀 Señal de inicio recibida del servidor");
                setTiempoRestante(tiempoLimite);
                setVista((v) => (v !== 'FINALIZADO' ? 'DASHBOARD' : v));
            });

            socket.on('actividad_terminada', () => {
                console.log("[SOCKET] Actividad terminada");
                alert("El profesor ha terminado la actividad.");
                sessionStorage.removeItem('class_eval_sesion');
                sessionStorage.removeItem('class_eval_votos');
                setMiDatos(null);
                setVista('FINALIZADO');
                setTiempoRestante(0);
            });

            socket.on('grupos_actualizados', () => { cargarGruposDisponibles(); });

            socket.on('respuesta_solicitud', async ({ aprobado, tipo }: { aprobado: boolean; tipo: string }) => {
                if (tipo === 'INGRESO_TARDE') {
                    if (aprobado) { alert("¡El profesor te aceptó!"); setVista('SELECCION_GRUPO'); }
                    else { alert("El profesor rechazó tu ingreso."); setVista('PASO_1_CODIGO'); }
                }
                if (tipo === 'SALIR_GRUPO' && aprobado) {
                    alert("Has salido del grupo correctamente.");
                    const rawSesion = sessionStorage.getItem('class_eval_sesion');
                    if (rawSesion) {
                        const sesion = JSON.parse(rawSesion);
                        guardarSesion({ ...sesion, grupo_id: null, es_lider: false }, form.codigoActividad);
                    }
                    await cargarGruposDisponibles();
                    setVista('SELECCION_GRUPO');
                }
            });
        }
        return () => {
            // Solo limpiamos al desmontar o al cambiar código; NO al cambiar vista
            if (socket) {
                socket.off('error_unirse');
                socket.off('actividad_iniciada');
                socket.off('actividad_terminada');
                socket.off('grupos_actualizados');
                socket.off('respuesta_solicitud');
            }
        };
    }, [form.codigoActividad]); // Sin vista ni miDatos: evita que se pierdan los listeners al cambiar pantalla

    // Effect 2: Cargar grupos cuando cambia la vista (separado para no tocar los listeners)
    useEffect(() => {
        if (vista === 'SELECCION_GRUPO' || vista === 'DASHBOARD' || vista === 'ESPERANDO_INICIO') {
            cargarGruposDisponibles();
        }
    }, [vista, form.codigoActividad]);

    // ────────────────────────────────────────────────
    // 3. CRONÓMETRO
    // ────────────────────────────────────────────────
    useEffect(() => {
        if (tiempoRestante !== null && tiempoRestante > 0) {
            const timer = setInterval(() => {
                setTiempoRestante(prev => (prev ? prev - 1 : 0));
            }, 60000);
            return () => clearInterval(timer);
        }
    }, [tiempoRestante]);

    // ────────────────────────────────────────────────
    // HELPERS
    // ────────────────────────────────────────────────
    const guardarSesion = (datosEstudiante: any, codigoAct: string) => {
        const sessionData = { ...datosEstudiante, codigoActividad: codigoAct };
        sessionStorage.setItem('class_eval_sesion', JSON.stringify(sessionData));
        setMiDatos(sessionData);
    };

    const cerrarSesion = () => {
        sessionStorage.removeItem('class_eval_sesion');
        sessionStorage.removeItem('class_eval_votos');
        setMiDatos(null);
        setForm({ codigoActividad: '', nombre: '' });
        setVista('PASO_1_CODIGO');
    };

    const solicitarSalirGrupo = () => {
        if (!miDatos || !miDatos.grupo_id) return;
        const miGrupoObj = gruposDisponibles.find(g => esMismoID(g.id, miDatos.grupo_id));
        if (!miGrupoObj) return alert("Error identificando tu grupo actual");

        let nuevoLiderId: string | null = null;
        const soyLider = miDatos.es_lider || esMismoID(miGrupoObj.lider_id, miDatos.id);

        if (soyLider) {
            const otrosMiembros = miGrupoObj.miembros?.filter((m: any) => !esMismoID(m.id, miDatos.id)) || [];
            if (otrosMiembros.length === 0) {
                if (!confirm("Eres el único miembro. Si sales, el grupo será eliminado. ¿Continuar?")) return;
            } else {
                const opciones = otrosMiembros.map((m: any) => `${m.id}: ${m.nombre}`).join('\n');
                const idElegido = prompt(`Eres el líder. Elige nuevo líder (ID):\n\n${opciones}`);
                if (!idElegido) return;
                const elegidoValido = otrosMiembros.find((m: any) => String(m.id) === String(idElegido.trim()));
                if (!elegidoValido) return alert("ID inválido.");
                nuevoLiderId = idElegido.trim();
            }
        } else {
            if (!confirm("¿Solicitar al profesor salir del grupo?")) return;
        }
        socket?.emit('solicitar_accion', {
            codigoActividad: form.codigoActividad,
            tipo: 'SALIR_GRUPO',
            datos: { estudiante: miDatos, nuevoLiderId: nuevoLiderId }
        });
    };

    const verificarCodigoBackend = async (codigo: string) => {
        try {
            const res = await fetch(`${API_URL}/api/actividad/${codigo.toUpperCase()}`);
            if (!res.ok) {
                setVista('PASO_1_CODIGO');
                return alert("Código incorrecto.");
            }
            const data = await res.json();
            setActividadInfo(data);

            if (data.estado === 'FINALIZADA') setVista('FINALIZADO');
            else if (data.estado === 'ACTIVA') {
                if (!miDatos?.nombre) {
                    // Mostrar formulario de nombre para que el alumno ingrese y envíe solicitud de ingreso tarde
                    setVista('PASO_2_NOMBRE');
                } else {
                    if (socket?.connected) {
                        socket.emit('unirse_sala', { codigo: codigo.toUpperCase(), nombre: miDatos.nombre });
                    }
                    setVista('DASHBOARD');
                }
            } else setVista('PASO_2_NOMBRE');
        } catch { alert("Error de conexión"); setVista('PASO_1_CODIGO'); }
    };

    const validarCodigoManual = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.codigoActividad.trim()) return alert("Escribe el código.");
        verificarCodigoBackend(form.codigoActividad.trim().toUpperCase());
    };

    const ingresarSala = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) return alert("El nombre es obligatorio");

    const nombreTrim = form.nombre.trim();
    const codigoLimpio = form.codigoActividad.toUpperCase().trim();
    
    guardarSesion({ nombre: nombreTrim, id: null }, codigoLimpio);

    // ✅ REFUERZO: Si el socket no está conectado, intentamos conectarlo manualmente
    if (!socket?.connected) {
        socket?.connect();
    }

    // Esperamos a que el socket conecte (importante para quien entra por link con actividad ya iniciada)
    let enviado = false;
    const enviarSolicitud = () => {
        if (!socket?.connected || enviado) return false;
        enviado = true;
        socket.emit('unirse_sala', { codigo: codigoLimpio, nombre: nombreTrim });
        if (actividadInfo?.estado === 'ACTIVA') {
            console.log("📢 Enviando solicitud de ingreso tarde...");
            socket.emit('solicitar_accion', {
                codigoActividad: codigoLimpio,
                tipo: 'INGRESO_TARDE',
                datos: { nombre: nombreTrim }
            });
            setVista('ESPERANDO_APROBACION');
        } else {
            setVista('SELECCION_GRUPO');
        }
        return true;
    };
    if (socket?.connected) {
        enviarSolicitud();
    } else {
        const checkInterval = setInterval(() => {
            if (enviarSolicitud()) clearInterval(checkInterval);
        }, 200);
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!enviado) alert("⚠️ Error de conexión: El servidor no responde. Intenta de nuevo.");
        }, 3000);
    }
};
    const cargarGruposDisponibles = async () => {
        try {
            const cod = form.codigoActividad || actividadInfo?.codigo;
            if (!cod) return;
            const res = await fetch(`${API_URL}/api/actividad/${cod.toUpperCase()}/grupos-detalle`);
            const data = await res.json();
            setGruposDisponibles(Array.isArray(data) ? data : []);
        } catch {}
    };

    const crearGrupo = async () => {
        const nombreGrupo = prompt("Nombre de tu Grupo:");
        if (!nombreGrupo) return;
        try {
            const res = await fetch(`${API_URL}/api/grupo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codigoActividad: form.codigoActividad.toUpperCase(), nombreGrupo, nombreLider: form.nombre })
            });
            const data = await res.json();
            if (res.ok) {
                const sesionActualizada = { ...data.estudiante, grupo_id: data.grupo.id, es_lider: true };
                guardarSesion(sesionActualizada, form.codigoActividad);
                await cargarGruposDisponibles();
                irAlDashboard();
            } else alert(data.error);
        } catch { alert("Error al crear grupo"); }
    };

    const unirseAGrupo = async (grupo: any) => {
        try {
            const res = await fetch(`${API_URL}/api/unirse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codigoGrupo: grupo.codigo, nombreEstudiante: form.nombre })
            });
            const data = await res.json();
            if (res.ok) {
                guardarSesion(data, form.codigoActividad);
                await cargarGruposDisponibles();
                irAlDashboard();
            } else alert(data.error);
        } catch { alert("Error al unirse"); }
    };

    const irAlDashboard = () => {
        if (tiempoRestante !== null && tiempoRestante > 0) setVista('DASHBOARD');
        else setVista('ESPERANDO_INICIO');
    };

    const abrirEvaluacion = async (grupo: any) => {
        setGrupoObjetivo(grupo);
        const votos = recuperarVotosLocales(grupo.id);
        if (votos) { setNotaGrupal(votos.notaGrupal || 0); setNotasIndividuales(votos.notasIndividuales || {}); }
        else { setNotaGrupal(0); setNotasIndividuales({}); }
        
        const esMio = esMismoID(grupo.id, miDatos?.grupo_id);
        try {
            const res = await fetch(`${API_URL}/api/grupo/${grupo.codigo}/miembros`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setMiembrosObjetivo(data);
                setVista(esMio ? 'EVALUAR_INTERNO' : 'EVALUAR_EXTERNO');
            }
        } catch { alert("Error de conexión"); }
    };

    const enviarEvaluacion = async () => {
        let payload: any[] = [];
        if (notaGrupal > 0) payload.push({ tipo: 'GRUPAL', puntaje: notaGrupal });
        if (vista === 'EVALUAR_EXTERNO') {
            Object.entries(notasIndividuales).forEach(([id, nota]) => { if (nota > 0) payload.push({ tipo: 'INDIVIDUAL', puntaje: nota, evaluadoId: parseInt(id) }); });
        } else {
            Object.entries(notasIndividuales).forEach(([id, nota]) => { if (parseInt(id) !== miDatos.id && nota > 0) payload.push({ tipo: 'INTRAGRUPAL', puntaje: nota, evaluadoId: parseInt(id) }); });
        }
        if (payload.length === 0) return alert("Debes puntuar algo antes de enviar.");

        try {
            const res = await fetch(`${API_URL}/api/evaluar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ evaluadorId: miDatos.id, grupoId: grupoObjetivo.id || miDatos.grupo_id, evaluaciones: payload })
            });
            if (res.ok) {
                guardarVotoLocal(grupoObjetivo.id, notaGrupal, notasIndividuales);
                alert("Evaluación enviada ✅");
                setVista('DASHBOARD');
            } else {
                const err = await res.json();
                if (res.status === 403) { alert(err.error); setVista('FINALIZADO'); }
                else alert("Error al guardar.");
            }
        } catch { alert("Error de conexión"); }
    };

    const recuperarVotosLocales = (grupoId: number) => {
        if (!miDatos) return null;
        const key = `votos_${miDatos.codigoActividad}_${miDatos.id}`;
        return JSON.parse(sessionStorage.getItem(key) || '{}')[grupoId] || null;
    };

    const Estrellas = ({ valor, setValor }: { valor: number; setValor: (v: number) => void }) => (
        <div className="flex gap-2 mt-1">
            {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setValor(s)} className={`transition-all hover:scale-125 active:scale-95 ${s <= valor ? 'text-yellow-400 drop-shadow-sm' : 'text-gray-200'}`}>
                    <Star size={32} fill={s <= valor ? "currentColor" : "none"} />
                </button>
            ))}
        </div>
    );
    // ... debajo de los sockets ...

    // 🕒 Lógica del Cronómetro (Segundero)
    useEffect(() => {
    if (tiempoRestante === null || tiempoRestante <= 0) {
        // 🚨 SI EL TIEMPO SE ACABA: Forzar el fin de la actividad
        if (tiempoRestante === 0 && vista !== 'FINALIZADO') {
            console.log("⏱️ Tiempo agotado. Cerrando votaciones...");
            alert("¡Se acabó el tiempo! Las votaciones se han cerrado automáticamente.");
            
            // Limpiamos sesión y movemos a vista final
            sessionStorage.removeItem('class_eval_sesion');
            setMiDatos(null);
            setVista('FINALIZADO');
            
            if (socket?.connected) socket.disconnect();
        }
        return;
    }

    const timer = setInterval(() => {
    setTiempoRestante(prev => {
        // Validamos que prev exista y sea mayor a 1 para seguir restando
        if (prev !== null && prev <= 1) {
            clearInterval(timer);
            return 0; // Al llegar a 0, el if de arriba disparará el cierre
        }
        // Si prev es un número, le restamos 1; si es null, devolvemos null
        return prev !== null ? prev - 1 : null;
    });
}, 1000);

    return () => clearInterval(timer);
}, [tiempoRestante, vista]); // Añadimos 'vista' como dependencia para asegurar el cambio

    // ────────────────────────────────────────────────
    // VISTAS RENDERIZADAS
    // ────────────────────────────────────────────────
    
    if (vista === 'CARGANDO') return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-400 font-medium animate-pulse">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            Cargando entorno...
        </div>
    );

    if (vista === 'FINALIZADO') return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-6 text-center">
            <div className="bg-white/10 p-6 rounded-full mb-6 backdrop-blur-sm animate-bounce-in">
                <AlertCircle size={64} className="text-red-400" />
            </div>
            <h1 className="text-4xl font-black mb-4 tracking-tight">Actividad Finalizada</h1>
            <p className="text-gray-300 text-lg mb-10 max-w-md mx-auto">El profesor ha cerrado la votación. Gracias por participar.</p>
            
            <div className="flex flex-col gap-3 w-full max-w-xs">
                <button onClick={cerrarSesion} className="flex items-center justify-center gap-2 text-gray-900 font-bold bg-white hover:bg-gray-100 transition-colors px-6 py-3 rounded-xl">
                    <LogOut size={20} /> Salir / Cambiar Sala
                </button>
            </div>
        </div>
    );

    if (vista === 'PASO_1_CODIGO') return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
            <div className="bg-white p-10 rounded-3xl shadow-xl shadow-blue-900/5 w-full max-w-md border border-gray-100">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">¡Bienvenido!</h1>
                    <p className="text-gray-500">Ingresa el código que te dio el profesor</p>
                </div>
                <form onSubmit={validarCodigoManual}>
                    <input className="w-full p-5 bg-gray-50 border-2 border-gray-100 rounded-2xl text-center text-4xl font-mono font-bold uppercase tracking-widest outline-none focus:border-blue-500 focus:bg-white transition-all placeholder:text-gray-300 mb-6"
                        placeholder="CODE" maxLength={5}
                        onChange={(e) => setForm({ ...form, codigoActividad: e.target.value.toUpperCase() })}
                        value={form.codigoActividad} autoFocus
                    />
                    <button className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2">
                        Continuar <ArrowRight size={20} />
                    </button>
                </form>
            </div>
        </div>
    );

    if (vista === 'PASO_2_NOMBRE') return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
            <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md border border-gray-100">
                <div className="mb-6 flex justify-center">
                    <span className="bg-green-50 text-green-700 px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 border border-green-100">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        {actividadInfo?.nombre || form.codigoActividad}
                    </span>
                </div>
                <h1 className="text-2xl font-black text-gray-900 mb-6 text-center">¿Cómo te llamas?</h1>
                {actividadInfo?.estado === 'ACTIVA' && (
                    <p className="text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mb-4 text-sm text-center">
                        La actividad ya comenzó. El profesor recibirá tu solicitud para entrar.
                    </p>
                )}
                <form onSubmit={ingresarSala}>
                    <div className="relative mb-6">
                        <User className="absolute left-4 top-4 text-gray-400" size={24} />
                        <input className="w-full p-4 pl-12 bg-gray-50 border-2 border-gray-100 rounded-2xl text-lg font-medium outline-none focus:border-blue-500 focus:bg-white transition-all"
                            placeholder="Tu nombre completo"
                            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                            value={form.nombre} autoFocus
                        />
                    </div>
                    <button className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2">
                        Ingresar <LogIn size={20} />
                    </button>
                </form>
            </div>
        </div>
    );

    if (vista === 'ESPERANDO_APROBACION') return (
        <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="bg-white p-4 rounded-full shadow-lg mb-6 animate-bounce">
                <DoorOpen size={48} className="text-amber-500" />
            </div>
            <h1 className="text-3xl font-black text-gray-900 mb-4">Actividad en curso</h1>
            <p className="text-gray-600 text-lg mb-8 max-w-md">Llegaste un poco tarde. Hemos enviado una solicitud al profesor para que te deje pasar.</p>
            <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-full shadow-sm border border-amber-100">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></div>
                <span className="font-bold text-amber-700">Esperando respuesta...</span>
            </div>
        </div>
    );

    if (vista === 'SELECCION_GRUPO') return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900">Hola, {form.nombre} 👋</h1>
                        <p className="text-gray-500">Únete a un equipo o crea uno nuevo</p>
                    </div>
                    <button onClick={cerrarSesion} className="text-red-500 font-bold hover:bg-red-50 px-4 py-2 rounded-xl transition flex items-center gap-2">
                        <LogOut size={18}/> Salir
                    </button>
                </div>

                {tiempoRestante !== null && (
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-2xl shadow-lg mb-8 flex justify-center items-center gap-3 animate-fade-in">
                        <Clock className="animate-pulse" />
                        <span className="font-bold text-lg">Actividad en curso: {Math.floor(tiempoRestante / 60)} min restantes</span>
                    </div>
                )}

                <div className="mb-8 flex justify-center">
                    <button onClick={crearGrupo} className="bg-white border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-500 hover:text-blue-600 px-8 py-4 rounded-2xl font-bold transition-all w-full md:w-auto flex items-center justify-center gap-2">
                        + Crear Nuevo Grupo
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {gruposDisponibles.map((g) => {
                        const soyMiembro = miDatos?.grupo_id && esMismoID(g.id, miDatos.grupo_id);
                        return (
                            <div key={g.id} className={`bg-white p-6 rounded-2xl shadow-sm border-2 transition-all hover:shadow-md ${soyMiembro ? 'border-green-500 ring-4 ring-green-50' : 'border-gray-100 hover:border-blue-200'}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="font-bold text-xl text-gray-800">{g.nombre}</h3>
                                    {soyMiembro && <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded">TU GRUPO</span>}
                                </div>
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {g.miembros?.map((m: any) => (
                                        <span key={m.id} className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 text-gray-600 flex items-center gap-1">
                                            {m.id === g.lider_id && '👑'} {m.nombre}
                                        </span>
                                    ))}
                                </div>
                                {soyMiembro ? (
                                    <button onClick={irAlDashboard} className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition flex justify-center items-center gap-2">
                                        Ir al Panel <ArrowRight size={18} />
                                    </button>
                                ) : (
                                    <button onClick={() => unirseAGrupo(g)} className="w-full bg-gray-50 text-gray-700 font-bold py-3 rounded-xl hover:bg-blue-600 hover:text-white transition">
                                        Unirse
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );

    if (vista === 'ESPERANDO_INICIO') return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-indigo-900 text-white p-6 text-center">
            <div className="mb-8 relative">
                <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 rounded-full"></div>
                <Users size={80} className="relative z-10" />
            </div>
            <h1 className="text-4xl font-black mb-4">¡Todo listo!</h1>
            <p className="text-indigo-200 text-lg mb-8 max-w-md">Estás dentro del grupo. Espera a que el profesor inicie la actividad.</p>
            <div className="flex gap-2">
                <span className="w-3 h-3 bg-white rounded-full animate-bounce"></span>
                <span className="w-3 h-3 bg-white rounded-full animate-bounce delay-100"></span>
                <span className="w-3 h-3 bg-white rounded-full animate-bounce delay-200"></span>
            </div>
        </div>
    );

    if (vista === 'DASHBOARD') return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xl">
                            {miDatos?.nombre.charAt(0)}
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-900 text-lg">{miDatos?.nombre}</h2>
                            <button onClick={cerrarSesion} className="text-xs text-red-500 hover:underline">Cerrar sesión</button>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {tiempoRestante !== null && (
                            <div className="bg-gray-900 text-white px-5 py-2 rounded-full font-mono font-bold flex items-center gap-2">
                                <Clock size={16} /> {Math.floor(tiempoRestante / 60)} min
                            </div>
                        )}
                        {miDatos?.grupo_id && (
                            <button onClick={solicitarSalirGrupo} className="text-sm font-bold text-gray-500 hover:text-red-500 bg-gray-50 px-4 py-2 rounded-xl transition">
                                Salir del grupo
                            </button>
                        )}
                    </div>
                </div>

                <h3 className="font-black text-xl text-gray-800 mb-6 flex items-center gap-2">
                    <Play size={20} className="text-blue-600" /> Grupos para evaluar
                </h3>

                <div className="space-y-4">
                    {gruposDisponibles.map((g) => {
                        const esMiEquipo = esMismoID(g.id, miDatos?.grupo_id);
                        return (
                            <div key={g.id} onClick={() => abrirEvaluacion(g)} 
                                className={`p-6 rounded-2xl shadow-sm cursor-pointer transition-all border-l-8 flex justify-between items-center group
                                ${esMiEquipo ? 'bg-orange-50 border-orange-500 hover:bg-orange-100' : 'bg-white border-blue-500 hover:bg-blue-50 hover:translate-x-1'}`}>
                                
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl ${esMiEquipo ? 'bg-orange-200 text-orange-700' : 'bg-blue-100 text-blue-600'}`}>
                                        <Users size={24} />
                                    </div>
                                    <div>
                                        <span className={`font-bold text-lg block ${esMiEquipo ? 'text-orange-900' : 'text-gray-800'}`}>{g.nombre}</span>
                                        {esMiEquipo && <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">Tu equipo (Autoevaluación)</span>}
                                    </div>
                                </div>
                                <ArrowRight className={`opacity-0 group-hover:opacity-100 transition-opacity ${esMiEquipo ? 'text-orange-500' : 'text-blue-500'}`} />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );

    if (vista.startsWith('EVALUAR')) return (
        <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center">
            <div className="w-full max-w-2xl bg-white p-8 rounded-3xl shadow-xl border border-gray-100 relative">
                <button onClick={() => setVista('DASHBOARD')} className="absolute top-8 left-8 text-gray-400 hover:text-gray-900 transition">
                    <ArrowRight className="rotate-180" size={24} />
                </button>

                <div className="text-center mb-8 mt-4">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Evaluando a</span>
                    <h1 className="text-3xl font-black text-blue-900">{grupoObjetivo?.nombre}</h1>
                </div>

                <div className="mb-10 bg-blue-50 p-8 rounded-3xl border border-blue-100 text-center">
                    <p className="font-bold text-blue-900 mb-4 uppercase text-sm tracking-wide">
                        {vista === 'EVALUAR_INTERNO' ? '🏆 Desempeño General del Equipo' : '📊 Desempeño del Proyecto'}
                    </p>
                    <div className="flex justify-center">
                        <Estrellas valor={notaGrupal} setValor={setNotaGrupal} />
                    </div>
                </div>

                <div className="space-y-6 mb-10">
                    <p className="font-bold text-gray-800 border-b pb-4 flex items-center gap-2">
                        <User size={18} />
                        {vista === 'EVALUAR_INTERNO' ? 'Evalúa a tus compañeros' : 'Desempeño Individual'}
                    </p>

                    {miembrosObjetivo.filter((m) => !esMismoID(m.id, miDatos?.id)).map((m) => (
                        <div key={m.id} className="flex flex-col sm:flex-row justify-between items-center py-3 bg-gray-50 rounded-xl px-4">
                            <span className="text-gray-700 font-bold mb-2 sm:mb-0">{m.nombre}</span>
                            <Estrellas valor={notasIndividuales[m.id] || 0} setValor={(v) => setNotasIndividuales({ ...notasIndividuales, [m.id]: v })} />
                        </div>
                    ))}

                    {miembrosObjetivo.filter((m) => !esMismoID(m.id, miDatos?.id)).length === 0 && (
                        <p className="text-gray-400 italic text-center py-6 bg-gray-50 rounded-xl">No hay otros miembros para evaluar.</p>
                    )}
                </div>

                <button onClick={enviarEvaluacion} className="w-full bg-gray-900 text-white p-5 rounded-2xl font-bold text-lg hover:bg-black shadow-xl hover:-translate-y-1 transition-all flex justify-center items-center gap-3">
                    <CheckCircle size={24} /> Enviar Evaluación
                </button>
            </div>
        </div>
    );

    return null;
}

export default function EstudiantePage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Cargando...</div>}>
            <ContenidoEstudiante />
        </Suspense>
    );
}


function guardarVotoLocal(id: any, notaGrupal: number, notasIndividuales: { [key: number]: number; }) {
    // Puedes implementar la lógica real aquí si lo necesitas
    console.warn("guardarVotoLocal llamado pero no implementado");
}