# REST + SSE API Contract (Draft)

This document defines the server API for a server-authoritative, versioned action system using REST for commands and SSE for event streaming.

Goals:
- Deterministic replay on reconnect
- Low-latency updates
- Simple client recovery from brief disconnects

---

## Core Concepts

- **Command**: user intent sent via REST (join, ready, vote, night action).
- **Event**: server-validated outcome with a monotonically increasing `version`.
- **State**: derived from ordered events.
- **Snapshot**: compact state returned for fast catch-up.

---

## Versioning Rules

- Each game has a `version` counter (starts at 0).
- Every accepted command produces one or more events, each with a new `version`.
- Clients send `lastKnownVersion` with every command.
- If the server detects a version mismatch, it returns `409` with replay guidance.

---

## Transport

- REST: JSON over HTTPS
- SSE: `text/event-stream` with `event:` and `data:` fields
  - Public events are broadcast to all players
  - Private events are sent only on the player's authenticated SSE stream

---

## OpenAPI-Style Schemas (Informal)

```yaml
schemas:
  GameId:
    type: string
    description: "Short room code (e.g., 6 chars)"

  PlayerId:
    type: string

  Secret:
    type: string

  Phase:
    type: string
    enum: [lobby, deal, nightCountdown, night, parallelResult, discussion, voting, reveal]

  Role:
    type: string
    enum: [villager, werewolf, minion, mason, doppleganger, seer, robber, drunk, troublemaker, insomniac, tanner]

  NightAdvanceMode:
    type: string
    enum: [host, auto]
    description: "Controls whether night steps/results advance automatically or by host action."

  GameSettings:
    type: object
    required:
      - discussionSeconds
      - allowVoteChanges
      - anonymousVotes
      - showActionLogOnReveal
      - tokensEnabled
      - parallelNight
      - nightAdvanceMode
    properties:
      discussionSeconds: { type: integer, minimum: 30 }
      allowVoteChanges: { type: boolean }
      anonymousVotes: { type: boolean }
      showActionLogOnReveal: { type: boolean }
      tokensEnabled: { type: boolean }
      parallelNight: { type: boolean }
      nightAdvanceMode: { $ref: '#/schemas/NightAdvanceMode' }

  ErrorResponse:
    type: object
    required: [error, message]
    properties:
      error: { type: string }
      message: { type: string }

  CommandEnvelope:
    type: object
    required: [playerId, secret, lastKnownVersion, command]
    properties:
      playerId: { $ref: '#/schemas/PlayerId' }
      secret: { $ref: '#/schemas/Secret' }
      lastKnownVersion: { type: integer, minimum: 0 }
      command:
        oneOf:
          - $ref: '#/schemas/SetReadyCommand'
          - $ref: '#/schemas/UpdateSettingsCommand'
          - $ref: '#/schemas/UpdateRolesCommand'
          - $ref: '#/schemas/DealRolesCommand'
          - $ref: '#/schemas/AckRoleCommand'
          - $ref: '#/schemas/StartNightCommand'
          - $ref: '#/schemas/AdvanceNightStepCommand'
          - $ref: '#/schemas/NightActionCommand'
          - $ref: '#/schemas/PlaceTokenCommand'
          - $ref: '#/schemas/RemoveTokenCommand'
          - $ref: '#/schemas/ClearTokensCommand'
          - $ref: '#/schemas/StartVotingCommand'
          - $ref: '#/schemas/SubmitVoteCommand'
          - $ref: '#/schemas/LockVotesCommand'
          - $ref: '#/schemas/RevealResultsCommand'
          - $ref: '#/schemas/ResetGameCommand'

  Event:
    type: object
    required: [version, type, payload, createdAt]
    properties:
      version: { type: integer, minimum: 1 }
      type: { type: string }
      payload: { type: object }
      createdAt: { type: string, format: date-time }
```

---

## Endpoints

### Create Game
`POST /games`

Request
```json
{ "hostName": "Pat" }
```

Response `201`
```json
{
  "gameId": "ABCD",
  "host": {
    "playerId": "p_host_123",
    "name": "Pat",
    "secret": "s_host_abc"
  },
  "version": 0
}
```

---

### Join Game
`POST /games/{gameId}/join`

Request
```json
{ "name": "Kim" }
```

Response `201`
```json
{
  "playerId": "p_456",
  "name": "Kim",
  "secret": "s_456",
  "version": 0
}
```

---

