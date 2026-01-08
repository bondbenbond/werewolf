# One-Night Social Deduction Web App  
## Complete Wireframes (Mobile-First, Host + Players Only)

This document defines **all screens** for a mobile-first web app party game inspired by one-night social deduction games.

- **Host** is a special role (usually on an iPad).
- **Players** join on iPhones.
- **No spectators**. Only players may join a room.
- The game is **host-driven** and **server-authoritative**.
- Suspicion tokens are **PUBLIC** and visible to all players during discussion and voting.

Each screen is defined as:

**Screen name → purpose → UI sections → primary actions → edge states**

---

## Global UI Patterns (Every Screen)

- **Top bar**
  - App name
  - Room code (when in a room)
  - Connection indicator (green / yellow / red)
- **Bottom**
  - Safe-area padding (iPhone notch / home bar)
- **Feedback**
  - Toasts: “Connected”, “Action saved”, “Host advanced phase”
- **Modals**
  - Confirmation for destructive actions (kick, reset, clear tokens)

---

# Public / Entry Flow

## 1) Welcome

**Purpose:** Choose host or join

**UI**
- Large buttons:
  - Create game (Host)
  - Join game
- Small links:
  - How to play
  - About / Credits

**Actions**
- Navigate

---

## 2) Join Game

**Purpose:** Enter room code or scan QR

**UI**
- Room code input (6 characters)
- Join button
- Scan QR button
- Back button

**Edge states**
- Invalid code
- Room full
- Room already in progress (joining disabled once game starts)

---

## 3) Create Game (Host Setup)

**Purpose:** Create a new room

**UI**
- Optional game name
- Max players stepper (3–10)
- Create room
- Back

**Edge states**
- Error creating room

---

## 4) How To Play

**Purpose:** Lightweight rules overview

**UI**
- Short explanation of phases
- Back button
- Optional link to role glossary

---

# Lobby

## 5) Host Lobby

**Purpose:** Manage players and start game

**UI**
- Room header:
  - Room code
  - Large QR code
  - Copy link button
- Player list:
  - Name
  - Connection status
  - Ready status
  - Kick button
- Settings summary:
  - Role count
  - Discussion timer
- Buttons:
  - Edit roles
  - Game settings
  - Start game (primary)

**Edge states**
- Not enough players
- Disconnected players (warning only)
- Joining disabled once game starts

---

## 6) Player Lobby

**Purpose:** Player readiness

**UI**
- Room code
- Host name (optional)
- Display name input
- Optional avatar/color picker
- Ready toggle
- Player list (names only)
- Leave room

**Edge states**
- Host changes settings (toast)
- Connection lost (reconnect banner)

---

# Role & Settings (Host)

## 7) Host: Role Selection

**Purpose:** Select roles in deck

**UI**
- Role list grouped by category
- Role card:
  - Name
  - Short description
  - Toggle include
  - Info button
- Role counter:
  - Players + center cards validation
- Validation banner for invalid count
- Buttons:
  - Randomize (optional)
  - Reset to recommended
  - Done

**Edge states**
- Invalid role count
- Role dependencies

---

## 8) Host: Game Settings

**Purpose:** Configure game behavior

**UI**
- Discussion timer picker
- Night advancement:
  - Host manual advance (default)
  - Auto-advance (optional)
- Voting:
  - Anonymous votes toggle
  - Allow vote changes toggle
- Discussion tokens:
  - Enable public suspicion tokens (on/off)
  - Token limit per player (default: 3)
- Reveal:
  - Show action log toggle
- Done button

---

## 9) Host: Role Glossary

**Purpose:** Quick reference

**UI**
- Role name
- Description
- Night order
- Back button

---

# Deal Phase

## 10) Host: Deal Confirmation

**Purpose:** Final check before dealing

**UI**
- Player list
- Selected roles summary
- Deal roles button
- Back to lobby

**Edge states**
- Player disconnected warning

---

## 11) Player: Role Reveal (Private)

**Purpose:** Show assigned role

**UI**
- Large role name and icon
- What you do at night
- What to remember
- I’m ready button
- Optional “View role again” (rules dependent)

**Edge states**
- Reconnect handling based on rules

---

## 12) Host: Deal Progress

**Purpose:** Ensure all players acknowledged

**UI**
- Progress indicator (e.g., 5/7 ready)
- Player list with checkmarks
- Start night button
- Host override option

---

# Night Phase (Host)

## 13) Host: Night Dashboard

**Purpose:** Run night actions

**UI**
- Phase header: Night
- Step indicator (e.g., Step 2 of 5: Seer)
- Current role instructions
- Progress indicator
- Buttons:
  - Advance to next role
  - Nudge players
  - End night early (confirm)

