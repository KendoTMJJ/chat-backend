# Guía de Instalación Local

Esta guía cubre la configuración completa del sistema en un entorno de desarrollo local.  
El sistema tiene **3 servicios** independientes que deben estar corriendo simultáneamente.

---

## Requisitos previos

| Herramienta | Versión mínima | Uso |
|---|---|---|
| Node.js | 20 | NestJS (chat) y React (chat-widget) |
| Python | 3.11 | RAG backend |
| PostgreSQL | 15+ | Base de datos del chat |
| PostgreSQL + pgvector | 15+ | Base de datos de embeddings |
| Ollama | última | Modelo LLM local |
| npm | 9+ | Gestión de paquetes Node |
| pip | 23+ | Gestión de paquetes Python |

---

## 1. Bases de datos

### 1.1 PostgreSQL — chat_db

```sql
-- Crear la base de datos y el usuario
CREATE DATABASE chat_db;
CREATE USER chat_user WITH PASSWORD 'tu_password';
GRANT ALL PRIVILEGES ON DATABASE chat_db TO chat_user;
```

La estructura de tablas se genera automáticamente al iniciar el servidor NestJS cuando `synchronize: true` está activo en desarrollo (ver `chat/src/database/database.module.ts`).

### 1.2 PostgreSQL + pgvector — rag_db

```sql
CREATE DATABASE rag_db;
CREATE USER rag_user WITH PASSWORD 'tu_password';
GRANT ALL PRIVILEGES ON DATABASE rag_db TO rag_user;

-- Conectarse a rag_db y habilitar la extensión
\c rag_db
CREATE EXTENSION IF NOT EXISTS vector;
```

El esquema de la base de datos RAG se crea automáticamente con el script de bootstrap:

```bash
cd rag-backend
python -m scripts.bootstrap_db
```

---

## 2. Ollama (modelo LLM local)

### Instalación en Linux / WSL

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Descargar el modelo requerido

```bash
ollama pull llama3.1:8b-instruct-q4_K_M
```

### Iniciar el servidor

```bash
ollama serve
# Corre en http://localhost:11434
```

> Si la máquina no tiene GPU, ver `rag-backend/docs/OLLAMA_CPU.md` para configurar los parámetros de CPU.

---

## 3. Servicio RAG (rag-backend)

### 3.1 Clonar e instalar dependencias

```bash
git clone <repo-url> rag-backend
cd rag-backend
pip install -r requirements.txt
```

### 3.2 Variables de entorno

Crear el archivo `.env` en la raíz del proyecto:

```env
# Base de datos
POSTGRESQL_URL=postgresql://rag_user:tu_password@localhost:5432/rag_db

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b-instruct-q4_K_M

# Embeddings
EMBEDDINGS_MODEL=intfloat/multilingual-e5-base

# Seguridad
RAG_INTERNAL_API_KEY=clave-secreta-interna

# Sesiones (opcional — defaults razonables)
SESSION_TTL_SECONDS=1800
```

### 3.3 Inicializar la base de datos

```bash
python -m scripts.bootstrap_db
```

### 3.4 Iniciar el servidor

```bash
uvicorn src.main:app --reload --port 8000
# Disponible en http://localhost:8000
# Documentación automática: http://localhost:8000/docs
```

---

## 4. Servicio de chat (chat — NestJS)

### 4.1 Instalar dependencias

```bash
cd chat
npm install
```

### 4.2 Variables de entorno

Crear `.env` en la raíz del proyecto `chat/`:

```env
# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chat_db
DB_USER=chat_user
DB_PASS=tu_password

# JWT — debe ser una cadena larga y aleatoria
JWT_SECRET=tu-jwt-secret-muy-largo

# RAG backend
RAG_BASE_URL=http://localhost:8000
RAG_INTERNAL_API_KEY=clave-secreta-interna

# n8n
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=tu-api-key-de-n8n

# Administrador inicial (se crea solo al arrancar si no existe)
ADMIN_EMAIL=admin@usta.edu.co
ADMIN_PASSWORD=contraseña-inicial-segura

# Correo (para recuperación de contraseña)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=tu-correo@gmail.com
MAIL_PASS=contraseña-de-aplicación
MAIL_FROM=tu-correo@gmail.com
```

### 4.3 Iniciar el servidor

```bash
npm run start:dev
# Disponible en http://localhost:3225
```

---

## 5. Frontend (chat-widget — React)

### 5.1 Instalar dependencias

```bash
cd chat-widget
npm install
```

### 5.2 Variables de entorno

Crear `.env` en la raíz del proyecto `chat-widget/`:

```env
VITE_SERVER_URL=http://localhost:3225
```

### 5.3 Iniciar el servidor de desarrollo

```bash
npm run dev
# Disponible en http://localhost:5173
```

---

## 6. Verificar que todo funciona

### Orden de inicio recomendado

1. PostgreSQL (servicio del sistema)
2. Ollama (`ollama serve`)
3. RAG backend (`uvicorn src.main:app --reload --port 8000`)
4. NestJS (`npm run start:dev`)
5. React (`npm run dev`)

### Pruebas básicas

```bash
# RAG backend
curl http://localhost:8000/health
# → {"status":"ok"}

# NestJS
curl http://localhost:3225/health
# → {"status":"ok","timestamp":"..."}

# Chat widget: abrir http://localhost:5173 en el navegador
```

### Ingresar al panel de administración

1. Abrir `http://localhost:5173/login`
2. Usar las credenciales definidas en `ADMIN_EMAIL` / `ADMIN_PASSWORD`
3. Si olvidó la contraseña, usar el flujo de recuperación por correo

---

## 7. Cargar datos iniciales (posgrados)

Para que el chatbot de posgrados funcione, debe subir el archivo Excel con los programas:

1. Ingresar al panel de administración → tab **Posgrados**
2. Subir el archivo `.xlsx` con el formato requerido
3. El sistema procesará el Excel, generará embeddings y los almacenará en pgvector

El formato del Excel está documentado en el código del parser: `rag-backend/src/extractors/program_excel_parser.py`.

---

## 8. Problemas comunes de instalación

Ver `chat/docs/TROUBLESHOOTING.md` para errores frecuentes y sus soluciones.
