import React from 'react';
import { ArrowLeft, Play, Square, Download } from 'lucide-react';

export default function Header({ 
    titulo, 
    codigo, 
    estado, 
    onBack, 
    onIniciar, 
    onTerminar, 
    onExportar 
}: any) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/80 border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        
        {/* Botón Volver */}
        <button 
            onClick={onBack} 
            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors font-medium"
        >
            <ArrowLeft size={20} />
            <span className="hidden sm:inline">Volver</span>
        </button>

        {/* Título Central */}
        <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight text-gray-900">
                {titulo}
            </h1>
            <div className="flex items-center justify-center gap-2 text-sm font-mono text-gray-400">
                <span>CÓDIGO:</span>
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold">{codigo}</span>
            </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
            {estado === 'ESPERA' && (
                <button onClick={onIniciar} className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg hover:shadow-green-500/30 hover:-translate-y-0.5 transition-all">
                    <Play size={18} fill="currentColor" /> Iniciar
                </button>
            )}
            {estado === 'ACTIVA' && (
                <button onClick={onTerminar} className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-red-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg hover:shadow-red-500/30 hover:-translate-y-0.5 transition-all">
                    <Square size={18} fill="currentColor" /> Terminar
                </button>
            )}
            <button onClick={onExportar} className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-gray-900 transition-all shadow-md">
                <Download size={18} /> <span className="hidden sm:inline">Excel</span>
            </button>
        </div>
      </div>
    </header>
  );
}