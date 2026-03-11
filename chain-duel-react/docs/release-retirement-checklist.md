# Release and Legacy Retirement Checklist

## Pre-release Gate

- `npm run build` passes
- `npm run lint` passes
- `npm run test` passes
- Socket connection smoke verified against marspay
- Payment menu flows verified (`P2P`, `Practice`)
- Local fallback/bootstrap behavior reviewed for production policy (enabled intentionally or dev-only guarded)

## Parity Gate

- All pages reviewed against `docs/visual-parity-checklist.md`
- Keyboard/gamepad parity paths validated
- Overlay and loading states validated
- No critical behavior regressions from legacy

## Legacy Retirement

- All required static assets present under `public/`
- Environment variables documented in `.env.example`
- Fallback strategy documented for socket config
- Game fallback boot behavior documented and reviewed for production defaults
- Rollback plan: keep legacy chain-duel deployment available until first stable production window

## Rollback Plan

- If production parity issue occurs:
  1. Revert frontend deployment to previous stable build
  2. Keep marspay socket backend unchanged
  3. Re-open parity diff issue with page/mode label and screenshot evidence
