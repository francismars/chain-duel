/**
 * Parity check: client engine replay must match marspay challengeEngine replay.
 * Requires `npx tsc` in the sibling marspay repo (or MARSPAY_REPLAY_RUNNER).
 * Set CHALLENGE_PARITY_REQUIRED=1 to fail instead of skipping when it is missing.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  createGameState,
  setWantedDirection,
  startCountdown,
  stepGame,
} from '@/game/engine';
import { initRunRng, clearRunRng } from '@/game/engine/runRng';
import { CHALLENGE_START_SATS_PER_PLAYER } from '@/game/engine/constants';
import { CHALLENGE_SIM_PRESETS } from '@/game/sim/challengeSim';
import {
  TIER_PARITY_SEED,
  TIER_PARITY_STEPS,
  TIER_PARITY_TAPE,
} from '@/game/sim/challengeParity.fixture';
import type {
  AiTier,
  Direction,
  GameState,
  GridPos,
} from '@/game/engine/types';

type Dir = Exclude<Direction, ''>;

type CatalogEntry = {
  id: string;
  rank: number;
  name: string;
  format: '1v1' | '4P FFA' | '2v1';
  aiTier: AiTier;
  powerup: boolean;
  bountySats: number;
};

type ReplaySimResult = {
  gameEnded: boolean;
  winnerPlayer: string | null;
  simSteps: number;
  p1Score: number;
  p2Score: number;
};

type ReplayChallengeSim = (params: {
  seed: string;
  challenge: CatalogEntry;
  inputLog: Array<{ tick: number; dir: string }>;
  maxSimSteps?: number;
}) => ReplaySimResult;

type Capture = {
  step: number;
  percent: number;
  eater: number;
  eaterLength: number;
  p2Length: number;
  p3Length: number;
};

const PRESETS: CatalogEntry[] = CHALLENGE_SIM_PRESETS.map((p) => ({
  id: p.id,
  rank: 1,
  name: p.id,
  format: p.config.format,
  aiTier: p.config.aiTier,
  powerup: p.config.powerup,
  bountySats: 100,
}));

const STACKER: CatalogEntry = {
  id: 'stacker',
  rank: 2,
  name: 'STACKER TRIAL',
  format: '1v1',
  aiTier: 'stacker',
  powerup: false,
  bountySats: 50,
};

const TEAM_SOVEREIGN: CatalogEntry = {
  id: 'sovereign-stack',
  rank: 6,
  name: 'TEAM SOVEREIGN',
  format: '2v1',
  aiTier: 'sovereign',
  powerup: false,
  bountySats: 6900,
};

/** Short 2v1 run. At this step the shorter AI eats at the longer AI's tier. */
const TEAM_RATE_SEED = 'parity01';
const TEAM_RATE_STEPS = 147;

const MAX_SIM_STEPS = 60_000;

const marspayDist =
  process.env.MARSPAY_REPLAY_RUNNER ??
  join(
    import.meta.dirname,
    '../../../../marspay/dist/game/challengeEngine/replayRunner.js'
  );

const runnerReady = existsSync(marspayDist);

if (process.env.CHALLENGE_PARITY_REQUIRED === '1' && !runnerReady) {
  throw new Error(
    `CHALLENGE_PARITY_REQUIRED is set but the marspay replay runner is missing at ${marspayDist}`
  );
}

/** Length bands the steal uses. Kept here so a wrong engine table fails the test. */
function percentForLength(length: number): number {
  if (length >= 11) return 32;
  if (length >= 7) return 16;
  if (length >= 4) return 8;
  if (length >= 2) return 4;
  return 2;
}

function tapeToInputs(tape: string): Array<{ tick: number; dir: Dir }> {
  const inputs: Array<{ tick: number; dir: Dir }> = [];
  for (let tick = 0; tick < tape.length; tick += 1) {
    const letter = tape[tick];
    const dir =
      letter === 'U'
        ? 'Up'
        : letter === 'D'
          ? 'Down'
          : letter === 'L'
            ? 'Left'
            : letter === 'R'
              ? 'Right'
              : null;
    if (dir) inputs.push({ tick, dir });
  }
  return inputs;
}

