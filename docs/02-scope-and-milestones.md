# Scope & Milestones  
## One-Night Social Deduction Web App

This document defines the **explicit scope**, **non-goals**, and **milestones** required to ship a **playable version this month**.

The priority is **reliability, clarity, and speed**, not feature completeness.

---

## Definition of “Playable”

A game is considered **playable** when a group can:

1. Create a room
2. Join on multiple phones
3. Start a game
4. Receive private roles
5. Complete the night phase without getting stuck
6. Discuss with public suspicion tokens
7. Vote
8. See correct results
9. Play again without refreshing

No crashes. No dead ends. Minor visual roughness is acceptable.

---

## In-Scope (MVP)

### Platforms
- Mobile browsers (iPhone, iPad)
- Desktop support is acceptable but not required

### Architecture
- Monorepo
- Frontend: Vite + React + TypeScript
- Backend: Node + TypeScript + Socket.IO
- Server-authoritative game state
- In-memory state (no database for v1)
- Host-driven phase advancement

---

## Roles (MVP)

Exactly **seven roles** are in scope:

1. **Villager**
   - No night action

2. **Werewolf**
   - Sees other werewolves
   - If alone, may peek at one center card

3. **Minion**
   - Sees all werewolves
   - Werewolves do *not* see the minion
   - Wins if the werewolves win

4. **Seer**
   - May view one player OR two center cards

5. **Robber**
   - Swaps role with one other player
   - Sees their new role immediately

6. **Troublemaker**
   - Swaps roles of two other players
   - Does not see resulting roles

7. **Insomniac**
   - At the end of the night, sees their **final role**

---

## Explicitly Out of Scope (v1)

- Tanner
- Hunter
- Drunk
- Any chaos / expansion roles
- Role modifiers
- Team-based voting variants

---

## Game Phases (Required)

1. Lobby
2. Deal
3. Night
4. Discussion
5. Voting
6. Reveal / Results
7. Reset / Play Again

No spectators at any point.

---

## Discussion Tokens (Required)

- Tokens are **public**
- Visible to all players
- Configurable token limit (default: 3 per player)
- Players cannot token themselves
- Tokens can be added/removed during discussion
- Tokens remain visible during voting

Tokens do **not** affect game logic or win conditions.

---

## Win Conditions (MVP)

- **Village wins**
  - At least one werewolf is eliminated

- **Werewolf team wins**
  - No werewolves are eliminated
  - Includes Minion (minion wins if werewolves win)

- **Insomniac**
  - Has no special win condition beyond their team

No alternate or special win conditions in v1.

---

## Non-Goals (Important)

These are intentionally **not included** in the initial release:

- Persistent accounts
- User authentication
- Game history or stats
- Spectator mode
- Matchmaking
- Replay / rewind
- Advanced animations
- Full soundscape (limited cues only)
- Accessibility polish beyond basic usability
- Complete parity with all physical-game expansions

---

## Milestones & Timeline

### Week 1 — Realtime Foundation & Lobby
**Goal:** Devices connect and stay in sync.

#### Deliverables
- Monorepo scaffold
- Socket.IO server running
- Room creation with code
- Player join via code
- Player list updates live
- Ready toggle
- Host can start game

#### Done When
- 3+ devices can join
- Names update live
- Host advances to next phase
- No refresh required to stay in room

---

### Week 2 — End-to-End Game Loop (Minimal Logic)
**Goal:** A complete round can be played.

#### Deliverables
- Game phases implemented
- Role dealing (server-side)
- Center roles stored
- Discussion timer
- Voting and tally
- Reveal final roles
- Play again resets game

#### Done When
- A full round completes
- Results are shown correctly
- Players return to lobby for rematch

---

### Week 3 — Night Actions & Role Logic
**Goal:** Implement all night logic correctly.

#### Deliverables
- Night phase step order:
  1. Minion
  2. Werewolves
  3. Seer
  4. Robber
  5. Troublemaker
  6. Insomniac
- Role resolvers implemented server-side
- Action validation
- Swaps correctly applied
- Final role state correct every time

#### Done When
- Minion sees correct werewolves
- Insomniac sees final role
- Swaps never desync
- Reveal always matches expected outcome

---

### Week 4 — Stability, Tokens, & Polish
**Goal:** Family-proof experience.

#### Deliverables
- Public suspicion tokens during discussion
- Token limit enforcement
- Token visibility during voting
- Basic reconnect handling
- Mobile UX polish (no scrolling on critical screens)
- Minimal sound cues with mute toggle
- Deployment to cheap hosting

#### Done When
- Family can play without guidance
- No one gets stuck after refresh
- Tokens feel intuitive and fun
- Game runs smoothly on phones

---

## Deployment Scope (v1)

- Single backend instance
- Single frontend build
- HTTPS + WebSockets
- Rooms may be lost on server restart (acceptable)

---

## Success Criteria

This project is successful when:
- It is fun with family
- It does not require explanation mid-game
- Night actions never block the game
- Voting and reveal feel satisfying
- You want to play again immediately

---

## Post-MVP (Explicitly Deferred)

- Tanner, Hunter, Drunk
- Additional expansions
- Spectator mode
- Tutorials
- Persistent accounts
- Stats and history
- Advanced sound design
