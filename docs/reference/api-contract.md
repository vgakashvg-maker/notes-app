# API Contract Reference

Two API surfaces:

1. **PostgREST (auto-generated)** for CRUD on tables. Clients always
   authenticate with a Supabase JWT.
2. **Custom Edge Functions** for orchestrated operations (AI, calendar sync,
   OAuth token refresh, signed URLs).

## PostgREST (auto-generated)

```
GET    /rest/v1/notes?select=*&order=updated_at.desc&limit=50
POST   /rest/v1/notes                body: { title, body_json, notebook_id }
PATCH  /rest/v1/notes?id=eq.<uuid>   body: { title?, body_json?, is_pinned?, is_trashed? }
DELETE /rest/v1/notes?id=eq.<uuid>   (rare — prefer is_trashed = true)

GET    /rest/v1/notebooks?select=*
GET    /rest/v1/tags?select=*
GET    /rest/v1/events_mirror?start_at=gte.<iso>&start_at=lte.<iso>
GET    /rest/v1/ai_conversations?select=*&order=last_message_at.desc
GET    /rest/v1/ai_messages?conversation_id=eq.<uuid>&order=created_at.asc
```

## Edge Functions

| Endpoint | Method | Purpose | Module |
|---|---|---|---|
| `/functions/v1/ai/chat` | POST (SSE) | Stream chat-with-notes answer | M9 |
| `/functions/v1/ai/summarize` | POST | Summarize a note | M9 |
| `/functions/v1/ai/suggest-tags` | POST | Tag suggestions | M9 |
| `/functions/v1/ai/suggest-title` | POST | Title suggestion | M9 |
| `/functions/v1/ai/related` | POST | Related notes (vector only) | M9 |
| `/functions/v1/ai/briefing` | POST | Daily briefing | M9 |
| `/functions/v1/ai/rewrite` | POST | Inline rewrite | M9 |
| `/functions/v1/ai/test-connection` | POST | Test Ollama endpoint | M15 |
| `/functions/v1/ai/usage` | GET | Usage stats | M15 |
| `/functions/v1/embeddings/index` | POST (internal) | Re-embed a note | M10 |
| `/functions/v1/calendar/sync` | POST | Refresh events_mirror | M8 |
| `/functions/v1/calendar/create-event` | POST | Create calendar event from note | M8 |
| `/functions/v1/storage/sign` | POST | Signed URL for an attachment | M3 |
| `/functions/v1/auth/refresh-provider-token` | POST | Refresh Google tokens server-side | M2 |
| `/functions/v1/notes/bulk-update` | POST | Atomic multi-note ops | M4 |
| `/functions/v1/attachments/validate` | POST (cron) | Check for dangling refs | M7 |
| `/functions/v1/export/full` | POST | Export full corpus as zip | (future) |

## Realtime channels

Per-user channel; postgres_changes on: notes, notebooks, tags, note_tags,
attachments_refs. Clients subscribe on auth and unsubscribe on sign-out.

## Authentication

Every request to PostgREST or an Edge Function must include:

```
Authorization: Bearer <supabase_jwt>
```

The JWT is obtained from Supabase Auth (M2).

## Common response shapes

### Success
```json
{ "ok": true, "data": { ... } }
```

### Error
```json
{ "ok": false, "error": { "code": "ERR_CODE", "message": "...", "hint": "..." } }
```

### SSE event (ai/chat)
```
event: chunk
data: {"delta": "token text"}

event: citation
data: {"noteId": "uuid", "title": "..."}

event: done
data: {"conversation_id": "uuid", "tokens": {"prompt": 1200, "completion": 340}}
```
