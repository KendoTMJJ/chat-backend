# Referencia de Eventos WebSocket

El servidor WebSocket corre sobre Socket.io en el mismo puerto que el REST API (3225).  
La conexión requiere pasar `userId` y `tabId` en el handshake de autenticación.

## Conexión

```typescript
const socket = io(SERVER_URL, {
  auth: {
    userId: string,   // identificador único del navegador/usuario
    tabId:  string,   // identificador único por pestaña
    context: 'posgrados' | 'mesa_ayuda'  // opcional, se puede enviar después
  }
});
```

---

## Eventos: Cliente → Servidor

### `send-message`

Envía un mensaje del usuario. Es el único evento que el cliente emite activamente.

**Payload** (dos formas aceptadas):

```typescript
// Forma simple
socket.emit('send-message', 'Hola, ¿qué programas ofrecen?');

// Forma extendida (recomendada)
socket.emit('send-message', {
  message: string,
  context?: 'posgrados' | 'mesa_ayuda',
  meta?: {
    source?: 'text' | 'quick_reply',
    optionId?: string   // ID del botón pulsado (ver tabla de optionIds)
  }
});
```

**`optionId` reservados:**

| `optionId` | Efecto |
|---|---|
| `escalate` | Inicia el flujo de escalación directamente |
| `escalate_yes` | Confirma escalación en estado `pending` |
| `escalate_no` | Rechaza escalación en estado `pending` |
| `confirm` | Confirma datos en pantalla de confirmación |
| `edit_name` | Vuelve a pedir el nombre |
| `edit_email` | Vuelve a pedir el email |
| `edit_reason` | Vuelve a pedir el motivo |
| `cancel` | Cancela la escalación desde confirmación |
| `<intent>:menu` | Selecciona categoría de helpdesk (ej. `pagos:menu`) |

---

## Eventos: Servidor → Cliente

### `chat-session`

Emitido al conectar. Entrega el ID de sesión que se usa como `chatSessionId` en las llamadas REST al bot.

```typescript
socket.on('chat-session', (payload: {
  chatSessionId: string
}) => { ... });
```

---

### `on-message`

Mensaje de texto (del bot o del propio usuario, replicado al room para multi-pestaña).

```typescript
socket.on('on-message', (payload: {
  userId:         string,           // 'bot' si viene del bot
  name:           string,           // nombre display
  sender:         'user' | 'bot',
  message:        string,           // markdown soportado
  conversationId: string | null,    // null hasta que escala
  buttons?: Array<{
    label:    string,
    message?: string,   // texto que se envía al hacer clic
    url?:     string,   // abre enlace externo
    optionId?: string   // optionId que se envía como meta
  }>
}) => { ... });
```

---

### `show-escalate-button`

Indica al frontend que muestre el prompt de escalación (chips Sí / No o botón de contacto).  
No lleva payload.

```typescript
socket.on('show-escalate-button', () => { ... });
```

---

### `show-confirmation`

El servidor envía los datos recolectados para que el usuario los confirme antes de escalar.

```typescript
socket.on('show-confirmation', (payload: {
  name:   string,   // nombre completo del usuario
  email:  string,   // correo electrónico del usuario
  reason: string    // motivo de la consulta
}) => { ... });
```

El frontend debe renderizar estos datos y ofrecer botones con los `optionId`: `confirm`, `edit_name`, `edit_email`, `edit_reason`, `cancel`.

---

### `chat-escalated`

Confirma que la conversación fue persistida en la base de datos.  
A partir de este evento, el socket se une al room de la conversación y los mensajes se guardan.

```typescript
socket.on('chat-escalated', (payload: {
  conversationId: string   // UUID de la conversación en DB
}) => { ... });
```

---

### `session-expired`

La sesión expiró por inactividad (5 minutos por defecto). El socket se desconecta automáticamente después de este evento.

```typescript
socket.on('session-expired', (payload: {
  reason:  'inactivity' | 'missing_session',
  message: string
}) => { ... });
```

---

### `session-error`

Error en el handshake (falta `userId` o `tabId`). El socket se desconecta.

```typescript
socket.on('session-error', (payload: {
  message: string
}) => { ... });
```

---

## Estado de sesión (servidor, en memoria)

Cada pestaña del navegador tiene una `SessionState` en memoria. No se persiste en DB hasta la escalación.

| Campo | Tipo | Descripción |
|---|---|---|
| `tabId` | string | ID de pestaña (clave del Map) |
| `userId` | string | ID del usuario |
| `chatSessionId` | string | UUID de sesión, usado por n8n |
| `context` | `'posgrados' \| 'mesa_ayuda' \| null` | Contexto activo |
| `escalationState` | `EscalationState` | Estado de la máquina de escalación |
| `escalationName` | string \| null | Nombre capturado |
| `escalationEmail` | string \| null | Email capturado |
| `escalationReason` | string \| null | Motivo capturado |
| `helpdeskIntent` | string \| null | Último intent de helpdesk (para routing del canal) |
| `persisting` | boolean | true cuando la conversación está en DB |
| `conversationId` | string \| null | UUID de la conversación en DB |
| `history` | array | Buffer de mensajes pre-escalación |

Las sesiones expiran por inactividad tras `IDLE_MS` (5 min). Hay una gracia de 15 segundos al desconectar para reconexiones de red.
