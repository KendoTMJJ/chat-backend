# Chat Backend — USTA Posgrados

Servidor de chat en tiempo real para el Asistente de Posgrados de la Universidad Santo Tomás Seccional Tunja. Gestiona conexiones WebSocket de usuarios, orquesta el flujo de escalación a agentes humanos y actúa como proxy autenticado hacia el RAG Backend.

## Stack

- **NestJS** + TypeScript
- **Socket.io** — WebSocket para mensajes en tiempo real
- **TypeORM** + **PostgreSQL** — Persistencia de conversaciones escaladas
- **JWT** — Autenticación de administradores
- **n8n** — Motor de procesamiento de mensajes (webhook + callback)

---

## Arquitectura

```mermaid
graph TB
    subgraph Clientes
        FE["Frontend (Browser)\nWebSocket"]
        ADM["Admin Dashboard\nHTTP + JWT"]
        N8N["n8n Workflow\nHTTP Callback"]
    end

    subgraph ChatBackend["Chat Backend — NestJS :3000"]
        subgraph ChatModule["ChatModule"]
            GW["ChatGateway\nWebSocket — eventos de chat"]
            CC["ChatController\nPOST /chat/bot-reply"]
            CS["ChatService\nPersistencia TypeORM"]
            N8NS["N8nService\nHTTP Client → n8n"]
        end
        subgraph Auth["AdminAuthModule"]
            AA["POST /admin/auth/register\nPOST /admin/auth/login"]
            AS["AdminAuthService\nJWT · bcrypt"]
        end
        subgraph Proxy["Módulos Proxy (requieren JWT + AdminGuard)"]
            HC["HelpdeskProxyController\n/admin/helpdesk/*"]
            KC["KnowledgeProxyController\n/admin/knowledge/upload"]
            SC["SupportChannelsController\n/admin/support-channels"]
        end
    end

    subgraph DB["PostgreSQL — Chat DB"]
        Conv["Conversation\nuuid · userId · status · nombre · correo"]
        Msg["Message\nuuid · conversationId · sender · message"]
        AdmE["Admin\nuuid · email · passwordHash"]
        SCE["SupportChannel\ncontext · whatsapp · email"]
    end

    subgraph Externos["Servicios Externos"]
        N8NE["n8n Engine\n(procesamiento RAG)"]
        RAG["RAG Backend :8000\n(conocimiento + helpdesk)"]
    end

    FE -->|"send-message, option-click, confirm"| GW
    ADM -->|JWT| AA
    N8N -->|"x-api-key header"| CC
    GW -->|"fire-and-forget"| N8NS --> N8NE
    N8NE -->|"POST /chat/bot-reply"| CC --> GW
    GW -->|"escalation done"| CS
    CS --> Conv & Msg
    AA --> AS --> AdmE
    SC --> SCE
    HC -->|"x-internal-key"| RAG
    KC -->|"x-internal-key"| RAG
```

---

## Flujo de mensajes

```mermaid
sequenceDiagram
    participant U as Usuario (Browser)
    participant GW as ChatGateway
    participant N8 as n8n
    participant CC as ChatController
    participant CS as ChatService

    U->>GW: connect (userId, context)
    GW-->>U: welcome + quick-reply buttons

    U->>GW: send-message {text}
    GW->>N8: POST webhook {question, chatSessionId}

    N8-->>CC: POST /chat/bot-reply {message, resolved, buttons}
    CC->>GW: handleBotReply()
    GW-->>U: message event {text, buttons}

    alt resolved = false (escalación)
        GW-->>U: show-escalate-button
        U->>GW: confirma escalación
        GW-->>U: solicita nombre → correo → motivo
        U->>GW: confirma datos
        GW->>CS: escalateConversation()
        CS-->>GW: Conversation + Messages persistidos
        GW->>N8: notifyEscalation()
        GW-->>U: canales de contacto (WhatsApp / email)
    end
```

---

## Módulos

| Módulo | Ruta base | Descripción |
|---|---|---|
| `ChatModule` | `/chat` | WebSocket + callback de n8n + máquina de estados de escalación |
| `AdminAuthModule` | `/admin/auth` | Registro/login con JWT |
| `AdminModule` | `/admin/admins` | CRUD de cuentas admin |
| `HelpdeskModule` | `/admin/helpdesk` | Proxy a rutas admin del RAG Backend |
| `KnowledgeModule` | `/admin/knowledge` | Proxy de carga de archivos Excel al RAG Backend |
| `SupportChannelsModule` | `/admin/support-channels` | Gestión de canales de contacto por contexto |
| `ConnectionModule` | — | Inicialización global de TypeORM + PostgreSQL |

---

## Endpoints HTTP

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/chat/bot-reply` | `x-api-key` (N8N_API_KEY) | Recibe respuesta de n8n y la envía al socket del usuario |
| `POST` | `/admin/auth/register` | — | Crea cuenta admin |
| `POST` | `/admin/auth/login` | — | Login → retorna JWT |
| `GET/POST` | `/admin/helpdesk/categories` | JWT | Listar/crear categorías de helpdesk |
| `GET/PATCH/DELETE` | `/admin/helpdesk/categories/:id` | JWT | Operaciones sobre una categoría |
| `POST` | `/admin/knowledge/upload` | JWT | Sube archivo `.xlsx` de conocimiento al RAG |
| `GET/POST/PATCH` | `/admin/support-channels` | JWT | Gestión de canales de contacto |

## Eventos WebSocket (Socket.io)

| Evento | Dirección | Payload |
|---|---|---|
| `send-message` | Client → Server | `{ text, chatSessionId }` |
| `option-click` | Client → Server | `{ optionId, label }` |
| `message` | Server → Client | `{ sender, text, buttons[] }` |
| `show-escalate-button` | Server → Client | — |
| `show-confirmation` | Server → Client | `{ nombre, correo, reason }` |
| `chat-escalated` | Server → Client | `{ supportChannels }` |

---

## Modelos de base de datos

```
Conversation
  ├── codConversation  UUID PK
  ├── userId           string
  ├── status           ACTIVE | ESCALATED | CLOSED | EXPIRED
  ├── nombre           string
  ├── correo           string
  ├── title            string
  └── createdAt / updatedAt

Message
  ├── codMessage       UUID PK
  ├── conversationId   FK → Conversation
  ├── userId           string
  ├── sender           user | bot
  └── message / createAt

SupportChannel
  ├── uuid             PK
  ├── context          posgrados | mesa_ayuda
  ├── whatsapp         string
  └── email            string

Admin
  ├── uuid             PK
  ├── email            string unique
  └── passwordHash     bcrypt
```

---

## Instalación

```bash
npm install
```

### Variables de entorno

Crea un archivo `.env` en la raíz:

```env
# Base de datos
POSTGRESQL_URL=postgresql://usuario:password@localhost:5432/chat_db

# n8n
N8N_WEBHOOK_URL=https://<instancia-n8n>/webhook/<id>
N8N_API_KEY=<clave-secreta-compartida>

# RAG Backend
RAG_BASE_URL=http://localhost:8000
RAG_INTERNAL_API_KEY=<clave-interna-compartida>

# JWT
JWT_SECRET=<secreto-jwt>
JWT_EXPIRES_IN=7d

# Puerto
PORT=3000
```

### Desarrollo

```bash
npm run start:dev
```

### Producción

```bash
npm run build
npm run start:prod
```

---

## Contextos soportados

| Contexto | Descripción |
|---|---|
| `posgrados` | Asistente RAG para programas de posgrado |
| `mesa_ayuda` | Mesa de ayuda general de la institución |
