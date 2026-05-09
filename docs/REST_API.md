# Referencia REST API — NestJS Chat

Base URL: `http://localhost:3225` (dev)

---

## Autenticación

Los endpoints de administración requieren JWT en el header:
```
Authorization: Bearer <token>
```

El token se obtiene en `POST /admin-auth/login` y expira en 12 horas.

---

## Admin Auth

### `POST /admin-auth/login`
Rate limit: 5 req/min.

**Body:**
```json
{ "email": "admin@usta.edu.co", "password": "contraseña" }
```
**Respuesta:**
```json
{ "access_token": "<jwt>" }
```

---

### `POST /admin-auth/forgot-password`
Rate limit: 3 req/min. Envía un correo con enlace de reset si el email existe.

**Body:**
```json
{ "email": "admin@usta.edu.co" }
```
**Respuesta:** `200` siempre (no revela si el email existe).

---

### `POST /admin-auth/reset-password`
**Body:**
```json
{ "token": "<token del correo>", "newPassword": "nueva_clave_min8" }
```

---

## Perfil del Admin *(requiere JWT)*

### `GET /admin/profile`
Devuelve nombre, email y rol del administrador autenticado.

### `PATCH /admin/profile`
**Body:**
```json
{ "name": "Nuevo nombre", "email": "nuevo@email.com" }
```

### `PATCH /admin/change-password`
**Body:**
```json
{ "currentPassword": "actual", "newPassword": "nueva_min8" }
```

---

## Conversaciones *(requiere JWT)*

### `GET /admin/conversations`
Lista todas las conversaciones con resumen del último mensaje.

**Respuesta (array):**
```json
[{
  "conversationId": "uuid",
  "userId": "string",
  "name": "Juan Pérez",
  "email": "juan@gmail.com",
  "status": "active | closed | expired | escalated",
  "title": "motivo de escalación",
  "context": "posgrados | mesa_ayuda",
  "lastMessage": "último mensaje",
  "startedAt": "ISO date",
  "updatedAt": "ISO date"
}]
```

### `GET /admin/history/:conversationId`
Historial de mensajes de una conversación.

**Respuesta (array):**
```json
[{
  "id": "uuid",
  "sender": "user | bot",
  "message": "texto",
  "createdAt": "ISO date"
}]
```

### `PATCH /admin/conversations/:id/close`
Marca la conversación como `closed`.

### `DELETE /admin/conversations/:id`
Elimina la conversación y todos sus mensajes.

---

## Bot Reply *(interno, usado por n8n)*

### `POST /chat/bot-reply`

**Header requerido:** `x-api-key: <N8N_API_KEY>`

**Body:**
```json
{
  "chatSessionId": "string",
  "message": "string (markdown)",
  "resolved": true,
  "context": "posgrados | mesa_ayuda",
  "intent": "string (opcional, solo mesa_ayuda)",
  "buttons": [
    { "label": "Ver programas", "message": "¿Qué programas ofrecen?" },
    { "label": "Ver documento", "url": "https://..." }
  ]
}
```

---

## Canales de Soporte *(requiere JWT)*

### `GET /support-channels/show`
Lista todos los canales configurados.

**Respuesta (array):**
```json
[{
  "id": "uuid",
  "context": "posgrados | mesa_ayuda",
  "intent": "pagos | null",
  "whatsapp": "+57 300 000 0000",
  "email": "soporte@usta.edu.co",
  "isDefault": false
}]
```

### `POST /support-channels/create`
**Body:**
```json
{
  "context": "mesa_ayuda",
  "intent": "pagos",
  "whatsapp": "+57 300 000 0000",
  "email": "pagos@usta.edu.co",
  "isDefault": false
}
```

### `PATCH /support-channels/update`
**Body:** mismos campos que create, más `id`.

### `DELETE /support-channels/delete/:id`

---

## Helpdesk (proxy → rag-backend) *(requiere JWT)*

NestJS recibe estas peticiones, añade `x-internal-key` y las reenvía al RAG backend.

### `GET /admin/helpdesk/categories`
Lista categorías con documento, descripción y URL pública del documento.

### `GET /admin/helpdesk/categories/intents`
Lista solo los intents públicos activos (usados en el widget).

### `GET /admin/helpdesk/categories/:id`

### `POST /admin/helpdesk/categories`
```json
{ "intent": "pagos", "description": "Información sobre pagos" }
```

### `PATCH /admin/helpdesk/categories/:id`
```json
{ "description": "Nueva descripción" }
```

### `DELETE /admin/helpdesk/categories/:id`

### `POST /admin/helpdesk/categories/:id/document`
`multipart/form-data` con campo `file`. Máximo 20 MB.  
Tipos aceptados: `pdf`, `doc`, `docx`, `ppt`, `pptx`.

### `DELETE /admin/helpdesk/categories/:id/document`

---

## Knowledge (proxy → rag-backend) *(requiere JWT)*

### `POST /admin/knowledge/upload`
`multipart/form-data` con campo `file` (`.xlsx`).  
Dispara la ingestión de programas de posgrado con generación de embeddings.
