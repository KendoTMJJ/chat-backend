# Guía de Solución de Problemas

---

## Errores de base de datos

### `relation "X" does not exist`

**Causa:** TypeORM tiene `synchronize: false` y la tabla no fue creada manualmente.

**Solución:**
- En desarrollo: cambiar temporalmente `synchronize: true` en `database.module.ts` para que TypeORM cree las tablas, luego volver a `false`.
- En producción: crear la base de datos desde cero con el esquema correcto.

```bash
# Recrear la base de datos (ELIMINA TODOS LOS DATOS)
DROP DATABASE chat_db;
CREATE DATABASE chat_db;
# Reiniciar el servidor NestJS con synchronize: true (solo una vez)
```

---

### `ERROR: extension "vector" does not exist`

**Causa:** La extensión `pgvector` no está instalada en la instancia PostgreSQL.

**Solución:**

```sql
-- Conectado a rag_db como superusuario:
CREATE EXTENSION IF NOT EXISTS vector;
```

Si la extensión no está disponible en el servidor:

```bash
# Ubuntu / Debian
sudo apt install postgresql-15-pgvector

# Docker: usar la imagen pgvector/pgvector:pg15 en lugar de postgres:15
```

---

### `password authentication failed for user "X"`

**Causa:** Las credenciales en `.env` no coinciden con las del servidor PostgreSQL.

**Solución:** Verificar `DB_PASS` / `RAG_DB_PASS` en el archivo `.env` y comparar con los usuarios creados en PostgreSQL.

---

## Errores del RAG backend

### El servidor arranca pero no responde consultas

**Causa probable:** El modelo de embeddings (`intfloat/multilingual-e5-base`) no se descargó aún — se descarga automáticamente en el primer inicio y puede tardar varios minutos.

**Verificar en los logs:**

```
Downloading multilingual-e5-base... [████████████]
Model loaded successfully.
```

Si el log se queda detenido en la descarga, verificar la conexión a internet y el espacio en disco.

---

### `Connection refused` al llamar a Ollama

**Causa:** El servidor Ollama no está corriendo o `OLLAMA_BASE_URL` apunta a una URL incorrecta.

**Verificar:**

```bash
# ¿Está Ollama corriendo?
curl http://localhost:11434

# Dentro de Docker: usar host.docker.internal
curl http://host.docker.internal:11434
```

**Solución:**

```bash
ollama serve
```

---

### Respuestas muy lentas del chatbot (>30 segundos)

**Causa:** El modelo LLM corre en CPU. Es normal que tarde entre 15 y 60 segundos según la longitud del contexto.

**Optimizaciones:**

```bash
# Reducir hilos si el servidor tiene pocos cores
export OLLAMA_NUM_THREAD=4

# Limitar a una solicitud simultánea
export OLLAMA_NUM_PARALLEL=1
```

Ver `rag-backend/docs/OLLAMA_CPU.md` para más detalles.

---

### `INJECTION_BLOCKED` — el bot bloquea preguntas legítimas

**Causa:** El guardrail detectó la pregunta como fuera de dominio o inyección de prompt.

**Verificar:** Revisar los logs del RAG backend para ver qué señal activó el bloqueo.

**Si el falso positivo es recurrente:** Ajustar los umbrales en `src/nlp/domain_guardrail.py` o agregar la señal al dominio en `src/nlp/domain_taxonomy.py`.

---

### Error al subir Excel de posgrados

**Causa común:** El formato del archivo no coincide con el esperado por `program_excel_parser.py`.

**Verificar:**
- El archivo tiene extensión `.xlsx` (no `.xls` ni `.csv`).
- Las hojas y columnas tienen los nombres correctos según el parser.
- No hay celdas fusionadas en la fila de encabezados.

**Ver el error exacto:**

```bash
docker compose logs rag-backend | tail -50
```

---

## Errores del servidor NestJS (chat)

### El socket no conecta desde el frontend

**Causa probable 1:** CORS no configurado para el origen del frontend.

**Verificar `chat/src/chat/chat.gateway.ts`:**

```typescript
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || '*',
  },
})
```

