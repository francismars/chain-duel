# Chain Duel — React Frontend

Modern React + PixiJS rewrite of the Chain Duel frontend. This is the **primary client** for the game.

**Location:** inside the `chain-duel` repository to preserve git history during migration from the legacy frontend.

**Backend:** connects to [marspay](https://github.com/francismars/marspayV2) via Socket.IO for sessions, Lightning payments, Nostr, and authoritative ONLINE play.

For the full feature guide across all components, see **[../docs/FEATURES.md](../docs/FEATURES.md)**.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure the socket URL:

```bash
cp .env.example .env
# Set VITE_SOCKET_URL (e.g. wss://marspay.chainduel.net)
```

marspay has no `/loadconfig` API. With `VITE_SOCKET_URL` set, the app connects directly. Restart the dev server after changing `.env`.

3. Start development:

```bash
npm run dev   # http://localhost:5173
```

For local backend development, run marspay on port 3001 and set `VITE_PROXY_TARGET=http://localhost:3001`. See [SETUP.md](SETUP.md).

## Features

### Game modes

| Mode | Route | Description |
|------|-------|-------------|
| **Practice — Free Play** | `/practice?play=free` | 1v1 or 4P FFA vs AI; configurable tier, power-ups, convergence. Client-only. |
| **Practice — Challenges** | `/practice?play=challenges` | 6 ranked bounty challenges (21–4,200 sats). Server-validated replays, Nostr zap payout. |
| **P2P Duel** | `/p2p` → `/gamemenu` → `/game` | 1v1 Lightning LNURL or Nostr zap buy-in. Double-or-nothing rematches. |
| **Tournament** | `/p2p` (tournament) → `/tournbracket` | 4/8/16/32-player brackets. Lightning or Nostr entry. |
| **ONLINE** | `/online/*` | Server-authoritative 2P rooms. Room browser, lobby, live play, replays, Hall of Fame. |

### Nostr & Lightning

- **NIP-07** browser extension, **NIP-46** Nostr Connect / bunker, nsec (session-only)
- **App Nostr session** — sign-in linked to socket session via marspay
- **NWC (NIP-47)** — pay ONLINE seat invoices from a configured Nostr wallet
- **LNURL-pay / LNURL-withdraw** — P2P, tournament, and post-game payout QR codes
- **NIP-57 zaps** — Nostr P2P/tournament entry, ONLINE seats, challenge bounties

### UX

- PixiJS 8 game renderer with keyboard + dual gamepad input on all menus
- Live mempool.space block feed with bonus coinbase spawns
- Background music, SFX, zap overlay animations
- Fullscreen, mute, TV-safe inset, Nostr avatar shortcut
- Highscores, About carousel, Config page

## Project structure

```
src/
├── pages/           # Route components (Index, Game, OnlineRooms, …)
├── features/        # Route-specific hooks and UI (game, practice, tournament)
├── game/            # Pure engine, Pixi render, input, audio, mempool feed
├── lib/             # Socket, config, Nostr, Lightning, challenge, online helpers
├── replay/          # ONLINE replay codec (synced with marspay)
├── contexts/        # Socket, Nostr, Audio providers
├── components/      # UI, layout, paid-entry widgets
├── shared/          # Constants, socket boundary parsers
├── types/           # socket.ts (marspay contract), schemas
├── hooks/           # useSocket, useGamepad, useKeyboardNavigation
└── styles/          # Global + page CSS
```

## Development

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Vitest |

## Tech stack

React 18, TypeScript, Vite 8, PixiJS 8, React Router 6, socket.io-client, nostr-tools, Zod, Vitest.

## Migration status

Major page migration is **complete**. Final visual/keyboard parity polish is in progress.

### Implemented

- All core routes: Index, PracticeHub, P2pEntry, GameMenu, Game, PostGame, TournamentLobby, TournamentBracket, OnlineRooms, OnlineRoomLobby, OnlineGame, OnlinePostGame
- Game engine/render/audio/io with Pixi renderer
- Socket/config via `VITE_SOCKET_URL`
- Payment-gated entry, tournament bracket flow, ONLINE multiplayer
- Nostr session (NIP-07/46), NWC, challenge bounties
- Legacy route redirects (`/local`, `/solo`, `/network/*`, etc.)

### Remaining

- Pixel-level visual parity vs legacy (see [docs/visual-parity-checklist.md](docs/visual-parity-checklist.md))
- Final keyboard/gamepad edge-case validation
- Legacy `demo` route not migrated

See [docs/parity-matrix.md](docs/parity-matrix.md) for the full legacy → React mapping.

## Documentation

| Document | Description |
|----------|-------------|
| [../docs/FEATURES.md](../docs/FEATURES.md) | Full feature guide (all components) |
| [SETUP.md](SETUP.md) | Detailed setup with marspay |
| [docs/parity-matrix.md](docs/parity-matrix.md) | Legacy page mapping |
| [docs/game-parity-checklist.md](docs/game-parity-checklist.md) | Game behavior parity |
| [docs/release-retirement-checklist.md](docs/release-retirement-checklist.md) | Release gates |
| [marspay/docs/AGENTS_ONLINE.md](../../marspay/docs/AGENTS_ONLINE.md) | ONLINE protocol |
| [marspay/docs/AGENTS_CHALLENGE_BOUNTY.md](../../marspay/docs/AGENTS_CHALLENGE_BOUNTY.md) | Challenge bounty protocol |
| [src/types/socket.ts](src/types/socket.ts) | Socket event type definitions |
