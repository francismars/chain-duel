import type {
  Direction,
  GameState,
  GridPos,
  SnakeState,
} from '@/game/engine/types';

export type Rider = 'p1' | 'p2' | 'p3' | 'p4';
export type StepKind =
  'ok' | 'blocked' | 'wall' | 'self' | 'opponent' | 'headon';

const SEARCH_CAP = 8000;

export function face(from: GridPos, to: GridPos): Direction {
  if (to[0] > from[0]) return 'Right';
  if (to[0] < from[0]) return 'Left';
  if (to[1] > from[1]) return 'Down';
  return 'Up';
}

function opposite(dir: Direction): Direction {
  if (dir === 'Left') return 'Right';
  if (dir === 'Right') return 'Left';
  if (dir === 'Up') return 'Down';
  if (dir === 'Down') return 'Up';
  return '';
}

function same(a: GridPos, b: GridPos): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function inPlay(state: GameState, pos: GridPos): boolean {
  const border = state.shrinkBorder;
  if (border) {
    return (
      pos[0] >= border.left &&
      pos[0] <= border.right &&
      pos[1] >= border.top &&
      pos[1] <= border.bottom
    );
  }
  return (
    pos[0] >= 0 && pos[1] >= 0 && pos[0] < state.cols && pos[1] < state.rows
  );
}

export function cloneSnake(snake: SnakeState): SnakeState {
  return {
    head: [snake.head[0], snake.head[1]],
    body: snake.body.map((cell) => [cell[0], cell[1]]),
    dir: snake.dir,
    dirWanted: snake.dirWanted,
  };
}

/** Same tail extension as the match when a coinbase is eaten. */
export function appendTail(snake: SnakeState): void {
  if (snake.body.length === 0) {
    const [hx, hy] = snake.head;
    const d = snake.dir || snake.dirWanted;
    if (d === 'Right') snake.body.push([hx - 1, hy]);
    else if (d === 'Left') snake.body.push([hx + 1, hy]);
    else if (d === 'Down') snake.body.push([hx, hy - 1]);
    else snake.body.push([hx, hy + 1]);
    return;
  }
  const last = snake.body[snake.body.length - 1]!;
  const beforeLast =
    snake.body.length > 1 ? snake.body[snake.body.length - 2]! : snake.head;
  if (last[0] < beforeLast[0]) snake.body.push([last[0] - 1, last[1]]);
  else if (last[0] > beforeLast[0]) snake.body.push([last[0] + 1, last[1]]);
  else if (last[1] < beforeLast[1]) snake.body.push([last[0], last[1] - 1]);
  else snake.body.push([last[0], last[1] + 1]);
}

/** Slide one cell, then grow, matching moveSnake then increaseBody. */
export function commitMove(
  snake: SnakeState,
  next: GridPos,
  grow: boolean
): void {
  const [hx, hy] = snake.head;
  const dir = face(snake.head, next);
  snake.dir = dir;
  snake.dirWanted = dir;
  snake.body.unshift([hx, hy]);
  snake.body.pop();
  snake.head = [next[0], next[1]];
  if (grow) appendTail(snake);
}

function otherSnakes(state: GameState, rider: Rider): SnakeState[] {
  const snakes: SnakeState[] = [];
  if (rider !== 'p1') snakes.push(state.p1);
  if (rider !== 'p2') snakes.push(state.p2);
  state.extraSnakes.forEach((extra, index) => {
    const seat: Rider = index === 0 ? 'p3' : 'p4';
    if (seat !== rider) snakes.push(extra.snake);
  });
  return snakes;
}

function heading(snake: SnakeState): Direction {
  return snake.dir || snake.dirWanted;
}

/**
 * A step the match would refuse or punish.
 * Reverse is ignored. The tail cell is free because it leaves before the hit check.
 */
