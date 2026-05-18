---
name: connectivity-review
description: >
  Review multiplayer connectivity, room sharing, Firebase Realtime Database sync,
  session persistence, reconnection handling, and the room lifecycle
  for all multiplayer-capable games in WhistAchim.
user-invocable: true
---

# Connectivity & Room Share Review Skill — WhistAchim

Audit the multiplayer infrastructure: room creation/joining, real-time game sync,
session persistence, disconnect/reconnect handling, and cross-player consistency.
Project: `C:\tmp\israeli-whist` | Live: `https://whist---elyakim.web.app`

## Usage

- `/connectivity-review` — Full multiplayer audit
- `/connectivity-review rooms` — Focus on room lifecycle (create/join/leave)
- `/connectivity-review sync` — Focus on game state synchronization
- `/connectivity-review reconnect` — Focus on disconnect/reconnect handling
- `/connectivity-review security` — Focus on Firebase rules and data validation

## Architecture Reference

### Core Multiplayer Files

| File | Purpose |
|------|---------|
| `src/multiplayer/firebase-config.ts` | Firebase init, anonymous auth, DB access |
| `src/multiplayer/room-manager.ts` | Room CRUD, player management, room lifecycle |
| `src/multiplayer/game-sync.ts` | Action publishing, subscription, replay |
| `src/multiplayer/session.ts` | Local session persistence (localStorage) |
| `src/hooks/useMultiplayerGame.ts` | React hook bridging sync to game reducer |
| `src/components/lobby/RoomLobby.tsx` | Pre-game waiting room UI |
| `src/App.tsx` | Session recovery on app mount |

### Room Data Model (Firebase RTDB)

```
/rooms/{roomId}/
  id: string              # 6-char alphanumeric code
  hostUid: string         # Firebase anonymous UID of creator
  state: 'WAITING' | 'IN_GAME' | 'FINISHED'
  gameType: GameType      # Which game to play
  numPlayers: number      # 2-8 depending on game
  createdAt: number       # timestamp
  settings?: object       # Game-specific settings
  players/
    {uid}/
      uid: string
      name: string
      seat: number        # 0 to numPlayers-1
      type: PlayerType    # HUMAN | AI | REMOTE
      ready: boolean
      connected: boolean  # Managed by onDisconnect handler
  actions/
    {pushId}/
      action: object      # Serialized game action
      uid: string         # Who published it
      seq: number         # Sequence number for ordering
      timestamp: number
      nonce: string       # Deduplication key
```

### Sync Flow

1. Host creates room → gets 6-char code
2. Others join via code → assigned seats
3. Host starts game → publishes DEAL action with seed
4. Each player subscribes to `/rooms/{roomId}/actions`
5. Actions replayed through local reducer in sequence order
6. Nonce dedup prevents double-apply of self-published actions
7. Host schedules AI turns (only host runs AI logic)

### Games with Multiplayer Support

| Game | Multiplayer Screen | Hook |
|------|-------------------|------|
| Whist | `src/MultiplayerGameScreen.tsx` | `src/hooks/useMultiplayerGame.ts` |
| Yaniv | `src/games/yaniv/components/YanivMultiplayerScreen.tsx` | `src/games/yaniv/hooks/useYanivMultiplayer.ts` |
| Quartets | `src/games/quartets/components/QuartetsMultiplayerScreen.tsx` | `src/games/quartets/hooks/useQuartetsMultiplayer.ts` |
| Shithead | `src/games/shithead/components/ShitheadMultiplayerScreen.tsx` | (uses shared pattern) |
| Israeli Rummy | `src/games/israeli-rummy/components/IsraeliRummyMultiplayerScreen.tsx` | (uses shared pattern) |
| Rummy | `src/games/rummy/components/RummyMultiplayerScreen.tsx` | (uses shared pattern) |

**Solitaire**: Single-player only — no multiplayer screen.

## Implementation Steps

