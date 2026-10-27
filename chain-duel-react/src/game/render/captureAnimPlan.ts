import type { GridPos } from '@/game/engine/types';

export type PlannedCapture = {
  key: string;
  /** Cell the reward occupied. Copied so a later head move does not drag the pop. */
  head: GridPos;
  reward: number;
  grew: boolean;
};

type SeenCoin = { pos: GridPos; reward: number };

type SnakeSnap = {
  key: string;
  head: GridPos;
  prevLength: number;
  length: number;
};

/**
 * One entry per chain that just captured.
 * A longer body counts even when the food was placed after the last tick,
 * which is how the lab baits each step. A coin vanishing under the head
 * still counts when the chain is already at full length and does not grow.
 */
export function planCaptureAnims(
  prevCoins: SeenCoin[],
  coins: { pos: GridPos }[],
  snakes: SnakeSnap[]
): PlannedCapture[] {
  const plans: PlannedCapture[] = [];
  for (const snake of snakes) {
    const grew = snake.prevLength >= 0 && snake.length > snake.prevLength;
    const eaten = prevCoins.find(
      (prev) =>
        prev.pos[0] === snake.head[0] &&
        prev.pos[1] === snake.head[1] &&
        !coins.some(
          (coin) => coin.pos[0] === prev.pos[0] && coin.pos[1] === prev.pos[1]
        )
    );
    if (!grew && !eaten) continue;
    plans.push({
      key: snake.key,
      head: [snake.head[0], snake.head[1]],
      reward: eaten ? eaten.reward : 2,
      grew,
    });
  }
  return plans;
}

/** How long the new tail block takes to reach the cell. */
export const TAIL_GROW_MS = 250;

/** Grows from nothing to the cell. The scale stays inside the cell. */
export function tailGrowScale(elapsedMs: number, durationMs = TAIL_GROW_MS): number {
  const t = Math.max(0, Math.min(1, elapsedMs / durationMs));
  return 1 - (1 - t) ** 2;
}

/** Keep food that appeared between ticks, so the next eat still sees it leave. */
export function retainFreshCoins(
  prev: SeenCoin[],
  current: SeenCoin[]
): SeenCoin[] {
  const next = prev.map(
    (coin) =>
      ({
        pos: [coin.pos[0], coin.pos[1]] as GridPos,
        reward: coin.reward,
      }) satisfies SeenCoin
  );
  for (const coin of current) {
    const known = next.some(
      (prevCoin) =>
        prevCoin.pos[0] === coin.pos[0] && prevCoin.pos[1] === coin.pos[1]
    );
    if (!known) next.push({ pos: [coin.pos[0], coin.pos[1]], reward: coin.reward });
  }
  return next;
}
