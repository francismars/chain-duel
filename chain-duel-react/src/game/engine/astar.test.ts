import { describe, expect, it } from 'vitest';
import { createGameState, startCountdown, stepGame } from '@/game/engine';
import { posKey, runAStar } from '@/game/engine/astar';
import type { GridPos } from '@/game/engine/types';

describe('runAStar', () => {
  it('returns a path from start to target on an open grid', () => {
    const start: GridPos = [5, 5];
    const target: GridPos = [8, 5];
    const path = runAStar({
      start,
      target,
      heuristic: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
      samePos: (a, b) => a[0] === b[0] && a[1] === b[1],
      neighbors(current) {
        const out: GridPos[] = [];
        for (const nb of [
          [current[0] + 1, current[1]],
          [current[0] - 1, current[1]],
          [current[0], current[1] + 1],
          [current[0], current[1] - 1],
        ] as GridPos[]) {
          if (nb[0] < 0 || nb[1] < 0 || nb[0] >= 51 || nb[1] >= 25) continue;
          out.push(nb);
        }
        return out;
      },
    });
    expect(path.length).toBeGreaterThan(1);
    expect(posKey(path[0]!)).toBe(posKey(start));
    expect(posKey(path[path.length - 1]!)).toBe(posKey(target));
  });

  it('returns start-only when target is unreachable', () => {
    const start: GridPos = [5, 5];
    const target: GridPos = [10, 10];
    const path = runAStar({
      start,
      target,
      heuristic: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
      samePos: (a, b) => a[0] === b[0] && a[1] === b[1],
      neighbors() {
        return [];
      },
    });
    expect(path).toEqual([start]);
  });
});

describe('pathfinding integration', () => {
  it('AI stepGame advances without throwing after A* refactor', () => {
    const state = createGameState({
      p1Name: 'A',
      p2Name: 'B',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'P2P',
      practiceMode: false,
      p2Human: false,
    });
    startCountdown(state);
    while (!state.gameStarted) {
      stepGame(state);
    }
    for (let i = 0; i < 50; i += 1) {
      stepGame(state);
      if (state.gameEnded) break;
    }
    expect(state.tickCount).toBeGreaterThan(0);
  });
});