**Causa probable 2:** `VITE_SERVER_URL` apunta a la URL incorrecta en el frontend.

---

### `401 Unauthorized` en el panel de administración

**Causa:** El token JWT expiró o fue generado con un `JWT_SECRET` diferente.

**Solución:**
1. Cerrar sesión desde el panel (botón "Salir")
2. Volver a iniciar sesión
3. Si persiste, verificar que `JWT_SECRET` no haya cambiado en el servidor

---

### El correo de recuperación de contraseña no llega

**Causas posibles:**
- Las credenciales SMTP en `.env` son incorrectas
- Gmail bloqueó el acceso — usar **contraseña de aplicación** (no la contraseña normal de Gmail)
- El correo cayó en spam

**Crear contraseña de aplicación en Gmail:**
1. Cuenta de Google → Seguridad → Verificación en dos pasos (activar)
2. Seguridad → Contraseñas de aplicaciones → Generar
3. Usar esa contraseña de 16 caracteres en `MAIL_PASS`

---

### El bot no responde (timeout en el chat)

**Causa:** El NestJS no puede alcanzar el RAG backend.

**Verificar:**

```bash
# Desde el contenedor chat:
docker exec -it chat curl http://rag-backend:8000/health

# En desarrollo local:
curl http://localhost:8000/health
```

Si falla, verificar que:
- `RAG_BASE_URL` apunta al host/puerto correcto
- `RAG_INTERNAL_API_KEY` coincide entre ambos servicios
- El RAG backend está corriendo

---

## Errores del frontend (chat-widget)

### Pantalla en blanco al abrir la aplicación

**Causa probable:** `VITE_SERVER_URL` no está configurada o apunta a un servidor inaccesible.

**En desarrollo:**

```bash
# Verificar .env
cat chat-widget/.env
# Debe contener:
# VITE_SERVER_URL=http://localhost:3225
```

**En producción (Docker):** Verificar que el `build arg` se pasó correctamente:

```bash
docker build --build-arg VITE_SERVER_URL=https://api.tu-dominio.com -t chat-widget .
```

---

### El panel admin redirige siempre a `/login`

**Causa:** El token JWT en `localStorage` expiró o no existe.

**Solución:** Iniciar sesión nuevamente. Si el problema persiste después de iniciar sesión, abrir DevTools → Application → Local Storage y verificar que existe la clave `access_token`.

---

### El chat no guarda el historial entre pestañas

**Causa esperada:** Por diseño, `userId` y `tabId` se guardan en `sessionStorage`, que es específico de cada pestaña. Al cerrar y reabrir la pestaña se generan nuevos IDs.

---

## Errores de n8n

### n8n no recibe eventos del chat

**Causa probable:** `N8N_API_KEY` incorrecta o `N8N_BASE_URL` no accesible desde el servidor NestJS.

**Verificar en los logs del NestJS:**

```
[N8nService] Failed to trigger workflow: ...
```

**Solución:** Verificar las variables `N8N_BASE_URL` y `N8N_API_KEY` en el `.env` del servicio `chat`.

---

### El correo de escalación llega sin nombre o email

**Causa:** El nodo "Extraer Input1" del workflow n8n usa campos incorrectos.

**Verificar:** Los campos en el cuerpo del webhook deben ser `name` y `email` (no `nombre` ni `correo`). Ver `chat/docs/N8N_WORKFLOW.md` para la referencia completa.

---

## Comandos útiles de diagnóstico

```bash
# Ver logs de todos los servicios
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f rag-backend
docker compose logs -f chat
docker compose logs -f chat-widget

# Reiniciar un servicio
docker compose restart chat

# Ver el estado de los contenedores
docker compose ps

# Entrar a un contenedor
docker exec -it chat sh

# Ver uso de recursos
docker stats

# Verificar conectividad entre contenedores
docker exec chat ping postgres-chat
docker exec rag-backend ping postgres-rag
```

---

## Reinicio completo del sistema (último recurso)

```bash
# Detener todo
docker compose down

# Eliminar volúmenes (ELIMINA TODOS LOS DATOS)
docker compose down -v

# Reconstruir y reiniciar
docker compose build
docker compose up -d
```
