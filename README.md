![image](https://github.com/francismars/chain-duel/assets/807505/a50b5185-515a-4db6-9d64-fe766f97dbfd)

# Chain Duel

**Lightning-native competitive Snake game.** Two players stake sats, grow their on-chain snake by capturing coinbases, and compete in a zero-sum pool until one side's score hits zero. The winner takes the pooled stakes.

Play at [game.chainduel.net](https://game.chainduel.net/).

## Repository layout

This repo contains two frontends for the same game:

| Directory | Status | Description |
|-----------|--------|-------------|
| **`chain-duel-react/`** | **Active** | Modern React + PixiJS frontend — use this for development and production |
| **Root (legacy)** | Retiring | Original Express + Canvas 2D frontend |

Both frontends connect to **[marspay](https://github.com/francismars/marspayV2)** — the Lightning + Socket.IO backend that handles sessions, payments, Nostr, tournaments, and authoritative ONLINE multiplayer. marspay lives in a sibling repo (`../marspay`).

## Features

See **[docs/FEATURES.md](docs/FEATURES.md)** for the complete feature guide covering all game modes, Nostr/Lightning integration, and how the three components work together.

**Highlights:**

- **Practice** — free play against AI (1v1 or 4P FFA) and ranked **challenge bounties** (21–4,200 sats)
- **P2P duels** — Lightning LNURL or Nostr zap buy-ins, double-or-nothing rematches
- **Tournaments** — 4/8/16/32-player brackets
- **ONLINE multiplayer** — server-authoritative rooms with Lightning/Nostr seat purchase, replays, Hall of Fame
- **Nostr** — NIP-07, NIP-46 bunker, NWC wallet, profile, zap payouts
- **Live Bitcoin feed** — mempool.space block bonuses during play

## Quick start (React frontend)

```bash
cd chain-duel-react
npm install
cp .env.example .env   # set VITE_SOCKET_URL (e.g. wss://marspay.chainduel.net)
npm run dev            # http://localhost:5173
```

marspay must be running for paid/online modes. See [chain-duel-react/README.md](chain-duel-react/README.md) and [chain-duel-react/SETUP.md](chain-duel-react/SETUP.md).

## Quick start (legacy frontend)

```bash
npm install
```

Create a `.env` file in the root:

```
IP_SOCKET=[IP_OF_BACKEND_SERVER]
PORT_SOCKET=[PORT_OF_BACKEND_SERVER]
```

```bash
npm start   # http://localhost:3000
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/FEATURES.md](docs/FEATURES.md) | **Full feature guide** — game modes, architecture, Nostr/Lightning |
| [chain-duel-react/README.md](chain-duel-react/README.md) | React frontend setup and migration status |
| [chain-duel-react/docs/parity-matrix.md](chain-duel-react/docs/parity-matrix.md) | Legacy → React page mapping |
| [marspay README](../marspay/README.md) | Backend setup and API overview |
| [marspay/docs/AGENTS_ONLINE.md](../marspay/docs/AGENTS_ONLINE.md) | ONLINE mode protocol |
| [marspay/docs/AGENTS_CHALLENGE_BOUNTY.md](../marspay/docs/AGENTS_CHALLENGE_BOUNTY.md) | Challenge bounty protocol |

## Contributors

- [@francismars](https://github.com/francismars)
- [@pedromvpg](https://github.com/pedromvpg)

## License

[MIT](https://github.com/francismars/chain-duel/blob/main/LICENSE)
