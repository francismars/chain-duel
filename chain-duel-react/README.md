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

🚧 **In Progress** - Active migration with playable game page

### Game Page Migration Status

- `src/pages/Game.tsx` now includes a legacy-style HUD, game state bars, points row, bitcoin footer, zap overlay, and loading overlay behavior.
- `src/game/engine/*` contains headless game logic for movement, collisions, captures, scoring, and winner detection.
- `src/game/render/*` provides Pixi-first rendering with a Canvas2D fallback for environments where Pixi init is unavailable.
- `src/game/audio/*` and `src/game/io/*` handle in-game sound effects and mempool block feed behavior.

### Local Testing Mode (Temporary)

- For faster local testing, `GameMenu` and `PracticeMenu` currently allow entering `/game` without payment deposits.
- `/game` includes a local fallback bootstrap if backend duel payload is missing, so loading does not block manual testing.
- Before production release, restore mandatory payment gating and remove test bypass behavior.
