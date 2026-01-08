# Game State Specification (`GameState`)  
## One-Night Social Deduction Web App (v1)

This document defines the canonical **server-authoritative** game state model and related enums/types.
It is designed to be **TypeScript-friendly** and used as the source of truth for:
- server logic
- client rendering
- Socket.IO payloads (public vs private views)

Constraints:
- **No spectators**
- **Public suspicion tokens**
- **Host-driven phases**
- **In-memory rooms (v1)**
- Roles included: **Villagers, Werewolf, Minion, Seer, Robber, Troublemaker, Insomniac**

---

## Design Principles

1. **Server owns truth**: clients never send state, only intent.
2. **Public vs private**: the server should broadcast a public state and optionally attach per-socket private views.
3. **Original vs current roles**:
   - `originalRoles` determines who acts at night.
   - `currentRoles` is mutated by swaps and used for reveal/win logic.

---

## Enums

```ts
export type Phase =
  | "lobby"
  | "deal"
  | "night"
  | "discussion"
  | "voting"
  | "reveal";

export type Role =
  | "villager"
  | "werewolf"
  | "minion"
  | "seer"
  | "robber"
  | "troublemaker"
  | "insomniac";
```

---

## Constants & Derived Values

### Center Cards
- Always **3** center roles:
```ts
export type CenterIndex = 0 | 1 | 2;
```

### Night Order (v1)
```ts
export const NIGHT_ORDER: Role[] = [
  "minion",
  "werewolf",
  "seer",
  "robber",
  "troublemaker",
  "insomniac",
];
```

### Eligibility Rules (night actions)
- A player's eligibility to act for a night step is based on `originalRoles[playerId]`.
- Example: if someone is originally the robber, they act during the robber step even if later swapped.

---

## Player Model

```ts
export type Player = {
  playerId: string;
  name: string;

  // connection tracking
  connected: boolean;
  socketId?: string;

  // lobby readiness
  ready: boolean;

  // security / resume
  resumeSecret: string;

  // deal acknowledgement
  ackedRole?: boolean;

  // voting
  voteTargetPlayerId?: string | null;
};
```

Notes:
- `resumeSecret` should never be sent to other clients.
- `socketId` is server-internal and should not be broadcast.

---

## Settings

```ts
export type GameSettings = {
  discussionSeconds: number;       // e.g., 300
  allowVoteChanges: boolean;       // default true
  anonymousVotes: boolean;         // default true
  showActionLogOnReveal: boolean;  // default false (optional v1)

  // suspicion tokens
  tokensEnabled: boolean;          // default true
  tokensPerPlayerLimit: number;    // default 3
};
```

---

## Roles / Deck Selection (Lobby)

The host selects a deck of roles with size:
- `playersCount + 3`

```ts
export type RoleSelection = {
  roles: Role[]; // must equal players + 3
};
```

---

## Tokens (Public Suspicion Tokens)

Representation:
- `tokensByPlayer[ownerId][targetId] = count`

```ts
export type TokensState = {
  tokensByPlayer: Record<string, Record<string, number>>;
};
```

Constraints:
- Only valid during `discussion` (optionally allowed during `voting` if you want).
- Owner cannot target self.
- Total tokens placed by an owner ≤ `settings.tokensPerPlayerLimit`.

Derived helpers:
- `totalUsedBy(ownerId) = sum(tokensByPlayer[ownerId][*])`
- `totalOnTarget(targetId) = sum(tokensByPlayer[*][targetId])`

---

## Voting

```ts
export type VotingState = {
  locked: boolean;
  // votes[playerId] = targetPlayerId (or null)
  votesByPlayer: Record<string, string | null>;
};
```

Derived:
- `votesIn = count(votesByPlayer[playerId] != null)`
- `tally[targetPlayerId] = count(votesByPlayer == targetPlayerId)`

---

## Deal State

```ts
export type DealState = {
  // ackByPlayer[playerId] = true when the player has acknowledged their role
  ackByPlayer: Record<string, boolean>;
};
```

---

## Night State

Night requires:
- which step is active
- which players have completed for that step (only those eligible)
- optional per-player private results for current step

```ts
export type NightState = {
  stepIndex: number;           // index into NIGHT_ORDER
  stepRole: Role;              // NIGHT_ORDER[stepIndex]
  totalSteps: number;          // NIGHT_ORDER.length

  // completionByPlayer[playerId] = true if player submitted for this step
  completionByPlayer: Record<string, boolean>;

  // optional action log (host-only reveal if enabled)
  actionLog?: NightActionLogEntry[];
};
```

### Night Action Log (Optional)
Log entries should not leak private info in real-time. If enabled, store for reveal only.

