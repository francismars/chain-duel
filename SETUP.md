# Setup Instructions

## Prerequisites

- Node.js 26 (current LTS)
- **marspay** backend running (default port 3001) — required for paid modes, ONLINE, and challenge bounties

## Initial setup

1. Navigate to the project directory:

```bash
cd chain-duel
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
cd ../marspay
cp .env.example .env   # fill in LNbits + Nostr keys
npm install && npm run dev   # http://localhost:3001
```

Then in `.env`:

```
VITE_SOCKET_URL=ws://localhost:3001
VITE_PROXY_TARGET=http://localhost:3001
```

Restart the Vite dev server after changing `.env`.

## What works without marspay

- **Quick play** (`/practice`) runs entirely client-side, including Convergence
- All menu navigation and UI
- Local game rendering (with bootstrap fallback on `/game`)

Everything else — P2P, tournaments, ONLINE, challenge bounties, Nostr session — requires a running marspay instance.

## Project structure

```
chain-duel/
├── src/                # React client
├── public/             # Static assets
├── docs/FEATURES.md    # Feature guide
├── legacy/             # Retired Express client
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

- [README.md](README.md) — overview and setup
- [docs/FEATURES.md](docs/FEATURES.md) — modes, rules, and presentation
- [../marspay/docs/AGENTS_ONLINE.md](../marspay/docs/AGENTS_ONLINE.md) — ONLINE protocol
- [../marspay/docs/AGENTS_CHALLENGE_BOUNTY.md](../marspay/docs/AGENTS_CHALLENGE_BOUNTY.md) — challenge bounty protocol
