# Guía de Despliegue en Producción

Esta guía cubre el despliegue completo del sistema usando Docker y Docker Compose.

---

## Arquitectura de despliegue

```
Internet
    │
    ▼
[nginx / proxy inverso]
    │
    ├── /              → chat-widget  (puerto 80,  contenedor nginx)
    ├── /api/*         → chat         (puerto 3225, contenedor node)
    └── /rag/*         → rag-backend  (puerto 8000, contenedor python)

[PostgreSQL chat_db]   ← chat
[PostgreSQL rag_db]    ← rag-backend
[Ollama]               ← rag-backend  (host o contenedor separado)
[n8n]                  ← chat         (instancia externa o contenedor)
```

---

## Imágenes Docker

Cada servicio tiene su propio Dockerfile:

| Servicio | Dockerfile | Imagen base | Puerto |
|---|---|---|---|
| rag-backend | `rag-backend/Dockerfile` | `python:3.11-slim` | 8000 |
| chat (NestJS) | `chat/Dockerfile` | `node:20-alpine` (multi-stage) | 3225 |
| chat-widget | `chat-widget/Dockerfile` | `node:20-alpine` → `nginx:alpine` | 80 |

---

## Docker Compose de producción

Crear el archivo `docker-compose.yml` en la raíz del proyecto:

```yaml
version: "3.9"

services:

  postgres-chat:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: chat_db
      POSTGRES_USER: chat_user
      POSTGRES_PASSWORD: ${DB_PASS}
    volumes:
      - postgres_chat_data:/var/lib/postgresql/data
    restart: unless-stopped

  postgres-rag:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: rag_db
      POSTGRES_USER: rag_user
      POSTGRES_PASSWORD: ${RAG_DB_PASS}
    volumes:
      - postgres_rag_data:/var/lib/postgresql/data
    restart: unless-stopped

  rag-backend:
    build:
      context: ./rag-backend
      dockerfile: Dockerfile
    environment:
      POSTGRESQL_URL: postgresql://rag_user:${RAG_DB_PASS}@postgres-rag:5432/rag_db
      OLLAMA_BASE_URL: http://host.docker.internal:11434
      OLLAMA_MODEL: llama3.1:8b-instruct-q4_K_M
      EMBEDDINGS_MODEL: intfloat/multilingual-e5-base
      RAG_INTERNAL_API_KEY: ${RAG_INTERNAL_API_KEY}
    depends_on:
      - postgres-rag
    restart: unless-stopped
    ports:
      - "8000:8000"

  chat:
    build:
      context: ./chat
      dockerfile: Dockerfile
    environment:
      DB_HOST: postgres-chat
      DB_PORT: 5432
      DB_NAME: chat_db
      DB_USER: chat_user
      DB_PASS: ${DB_PASS}
      JWT_SECRET: ${JWT_SECRET}
      RAG_BASE_URL: http://rag-backend:8000
      RAG_INTERNAL_API_KEY: ${RAG_INTERNAL_API_KEY}
      N8N_BASE_URL: ${N8N_BASE_URL}
      N8N_API_KEY: ${N8N_API_KEY}
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      MAIL_HOST: ${MAIL_HOST}
      MAIL_PORT: ${MAIL_PORT}
      MAIL_USER: ${MAIL_USER}
      MAIL_PASS: ${MAIL_PASS}
      MAIL_FROM: ${MAIL_FROM}
    depends_on:
      - postgres-chat
      - rag-backend
    restart: unless-stopped
    ports:
      - "3225:3225"

  chat-widget:
    build:
      context: ./chat-widget
      dockerfile: Dockerfile
      args:
        VITE_SERVER_URL: ${VITE_SERVER_URL}
    restart: unless-stopped
    ports:
      - "80:80"

volumes:
  postgres_chat_data:
  postgres_rag_data:
```

---

## Archivo `.env` de producción

Crear `.env` en el mismo directorio que `docker-compose.yml`:

