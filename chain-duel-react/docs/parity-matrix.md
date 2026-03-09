# Legacy Parity Matrix

This matrix maps legacy pages/scripts to React pages and tracks parity status.

## Legend

- `Complete`: behavior and visual parity implemented
- `In progress`: migrated but parity gaps remain
- `Not started`: placeholder only

## Page Mapping

| Legacy view | Legacy script | React page | Status | Primary gaps |
|---|---|---|---|---|
| `views/index.html` | `public/javascripts/index.js` | `src/pages/Index.tsx` | In progress | Verify responsive geometry and all keyboard edge states |
| `views/config.html` | `public/javascripts/config.js` | `src/pages/Config.tsx` | In progress | Verify all form validation/error states and legacy micro-spacing |
| `views/highscores.html` | `public/javascripts/highscores.js` | `src/pages/Highscores.tsx` | In progress | Verify pagination parity and typography spacing |
| `views/about.html` | `public/javascripts/about.js` | `src/pages/About.tsx` | In progress | Verify sponsor blocks and responsive wrap behavior |
| `views/practicemenu.html` | `public/javascripts/practicemenu.js` | `src/pages/PracticeMenu.tsx` | In progress | Final visual parity pass and controller overlay behavior |
| `views/gamemenu.html` | `public/javascripts/gameMenu.js` | `src/pages/GameMenu.tsx` | In progress | NOSTR panel parity and full keyboard/controller path parity |
| `views/game.html` | `public/javascripts/game.js` | `src/pages/Game.tsx` | In progress | Core gameplay/rendering migrated; final visual parity polish + production payment gating still pending |
| `views/postgame.html` | `public/javascripts/postGame.js` | `src/pages/PostGame.tsx` | Not started | Withdraw flow, redirect logic, result details |
| `views/tournprefs.html` | `public/javascripts/tournprefs.js` | `src/pages/TournamentPrefs.tsx` | Not started | Tournament setup controls and validation |
| `views/tournlobby.html` | `public/javascripts/tournlobby.js` | `src/pages/TournamentLobby.tsx` | Not started | Lobby state machine, ready/claim flow |
| `views/tournbracket.html` | `public/javascripts/tournbracket.js` | `src/pages/TournamentBracket.tsx` | Not started | Bracket render/update parity and controls |

## Shared Contract Parity

| Area | Status | Notes |
|---|---|---|
| Socket event typing (`src/types/socket.ts`) | In progress | Core events typed, still need mode-specific runtime guards |
| Runtime validation (`src/lib/socketValidation.ts`) | In progress | Wired but not consistently used in page handlers |
| Config loading (`src/lib/config.ts`) | In progress | Supports env socket URL and legacy fallback; needs final fallback UX |
| Socket lifecycle (`src/hooks/useSocket.ts`) | In progress | Stabilized; needs stress test across all pages/modes |

## CSS Parity

| Legacy CSS | React CSS | Status |
|---|---|---|
| `public/stylesheets/style.css` | `src/styles/index.css` | In progress |
| `public/stylesheets/practicemenu.css` | `src/pages/practicemenu.css` + `src/components/layout/game-setup.css` | In progress |
| `public/stylesheets/gameMenu.css` | `src/pages/gamemenu.css` + `src/components/layout/game-setup.css` | In progress |
| `public/stylesheets/game.css` | `src/pages/game.css` | In progress |
| tournament/postgame css files | page css equivalents | Not started |

## Acceptance Checklist (Per Page)

- Route path parity
- DOM section parity (`header`, main rules, bottom panel, overlays)
- Keyboard parity (WASD, arrows, enter/space)
- Controller parity
- Socket emit/receive parity
- Loading + error + timeout behavior parity
- Responsive layout parity at desktop and mobile breakpoints
