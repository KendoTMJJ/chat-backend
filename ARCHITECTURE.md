# Arquitectura del Sistema — Asistente Virtual USTA Tunja

## Descripción general

Sistema de chat universitario con dos contextos de atención:
- **Posgrados**: responde preguntas académicas sobre programas de posgrado usando RAG (Retrieval-Augmented Generation).
- **Mesa de Ayuda**: orienta al usuario hacia la categoría correcta de soporte y entrega información o documentos relacionados.

Cuando el bot no resuelve la consulta, activa un flujo de **escalación** que registra los datos del usuario y notifica por correo al área correspondiente.

---

## Componentes del sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                         chat-widget (React)                         │
│         Puerto 5173 (dev) · Vite · TailwindCSS · Socket.io-client  │
│  ┌──────────────────────┐  ┌───────────────────────────────────┐    │
│  │   Chat (usuarios)    │  │   Panel Admin (conversaciones,    │    │
│  │   WebSocket + REST   │  │   helpdesk, canales, perfil)      │    │
│  └──────────────────────┘  └───────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────────┘
                             │ WebSocket / REST HTTP
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       chat (NestJS)  · Puerto 3225                  │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  ChatGateway    │  │  AdminAPI    │  │  HelpdeskProxy /       │ │
│  │  (WebSocket)    │  │  (REST/JWT)  │  │  SupportChannels /     │ │
│  │  Escalation FSM │  │              │  │  KnowledgeProxy        │ │
│  └────────┬────────┘  └──────────────┘  └────────────────────────┘ │
│           │ HTTP (N8N_WEBHOOK_URL)                  │ HTTP interno  │
└───────────┼────────────────────────────────────────┼───────────────┘
            │                                        │
            ▼                                        ▼
┌───────────────────────┐              ┌─────────────────────────────┐
│    n8n  · Puerto 5678 │              │   rag-backend (FastAPI)     │
│  Flujo Santoto        │◄────────────►│   Puerto 8000               │
│  Posgrados            │  POST /chat  │   RAGPipeline · Ollama      │
│                       │  POST /helpdesk/classify  │  pgvector       │
│  POST /chat/bot-reply │              │                             │
│  (NestJS)             │              └─────────────────────────────┘
└───────────────────────┘
            │ SMTP
            ▼
      Correo electrónico
      (notificación escalación)
```

---

## Bases de datos

### chat_db (PostgreSQL · NestJS)

| Tabla | Descripción |
|---|---|
| `Conversations` | Sesiones de chat con datos del usuario (id, name, email, status...) |
| `Messages` | Mensajes individuales de cada conversación |
| `SupportChannels` | Canales de contacto por contexto e intent (WhatsApp, email) |
| `Admins` | Administradores del panel (email, password hash, reset token) |

### rag_db (PostgreSQL + pgvector · FastAPI)

| Tabla | Descripción |
|---|---|
| `programs` | Programas de posgrado con embeddings vectoriales |
| `program_chunks` | Fragmentos de texto con embeddings para búsqueda semántica |
| `helpdesk_categories` | Categorías de mesa de ayuda (intent, descripción, documento binario) |

---

## Flujo principal: chat de posgrados

```
Usuario escribe mensaje
        │
        ▼
ChatGateway.handleMessage()
  → session.context = 'posgrados'
  → N8nService.sendMessage()          POST /webhook → n8n
        │
        ▼ (n8n)
  Extraer Input → Switch Evento → RAG Posgrados
  → POST http://rag-backend:8000/chat
        │
        ▼ (rag-backend)
  RAGPipeline.ask()
  → ruta: GREETING / LIST_PROGRAMS / DEFAULT_RAG / LOW_CONFIDENCE / ...
  → devuelve { route, data: { answer, resolved, buttons, ... } }
        │
        ▼ (n8n)
  Construir mensaje según ruta
  → POST http://chat:3225/chat/bot-reply   (header x-api-key)
        │
        ▼
ChatGateway.handleBotReply()
  → emite 'on-message' al cliente via Socket.io
  → si resolved=false → startEscalationFlow()
```

## Flujo principal: Mesa de Ayuda

```
Usuario escribe mensaje / selecciona categoría
        │
        ▼
