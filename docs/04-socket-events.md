# Socket.IO Events Contract  
## One-Night Social Deduction Web App (Host + Players)

This document defines the **Socket.IO event contract** for the app. It specifies:
- event names
- direction (client → server or server → client)
- payload shapes (TypeScript-friendly)
- authorization (host-only vs any player)
- validation rules
- phase restrictions
- how updates are broadcast

Constraints:
- **No spectators**
- **Host-driven phases**
- **Server-authoritative state**
- **Public suspicion tokens**
- **In-memory game state (v1)**

---

## Conventions

### Rooms & IDs
- `roomCode`: short string (e.g., 6 chars) used to join a game room
- `playerId`: server-generated stable identifier per player within a room
- `hostPlayerId`: the playerId of the host (room creator)

### Secrets / Resume
- `resumeSecret`: random string issued by server to a player after joining
- Client stores `{ roomCode, playerId, resumeSecret }` in localStorage

### Error Handling
All client → server events may produce:
- `error` (server → client): `{ code: string, message: string }`

Recommended error codes:
- `INVALID_PAYLOAD`
- `ROOM_NOT_FOUND`
- `ROOM_FULL`
- `ROOM_IN_PROGRESS`
- `NOT_HOST`
- `NOT_ALLOWED_IN_PHASE`
- `PLAYER_NOT_FOUND`
- `INVALID_TARGET`
- `LIMIT_EXCEEDED`
- `VOTING_LOCKED`
- `ALREADY_SUBMITTED`

### State Updates
Server broadcasts authoritative state via:
- `game:update` to all sockets in the room (with private filtering as needed)

For v1 simplicity, you may broadcast full room-visible state and keep secrets out of it:
- never include other players' private roles before reveal
- never include center roles except when revealed to a specific player (seer/werewolf solo peek)

---

## Server → Client Events (Global)

### `error`
**Direction:** server → client  
**Payload:**
```ts
type ErrorPayload = { code: string; message: string };
```

### `system:toast`
**Direction:** server → client  
**Purpose:** optional UX feedback messages  
**Payload:**
```ts
type ToastPayload = { kind: "info" | "warn" | "success"; message: string };
```

### `game:update`
**Direction:** server → client  
**Purpose:** authoritative state update  
**Payload (conceptual):**
```ts
type GameUpdatePayload = {
  roomCode: string;
  you: {
    playerId: string;
    name: string;
    isHost: boolean;
    connected: boolean;
    ready: boolean;
    // your private data only:
    originalRole?: Role;
    // optional: if you allow re-view role during deal only
  };
  game: RoomPublicState;
  private?: PrivateView; // optional, per-player private info for current phase
};
```

**Notes:**
- `RoomPublicState` must not leak private roles during the game.
- `PrivateView` contains role-action results for the specific player (e.g., seer result, robber new role, insomniac final role at their step).

---

## Lobby & Session

### `room:create`
**Direction:** client → server  
**Caller:** any client (becomes host)  
**Payload:**
```ts
type RoomCreatePayload = {
  gameName?: string;
  maxPlayers: number; // 3–10
};
```
**Server actions:**
- create room + assign host player
- generate room code
- create host playerId + resumeSecret
- join socket to the room

**Server responses:**
- emit `game:update` to host socket

**Validation:**
- `maxPlayers` within range

---

### `room:join`
**Direction:** client → server  
**Caller:** any client  
**Payload:**
```ts
type RoomJoinPayload = {
  roomCode: string;
  name: string;
};
```
**Validation:**
- room exists
- phase is `lobby` (no joining after start)
- not full
- name non-empty, length limits

**Server actions:**
- create playerId + resumeSecret
- add to room
- join socket to room
- broadcast updated player list

**Server responses:**
- emit `game:update` to joining client
- emit `game:update` to room (updated public list)

---

