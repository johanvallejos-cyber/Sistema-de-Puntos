-- Schema para Sistema de Puntos / Evaluación por Grupos

CREATE TABLE IF NOT EXISTS docentes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actividades (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    docente_id INTEGER REFERENCES docentes(id) ON DELETE CASCADE,
    estado VARCHAR(20) DEFAULT 'ESPERA',
    peso_grupal INTEGER DEFAULT 34,
    peso_individual INTEGER DEFAULT 33,
    peso_intragrupal INTEGER DEFAULT 33,
    fecha_inicio TIMESTAMP,
    duracion_minutos INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grupos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    actividad_id INTEGER REFERENCES actividades(id) ON DELETE CASCADE,
    lider_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estudiantes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    grupo_id INTEGER REFERENCES grupos(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE grupos ADD CONSTRAINT fk_lider 
    FOREIGN KEY (lider_id) REFERENCES estudiantes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS evaluaciones (
    id SERIAL PRIMARY KEY,
    evaluador_id INTEGER NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    evaluado_grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
    evaluado_estudiante_id INTEGER REFERENCES estudiantes(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL,
    puntaje DECIMAL(5,2) NOT NULL,
    CONSTRAINT voto_unico UNIQUE (evaluador_id, evaluado_grupo_id, evaluado_estudiante_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_actividades_codigo ON actividades(codigo);
CREATE INDEX IF NOT EXISTS idx_grupos_actividad ON grupos(actividad_id);
CREATE INDEX IF NOT EXISTS idx_estudiantes_grupo ON estudiantes(grupo_id);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_grupo ON evaluaciones(evaluado_grupo_id);
