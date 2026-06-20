/**
 * Parity check: client engine replay must match marspay challengeEngine replay.
 * Requires `npm run build` in marspay first.
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
import type { AiTier } from '@/game/engine/types';

type CatalogEntry = {
  id: string;
  format: '1v1' | '4P FFA' | '2v1';
  aiTier: AiTier;
  powerup: boolean;
};

const PRESETS: CatalogEntry[] = [
  { id: 'normie', format: '1v1', aiTier: 'normie', powerup: false },
  { id: 'stacker', format: '1v1', aiTier: 'stacker', powerup: false },
];

const MAX_SIM_STEPS = 60_000;

function clientReplay(
  challenge: CatalogEntry,
  seed: string,
  inputLog: Array<{ tick: number; dir: string }>
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
    const inputsByStep = new Map<number, Array<{ tick: number; dir: string }>>();
    for (const entry of inputLog) {
      const list = inputsByStep.get(entry.tick) ?? [];
      list.push(entry);
      inputsByStep.set(entry.tick, list);
    }
    let simStep = 0;
    while (!state.gameEnded && simStep < MAX_SIM_STEPS) {
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
    }
    return {
      gameEnded: state.gameEnded,
      winnerPlayer: state.winnerPlayer,
      simSteps: simStep,
      p1Score: state.score[0],
      p2Score: state.score[1],
    };
  } finally {
    clearRunRng();
  }
}

const marspayDist = join(
  import.meta.dirname,
  '../../../../../marspay/dist/game/challengeEngine/replayRunner.js'
);

describe('client vs marspay replay parity', () => {
  it.skipIf(!existsSync(marspayDist))(
    'matches marspay replayChallengeSim for fixed seeds',
    async () => {
      const { replayChallengeSim } = await import(marspayDist);
      const seeds = ['deadbeef'];

      for (const preset of PRESETS) {
        for (const seed of seeds) {
          const challenge = {
            id: preset.id,
            rank: 1,
            name: preset.id,
            format: preset.format,
            aiTier: preset.aiTier,
            powerup: preset.powerup,
            bountySats: 100,
          };
          const client = clientReplay(preset, seed, []);
          const server = replayChallengeSim({
            seed,
            challenge,
            inputLog: [],
          });
          expect(client.gameEnded).toBe(server.gameEnded);
          expect(client.winnerPlayer).toBe(server.winnerPlayer);
          expect(client.simSteps).toBe(server.simSteps);
          expect(client.p1Score).toBe(server.p1Score);
          expect(client.p2Score).toBe(server.p2Score);
          if (client.gameEnded) {
            expect(client.winnerPlayer).not.toBeNull();
          }
        }
      }
    }
  );
});
