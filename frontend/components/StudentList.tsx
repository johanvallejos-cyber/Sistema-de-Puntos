import React, { useEffect, useState } from 'react';
import { Users, Link, Copy } from 'lucide-react';

export default function StudentList({ alumnos, codigo, frontUrl }: any) {
  const [baseUrl, setBaseUrl] = useState(frontUrl || '');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const copiarEnlace = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : baseUrl;
    const url = `${origin}/estudiante?codigo=${codigo}`;
    navigator.clipboard.writeText(url);
    alert('¡Enlace copiado al portapapeles!');
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 sticky top-24">
      <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Users size={20} className="text-blue-600" />
        Conectados ({alumnos.length})
      </h2>

      <div className="flex flex-wrap gap-2 mb-6">
        {alumnos.map((nombre: string, i: number) => (
          <span
            key={i}
            className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-100 animate-fade-in"
          >
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            {nombre}
          </span>
        ))}

        {alumnos.length === 0 && (
          <p className="text-gray-400 italic w-full text-center py-8 text-sm border-2 border-dashed border-gray-100 rounded-xl">
            Esperando a que se unan alumnos...
          </p>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-100">
        <p className="text-xs text-gray-400 font-bold uppercase mb-2 text-center flex justify-center items-center gap-1">
          <Link size={12} /> Enlace de acceso para alumnos
        </p>

        <div
          onClick={copiarEnlace}
          className="group relative bg-gray-50 p-4 rounded-xl border border-gray-200 text-center font-mono text-[10px] text-gray-600 break-all hover:bg-blue-50 hover:border-blue-200 transition-all cursor-pointer overflow-hidden"
        >
          <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="bg-white px-2 py-1 rounded text-[10px] font-bold text-blue-600 flex items-center gap-1 shadow-sm">
              <Copy size={10} /> Clic para copiar
            </span>
          </div>
          {baseUrl}/estudiante?codigo={codigo}
        </div>
      </div>
    </div>
  );
}
