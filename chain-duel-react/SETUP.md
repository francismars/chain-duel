# Setup Instructions

## Prerequisites

- Node.js 18+ installed
- Backend server (`marspayTS`) should be running on port 3000

## Initial Setup

1. Navigate to the project directory:
```bash
cd chain-duel/chain-duel-react
```

2. Install dependencies:
```bash
npm install
```

3. Verify the setup works:
```bash
npm run dev
```

The dev server should start on `http://localhost:5173`

## Project Structure

```
chain-duel-react/
├── src/
│   ├── types/          # TypeScript type definitions (socket events, game types)
│   ├── lib/            # Utility libraries
│   │   ├── socket.ts   # Socket.io client wrapper
│   │   └── config.ts   # Config loader
│   ├── components/     # Reusable React components
│   │   ├── ui/         # UI components (buttons, inputs, etc.)
│   │   └── layout/     # Layout components
│   ├── pages/          # Page components (routes)
│   ├── game/           # Game engine and rendering
│   │   ├── engine/     # Pure game logic (no React, no rendering)
│   │   ├── render/     # PixiJS rendering
│   │   ├── input/      # Keyboard/gamepad input handling
│   │   └── audio/       # Sound management
│   ├── hooks/          # Custom React hooks
│   ├── stores/         # Zustand state stores
│   └── styles/         # CSS styles
├── public/             # Static assets
└── index.html          # Entry HTML file
```

## Next Steps

Phase 1.1 is complete! Next up:
- Phase 2: Type definitions & socket layer
- Phase 3: UI pages migration
- Phase 4: Game engine with PixiJS

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
