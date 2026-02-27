"use client";
import React from 'react';
import { LogOut, LayoutGrid, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import CreateActivityForm from './CreateActivityForm';

// Componente Dashboard Principal
export default function Dashboard({ 
    docente, 
    onLogout, 
    actividades, 
    onEntrar, 
    onBorrar,
    nombreNuevaActividad,
    setNombreNuevaActividad,
    pesos,
    setPesos,
    crearActividad
}: any) {
    return (
        <div className="min-h-screen bg-gray-50/50 p-8">
            <div className="max-w-5xl mx-auto">
                
                {/* 1. Header: Saludo al Docente */}
                <header className="flex justify-between items-center mb-12">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900">Hola, {docente?.nombre} 👋</h1>
                        <p className="text-gray-500">Gestión de Coevaluación - Panel de Control</p>
                    </div>
                    <button 
                        onClick={onLogout} 
                        className="flex items-center gap-2 text-rose-500 font-bold bg-rose-50 px-4 py-2 rounded-lg hover:bg-rose-100 transition-colors shadow-sm"
                    >
                        <LogOut size={18}/> Salir de la Cuenta
                    </button>
                </header>

                {/* 2. Formulario: Creación de Actividades con Pesos Configurables */}
                <section className="mb-12">
                    <CreateActivityForm 
                        nombre={nombreNuevaActividad} 
                        setNombre={setNombreNuevaActividad}
                        pesos={pesos}
                        setPesos={setPesos}
                        onSubmit={crearActividad}
                    />
                </section>

                {/* 3. Lista de Actividades Recientes */}
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-gray-400 uppercase text-xs tracking-wider flex items-center gap-2">
                        <LayoutGrid size={16}/> Historial de Actividades
                    </h3>
                    <span className="text-xs text-gray-400 bg-white px-3 py-1 rounded-full border border-gray-100">
                        {actividades.length} totales
                    </span>
                </div>
                
                <div className="grid gap-4">
                    {actividades.map((act: any) => (
                        <div 
                            key={act.id} 
                            onClick={() => onEntrar(act)} 
                            className="group bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-100 transition-all cursor-pointer flex justify-between items-center"
                        >
                            <div className="flex items-center gap-4">
                                {/* Letra inicial con color dinámico según estado */}
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl transition-all ${
                                    act.estado === 'FINALIZADA' ? 'bg-gray-50 text-gray-300' : 
                                    act.estado === 'ACTIVA' ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'
                                }`}>
                                    {act.nombre.charAt(0).toUpperCase()}
                                </div>
                                
                                <div>
                                    <h2 className="font-bold text-lg text-gray-800 group-hover:text-blue-600 transition-colors">
                                        {act.nombre}
                                    </h2>
                                    <div className="flex items-center gap-3 mt-1">
                                        <p className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono font-bold tracking-tighter">
                                            CODE: {act.codigo}
                                        </p>
                                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                            <Clock size={10}/> {act.duracion_minutos || 0} min
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                {/* Badge de Estado: Mejora visual y animaciones */}
                                <div className="flex items-center gap-2">
                                    {act.estado === 'ACTIVA' && <CheckCircle2 size={14} className="text-green-500 animate-pulse" />}
                                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                                        act.estado === 'FINALIZADA' ? 'bg-gray-100 text-gray-400' : 
                                        act.estado === 'ACTIVA' ? 'bg-green-50 text-green-700 ring-1 ring-green-100' : 
                                        'bg-amber-50 text-amber-600 ring-1 ring-amber-100'
                                    }`}>
                                        {act.estado}
                                    </span>
                                </div>

                                {/* Botón de Borrar: stopPropagation añadido para seguridad */}
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); // Evita que al borrar se abra la actividad
                                        onBorrar(act.codigo); 
                                    }} 
                                    className="p-3 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                    title="Eliminar permanentemente"
                                >
                                    <Trash2 size={18}/>
                                </button>
                            </div>
                        </div>
                    ))}
                    
                    {/* Caso sin actividades */}
                    {actividades.length === 0 && (
                        <div className="text-center py-24 text-gray-400 bg-white/40 border-2 border-dashed border-gray-200 rounded-[2.5rem] flex flex-col items-center gap-4">
                            <LayoutGrid size={48} className="text-gray-200"/>
                            <p className="font-medium">No has creado actividades aún.<br/><span className="text-sm font-normal">Usa el formulario de arriba para comenzar.</span></p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}