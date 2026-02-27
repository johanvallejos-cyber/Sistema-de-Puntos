import React from 'react'; // 👈 ¡FALTABA ESTA LÍNEA!
import { Inter, Poppins } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const poppins = Poppins({ weight: ['400', '600', '800'], subsets: ['latin'], variable: '--font-poppins' });

// Opcional: Agregar metadatos básicos para que la pestaña del navegador tenga nombre
export const metadata = {
  title: "Sistema de Puntos",
  description: "Plataforma de evaluación docente-estudiante",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${poppins.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}