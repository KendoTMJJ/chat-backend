# Documentación del Flujo n8n — Flujo Santoto Posgrados

**ID del workflow:** `hCaWFCJOx9pZX5fB`  
**n8n local:** `http://localhost:5678`

El workflow es el cerebro del sistema: recibe todos los mensajes del chat, los clasifica, los enruta al servicio correcto (RAG o Helpdesk), construye la respuesta y la devuelve al usuario via NestJS. También maneja las notificaciones de escalación.

---

## Diagrama general

```
                    ┌─────────────────────────────────┐
                    │  Webhook POST (entrada única)    │
                    └────────────────┬────────────────┘
                                     │
                              ┌──────▼──────┐
                              │ Extraer     │  Normaliza el body del request,
                              │ Input1      │  extrae: event, question, context,
                              └──────┬──────┘  chatSessionId, name, email, reason,
                                     │         optionId, conversationId
                                     │
                          ┌──────────▼──────────┐
                          │  Switch: Evento      │
                          └──────────┬──────────┘
                                     │
                    ┌────────────────┴──────────────────┐
                    │                                   │
               event=message                  event=escalation_done
                    │                                   │
          ┌─────────▼──────────┐          ┌────────────▼────────────┐
          │ Switch: Contexto   │          │  Switch: Contexto        │
          │ (mensaje)          │          │  (escalation_done)       │
          └─────────┬──────────┘          └────────────┬────────────┘
                    │                                   │
          ┌─────────┴──────────┐             ┌──────────┴──────────┐
          │                    │             │                     │
       posgrados          mesa_ayuda      posgrados           mesa_ayuda
          │                    │             │                     │
    ┌─────▼─────┐        ┌─────▼──────┐ ┌───▼───────────┐ ┌──────▼────────┐
    │ Flujo RAG │        │ Flujo      │ │ Confirmación: │ │ Confirmación: │
    │ Posgrados │        │ Helpdesk   │ │ Posgrados     │ │ Mesa Ayuda    │
    └───────────┘        └────────────┘ └───────┬───────┘ └──────┬────────┘
                                                └────────┬────────┘
                                                         │
                                                 ┌───────▼───────┐
                                                 │ ¿Hay          │
                                                 │ destinatario? │
                                                 └───────┬───────┘
                                                         │ sí
                                                 ┌───────▼───────┐
                                                 │ Enviar correo │
                                                 │ escalación    │
                                                 └───────────────┘
```

---

## Nodo 1: Webhook

**Tipo:** Webhook · **Método:** POST  
**Path:** `5bb6f2fe-a13d-4ecb-ab3e-867a0c826e19`

Punto de entrada único del workflow. Recibe tanto mensajes normales de chat como eventos de escalación desde NestJS.

---

## Nodo 2: Extraer Input1

**Tipo:** Code

Normaliza el body del request (que puede venir como `body.body` o directamente en `body`). Extrae y limpia todos los campos necesarios para el resto del flujo:

| Campo extraído | Fuente | Default |
|---|---|---|
| `event` | `body.event` | `'message'` |
| `question` | `body.question \| body.message \| body.text` | `''` |
| `chatSessionId` | `body.chatSessionId \| body.sessionId` | ID generado |
| `context` | `body.context` | `'posgrados'` |
| `reason` | `body.reason` | `''` |
| `name` | `body.name` | `''` |
| `email` | `body.email` | `''` |
| `conversationId` | `body.conversationId` | `''` |
| `channelWhatsapp` | `body.channelWhatsapp` | `''` |
| `channelEmail` | `body.channelEmail` | `''` |
| `optionId` | `body.meta.optionId \| BUTTON_TO_OPTION[body.meta.button]` | `''` |
| `valid` | `question.length > 0` | `false` |

El campo `BUTTON_TO_OPTION` mapea etiquetas de botones (ej: `'💳 Pagos'`) a intents de helpdesk (ej: `'pagos'`).

---

## Nodo 3: Switch: Evento

**Tipo:** Switch