```ts
export type NightActionLogEntry =
  | { kind: "minionSawWerewolves"; playerId: string; saw: string[] }
  | { kind: "werewolfSawWerewolves"; playerId: string; saw: string[] }
  | { kind: "werewolfSoloPeek"; playerId: string; centerIndex: CenterIndex; role: Role }
  | { kind: "seerViewPlayer"; playerId: string; targetPlayerId: string; role: Role }
  | { kind: "seerViewCenter"; playerId: string; center: Array<{ centerIndex: CenterIndex; role: Role }> }
  | { kind: "robberSwap"; playerId: string; targetPlayerId: string; newRole: Role }
  | { kind: "troublemakerSwap"; playerId: string; targets: [string, string] }
  | { kind: "insomniacPeek"; playerId: string; finalRole: Role };
```

---

## Roles State (Server-Authoritative)

```ts
export type RolesState = {
  // Determined at deal time
  originalRolesByPlayer: Record<string, Role>;

  // Starts equal to originalRolesByPlayer; mutated by swaps
  currentRolesByPlayer: Record<string, Role>;

  // exactly 3 center roles
  centerRoles: [Role, Role, Role];
};
```

---

## Reveal State

Reveal computes:
- vote tally
- eliminated player (single highest votes; tie behavior configurable later)
- winners

```ts
export type Winners = "village" | "werewolves";

export type RevealState = {
  // computed and then persisted during reveal phase
  tally: Record<string, number>;           // targetPlayerId -> votes
  eliminatedPlayerId?: string;             // optional if tie/no-elimination rule later
  winners: Winners;

  // final roles exposed during reveal
  finalRolesByPlayer: Record<string, Role>;
  centerRoles: [Role, Role, Role];

  // optional action log
  actionLog?: NightActionLogEntry[];
};
```

### Tie Handling (v1 recommendation)
Pick one and document it in code:
- **Option A (simple):** if tie for most votes, no one is eliminated
- **Option B (common variant):** all tied players are eliminated

For v1 family play, Option A keeps it simple.

---

## Room State (Top-Level `GameState`)

This is the canonical state stored in server memory per room.

```ts
export type GameState = {
  roomCode: string;
  gameName?: string;

  phase: Phase;

  // host
  hostPlayerId: string;

  // membership
  maxPlayers: number;
  playersById: Record<string, Player>;
  playerOrder: string[]; // preserve join order for stable UI lists

  // configuration
  settings: GameSettings;
  roleSelection: RoleSelection;

  // per-phase substates (optional depending on phase)
  deal?: DealState;
  roles?: RolesState;
  night?: NightState;
  tokens?: TokensState;
  voting?: VotingState;
  reveal?: RevealState;

  // versioning
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
};
```

---

## Public vs Private Views

### Public state (broadcast in `game:update`)
Should include:
- phase
- player list (name/connected/ready)
- settings safe to share
- night progress metadata (step index/role name MAY be hidden from players, shown to host)
- tokens (public)
- voting progress (respect anonymousVotes)
- reveal info during reveal

Should never include (before reveal):
- `originalRolesByPlayer` for other players
- `currentRolesByPlayer` for other players
- `centerRoles`
- `resumeSecret`

### Private view (per-socket, attached to `game:update`)
Use a separate object for private results:

```ts
export type PrivateView =
  | { kind: "none" }
  | { kind: "yourOriginalRole"; role: Role }
  | { kind: "minionSawWerewolves"; werewolfIds: string[] }
  | { kind: "werewolfSawWerewolves"; werewolfIds: string[] }
  | { kind: "werewolfSoloPeek"; centerIndex: CenterIndex; role: Role }
  | { kind: "seerViewPlayer"; targetPlayerId: string; role: Role }
  | { kind: "seerViewCenter"; center: Array<{ centerIndex: CenterIndex; role: Role }> }
  | { kind: "robberNewRole"; role: Role }
  | { kind: "insomniacFinalRole"; role: Role };
```

---

## Derived Helpers (Recommended)

These functions should exist server-side (pure helpers):

- `getPlayers(state): Player[]` (in join order)
- `getPlayer(state, playerId)`
- `isHost(state, playerId)`
- `isPhase(state, phase)`
- `getOriginalRole(state, playerId)`
- `getCurrentRole(state, playerId)`
- `eligiblePlayersForNightRole(state, role): string[]`
- `isPlayerAloneWerewolf(state, playerId): boolean`
- `applyRobberSwap(state, robberId, targetId)`
- `applyTroublemakerSwap(state, aId, bId)`
- `computeVoteTally(state): Record<targetId, count>`
- `computeElimination(tally): eliminatedPlayerId?`
- `computeWinners(state, eliminatedPlayerId): Winners`

---

## Notes for Codex Implementation

- Keep server state mutations centralized in a `game.ts` module.
- Keep role/action logic in `roles.ts` or `night.ts`.
- Keep all validations explicit (phase checks, host checks, id existence).
- Ensure no private info is accidentally included in the public broadcast payload.