function bodyLength(state: GameState, index: number): number {
  if (index === 0) return state.p1.body.length;
  if (index === 1) return state.p2.body.length;
  if (index === 2) return state.extraSnakes[0]?.snake.body.length ?? 0;
  return state.extraSnakes[1]?.snake.body.length ?? 0;
}

function eaterAt(state: GameState, gain: GridPos | undefined): number {
  if (!gain) return -1;
  const heads = [
    state.p1.head,
    state.p2.head,
    state.extraSnakes[0]?.snake.head,
    state.extraSnakes[1]?.snake.head,
  ];
  for (let index = 0; index < heads.length; index += 1) {
    const head = heads[index];
    if (head && head[0] === gain[0] && head[1] === gain[1]) return index;
  }
  return -1;
}

function clientReplay(
  challenge: CatalogEntry,
  seed: string,
  inputLog: Array<{ tick: number; dir: string }>,
  maxSimSteps = MAX_SIM_STEPS
) {
  initRunRng(seed);
  try {
    const stake = CHALLENGE_START_SATS_PER_PLAYER;
    const isFfa = challenge.format === '4P FFA';
    const is2v1 = challenge.format === '2v1';
    const state = createGameState({
      modeLabel: 'CHALLENGE',
      practiceMode: true,
      p1Human: true,
      p2Human: false,
      p3Human: false,
      p4Human: false,
      p1Name: 'Player',
      p2Name: 'BigToshi 🌊',
      p1Points: stake,
      p2Points: stake,
      aiTier: challenge.aiTier,
      ffaAiTier: isFfa || is2v1 ? challenge.aiTier : undefined,
      convergenceMode: false,
      powerupMode: challenge.powerup,
      teamMode: isFfa ? 'ffa' : is2v1 ? '2v1' : 'solo',
    });
    startCountdown(state);
    const inputsByStep = new Map<
      number,
      Array<{ tick: number; dir: string }>
    >();
    for (const entry of inputLog) {
      const list = inputsByStep.get(entry.tick) ?? [];
      list.push(entry);
      inputsByStep.set(entry.tick, list);
    }
    const captures: Capture[] = [];
    const awaitingRespawnEat = new Set<number>();
    let respawnCaptureAt2 = false;
    let simStep = 0;
    while (!state.gameEnded && simStep < maxSimSteps) {
      const lengths = [0, 1, 2, 3].map((index) => bodyLength(state, index));
      const beforeChanges = state.pointChanges.length;
      for (const inp of inputsByStep.get(simStep) ?? []) {
        if (
          inp.dir === 'Up' ||
          inp.dir === 'Down' ||
          inp.dir === 'Left' ||
          inp.dir === 'Right'
        ) {
          setWantedDirection(state, 'P1', inp.dir);
        }
      }
      stepGame(state);
      simStep += 1;
      for (const change of state.pointChanges.slice(beforeChanges)) {
        if (change.capturePercent == null) continue;
        const eater = eaterAt(state, change.gainPos);
        captures.push({
          step: simStep,
          percent: change.capturePercent,
          eater,
          eaterLength: eater >= 0 ? (lengths[eater] ?? 0) : 0,
          p2Length: lengths[1] ?? 0,
          p3Length: lengths[2] ?? 0,
        });
        if (
          eater >= 0 &&
          awaitingRespawnEat.has(eater) &&
          (lengths[eater] ?? 0) <= 1 &&
          change.capturePercent === 2
        ) {
          respawnCaptureAt2 = true;
          awaitingRespawnEat.delete(eater);
        }
      }
      if (state.resetCueP1) awaitingRespawnEat.add(0);
      if (state.resetCueP2) awaitingRespawnEat.add(1);
      if (state.resetCueExtra?.[0]) awaitingRespawnEat.add(2);
      if (state.resetCueExtra?.[1]) awaitingRespawnEat.add(3);
    }
    return {
      gameEnded: state.gameEnded,
      winnerPlayer: state.winnerPlayer,
      simSteps: simStep,
      p1Score: state.score[0],
      p2Score: state.score[1],
      captures,
      respawnCaptureAt2,
    };
  } finally {
    clearRunRng();
  }
}