### `session:resume`
**Direction:** client → server  
**Caller:** returning client after refresh/reconnect  
**Payload:**
```ts
type SessionResumePayload = {
  roomCode: string;
  playerId: string;
  resumeSecret: string;
};
```
**Validation:**
- room exists
- player exists
- resumeSecret matches

**Server actions:**
- reattach socket to player
- mark connected
- join socket to room

**Server responses:**
- emit `game:update` to resumed client
- broadcast `game:update` to room (connected status)

---

### `room:leave`
**Direction:** client → server  
**Caller:** any player  
**Payload:**
```ts
type RoomLeavePayload = { roomCode: string; playerId: string };
```
**Server actions (v1):**
- remove player from room if still in lobby
- if game already started:
  - mark disconnected (do not delete), or allow leave but keep vote empty
- broadcast update

**Validation:**
- player exists in room

---

### `lobby:setName`
**Direction:** client → server  
**Caller:** player in lobby  
**Payload:**
```ts
type LobbySetNamePayload = { roomCode: string; playerId: string; name: string };
```
**Validation:**
- phase is `lobby`
- name constraints

---

### `lobby:setReady`
**Direction:** client → server  
**Caller:** player in lobby or deal phase (role ack)  
**Payload:**
```ts
type LobbySetReadyPayload = { roomCode: string; playerId: string; ready: boolean };
```
**Validation:**
- allowed in `lobby` (and optionally `deal` as role ack)

---

### `host:kickPlayer`
**Direction:** client → server  
**Caller:** host only  
**Payload:**
```ts
type HostKickPlayerPayload = { roomCode: string; hostPlayerId: string; targetPlayerId: string };
```
**Validation:**
- host only
- phase `lobby` only (recommended v1)

---

## Host Settings

### `host:updateSettings`
**Direction:** client → server  
**Caller:** host only  
**Payload:**
```ts
type HostUpdateSettingsPayload = {
  roomCode: string;
  hostPlayerId: string;
  settings: {
    discussionSeconds: number;
    allowVoteChanges: boolean;
    anonymousVotes: boolean;
    showActionLogOnReveal: boolean;
    tokensEnabled: boolean;
    tokensPerPlayerLimit: number; // default 3
  };
};
```
**Validation:**
- host only
- phase `lobby` only (recommended v1)

---

### `host:updateRoles`
**Direction:** client → server  
**Caller:** host only  
**Payload:**
```ts
type HostUpdateRolesPayload = {
  roomCode: string;
  hostPlayerId: string;
  roles: Role[]; // must equal players + 3
};
```
**Validation:**
- host only
- phase `lobby` only
- role count = playerCount + 3
- roles must be from allowed set (v1): Villager, Werewolf, Minion, Seer, Robber, Troublemaker, Insomniac

---

## Phase Control

### `host:startGame`
**Direction:** client → server  
**Caller:** host only  
**Payload:**
```ts
type HostStartGamePayload = { roomCode: string; hostPlayerId: string };
```
**Validation:**
- host only
- phase `lobby`
- enough players (>=3)
- role selection valid

**Server actions:**
- transition to `deal`
- assign roles to players + center roles
- reset tokens/votes/night tracking
- broadcast `game:update`

---

### `player:ackRole`
**Direction:** client → server  
**Caller:** player  
**Payload:**
```ts
type PlayerAckRolePayload = { roomCode: string; playerId: string };
```
**Validation:**
- phase `deal`

**Server actions:**
- mark player acknowledged
- host can proceed when all acked (or override)

---

### `host:startNight`
**Direction:** client → server  
**Caller:** host only  
**Payload:**
```ts
type HostStartNightPayload = { roomCode: string; hostPlayerId: string };
```
**Validation:**
- host only
- phase `deal`
- optionally require all players acked (or allow override)

**Server actions:**
- transition to `night`
- set `nightStepRole` to first role in order
- initialize step completion tracking
- broadcast `game:update`

---

