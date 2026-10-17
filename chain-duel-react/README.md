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

## Adaptive game audio

The active React client crossfades between four distinct pressure themes over the
original game music in local games, online matches, and replays. Each theme is
combines a treated version of the original recording with a synthesized voice.
Synth notes follow the strongest bass pitch detected in each four-beat phrase;
all layers share the original loop duration.

| Level | Sound | Live chain length | Player/team share of sats | Volume |
| --- | --- | --- | --- | --- |
| 1 · Build | Sub-bass synth heartbeat | 4+ segments | 60%+ | 22% |
| 2 · Pressure | FM synth plucks and octave sequence | 7+ segments | 75%+ | 34% |
| 3 · Tension | Wide detuned synth pad and shimmer | 11+ segments | 85%+ | 46% |
| 4 · Critical | Saturated synth lead and rapid octave pulses | 16+ segments | 95%+ | 65% |

The assets are `chain_duel_build.m4a`, `chain_duel_pressure.m4a`,
`chain_duel_tension.m4a`, and `chain_duel_critical.m4a`. Inactive themes run
silently to stay synchronized; transitions crossfade without restarting them.

Board shrinkage also raises the stage based on lost playable area: Build after
the first contraction, Pressure at 25%, Tension at 45%, and Critical at 65%.
The highest stage from board size, chain length, or score share wins. Below
level 1, only the original game track plays.

- Releases after four seconds below the current threshold, then fades gradually.
  Eliminated chains are ignored; 2v1 combines the AI teammates' scores.
- End of match: play a 6.8-second variation of `MAINNET_BLOCK.aac` as music switches
  back to the menu loop, with a subtle lower octave and diffuse stereo reverb. Pressure themes stop; menu music stays on while viewing results.
  Results routes preserve the menu loop position. Playing again restarts game
  music and re-arms the ending cue. The rest of the game UI is dimmed by a black backdrop.
- Music mute covers the game loop and all pressure themes. Full mute also covers the ending cue.

Rebuild the pressure themes and ending cue with Python 3 and ffmpeg:

```sh
python3 scripts/audio/create-game-cues.py
```

Thresholds live in `src/game/audio/tension.ts`; mixing and lifecycle behavior live
in `src/game/audio/gameAudio.ts`. The retiring root frontend is unchanged.

Board contractions play `chain_duel_shrink.m4a`, a short electronic downward
sweep, in local games and online snapshots. Warning flashes and initial snapshots
are silent; full mute also silences this effect. Regenerate it with
`python3 scripts/audio/create-shrink-cue.py`.
