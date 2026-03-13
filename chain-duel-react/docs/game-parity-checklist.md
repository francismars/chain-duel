# Game Page Parity Checklist

Legacy references:

- `../views/game.html`
- `../public/stylesheets/game.css`
- `../public/javascripts/game.js`
- `../public/javascripts/gamepads.js`
- `../public/javascripts/mempool.js`

React target:

- `src/pages/Game.tsx`
- `src/pages/game.css`
- `src/game/*`

## Visual Parity Contract

| Area | Legacy behavior | React status |
|---|---|---|
| Header | Fixed `CHAIN / DUEL` bar | Implemented |
| Players row | Player names + optional avatar + square indicators | Implemented |
| Game state bars | Capturing percentages + initial/current distribution bars | Implemented |
| Score row | Left/right sats and centered sponsorship badge | Implemented (minor spacing polish still in progress) |
| Canvas stage | 70vw x 35-39vw centered board with background image | Implemented |
| Bitcoin footer | Latest block fields + highlight animation on block update | Implemented |
| Zap overlay | Floating pill notifications over players row | Implemented |
| Loading overlay | Full-screen overlay with loading gif | Implemented with backend timeout fallback |
| Tournament bottom strip during match | Hidden in active gameplay | Implemented (React now keeps this hidden, matching legacy) |

## Functional Parity Contract

| Capability | Legacy behavior | React status |
|---|---|---|
| Session bootstrap | `getDuelInfos`, set names/values/mode, reveal screen | Implemented (includes local fallback boot when duel payload is missing) |
| Modes | Tournament, P2P, Practice setup behavior | Implemented |
| Start flow | `Space/Enter` starts countdown then game | Implemented |
| Core loop | Render loop + 10 fps simulation tick | Implemented |
| Collision model | Borders, self, opponent body, head-on swap collisions | Implemented |
| Coinbase capture | Capture transfer + body growth + capture percent scaling | Implemented |
| Win handling | Emit `gameFinished` exactly once, show winner text | Implemented |
| Continue routing | Winner key routes to postgame or tournament bracket | Implemented |
| Gamepad mapping | Dual controller -> keyboard semantics parity | Implemented |
| Mempool events | New block spawns reward coinbase + footer/canvas highlight + sound | Implemented |
| Zap events | Socket `zapReceived` animated overlay messages | Implemented |
| Audio cues | Countdown, capture, reset, block, background loop | Implemented |

## Acceptance Checks

- The React `/game` route renders all legacy game sections with matching ids/classes where practical.
- Score transfer math exactly mirrors legacy thresholds and min clamp (`>= 1 sat`).
- A full game can be played with keyboard only and with two gamepads.
- `gameFinished` is emitted once per match and routing behavior matches legacy winner rules.
- Block updates refresh bitcoin details, animate footer/canvas, and create reward coinbases.
- No regressions in `npm run lint` and `npm run test`.

## Open Items Before Production

- Final pixel-level visual parity pass against legacy captures (windowed + fullscreen).
- Confirm socket and mempool behavior against production backend under sustained sessions.
- Decide whether local game bootstrap fallback remains enabled in production or is guarded behind env/dev mode.
