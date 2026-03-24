import {
  CAPTURE_LEVELS,
  COUNTDOWN_END_TICK,
  GAME_COLS,
  GAME_ROWS,
  OVERCLOCK_MIN_STEP_MS,
  OVERCLOCK_SPEED_REDUCTION_MS,
  OVERCLOCK_STEP_INTERVAL_TICKS,
  CONVERGENCE_SHRINK_INTERVAL_TICKS,
  CONVERGENCE_WARNING_TICKS,
  CONVERGENCE_MIN_COLS,
  CONVERGENCE_MIN_ROWS,
  POWERUP_FIRST_SPAWN_TICKS,
  POWERUP_RESPAWN_COOLDOWN_TICKS,
  POWERUP_SURGE_DURATION_TICKS,
  POWERUP_FREEZE_DURATION_TICKS,
  POWERUP_PHANTOM_DURATION_TICKS,
  POWERUP_ANCHOR_DURATION_TICKS,
  POWERUP_AMPLIFIER_CHARGES,
  POWERUP_SPAWN_WEIGHTS,
  VOID_CELLS_TOGGLE_INTERVAL_TICKS,
  VOID_CELLS_COUNT,
  CHAIN_ABILITY_SHADOW_STEP_SAFE_RADIUS,
  LABYRINTH_REGEN_INTERVAL_TICKS,
  LABYRINTH_REGEN_WARNING_TICKS,
  STEP_SPEED_MS,
} from '@/game/engine/constants';
import type {
  AiTier,
  Board3DLayer,
  Coinbase,
  Direction,
  ExtraSnake,
  GameMeta,
  GameState,
  GridPos,
  HudState,
  PlayerId,
  PowerUpType,
  TeamMode,
  TeleportDoor,
  TickResult,
} from '@/game/engine/types';
import { getGauntletLevel } from '@/game/engine/gauntletLevels';

// ============================================================================
// Maze generation (recursive backtracking / iterative DFS)
// ============================================================================

/** Mulberry32 — fast, deterministic 32-bit PRNG from a numeric seed. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a maze using iterative DFS backtracking.
 *
 * corridorWidth=1 (default — period-2 grid, 51×25 → 25×12 cells):
 *   Cells at odd positions (1,1)…(49,23). Corridors 1 cell wide.
 *   loopFactor/cornerFactor can post-process to add shortcuts or wider junctions.
 *
 * corridorWidth=2 (period-3 grid, 51×25 → 16×8 cells):
 *   Each passage is 2 cells wide with 1-cell-thick walls. No post-processing —
 *   walls are always fully closed (perfect maze). loopFactor/cornerFactor ignored.
 *   Maze units: mazeW = floor((cols-3)/3) = 16, mazeH = floor((rows-1)/3) = 8.
 *   Each unit (mx,my) occupies cell cols [1+3mx, 2+3mx], rows [1+3my, 2+3my].
 */
export function generateMaze(
  cols: number,
  rows: number,
  seed: number,
  loopFactor = 0,
  cornerFactor = 0,
  corridorWidth: 1 | 2 | 4 | 5 = 1,
  sections = 1,
): import('@/game/engine/types').ObstacleWall[] {
  if (sections === 3) return generate3SectionMaze(cols, rows, seed);
  if (corridorWidth === 5) return generatePeriodMaze(cols, rows, seed, 6);
  if (corridorWidth === 4) return generatePeriodMaze(cols, rows, seed, 5);
  if (corridorWidth === 2) return generatePeriodMaze(cols, rows, seed, 3);
  return generateNarrowMaze(cols, rows, seed, loopFactor, cornerFactor);
}

/** Period-2 maze — 1-cell-wide corridors, optional loops/corner-opening. */
function generateNarrowMaze(
  cols: number,
  rows: number,
  seed: number,
  loopFactor: number,
  cornerFactor: number,
): import('@/game/engine/types').ObstacleWall[] {
  const rng = mulberry32(seed);
  const mazeW = (cols - 1) / 2;
  const mazeH = (rows - 1) / 2;
  const visited: boolean[][] = Array.from({ length: mazeH }, () => new Array(mazeW).fill(false));
  const openGaps = new Set<string>();

  // Iterative DFS
  const stack: [number, number][] = [];
  const startX = Math.floor(rng() * mazeW);
  const startY = Math.floor(rng() * mazeH);
  visited[startY][startX] = true;
  stack.push([startX, startY]);
  const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  while (stack.length > 0) {
    const [cx, cy] = stack[stack.length - 1];
    const dirs: [number, number][] = DIRS.map((d) => [d[0], d[1]]);
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    let moved = false;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < mazeW && ny >= 0 && ny < mazeH && !visited[ny][nx]) {
        openGaps.add(`${2 * cx + 1 + dx},${2 * cy + 1 + dy}`);
        visited[ny][nx] = true;
        stack.push([nx, ny]);
        moved = true;
        break;
      }
    }
    if (!moved) stack.pop();
  }

  // Optional loops
  if (loopFactor > 0) {
    const passageWalls: string[] = [];
    for (let c = 1; c < cols - 1; c++) {
      for (let r = 1; r < rows - 1; r++) {
        if ((c % 2 === 1 && r % 2 === 1) || (c % 2 === 0 && r % 2 === 0)) continue;
        if (!openGaps.has(`${c},${r}`)) passageWalls.push(`${c},${r}`);
      }
    }
    for (let i = passageWalls.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [passageWalls[i], passageWalls[j]] = [passageWalls[j], passageWalls[i]];
    }
    const toOpen = Math.floor(passageWalls.length * loopFactor);
    for (let i = 0; i < toOpen; i++) openGaps.add(passageWalls[i]);
  }

  // Optional corner-widening
  if (cornerFactor > 0) {
    const corners: string[] = [];
    for (let c = 2; c < cols - 1; c += 2)
      for (let r = 2; r < rows - 1; r += 2)
        corners.push(`${c},${r}`);
    for (let i = corners.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [corners[i], corners[j]] = [corners[j], corners[i]];
    }
    const toOpen = Math.floor(corners.length * cornerFactor);
    for (let i = 0; i < toOpen; i++) openGaps.add(corners[i]);
  }

  const walls: import('@/game/engine/types').ObstacleWall[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (c % 2 === 1 && r % 2 === 1) continue;
      if (openGaps.has(`${c},${r}`)) continue;
      walls.push({ pos: [c, r] });
    }
  }
  return walls;
}

/**
 * Generic period-P maze — (P-1)-cell-wide corridors, 1-cell-thick walls.
 *
 * P=3 → 2-cell corridors (16×8 units on 51×25)
 * P=5 → 4-cell corridors (10×4 units)
 * P=6 → 5-cell corridors ( 8×4 units)
 *
 * Unit (mx,my): cols [1+P*mx .. P-1+P*mx], rows [1+P*my .. P-1+P*my].
 * Passage between adjacent units: open all P-1 cells in the shared wall strip.
 */
function generatePeriodMaze(
  cols: number,
  rows: number,
  seed: number,
  P: number,
): import('@/game/engine/types').ObstacleWall[] {
  const rng = mulberry32(seed);
  const mazeW = Math.floor((cols - 1) / P);
  const mazeH = Math.floor((rows - 1) / P);
  const visited: boolean[][] = Array.from({ length: mazeH }, () => new Array(mazeW).fill(false));
  const openGaps = new Set<string>();

  const stack: [number, number][] = [];
  const startX = Math.floor(rng() * mazeW);
  const startY = Math.floor(rng() * mazeH);
  visited[startY][startX] = true;
  stack.push([startX, startY]);
  const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  while (stack.length > 0) {
    const [cx, cy] = stack[stack.length - 1];
    const dirs: [number, number][] = DIRS.map((d) => [d[0], d[1]]);
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    let moved = false;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < mazeW && ny >= 0 && ny < mazeH && !visited[ny][nx]) {
        if (dx === 1) {
          const wc = P * (cx + 1);
          for (let k = 1; k < P; k++) openGaps.add(`${wc},${P * cy + k}`);
        } else if (dx === -1) {
          const wc = P * cx;
          for (let k = 1; k < P; k++) openGaps.add(`${wc},${P * cy + k}`);
        } else if (dy === 1) {
          const wr = P * (cy + 1);
          for (let k = 1; k < P; k++) openGaps.add(`${P * cx + k},${wr}`);
        } else {
          const wr = P * cy;
          for (let k = 1; k < P; k++) openGaps.add(`${P * cx + k},${wr}`);
        }
        visited[ny][nx] = true;
        stack.push([nx, ny]);
        moved = true;
        break;
      }
    }
    if (!moved) stack.pop();
  }

  const walls: import('@/game/engine/types').ObstacleWall[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const isCell = c >= 1 && c <= P * mazeW - 1 && c % P !== 0
                  && r >= 1 && r <= P * mazeH - 1 && r % P !== 0;
      if (isCell) continue;
      if (openGaps.has(`${c},${r}`)) continue;
      walls.push({ pos: [c, r] });
    }
  }
  return walls;
}

/**
 * Triple-section maze — three horizontally-stacked narrow (period-2) mazes
 * connected by short passage shafts through the separator rows.
 *
 * Sections (rows):  0–7 | 9–16 | 18–24   (separator rows 8 and 17 are full walls
 * except for 2–3 connector shafts each, spanning row-1 / sep / row+1).
 */
function generate3SectionMaze(
  cols: number,
  rows: number,
  seed: number,
): import('@/game/engine/types').ObstacleWall[] {
  const rng = mulberry32(seed);
  const openGaps = new Set<string>();
  const sections: [number, number][] = [[0, 7], [9, 16], [18, rows - 1]];
  const separators = [8, 17];

  for (const [sStart, sEnd] of sections) {
    const sH = sEnd - sStart + 1;
    const mW = (cols - 1) / 2;
    const mH = Math.floor((sH - 1) / 2);
    if (mW <= 0 || mH <= 0) continue;
    const visited: boolean[][] = Array.from({ length: mH }, () => new Array(mW).fill(false));
    const stack: [number, number][] = [];
    const sx = Math.floor(rng() * mW);
    const sy = Math.floor(rng() * mH);
    visited[sy][sx] = true;
    stack.push([sx, sy]);
    const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    while (stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1];
      const dirs: [number, number][] = DIRS.map((d) => [d[0], d[1]]);
      for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
      }
      let moved = false;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < mW && ny >= 0 && ny < mH && !visited[ny][nx]) {
          openGaps.add(`${2 * cx + 1 + dx},${sStart + 2 * cy + 1 + dy}`);
          visited[ny][nx] = true;
          stack.push([nx, ny]);
          moved = true;
          break;
        }
      }
      if (!moved) stack.pop();
    }
  }

  // Connector shafts: open (c, sep-1), (c, sep), (c, sep+1) at 2–3 odd columns
  for (const sep of separators) {
    const oddCols = Array.from({ length: Math.floor((cols - 1) / 2) }, (_, i) => 2 * i + 1);
    for (let i = oddCols.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [oddCols[i], oddCols[j]] = [oddCols[j], oddCols[i]];
    }
    const n = 2 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const c = oddCols[k];
      openGaps.add(`${c},${sep - 1}`);
      openGaps.add(`${c},${sep}`);
      openGaps.add(`${c},${sep + 1}`);
    }
  }

  const walls: import('@/game/engine/types').ObstacleWall[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      // Default open cells: inside sections at odd-odd positions
      let isDefaultOpen = false;
      if (!separators.includes(r)) {
        for (const [sStart, sEnd] of sections) {
          if (r < sStart || r > sEnd) continue;
          if (c % 2 === 1 && (r - sStart) % 2 === 1) isDefaultOpen = true;
        }
      }
      if (isDefaultOpen) continue;
      if (openGaps.has(`${c},${r}`)) continue;
      walls.push({ pos: [c, r] });
    }
  }
  return walls;
}

// ============================================================================
// Extra-snake helpers

/** Tail cell opposite the initial facing direction (head + 1 segment). */
function bodySegmentBehindHead(
  head: GridPos,
  dirWanted: Exclude<Direction, ''>,
): GridPos {
  const [x, y] = head;
  switch (dirWanted) {
    case 'Right': return [x - 1, y];
    case 'Left': return [x + 1, y];
    case 'Down': return [x, y - 1];
    case 'Up': return [x, y + 1];
    default: return [x - 1, y];
  }
}