### Submit Command
`POST /games/{gameId}/commands`

Request
```json
{
  "playerId": "p_456",
  "secret": "s_456",
  "lastKnownVersion": 12,
  "command": {
    "type": "SUBMIT_VOTE",
    "payload": {
      "targetPlayerId": "p_789"
    }
  }
}
```

Response `202`
```json
{
  "accepted": true,
  "appliedVersion": 13,
  "events": [
    {
      "version": 13,
      "type": "VOTE_SUBMITTED",
      "payload": {
        "voterId": "p_456",
        "targetPlayerId": "p_789"
      },
      "createdAt": "2026-02-03T12:34:56.000Z"
    }
  ]
}
```

Conflict `409`
```json
{
  "error": "VERSION_MISMATCH",
  "message": "Client is behind server state",
  "serverVersion": 15,
  "replayFromVersion": 12
}
```

---

### Get Snapshot (Public)
`GET /games/{gameId}/snapshot`

Response `200`
```json
{
  "version": 15,
  "state": {
    "phase": "discussion",
    "players": [
      { "playerId": "p_456", "name": "Kim", "alive": true }
    ],
    "publicTokens": {
      "p_456": { "p_789": 1 }
    }
  }
}
```

---

### Get Snapshot (Authenticated, with Private View)
`GET /games/{gameId}/snapshot?playerId=...&secret=...`

Response `200`
```json
{
  "version": 15,
  "state": { "phase": "night", "players": [] },
  "private": { "kind": "seerViewPlayer", "targetPlayerId": "p_123", "role": "werewolf" }
}
```

---

### Get Events Since Version
`GET /games/{gameId}/events?since=12`

Response `200`
```json
{
  "fromVersion": 12,
  "toVersion": 15,
  "events": [
    { "version": 13, "type": "VOTE_SUBMITTED", "payload": { "voterId": "p_456", "targetPlayerId": "p_789" }, "createdAt": "2026-02-03T12:34:56.000Z" },
    { "version": 14, "type": "VOTE_SUBMITTED", "payload": { "voterId": "p_111", "targetPlayerId": "p_789" }, "createdAt": "2026-02-03T12:35:02.000Z" },
    { "version": 15, "type": "PHASE_ADVANCED", "payload": { "phase": "reveal" }, "createdAt": "2026-02-03T12:35:10.000Z" }
  ]
}
```

---

### Stream Events (SSE)
`GET /games/{gameId}/stream?since=12&playerId=...&secret=...`

SSE stream
```
event: hello
data: {"serverVersion":15}

event: public
data: {"version":16,"type":"TOKEN_PLACED","payload":{"fromId":"p_456","toId":"p_789"},"createdAt":"2026-02-03T12:35:30.000Z"}

event: private
data: {"version":17,"type":"SEER_VIEW_PLAYER","payload":{"targetPlayerId":"p_123","role":"werewolf"},"createdAt":"2026-02-03T12:35:35.000Z"}

event: heartbeat
data: {"serverTime":"2026-02-03T12:35:40.000Z"}
```

Notes:
- Server should periodically emit `heartbeat` to keep connections warm.
- If `since` is too far behind (server history expired), respond with `410` and prompt a snapshot.
- `public` events are safe to apply to shared UI state.
- `private` events are only sent to the authenticated player and update private UI view.

---

## Common Error Model

```json
{
  "error": "STRING_CODE",
  "message": "Human readable detail"
}
```

Suggested codes:
- `GAME_NOT_FOUND`
- `PLAYER_NOT_FOUND`
- `UNAUTHORIZED`
- `PHASE_INVALID`
- `COMMAND_INVALID`
- `VERSION_MISMATCH`
- `HISTORY_EXPIRED`

---

## Commands (Aligned to Phases)

Lobby:
- `SET_READY`
- `UPDATE_SETTINGS` (host)
- `UPDATE_ROLES` (host)
- `START_GAME` (host)

Deal:
- `ACK_ROLE`
- `START_NIGHT` (host) → enters `nightCountdown`, then `night`

Night:
- `ADVANCE_NIGHT_STEP` (host, only when `nightAdvanceMode=host`)
- `NIGHT_ACTION` (role-specific)

Discussion:
- `PLACE_TOKEN`
- `REMOVE_TOKEN`
- `CLEAR_TOKENS`
- `START_VOTING` (host)

Voting:
- `SUBMIT_VOTE`
- `LOCK_VOTES` (host)
- `REVEAL_RESULTS` (host)

