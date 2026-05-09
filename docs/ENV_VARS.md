# Variables de Entorno — Referencia Completa

## chat (NestJS) · `.env`

| Variable | Requerida | Descripción | Ejemplo (dev) |
|---|---|---|---|
| `PORT` | No | Puerto del servidor (default 3000) | `3225` |
| `DB_HOST` | Sí | Host de PostgreSQL | `localhost` |
| `DB_PORT` | Sí | Puerto de PostgreSQL | `5433` |
| `DB_NAME` | Sí | Nombre de la base de datos | `chat_db` |
| `DB_USER` | Sí | Usuario de PostgreSQL | `user_node` |
| `DB_PASSWORD` | Sí | Contraseña de PostgreSQL | `cambiar_en_prod` |
| `JWT_SECRET` | Sí | Clave secreta para firmar JWT | `min_32_chars_aleatorio` |
| `JWT_EXPIRES_IN` | No | Duración del token (default `12h`) | `12h` |
| `ADMIN_EMAIL` | Sí | Email del admin inicial (se crea al arrancar) | `admin@usta.edu.co` |
| `ADMIN_INITIAL_PASSWORD` | Sí | Contraseña inicial del admin | `cambiar_en_prod` |
| `ADMIN_NAME` | No | Nombre del admin inicial | `Administrador` |
| `N8N_WEBHOOK_URL` | Sí | URL del webhook de n8n para mensajes de chat | `http://localhost:5678/webhook/...` |
| `N8N_API_KEY` | Sí | Clave compartida NestJS ↔ n8n para `/chat/bot-reply` | `clave_segura_aleatoria` |
| `RAG_BASE_URL` | Sí | URL base del rag-backend | `http://localhost:8000` |
| `RAG_INTERNAL_API_KEY` | Sí | Clave interna NestJS → RAG | `clave_segura_aleatoria` |
| `FRONTEND_URL` | Sí | URL del frontend (para CORS) | `http://localhost:5173` |
| `SMTP_HOST` | Sí | Servidor SMTP para reset de contraseña | `smtp.gmail.com` |
| `SMTP_PORT` | Sí | Puerto SMTP | `587` |
| `SMTP_SECURE` | No | true = TLS directo (puerto 465) | `false` |
| `SMTP_USER` | Sí | Usuario SMTP | `correo@gmail.com` |
| `SMTP_PASS` | Sí | Contraseña de aplicación SMTP | `xxxx xxxx xxxx xxxx` |
| `SMTP_FROM` | No | Nombre y dirección del remitente | `Sistema USTA <correo@gmail.com>` |

> **Producción:** `JWT_SECRET`, `DB_PASSWORD`, `ADMIN_INITIAL_PASSWORD`, `N8N_API_KEY` y `RAG_INTERNAL_API_KEY` deben ser valores aleatorios largos (mínimo 32 caracteres). Nunca usar los valores de desarrollo.

---

## rag-backend (FastAPI) · `.env`

| Variable | Requerida | Descripción | Ejemplo (dev) |
|---|---|---|---|
| `POSTGRESQL_URL` | Sí | URL completa de conexión a PostgreSQL | `postgresql://user:pass@localhost:5432/rag_db` |
| `OLLAMA_BASE_URL` | Sí | URL del servidor Ollama (LLM local) | `http://localhost:11434` |
| `OLLAMA_MODEL` | Sí | Nombre del modelo LLM en Ollama | `llama3.1:8b-instruct-q4_K_M` |
| `EMBEDDINGS_MODEL` | Sí | Modelo de embeddings de HuggingFace | `intfloat/multilingual-e5-base` |
| `RAG_INTERNAL_API_KEY` | Sí | Clave para autenticar peticiones internas (mismo valor que en NestJS) | `clave_segura_aleatoria` |
| `PUBLIC_BASE_URL` | Sí | URL pública del backend (para construir URLs de documentos) | `https://api.midominio.com` |
| `SESSION_TTL_SECONDS` | No | TTL de la memoria de sesión del RAG (default 1800) | `1800` |

> **Producción sin GPU:** El modelo Ollama corre en CPU. Ver [`docs/OLLAMA_CPU.md`](OLLAMA_CPU.md) en el rag-backend para configuración de hilos y memoria.

---

## chat-widget (React/Vite) · `.env`

| Variable | Requerida | Descripción | Ejemplo (dev) |
|---|---|---|---|
| `VITE_SERVER_URL` | Sí | URL del servidor NestJS (chat) | `http://localhost:3225` |

> Las variables de Vite deben tener el prefijo `VITE_` para estar disponibles en el navegador. Solo incluir lo que es seguro exponer públicamente — `VITE_SERVER_URL` apunta al NestJS, no directamente al RAG backend.

---

## n8n · Variables de entorno del proceso

n8n usa su propia interfaz de configuración. Las credenciales SMTP y las URLs de servicios se configuran como **Credentials** dentro de la interfaz de n8n, no como variables de entorno del sistema.

Los valores que n8n necesita conocer para el flujo:

| Dato | Dónde configurar |
|---|---|
| URL del webhook de entrada | Automático al crear el nodo Webhook |
| `x-api-key` para `/chat/bot-reply` | Hardcodeado en el nodo HTTP del flujo o como credential |
| URL del chat NestJS | Nodo HTTP Request → `http://chat:3225` |
| URL del rag-backend | Nodo HTTP Request → `http://rag-backend:8000` |
| Credenciales SMTP | n8n Credentials → SMTP |

---

## Notas de producción

1. **Nunca commitear `.env`** — están en `.gitignore`.
2. **`synchronize: false`** en TypeORM significa que los cambios al esquema requieren migraciones manuales o recrear la DB.
3. **`PUBLIC_BASE_URL`** en el rag-backend debe terminar sin `/` (la config lo recorta automáticamente). En producción debe ser la URL pública real, ya que se usa para construir los enlaces de descarga de documentos que llegan a n8n y al widget.
4. **`N8N_API_KEY`** y **`RAG_INTERNAL_API_KEY`** deben ser el mismo valor en todos los servicios que los comparten.