function makeExtraSnake(
  spawnHead: GridPos,
  spawnDir: Direction,
  teamId: 0 | 1,
  color: number,
  name: string,
  aiTier: AiTier,
  humanControlled: boolean,
  outline?: number,
): ExtraSnake {
  const d: Exclude<Direction, ''> = spawnDir === '' ? 'Right' : spawnDir;
  const tail = bodySegmentBehindHead([spawnHead[0], spawnHead[1]], d);
  return {
    snake: {
      head: [spawnHead[0], spawnHead[1]],
      body: [tail],
      dir: '',
      dirWanted: spawnDir,
    },
    teamId, color, outline, name, score: 0, aiTier, humanControlled, spawnHead, spawnDir,
  };
}

/** Return one tier below the given tier (floor = wanderer). */
function downTier(tier: AiTier): AiTier {
  const order: AiTier[] = ['wanderer', 'hunter', 'tactician', 'sovereign'];
  const i = order.indexOf(tier);
  return order[Math.max(0, i - 1)];
}

// ============================================================================
// Public API types
// ============================================================================

interface CreateStateArgs {
  p1Name: string;
  p2Name: string;
  p1Points: number;
  p2Points: number;
  modeLabel: string;
  practiceMode?: boolean;
  isTournament?: boolean;
  sovereignMode?: boolean;
  aiTier?: AiTier;
  overclockMode?: boolean;
  overclockStartStepMs?: number;
  overclockMinStepMs?: number;
  overclockStepIntervalTicks?: number;
  overclockSpeedReductionMs?: number;
  convergenceMode?: boolean;
  convergenceShrinkInterval?: number;
  convergenceMinCols?: number;
  convergenceMinRows?: number;
  convergenceStepMs?: number;
  powerupMode?: boolean;
  gauntletMode?: boolean;
  gauntletLevel?: number;
  bountyMode?: boolean;
  labyrinthMode?: boolean;
  labyrinthLoopFactor?: number;
  labyrinthCornerFactor?: number;
  labyrinthRegenInterval?: number;
  labyrinthStepMs?: number;
  labyrinthCorridorWidth?: 1 | 2 | 4 | 5;
  labyrinthSections?: 1 | 3;
  labyrinthTeleports?: boolean;
  teamMode?: TeamMode;
  teamAllyAiTier?: AiTier;    // P3 tier in teams mode (defaults to one below opponent)
  teamEnemyAiTier?: AiTier;   // P4 tier in teams mode (defaults to same as aiTier)
  ffaAiTier?: AiTier;         // tier for P2/P3/P4 in FFA (defaults to aiTier)
  p1Human?: boolean;
  p2Human?: boolean;
  /** Extra snakes (teams/FFA slot 3 & 4). Default false = AI when omitted. */
  p3Human?: boolean;
  p4Human?: boolean;
}

// ============================================================================
// createGameState
// ============================================================================

export function createGameState(args: CreateStateArgs): GameState {
  const p1 = Math.max(1, Math.floor(args.p1Points));
  const p2 = Math.max(1, Math.floor(args.p2Points));

  const gauntletLevel = args.gauntletLevel ?? 1;
  const levelConfig = args.gauntletMode ? getGauntletLevel(gauntletLevel) : null;

  const initialCoinbases: Coinbase[] = levelConfig?.initialCoinbasePositions.length
    ? levelConfig.initialCoinbasePositions.map((pos) => ({ pos: [pos[0], pos[1]] }))
    : [{ pos: [25, 12] }];

  const startStepMs = levelConfig?.startStepMs ?? STEP_SPEED_MS;

  // Labyrinth: generate maze, adjust spawn positions
  const labyrinthMode = args.labyrinthMode ?? false;
  const labyrinthLoopFactor = args.labyrinthLoopFactor ?? 0;
  const labyrinthCornerFactor = args.labyrinthCornerFactor ?? 0;
  const labyrinthRegenInterval = args.labyrinthRegenInterval ?? LABYRINTH_REGEN_INTERVAL_TICKS;
  const labyrinthCorridorWidth = (args.labyrinthCorridorWidth ?? 1) as 1 | 2 | 4 | 5;
  const labyrinthSections = (args.labyrinthSections ?? 1) as 1 | 3;
  const labyrinthTeleports = args.labyrinthTeleports ?? false;
  const labyrinthSeed = labyrinthMode ? Math.floor(Math.random() * 0xFFFFFFFF) : 0;
  const mazeWalls = labyrinthMode
    ? generateMaze(GAME_COLS, GAME_ROWS, labyrinthSeed, labyrinthLoopFactor, labyrinthCornerFactor, labyrinthCorridorWidth, labyrinthSections)
    : [];

  // Spawn corners differ between maze types:
  //   width=1, sections=1: P1=(1,1),  P2=(49,23)
  //   width=2 (P=3):       P1=(1,1),  P2=(47,22)
  //   width=4 (P=5):       P1=(1,1),  P2=(47,17)
  //   width=5 (P=6):       P1=(1,1),  P2=(43,19)  (last cell in last P=6 unit)
  //   sections=3:          P1=(1,1),  P2=(49,23)
  const p1StartPos: GridPos = labyrinthMode ? [1, 1] : [6, 12];
  const p2StartPos: GridPos = labyrinthMode
    ? (labyrinthCorridorWidth === 5 ? [43, 19] : labyrinthCorridorWidth === 4 ? [47, 17] : labyrinthCorridorWidth === 2 ? [47, 22] : [49, 23])
    : [44, 12];
  const p1BodyPos: GridPos[] = labyrinthMode ? [] : [[5, 12]];
  const p2BodyPos: GridPos[] = labyrinthMode ? [] : [[45, 12]];

  // Initial coinbase: safe center cell for each maze type
  const initialCoinbasePos: GridPos =
    labyrinthCorridorWidth === 5 ? [25, 13] :   // period-6 center-ish cell
    labyrinthCorridorWidth === 4 ? [26, 11] :   // period-5 center-ish cell
    labyrinthSections === 3      ? [25, 13] :   // section 2 center
    [25, 13];                                   // standard
  const mazeInitialCoinbase: Coinbase[] = labyrinthMode
    ? [{ pos: initialCoinbasePos }]
    : initialCoinbases;

  const gauntletAiOpponent =
    (args.gauntletMode ?? false) &&
    getGauntletLevel(gauntletLevel).modifiers.includes('ai_opponent');
  const defaultP2Human = !(
    Boolean(args.practiceMode) ||
    Boolean(args.sovereignMode) ||
    gauntletAiOpponent
  );
  const p1HumanMeta = args.p1Human !== undefined ? Boolean(args.p1Human) : true;
  const p2HumanMeta = args.p2Human !== undefined ? Boolean(args.p2Human) : defaultP2Human;

  const state: GameState = {
    cols: GAME_COLS,
    rows: GAME_ROWS,
    p1: {
      head: p1StartPos,
      body: p1BodyPos,
      dir: '',
      dirWanted: 'Right',
    },
    p2: {
      head: p2StartPos,
      body: p2BodyPos,
      dir: '',
      dirWanted: 'Left',
    },
    coinbases: labyrinthMode ? mazeInitialCoinbase : initialCoinbases,
    gameStarted: false,
    gameEnded: false,
    countdownStart: false,
    countdownTicks: 0,
    winnerPlayer: null,
    winnerName: '',
    sentWinner: false,
    initialScore: [p1, p2],
    score: [p1, p2],
    totalPoints: p1 + p2,
    currentCaptureP1: '2%',
    currentCaptureP2: '2%',
    pointChanges: [],
    p1Name: args.p1Name,
    p2Name: args.p2Name,
    meta: {
      modeLabel: args.modeLabel,
      practiceMode: args.practiceMode ?? false,
      p1Human: p1HumanMeta,
      p2Human: p2HumanMeta,
      isTournament: args.isTournament ?? false,
      sovereignMode: args.sovereignMode ?? false,
      aiTier: args.aiTier ?? 'hunter',
      overclockMode: args.overclockMode ?? false,
      overclockMinStepMs: args.overclockMinStepMs ?? OVERCLOCK_MIN_STEP_MS,
      overclockStepIntervalTicks: args.overclockStepIntervalTicks ?? OVERCLOCK_STEP_INTERVAL_TICKS,
      overclockSpeedReductionMs: args.overclockSpeedReductionMs ?? OVERCLOCK_SPEED_REDUCTION_MS,
      convergenceMode: args.convergenceMode ?? false,
      convergenceShrinkInterval: args.convergenceShrinkInterval ?? CONVERGENCE_SHRINK_INTERVAL_TICKS,
      convergenceMinCols: args.convergenceMinCols ?? CONVERGENCE_MIN_COLS,
      convergenceMinRows: args.convergenceMinRows ?? CONVERGENCE_MIN_ROWS,
      powerupMode: args.powerupMode ?? false,
      gauntletMode: args.gauntletMode ?? false,
      gauntletLevel,
      bountyMode: args.bountyMode ?? false,
      labyrinthMode,
      labyrinthLoopFactor,
      labyrinthCornerFactor,
      labyrinthRegenInterval,
      labyrinthCorridorWidth,
      labyrinthSections,
      labyrinthTeleports,
      teamMode: (args.teamMode ?? 'solo') as TeamMode,
      layers3D: Boolean(levelConfig?.modifiers.includes('layers_3d')),
      invisibleGrid: Boolean(levelConfig?.modifiers.includes('invisible_grid')),
      currentStepMs: args.labyrinthStepMs ?? args.convergenceStepMs ?? args.overclockStartStepMs ?? startStepMs,
      p1ChainAbilityAvailable: Boolean(args.powerupMode || args.bountyMode),
      p2ChainAbilityAvailable: Boolean(args.powerupMode || args.bountyMode),
    },
    tickCount: 0,
    powerUpItems: [],
    activePowerUps: [],
    obstacleWalls: labyrinthMode
      ? mazeWalls
      : levelConfig
        ? levelConfig.obstacleWalls.map((pos) => ({ pos }))
        : [],
    shrinkBorder: (args.convergenceMode || levelConfig?.modifiers.includes('shrinking_border'))
      ? { top: 0, bottom: GAME_ROWS - 1, left: 0, right: GAME_COLS - 1, warningActive: false }
      : null,
    powerUpRespawnCooldownTick: POWERUP_FIRST_SPAWN_TICKS,
    gauntletStartTick: 0,
    gauntletCompleted: false,
    gauntletElapsedSecs: 0,
    voidCells: [],
    voidCellsNextToggleTick: args.gauntletMode && levelConfig?.modifiers.includes('void_cells')
      ? VOID_CELLS_TOGGLE_INTERVAL_TICKS
      : Number.POSITIVE_INFINITY,
    labyrinthSeed,
    labyrinthNextRegenTick: labyrinthMode && labyrinthRegenInterval > 0
      ? labyrinthRegenInterval
      : Number.POSITIVE_INFINITY,
    convergenceWallClosed: false,
    teleportDoors: [],
    extraSnakes: [],
    board3DLayers: [],
    p1Layer: 0,
    p2Layer: 0,
    layerSwitchCooldown: 0,
  };
  // Gauntlet 3D layers: build the alternate board layer from altLayerWalls
  if (levelConfig?.modifiers.includes('layers_3d') && levelConfig.altLayerWalls) {
    const altWalls: Board3DLayer = {
      obstacleWalls: levelConfig.altLayerWalls.map((pos) => ({ pos })),
    };
    state.board3DLayers = [altWalls];
    // Assign initial coinbases to alternating layers
    state.coinbases.forEach((cb, i) => { cb.layer = (i % 2 === 0 ? 0 : 1) as 0 | 1; });
  }
  if (labyrinthMode && labyrinthTeleports) {
    state.teleportDoors = makeTeleportDoors(state, 2);
  }
  // Gauntlet moving walls — populate initial wall cells
  if (levelConfig?.modifiers.includes('moving_walls')) {
    initMovingWalls(state);
  }

  // Gauntlet portal levels — large min-pair-dist so every crossing is meaningful
  if (levelConfig?.modifiers.includes('portals')) {
    const pairs = levelConfig.portalPairs ?? 2;
    state.teleportDoors = makeTeleportDoors(state, pairs, 24, 8);
  }

  // ── Spawn extra snakes for teams / FFA ──────────────────────────────────
  const teamMode = args.teamMode ?? 'solo';
  const p3Human = args.p3Human === true;
  const p4Human = args.p4Human === true;
  if (teamMode === 'teams') {
    const allyTier  = args.teamAllyAiTier  ?? downTier(args.aiTier ?? 'hunter');
    const enemyTier = args.teamEnemyAiTier ?? (args.aiTier ?? 'hunter');
    state.extraSnakes = [
      // Ally:   white + blue border
      makeExtraSnake([4, 15],  'Right', 0, 0xffffff, 'Ally',   allyTier,  p3Human, 0x3366FF),
      // Shadow: visible dark grey + blue border (0x111111 is invisible on dark bg)
      makeExtraSnake([46, 15], 'Left',  1, 0x3a3a3a, 'Shadow', enemyTier, p4Human, 0x3366FF),
    ];
    // Spread P1/P2 to top slots so allies start below (head + 1 body like 1v1)
    {
      const h1: GridPos = [4, 9];
      const h2: GridPos = [46, 9];
      state.p1.head = h1;
      state.p1.body = [bodySegmentBehindHead(h1, 'Right')];
      state.p2.head = h2;
      state.p2.body = [bodySegmentBehindHead(h2, 'Left')];
    }
  } else if (teamMode === 'ffa') {
    const fTier = args.ffaAiTier ?? (args.aiTier ?? 'hunter');
    // Spread 4 snakes to corners
    {
      const h1: GridPos = [4, 4];
      const h2: GridPos = [46, 4];
      state.p1.head = h1;
      state.p1.body = [bodySegmentBehindHead(h1, 'Right')];
      state.p2.head = h2;
      state.p2.body = [bodySegmentBehindHead(h2, 'Left')];
    }
    state.p2.dirWanted = 'Left';
    state.extraSnakes = [
      makeExtraSnake([46, 20], 'Left',  1, 0x777777, 'Ghost',   fTier, p3Human),
      makeExtraSnake([4,  20], 'Right', 1, 0xAAAAAA, 'Specter', fTier, p4Human),
    ];
  }

  return state;
}

