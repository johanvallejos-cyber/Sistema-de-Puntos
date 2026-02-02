# Guía Docker - Sistema de Puntos

Esta guía permite a tu compañero (o cualquiera) ejecutar el proyecto con Docker sin instalar Node.js ni PostgreSQL.

## Requisitos previos

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (viene incluido con Docker Desktop)

## Ejecutar el proyecto

### 1. Clonar el repositorio

```bash
git clone https://github.com/TU_USUARIO/Sistema-puntos.git
cd Sistema-puntos
```

### 2. Crear archivo de variables de entorno (opcional)

Copia el ejemplo y edita si necesitas cambiar contraseñas:

```bash
cp .env.example .env
```

Las variables por defecto ya funcionan. Solo cambia si quieres usar otras credenciales.

### 3. Levantar todo con Docker Compose

```bash
docker compose up -d
```

O sin modo detached (ver logs en consola):

```bash
docker compose up
```

### 4. Acceder a la aplicación

- **Vista docente:** http://localhost:3000
- **Vista estudiante:** http://localhost:3000/estudiante
- **API backend:** http://localhost:4000
- **Base de datos:** PostgreSQL en puerto 5432 (user: postgres, pass: postgres, db: sistema_puntos)

### 5. Detener los contenedores

```bash
docker compose down
```

Para eliminar también los datos de la base de datos:

```bash
docker compose down -v
```

## Comandos útiles

| Comando | Descripción |
|---------|-------------|
| `docker compose up -d` | Iniciar en segundo plano |
| `docker compose down` | Detener contenedores |
| `docker compose logs -f` | Ver logs en tiempo real |
| `docker compose ps` | Ver estado de los contenedores |
| `docker compose build --no-cache` | Reconstruir imágenes sin caché |

## Variables de entorno

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `DB_USER` | Usuario de PostgreSQL | postgres |
| `DB_PASSWORD` | Contraseña de PostgreSQL | postgres |
| `DB_NAME` | Nombre de la base de datos | sistema_puntos |
| `NEXT_PUBLIC_API_URL` | URL del backend (para el navegador) | http://localhost:4000 |

> **Nota:** Si accedes desde otro dispositivo en la red (ej. celular), cambia `NEXT_PUBLIC_API_URL` a `http://TU_IP:4000` y reconstruye el frontend.

## Estructura de contenedores

- **db:** PostgreSQL 16 con el schema inicial
- **backend:** API Node.js + Socket.IO (puerto 4000)
- **frontend:** Next.js (puerto 3000)
