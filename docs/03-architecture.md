# Architecture  
## One-Night Social Deduction Web App (Host + Players)

This document describes the architecture for a mobile-first web app party game that supports iPhone and iPad play with a host-controlled flow, real-time sync, and server-authoritative game logic.

Key constraints:
- No spectators
- Public suspicion tokens
- Host-driven phase advancement
- In-memory state for v1 (no DB)
- Playable this month

---

## High-Level Overview

The system is a real-time multiplayer web app with two clients:
- Host UI (typically iPad, but could be any device)
- Player UI (phones)

A single Node server with REST + SSE is the source of truth for:
- rooms
- players
- roles and center cards
- night actions and swaps
- discussion tokens
- votes
- reveal/results

Clients are thin:
- render UI based on current game state
- send intent actions to the server
- never compute authoritative outcomes

---

## Tech Stack (v1)

### Frontend
- Vite + React + TypeScript
- REST + SSE client (EventSource or fetch streaming)
- Mobile-first UI (big tap targets, minimal scrolling)

### Backend
- Node.js + TypeScript
- REST for commands, SSE for events
- In-memory game state (Map keyed by room code)

### Shared Types
- packages/shared contains:
  - GameState model
  - enums (Phase, Role)
  - REST/SSE payload types

---

## Repository Structure (Monorepo)

```
werewolf/
  apps/
    web/
    server/
  packages/
    shared/
  docs/
    01-wireframes.md
    02-scope-and-milestones.md
    03-architecture.md
  docker-compose.yml
  CODEX_PROMPT.md
```

---

## Server-Authoritative Model

All game truth lives on the server.

- Server creates and mutates GameState
- Clients request actions via REST commands
- Server validates, updates state, and publishes events via SSE

---

## Game State Concepts

- originalRoles[playerId]
- currentRoles[playerId]
- centerRoles[3]

Swaps update currentRoles only.

---

## Phase State Machine

1. lobby
2. deal
3. night
4. discussion
5. voting
6. reveal
7. postgame or return to lobby

Host controls phase advancement.

---

## Night Phase Architecture

Night steps (v1 order):
1. Minion
2. Werewolf
3. Seer
4. Robber
5. Troublemaker
6. Insomniac

Server processes one role at a time.
Only eligible players act.
Host advances steps.

---

## Public Suspicion Tokens

- Active during discussion (visible during voting)
- Public to all players
- tokensByPlayer[ownerId][targetId] = count
- Enforce per-player limit (default 3)
- Cannot target self

---

## Voting Architecture

- votes[playerId] = targetPlayerId
- Vote changes allowed until host locks (configurable)
- Reveal uses final currentRoles

---

## Win Logic

- Village wins if at least one werewolf is eliminated
- Werewolf team (werewolves + minion) wins otherwise

---

## Reconnect Strategy (v1)

- Client stores roomCode, playerId, secret
- On reconnect, client opens SSE with `since=lastKnownVersion`
- If too far behind, client requests snapshot + replays events

Server restart ends rooms (acceptable v1).

---

## Deployment Notes

- Frontend: static hosting
- Backend: host supporting HTTP long-lived connections (SSE)
- HTTPS required

---

## Non-Goals

- Database persistence
- Spectator mode
- Full role expansions
- Full replay system (beyond short event history)
