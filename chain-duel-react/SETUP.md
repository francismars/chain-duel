# Setup Instructions

## Prerequisites

- Node.js 18+
- **marspay** backend running (default port 3001) — required for paid modes, ONLINE, and challenge bounties

## Initial setup

1. Navigate to the project directory:

```bash
cd chain-duel/chain-duel-react
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment:

```bash
cp .env.example .env
```

Set `VITE_SOCKET_URL` to your marspay instance (e.g. `wss://marspay.chainduel.net`). For local development with marspay on port 3001, also set `VITE_PROXY_TARGET=http://localhost:3001`.

4. Start the dev server:

```bash
npm run dev
```

The app runs at **http://localhost:5173**.

## Running marspay locally

In a separate terminal:

```bash
cd ../../marspay
cp .env.example .env   # fill in LNbits + Nostr keys
npm install && npm run dev   # http://localhost:3001
```

Then in `chain-duel-react/.env`:

```
VITE_SOCKET_URL=ws://localhost:3001
VITE_PROXY_TARGET=http://localhost:3001
```

Restart the Vite dev server after changing `.env`.

## What works without marspay

- **Practice — Free Play** (`/practice?play=free`) runs entirely client-side
- All menu navigation and UI
- Local game rendering (with bootstrap fallback on `/game`)

Everything else — P2P, tournaments, ONLINE, challenge bounties, Nostr session — requires a running marspay instance.

## Project structure

```
chain-duel-react/
├── src/
│   ├── pages/          # Route components
│   ├── features/       # Route-specific hooks and UI
│   ├── game/           # Engine, Pixi render, input, audio
│   ├── lib/            # Socket, config, Nostr, Lightning helpers
│   ├── replay/         # ONLINE replay codec (synced with marspay)
│   ├── contexts/       # Socket, Nostr, Audio providers
│   ├── components/     # UI and layout
│   ├── shared/         # Constants, socket parsers
│   ├── types/          # socket.ts (marspay contract)
│   └── styles/         # CSS
├── public/             # Static assets
└── index.html
```

## Development commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Vitest |

## Documentation

- [README.md](README.md) — frontend overview and features
- [../docs/FEATURES.md](../docs/FEATURES.md) — full feature guide (all components)
- [../../marspay/docs/AGENTS_ONLINE.md](../../marspay/docs/AGENTS_ONLINE.md) — ONLINE protocol
- [../../marspay/docs/AGENTS_CHALLENGE_BOUNTY.md](../../marspay/docs/AGENTS_CHALLENGE_BOUNTY.md) — challenge bounty protocol