**Edge states**
- Unresponsive players
- Reconnects

---

# Night Phase (Player Wizard)

## 14) Player: Night – Waiting

**Purpose:** Non-acting players wait

**UI**
- Night in progress
- Flavor text
- Generic progress indicator
- No actions

---

## 15) Player: Night – Your Turn

**Purpose:** Notify acting player

**UI**
- “It’s your turn: [Role]”
- Short instructions
- Begin button

---

## 16) Player: Night – Werewolf

**UI**
- List of other werewolves OR “You are alone”
- Solo peek center button (if applicable)
- Done button

---

## 17) Player: Night – Seer Choice

**UI**
- View 1 player
- View 2 center cards
- Cancel (optional)

---

## 18) Player: Night – Seer View Player

**UI**
- Player list
- Confirm modal
- Result display
- Done button

---

## 19) Player: Night – Seer View Center

**UI**
- Three face-down center cards (A/B/C)
- Select two
- Confirm
- Results
- Done

---

## 20) Player: Night – Robber

**UI**
- Player list (excluding self)
- Confirm swap
- Result: new role
- Done

---

## 21) Player: Night – Troublemaker

**UI**
- Multi-select two players
- Confirm swap
- Success message
- Done

---

## 22) Player: Night – Insomniac

**UI**
- Final role reveal
- Done

---

## 23) Player: Night – No Action

**UI**
- “You have no night action”
- Continue button or passive wait

---

## 24) Player: Night – Submitted

**UI**
- Action submitted
- Waiting for others

---

# Transition to Day

## 25) Host: Night Complete

**Purpose:** End night

**UI**
- Night complete confirmation
- Checklist
- Start discussion button
- Optional debug log

---

## 26) Player: Day Begins

**UI**
- Day begins message
- Discussion timer
- Reminder bullets

---

# Discussion Phase (PUBLIC SUSPICION TOKENS)

## 27) Host: Discussion Timer + Tokens

**UI**
- Large countdown timer
- Buttons:
  - Pause
  - Add +30s
  - End discussion
- Public suspicion overview:
  - Player list with total token counts
- Start vote button

---

## 28) Player: Discussion + Public Tokens

**Purpose:** Discuss and mark suspicions

**UI**
- Discussion timer
- Player list with:
  - Player name
  - Public suspicion tokens displayed (🪙 icons)
  - + token button
  - – token button
- Token limit indicator (e.g., “2/3 used”)
- Clear all tokens button (confirm)
- Optional notes scratchpad (local only)

**Rules**
- Tokens are visible to everyone
- Players cannot token themselves
- Token placement allowed only during discussion (and optionally voting)

---

# Voting Phase

## 29) Host: Start Voting

**UI**
- Begin voting confirmation
- Toggle:
  - Show live vote counts
- Begin vote button

---

## 30) Player: Vote + Tokens

**UI**
- Vote instruction
- Player list:
  - Player name
  - Public suspicion token count
  - Vote selection highlight
- Submit vote button
- Change vote button (if allowed)

**Edge states**
- Vote locked

---

## 31) Host: Voting Dashboard

**UI**
- Vote progress indicator
- Player list with voted status
- Public suspicion token totals
- Optional live vote tally
- Buttons:
  - Lock votes
  - Reveal results

---

# Reveal / Results

## 32) Host: Reveal Controller

**UI**
- Step buttons:
  - Reveal votes
  - Reveal eliminated player
  - Reveal final roles
  - Show winners
- Skip to end

---

## 33) Player: Reveal – Votes

**UI**
- Vote tallies
- Optional personal vote highlight

---

## 34) Player: Reveal – Eliminated Player

**UI**
- Eliminated player name
- Optional suspense animation

---

## 35) Player: Reveal – Final Roles

**UI**
- Player grid with final roles
- Center cards revealed
- Optional swap highlights

---

## 36) Player: Results – Winners

**UI**
- Winning team banner
- Short explanation
- Play again
- Rematch same roles (host only)
- Change roles (host only)

---

## 37) Host: Postgame Summary

**UI**
- All results
- Optional action log
- Buttons:
  - Rematch
  - New game
  - Close room

---

# Error / Utility Screens

## 38) Connection Lost

**UI**
- Reconnecting banner
- Spinner
- Retry button
- Leave room option

---

## 39) Rejoin Room

**UI**
- Rejoining message
- Room ended message if invalid

---

## 40) Host: Kick Player Confirm

**UI**
- Confirmation modal

---

## 41) Host: Reset Game Confirm

**UI**
- Confirmation modal

---

# Optional Delight (Post-MVP)

## 42) Role Art Splash
- Brief animation on role reveal or turn start


## 44) End-of-Game Story
- Short recap of swaps and outcomes
