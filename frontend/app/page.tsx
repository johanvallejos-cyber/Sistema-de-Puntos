"use client";
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';
import { Trash2, Users, LayoutGrid, LogOut, UserPlus, LogIn } from 'lucide-react';

// COMPONENTES IMPORTS
import Header from '@/components/Header';
import NotificationPanel from '@/components/NotificationPanel';
import Dashboard from '@/components/Dashboard';
import StudentList from '@/components/StudentList';


let socket: any;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const FRONT_URL_ENV = process.env.NEXT_PUBLIC_FRONT_URL || ''; 

export default function HomePage() {
  const [vista, setVista] = useState('LOGIN'); 
  const [esRegistro, setEsRegistro] = useState(false);
  const [docente, setDocente] = useState<any>(null);
  const [form, setForm] = useState({ nombre: '', email: '', password: '' });
  const [actividades, setActividades] = useState<any[]>([]);
  const [nombreNuevaActividad, setNombreNuevaActividad] = useState('');
  const [pesos, setPesos] = useState({ grupal: 34, individual: 33, intragrupal: 33 });
  const [actividadActual, setActividadActual] = useState<any>(null);
  const [alumnosConectados, setAlumnosConectados] = useState<string[]>([]);
  const [gruposEnVivo, setGruposEnVivo] = useState<any[]>([]);
  const [reporte, setReporte] = useState<any[]>([]);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [tiempoMinutos, setTiempoMinutos] = useState<number>(5);
  const [frontUrl, setFrontUrl] = useState<string>(FRONT_URL_ENV || 'http://localhost:3000');

  // --- EFECTOS Y SOCKETS ---
  useEffect(() => { if (vista === 'DASHBOARD' && docente) cargarMisActividades(); }, [vista, docente]);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setFrontUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (vista === 'ACTIVIDAD' && actividadActual) {
      if (!socket) socket = io(API_URL);

      const unirASala = () => {
    // Forzamos que el docente use siempre el código en MAYÚSCULAS y sin espacios
    const codigoLimpio = actividadActual.codigo.toUpperCase().trim();
    console.log("📢 Profesor uniéndose a sala oficial:", codigoLimpio);
    
    socket.emit('unirse_sala', { 
        codigo: codigoLimpio, 
        nombre: 'Docente_Master' 
    });
};

      if (socket.connected) unirASala();
      else socket.on('connect', unirASala);

      socket.on('actualizar_lista_alumnos', (lista: string[]) => {
        setAlumnosConectados(lista);
      });

      socket.on('grupos_actualizados', () => cargarGruposEnVivo());
      
      // ✅ ESCUCHA DE NOTIFICACIONES (INGRESO TARDE / SALIR GRUPO)
      // ✅ ESCUCHA DE NOTIFICACIONES (INGRESO TARDE / SALIR GRUPO)
socket.on('notificacion_profe', (nuevaNotif: any) => {
    console.log("🔔 Notificación recibida en el frontend:", nuevaNotif);
    
    setNotificaciones(prev => {
        // 🛡️ Filtro estricto para evitar duplicados por ID de socket y tipo
        const yaExiste = prev.some(n => n.socketId === nuevaNotif.socketId && n.tipo === nuevaNotif.tipo);
        if (yaExiste) return prev;
        
        // Lanzamos la alerta visual solo si es ingreso tarde
        if (nuevaNotif.tipo === 'INGRESO_TARDE') {
            alert(`SOLICITUD: El alumno ${nuevaNotif.datos.nombre} quiere entrar tarde.`);
        }
        
        return [...prev, nuevaNotif];
    });
});

    return () => {
        socket.off('actualizar_lista_alumnos');
        socket.off('grupos_actualizados');
        socket.off('notificacion_profe');
        socket.off('connect');
    };
    }
  }, [vista, actividadActual]);

  // --- FUNCIONES API ---
  
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = esRegistro ? '/api/register' : '/api/login'; 
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) { 
          setDocente(data); 
          setVista('DASHBOARD'); 
          setForm({ nombre: '', email: '', password: '' });
      } else {
          alert(data.error || "Error de autenticación");
      }
    } catch { alert('Error conexión con el servidor'); }
  };

  const cargarMisActividades = async () => {
    const res = await fetch(`${API_URL}/api/docente/${docente.id}/actividades`);
    const data = await res.json();
    setActividades(Array.isArray(data) ? data : []);
  };

  const crearActividad = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/api/actividad`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombreNuevaActividad, docenteId: docente.id, pesos })
    });
    if (res.ok) {
        setNombreNuevaActividad('');
        setPesos({ grupal: 34, individual: 33, intragrupal: 33 });
        cargarMisActividades();
    }
  };

  const borrarActividad = async (codigo: string) => {
    if (!confirm("¿Eliminar actividad?")) return;
    await fetch(`${API_URL}/api/actividad/${codigo}`, { method: 'DELETE' });
    cargarMisActividades();
  };

  const entrarActividad = async (act: any) => {
    setAlumnosConectados([]);   
    setGruposEnVivo([]);        
    setNotificaciones([]);      
    setReporte([]);             
    setActividadActual(act);
    setVista('ACTIVIDAD');
    cargarGruposEnVivo(act.codigo);
    if (act.estado === 'FINALIZADA') cargarReporte();
  };

const iniciarActividad = async () => {
    if (!actividadActual) return;
    
    try {
        const res = await fetch(`${API_URL}/api/actividad/iniciar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                codigo: actividadActual.codigo.toUpperCase(), 
                duracionMinutos: tiempoMinutos
            })
        });

        if (res.ok) {
            // ✅ CLAVE: Emitir el evento a la sala correcta
            const salaId = actividadActual.codigo.toUpperCase().trim();
            console.log(`📢 Enviando señal de inicio a sala: ${salaId}`);
            
            socket?.emit('iniciar_actividad', {
                codigoActividad: salaId,
                tiempoLimite: tiempoMinutos * 60
            });

            setActividadActual({ ...actividadActual, estado: 'ACTIVA' });
        }
    } catch (err) {
        console.error("Error al iniciar:", err);
    }
};

  const terminarActividad = async () => {
    if(!confirm("¿Terminar actividad y cerrar votaciones?")) return;
    await fetch(`${API_URL}/api/actividad/terminar`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: actividadActual.codigo })
    });
    socket.emit('terminar_actividad', { codigoActividad: actividadActual.codigo });
    setActividadActual({ ...actividadActual, estado: 'FINALIZADA' });
    cargarReporte();
  };

  const cargarGruposEnVivo = async (codigo = actividadActual?.codigo) => {
    if(!codigo) return;
    const res = await fetch(`${API_URL}/api/actividad/${codigo}/grupos-detalle`);
    const data = await res.json();
    setGruposEnVivo(Array.isArray(data) ? data : []);
  };

  const cargarReporte = async () => {
    const res = await fetch(`${API_URL}/api/reporte-global`);
    const data = await res.json();
    if(Array.isArray(data)) setReporte(data.filter((r: any) => r.nombre_actividad === actividadActual.nombre));
  };

  const responderSolicitud = async (notificacion: any, aceptar: boolean) => {
    // 1. Quitar de la lista visual inmediatamente
    setNotificaciones(prev => prev.filter(n => n.socketId !== notificacion.socketId));
    
    // 2. Si es salir de grupo y se acepta, avisar al backend
    if (notificacion.tipo === 'SALIR_GRUPO' && aceptar) {
        await fetch(`${API_URL}/api/estudiante/salir`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                idEstudiante: notificacion.datos.estudiante.id,
                idNuevoLider: notificacion.datos.nuevoLiderId
            })
        });
    }

    // 3. Emitir respuesta al alumno vía socket
    socket.emit('responder_solicitud', { 
        socketIdAlumno: notificacion.socketId, 
        aprobado: aceptar, 
        tipo: notificacion.tipo 
    });
  };

  const descargarExcel = async () => {
    try {
        const res = await fetch(`${API_URL}/api/exportar-excel`);
        const datosRaw = await res.json();
        const datos = actividadActual
            ? (datosRaw || []).filter((r: any) => r.actividad === actividadActual.nombre)
            : (datosRaw || []);
        if (datos.length === 0) return alert("No hay datos para exportar.");

        const encabezados = ["Actividad", "Código Grupo", "Equipo", "Nota Grupal", "Nota Individual", "Nota Interna", "Promedio Final"];
        const filas = datos.map((d: any) => [
            d.actividad ?? "",
            d.codigo_grupo ?? "",
            d.grupo ?? "",
            typeof d.nota_grupal === "number" ? d.nota_grupal : (d.nota_grupal ?? ""),
            typeof d.nota_individual === "number" ? d.nota_individual : (d.nota_individual ?? ""),
            typeof d.nota_intragrupal === "number" ? d.nota_intragrupal : (d.nota_intragrupal ?? ""),
            typeof d.promedio_final === "number" ? d.promedio_final : (d.promedio_final ?? "")
        ]);

        const wb = XLSX.utils.book_new();
        const wsData = [encabezados, ...filas];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        ws["!cols"] = [
            { wch: 25 },
            { wch: 14 },
            { wch: 22 },
            { wch: 14 },
            { wch: 18 },
            { wch: 14 },
            { wch: 16 }
        ];

        const nombreHoja = (actividadActual?.nombre || "Reporte").replace(/[\\/*?:\[\]]/g, "").substring(0, 31);
        const nombreArchivo = `Reporte_${(actividadActual?.nombre || "Evaluacion").replace(/[\\/*?:\[\]]/g, "_")}.xlsx`;
        XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
        XLSX.writeFile(wb, nombreArchivo, { bookType: "xlsx" });
    } catch { alert("Error al exportar."); }
  };

  // --- RENDER VISTAS ---
  if (vista === 'LOGIN') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-10 rounded-3xl shadow-xl w-96 border border-gray-100">
            <div className="text-center mb-8">
                <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                    {esRegistro ? <UserPlus size={32}/> : <Users size={32}/>}
                </div>
                <h1 className="text-2xl font-black text-gray-900">
                    {esRegistro ? 'Crear Cuenta' : 'Docente Login'}
                </h1>
            </div>
            <form onSubmit={handleAuth} className="space-y-4">
                {esRegistro && (
                    <input className="w-full p-4 bg-gray-50 border rounded-xl" placeholder="Nombre" value={form.nombre} onChange={e=>setForm({...form, nombre: e.target.value})} />
                )}
                <input className="w-full p-4 bg-gray-50 border rounded-xl" placeholder="Email" type="email" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} />
                <input className="w-full p-4 bg-gray-50 border rounded-xl" placeholder="Contraseña" type="password" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} />
                <button className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold">{esRegistro ? 'Registrarse' : 'Entrar'}</button>
            </form>
            <button onClick={() => setEsRegistro(!esRegistro)} className="mt-4 w-full text-sm text-gray-500">{esRegistro ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}</button>
        </div>
    </div>
  );

  if (vista === 'DASHBOARD') return (
    <Dashboard docente={docente} onLogout={() => { setDocente(null); setVista('LOGIN'); }} actividades={actividades} onEntrar={entrarActividad} onBorrar={borrarActividad} nombreNuevaActividad={nombreNuevaActividad} setNombreNuevaActividad={setNombreNuevaActividad} pesos={pesos} setPesos={setPesos} crearActividad={crearActividad} />
  );

  if (vista === 'ACTIVIDAD') return (
    <div className="min-h-screen bg-gray-50">
        <Header titulo={actividadActual.nombre} codigo={actividadActual.codigo} estado={actividadActual.estado} onBack={()=>{cargarMisActividades(); setVista('DASHBOARD');}} onIniciar={iniciarActividad} onTerminar={terminarActividad} onExportar={descargarExcel} />
        
        {/* PANEL DE NOTIFICACIONES: AQUÍ APARECEN LAS SOLICITUDES DE ENTRADA */}
        <NotificationPanel notificaciones={notificaciones} onResponder={responderSolicitud} />

        <main className="p-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                {actividadActual.estado === 'FINALIZADA' ? (
                   <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
                        <div className="p-8 border-b"><h2 className="text-2xl font-black">🏆 Resultados</h2></div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50">
                                    <tr><th className="p-6">Grupo</th><th className="p-6 text-right">Final</th></tr>
                                </thead>
                                <tbody>
                                    {reporte.map(fila => (
                                        <tr key={fila.codigo_grupo} className="border-b"><td className="p-6 font-bold">{fila.grupo}</td><td className="p-6 text-right font-black text-blue-600">{fila.promedio_final}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                   </div>
                ) : (
                  <div className="space-y-6">
                      <h2 className="font-bold text-xl flex items-center gap-2"><LayoutGrid size={20}/> Grupos en Vivo</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {gruposEnVivo.map(g => (
                              <div key={g.id} className="bg-white p-6 rounded-2xl shadow-sm border">
                                  <h3 className="font-bold mb-3">{g.nombre}</h3>
                                  <div className="flex flex-wrap gap-2">
                                      {g.miembros.map((m:any) => (<span key={m.id} className="bg-gray-50 px-3 py-1 rounded-lg text-xs">{m.nombre}</span>))}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
                )}
            </div>
            <StudentList alumnos={actividadActual.estado === 'FINALIZADA' ? [] : alumnosConectados} codigo={actividadActual.codigo} frontUrl={frontUrl} />
        </main>
    </div>
  );

  return null;
}
