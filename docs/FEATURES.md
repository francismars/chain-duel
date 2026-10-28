# Chain Duel — Features & Architecture

Chain Duel is a **Lightning-native competitive Snake game**. Chains stake sats, grow by capturing **coinbases**, and drain a zero-sum pool until one side's score hits zero. The winner takes the pooled stakes (minus fees).

A match is not only 1v1. Quick play is 1v1 or four chains, bounty challenges add a 2v1, and ONLINE rooms are server-authoritative 2P. Local and paid matches simulate in the browser. ONLINE simulates on marspay.

Production: game at [game.chainduel.net](https://game.chainduel.net/), backend at `wss://marspay.chainduel.net`.

| Component | Path | Role |
|-----------|------|------|
| **React client** | repository root | The game |
| **Legacy frontend** | `legacy/` | Retired Express + Canvas client |
| **marspay** | sibling repo `../marspay` | Lightning, Nostr, sessions, challenge validation, authoritative ONLINE play |

---

## Architecture

```
┌─────────────────────────┐
│  React client           │  React 18, TypeScript, PixiJS 8, Vite
│  (Vite dev :5173)       │  Socket.IO client, nostr-tools
└───────────┬─────────────┘
            │  Socket.IO (VITE_SOCKET_URL)
            ▼
┌─────────────────────────┐
│  marspay                │  Node.js, TypeScript, Express, Socket.IO
│  (default :3001)        │  LNbits LNURL pay/withdraw, NDK (Nostr)
└───────────┬─────────────┘
            │  Webhooks
            ▼
┌─────────────────────────┐
│  LNbits                 │  Lightning invoices, LNURLp, LNURLw
└─────────────────────────┘
```

- **This client** renders, reads input, signs Nostr events, and runs every match that is not ONLINE.
- **marspay** owns session IDs, LNURL links, payment webhooks, Kind 1 publish/subscribe, tournament brackets, challenge replay validation, and the ONLINE simulation.
- **`legacy/`** still serves the old Canvas client on port 3000 and proxies socket config with `GET /loadconfig`. It does not get new features.

Shared protocol types live in `src/types/socket.ts` and must stay aligned with marspay.

---

## Game mechanics

The board is **51 × 25**. Chains move on a 100 ms tick. Reversing into your own neck is ignored. Crashing into a wall, your body, or another chain **respawns** that chain and drops its capture rate. It does not end the match.

**Win:** a side's score reaches zero. In Convergence, the match can also end when the shrinking arena leaves a highest score.

### Captures

A coinbase on the same cell as a head moves sats from the other side into the capturer. The share of the pool scales with chain length:

| Length | Share |
|--------|-------|
| 1 | 2% |
| 2–3 | 4% |
| 4–6 | 8% |
| 7–10 | 16% |
| 11+ | 32% |

Block coinbases from the live [mempool.space](https://mempool.space) feed use fixed rewards of 2 / 4 / 8 / 16 / 32 sats. In 2v1, the two AI chains share one team capture rate.

### Formats

| Format | Who plays |
|--------|-----------|
| **1v1** | Two chains. Quick play can be human vs AI or two local humans. |
| **FFA** | Four chains. Seats are human or AI. Bots are BigToshi, Nakamotor, XORNOTHING, and 256octans. Each starts with 1,000 sats. |
| **2v1** | One human against two AI teammates (Team Sovereign). The human spawns mid-left. Pressure music treats the AI pair as one side. |

AI tiers, easiest to hardest: **normie, stacker, noderunner, sovereign**.

### Convergence

Quick play always uses the Soldier preset. The border contracts toward **11 × 11**, one step every 40 ticks (about 1.3 minutes to the minimum). Bounty challenges do not shrink the board.

### Power-ups

Optional in quick play. On in the Node Runner bounty. Each lasts a few seconds at the 100 ms tick:

| Power-up | Effect |
|----------|--------|
| **SURGE** | Extra step every other tick, 40 ticks |
| **FREEZE** | Target moves only on alternate ticks, 40 ticks. Hits every other chain in FFA. |
| **PHANTOM** | Wrap through walls and the shrinking border, 50 ticks |
| **AMPLIFIER** | Next 3 captures take double percent, capped at 32% |
| **DECOY** | Drops a fake coinbase |

---

## Game modes

### Quick play (`/practice`)

Client-only. No marspay required.

- 1v1 against an AI tier, or two players on one keyboard
- Four-chain free-for-all, each seat human or AI
- Power-ups toggle
- Convergence always on
- HUD label looks like `PRACTICE · 1V1 · CVG`

### Bounty challenges (`/practice?play=challenges`)

Seeded local play. marspay replays the input log before it pays. Display names are fixed in `src/lib/challenges/challengeCatalogClient.ts`. The sats below are the client fallback; the live catalog from marspay replaces them after it loads.

| Rank | Challenge | Format | AI | Power-ups | Fallback bounty |
|------|-----------|--------|----|-----------|-----------------|
| 1 | NORMIE DUEL | 1v1 | normie | — | 21 |
| 2 | STACKER TRIAL | 1v1 | stacker | — | 50 |
| 3 | NODE RUNNER | 1v1 | noderunner | yes | 210 |
| 4 | FFA RUMBLE | 4P FFA | noderunner | — | 600 |
| 5 | SOVEREIGN GAUNTLET | 1v1 | sovereign | — | 1,337 |
| 6 | TEAM SOVEREIGN | 2v1 | sovereign | — | 6,900 |

Flow: Nostr sign-in → eligibility → `requestChallengeRun` → play with an input log → `submitChallengeWin` → sign a victory Kind 1 → `claimChallengeBounty` → NIP-57 zap.

Eligibility: linked app session, verified NIP-05, 100+ follows, follow @chainduel, account at least 30 days old, zap-capable Lightning address (LUD16).

Protocol: [marspay/docs/AGENTS_CHALLENGE_BOUNTY.md](../../marspay/docs/AGENTS_CHALLENGE_BOUNTY.md)

### P2P duel (`/p2p` → `/gamemenu` → `/game` → `/postgame`)

1v1. Lightning is two LNURL-pay QR codes (minimum buy-in 3,000 sats; the usual stake is 10,000). Nostr admission is a Kind 1 game note plus a zap (`/gamemenu?nostr=true`).

Both browsers simulate. The winner emits `gameFinished` once. Post-game offers an LNURL-withdraw, a rematch, and double-or-nothing.

### Tournament (`/p2p` → `/tournbracket` → `/tournlobby`)

Brackets of 4, 8, 16, or 32. One shared Lightning or Nostr buy-in. Prize is `buy-in × players × 0.95`. No double-or-nothing on the tournament result screen.

### ONLINE (`/online`, `/online/r/:roomCode`)

marspay simulates. Clients send held keys as `roomInput`. The server emits `onlineRoomSnapshot` about every 100 ms.

| Piece | Behavior |
|-------|----------|
| Browser | Active rooms, match history, Hall of Fame (buy-in at least 1,000 sats) |
| Room | `lobby` → `playing` → `postgame` → `finished` / `cancelled` on one URL |
| Buy-in | Host presets 1K / 10K / 100K, anywhere from 1,000 to 1,000,000 sats |
| Seats | Anonymous LNURL-pay, a Nostr zap on the room note, or an in-app zap with a 4-digit PIN. A linked pubkey can zap without the PIN. NWC can pay the seat invoice. |
| Watch | Spectators join without paying |
| After | LNURL-withdraw or a zap to the winner's LUD16, optional double-or-nothing, gzip replay of up to 3,600 frames (`?replay=1`) |
| Presentation | Pre-match intro and a victory reveal on the result |

Protocol: [marspay/docs/AGENTS_ONLINE.md](../../marspay/docs/AGENTS_ONLINE.md)

---

## Match presentation

Local games, ONLINE snapshots, and replays share one presentation layer.

**Pressure music** crossfades four stems over the game bed. The loudest of four signals wins: chain length, board lost to shrinkage, leader's share of sats, and captures in a row. Below the first mark, only the game bed plays. Eliminated chains are ignored. Inactive stems keep running in silence so a crossfade does not restart the loop.

| Level | Stem | Chain | Board lost | Score share | Streak | Volume |
|-------|------|-------|------------|-------------|--------|--------|
| 1 Build | Sub-bass heartbeat | 4+ | after the first shrink | 60%+ | 2 | 22% |
| 2 Pressure | FM plucks | 7+ | 25% | 75%+ | 3 | 34% |
| 3 Tension | Detuned pad | 11+ | 45% | 85%+ | 5 | 46% |
| 4 Critical | Saturated lead | 16+ | 65% | 95%+ | 8 | 65% |

A stem holds 1 second after its mark drops, then fades over 2.5 seconds. The bed ducks under the loudest stem. Numbers live in `SHIPPED_RECIPE` in `src/game/effects/matchRecipe.ts`. Mixing is `src/game/audio/gameAudio.ts`.

Other cues, all silenced by full mute:

- **Wall warning** (`chain_duel_warn.wav`) for the second the border is lit, before it steps.
- **Shrink** (`chain_duel_shrink.wav`) when the border actually steps in.
- **Reset** when a chain respawns.
- **End** (`chain_duel_end.wav`) as results take over and pressure stems stop. Menu music keeps its place. Playing again restarts the game bed.
- **Block found** (`MAINNET_BLOCK.aac`) is separate from the ending cue.

Rebuild stems with `python3 scripts/audio/create-game-cues.py`. `--end-only` rebuilds the ending cue. `python3 scripts/audio/create-shrink-cue.py` rebuilds the shrink cue.

`/preview` and `/preview/match-triggers` are local labs for this layer. They are not shipped modes.

---

## Nostr and Lightning

| Feature | Where it is used |
|---------|------------------|
| NIP-07, NIP-46 bunker, session-only nsec | Sign-in |
| App session link | Kind 1 challenge, then `confirmAppNostrLink` |
| Kind 0 profile | Fetched through marspay, not by reading relays from the browser |
| LNURL-pay | P2P, tournament, ONLINE seats |
| LNURL-withdraw | Winner payout |
| NIP-57 zaps | Nostr entry, ONLINE seats, challenge bounties, ONLINE winner payout |
| NWC `pay_invoice` | Pay an ONLINE seat from a connected wallet |
| Fee split | 2% host, 2% developer, 1% designer on non-ONLINE Lightning deposits. Winner receives 95%. |

Nostr session protocol: [marspay/docs/AGENTS_NOSTR_SESSION.md](../../marspay/docs/AGENTS_NOSTR_SESSION.md)

---

## Other surfaces

| Surface | Route | Notes |
|---------|-------|-------|
| Highscores | `/highscores` | Static JSON leaderboard |
| About | `/about` | Rules, sponsors, value-for-value, contribute LNURL |
| Config | `/config` | Nostr login, NWC, host name |
| Corner controls | every page | Fullscreen, music mute, full mute, TV-safe inset, Nostr shortcut |
| Input | every page | Keyboard menus, dual gamepad, keyboard-layout autodetect |

Old URLs redirect: `/local`, `/regtest`, `/testnet` → `/practice`; `/solo` → `/practice?play=challenges`; `/testnet-entry` → `/p2p`; `/network/*` → `/online/*`.

---

## Kept in sync with marspay

| Shared logic | Client | Server |
|--------------|--------|--------|
| Challenge RNG | `src/game/engine/runRng.ts` | `marspay/src/game/challengeEngine/runRng.ts` |
| ONLINE replay codec | `src/replay/codec/onlineReplayCodec.ts` | `marspay/src/state/onlineReplayCodec.ts` |
| NIP-46 relays | `src/lib/nostr/nip46Relays.ts` | `marspay/src/consts/nostrRelays.ts` |
| Socket events | `src/types/socket.ts` | `marspay/src/socket/index.ts` |

marspay modes: `P2P`, `P2PNOSTR`, `PRACTICE`, `TOURNAMENT`, `TOURNAMENTNOSTR`, `ONLINE`.

---

## Docs

| Document | What it is |
|----------|------------|
| [README.md](../README.md) | Setup and a short map of the client |
| [SETUP.md](../SETUP.md) | marspay on port 3001 |
| [marspay/docs/AGENTS.md](../../marspay/docs/AGENTS.md) | Sessions, reconnect, bots |
| [marspay/docs/AGENTS_ONLINE.md](../../marspay/docs/AGENTS_ONLINE.md) | ONLINE lifecycle |
| [marspay/docs/AGENTS_NOSTR_SESSION.md](../../marspay/docs/AGENTS_NOSTR_SESSION.md) | App sign-in vs room link |
| [marspay/docs/AGENTS_CHALLENGE_BOUNTY.md](../../marspay/docs/AGENTS_CHALLENGE_BOUNTY.md) | Bounty protocol |