export function classifyStep(
  state: GameState,
  rider: Rider,
  snake: SnakeState,
  next: GridPos
): StepKind {
  if (
    Math.abs(next[0] - snake.head[0]) + Math.abs(next[1] - snake.head[1]) !==
    1
  ) {
    return 'blocked';
  }
  const dir = face(snake.head, next);
  const current = heading(snake);
  if (current && dir === opposite(current)) return 'blocked';
  if (!inPlay(state, next)) return 'wall';
  if (state.obstacleWalls.some((wall) => same(wall.pos, next))) return 'wall';
  const rivals = otherSnakes(state, rider);
  if (rivals.some((other) => same(other.head, next))) return 'headon';
  if (rivals.some((other) => other.body.some((cell) => same(cell, next)))) {
    return 'opponent';
  }
  const tail = snake.body[snake.body.length - 1];
  const onBody = snake.body.some((cell) => same(cell, next));
  if (onBody && !(tail && same(tail, next))) return 'self';
  return 'ok';
}

function growsOn(
  state: GameState,
  pos: GridPos,
  growOn: boolean,
  length: number,
  maxChain: number
): boolean {
  if (length >= maxChain) return false;
  if (growOn) return true;
  return state.coinbases.some((coin) => same(coin.pos, pos) && !coin.isDecoy);
}

export function projectSnake(
  state: GameState,
  rider: Rider,
  snake: SnakeState,
  steps: GridPos[],
  growOn: boolean,
  maxChain: number
): { snake: SnakeState; crashed: boolean } {
  const current = cloneSnake(snake);
  for (const step of steps) {
    const kind = classifyStep(state, rider, current, step);
    if (kind !== 'ok') return { snake: current, crashed: true };
    commitMove(
      current,
      step,
      growsOn(state, step, growOn, current.body.length, maxChain)
    );
  }
  return { snake: current, crashed: false };
}

function posKey(pos: GridPos): string {
  return `${pos[0]},${pos[1]}`;
}

function snakeKey(snake: SnakeState): string {
  return `${snake.dir}|${posKey(snake.head)}|${snake.body.map(posKey).join(';')}`;
}

function manhattan(a: GridPos, b: GridPos): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

const NEIGHBOR_DELTAS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function orderedNeighbors(snake: SnakeState): GridPos[] {
  const current = heading(snake);
  const [x, y] = snake.head;
  const cells = NEIGHBOR_DELTAS.map(([dx, dy]) => [x + dx, y + dy] as GridPos);
  cells.sort((a, b) => {
    const aStraight = face(snake.head, a) === current ? 0 : 1;
    const bStraight = face(snake.head, b) === current ? 0 : 1;
    return aStraight - bStraight;
  });
  return cells;
}

/**
 * Shortest walk to `target` that does not enter a body.
 * A click on a body or the dead zone ends with that fatal step so the chain dies there.
 * If the cell cannot be reached, the walk stops at the closest open cell.
 */
export function routeAround(
  state: GameState,
  rider: Rider,
  snake: SnakeState,
  target: GridPos,
  growOn: boolean,
  maxChain: number
): GridPos[] {
  if (same(snake.head, target)) return [];
  const start = cloneSnake(snake);
  type Node = { snake: SnakeState; steps: GridPos[] };
  const queue: Node[] = [{ snake: start, steps: [] }];
  const seen = new Set<string>([snakeKey(start)]);
  let best = { dist: manhattan(start.head, target), steps: [] as GridPos[] };
  let cursor = 0;
  let explored = 0;

  while (cursor < queue.length && explored < SEARCH_CAP) {
    const node = queue[cursor]!;
    cursor += 1;
    explored += 1;
    for (const next of orderedNeighbors(node.snake)) {
      const kind = classifyStep(state, rider, node.snake, next);
      if (kind === 'blocked') continue;
      const steps = [...node.steps, next];
      if (kind !== 'ok') {
        if (same(next, target)) return steps;
        continue;
      }
      if (same(next, target)) return steps;
      const grown = growsOn(
        state,
        next,
        growOn,
        node.snake.body.length,
        maxChain
      );
      const moved = cloneSnake(node.snake);
      commitMove(moved, next, grown);
      const key = snakeKey(moved);
      if (seen.has(key)) continue;
      seen.add(key);
      const dist = manhattan(next, target);
      if (dist < best.dist) best = { dist, steps };
      queue.push({ snake: moved, steps });
    }
  }
  return best.steps;
}