// ============================================================================
// getHudState
// ============================================================================

export function getHudState(state: GameState): HudState {
  const initialWidthP1 = (state.initialScore[0] * 100) / state.totalPoints;
  const initialWidthP2 = (state.initialScore[1] * 100) / state.totalPoints;
  const currentWidthP1 = (state.score[0] * 100) / state.totalPoints;
  const currentWidthP2 = (state.score[1] * 100) / state.totalPoints;
  return {
    p1Points: state.score[0],
    p2Points: state.score[1],
    captureP1: getCaptureLabel(state.p1.body.length, state),
    captureP2: getCaptureLabel(state.p2.body.length, state),
    initialWidthP1,
    initialWidthP2,
    currentWidthP1,
    currentWidthP2,
  };
}

export function startCountdown(state: GameState): void {
  if (!state.gameStarted) {
    state.countdownStart = true;
  }
}

export function setWantedDirection(
  state: GameState,
  player: PlayerId,
  dir: Exclude<Direction, ''>
): void {
  const snake = player === 'P1' ? state.p1 : state.p2;
  if (!state.gameStarted) {
    if (player === 'P1') {
      if (dir === 'Right') snake.dirWanted = dir;
    } else if (player === 'P2') {
      if (dir === 'Left') snake.dirWanted = dir;
    }
    return;
  }
  if (player === 'P1') {
    if (dir === 'Left' && (snake.dir === 'Up' || snake.dir === 'Down')) snake.dirWanted = 'Left';
    if (dir === 'Right' && (snake.dir === 'Up' || snake.dir === 'Down' || snake.dir === '')) snake.dirWanted = 'Right';
    if (dir === 'Up' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Up';
    if (dir === 'Down' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Down';
    return;
  }
  if (dir === 'Left' && (snake.dir === 'Up' || snake.dir === 'Down' || snake.dir === '')) snake.dirWanted = 'Left';
  if (dir === 'Right' && (snake.dir === 'Up' || snake.dir === 'Down')) snake.dirWanted = 'Right';
  if (dir === 'Up' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Up';
  if (dir === 'Down' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Down';
}

/** Steer P3/P4 (extraSnakes[0] / extraSnakes[1]) when `humanControlled` is set. */
export function setExtraSnakeWantedDirection(
  state: GameState,
  index: number,
  dir: Exclude<Direction, ''>
): void {
  const extra = state.extraSnakes[index];
  if (!extra?.humanControlled) return;
  const snake = extra.snake;
  const spawn = extra.spawnDir;
  if (!state.gameStarted) {
    if (dir === spawn) snake.dirWanted = dir;
    return;
  }
  if (dir === 'Left' && (snake.dir === 'Up' || snake.dir === 'Down' || snake.dir === '')) snake.dirWanted = 'Left';
  if (dir === 'Right' && (snake.dir === 'Up' || snake.dir === 'Down')) snake.dirWanted = 'Right';
  if (dir === 'Up' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Up';
  if (dir === 'Down' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Down';
}

// ============================================================================
// Activate chain special ability
// ============================================================================

export function activateChainAbility(state: GameState, player: PlayerId): void {
  if (!state.gameStarted || state.gameEnded) return;
  if (!state.meta.powerupMode && !state.meta.bountyMode) return;

  if (player === 'P1' && state.meta.p1ChainAbilityAvailable) {
    // RADIANCE: reveals all coinbase positions (flash effect, visual only — handled by renderer)
    state.meta.p1ChainAbilityAvailable = false;
    state.activePowerUps.push({
      type: 'SURGE',
      player: 'P1',
      expiresAtTick: state.tickCount + 15,
    });
  } else if (player === 'P2' && state.meta.p2ChainAbilityAvailable) {
    // SHADOW STEP: teleport P2 to a safe random position
    state.meta.p2ChainAbilityAvailable = false;
    const safePos = findSafeTeleportPos(state, 'P2');
    if (safePos) {
      state.p2.head = safePos;
      state.p2.body = [[safePos[0] - 1, safePos[1]]];
      state.p2.dir = 'Right';
      state.p2.dirWanted = 'Right';
    }
  }
}

function findSafeTeleportPos(state: GameState, player: PlayerId): GridPos | null {
  const opponent = player === 'P1' ? state.p2 : state.p1;
  const border = state.shrinkBorder;
  const minX = border ? border.left + 1 : 2;
  const maxX = border ? border.right - 1 : state.cols - 3;
  const minY = border ? border.top + 1 : 2;
  const maxY = border ? border.bottom - 1 : state.rows - 3;

  for (let attempts = 0; attempts < 200; attempts++) {
    const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
    const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
    const pos: GridPos = [x, y];
    const distFromOpponent = Math.hypot(pos[0] - opponent.head[0], pos[1] - opponent.head[1]);
    if (distFromOpponent >= CHAIN_ABILITY_SHADOW_STEP_SAFE_RADIUS && !hasCollisionAt(state, pos)) {
      return pos;
    }
  }
  return null;
}

// ============================================================================
// stepGame — main tick
// ============================================================================

export function stepGame(state: GameState): TickResult {
  const prevWinner = state.winnerPlayer;

  if (state.gameStarted && !state.gameEnded) {
    state.tickCount += 1;

    // Overclock: speed up every N ticks
    if (state.meta.overclockMode) {
      tickOverclock(state);
    }

    // Convergence: shrink border
    if (state.meta.convergenceMode && state.shrinkBorder) {
      tickConvergence(state);
    }

    // Gauntlet: shrinking border modifier
    if (state.meta.gauntletMode && state.meta.gauntletLevel >= 6 && state.shrinkBorder) {
      const interval = state.meta.gauntletLevel === 10 ? 80 : 100;
      if (state.tickCount % interval === 0) {
        advanceShrinkBorder(state);
      }
    }

    // Gauntlet: moving walls (level 4)
    if (state.meta.gauntletMode) {
      tickMovingWalls(state);
    }

    // Void cells toggle
    if (state.voidCellsNextToggleTick <= state.tickCount) {
      regenerateVoidCells(state);
      state.voidCellsNextToggleTick = state.tickCount + VOID_CELLS_TOGGLE_INTERVAL_TICKS;
    }

    // Labyrinth: periodic maze regeneration
    if (state.meta.labyrinthMode) {
      tickLabyrinth(state);
    }

    // Power-up spawn
    if (state.meta.powerupMode && state.powerUpItems.length === 0 &&
        state.tickCount >= state.powerUpRespawnCooldownTick) {
      spawnPowerUp(state);
    }

    // Expire timed obstacle walls (ANCHOR)
    state.obstacleWalls = state.obstacleWalls.filter(
      (w) => w.expiresAtTick === undefined || w.expiresAtTick > state.tickCount
    );

    // Expire active power-ups
    const expiredPowerUps = state.activePowerUps.filter(
      (ap) => ap.expiresAtTick <= state.tickCount && ap.chargesLeft === undefined
    );
    state.activePowerUps = state.activePowerUps.filter(
      (ap) => ap.expiresAtTick > state.tickCount || ap.chargesLeft !== undefined
    );

    // Remove ANCHOR walls from expired ANCHOR power-ups
    for (const expired of expiredPowerUps) {
      if (expired.type === 'ANCHOR') {
        // Walls already expire by their own tick — no action needed
      }
    }

    // 3D layers: P2 AI occasionally follows P1 to their layer
    if (state.meta.layers3D && state.meta.gauntletMode) {
      if (state.tickCount % 30 === 0 && state.p2Layer !== state.p1Layer) {
        if (Math.random() < 0.45) state.p2Layer = state.p1Layer;
      }
    }

    // AI decision — pathfinding helpers treat P2 as the bot; swap when P1 is the bot.
    if (!state.meta.p1Human) {
      swapP1P2Snakes(state);
      decideAiDirection(state);
      swapP1P2Snakes(state);
    }
    if (!state.meta.p2Human) {
      decideAiDirection(state);
    }

    // Check FREEZE: slow P1/P2 (player field = the affected snake)
    const p1Frozen = state.activePowerUps.some(
      (ap) => ap.type === 'FREEZE' && ap.player === 'P1'
    );
    const p2Frozen = state.activePowerUps.some(
      (ap) => ap.type === 'FREEZE' && ap.player === 'P2'
    );

    // SURGE: extra tick for surging player
    const p1Surging = state.activePowerUps.some(
      (ap) => ap.type === 'SURGE' && ap.player === 'P1'
    );
    const p2Surging = state.activePowerUps.some(
      (ap) => ap.type === 'SURGE' && ap.player === 'P2'
    );

    const p1ShouldMove = !p1Frozen || (p1Frozen && state.tickCount % 2 === 0);
    const p2ShouldMove = !p2Frozen || (p2Frozen && state.tickCount % 2 === 0);

    // Surge doubles movement speed every other tick.
    // We must run the full collision/capture pipeline after EACH step so
    // coinbases on the intermediate cell aren't silently skipped.
    const p1DoubleStep = p1Surging && p1ShouldMove && state.tickCount % 2 === 0;
    const p2DoubleStep = p2Surging && p2ShouldMove && state.tickCount % 2 === 0;

    if (p1ShouldMove) moveSnake(state.p1);
    if (p2ShouldMove) moveSnake(state.p2);

    // Intermediate game-logic pass (only when at least one snake double-steps)
    if (p1DoubleStep || p2DoubleStep) {
      checkTeleports(state);
      checkCollisions(state);
      captureCoinbase(state);
      checkPowerUpPickup(state);
      // Second step for surging snakes
      if (p1DoubleStep) moveSnake(state.p1);
      if (p2DoubleStep) moveSnake(state.p2);
    }

    checkTeleports(state);
    checkCollisions(state);
    captureCoinbase(state);
    checkPowerUpPickup(state);

    // ── Extra snakes (teams / ffa) ──────────────────────────────────────────
    if (state.extraSnakes.length > 0) {
      for (const extra of state.extraSnakes) {
        if (!extra.humanControlled) decideExtraSnakeDir(state, extra);
      }
      for (const extra of state.extraSnakes) moveSnake(extra.snake);
      captureExtraSnakeCoinbases(state);
      checkExtraSnakeCollisions(state);
    }

    if (state.score[0] <= 0 || state.score[1] <= 0) {
      state.gameEnded = true;
      if (state.score[0] <= 0) {
        state.winnerPlayer = 'P2';
        state.winnerName = state.p2Name;
      } else {
        state.winnerPlayer = 'P1';
        state.winnerName = state.p1Name;
      }
    }

    // Gauntlet: check completion condition (player collects enough coinbases)
    if (state.meta.gauntletMode && !state.gauntletCompleted && state.gauntletStartTick > 0) {
      const elapsed = (state.tickCount - state.gauntletStartTick) * state.meta.currentStepMs / 1000;
      state.gauntletElapsedSecs = elapsed;
    }

  } else if (state.countdownStart) {
    state.countdownTicks += 1;
    if (state.countdownTicks > COUNTDOWN_END_TICK) {
      state.gameStarted = true;
      state.countdownStart = false;
      state.gauntletStartTick = state.tickCount;
    }
  }

  return {
    winnerChanged: prevWinner !== state.winnerPlayer && state.winnerPlayer !== null,
    winnerPlayer: state.winnerPlayer,
    gauntletCompleted: state.gauntletCompleted,
    gauntletElapsedSecs: state.gauntletElapsedSecs,
  };
}

// ============================================================================
// Overclock
// ============================================================================

function tickOverclock(state: GameState): void {
  const interval = state.meta.overclockStepIntervalTicks ?? OVERCLOCK_STEP_INTERVAL_TICKS;
  if (state.tickCount % interval !== 0) return;
  const current = state.meta.currentStepMs;
  const minStep = state.meta.overclockMinStepMs ?? OVERCLOCK_MIN_STEP_MS;
  const reduction = state.meta.overclockSpeedReductionMs ?? OVERCLOCK_SPEED_REDUCTION_MS;
  state.meta.currentStepMs = Math.max(minStep, current - reduction);
}

// ============================================================================
// Convergence
// ============================================================================

function tickConvergence(state: GameState): void {
  if (!state.shrinkBorder) return;

  const shrinkInterval = state.meta.convergenceShrinkInterval ?? CONVERGENCE_SHRINK_INTERVAL_TICKS;
  const warningInterval = Math.max(0, shrinkInterval - CONVERGENCE_WARNING_TICKS);

  const phase = state.tickCount % shrinkInterval;
  const shrinkThisTick =
    state.tickCount > 0 && state.tickCount % shrinkInterval === 0;
  // Include the shrink frame: when phase wraps to 0, phase >= warningInterval is false,
  // so without shrinkThisTick the warning would blink off exactly when the border steps.
  state.shrinkBorder.warningActive =
    phase >= warningInterval || shrinkThisTick;

  if (shrinkThisTick) {
    advanceShrinkBorder(state);

    // Detect when the wall has fully closed (reached minimum size)
    if (!state.convergenceWallClosed && !state.gameEnded) {
      const sb = state.shrinkBorder;
      const minWidth = state.meta.convergenceMinCols ?? CONVERGENCE_MIN_COLS;
      const minHeight = state.meta.convergenceMinRows ?? CONVERGENCE_MIN_ROWS;
      const atMinX = sb.right - sb.left + 1 <= minWidth;
      const atMinY = sb.bottom - sb.top + 1 <= minHeight;
      if (atMinX && atMinY) {
        state.convergenceWallClosed = true;
        state.gameEnded = true;
        // Winner is whoever has more points; tie goes to P1
        if (state.score[1] > state.score[0]) {
          state.winnerPlayer = 'P2';
          state.winnerName = state.p2Name;
        } else {
          state.winnerPlayer = 'P1';
          state.winnerName = state.p1Name;
        }
      }
    }
  }
}

export function advanceShrinkBorder(state: GameState): void {
  if (!state.shrinkBorder) return;
  const sb = state.shrinkBorder;
  const newLeft = sb.left + 1;
  const newRight = sb.right - 1;
  const newTop = sb.top + 1;
  const newBottom = sb.bottom - 1;
  const minWidth = state.meta.convergenceMinCols ?? CONVERGENCE_MIN_COLS;
  const minHeight = state.meta.convergenceMinRows ?? CONVERGENCE_MIN_ROWS;

  if (newRight - newLeft + 1 >= minWidth) {
    sb.left = newLeft;
    sb.right = newRight;
  }
  if (newBottom - newTop + 1 >= minHeight) {
    sb.top = newTop;
    sb.bottom = newBottom;
  }

  // Relocate any coinbases now sitting on or behind the new wall
  state.coinbases = state.coinbases.map((cb) => {
    if (isPosInsideActiveBorder(sb, cb.pos)) return cb;
    const newPos = findSafePosInBorder(state, sb);
    return newPos ? { ...cb, pos: newPos } : cb;
  });

  // Power-ups must stay in the playable interior (same as food)
  state.powerUpItems = state.powerUpItems.map((item) => {
    if (isPosInsideActiveBorder(sb, item.pos)) return item;
    const newPos = findSafePosInBorder(state, sb);
    return newPos ? { ...item, pos: newPos } : item;
  });

  // Extra snakes (teams / FFA): fixed spawn points can end up outside the new border
  for (const extra of state.extraSnakes) {
    if (outOfBounds(state, extra.snake.head) || hitsObstacle(state, extra.snake.head)) {
      resetExtraSnake(extra, state);
    }
  }

  // Void cells are invalid if the wall moved over them
  if (state.voidCells.length > 0) {
    state.voidCells = state.voidCells.filter((c) => isPosInsideActiveBorder(sb, c));
  }
}

/** Returns true when pos is safely inside the active (non-wall) area */
function isPosInsideActiveBorder(sb: import('./types').ShrinkBorder, pos: GridPos): boolean {
  return pos[0] > sb.left && pos[0] < sb.right && pos[1] > sb.top && pos[1] < sb.bottom;
}

/** Find a random free cell strictly inside the active border */
function findSafePosInBorder(state: GameState, sb: import('./types').ShrinkBorder): GridPos | null {
  const minX = sb.left + 1;
  const maxX = sb.right - 1;
  const minY = sb.top + 1;
  const maxY = sb.bottom - 1;
  if (maxX < minX || maxY < minY) return null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
    const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
    if (!hasCollisionAt(state, [x, y])) return [x, y];
  }
  return scanGridForSafePosInBorder(state, sb);
}

/** Deterministic fallback when random placement fails (crowded small arenas). */
function scanGridForSafePosInBorder(state: GameState, sb: import('./types').ShrinkBorder): GridPos | null {
  const minX = sb.left + 1;
  const maxX = sb.right - 1;
  const minY = sb.top + 1;
  const maxY = sb.bottom - 1;
  if (maxX < minX || maxY < minY) return null;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const pos: GridPos = [x, y];
      if (!hasCollisionAt(state, pos)) return pos;
    }
  }
  return null;
}

// ============================================================================
// Void cells
// ============================================================================

// ============================================================================
// Labyrinth
// ============================================================================

function tickLabyrinth(state: GameState): void {
  if (!state.meta.labyrinthMode) return;
  // Expose warning phase via invisibleGrid flag (re-used as "maze shaking" visual cue)
  const ticksUntilRegen = state.labyrinthNextRegenTick - state.tickCount;
  if (ticksUntilRegen > 0 && ticksUntilRegen <= LABYRINTH_REGEN_WARNING_TICKS) {
    state.meta.invisibleGrid = true;  // renderer will flash grid as warning
  } else if (ticksUntilRegen > LABYRINTH_REGEN_WARNING_TICKS) {
    state.meta.invisibleGrid = false;
  }
  if (state.tickCount < state.labyrinthNextRegenTick) return;

  // Generate a new maze with a fresh seed, using stored difficulty params
  const newSeed = Math.floor(Math.random() * 0xFFFFFFFF);
  state.labyrinthSeed = newSeed;
  const newWalls = generateMaze(
    state.cols, state.rows, newSeed,
    state.meta.labyrinthLoopFactor,
    state.meta.labyrinthCornerFactor,
    (state.meta.labyrinthCorridorWidth ?? 1) as 1 | 2 | 4,
    (state.meta.labyrinthSections ?? 1) as 1 | 3,
  );
  state.obstacleWalls = newWalls;

  // Teleport any snake head that landed inside a new wall back to its spawn corner
  if (newWalls.some((w) => w.pos[0] === state.p1.head[0] && w.pos[1] === state.p1.head[1])) {
    resetSnake(state, 'P1');
  }
  if (newWalls.some((w) => w.pos[0] === state.p2.head[0] && w.pos[1] === state.p2.head[1])) {
    resetSnake(state, 'P2');
  }

  // Move coinbases that ended up inside new walls to the nearest free maze cell
  state.coinbases = state.coinbases.map((cb) => {
    const inWall = newWalls.some((w) => w.pos[0] === cb.pos[0] && w.pos[1] === cb.pos[1]);
    if (!inWall) return cb;
    return { ...cb, pos: findFreeMazeCell(state) };
  });

  state.labyrinthNextRegenTick = state.tickCount + state.meta.labyrinthRegenInterval;

  // Regenerate teleport doors with the new maze layout
  if (state.meta.labyrinthTeleports) {
    state.teleportDoors = makeTeleportDoors(state, 2);
  }
}

/** Pick a random free maze-cell position not occupied by walls or snakes. */
function findFreeMazeCell(state: GameState): GridPos {
  const cw = state.meta.labyrinthCorridorWidth ?? 1;
  const sections = state.meta.labyrinthSections ?? 1;

  // period-6 (5-cell wide) or period-5 (4-cell wide) — generic
  if (cw === 5 || cw === 4) {
    const P = cw === 5 ? 6 : 5;
    const mazeW = Math.floor((state.cols - 1) / P);
    const mazeH = Math.floor((state.rows - 1) / P);
    for (let attempt = 0; attempt < 500; attempt++) {
      const mx = Math.floor(Math.random() * mazeW);
      const my = Math.floor(Math.random() * mazeH);
      const dc = 1 + Math.floor(Math.random() * (P - 1));
      const dr = 1 + Math.floor(Math.random() * (P - 1));
      const pos: GridPos = [P * mx + dc, P * my + dr];
      if (!hasCollisionAt(state, pos)) return pos;
    }
    return [26, 11];
  }

  // period-3 (2-cell wide)
  if (cw === 2) {
    const mazeW = Math.floor((state.cols - 3) / 3);
    const mazeH = Math.floor((state.rows - 1) / 3);
    for (let attempt = 0; attempt < 500; attempt++) {
      const mx = Math.floor(Math.random() * mazeW);
      const my = Math.floor(Math.random() * mazeH);
      const dc = Math.floor(Math.random() * 2);
      const dr = Math.floor(Math.random() * 2);
      const pos: GridPos = [1 + 3 * mx + dc, 1 + 3 * my + dr];
      if (!hasCollisionAt(state, pos)) return pos;
    }
    return [25, 13];
  }

  // 3-section narrow maze — only pick cells within actual section rows
  if (sections === 3) {
    const sectionDefs: [number, number][] = [[0, 7], [9, 16], [18, state.rows - 1]];
    const mW = (state.cols - 1) / 2;
    for (let attempt = 0; attempt < 500; attempt++) {
      const [sStart, sEnd] = sectionDefs[Math.floor(Math.random() * 3)];
      const mH = Math.floor((sEnd - sStart) / 2);
      if (mH <= 0) continue;
      const mx = Math.floor(Math.random() * mW);
      const my = Math.floor(Math.random() * mH);
      const pos: GridPos = [2 * mx + 1, sStart + 2 * my + 1];
      if (!hasCollisionAt(state, pos)) return pos;
    }
    return [25, 13];
  }

  // period-2 (1-cell wide, single section)
  const mazeW = (state.cols - 1) / 2;
  const mazeH = (state.rows - 1) / 2;
  for (let attempt = 0; attempt < 500; attempt++) {
    const mx = Math.floor(Math.random() * mazeW);
    const my = Math.floor(Math.random() * mazeH);
    const pos: GridPos = [2 * mx + 1, 2 * my + 1];
    if (!hasCollisionAt(state, pos)) return pos;
  }
  return [25, 13];
}

// ============================================================================
// Teleport doors
// ============================================================================

/**
 * Generate `count` teleport door pairs for the current maze.
 * Each pair is two cells at least 10 Manhattan units apart.
 */
/**
 * @param minPairDist  Minimum Manhattan distance between the two portals of
 *                     each pair.  Higher = more useful crossings.
 * @param minClearance Minimum distance a new portal must keep from every
 *                     already-placed portal (avoids clustering).
 */
function makeTeleportDoors(
  state: GameState,
  count: number,
  minPairDist = 10,
  minClearance = 5,
): TeleportDoor[] {
  const doors: TeleportDoor[] = [];
  const used: GridPos[] = [
    state.p1.head, state.p2.head,
    ...state.coinbases.map((c) => c.pos),
  ];

  for (let i = 0; i < count; i++) {
    let posA: GridPos | null = null;
    let posB: GridPos | null = null;

    for (let attempt = 0; attempt < 400 && !posB; attempt++) {
      const cand = findFreeMazeCell(state);
      const tooClose = used.some(
        (u) => Math.abs(u[0] - cand[0]) + Math.abs(u[1] - cand[1]) < minClearance,
      );
      if (tooClose) continue;
      if (!posA) {
        posA = cand;
        used.push(cand);
      } else if (Math.abs(posA[0] - cand[0]) + Math.abs(posA[1] - cand[1]) >= minPairDist) {
        posB = cand;
        used.push(cand);
      }
    }
    if (posA && posB) doors.push({ a: posA, b: posB, colorIndex: i % 4 });
  }
  return doors;
}

/**
 * If either snake's head is on a portal, teleport it to the partner portal
 * and advance one step in the current direction (avoids immediate re-trigger).
 */
function checkTeleports(state: GameState): void {
  if (!state.teleportDoors.length) return;

  for (const door of state.teleportDoors) {
    if (samePos(state.p1.head, door.a)) { exitTeleport(state, 'P1', door.b); break; }
    if (samePos(state.p1.head, door.b)) { exitTeleport(state, 'P1', door.a); break; }
    if (samePos(state.p2.head, door.a)) { exitTeleport(state, 'P2', door.b); break; }
    if (samePos(state.p2.head, door.b)) { exitTeleport(state, 'P2', door.a); break; }
  }
}

function exitTeleport(state: GameState, player: 'P1' | 'P2', exitPos: GridPos): void {
  const snake = player === 'P1' ? state.p1 : state.p2;
  const dir = snake.dir || snake.dirWanted;
  const dx = dir === 'Right' ? 1 : dir === 'Left' ? -1 : 0;
  const dy = dir === 'Down' ? 1 : dir === 'Up' ? -1 : 0;
  const next: GridPos = [exitPos[0] + dx, exitPos[1] + dy];
  // Advance past the portal so the snake doesn't immediately re-trigger it
  if (!outOfBounds(state, next) && !hitsObstacle(state, next)) {
    snake.head = [next[0], next[1]];
  } else {
    snake.head = [exitPos[0], exitPos[1]];
  }
}

function regenerateVoidCells(state: GameState): void {
  const newCells: GridPos[] = [];
  const sb = state.shrinkBorder;
  const minX = sb ? sb.left + 1 : 2;
  const maxX = sb ? sb.right - 1 : state.cols - 3;
  const minY = sb ? sb.top + 1 : 2;
  const maxY = sb ? sb.bottom - 1 : state.rows - 3;
  let attempts = 0;
  while (newCells.length < VOID_CELLS_COUNT && attempts < 500) {
    if (maxX < minX || maxY < minY) break;
    const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
    const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
    const pos: GridPos = [x, y];
    if (!hasCollisionAt(state, pos) && !newCells.some((c) => samePos(c, pos))) {
      newCells.push(pos);
    }
    attempts++;
  }
  state.voidCells = newCells;
}

// ============================================================================
// Power-up system
// ============================================================================

export function spawnPowerUp(state: GameState): void {
  const type = weightedRandomPowerUp();
  const border = state.shrinkBorder;
  const minX = border ? border.left + 1 : 0;
  const maxX = border ? border.right - 1 : state.cols - 1;
  const minY = border ? border.top + 1 : 0;
  const maxY = border ? border.bottom - 1 : state.rows - 1;
  let attempts = 0;
  while (attempts < 200) {
    const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
    const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
    const pos: GridPos = [x, y];
    if (!hasCollisionAt(state, pos)) {
      state.powerUpItems.push({ pos, type });
      return;
    }
    attempts++;
  }
  if (border) {
    const p = findSafePosInBorder(state, border);
    if (p) state.powerUpItems.push({ pos: p, type });
  }
}

function weightedRandomPowerUp(): PowerUpType {
  const types = Object.keys(POWERUP_SPAWN_WEIGHTS) as PowerUpType[];
  const totalWeight = types.reduce((sum, t) => sum + POWERUP_SPAWN_WEIGHTS[t], 0);
  let rand = Math.random() * totalWeight;
  for (const type of types) {
    rand -= POWERUP_SPAWN_WEIGHTS[type];
    if (rand <= 0) return type;
  }
  return 'SURGE';
}

function checkPowerUpPickup(state: GameState): void {
  for (let i = state.powerUpItems.length - 1; i >= 0; i--) {
    const item = state.powerUpItems[i];
    let pickedBy: PlayerId | null = null;

    if (samePos(state.p1.head, item.pos)) pickedBy = 'P1';
    else if (samePos(state.p2.head, item.pos)) pickedBy = 'P2';

    if (pickedBy) {
      applyPowerUp(state, pickedBy, item.type);
      state.powerUpItems.splice(i, 1);
      state.powerUpRespawnCooldownTick = state.tickCount + POWERUP_RESPAWN_COOLDOWN_TICKS;
    }
  }
}

function applyPowerUp(state: GameState, player: PlayerId, type: PowerUpType): void {
  const opponent: PlayerId = player === 'P1' ? 'P2' : 'P1';

  switch (type) {
    case 'SURGE':
      removeExisting(state, player, 'SURGE');
      state.activePowerUps.push({
        type: 'SURGE', player,
        expiresAtTick: state.tickCount + POWERUP_SURGE_DURATION_TICKS,
      });
      break;

    case 'FREEZE':
      removeExisting(state, opponent, 'FREEZE');
      state.activePowerUps.push({
        type: 'FREEZE', player: opponent,
        expiresAtTick: state.tickCount + POWERUP_FREEZE_DURATION_TICKS,
      });
      break;

    case 'PHANTOM':
      removeExisting(state, player, 'PHANTOM');
      state.activePowerUps.push({
        type: 'PHANTOM', player,
        expiresAtTick: state.tickCount + POWERUP_PHANTOM_DURATION_TICKS,
      });
      break;

    case 'ANCHOR': {
      const snake = player === 'P1' ? state.p1 : state.p2;
      const tailPos = snake.body[snake.body.length - 1];
      state.obstacleWalls.push({
        pos: [tailPos[0], tailPos[1]],
        expiresAtTick: state.tickCount + POWERUP_ANCHOR_DURATION_TICKS,
      });
      break;
    }

    case 'AMPLIFIER':
      removeExisting(state, player, 'AMPLIFIER');
      state.activePowerUps.push({
        type: 'AMPLIFIER', player,
        expiresAtTick: state.tickCount + 9999,
        chargesLeft: POWERUP_AMPLIFIER_CHARGES,
      });
      break;

    case 'DECOY': {
      let decoyAttempts = 0;
      while (decoyAttempts < 200) {
        const x = Math.floor(Math.random() * state.cols);
        const y = Math.floor(Math.random() * state.rows);
        const pos: GridPos = [x, y];
        if (!hasCollisionAt(state, pos)) {
          state.coinbases.push({ pos, isDecoy: true });
          break;
        }
        decoyAttempts++;
      }
      break;
    }
  }
}

function removeExisting(state: GameState, player: PlayerId, type: PowerUpType): void {
  state.activePowerUps = state.activePowerUps.filter(
    (ap) => !(ap.player === player && ap.type === type)
  );
}

// ============================================================================
// createNewCoinbase
// ============================================================================

export function createNewCoinbase(state: GameState, feeValue: number = -1): void {
  if (!state.gameStarted || state.gameEnded) return;

  // Reward-only mode (level 10 gauntlet)
  const rewardOnly = state.meta.gauntletMode &&
    getGauntletLevel(state.meta.gauntletLevel).modifiers.includes('reward_only');
  if (rewardOnly && feeValue < 0) return;

  let reward: Coinbase['reward'];
  const isBounty = state.meta.bountyMode && Math.random() < 0.1;

  if (isBounty) {
    reward = 32;
  } else if (feeValue >= 0) {
    if (feeValue < 15) reward = 2;
    else if (feeValue < 45) reward = 4;
    else if (feeValue < 135) reward = 8;
    else if (feeValue < 405) reward = 16;
    else reward = 32;
  }

  let accepted = false;
  let attempts = 0;
  while (!accepted && attempts < 1000) {
    let x: number;
    let y: number;
    if (state.meta.labyrinthMode) {
      const cw = state.meta.labyrinthCorridorWidth ?? 1;
      const secs = state.meta.labyrinthSections ?? 1;
      if (cw === 4 || cw === 5) {
        const P = cw === 5 ? 6 : 5;
        const mazeW = Math.floor((state.cols - 1) / P);
        const mazeH = Math.floor((state.rows - 1) / P);
        const mx = Math.floor(Math.random() * mazeW);
        const my = Math.floor(Math.random() * mazeH);
        x = P * mx + 1 + Math.floor(Math.random() * (P - 1));
        y = P * my + 1 + Math.floor(Math.random() * (P - 1));
      } else if (cw === 2) {
        const mazeW = Math.floor((state.cols - 3) / 3);
        const mazeH = Math.floor((state.rows - 1) / 3);
        const mx = Math.floor(Math.random() * mazeW);
        const my = Math.floor(Math.random() * mazeH);
        x = 1 + 3 * mx + Math.floor(Math.random() * 2);
        y = 1 + 3 * my + Math.floor(Math.random() * 2);
      } else if (secs === 3) {
        const sectionDefs: [number, number][] = [[0, 7], [9, 16], [18, state.rows - 1]];
        const [sStart, sEnd] = sectionDefs[Math.floor(Math.random() * 3)];
        const mW = (state.cols - 1) / 2;
        const mH = Math.floor((sEnd - sStart) / 2);
        x = 2 * Math.floor(Math.random() * mW) + 1;
        y = sStart + 2 * Math.floor(Math.random() * mH) + 1;
      } else {
        const mazeW = (state.cols - 1) / 2;
        const mazeH = (state.rows - 1) / 2;
        x = 2 * Math.floor(Math.random() * mazeW) + 1;
        y = 2 * Math.floor(Math.random() * mazeH) + 1;
      }
    } else {
      const border = state.shrinkBorder;
      const minX = border ? border.left + 1 : 0;
      const maxX = border ? border.right - 1 : state.cols - 1;
      const minY = border ? border.top + 1 : 0;
      const maxY = border ? border.bottom - 1 : state.rows - 1;
      x = minX + Math.floor(Math.random() * (maxX - minX + 1));
      y = minY + Math.floor(Math.random() * (maxY - minY + 1));
    }
    if (!hasCollisionAt(state, [x, y])) {
      const cb: Coinbase = { pos: [x, y] };
      if (reward !== undefined) cb.reward = reward;
      if (isBounty) cb.isBounty = true;
      // In 3D mode alternate coinbase layers so both boards always have one
      if (state.meta.layers3D) {
        cb.layer = (state.coinbases.length % 2 === 0 ? 0 : 1) as 0 | 1;
      }
      state.coinbases.push(cb);
      accepted = true;
    }
    attempts += 1;
  }
}

// ============================================================================
// Movement
// ============================================================================

function moveSnake(snake: GameState['p1']): void {
  snake.body.unshift([snake.head[0], snake.head[1]]);
  snake.body.pop();
  snake.dir = snake.dirWanted;
  switch (snake.dir) {
    case 'Up':    snake.head[1] -= 1; break;
    case 'Down':  snake.head[1] += 1; break;
    case 'Left':  snake.head[0] -= 1; break;
    case 'Right': snake.head[0] += 1; break;
  }
}

// ============================================================================
// Collision detection
// ============================================================================

function checkCollisions(state: GameState): void {
  const p1HasPhantom = state.activePowerUps.some(
    (ap) => ap.type === 'PHANTOM' && ap.player === 'P1'
  );
  const p2HasPhantom = state.activePowerUps.some(
    (ap) => ap.type === 'PHANTOM' && ap.player === 'P2'
  );

  // Head-on collisions
  if (samePos(state.p1.head, state.p2.head)) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
  checkPassThroughCollision(state, 'Right', 'Left', 1, 0);
  checkPassThroughCollision(state, 'Left', 'Right', -1, 0);
  checkPassThroughCollision(state, 'Up', 'Down', 0, -1);
  checkPassThroughCollision(state, 'Down', 'Up', 0, 1);

  // Wall / shrink border — PHANTOM wraps (Pac-Man style) instead of resetting
  if (outOfBounds(state, state.p1.head)) {
    if (p1HasPhantom && !state.shrinkBorder) wrapSnakeHead(state, 'P1');
    else resetSnake(state, 'P1');
  }
  if (outOfBounds(state, state.p2.head)) {
    if (p2HasPhantom && !state.shrinkBorder) wrapSnakeHead(state, 'P2');
    else resetSnake(state, 'P2');
  }

  // Obstacle walls (layer-aware in 3D mode)
  if (hitsObstacleOnLayer(state, state.p1.head, state.p1Layer)) resetSnake(state, 'P1');
  if (hitsObstacleOnLayer(state, state.p2.head, state.p2Layer)) resetSnake(state, 'P2');

  // Void cells
  if (state.voidCells.some((c) => samePos(c, state.p1.head))) resetSnake(state, 'P1');
  if (state.voidCells.some((c) => samePos(c, state.p2.head))) resetSnake(state, 'P2');

  for (const pos of state.p1.body) {
    if (!p1HasPhantom && samePos(state.p1.head, pos)) resetSnake(state, 'P1');
    if (samePos(state.p2.head, pos)) resetSnake(state, 'P2');
  }
  for (const pos of state.p2.body) {
    if (samePos(state.p1.head, pos)) resetSnake(state, 'P1');
    if (!p2HasPhantom && samePos(state.p2.head, pos)) resetSnake(state, 'P2');
  }
}

function checkPassThroughCollision(
  state: GameState,
  p1Dir: Direction,
  p2Dir: Direction,
  dx: number,
  dy: number
): void {
  if (
    state.p1.head[0] === state.p2.head[0] + dx &&
    state.p2.head[1] + dy === state.p1.head[1] &&
    state.p1.dir === p1Dir &&
    state.p2.dir === p2Dir &&
    state.p1.dirWanted === p1Dir &&
    state.p2.dirWanted === p2Dir
  ) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
}

function outOfBounds(state: GameState, pos: GridPos): boolean {
  const sb = state.shrinkBorder;
  if (sb) {
    return pos[0] < sb.left || pos[0] > sb.right || pos[1] < sb.top || pos[1] > sb.bottom;
  }
  return pos[0] > state.cols - 1 || pos[1] < 0 || pos[1] > state.rows - 1 || pos[0] < 0;
}

/** Wrap a snake's head to the opposite wall (Pac-Man style) — PHANTOM power-up. */
function wrapSnakeHead(state: GameState, player: 'P1' | 'P2'): void {
  const snake = player === 'P1' ? state.p1 : state.p2;
  const [x, y] = snake.head;
  snake.head = [
    ((x % state.cols) + state.cols) % state.cols,
    ((y % state.rows) + state.rows) % state.rows,
  ];
}

function hitsObstacle(state: GameState, pos: GridPos): boolean {
  return state.obstacleWalls.some((w) => samePos(w.pos, pos));
}

/** Layer-aware obstacle check — uses alternate walls when layer > 0. */
function hitsObstacleOnLayer(state: GameState, pos: GridPos, layer: 0 | 1): boolean {
  if (layer === 0) return hitsObstacle(state, pos);
  const altLayer = state.board3DLayers[layer - 1];
  return (altLayer?.obstacleWalls ?? []).some((w) => samePos(w.pos, pos));
}

export function switchPlayerLayer(state: GameState): void {
  if (!state.meta.layers3D) return;
  if (!state.gameStarted) return;
  if (state.tickCount < state.layerSwitchCooldown) return;
  state.p1Layer = state.p1Layer === 0 ? 1 : 0;
  state.layerSwitchCooldown = state.tickCount + 8;  // ~800ms cooldown at 100ms/tick
}

// ============================================================================
// Coinbase capture
// ============================================================================

function coinbaseOnLayer(cb: Coinbase, layer: 0 | 1, is3D: boolean): boolean {
  if (!is3D) return true;
  return cb.layer === undefined || cb.layer === layer;
}

function captureCoinbase(state: GameState): void {
  const is3D = state.meta.layers3D;
  for (let i = 0; i < state.coinbases.length; i += 1) {
    const cb = state.coinbases[i];
    if (samePos(state.p1.head, cb.pos) && coinbaseOnLayer(cb, state.p1Layer, is3D)) {
      if (cb.isDecoy) {
        // Decoy: teleport P1 back to spawn
        resetSnake(state, 'P1');
        state.coinbases.splice(i, 1);
        return;
      }
      changeScore(state, 'P1', cb);
      increaseBody(state.p1);
      if (!cb.reward) createNewCoinbase(state);
      state.coinbases.splice(i, 1);
      state.currentCaptureP1 = getCaptureLabel(state.p1.body.length, state);
      return;
    }
    if (samePos(state.p2.head, cb.pos) && coinbaseOnLayer(cb, state.p2Layer, is3D)) {
      if (cb.isDecoy) {
        resetSnake(state, 'P2');
        state.coinbases.splice(i, 1);
        return;
      }
      changeScore(state, 'P2', cb);
      increaseBody(state.p2);
      if (!cb.reward) createNewCoinbase(state);
      state.coinbases.splice(i, 1);
      state.currentCaptureP2 = getCaptureLabel(state.p2.body.length, state);
      return;
    }
  }
}

function increaseBody(snake: GameState['p1']): void {
  // Handle length-1 snake (empty body, e.g. labyrinth start)
  if (snake.body.length === 0) {
    const [hx, hy] = snake.head;
    const d = snake.dir || snake.dirWanted;
    if (d === 'Right') snake.body.push([hx - 1, hy]);
    else if (d === 'Left') snake.body.push([hx + 1, hy]);
    else if (d === 'Down') snake.body.push([hx, hy - 1]);
    else snake.body.push([hx, hy + 1]);  // 'Up' or ''
    return;
  }
  const last = snake.body[snake.body.length - 1];
  const beforeLast = snake.body.length > 1 ? snake.body[snake.body.length - 2] : snake.head;
  if (last[0] < beforeLast[0]) snake.body.push([last[0] - 1, last[1]]);
  else if (last[0] > beforeLast[0]) snake.body.push([last[0] + 1, last[1]]);
  else if (last[1] < beforeLast[1]) snake.body.push([last[0], last[1] - 1]);
  else snake.body.push([last[0], last[1] + 1]);
}

function changeScore(state: GameState, player: PlayerId, cb: Coinbase): void {
  const basePercent = cb.reward != null
    ? cb.reward
    : capturePercentByLength(getLength(state, player), state);

  const hasAmplifier = state.activePowerUps.some(
    (ap) => ap.type === 'AMPLIFIER' && ap.player === player && (ap.chargesLeft ?? 0) > 0
  );
  const finalPercent = hasAmplifier ? Math.min(32, basePercent * 2) : basePercent;

  // Consume amplifier charge
  if (hasAmplifier) {
    const amp = state.activePowerUps.find(
      (ap) => ap.type === 'AMPLIFIER' && ap.player === player
    );
    if (amp && amp.chargesLeft !== undefined) {
      amp.chargesLeft -= 1;
      if (amp.chargesLeft <= 0) {
        state.activePowerUps = state.activePowerUps.filter((ap) => ap !== amp);
      }
    }
  }

  const bountyBonus = cb.isBounty ? 50 : 0;
  const change = Math.floor((state.totalPoints * finalPercent) / 100) + bountyBonus;
  const safeChange = Math.max(1, change);

  state.pointChanges.push({
    player,
    value: safeChange,
    p1Pos: [state.p1.head[0], state.p1.head[1]],
    p2Pos: [state.p2.head[0], state.p2.head[1]],
    p1YOffsetPx: 0,
    p2YOffsetPx: 0,
    alpha: 1,
  });

  if (player === 'P1') {
    state.score[0] = Math.min(state.totalPoints, state.score[0] + safeChange);
    state.score[1] = Math.max(0, state.score[1] - safeChange);
  } else {
    state.score[1] = Math.min(state.totalPoints, state.score[1] + safeChange);
    state.score[0] = Math.max(0, state.score[0] - safeChange);
  }
}

function getLength(state: GameState, player: PlayerId): number {
  return player === 'P1' ? state.p1.body.length : state.p2.body.length;
}

function capturePercentByLength(length: number, state: GameState): number {
  // White chain (P1 in powerup/bounty modes) — capture tier boosts one level
  const boosted = state.meta.powerupMode || state.meta.bountyMode;
  const effectiveLength = boosted ? length + 1 : length;
  for (const level of CAPTURE_LEVELS) {
    if (effectiveLength >= level.minLength && effectiveLength <= level.maxLength) {
      return level.percent;
    }
  }
  return 32;
}

export function getCaptureLabel(length: number, state?: GameState): string {
  const effectiveLength = state && (state.meta.powerupMode || state.meta.bountyMode)
    ? length + 1
    : length;
  for (const level of CAPTURE_LEVELS) {
    if (effectiveLength >= level.minLength && effectiveLength <= level.maxLength) {
      return `${level.percent}%`;
    }
  }
  return '32%';
}

// ============================================================================
// Reset
// ============================================================================

function resetSnake(state: GameState, player: PlayerId): void {
  // Black chain (P2) speed retention in powerup/bounty modes
  const retainSpeed = (player === 'P2') && (state.meta.powerupMode || state.meta.bountyMode);
  // In labyrinth mode snakes start as length-1 (no body segment)
  const isLabyrinth = state.meta.labyrinthMode;
  const wideLabyrinth = isLabyrinth && state.meta.labyrinthCorridorWidth === 2;
  const quadLabyrinth = isLabyrinth && (state.meta.labyrinthCorridorWidth === 4 || state.meta.labyrinthCorridorWidth === 5);
  const teamMode = state.meta.teamMode ?? 'solo';
  const conv = Boolean(state.meta.convergenceMode && state.shrinkBorder);
  const sb = state.shrinkBorder;

  if (player === 'P1') {
    if (isLabyrinth) {
      state.p1.head = [1, 1];
      state.p1.body = [];
    } else if (teamMode === 'teams') {
      let head: GridPos = [4, 9];
      let body: GridPos[] = [bodySegmentBehindHead(head, 'Right')];
      if (conv && sb) {
        const spawnX = Math.max(4, sb.left + 2);
        head = [spawnX, 9];
        body = [[Math.max(sb.left + 1, spawnX - 1), 9]];
      }
      state.p1.head = head;
      state.p1.body = body;
    } else if (teamMode === 'ffa') {
      let head: GridPos = [4, 4];
      let body: GridPos[] = [bodySegmentBehindHead(head, 'Right')];
      if (conv && sb) {
        const spawnX = Math.max(4, sb.left + 2);
        const spawnY = Math.max(4, sb.top + 2);
        head = [spawnX, spawnY];
        body = [[Math.max(sb.left + 1, spawnX - 1), spawnY]];
      }
      state.p1.head = head;
      state.p1.body = body;
    } else {
      let head: GridPos = [6, 12];
      let body: GridPos[] = [[5, 12]];
      if (conv && sb) {
        const spawnX = Math.max(head[0], sb.left + 2);
        head = [spawnX, 12];
        body = [[Math.max(sb.left + 1, spawnX - 1), 12]];
      }
      state.p1.head = head;
      state.p1.body = body;
    }
    state.p1.dir = '';
    state.p1.dirWanted = 'Right';
    state.currentCaptureP1 = '2%';
    state.activePowerUps = state.activePowerUps.filter((ap) => ap.player !== 'P1');
    return;
  }

  // P2
  if (isLabyrinth) {
    state.p2.head =
      (state.meta.labyrinthCorridorWidth === 5) ? [43, 19] :
      quadLabyrinth ? [47, 17] :
      wideLabyrinth ? [47, 22] : [49, 23];
    state.p2.body = [];
  } else if (teamMode === 'teams') {
    let head: GridPos = [46, 9];
    let body: GridPos[] = [bodySegmentBehindHead(head, 'Left')];
    if (conv && sb) {
      const spawnX = Math.min(46, sb.right - 2);
      head = [spawnX, 9];
      body = [[Math.min(sb.right - 1, spawnX + 1), 9]];
    }
    state.p2.head = head;
    state.p2.body = body;
  } else if (teamMode === 'ffa') {
    let head: GridPos = [46, 4];
    let body: GridPos[] = [bodySegmentBehindHead(head, 'Left')];
    if (conv && sb) {
      const spawnX = Math.min(46, sb.right - 2);
      const spawnY = Math.max(4, sb.top + 2);
      head = [spawnX, spawnY];
      body = [[Math.min(sb.right - 1, spawnX + 1), spawnY]];
    }
    state.p2.head = head;
    state.p2.body = body;
  } else {
    let head: GridPos = [44, 12];
    let body: GridPos[] = [[45, 12]];
    if (conv && sb) {
      const spawnX = Math.min(head[0], sb.right - 2);
      head = [spawnX, 12];
      body = [[Math.min(sb.right - 1, spawnX + 1), 12]];
    }
    state.p2.head = head;
    state.p2.body = body;
  }
  state.p2.dir = '';
  state.p2.dirWanted = 'Left';
  state.currentCaptureP2 = '2%';
  if (!retainSpeed) {
    state.activePowerUps = state.activePowerUps.filter((ap) => ap.player !== 'P2');
  }
}

// ============================================================================
// Utility
// ============================================================================

function hasCollisionAt(state: GameState, pos: GridPos): boolean {
  if (samePos(state.p1.head, pos) || samePos(state.p2.head, pos)) return true;
  if (state.p1.body.some((part) => samePos(part, pos))) return true;
  if (state.p2.body.some((part) => samePos(part, pos))) return true;
  for (const e of state.extraSnakes) {
    if (samePos(e.snake.head, pos)) return true;
    if (e.snake.body.some((part) => samePos(part, pos))) return true;
  }
  if (state.coinbases.some((cb) => samePos(cb.pos, pos))) return true;
  if (state.powerUpItems.some((p) => samePos(p.pos, pos))) return true;
  if (state.obstacleWalls.some((w) => samePos(w.pos, pos))) return true;
  return false;
}

function samePos(a: GridPos, b: GridPos): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function canContinueAfterGame(state: GameState, key: string): boolean {
  if (!state.gameEnded || !state.winnerPlayer) return false;
  const normalized = key.toUpperCase();
  if (state.meta.practiceMode || state.meta.sovereignMode || state.meta.gauntletMode ||
      state.meta.overclockMode || state.meta.convergenceMode || state.meta.powerupMode ||
      state.meta.labyrinthMode) {
    return normalized === ' ' || normalized === 'ENTER';
  }
  if (state.winnerPlayer === 'P1') return normalized === ' ';
  return normalized === 'ENTER';
}

// ============================================================================
// Moving walls (Gauntlet level 4)
// ============================================================================

/**
 * Two horizontal bars sweep up and down in opposing phase.
 *  Wall A (left half):  x = 2..24, y slides 5 → 18 → 5  (triangle wave)
 *  Wall B (right half): x = 26..48, y slides 18 → 5 → 18 (opposite phase)
 * They move 1 cell every MOVING_WALL_STEP_TICKS ticks.
 */
const MOVING_WALL_STEP_TICKS = 5;   // one cell per 500 ms at 100 ms/tick
const MOVING_WALL_RANGE_TOP  = 4;   // highest y the bar reaches
const MOVING_WALL_RANGE_BOT  = 19;  // lowest  y the bar reaches
const MOVING_WALL_TRAVEL = MOVING_WALL_RANGE_BOT - MOVING_WALL_RANGE_TOP; // 15

/** Return the current y of wall A (wall B is mirrored). */
function movingWallY(tickCount: number): { yA: number; yB: number } {
  const steps = Math.floor(tickCount / MOVING_WALL_STEP_TICKS);
  const cycle  = MOVING_WALL_TRAVEL * 2;           // full up-down cycle
  const pos    = steps % cycle;
  const phase  = pos <= MOVING_WALL_TRAVEL ? pos : cycle - pos;  // triangle 0..15..0
  return {
    yA: MOVING_WALL_RANGE_TOP + phase,
    yB: MOVING_WALL_RANGE_BOT - phase,
  };
}

/** Build the moving-wall cells for the current tick. */
function buildMovingWallCells(tickCount: number): GridPos[] {
  const { yA, yB } = movingWallY(tickCount);
  const cells: GridPos[] = [];
  // Wall A — left two-thirds (leave a gap at x=25 so player can squeeze through)
  for (let x = 2; x <= 24; x++) cells.push([x, yA]);
  // Wall B — right two-thirds
  for (let x = 26; x <= 48; x++) cells.push([x, yB]);
  return cells;
}

export function initMovingWalls(state: GameState): void {
  // Strip any existing moving walls, then add fresh ones at tick 0
  state.obstacleWalls = state.obstacleWalls.filter((w) => !w.isMoving);
  for (const pos of buildMovingWallCells(0)) {
    state.obstacleWalls.push({ pos, isMoving: true });
  }
}

function tickMovingWalls(state: GameState): void {
  const level = getGauntletLevel(state.meta.gauntletLevel);
  if (!level.modifiers.includes('moving_walls')) return;
  if (!state.gameStarted) return;
  // Move every MOVING_WALL_STEP_TICKS ticks
  if (state.tickCount % MOVING_WALL_STEP_TICKS !== 0) return;
  state.obstacleWalls = state.obstacleWalls.filter((w) => !w.isMoving);
  for (const pos of buildMovingWallCells(state.tickCount)) {
    state.obstacleWalls.push({ pos, isMoving: true });
  }
}

// ============================================================================
// AI Tiers
// ============================================================================

// ============================================================================
// Extra-snake helpers (teams / ffa)
// ============================================================================

function resetExtraSnake(extra: ExtraSnake, state: GameState): void {
  let head: GridPos = [extra.spawnHead[0], extra.spawnHead[1]];
  if (state.shrinkBorder) {
    const sb = state.shrinkBorder;
    if (!isPosInsideActiveBorder(sb, head) || hasCollisionAt(state, head)) {
      const safe = findSafePosInBorder(state, sb);
      if (safe) head = safe;
    }
  }
  extra.snake.head = head;
  extra.snake.body = [];
  const dir: Exclude<Direction, ''> = extra.spawnDir === '' ? 'Right' : extra.spawnDir;
  let tail = bodySegmentBehindHead(head, dir);
  if (!hasCollisionAt(state, tail)) {
    extra.snake.body = [tail];
  } else {
    const alts: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
    for (const d2 of alts) {
      if (d2 === dir) continue;
      tail = bodySegmentBehindHead(head, d2);
      if (!hasCollisionAt(state, tail)) {
        extra.snake.body = [tail];
        break;
      }
    }
  }
  extra.snake.dir = '';
  extra.snake.dirWanted = extra.spawnDir;
}

/** A* path-finding that avoids an explicit set of extra blocked positions. */
function findPathGeneric(
  state: GameState,
  start: GridPos,
  target: GridPos,
  extraBlocked: Set<string>,
  /** First-step facing for this snake (omit when unknown / no reverse constraint). */
  facing?: Direction,
): GridPos[] {
  const openSet: GridPos[] = [start];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[posKey(start), 0]]);
  const fScore = new Map<string, number>([[posKey(start), heuristic(start, target)]]);

  while (openSet.length > 0) {
    let current = openSet[0];
    let currentF = fScore.get(posKey(current)) ?? Number.POSITIVE_INFINITY;
    for (const node of openSet) {
      const f = fScore.get(posKey(node)) ?? Number.POSITIVE_INFINITY;
      if (f < currentF) { current = node; currentF = f; }
    }
    if (samePos(current, target)) return reconstructPath(cameFrom, current);
    openSet.splice(openSet.findIndex((n) => posKey(n) === posKey(current)), 1);

    const neighbors: GridPos[] = [
      [current[0] + 1, current[1]],
      [current[0] - 1, current[1]],
      [current[0], current[1] + 1],
      [current[0], current[1] - 1],
    ];
    for (const nb of neighbors) {
      if (outOfBounds(state, nb)) continue;
      if (hitsObstacle(state, nb)) continue;
      if (extraBlocked.has(posKey(nb))) continue;
      if (samePos(current, start) && facing) {
        const step = stepDirFromTo(current, nb);
        if (step && dirsAreOpposite(facing, step)) continue;
      }
      const tentative = (gScore.get(posKey(current)) ?? Number.POSITIVE_INFINITY) + 1;
      if (tentative < (gScore.get(posKey(nb)) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(posKey(nb), posKey(current));
        gScore.set(posKey(nb), tentative);
        fScore.set(posKey(nb), tentative + heuristic(nb, target));
        if (!openSet.some((n) => posKey(n) === posKey(nb))) openSet.push(nb);
      }
    }
  }
  return [start];
}

function buildBlockedSet(state: GameState, exclude?: ExtraSnake): Set<string> {
  const blocked = new Set<string>();
  const add = (p: GridPos) => blocked.add(posKey(p));
  state.p1.body.forEach(add);
  state.p2.body.forEach(add);
  add(state.p1.head);
  add(state.p2.head);
  for (const e of state.extraSnakes) {
    if (e === exclude) continue;
    add(e.snake.head);
    e.snake.body.forEach(add);
  }
  return blocked;
}

/** Pick the best coinbase target for an extra snake.
 *  In teams/ally mode (teamId=0), prefer coinbases P1 is NOT already closest to. */
function extraSnakeTarget(state: GameState, extra: ExtraSnake): GridPos | null {
  const isAlly = state.meta.teamMode === 'teams' && extra.teamId === 0;
  let best: GridPos | null = null;
  let bestScore = -Infinity;
  for (const cb of state.coinbases) {
    if (cb.isDecoy) continue;
    const distExtra = Math.hypot(cb.pos[0] - extra.snake.head[0], cb.pos[1] - extra.snake.head[1]);
    const distP1    = Math.hypot(cb.pos[0] - state.p1.head[0],   cb.pos[1] - state.p1.head[1]);
    // Allies yield to P1 when P1 is clearly closer
    const allyPenalty = isAlly && distP1 < distExtra - 2 ? -20 : 0;
    const score = -distExtra + allyPenalty + (cb.reward ? cb.reward * 1.5 : 0);
    if (score > bestScore) { bestScore = score; best = cb.pos; }
  }
  return best;
}

function decideExtraSnakeDir(state: GameState, extra: ExtraSnake): void {
  const target = extraSnakeTarget(state, extra);
  if (!target) return;
  const blocked = buildBlockedSet(state, extra);
  const facing = extra.snake.dir || extra.snake.dirWanted;
  const path = findPathGeneric(state, extra.snake.head, target, blocked, facing || undefined);
  if (path.length < 2) return;
  const next = path[1];
  const [x, y] = extra.snake.head;
  let dir: Exclude<Direction, ''> | null = null;
  if (next[0] === x && next[1] > y) dir = 'Down';
  else if (next[0] === x && next[1] < y) dir = 'Up';
  else if (next[1] === y && next[0] > x) dir = 'Right';
  else if (next[1] === y && next[0] < x) dir = 'Left';
  if (!dir) return;
  const cur = extra.snake.dir;
  if (dir === 'Down'  && (cur === 'Left' || cur === 'Right' || cur === '')) extra.snake.dirWanted = 'Down';
  else if (dir === 'Up'    && (cur === 'Left' || cur === 'Right' || cur === '')) extra.snake.dirWanted = 'Up';
  else if (dir === 'Right' && (cur === 'Up'   || cur === 'Down'  || cur === '')) extra.snake.dirWanted = 'Right';
  else if (dir === 'Left'  && (cur === 'Up'   || cur === 'Down'  || cur === '')) extra.snake.dirWanted = 'Left';
}

function captureExtraSnakeCoinbases(state: GameState): void {
  for (const extra of state.extraSnakes) {
    for (let i = 0; i < state.coinbases.length; i++) {
      const cb = state.coinbases[i];
      if (!samePos(extra.snake.head, cb.pos)) continue;
      if (cb.isDecoy) {
        resetExtraSnake(extra, state);
        state.coinbases.splice(i, 1);
        break;
      }
      const reward = cb.reward ?? 2;
      if (state.meta.teamMode === 'ffa') {
        extra.score += reward;
      } else {
        // Teams: coinbase goes to the extra snake's team score
        if (extra.teamId === 0) state.score[0] = Math.min(state.totalPoints, state.score[0] + reward);
        else                    state.score[1] = Math.min(state.totalPoints, state.score[1] + reward);
      }
      increaseBody(extra.snake);
      if (!cb.reward) createNewCoinbase(state);
      state.coinbases.splice(i, 1);
      break;
    }
  }
}

function checkExtraSnakeCollisions(state: GameState): void {
  for (const extra of state.extraSnakes) {
    if (outOfBounds(state, extra.snake.head) || hitsObstacle(state, extra.snake.head)) {
      resetExtraSnake(extra, state); continue;
    }
    // Self-collision
    if (extra.snake.body.some((p) => samePos(p, extra.snake.head))) {
      resetExtraSnake(extra, state); continue;
    }
    // Hit P1 body
    if (state.p1.body.some((p) => samePos(p, extra.snake.head))) {
      resetExtraSnake(extra, state); continue;
    }
    // Hit P2 body
    if (state.p2.body.some((p) => samePos(p, extra.snake.head))) {
      resetExtraSnake(extra, state); continue;
    }
    // Hit another extra snake
    let hitOther = false;
    for (const other of state.extraSnakes) {
      if (other === extra) continue;
      if (samePos(extra.snake.head, other.snake.head) ||
          other.snake.body.some((p) => samePos(p, extra.snake.head))) {
        hitOther = true; break;
      }
    }
    if (hitOther) { resetExtraSnake(extra, state); continue; }
  }
  // P1/P2 heads hitting extra snake bodies
  for (const extra of state.extraSnakes) {
    if (state.p1.body.length > 0 && extra.snake.body.some((p) => samePos(p, state.p1.head))) {
      resetSnake(state, 'P1');
    }
    if (state.p2.body.length > 0 && extra.snake.body.some((p) => samePos(p, state.p2.head))) {
      resetSnake(state, 'P2');
    }
    // Head-on collisions
    if (samePos(state.p1.head, extra.snake.head)) { resetSnake(state, 'P1'); resetExtraSnake(extra, state); }
    if (samePos(state.p2.head, extra.snake.head)) { resetSnake(state, 'P2'); resetExtraSnake(extra, state); }
  }
}

function swapP1P2Snakes(state: GameState): void {
  const t = state.p1;
  state.p1 = state.p2;
  state.p2 = t;
  const tl = state.p1Layer;
  state.p1Layer = state.p2Layer;
  state.p2Layer = tl;
}

function decideAiDirection(state: GameState): void {
  const tier = state.meta.aiTier;
  switch (tier) {
    case 'wanderer': decideWanderer(state); break;
    case 'hunter':   decideHunter(state); break;
    case 'tactician': decideTactician(state); break;
    case 'sovereign': decideSovereign(state); break;
    default:          decideHunter(state);
  }
}

/** Wanderer: mostly random with light wall avoidance */
function decideWanderer(state: GameState): void {
  const dirs: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
  const safe = dirs.filter((d) => !wouldHitWall(state, state.p2, d));
  if (safe.length === 0) return;

  // 60% chance to just pick a random safe direction
  if (Math.random() < 0.6) {
    const random = safe[Math.floor(Math.random() * safe.length)];
    applyAiDir(state, random);
    return;
  }

  // Otherwise head vaguely toward nearest coinbase
  const target = state.coinbases[0]?.pos;
  if (target) {
    const preferred = preferredDirToward(state.p2.head, target);
    if (safe.includes(preferred)) {
      applyAiDir(state, preferred);
      return;
    }
  }
  applyAiDir(state, safe[Math.floor(Math.random() * safe.length)]);
}

/** Hunter: A* toward nearest coinbase (original BigToshi behavior) */
function decideHunter(state: GameState): void {
  const path = findPathP2(state);
  applyPathToAi(state, path);
}

/** Tactician: A* + threat modeling, occasionally cuts off player */
function decideTactician(state: GameState): void {
  // Every 3 ticks, try to intercept player instead of chasing coinbase
  if (state.tickCount % 3 === 0) {
    const intercept = findInterceptPath(state);
    if (intercept && intercept.length > 1) {
      applyPathToAi(state, intercept);
      return;
    }
  }
  const path = findPathP2(state, true);
  applyPathToAi(state, path);
}

/** Sovereign: full lookahead with territory control and power-up usage */
function decideSovereign(state: GameState): void {
  // Grab power-up if close
  const nearbyPowerUp = state.powerUpItems.find(
    (p) => Math.hypot(p.pos[0] - state.p2.head[0], p.pos[1] - state.p2.head[1]) < 6
  );
  if (nearbyPowerUp) {
    const path = findPath(state, state.p2.head, nearbyPowerUp.pos, true);
    if (path.length > 1) {
      applyPathToAi(state, path);
      return;
    }
  }

  // Territory-aware coinbase selection
  const bestCoinbase = chooseBestCoinbaseForAi(state);
  if (bestCoinbase) {
    const path = findPath(state, state.p2.head, bestCoinbase, true);
    if (path.length > 1) {
      applyPathToAi(state, path);
      return;
    }
  }

  // Fallback: avoid death
  const dirs: Exclude<Direction, ''>[] = ['Up', 'Down', 'Left', 'Right'];
  const safe = dirs.filter((d) => !wouldHitWall(state, state.p2, d));
  if (safe.length > 0) applyAiDir(state, safe[0]);
}

function chooseBestCoinbaseForAi(state: GameState): GridPos | null {
  if (state.coinbases.length === 0) return null;

  let best: GridPos | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const cb of state.coinbases) {
    if (cb.isDecoy) continue;
    const distAi = Math.hypot(cb.pos[0] - state.p2.head[0], cb.pos[1] - state.p2.head[1]);
    const distPlayer = Math.hypot(cb.pos[0] - state.p1.head[0], cb.pos[1] - state.p1.head[1]);
    const score = distPlayer - distAi + (cb.reward ? cb.reward * 2 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = cb.pos;
    }
  }
  return best;
}

function applyPathToAi(state: GameState, path: GridPos[]): void {
  if (path.length < 2) return;
  const next = path[1];
  const [x, y] = state.p2.head;

  let dir: Exclude<Direction, ''> | null = null;
  if (next[0] === x && next[1] > y) dir = 'Down';
  else if (next[0] === x && next[1] < y) dir = 'Up';
  else if (next[1] === y && next[0] > x) dir = 'Right';
  else if (next[1] === y && next[0] < x) dir = 'Left';

  if (dir) applyAiDir(state, dir);
}

function applyAiDir(state: GameState, dir: Exclude<Direction, ''>): void {
  const cur = state.p2.dir;
  if (dir === 'Down' && (cur === 'Left' || cur === 'Right' || cur === '')) state.p2.dirWanted = 'Down';
  else if (dir === 'Up' && (cur === 'Left' || cur === 'Right' || cur === '')) state.p2.dirWanted = 'Up';
  else if (dir === 'Right' && (cur === 'Up' || cur === 'Down' || cur === '')) state.p2.dirWanted = 'Right';
  else if (dir === 'Left' && (cur === 'Up' || cur === 'Down' || cur === '')) state.p2.dirWanted = 'Left';
}

/** True if b is the opposite cardinal direction of a (snake cannot reverse in one tick). */
function dirsAreOpposite(a: Direction, b: Direction): boolean {
  if (!a || !b) return false;
  return (
    (a === 'Up' && b === 'Down') ||
    (a === 'Down' && b === 'Up') ||
    (a === 'Left' && b === 'Right') ||
    (a === 'Right' && b === 'Left')
  );
}

function stepDirFromTo(from: GridPos, to: GridPos): Exclude<Direction, ''> | null {
  if (to[0] > from[0]) return 'Right';
  if (to[0] < from[0]) return 'Left';
  if (to[1] > from[1]) return 'Down';
  if (to[1] < from[1]) return 'Up';
  return null;
}

function wouldHitWall(state: GameState, snake: GameState['p1'], dir: Direction): boolean {
  const facing = snake.dir || snake.dirWanted;
  if (facing && dir && dirsAreOpposite(facing, dir)) return true;
  const next: GridPos = [snake.head[0], snake.head[1]];
  if (dir === 'Up') next[1] -= 1;
  else if (dir === 'Down') next[1] += 1;
  else if (dir === 'Left') next[0] -= 1;
  else if (dir === 'Right') next[0] += 1;
  return outOfBounds(state, next) || hitsObstacle(state, next) ||
    snake.body.some((p) => samePos(p, next));
}

function preferredDirToward(from: GridPos, to: GridPos): Exclude<Direction, ''> {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'Right' : 'Left';
  return dy > 0 ? 'Down' : 'Up';
}

function findInterceptPath(state: GameState): GridPos[] | null {
  const predicted: GridPos = [
    state.p1.head[0] + (state.p1.dir === 'Right' ? 4 : state.p1.dir === 'Left' ? -4 : 0),
    state.p1.head[1] + (state.p1.dir === 'Down' ? 4 : state.p1.dir === 'Up' ? -4 : 0),
  ];
  const path = findPath(state, state.p2.head, predicted, true);
  return path.length > 1 ? path : null;
}

// ============================================================================
// Pathfinding
// ============================================================================

function findPathP2(state: GameState, avoidPlayer = false): GridPos[] {
  const start: GridPos = [state.p2.head[0], state.p2.head[1]];
  const target = state.coinbases.find((cb) => !cb.isDecoy)?.pos;
  if (!target) return [start];
  return findPath(state, start, target, avoidPlayer);
}

function findPath(
  state: GameState,
  start: GridPos,
  target: GridPos,
  avoidPlayerBody: boolean
): GridPos[] {
  const openSet: GridPos[] = [start];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[posKey(start), 0]]);
  const fScore = new Map<string, number>([[posKey(start), heuristic(start, target)]]);

  while (openSet.length > 0) {
    let current = openSet[0];
    let currentF = fScore.get(posKey(current)) ?? Number.POSITIVE_INFINITY;
    for (const node of openSet) {
      const score = fScore.get(posKey(node)) ?? Number.POSITIVE_INFINITY;
      if (score < currentF) { current = node; currentF = score; }
    }

    if (samePos(current, target)) return reconstructPath(cameFrom, current);

    openSet.splice(openSet.findIndex((n) => posKey(n) === posKey(current)), 1);

    const neighbors: GridPos[] = [
      [current[0] + 1, current[1]],
      [current[0] - 1, current[1]],
      [current[0], current[1] + 1],
      [current[0], current[1] - 1],
    ];

    for (const neighbor of neighbors) {
      if (outOfBounds(state, neighbor)) continue;
      if (hitsObstacle(state, neighbor)) continue;
      if (state.p2.body.some((p) => samePos(p, neighbor))) continue;
      if (avoidPlayerBody && state.p1.body.some((p) => samePos(p, neighbor))) continue;
      if (samePos(current, start) && samePos(start, state.p2.head)) {
        const facing = state.p2.dir || state.p2.dirWanted;
        const step = stepDirFromTo(current, neighbor);
        if (facing && step && dirsAreOpposite(facing, step)) continue;
      }

      const tentative = (gScore.get(posKey(current)) ?? Number.POSITIVE_INFINITY) + 1;
      if (tentative < (gScore.get(posKey(neighbor)) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(posKey(neighbor), posKey(current));
        gScore.set(posKey(neighbor), tentative);
        fScore.set(posKey(neighbor), tentative + heuristic(neighbor, target));
        if (!openSet.some((n) => posKey(n) === posKey(neighbor))) openSet.push(neighbor);
      }
    }
  }
  return [start];
}