let replayChallengeSim: ReplayChallengeSim | null = null;

async function serverReplay(params: {
  seed: string;
  challenge: CatalogEntry;
  inputLog: Array<{ tick: number; dir: string }>;
  maxSimSteps?: number;
}): Promise<ReplaySimResult> {
  if (!replayChallengeSim) {
    ({ replayChallengeSim } = (await import(marspayDist)) as {
      replayChallengeSim: ReplayChallengeSim;
    });
  }
  return replayChallengeSim(params);
}

function expectSameOutcome(
  client: ReplaySimResult,
  server: ReplaySimResult
): void {
  expect(client.gameEnded).toBe(server.gameEnded);
  expect(client.winnerPlayer).toBe(server.winnerPlayer);
  expect(client.simSteps).toBe(server.simSteps);
  expect(client.p1Score).toBe(server.p1Score);
  expect(client.p2Score).toBe(server.p2Score);
}

describe('client vs marspay replay parity', () => {
  it.skipIf(!runnerReady)(
    'matches marspay replayChallengeSim for fixed seeds',
    async () => {
      const seeds = ['deadbeef'];

      for (const preset of PRESETS) {
        for (const seed of seeds) {
          const client = clientReplay(preset, seed, []);
          const server = await serverReplay({
            seed,
            challenge: preset,
            inputLog: [],
          });
          expectSameOutcome(client, server);
        }
      }
    },
    180_000
  );

  it.skipIf(!runnerReady)(
    'covers a capture at every length tier and a respawn back to 2%',
    async () => {
      const inputLog = tapeToInputs(TIER_PARITY_TAPE);
      const client = clientReplay(
        STACKER,
        TIER_PARITY_SEED,
        inputLog,
        TIER_PARITY_STEPS
      );
      const seen = new Set<number>();
      for (const capture of client.captures) {
        expect(capture.eater).toBeGreaterThanOrEqual(0);
        expect(capture.percent).toBe(percentForLength(capture.eaterLength));
        seen.add(percentForLength(capture.eaterLength));
      }
      expect([...seen].sort((a, b) => a - b)).toEqual([2, 4, 8, 16, 32]);
      expect(client.respawnCaptureAt2).toBe(true);

      const server = await serverReplay({
        seed: TIER_PARITY_SEED,
        challenge: STACKER,
        inputLog,
        maxSimSteps: TIER_PARITY_STEPS,
      });
      expectSameOutcome(client, server);
    },
    30_000
  );

  it.skipIf(!runnerReady)(
    'uses the longer AI chain for a 2v1 team capture',
    async () => {
      const client = clientReplay(
        TEAM_SOVEREIGN,
        TEAM_RATE_SEED,
        [],
        TEAM_RATE_STEPS
      );
      const split = client.captures.find((capture) => {
        if (capture.eater !== 1 && capture.eater !== 2) return false;
        const longer = percentForLength(
          Math.max(capture.p2Length, capture.p3Length)
        );
        const shorter = percentForLength(
          Math.min(capture.p2Length, capture.p3Length)
        );
        return (
          longer !== shorter &&
          capture.percent === longer &&
          capture.percent !== percentForLength(capture.eaterLength)
        );
      });
      expect(split).toBeDefined();

      const server = await serverReplay({
        seed: TEAM_RATE_SEED,
        challenge: TEAM_SOVEREIGN,
        inputLog: [],
        maxSimSteps: TEAM_RATE_STEPS,
      });
      expectSameOutcome(client, server);
    },
    30_000
  );
});
