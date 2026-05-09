# Esquema de Base de Datos — chat_db

Base de datos PostgreSQL gestionada por TypeORM con `synchronize: false`.  
Los cambios al esquema requieren migración manual o recreación de la DB.

---

## Tabla `Conversations`

Representa una sesión de chat. Se crea cuando el usuario escala su consulta.

| Columna | Tipo | Nullable | Descripción |
|---|---|---|---|
| `id` | UUID (PK) | No | Identificador único generado por la DB |
| `user_id` | VARCHAR | Sí | ID del usuario (generado en el navegador) |
| `name` | VARCHAR | Sí | Nombre completo del usuario (capturado en escalación) |
| `email` | VARCHAR | Sí | Correo del usuario (capturado en escalación) |
| `title` | VARCHAR | Sí | Motivo de la consulta (descripción breve) |
| `context` | VARCHAR | Sí | `posgrados` o `mesa_ayuda` |
| `status` | ENUM | No | `active`, `closed`, `expired`, `escalated` |
| `started_at` | TIMESTAMP | No | Fecha de creación (auto) |
| `last_activity_at` | TIMESTAMP | No | Última actualización (auto) |

**Índices importantes:**
- `userId + status` — usado para buscar conversaciones activas por usuario
- `lastActivityAt DESC` — para listar conversaciones recientes

---

## Tabla `Messages`

Mensajes individuales de una conversación. Se eliminan en cascada al borrar la conversación.

| Columna | Tipo | Nullable | Descripción |
|---|---|---|---|
| `id` | UUID (PK) | No | Identificador único |
| `user_id` | VARCHAR | No | ID del autor (o `'bot'` para mensajes del bot) |
| `sender` | VARCHAR | No | `'user'` o `'bot'` |
| `message` | TEXT | Sí | Contenido del mensaje (markdown) |
| `created_at` | TIMESTAMP | No | Fecha de creación (auto) |
| `conversation_id` | UUID (FK) | No | Referencia a `Conversations.id` |

**Relaciones:** `conversation_id` → `Conversations.id` ON DELETE CASCADE

---

## Tabla `SupportChannels`

Canales de contacto configurados por el administrador. El gateway los consulta al finalizar una escalación para mostrar los datos de contacto al usuario y notificar por n8n.

| Columna | Tipo | Nullable | Descripción |
|---|---|---|---|
| `id` | UUID (PK) | No | Identificador único |
| `context` | ENUM | No | `posgrados` o `mesa_ayuda` |
| `intent` | VARCHAR | Sí | Intent de helpdesk al que aplica (null = canal por defecto del contexto) |
| `whatsapp` | VARCHAR | Sí | Número de WhatsApp con formato internacional |
| `email` | VARCHAR | Sí | Correo electrónico del área |
| `is_default` | BOOLEAN | No | Si es el canal por defecto del contexto |

**Lógica de resolución de canal** (`SupportChannelsService.findByContextAndIntent`):
1. Busca canal con `context + intent` exacto.
2. Si no encuentra, busca canal con `context + isDefault = true`.
3. Si no encuentra, devuelve `null` (no se muestran datos de contacto).

---

## Tabla `Admins`

Administradores del panel. Se crea el primer admin al arrancar el servidor si no existe.

| Columna | Tipo | Nullable | Descripción |
|---|---|---|---|
| `id` | UUID (PK) | No | Identificador único |
| `email` | VARCHAR | No (unique) | Correo de acceso |
| `password` | VARCHAR | No | Hash bcrypt de la contraseña |
| `name` | VARCHAR | Sí | Nombre para mostrar |
| `reset_token` | VARCHAR | Sí | Token temporal para reset de contraseña |
| `reset_token_expiry` | TIMESTAMP | Sí | Expiración del token de reset |

---

## Notas

- **`synchronize: false`**: TypeORM NO modifica el esquema automáticamente. Si se agrega una columna a una entidad, se debe correr una migración SQL manualmente.
- **`SnakeNamingStrategy`**: TypeORM convierte automáticamente los nombres de propiedades camelCase a snake_case para las columnas. Ej: `lastActivityAt` → `last_activity_at`.
- **Recrear la DB en desarrollo**: eliminar y crear nuevamente la base de datos. TypeORM creará todas las tablas al arrancar si `synchronize: true` (solo usar en desarrollo).
