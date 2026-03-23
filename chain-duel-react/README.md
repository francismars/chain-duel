# Chain Duel - React Rewrite

Modern React + PixiJS rewrite of Chain Duel frontend.

**Location**: This project is located inside the `chain-duel` repository to maintain git history and allow gradual migration from the legacy frontend.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Socket URL: copy `.env.example` to `.env` and set `VITE_SOCKET_URL` (e.g. `wss://marspay.chainduel.net`). Marspay has no `/loadconfig` API; the legacy chain-duel Express app had that on its own server. With `VITE_SOCKET_URL` set, the app connects to the socket directly and does not call `/loadconfig`. Restart the dev server after changing `.env`.

## Project Structure

```
src/
├── types/          # TypeScript type definitions
├── lib/            # Utility libraries (socket, config)
├── components/     # Reusable React components
├── pages/          # Page components
├── game/           # Game engine and rendering
│   ├── engine/     # Pure game logic
│   ├── render/     # PixiJS rendering
│   ├── input/      # Keyboard/gamepad input
│   └── audio/       # Sound management
├── hooks/          # Custom React hooks
├── stores/         # Zustand state stores
└── styles/          # CSS styles
```

## Development

- `npm run dev` - Start dev server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Status

🚧 **In Progress** - Major page migration is implemented; final parity polish remains.

### Implemented

- Core routes implemented in React: `Index`, `TestnetHub` (regtest), `TestnetEntry`, `GameMenu`, `Game`, `PostGame`, `TournamentLobby`, `TournamentBracket`, plus online flow (`OnlineRooms`, `OnlineRoomLobby`, `OnlineGame`, `OnlinePostGame`).
- Game engine/render/audio/io stack implemented under `src/game/*` with Pixi renderer + Canvas fallback.
- Socket/config/env flow implemented (`VITE_SOCKET_URL` primary path, legacy `/loadconfig` fallback where applicable).
- Payment-gated entry logic is active (`GameMenu` requires both players funded; testnet tournament entry uses `TestnetEntry`).
- Tournament flow parity has advanced substantially:
  - `TournamentBracket` now uses legacy-style loading overlay timing, cancel/confirm flow, and stricter QR/deposit rendering behavior.
  - `Game` no longer shows the tournament bottom strip during active match flow (matching legacy hidden state).
  - `PostGame` tournament mode now hides the DoN button, shows fee split text, and uses legacy tournament prize math (`buy-in * players * 0.95`).

### Remaining / In Parity Polish

- Pixel-level visual parity pass (windowed and fullscreen) is still in progress, with the largest open deltas in `TournamentBracket` micro-layout (title/modal/logo/typography spacing) and final `Game` typography polish.
- Final keyboard/gamepad edge-case parity validation across all routes.
- Legacy `demo` view is not exposed as a React route.
- Tournament pages are functionally migrated but still need final visual sign-off against legacy screenshots.

### Notes For Testing

- `/game` still has a local bootstrap fallback if duel payload is unavailable, so loading does not hard-block local UI testing.
- Keep `VITE_SOCKET_URL` configured in `.env` for backend-integrated flows.
- For tournament payout parity, ensure backend uses fee-adjusted withdrawal math on postgame (`gross tournament pool * 0.95`) so frontend and backend totals match.