function heuristic(a: GridPos, b: GridPos): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function posKey(pos: GridPos): string {
  return `${pos[0]}:${pos[1]}`;
}

function reconstructPath(cameFrom: Map<string, string>, current: GridPos): GridPos[] {
  const path: GridPos[] = [[current[0], current[1]]];
  let cursor = posKey(current);
  while (cameFrom.has(cursor)) {
    const prev = cameFrom.get(cursor)!;
    const [x, y] = prev.split(':').map((n) => Number.parseInt(n, 10));
    path.unshift([x, y]);
    cursor = prev;
  }
  return path;
}

// ============================================================================
// getMetaFromDuel (for legacy socket-based modes)
// ============================================================================

export function getMetaFromDuel(
  mode: string
): Pick<GameMeta, 'modeLabel' | 'practiceMode' | 'isTournament' | 'sovereignMode' |
  'overclockMode' | 'convergenceMode' | 'powerupMode' | 'gauntletMode' | 'bountyMode'> {
  const normalized = mode?.toUpperCase() ?? 'P2P';
  if (normalized === 'TOURNAMENT' || normalized === 'TOURNAMENTNOSTR') {
    return { modeLabel: mode, practiceMode: false, isTournament: true, sovereignMode: false, overclockMode: false, convergenceMode: false, powerupMode: false, gauntletMode: false, bountyMode: false };
  }
  if (normalized === 'PRACTICE' || normalized === 'SOVEREIGN') {
    return { modeLabel: normalized === 'SOVEREIGN' ? 'Sovereign' : 'Practice', practiceMode: true, isTournament: false, sovereignMode: normalized === 'SOVEREIGN', overclockMode: false, convergenceMode: false, powerupMode: false, gauntletMode: false, bountyMode: false };
  }
  if (normalized === 'OVERCLOCK') {
    return { modeLabel: 'Overclock', practiceMode: false, isTournament: false, sovereignMode: false, overclockMode: true, convergenceMode: false, powerupMode: false, gauntletMode: false, bountyMode: false };
  }
  if (normalized === 'CONVERGENCE') {
    return { modeLabel: 'Convergence', practiceMode: false, isTournament: false, sovereignMode: false, overclockMode: false, convergenceMode: true, powerupMode: false, gauntletMode: false, bountyMode: false };
  }
  if (normalized === 'POWERUP') {
    return { modeLabel: 'Power-Up Arena', practiceMode: false, isTournament: false, sovereignMode: false, overclockMode: false, convergenceMode: false, powerupMode: true, gauntletMode: false, bountyMode: false };
  }
  if (normalized === 'GAUNTLET') {
    return { modeLabel: 'Gauntlet', practiceMode: false, isTournament: false, sovereignMode: false, overclockMode: false, convergenceMode: false, powerupMode: false, gauntletMode: true, bountyMode: false };
  }
  if (normalized === 'BOUNTY') {
    // Legacy / replay payloads (no Bounty page in client)
    return { modeLabel: 'Bounty Hunt', practiceMode: false, isTournament: false, sovereignMode: false, overclockMode: false, convergenceMode: false, powerupMode: false, gauntletMode: false, bountyMode: true };
  }
  return { modeLabel: mode || 'P2P', practiceMode: false, isTournament: false, sovereignMode: false, overclockMode: false, convergenceMode: false, powerupMode: false, gauntletMode: false, bountyMode: false };
}