### 1. Room Lifecycle Audit

Read `src/multiplayer/room-manager.ts` thoroughly. Check:

#### a. Room Creation
- [ ] `createRoom()` generates unique 6-char code (collision risk?)
- [ ] Host assigned seat 0 with `type: HUMAN`
- [ ] Room state starts as `'WAITING'`
- [ ] `onDisconnect()` handler registered for host's `connected` field
- [ ] Room metadata (gameType, numPlayers) set correctly

#### b. Room Joining
- [ ] `joinRoom(code)` validates room exists and is in `WAITING` state
- [ ] Player assigned next available seat
- [ ] Duplicate join handling (same UID rejoining)
- [ ] Room full handling (all seats taken)
- [ ] `onDisconnect()` handler registered for joining player
- [ ] Case sensitivity of room code (uppercase/lowercase)

#### c. AI Filling
- [ ] `fillWithAI()` fills empty seats with AI players
- [ ] AI players marked as `type: AI`, `connected: true`
- [ ] AI seat assignment doesn't conflict with human seats

#### d. Game Start
- [ ] Only host can start the game
- [ ] Room state transitions to `'IN_GAME'`
- [ ] All players receive the DEAL action (same seed = same deck)

#### e. Room Cleanup
- [ ] Rooms cleaned up when all players disconnect
- [ ] Stale rooms don't accumulate in Firebase
- [ ] `leaveRoom()` properly removes player and handles host transfer (if any)

### 2. Game Sync Audit

Read `src/multiplayer/game-sync.ts` thoroughly. Check:

#### a. Action Publishing
- [ ] `publishAction()` writes to `/rooms/{roomId}/actions` with push ID
- [ ] Sequence numbers increment correctly per room
- [ ] Nonce generated per action for deduplication
- [ ] `publishActionWithRetry()` handles transient failures (exponential backoff)
- [ ] Actions include `uid` of publisher for attribution

#### b. Action Subscription
- [ ] `subscribeToActions()` uses Firebase `onChildAdded` (not `onValue`)
- [ ] Actions processed in sequence order (not arrival order)
- [ ] Out-of-order actions buffered and replayed when gap filled
- [ ] Self-published actions deduplicated via nonce
- [ ] Subscription cleaned up on unmount (no memory leaks)

#### c. State Consistency
- [ ] All clients converge to same state (deterministic reducer)
- [ ] Seeded random ensures identical deck across clients
- [ ] No race conditions: only current player's client publishes their action
- [ ] Host-only operations (AI turns, trick collection) don't conflict

#### d. Edge Cases
- [ ] What happens if two clients publish simultaneously?
- [ ] What if an action references stale state (network delay)?
- [ ] What if sequence numbers have gaps?
- [ ] What if Firebase connection drops mid-action-publish?

### 3. Disconnect / Reconnect Audit

#### a. Disconnect Detection
- [ ] Firebase `onDisconnect()` marks player as `connected: false`
- [ ] Other players see "disconnected" indicator in UI
- [ ] Game pauses or continues with AI for disconnected player?
- [ ] Host disconnect: what happens? Host transfer? Game ends?

#### b. Reconnection
- [ ] `rejoinRoom()` in `room-manager.ts` — restores seat and state
- [ ] Session data in localStorage (`session.ts`): roomId, uid, seat, gameType
- [ ] `App.tsx` auto-recovery on mount (lines ~44-101)
- [ ] Page refresh: full state rebuilt from action log replay
- [ ] Tab close + reopen: session restored from localStorage
- [ ] Network flap (brief disconnect): Firebase auto-reconnects

#### c. Reconnection Edge Cases
- [ ] Reconnect after game ended — handled gracefully?
- [ ] Reconnect to room that was cleaned up — error shown?
- [ ] Multiple tabs open — session conflict?
- [ ] Different device — can rejoin with same name but new UID?
- [ ] Reconnect during your turn — can still play?

### 4. Security & Data Validation Audit

