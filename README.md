![image](https://github.com/francismars/chain-duel/assets/807505/a50b5185-515a-4db6-9d64-fe766f97dbfd)

# Chain Duel

**Lightning-native competitive Snake.** Chains stake sats, grow by capturing coinbases, and drain a zero-sum pool until one side hits zero. The winner takes the pot.

Play at [game.chainduel.net](https://game.chainduel.net/).

This repository is the React + PixiJS client. Paid modes, bounty challenges, and ONLINE play talk to [marspay](https://github.com/francismars/marspayV2) over Socket.IO. marspay lives in a sibling repo (`../marspay`).

The retired Express + Canvas client is in [`legacy/`](legacy/README.md). New work does not go there.

The feature guide is **[docs/FEATURES.md](docs/FEATURES.md)**.

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

With `VITE_SOCKET_URL` set, the app connects directly. Restart the dev server after changing `.env`.

3. Start development:

```bash
npm run dev   # http://localhost:5173
```

Quick play works with no backend. For local marspay, run it on port 3001 and set `VITE_PROXY_TARGET=http://localhost:3001`. See [SETUP.md](SETUP.md).

## Modes

| Mode | Route | What it is |
|------|-------|------------|
| **Quick play** | `/practice` | 1v1 (AI or local human) or four chains. Convergence is always on. Power-ups are optional. Client-only. |
| **Bounty challenges** | `/practice?play=challenges` | Six ranked runs, including 4-chain and 2v1. marspay replays the input log, then zaps the bounty. |
| **P2P duel** | `/p2p` → `/gamemenu` → `/game` | 1v1 Lightning or Nostr buy-in. Rematch and double-or-nothing. |
| **Tournament** | `/p2p` → `/tournbracket` | 4/8/16/32-player brackets. Lightning or Nostr entry. |
| **ONLINE** | `/online` | Server-authoritative 2P rooms, replays, Hall of Fame. |

Nostr sign-in is NIP-07, NIP-46 bunker, or a session-only nsec. NWC can pay an ONLINE seat. Menus take keyboard and two gamepads. Matches use PixiJS, a live mempool block feed, and pressure music that follows chain length, the shrinking board, score share, and capture streaks.

## Project structure

```
src/
├── pages/           # Routes
├── features/        # Practice, paid entry, match HUD
├── game/            # Engine, Pixi render, audio, match recipe
├── lib/             # Socket, Nostr, Lightning, challenges, ONLINE
├── replay/          # ONLINE replay codec (synced with marspay)
├── contexts/        # Socket, Nostr, Audio
├── components/      # UI, layout, paid-entry widgets
├── shared/          # Constants, socket boundary parsers
├── types/           # socket.ts (marspay contract), schemas
└── styles/
```

`legacy/` is the retired client. `docs/FEATURES.md` is the feature guide.

## Development

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Vitest |

React 18, TypeScript, Vite 8, PixiJS 8, React Router 6, socket.io-client, nostr-tools, Zod, Vitest.

Pressure-music knobs are `SHIPPED_RECIPE` in `src/game/effects/matchRecipe.ts`. Rebuild cues with `python3 scripts/audio/create-game-cues.py` and `python3 scripts/audio/create-shrink-cue.py`.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/FEATURES.md](docs/FEATURES.md) | Modes, rules, presentation, protocol links |
| [SETUP.md](SETUP.md) | Local marspay |
| [marspay/docs/AGENTS_ONLINE.md](../marspay/docs/AGENTS_ONLINE.md) | ONLINE protocol |
| [marspay/docs/AGENTS_CHALLENGE_BOUNTY.md](../marspay/docs/AGENTS_CHALLENGE_BOUNTY.md) | Challenge bounty protocol |
| [src/types/socket.ts](src/types/socket.ts) | Socket event types |

## Contributors

- [@francismars](https://github.com/francismars)
- [@pedromvpg](https://github.com/pedromvpg)

## License

[MIT](https://github.com/francismars/chain-duel/blob/main/LICENSE)
