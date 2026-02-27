import React from 'react';
import { Bell, UserPlus, LogOut, Check, X } from 'lucide-react';

export default function NotificationPanel({ notificaciones, onResponder }: any) {
    if (!notificaciones || notificaciones.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce-in">
            <div className="bg-white/90 backdrop-blur-xl p-0 rounded-2xl shadow-2xl border border-blue-100 w-96 overflow-hidden">
                {/* Cabecera del Panel */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-lg text-white">
                        <Bell size={20} className="animate-swing" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-sm">Solicitudes Pendientes</h3>
                        <p className="text-blue-100 text-xs">{notificaciones.length} nuevas notificaciones</p>
                    </div>
                </div>

                {/* Lista de Notificaciones */}
                <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3 bg-gray-50/50">
                    {notificaciones.map((n: any, i: number) => (
                        <div key={i} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-start gap-3 mb-3">
                                <div className={`p-2 rounded-full ${n.tipo === 'INGRESO_TARDE' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                    {n.tipo === 'INGRESO_TARDE' ? <UserPlus size={18} /> : <LogOut size={18} />}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">
                                        {n.tipo === 'INGRESO_TARDE' ? 'Solicitud de Ingreso' : 'Solicitud de Salida'}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {n.tipo === 'INGRESO_TARDE' 
                                            ? <><span className="font-bold text-gray-700">{n.datos?.nombre}</span> quiere entrar tarde.</>
                                            : <><span className="font-bold text-gray-700">{n.datos?.estudiante?.nombre}</span> quiere salir del grupo.</>
                                        }
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
    {/* Botón Aceptar */}
    <button 
        onClick={() => onResponder(n, true)} 
        className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition flex justify-center items-center gap-1 shadow-sm"
    >
        <Check size={14} /> Aceptar
    </button>
    
    {/* Botón Rechazar */}
    <button 
        onClick={() => onResponder(n, false)} 
        className="flex-1 bg-white border border-red-200 text-red-600 py-2 rounded-lg text-xs font-bold hover:bg-red-50 transition flex justify-center items-center gap-1"
    >
        <X size={14} /> Rechazar
    </button>
</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}