```env
# Base de datos chat
DB_PASS=password-seguro-chat

# Base de datos RAG
RAG_DB_PASS=password-seguro-rag

# Seguridad
JWT_SECRET=cadena-aleatoria-muy-larga-de-al-menos-64-caracteres
RAG_INTERNAL_API_KEY=clave-interna-rag

# n8n
N8N_BASE_URL=https://tu-instancia-n8n.com
N8N_API_KEY=tu-api-key-n8n

# Administrador inicial
ADMIN_EMAIL=admin@usta.edu.co
ADMIN_PASSWORD=contraseña-segura-inicial

# Correo (recuperación de contraseña)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=notificaciones@usta.edu.co
MAIL_PASS=contraseña-de-aplicación-gmail
MAIL_FROM=notificaciones@usta.edu.co

# Frontend
VITE_SERVER_URL=https://api.tu-dominio.com
```

> **Importante:** `VITE_SERVER_URL` se incrusta en el bundle de producción durante el build. No es una variable de entorno en runtime — debe pasarse como `build arg` al construir la imagen de `chat-widget`.

---

## Pasos de despliegue

### Primera vez

```bash
# 1. Construir todas las imágenes
docker compose build

# 2. Iniciar los servicios de base de datos primero
docker compose up -d postgres-chat postgres-rag

# 3. Esperar ~10 segundos y luego iniciar el resto
docker compose up -d

# 4. Verificar que todos los contenedores estén corriendo
docker compose ps

# 5. Ver logs de todos los servicios
docker compose logs -f
```

### Actualizaciones posteriores

```bash
# Reconstruir solo el servicio modificado
docker compose build chat
docker compose up -d chat

# O reconstruir todo
docker compose build
docker compose up -d
```

---

## Ollama en producción

Ollama **no corre bien dentro de Docker en CPU**. La opción recomendada es instalarlo directamente en el host:

```bash
# En el servidor host
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1:8b-instruct-q4_K_M

# Configurar como servicio systemd (para auto-inicio)
sudo systemctl enable ollama
sudo systemctl start ollama
```

El contenedor `rag-backend` accede a Ollama en el host via `http://host.docker.internal:11434`.  
En Linux, si `host.docker.internal` no está disponible, usar la IP del bridge de Docker:

```bash
# Obtener la IP del bridge
ip addr show docker0 | grep 'inet ' | awk '{print $2}' | cut -d/ -f1
# Generalmente: 172.17.0.1

# En docker-compose.yml:
OLLAMA_BASE_URL: http://172.17.0.1:11434
```

---

## Proxy inverso (nginx en el host)

Si se usa nginx en el host para servir todos los servicios bajo un mismo dominio:

```nginx
# /etc/nginx/sites-available/chat-system
server {
    listen 443 ssl;
    server_name tu-dominio.com;

    # SSL (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

    # Frontend (chat-widget)
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
    }

    # API NestJS
    location /api/ {
        proxy_pass http://localhost:3225/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # RAG backend (solo acceso interno — no exponer públicamente)
    # El servicio chat accede directamente por la red Docker
}
```

> **Seguridad:** El endpoint `rag-backend` (puerto 8000) solo debe ser accesible desde la red interna Docker. No exponer el puerto 8000 públicamente.

---

## Verificar el despliegue

```bash
# Salud del RAG backend
curl http://localhost:8000/health

# Salud del NestJS
curl http://localhost:3225/health

# Chat widget (debe responder con HTML)
curl -I http://localhost:80

# Logs en tiempo real de un servicio específico
docker compose logs -f rag-backend
```

---

## Cargar datos de posgrados en producción

```bash
# Via la API directamente (con curl)
curl -X POST http://localhost:8000/admin/knowledge/upload \
  -H "x-internal-key: $RAG_INTERNAL_API_KEY" \
  -F "file=@/ruta/al/archivo.xlsx"

# O desde el panel de administración del chat-widget
# Admin → tab Posgrados → Subir Excel
```

---

## Backups

### Base de datos chat_db

```bash
docker exec postgres-chat pg_dump -U chat_user chat_db > backup_chat_$(date +%Y%m%d).sql
```

### Base de datos rag_db (con extensión pgvector)

```bash
docker exec postgres-rag pg_dump -U rag_user rag_db > backup_rag_$(date +%Y%m%d).sql
```

Programar estos backups con cron en el servidor host:

```cron
0 2 * * * /ruta/al/script/backup.sh >> /var/log/backup.log 2>&1
```