#### a. Firebase Rules
- [ ] Check if `firebase.json` or `database.rules.json` exists
- [ ] Read rules: are rooms protected? Can any user write to any room?
- [ ] Can a non-player publish actions to a room they're not in?
- [ ] Can a player modify another player's data?
- [ ] Is room deletion restricted to host?

#### b. Input Validation
- [ ] Room code validated before Firebase query
- [ ] Player name sanitized (XSS prevention)
- [ ] Action payload validated before publishing
- [ ] Sequence numbers validated server-side (if rules exist)

#### c. Abuse Scenarios
- [ ] Can someone join a room that's already in-game?
- [ ] Can someone publish invalid actions to corrupt game state?
- [ ] Can someone impersonate the host?
- [ ] Rate limiting on action publishing?
- [ ] Room code brute-force: is 6 chars enough entropy?

### 5. Per-Game Multiplayer Hook Audit

For each game's multiplayer hook/screen, check:

- [ ] Correct reducer used for action replay
- [ ] Player seat mapping correct (local player sees their hand)
- [ ] AI turns only scheduled by host
- [ ] Turn indicator shows correct current player
- [ ] Other players' hands hidden (face-down cards)
- [ ] Game end/score synced across all clients

### 6. UX of Room Sharing

#### a. Room Creation Flow
- [ ] Room code prominently displayed after creation
- [ ] Easy to copy/share room code
- [ ] Share via native share API? (mobile)
- [ ] QR code for room? (nice-to-have)
- [ ] Clear indication of waiting for players

#### b. Room Joining Flow
- [ ] Room code input: case handling, whitespace trimming
- [ ] Error messages: "Room not found", "Room full", "Game already started"
- [ ] Player list updates in real-time as others join
- [ ] Ready button or auto-start when room full?

#### c. In-Game Multiplayer UX
- [ ] Clear whose turn it is (for all players)
- [ ] Connection status indicator per player
- [ ] Latency handling: optimistic updates? Loading states?
- [ ] Chat or emoji reactions between players?
- [ ] Ability to leave game mid-match

### 7. Performance & Reliability

- [ ] Action log size: does it grow unbounded? Cleanup strategy?
- [ ] Firebase bandwidth: large game states or just actions?
- [ ] Cold start: how long to replay full action log on rejoin?
- [ ] Memory leaks: Firebase listeners cleaned up on unmount?
- [ ] Error boundaries: Firebase errors don't crash the app?

### 8. Generate Report

```markdown
## Connectivity & Room Share Audit — WhistAchim
**Date**: [date] | **Scope**: [what was audited]

### Architecture Summary
[Brief description of the multiplayer approach]

### Critical Issues (game-breaking for multiplayer)
[Issues that prevent multiplayer from working]

### Sync & Consistency Issues
[State divergence risks, race conditions]

### Reconnection Gaps
[Scenarios where reconnection fails or is broken]

### Security Concerns
[Firebase rules gaps, validation missing]

### Room UX Issues
[Usability problems in create/join/share flow]

### Multiplayer Status per Game
| Game | Create Room | Join | Sync | Reconnect | AI Host | Overall |
|------|-------------|------|------|-----------|---------|---------|

### Top 5 Critical Fixes
### Top 5 Improvements
### Security Recommendations
```

## Files to Read (Priority Order)

1. `src/multiplayer/room-manager.ts` — Room lifecycle (most critical)
2. `src/multiplayer/game-sync.ts` — Action sync (most complex)
3. `src/multiplayer/session.ts` — Session persistence
4. `src/multiplayer/firebase-config.ts` — Auth & DB init
5. `src/hooks/useMultiplayerGame.ts` — React integration
6. `src/App.tsx` (lines 1-120) — Session recovery
7. `src/components/lobby/RoomLobby.tsx` — Room UI
8. `firebase.json` — Hosting & rules config
9. Per-game multiplayer screens (see table above)