| Salida | Condición | Destino |
|---|---|---|
| `message` | `event === 'message'` | Switch: Contexto (mensaje) |
| `escalation_done` | `event === 'escalation_done'` | Switch: Contexto (escalation_done) |

---

## RAMA A — Mensajes normales (`event = 'message'`)

### Nodo A1: Switch: Contexto (mensaje)

| Salida | Condición | Destino |
|---|---|---|
| `posgrados` | `context === 'posgrados'` | If: ¿Tiene pregunta? |
| `mesa_ayuda` | `context === 'mesa_ayuda'` | Helpdesk: ¿Tiene optionId? |

---

### Sub-rama A1a — Posgrados (RAG)

```
If: ¿Tiene pregunta?
       │ valid=true          │ valid=false
       ▼                     ▼
  Call: RAG1          Responder: Vacío1
       │
  Clasificar: Ruta RAG1
       │
  Switch: Tipo de respuesta1
       │
  [16 ramas de Mensaje + Responder]
```

#### Nodo: If: ¿Tiene pregunta?

Verifica que `valid === true` (la pregunta no está vacía).  
- **Verdadero** → Call: RAG1  
- **Falso** → Responder: Vacío1 (envía `{ message: '', resolved: true }` al chat)

#### Nodo: Call: RAG1

**Tipo:** HTTP Request · **POST** `http://host.docker.internal:8000/chat`

```json
{ "question": "{{ $json.question }}", "chatSessionId": "{{ $json.chatSessionId }}" }
```

#### Nodo: Clasificar: Ruta RAG1

**Tipo:** Code

Recibe la respuesta del RAG y la mapea a un `responseType` que el siguiente Switch entiende:

| Ruta RAG | `responseType` | Descripción UI |
|---|---|---|
| `GREETING`, `THANKS`, `CAPABILITIES` | `text_simple` | Mensaje de texto simple |
| `NEED_PROGRAM`, `INSCRIPTION_NEED_PROGRAM` | `text_prompt` | Pide al usuario que especifique programa |
| `PROGRAM_SELECTED` | `chip_confirmacion` | Confirma programa con botones de detalle |
| `PROGRAM_FIELD` | `dato_exacto` | Dato puntual (duración, costo, créditos, etc.) |
| `CURRICULUM`, `CURRICULUM_SEMESTER`, `ELECTIVES`, `DEGREE_OPTIONS` | `tabla_preformateada` | Tabla de materias / malla curricular |
| `NARRATIVE_SQL` | `narrativa` | Respuesta narrativa con datos SQL |
| `DEFAULT_RAG`, `LOW_CONFIDENCE`, `PROGRAM_OVERVIEW` | `narrativa_llm` | Respuesta generada por LLM |
| `LIST_PROGRAMS`, `LIST_PROGRAMS_FILTERED` | `lista_programas` | Lista de programas con chips |
| `INSCRIPTION_LINK` | `link_accion` | Botón de enlace de inscripción |
| `PROGRAM_MINMAX` | `dato_comparativo` | Comparativo de programas |
| `NOT_FOUND`, `NARRATIVE_NOT_FOUND` | `text_aviso` | Aviso sin resultado |
| `INSCRIPTION_NO_LINK` | `text_aviso_link` | Aviso con enlace al catálogo |
| `LLM_ERROR` | `text_error` | Error del LLM |
| `OUT_OF_DOMAIN`, `INJECTION_BLOCKED` | `out_of_domain` | Fuera de dominio |
| `escalation_intent` | `escalation_intent` | Usuario quiere contacto directo |

También propaga: `resolved` (bool), `route`, `data`, `chatSessionId`, `context`.

#### Nodo: Switch: Tipo de respuesta1

Enruta a uno de los 16 nodos `Mensaje:*` según `responseType`.

#### Nodos `Mensaje:*` y `Responder:*`

Cada par construye el texto de respuesta y lo envía al chat via `POST /chat/bot-reply`.