ChatGateway.handleMessage()
  → session.context = 'mesa_ayuda'
  → N8nService.sendMessage()          POST /webhook → n8n
        │
        ▼ (n8n)
  POST http://rag-backend:8000/helpdesk/classify
  → devuelve { intent, message }
        │
  Switch Intent:
    'saludo'     → mensaje de bienvenida con categorías disponibles
    'desconocida'→ mensaje de orientación
    '<intent>'   → GET /helpdesk/category/:intent
                 → respuesta con botón de documento si aplica
        │
        ▼ (n8n)
  POST /chat/bot-reply
        │
        ▼
ChatGateway.handleBotReply()
  → emite 'on-message'
  → guarda session.helpdeskIntent para usar en escalación
```

## Flujo de escalación

La máquina de estados vive en `ChatGateway` (en memoria, por sesión).

```
Estado inicial: 'none'
      │
      │ resolved=false en bot-reply
      ▼
   'pending'   ← emite 'show-escalate-button' al front
      │
      │ usuario confirma (sí / botón escalate)
      ▼
  'awaiting_name'   ← pide nombre completo
      │ nombre válido (≥2 palabras)
      ▼
  'awaiting_email'  ← pide correo electrónico
      │ email válido
      ▼
  'awaiting_reason' ← pide descripción del problema
      │ descripción ≥10 chars
      ▼
  'awaiting_confirmation' ← emite 'show-confirmation' {name, email, reason}
      │ usuario confirma / edita
      ▼
     'done'
      │
      ├─ ChatService.escalateConversation() → persiste en DB
      ├─ emite 'chat-escalated' {conversationId}
      └─ N8nService.notifyEscalation('escalation_done', {...})
              │
              ▼ (n8n)
         Envía correo al área correspondiente
```

---

## Autenticación

| Capa | Mecanismo |
|---|---|
| Panel Admin (widget ↔ chat) | JWT Bearer · expira en 12h · renovación manual |
| n8n → NestJS `/chat/bot-reply` | Header `x-api-key: N8N_API_KEY` |
| NestJS → RAG Backend | Header `x-internal-key: RAG_INTERNAL_API_KEY` |
| Admin → RAG Backend (vía proxy) | Mismo `RAG_INTERNAL_API_KEY`, NestJS lo añade |

---

## Estructura de repositorios

```
Practicas/
├── rag-backend/         FastAPI · RAG pipeline · helpdesk categories
│   ├── src/
│   │   ├── api/routes/  Endpoints HTTP
│   │   ├── services/    RAGPipeline, LLMService, RetrievalService
│   │   ├── nlp/         Intención, dominio, guardrail
│   │   └── models/      ORM SQLAlchemy
│   └── docs/            Documentación técnica
│
├── chat/                NestJS · WebSocket hub · Admin API
│   ├── src/
│   │   ├── chat/        Gateway, Service, Controller, n8n client
│   │   ├── admin/       CRUD conversaciones y perfil
│   │   ├── admin-auth/  Login, JWT, reset password
│   │   ├── helpdesk/    Proxy hacia rag-backend
│   │   ├── knowledge/   Proxy para ingestión de Excel
│   │   ├── support-channels/ Canales de contacto
│   │   └── conversation/ + message/ Entidades TypeORM
│   └── docs/            Documentación técnica
│
└── chat-widget/         React + Vite · Chat público + Panel Admin
    ├── src/
    │   ├── components/  Chat.tsx (widget principal)
    │   ├── pages/Admin/ AdminPage, HelpdeskPage, PosgradosPage
    │   ├── hooks/       useAdminConversations, useHelpdeskResponses, useAuth
    │   └── socket/      useChatSocket, socket.ts
    └── docs/            Documentación técnica
```

---

## Variables de entorno requeridas por servicio

Ver [`docs/ENV_VARS.md`](docs/ENV_VARS.md) para la referencia completa.

| Servicio | Archivo |
|---|---|
| chat (NestJS) | `.env` en raíz del proyecto |
| rag-backend (FastAPI) | `.env` en raíz del proyecto |
| chat-widget (React) | `.env` en raíz del proyecto |
