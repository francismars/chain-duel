# Visual Parity Checklist

Use this checklist for desktop and mobile parity verification against legacy pages.

## Breakpoints

- Desktop: `1920x1080`, `1366x768`
- Mobile: `390x844`, `412x915`

## Core Checks Per Page

- Header position/spacing (`#brand`, `#chain`, `#duel`)
- Rules/title typography (`hero-outline`, `condensed`, spacing)
- Button dimensions, glow animation, hover/disabled states
- Bottom panel geometry and border alignment
- QR sizing and highlight animation timing
- Overlay centering, opacity, and z-index behavior

## Functional Visual Checks

- Loading overlay appears/disappears at the same transition moments
- Cancel overlay activation from keyboard/gamepad parity path
- Focus-highlight animation follows selected control
- Responsive wrap behavior preserves legacy hierarchy

## Game Page Specific Checks

- `PRESS BUTTON TO START` is visible before countdown starts.
- Countdown (`3`, `2`, `1`, `LFG`) appears on top of the canvas during start flow.
- Both player pieces and body segments are visible and moving after game starts.
- Coinbase marker is visible and updates after captures/block-triggered spawns.
- Winner text appears (`<PLAYER> WINS!`) and continue prompt is readable.
- Zap message pills animate in/out with readable user/content/amount.
- Bitcoin footer values update and highlight animation triggers on new block.

## Required Artifacts

- Before/after screenshots for each breakpoint
- Annotated diff list for each page
- Signed-off parity status: `pass`, `minor delta accepted`, or `blocked`
