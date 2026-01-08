# Codex Prompt — One Night Social Deduction Web App

You are implementing a mobile-first web app party game (host + players) inspired by one-night social deduction games.

Core constraints:
- No spectators
- Host-driven phases
- Server-authoritative state
- Public suspicion tokens during discussion (and visible during voting)
- In-memory rooms for v1 (no DB)
- Target: playable this month

Tech:
- Monorepo
- apps/web: Vite + React + TypeScript
- apps/server: Node + TypeScript + Socket.IO
- packages/shared: shared types (Phase, Role, GameState, Socket payload types)

Docs (source of truth):
- docs/01-wireframes.md
- docs/02-scope-and-milestones.md
- docs/03-architecture.md
- docs/04-socket-events.md
- docs/05-game-state.md

Implementation rules:
- Never trust client state; only accept intent.
- Do not leak private roles in public broadcasts before reveal.
- Joining is disabled once the game starts (no spectators, no late joins).
- Keep UI dead simple and phone-friendly: big buttons, minimal scrolling.

Definition of done for each task:
- Feature works end-to-end using 3+ browser tabs simulating multiple devices.
- Server validates inputs and emits game:update correctly.