Reveal:
- `RESET_GAME` (host)

---

## Events (Aligned to State)

Lobby:
- `PLAYER_JOINED`
- `PLAYER_LEFT`
- `PLAYER_READY_CHANGED`
- `SETTINGS_UPDATED`
- `ROLES_UPDATED`

Deal:
- `GAME_STARTED`
- `ROLE_ASSIGNED` (private)
- `ROLE_ACKED`

Night:
- `NIGHT_COUNTDOWN_STARTED`
- `NIGHT_STARTED`
- `NIGHT_STEP_STARTED` (sequential only)
- `NIGHT_ACTION_RESOLVED` (private or public depending on role)
- `NIGHT_STEP_COMPLETED` (sequential only)
- `PARALLEL_RESULT_STARTED` (parallel only)
- `NIGHT_ENDED`

Discussion:
- `TOKEN_PLACED`
- `TOKEN_REMOVED`
- `TOKENS_CLEARED`
- `PHASE_ADVANCED`

Voting:
- `VOTE_SUBMITTED`
- `VOTES_LOCKED`

Reveal:
- `RESULTS_REVEALED`
- `GAME_RESET`

---

## Auth Notes (v1)

- `playerId` + `secret` required for any command.
- Secrets are server-generated on join and never change during a game.
- SSE stream should validate player identity; if missing, send `401`.

---

## Client Replay Flow (Summary)

1. Open SSE with `since=lastVersion`.
2. If SSE returns `410`, fetch `/snapshot`.
3. Apply events in order to local state.
4. On command submit, include `lastKnownVersion`.
5. If `409`, fetch `/events?since=lastKnownVersion` then retry if still relevant.

---

## UI Event Handling (Recommended)

Client maintains:
- `publicState` (from snapshot + public events)
- `privateView` (last private event)
- `lastVersion`

Suggested UI flow:
1. `GET /snapshot` and render immediately.
2. Open SSE with `since=lastVersion&playerId&secret`.
3. On `public` event: apply to `publicState`, set `lastVersion`.
4. On `private` event: update `privateView`, set `lastVersion`.
5. On `410`: refetch `/snapshot` (with auth if you want a `private` view).

SSE event types:
- `event: public` → public state updates
- `event: private` → private role/action results
- `event: hello` → server version metadata
- `event: heartbeat` → keepalive

---

## Night Progression Rules

Settings relevant to night flow:
- `parallelNight`: if true, all roles act in the same night window.
- `nightAdvanceMode`: `"host"` or `"auto"` for step/result progression.

Sequential mode (`parallelNight=false`):
- `START_NIGHT` moves to `nightCountdown`, then `night`.
- Server advances steps on host `ADVANCE_NIGHT_STEP` when `nightAdvanceMode=host`.
- Server advances steps on timer when `nightAdvanceMode=auto`.

Parallel mode (`parallelNight=true`):
- `START_NIGHT` moves to `nightCountdown`, then `night` in `parallel` mode.
- Players submit their role actions in any order during the night window.
- Server moves to `parallelResult` when:
  - host triggers `ADVANCE_NIGHT_STEP` (host mode), or
  - timer elapses (auto mode).
- Server moves from `parallelResult` to `discussion` when:
  - host triggers `ADVANCE_NIGHT_STEP` (host mode), or
  - timer elapses (auto mode).

---

## Night Actions (Expanded Roles)

New roles and actions:
- **Doppleganger**: `NIGHT_ACTION` with `kind: dopplegangerCopy` and `targetPlayerId`.
  - Server emits private `DOPPLEGANGER_COPIED_ROLE` (or `private` view with `dopplegangerCopiedRole`).
  - If the copied role has a night action, the client immediately submits that role's action during the same doppleganger step **except** insomniac: a doppleganger-insomniac acts at end of night, after the real insomniac.
- **Drunk**: `NIGHT_ACTION` with `kind: drunkSwap` and `centerIndex` (0|1|2).
  - Server swaps drunk with center role with no private reveal.
- **Tanner**: no night action.

Private view additions:
- `dopplegangerCopiedRole`
- `drunkSwapped`

---

## Tokens (Role-Count Pool)

Token pool is derived from role counts:
- One token per role in the game.
- Example: 3 villagers → 3 villager tokens; 1 seer → 1 seer token.
- This replaces per-player token limits.

Public state should expose a token pool for UI:
- `tokenPoolByRole: Record<Role, number>`
