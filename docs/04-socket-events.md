# REST + SSE Transport Overview
## One-Night Social Deduction Web App (Host + Players)

This document summarizes the transport model now that Socket.IO has been replaced by REST + SSE.
For full request/response and event definitions, see `docs/06-rest-sse-api.md`.

Constraints:
- **No spectators**
- **Host-driven phases**
- **Server-authoritative state**
- **Public suspicion tokens**
- **In-memory game state (v1)**

---

## Transport Summary

### REST (Commands)
- All user intent is sent as commands to `POST /games/{gameId}/commands`.
- Commands include `playerId`, `secret`, and `lastKnownVersion`.
- Server validates, applies, and returns events (or `409` on version mismatch).

### SSE (Events)
- Clients subscribe to `GET /games/{gameId}/stream?since=lastVersion`.
- Server emits ordered events with `version` and `createdAt`.
- Heartbeats keep the connection warm.

---

## Event Envelope (SSE)

Each SSE message uses a consistent envelope:
```
event: event
data: {"version":16,"type":"TOKEN_PLACED","payload":{"fromId":"p_456","toId":"p_789"},"createdAt":"2026-02-03T12:35:30.000Z"}
```

Other server messages:
- `event: hello` (initial server version)
- `event: heartbeat` (keepalive)

---

## Error Handling

REST errors use JSON:
```json
{ "error": "STRING_CODE", "message": "Human readable detail" }
```

SSE auth failures should respond with `401` before streaming.
History expiration should return `410` to force snapshot recovery.

---

## Why REST + SSE

- Commands are explicit and versioned
- Events are ordered and replayable
- Reconnect logic is simple and deterministic
