# Legacy Parity Matrix

This matrix maps legacy pages/scripts to React pages and tracks parity status.

## Legend

- `Complete`: behavior and visual parity implemented
- `In progress`: migrated but parity gaps remain
- `Not started`: placeholder only

## Page Mapping

| Legacy view | Legacy script | React page | Status | Primary gaps |
|---|---|---|---|---|
| `views/index.html` | `public/javascripts/index.js` | `src/pages/Index.tsx` | In progress | Final responsive/spacing parity and full input edge-path sweep |
| `views/config.html` | `public/javascripts/config.js` | `src/pages/Config.tsx` | In progress | Validation/error microcopy and spacing parity sweep |
| `views/highscores.html` | `public/javascripts/highscores.js` | `src/pages/Highscores.tsx` | In progress | Pagination/row typography fine-tuning |
| `views/about.html` | `public/javascripts/about.js` | `src/pages/About.tsx` | In progress | Text block spacing and responsive wrap parity |
| `views/practicemenu.html` | `public/javascripts/practicemenu.js` | `src/pages/PracticeMenu.tsx` | In progress | Minor visual parity and timeout-state polish |
| `views/gamemenu.html` | `public/javascripts/gameMenu.js` | `src/pages/GameMenu.tsx` | In progress | NOSTR variant parity and remaining keyboard/controller edge paths |
| `views/game.html` | `public/javascripts/game.js` | `src/pages/Game.tsx` | In progress | Final pixel parity (windowed/fullscreen) and overlay typography polish; tournament bottom-strip hidden-state parity now aligned |
| `views/postgame.html` | `public/javascripts/postGame.js` | `src/pages/PostGame.tsx` | In progress | Final visual parity and withdrawal-path edge states; tournament payout/fees/DoN visibility behavior aligned with legacy |
| `views/tournprefs.html` | `public/javascripts/tournprefs.js` | `src/pages/TournamentPrefs.tsx` | In progress | Final spacing/input parity verification |
| `views/tournlobby.html` | `public/javascripts/tournlobby.js` | `src/pages/TournamentLobby.tsx` | In progress | Lobby claim/proceed edge-state verification |
| `views/tournbracket.html` | `public/javascripts/tournbracket.js` | `src/pages/TournamentBracket.tsx` | In progress | Final micro-layout parity (title/modal/logo/label spacing) and remaining keyboard/controller sweep |
| `views/demo.html` | `public/javascripts/demo.js` | _No React route_ | Not started | Demo route/page not migrated |

## Shared Contract Parity

| Area | Status | Notes |
|---|---|---|
| Socket event typing (`src/types/socket.ts`) | In progress | Broadly typed; continue tightening mode-specific contracts |
| Runtime validation (`src/lib/socketValidation.ts`) | In progress | In use on game flows; extend consistently across all socket handlers |
| Config loading (`src/lib/config.ts`) | In progress | Env-first socket URL path implemented; fallback UX still polishable |
| Socket lifecycle (`src/hooks/useSocket.ts`) | In progress | Stable in current usage; needs longer-session soak tests |
| Tournament payout contract (frontend/backend) | In progress | Frontend postgame formula aligned to legacy; backend must apply tournament withdrawal fee (`*0.95`) for full parity |

## CSS Parity

| Legacy CSS | React CSS | Status |
|---|---|---|
| `public/stylesheets/style.css` | `src/styles/index.css` | In progress |
| `public/stylesheets/practicemenu.css` | `src/pages/practicemenu.css` + `src/components/layout/game-setup.css` | In progress |
| `public/stylesheets/gameMenu.css` | `src/pages/gamemenu.css` + `src/components/layout/game-setup.css` | In progress |
| `public/stylesheets/game.css` | `src/pages/game.css` | In progress |
| tournament/postgame css files | page css equivalents | In progress |

## Acceptance Checklist (Per Page)

- Route path parity
- DOM section parity (`header`, main rules, bottom panel, overlays)
- Keyboard parity (WASD, arrows, enter/space)
- Controller parity
- Socket emit/receive parity
- Loading + error + timeout behavior parity
- Responsive layout parity at desktop and mobile breakpoints