| Par de nodos | Qué construye |
|---|---|
| **Saludo / Gracias / Capacidades** | Bienvenida con botones "Ver programas" y "Canales de contacto" |
| **Necesita programa** | Pide que especifique el programa, botón "Ver todos los programas" |
| **Programa seleccionado** | Confirmación del programa + botones de detalle (duración, costo, créditos, modalidad, malla, perfil, inscripción) |
| **Dato exacto** | Campo específico del programa + botones de detalle |
| **Tabla / Malla** | Malla curricular o electivas en formato tabla + botones de detalle |
| **Narrativa SQL** | Respuesta narrativa basada en datos estructurados + botones de detalle |
| **Narrativa LLM** | Respuesta generada por Ollama + botones de detalle |
| **Catálogo general** | Enlace al catálogo oficial + botones de filtro por tipo |
| **Lista de programas** | Lista de programas encontrados como chips seleccionables |
| **Enlace inscripción** | URL directa al formulario de inscripción del programa |
| **Dato comparativo** | Comparativo de campo entre programas (ej: el de menor duración) |
| **Aviso sin resultado** | "No encontré información" + botones de exploración |
| **Aviso con enlace** | Aviso con enlace al catálogo oficial |
| **Error LLM** | "Tuve un problema" con mensaje de reintento |
| **Fuera de dominio** | Solo respondo sobre posgrados + botón "Ver programas" |
| **Intención de contacto** | Mensaje de transición antes de iniciar el flujo de escalación |

**Todos los `Responder:*`** hacen `POST http://host.docker.internal:3225/chat/bot-reply` con header `x-api-key`.

---

### Sub-rama A1b — Mesa de Ayuda (Helpdesk)

```
Helpdesk: ¿Tiene optionId?
           │
     If: ¿Tiene optionId?
           │ true                    │ false
           ▼                         ▼
  Extraer intent              Helpdesk: Call /classify1
  de optionId                         │
           │               Helpdesk: ¿Tiene mensaje directo?
  Call /category (optionId)      │ true           │ false
           │               Responder:         Call /category (classify)
  Mensaje: Categoría (optionId)  Mensaje            │
           │               directo         Mensaje: Categoría (classify)
  Responder: Categoría (optionId)                   │
                                         Responder: Categoría (classify)
```

#### Nodo: Helpdesk: ¿Tiene optionId?

Añade `hasOption: optionId.length > 0` al JSON.

#### Nodo: If: ¿Tiene optionId?

- **Verdadero** (usuario seleccionó categoría desde un botón con `optionId`): extrae el intent directamente del `optionId` y consulta `/helpdesk/category/:intent`.
- **Falso** (usuario escribió texto libre): clasifica la pregunta llamando a `/helpdesk/classify`.

#### Ruta con optionId (intent conocido)

1. **Extraer intent de optionId** — `intent = optionId || ''`
2. **Call /category (optionId)** — `GET /helpdesk/category/:intent`
3. **Mensaje: Categoría (optionId)** — Construye mensaje con descripción + botón "📄 Ver manual" (si hay documento) + botón "🔙 Ver otras opciones"
4. **Responder: Categoría (optionId)** — `POST /chat/bot-reply`

#### Ruta con classify (texto libre)

1. **Call /classify** — `POST /helpdesk/classify` con `{ question, chatSessionId }`
   - Devuelve `{ intent, message }`.
   - Si `intent = 'saludo'` o `'desconocida'`: el campo `message` tiene texto listo para mostrar.
   - Si `intent = '<categoría>'`: `message = null`, hay que buscar la categoría.

2. **¿Tiene mensaje directo?** — verifica si `$json.message` no está vacío.
   - **Verdadero** (`saludo`, `despedida`, `desconocida`): envía el mensaje directamente via **Responder: Mensaje directo**.
   - **Falso** (intent de categoría): continúa al paso 3.

3. **Call /category (classify)** — `GET /helpdesk/category/:intent`
4. **Mensaje: Categoría (classify)** — idéntico al de optionId
5. **Responder: Categoría (classify)** — `POST /chat/bot-reply`

---

## RAMA B — Escalación completada (`event = 'escalation_done'`)

### Nodo: Switch: Contexto (escalation_done)

| Salida | Destino |
|---|---|
| `posgrados` | Confirmación: Posgrados |
| `mesa_ayuda` | Confirmación: Mesa de Ayuda1 |