### `host:advanceNightStep`
**Direction:** client → server  
**Caller:** host only  
**Payload:**
```ts
type HostAdvanceNightStepPayload = { roomCode: string; hostPlayerId: string };
```
**Validation:**
- host only
- phase `night`

**Server actions:**
- advance `nightStepRole` in order
- when finished, transition to `discussion`
- broadcast `game:update`

---

### `host:startVoting`
**Direction:** client → server  
**Caller:** host only  
**Payload:**
```ts
type HostStartVotingPayload = { roomCode: string; hostPlayerId: string };
```
**Validation:**
- host only
- phase `discussion`

**Server actions:**
- transition to `voting`
- broadcast `game:update`

---

### `host:lockVotes`
**Direction:** client → server  
**Caller:** host only  
**Payload:**
```ts
type HostLockVotesPayload = { roomCode: string; hostPlayerId: string; locked: boolean };
```
**Validation:**
- host only
- phase `voting`

---

### `host:reveal`
**Direction:** client → server  
**Caller:** host only  
**Payload:**
```ts
type HostRevealPayload = { roomCode: string; hostPlayerId: string };
```
**Validation:**
- host only
- phase `voting` (or after votes locked)

**Server actions:**
- transition to `reveal`
- compute eliminated player(s)
- compute winners
- broadcast `game:update`

---

### `host:resetGame`
**Direction:** client → server  
**Caller:** host only  
**Payload:**
```ts
type HostResetGamePayload = { roomCode: string; hostPlayerId: string };
```
**Validation:**
- host only
- any phase (allowed), but confirms in UI

**Server actions:**
- return to `lobby`
- clear roles/currentRoles/centerRoles/night/votes/tokens
- preserve players in room if still connected
- set all ready false
- broadcast `game:update`

---

## Night Actions (Role-Specific)

All night action events:
- **host sets** which role is currently active via `nightStepRole`
- server checks that:
  - phase is `night`
  - the caller has the correct current role for this step (or original role, depending on rules; for ONUW it’s original role that determines who wakes—use originalRoles)
  - the player has not already submitted for this step
  - action payload is valid

### `night:werewolf:soloPeek`
**Caller:** werewolf who is alone  
**Payload:**
```ts
type WerewolfSoloPeekPayload = {
  roomCode: string;
  playerId: string;
  centerIndex: 0 | 1 | 2;
};
```
**Server response:**
- update player's `private` view in `game:update` with peek result

---

### `night:seer:viewPlayer`
**Payload:**
```ts
type SeerViewPlayerPayload = {
  roomCode: string;
  playerId: string;
  targetPlayerId: string;
};
```
**Server response:**
- send private result to seer: target's role at time of viewing (typically original/current depending on game rules; for simplicity use currentRoles as of that moment)

---

### `night:seer:viewCenter`
**Payload:**
```ts
type SeerViewCenterPayload = {
  roomCode: string;
  playerId: string;
  centerIndices: [0 | 1 | 2, 0 | 1 | 2]; // must be distinct
};
```

---

### `night:robber:swap`
**Payload:**
```ts
type RobberSwapPayload = {
  roomCode: string;
  playerId: string;
  targetPlayerId: string;
};
```
**Server actions:**
- swap currentRoles between robber and target
- send private result: robber's new role

---

### `night:troublemaker:swap`
**Payload:**
```ts
type TroublemakerSwapPayload = {
  roomCode: string;
  playerId: string;
  targetPlayerIds: [string, string]; // distinct, not self
};
```
**Server actions:**
- swap currentRoles of the two targets
- no private result beyond “swap complete”

---

### `night:insomniac:peekFinal`
**Payload:**
```ts
type InsomniacPeekFinalPayload = {
  roomCode: string;
  playerId: string;
};
```
**Server response:**
- send private result: player's current role at end of night

---

