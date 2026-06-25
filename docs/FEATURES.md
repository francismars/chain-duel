# Chain Duel — Features & Architecture

Chain Duel is a **Lightning-native competitive Snake game**. Players stake sats, grow their on-chain “snake” by capturing **coinbases**, and compete in a zero-sum pool until one side’s score hits zero. The winner takes the pooled stakes (minus fees).

This document describes the full feature set across the three components that make up the stack:

| Component | Path | Role |
|-----------|------|------|
| **chain-duel-react** | `chain-duel/chain-duel-react/` | Modern frontend (React + PixiJS) — **primary client** |
| **chain-duel (legacy)** | `chain-duel/` (root, excluding `chain-duel-react/`) | Original Express + Canvas frontend — being retired |
| **marspay** | `marspay/` (sibling repo) | Lightning + Socket.IO backend — sessions, payments, authoritative ONLINE play |

Production URLs: game at [game.chainduel.net](https://game.chainduel.net/), backend at `wss://marspay.chainduel.net`.

---

## Architecture

```
┌─────────────────────────┐
│  chain-duel-react       │  React 18, TypeScript, PixiJS 8, Vite
│  (Vite dev :5173)       │  Socket.IO client, nostr-tools
└───────────┬─────────────┘
            │  Socket.IO (VITE_SOCKET_URL)
            ▼
┌─────────────────────────┐
│  marspay                │  Node.js, TypeScript, Express, Socket.IO
│  (default :3001)        │  LNbits LNURL pay/withdraw, NDK (Nostr)
└───────────┬─────────────┘
            │  Webhooks
            ▼
┌─────────────────────────┐
│  LNbits                 │  Lightning invoices, LNURLp, LNURLw
└─────────────────────────┘

Legacy chain-duel (Express :3000) serves static HTML/Canvas and proxies
socket config via GET /loadconfig — same marspay backend, no new features.
```

**Division of responsibility:**

- **Frontend** — rendering, local input, menu UX, Nostr signing (NIP-07 / NIP-46), QR display
- **marspay** — session IDs, LNURL link generation, payment webhooks, Nostr Kind1 publish/subscribe, tournament brackets, challenge replay validation, **authoritative ONLINE simulation**

Shared protocol types live in `chain-duel-react/src/types/socket.ts` (must stay in sync with marspay handlers).

---

## Game Mechanics

These rules apply across practice, P2P, tournament, and ONLINE modes (ONLINE runs them server-side; other modes run locally in the browser).

### Board & movement

- **Grid:** 51 × 25 discrete cells
- **Players:** snake-like chains (head + body segments)
- **Input:** direction keys (`Up` / `Down` / `Left` / `Right`); invalid reversals are ignored based on current facing
- **ONLINE:** clients send held keys every tick via `roomInput`; server snapshots at **100 ms**

### Coinbases

Neutral objects on the grid themed around Bitcoin blocks. Eating one (head on same cell) **transfers sats from the opponent into your score**.

- **Transfer size:** percentage of the total pool, scaling with chain length — **2% → 32%** across length tiers
- **Reward tiers:** fixed values of 2 / 4 / 8 / 16 / 32 sats (mapped to mempool fee tiers)
- **Mempool bonus:** live [mempool.space](https://mempool.space) block feed spawns extra coinbases when new blocks arrive

### Collisions

Hitting a wall, your own body, enemy body, or head-to-head does **not** end the round. Affected snakes reset to spawn and capture % drops toward the minimum.

**Win condition:** either player’s score reaches **zero** (or highest score when the arena shrinks in Convergence mode).

### Game modifiers

| Modifier | Description |
|----------|-------------|
| **Power-ups** | SURGE, FREEZE, PHANTOM, AMPLIFIER, DECOY |
| **Convergence** | Border shrinks to 11×11 over time |
| **FFA (4-player)** | Four snakes; bot names include BigToshi, Nakamotor, etc. |
| **AI tiers** | normie → stacker → noderunner → sovereign (practice/challenges) |

### Economy

- Stakes become in-game points in a **zero-sum pool**
- **Payout multiplier:** 95% to winner (5% fees split: 2% host, 2% developer, 1% designer)
- Default P2P buy-in: **10,000 sats**; ONLINE buy-in range **1,000 – 1,000,000 sats**

---

## Game Modes

### Practice — Free Play (`/practice?play=free`)

Client-only, no socket required.

- 1v1 or 4-player FFA against AI
- Configurable AI tier, power-ups, convergence preset
- Session isolated in `sessionStorage` (`sessionOrigin: 'practice'`)

### Practice — Challenges / Bounty (`/practice?play=challenges`)

Server-validated practice runs with real Lightning bounties.

| Rank | Challenge | Format | AI tier | Power-ups | Bounty (sats) |
|------|-----------|--------|---------|-----------|---------------|
| 1 | NORMIE DUEL | 1v1 | normie | — | 21 |
| 2 | STACKER TRIAL | 1v1 | stacker | — | 210 |
| 3 | NODE RUNNER | 1v1 | noderunner | ✓ | 420 |
| 4 | SOVEREIGN GAUNTLET | 1v1 | sovereign | — | 1337 |
| 5 | FFA RUMBLE | 4P FFA | noderunner | — | 2100 |
| 6 | SOVEREIGN STACK | 1v1 | sovereign | ✓ | 4200 |

**Flow:** sign in with Nostr → server checks eligibility → `requestChallengeRun` (seeded RNG) → play locally with input log → `submitChallengeWin` (server replays to validate) → sign victory Kind1 → `claimChallengeBounty` → NIP-57 zap payout.

**Eligibility requirements:** NIP-05, 100+ follows, follow @chainduel, account ≥ 30 days old, LUD16 Lightning address, linked app Nostr session.

Protocol: [marspay/docs/AGENTS_CHALLENGE_BOUNTY.md](../../marspay/docs/AGENTS_CHALLENGE_BOUNTY.md)

### P2P Duel — Lightning (`/p2p` → `/gamemenu` → `/game` → `/postgame`)

Classic 1v1 with two LNURL-pay QR codes.

1. Both players scan and pay buy-in (min 3,000 sats)
2. Game runs locally in both browsers
3. Winner reports `gameFinished`; loser’s stake merges into winner’s pot
4. Post-game: LNURL-withdraw QR, rematch, **double-or-nothing**

### P2P Duel — Nostr (`/gamemenu?nostr=true`)

Same flow, but admission via Nostr Kind1 game note + zap instead of LNURL-pay QR.

### Tournament — Lightning / Nostr (`/p2p` → `/tournbracket` → `/tournlobby` → …)

Bracket tournaments for **4 / 8 / 16 / 32** players.

- Shared LNURL-pay or Nostr zap entry
- Bracket UI with loading overlay, cancel/confirm, deposit QR codes
- Multi-round winners; prize = `buy-in × players × 0.95`
- No double-or-nothing in tournament post-game

### ONLINE — Server-authoritative multiplayer (`/online/*`)

The largest new feature in chain-duel-react. Game simulation runs **on marspay**, not in the browser.

| Route | Purpose |
|-------|---------|
| `/online` | Room browser — active rooms, match history, Hall of Fame (≥ 1,000 sats buy-in) |
| `/online/r/:roomCode` | Unified room — waiting, live match, results, and replay (`?replay=1`) on one URL |

**Room lifecycle:** `lobby` → `playing` → `postgame` → `finished` / `cancelled`

**Create/join:** host sets buy-in (presets 1K / 10K / 100K); guest joins by room code; shareable invite URLs.

**Seat purchase (three paths):**

1. **Lightning (anonymous)** — LNURL-pay invoice; server auto-zaps Kind1 with ephemeral key
2. **Nostr web zap** — zap the room’s Kind1 note from a Nostr client
3. **Nostr app (PIN-zap)** — include 4-digit PIN in zap comment; or link Nostr pubkey for PIN-less zaps

**During play:** server emits `onlineRoomSnapshot` every 100 ms; clients send `roomInput`.

**Post-game:** LNURL-withdraw QR or Nostr zap to winner’s LUD16; optional double-or-nothing rematch; compact gzip replay archive (up to 3,600 frames).

**Spectators:** can join and watch without paying.

Protocol: [marspay/docs/AGENTS_ONLINE.md](../../marspay/docs/AGENTS_ONLINE.md)

---

## Nostr Integration

| Feature | Description |
|---------|-------------|
| **Sign-in modes** | NIP-07 browser extension, NIP-46 Nostr Connect / bunker, nsec (session-only) |
| **App session link** | Kind-1 challenge signed locally → `confirmAppNostrLink` on marspay |
| **Profile** | Kind-0 fetched via server (no direct client relay reads) |
| **Event publish** | Client-signed events published through marspay |
| **P2P/tournament entry** | Kind-1 game notes, nevent QR, relay probing |
| **ONLINE seat linking** | Per-room Nostr link challenge for PIN-less zaps |
| **Challenge bounty** | Signed victory Kind-1 → server publishes + NIP-57 zap |
| **NWC (NIP-47)** | Pay bolt11 invoices from online lobby via `nostr+walletconnect://` URI |

Protocol: [marspay/docs/AGENTS_NOSTR_SESSION.md](../../marspay/docs/AGENTS_NOSTR_SESSION.md)

---

## Lightning Integration

| Feature | Used in |
|---------|---------|
| **LNURL-pay (deposits)** | P2P, tournament, practice (paid), ONLINE seat purchase |
| **LNURL-withdraw (payouts)** | Post-game winner withdrawal |
| **NIP-57 zaps** | Nostr P2P/tournament entry, ONLINE seats, challenge bounties, ONLINE winner payout |
| **NWC pay_invoice** | ONLINE lobby — pay seat invoice from configured Nostr wallet |
| **Revenue splits** | Host / developer / designer percentages on non-ONLINE LNURL deposits |

---

## Other Features

| Feature | Route / location | Notes |
|---------|------------------|-------|
| **Highscores** | `/highscores` | Static JSON leaderboard |
| **About** | `/about` | 5-page carousel — game rules, sponsors, value-for-value, contribute LNURL |
| **Config / Settings** | `/config` | Nostr login, NWC wallet, host name, return-to deep links |
| **Global controls** | All pages | Fullscreen, mute, TV-safe inset, Nostr avatar shortcut |
| **Audio** | All pages | Background music + SFX |
| **Input** | All pages | Keyboard navigation on menus; dual gamepad support |
| **Sponsorship** | Various | Relai, Bitcoin Magazine, Geyser Fund branding |
| **Zap overlay** | During game | Animated zap notifications from socket events |

---

## Legacy vs React

| Feature | Legacy (`chain-duel/`) | React (`chain-duel-react/`) |
|---------|------------------------|----------------------------|
| Practice (free) | Basic local play | Free play + full config (FFA, AI tiers, power-ups, convergence) |
| Practice (bounty) | — | 6 ranked challenges with Lightning bounties |
| P2P Lightning | ✓ | ✓ |
| P2P Nostr | ✓ | ✓ (enhanced relay probing, nevent QR) |
| Tournament | ✓ | ✓ |
| **ONLINE rooms** | — | ✓ (server-authoritative) |
| NIP-46 / bunker sign-in | — | ✓ |
| App Nostr session | — | ✓ |
| NWC wallet | — | ✓ |
| Rendering | Canvas 2D | PixiJS 8 (+ canvas fallback) |
| Type safety | Vanilla JS | TypeScript + Zod |
| Tests | — | Vitest |
| Socket config | `GET /loadconfig` → env IP/PORT | `VITE_SOCKET_URL` direct |
| Build | `npm start` (Express :3000) | Vite build → static deploy |

React is the **intended replacement** for the legacy frontend. See [chain-duel-react/docs/parity-matrix.md](../chain-duel-react/docs/parity-matrix.md) for migration status.

---

## marspay Backend Features

marspay is a **reusable Lightning backend** — Chain Duel is the reference game, but the Socket.IO contract supports other staked games.

| Area | Features |
|------|----------|
| **Sessions** | Emoji-prefixed `sessionID`; reconnect restores same ID |
| **Game modes** | P2P, P2PNOSTR, PRACTICE, TOURNAMENT, TOURNAMENTNOSTR, ONLINE |
| **Lightning** | LNURLp/LNURLw via LNbits; payment/withdraw webhooks; revenue splits |
| **Nostr** | NDK relay client; Kind1 publish; zap subscription; profile/eligibility |
| **ONLINE** | Authoritative sim, room lifecycle, replay codec, archive, Hall of Fame |
| **Challenges** | Seeded replay validation, eligibility checks, bounty zaps, daily cap |
| **Admin** | `GET /dashboard?password=` — dumps in-memory state |
| **Cleanup** | 2h inactivity threshold; game history → `public/games.json` |

### Code kept in sync between repos

| Shared logic | Client | Server |
|--------------|--------|--------|
| Challenge RNG | `chain-duel-react/src/game/engine/runRng.ts` | `marspay/src/game/challengeEngine/runRng.ts` |
| ONLINE replay codec | `chain-duel-react/src/replay/codec/onlineReplayCodec.ts` | `marspay/src/state/onlineReplayCodec.ts` |
| NIP-46 relay list | `chain-duel-react/src/lib/nostr/nip46Relays.ts` | `marspay/src/consts/nostrRelays.ts` |
| Socket event types | `chain-duel-react/src/types/socket.ts` | `marspay/src/socket/index.ts` |

---

## Route Map (chain-duel-react)

| Route | Purpose |
|-------|---------|
| `/` | Main menu |
| `/practice` | Free play + challenges hub |
| `/p2p` | Paid entry hub (duel or tournament) |
| `/gamemenu` | P2P funding lobby |
| `/game` | Local / P2P / tournament match |
| `/postgame` | P2P / tournament results |
| `/tournbracket` | Tournament bracket |
| `/tournlobby` | Tournament waiting room |
| `/online` | Online room browser |
| `/online/r/:roomCode` | Online room (lobby, match, postgame, replay) |
| `/highscores` | Leaderboard |
| `/about` | Info carousel |
| `/config` | Nostr, NWC, settings |

Legacy redirects: `/local`, `/regtest`, `/testnet` → `/practice`; `/solo` → `/practice?play=challenges`; `/testnet-entry` → `/p2p`; `/network/*` → `/online/*`.

---

## Documentation Index

| Document | Location | Contents |
|----------|----------|----------|
| **This file** | `chain-duel/docs/FEATURES.md` | Full feature overview (you are here) |
| **React setup** | `chain-duel/chain-duel-react/README.md` | Dev setup, project structure, migration status |
| **React setup (detailed)** | `chain-duel/chain-duel-react/SETUP.md` | Prerequisites, marspay on :3001 |
| **Parity matrix** | `chain-duel/chain-duel-react/docs/parity-matrix.md` | Legacy page → React mapping |
| **marspay README** | `marspay/README.md` | Backend overview, setup, scripts |
| **Socket protocol** | `marspay/docs/AGENTS.md` | Sessions, reconnect, bot integration |
| **ONLINE protocol** | `marspay/docs/AGENTS_ONLINE.md` | Full ONLINE lifecycle, events, rules |
| **Nostr session** | `marspay/docs/AGENTS_NOSTR_SESSION.md` | App-level sign-in vs room link |
| **Challenge bounty** | `marspay/docs/AGENTS_CHALLENGE_BOUNTY.md` | Bounty protocol, eligibility, persistence |

---

## Development Quick Start

**Frontend (chain-duel-react):**

```bash
cd chain-duel/chain-duel-react
cp .env.example .env   # set VITE_SOCKET_URL=wss://marspay.chainduel.net
npm install && npm run dev   # http://localhost:5173
```

**Backend (marspay):**

```bash
cd marspay
cp .env.example .env   # fill LNbits + Nostr keys
npm install && npm run dev   # http://localhost:3001
```

**Legacy (optional):**

```bash
cd chain-duel
# .env: IP_SOCKET + PORT_SOCKET pointing at marspay
npm install && npm start   # http://localhost:3000
```