### Nodos: Confirmación: Posgrados / Mesa de Ayuda1

**Tipo:** Code

Ambos construyen el mensaje de confirmación que se muestra al usuario (ya entregado por el gateway de NestJS, este nodo es para construir el payload de correo). Añaden al JSON:
- `destinatario`: valor de `channelEmail` o `null`
- `areaLabel`: `'Posgrados'` o `'Mesa de Ayuda'`
- `resolved: true`

El mensaje incluye condicionalmente los datos de contacto del canal (WhatsApp y/o email) si están configurados.

### Nodo: ¿Hay destinatario?

Verifica que `destinatario` no sea vacío antes de enviar el correo. Si es `null` (no hay email configurado para el canal), el flujo termina silenciosamente sin enviar correo.

### Nodo: Enviar correo: notificación escalado

**Tipo:** Email Send (SMTP)

| Campo | Valor |
|---|---|
| `from` | `josetobito802@gmail.com` |
| `to` | `{{ $json.destinatario }}` (email del canal de soporte) |
| `subject` | `{{ $json.areaLabel }} - Nueva solicitud via Chat Universitario` |
| `format` | HTML |

El cuerpo HTML muestra una tabla con:
- `{{ $json.name }}` — Nombre del usuario
- `{{ $json.email }}` — Correo del usuario
- `{{ $json.reason }}` — Motivo de la consulta
- `{{ $json.areaLabel }}` — Área a la que llega
- `{{ $json.conversationId }}` — ID de la conversación en DB

---

## Payload de entrada por tipo de evento

### Mensaje normal (`event = 'message'`)

```json
{
  "event": "message",
  "question": "¿Cuánto dura la maestría en educación?",
  "chatSessionId": "web-abc123",
  "context": "posgrados",
  "meta": {
    "source": "text",
    "optionId": ""
  }
}
```

### Selección de categoría helpdesk (botón con optionId)

```json
{
  "event": "message",
  "message": "Pagos",
  "chatSessionId": "web-abc123",
  "context": "mesa_ayuda",
  "meta": {
    "source": "quick_reply",
    "optionId": "pagos:menu"
  }
}
```

### Escalación completada (`event = 'escalation_done'`)

```json
{
  "event": "escalation_done",
  "chatSessionId": "web-abc123",
  "userId": "user-xyz",
  "conversationId": "uuid-de-la-conversacion",
  "context": "mesa_ayuda",
  "reason": "No puedo acceder a mi correo institucional",
  "name": "Juan Pérez",
  "email": "juan@gmail.com",
  "channelWhatsapp": "+57 300 000 0000",
  "channelEmail": "mesadeayuda@usta.edu.co"
}
```

---

## Configuración de URLs por entorno

Todas las URLs internas usan `host.docker.internal` para comunicación entre contenedores Docker:

| Servicio | URL en n8n (Docker) | URL local (dev sin Docker) |
|---|---|---|
| chat NestJS | `http://host.docker.internal:3225` | `http://localhost:3225` |
| rag-backend | `http://host.docker.internal:8000` | `http://localhost:8000` |

> Si se ejecuta n8n directamente en el host (sin Docker), cambiar `host.docker.internal` por `localhost` en todos los nodos HTTP Request.

---

## Cómo agregar una nueva ruta RAG al workflow

1. Agregar el mapeo en **Clasificar: Ruta RAG1** — añadir la nueva ruta al `TYPE_MAP`.
2. Agregar un nuevo caso en **Switch: Tipo de respuesta1**.
3. Crear el nodo **Mensaje: NuevaTipo** (Code) que construya el JSON `{ message, buttons, resolved }`.
4. Crear el nodo **Responder: NuevaTipo** (HTTP Request) con `POST /chat/bot-reply`.
5. Conectar: Switch → Mensaje → Responder.

## Cómo agregar una nueva categoría de Helpdesk

No requiere cambios en n8n. Solo crear la categoría en el panel de administración del widget (pestaña Helpdesk). El workflow consulta dinámicamente `/helpdesk/classify` y `/helpdesk/category/:intent`.