### `night:action:done`
**Purpose:** Generic completion when a role has no action (or after viewing)  
**Payload:**
```ts
type NightActionDonePayload = { roomCode: string; playerId: string };
```

---

## Discussion Tokens (Public)

Tokens are public to all.

### `discussion:token:add`
**Payload:**
```ts
type TokenAddPayload = { roomCode: string; playerId: string; targetPlayerId: string };
```

### `discussion:token:remove`
**Payload:**
```ts
type TokenRemovePayload = { roomCode: string; playerId: string; targetPlayerId: string };
```

### `discussion:token:clearAll`
**Payload:**
```ts
type TokenClearAllPayload = { roomCode: string; playerId: string };
```

**Validation (all token events):**
- phase is `discussion` (optionally allow during `voting` too)
- tokensEnabled true
- cannot target self
- counts cannot be negative
- total placed by player cannot exceed tokensPerPlayerLimit

**Broadcast:**
- include public token state in `game:update` so everyone sees changes live

---

## Voting

### `vote:submit`
**Payload:**
```ts
type VoteSubmitPayload = { roomCode: string; playerId: string; targetPlayerId: string };
```

**Validation:**
- phase `voting`
- target exists
- cannot vote for self (optional rule; many games allow self vote—choose and enforce consistently)
- if votes locked: reject
- if allowVoteChanges false and player already voted: reject

**Broadcast:**
- update vote progress in `game:update` (respect anonymousVotes setting)

---

## Private Data Delivery (Recommended Pattern)

To avoid leaking private info:
- The public `RoomPublicState` should never include:
  - other players' roles before reveal
  - center roles
  - private view results

Use a `private` block inside `game:update` targeted per socket.

Examples of private view:
```ts
type PrivateView =
  | { kind: "none" }
  | { kind: "werewolfSoloPeek"; centerIndex: 0|1|2; role: Role }
  | { kind: "seerViewPlayer"; targetPlayerId: string; role: Role }
  | { kind: "seerViewCenter"; center: Array<{ centerIndex: 0|1|2; role: Role }> }
  | { kind: "robberNewRole"; role: Role }
  | { kind: "insomniacFinalRole"; role: Role };
```

---

## Minimal Required Public State Fields (Suggested)

This is the data the frontend needs to render most screens:

```ts
type RoomPublicState = {
  phase: Phase;
  gameName?: string;
  maxPlayers: number;

  hostPlayerId: string;
  players: Array<{
    playerId: string;
    name: string;
    connected: boolean;
    ready: boolean;
    hasVoted?: boolean; // only during voting
  }>;

  settings: {
    discussionSeconds: number;
    allowVoteChanges: boolean;
    anonymousVotes: boolean;
    showActionLogOnReveal: boolean;
    tokensEnabled: boolean;
    tokensPerPlayerLimit: number;
  };

  // Deal tracking
  dealAcks?: Record<string, boolean>;

  // Night tracking
  night?: {
    stepRole: Role | null;
    completedThisStep: Record<string, boolean>; // only eligible players set true
    stepIndex: number;
    totalSteps: number;
  };

  // Discussion tokens (public)
  tokens?: {
    tokensByPlayer: Record<string, Record<string, number>>;
  };

  // Voting
  voting?: {
    locked: boolean;
    // if anonymousVotes true: include only counts/progress
    // else may include per-player target (optional)
    tally?: Record<string, number>;
  };

  // Reveal
  reveal?: {
    eliminatedPlayerId?: string;
    winners?: "village" | "werewolves";
    finalRoles?: Record<string, Role>;
    centerRoles?: Role[];
  };
};
```

---

## Testing Checklist (for this contract)

- Joining disabled after start
- Host-only events rejected for non-host
- Night actions rejected outside correct step
- Minion gets info but cannot mutate state
- Robber/troublemaker swaps affect final reveal
- Insomniac sees final role at end of night
- Tokens enforce limit and are visible to all
- Vote locking works
- Anonymous vote setting respected in public state
