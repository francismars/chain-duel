import {
  createGameState,
  setWantedDirection,
  startCountdown,
  stepGame,
} from '@/game/engine';
import { initRunRng, clearRunRng } from '@/game/engine/runRng';
import type { AiTier } from '@/game/engine/types';
import { CHALLENGE_START_SATS_PER_PLAYER } from '@/game/engine/constants';

export type ChallengeSimFormat = '1v1' | '4P FFA' | '2v1';

export type ChallengeSimConfig = {
  format: ChallengeSimFormat;
  aiTier: AiTier;
  powerup: boolean;
};

export type HumanStrategy = 'greedy_food' | 'passive_ffa' | 'contest_when_long';

export type ChallengeSimResult = {
  winnerPlayer: string | null;
  simSteps: number;
  p1Won: boolean;
  p1Score: number;
  p2Score: number;
};

const MAX_SIM_STEPS = 15_000;

function buildState(config: ChallengeSimConfig) {
  const stake = CHALLENGE_START_SATS_PER_PLAYER;
  const isFfa = config.format === '4P FFA';
  const is2v1 = config.format === '2v1';
  return createGameState({
    modeLabel: 'SIM',
    practiceMode: true,
    p1Human: true,
    p2Human: false,
    p3Human: false,
    p4Human: false,
    p1Name: 'Player',
    p2Name: 'BigToshi 🌊',
    p1Points: stake,
    p2Points: stake,
    aiTier: config.aiTier,
    ffaAiTier: isFfa || is2v1 ? config.aiTier : undefined,
    convergenceMode: false,
    powerupMode: config.powerup,
    teamMode: isFfa ? 'ffa' : is2v1 ? '2v1' : 'solo',
  });
}

function nearestFoodDir(
  head: [number, number],
  coin: [number, number],
  current: string
): 'Up' | 'Down' | 'Left' | 'Right' {
  const opts: Array<'Up' | 'Down' | 'Left' | 'Right'> = [];
  const [hx, hy] = head;
  const [cx, cy] = coin;
  if (cy < hy) opts.push('Up');
  if (cy > hy) opts.push('Down');
  if (cx < hx) opts.push('Left');
  if (cx > hx) opts.push('Right');
  const reverse: Record<string, string> = {
    Up: 'Down',
    Down: 'Up',
    Left: 'Right',
    Right: 'Left',
  };
  const filtered = opts.filter((d) => reverse[d] !== current);
  return filtered[0] ?? opts[0] ?? 'Right';
}

function pickHumanDir(
  state: ReturnType<typeof buildState>,
  strategy: HumanStrategy
): 'Up' | 'Down' | 'Left' | 'Right' | null {
  if (strategy === 'passive_ffa') return null;
  const coin = state.coinbases.find((c) => !c.isDecoy);
  if (!coin) return null;
  const facing = state.p1.dir || state.p1.dirWanted || 'Right';
  return nearestFoodDir(state.p1.head, coin.pos, facing);
}

export function runChallengeSim(params: {
  seed: string;
  config: ChallengeSimConfig;
  strategy?: HumanStrategy;
}): ChallengeSimResult {
  const strategy = params.strategy ?? 'greedy_food';
  initRunRng(params.seed);
  try {
    const state = buildState(params.config);
    startCountdown(state);
    let simStep = 0;
    while (!state.gameEnded && simStep < MAX_SIM_STEPS) {
      const dir = pickHumanDir(state, strategy);
      if (dir) setWantedDirection(state, 'P1', dir);
      stepGame(state);
      simStep += 1;
    }
    return {
      winnerPlayer: state.winnerPlayer,
      simSteps: simStep,
      p1Won: state.winnerPlayer === 'P1',
      p1Score: state.score[0],
      p2Score: state.score[1],
    };
  } finally {
    clearRunRng();
  }
}

export function measureWinRate(params: {
  config: ChallengeSimConfig;
  strategy?: HumanStrategy;
  runs?: number;
  seedPrefix?: string;
}): { wins: number; runs: number; winRate: number; avgSteps: number } {
  const runs = params.runs ?? 50;
  let wins = 0;
  let totalSteps = 0;
  for (let i = 0; i < runs; i += 1) {
    const seed = `${params.seedPrefix ?? 'sim'}-${i.toString(16).padStart(8, '0')}`;
    const result = runChallengeSim({
      seed,
      config: params.config,
      strategy: params.strategy,
    });
    if (result.p1Won) wins += 1;
    totalSteps += result.simSteps;
  }
  return {
    wins,
    runs,
    winRate: wins / runs,
    avgSteps: totalSteps / runs,
  };
}

/** Catalog-aligned presets (mirrors marspay CHALLENGE_CATALOG). */
export const CHALLENGE_SIM_PRESETS: Array<{
  id: string;
  config: ChallengeSimConfig;
}> = [
  { id: 'normie', config: { format: '1v1', aiTier: 'normie', powerup: false } },
  { id: 'stacker', config: { format: '1v1', aiTier: 'stacker', powerup: false } },
  {
    id: 'noderunner',
    config: { format: '1v1', aiTier: 'noderunner', powerup: true },
  },
  {
    id: 'ffa',
    config: { format: '4P FFA', aiTier: 'noderunner', powerup: false },
  },
  {
    id: 'gauntlet',
    config: { format: '1v1', aiTier: 'sovereign', powerup: false },
  },
  {
    id: 'sovereign-stack',
    config: { format: '2v1', aiTier: 'sovereign', powerup: false },
  },
];
