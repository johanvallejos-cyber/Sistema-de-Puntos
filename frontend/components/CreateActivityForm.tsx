import React from 'react';
import { Plus, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function CreateActivityForm({ 
    nombre, setNombre, pesos, setPesos, onSubmit 
}: any) {
    
    const sumaTotal = Number(pesos.grupal) + Number(pesos.individual) + Number(pesos.intragrupal);
    const esValido = sumaTotal === 100;

    return (
        <div className="bg-white p-8 rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 mb-10 overflow-hidden relative">
            {/* Adorno de fondo */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl opacity-50 pointer-events-none"></div>

            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <span className="bg-blue-100 text-blue-600 p-2 rounded-lg"><Plus size={20}/></span>
                Crear Nueva Actividad
            </h3>

            {/* Inputs de Porcentajes */}
            <div className="grid grid-cols-3 gap-6 mb-6">
                <InputPeso label="Grupal" color="text-blue-600" bg="bg-blue-50" ring="focus:ring-blue-200" value={pesos.grupal} onChange={(v:number) => setPesos({...pesos, grupal: v})} />
                <InputPeso label="Individual" color="text-emerald-600" bg="bg-emerald-50" ring="focus:ring-emerald-200" value={pesos.individual} onChange={(v:number) => setPesos({...pesos, individual: v})} />
                <InputPeso label="Interno" color="text-orange-600" bg="bg-orange-50" ring="focus:ring-orange-200" value={pesos.intragrupal} onChange={(v:number) => setPesos({...pesos, intragrupal: v})} />
            </div>

            {/* Barra Visual */}
            <div className="space-y-2 mb-8">
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                    <div style={{ width: `${pesos.grupal}%` }} className="bg-blue-500 transition-all duration-500"></div>
                    <div style={{ width: `${pesos.individual}%` }} className="bg-emerald-500 transition-all duration-500"></div>
                    <div style={{ width: `${pesos.intragrupal}%` }} className="bg-orange-500 transition-all duration-500"></div>
                    {sumaTotal > 100 && <div className="flex-1 bg-red-500 animate-pulse"></div>}
                </div>
                <div className={`flex items-center justify-end gap-2 text-sm font-bold ${esValido ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {esValido ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
                    {esValido ? 'Total perfecto: 100%' : `Suma actual: ${sumaTotal}% (Debe ser 100%)`}
                </div>
            </div>

            {/* Input Nombre y Botón */}
            <form onSubmit={onSubmit} className="flex gap-4">
                <input 
                    className="flex-1 p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:bg-white focus:border-blue-500 outline-none transition-all font-medium placeholder:text-gray-400" 
                    placeholder="Ej: Exposición Final de Historia..." 
                    value={nombre} 
                    onChange={e => setNombre(e.target.value)} 
                />
                <button 
                    disabled={!esValido || !nombre} 
                    className={`px-8 rounded-2xl font-bold transition-all flex items-center gap-2
                        ${esValido && nombre 
                            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30 hover:-translate-y-1' 
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                >
                    Crear Actividad
                </button>
            </form>
        </div>
    );
}

// Subcomponente pequeño para los inputs (solo visual)
const InputPeso = ({ label, color, bg, ring, value, onChange }: any) => (
    <div>
        <label className={`block text-xs font-bold uppercase mb-2 ${color} opacity-80`}>{label}</label>
        <div className="relative">
            <input 
                type="number" min="0" max="100" 
                className={`w-full p-3 pl-4 border-none rounded-xl ${bg} ${color} font-black text-xl focus:ring-2 ${ring} outline-none transition-all text-center`} 
                value={value} 
                onChange={e => onChange(Math.max(0, Math.min(100, Number(e.target.value))))} 
            />
            <span className={`absolute right-3 top-3.5 font-bold opacity-50 ${color}`}>%</span>
        </div>
    </div>
);