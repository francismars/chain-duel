import type { GauntletLevel, GridPos } from './types';

// ============================================================================
// Helper: generate wall segments
// ============================================================================

function hWall(x: number, y: number, length: number): GridPos[] {
  return Array.from({ length }, (_, i): GridPos => [x + i, y]);
}

function vWall(x: number, y: number, length: number): GridPos[] {
  return Array.from({ length }, (_, i): GridPos => [x, y + i]);
}

// ============================================================================
// 10 Gauntlet Levels
// ============================================================================

export const GAUNTLET_LEVELS: GauntletLevel[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Level 1 — The Corridor
  // A narrow 3-cell-wide horizontal channel. Navigate end to end.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 1,
    name: 'THE CORRIDOR',
    description: 'Navigate the narrow passage from start to end.',
    parTimeSecs: 12,
    challengeCondition: 'Collect 3 coinbases without reversing',
    obstacleWalls: [
      ...hWall(0, 10, 51),
      ...hWall(0, 14, 51),
    ],
    initialCoinbasePositions: [[40, 12]],
    modifiers: [],
    prizeNormal: 500,
    prizeNostr: 1_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 2 — The Spiral
  // Clockwise spiral wall. A single winding path to the center.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 2,
    name: 'THE SPIRAL',
    description: 'Follow the spiral inward to reach the prize.',
    parTimeSecs: 20,
    challengeCondition: 'Reach the center without backtracking',
    obstacleWalls: [
      ...hWall(4, 4, 43),
      ...vWall(46, 4, 17),
      ...hWall(4, 20, 42),
      ...vWall(4, 4, 12),
      ...hWall(8, 8, 35),
      ...vWall(42, 8, 10),
      ...hWall(8, 17, 34),
      ...vWall(8, 8, 5),
      ...hWall(12, 12, 26),
    ],
    initialCoinbasePositions: [[25, 14]],
    modifiers: [],
    prizeNormal: 1_000,
    prizeNostr: 2_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 3 — The Cross
  // Four quadrant walls; coinbases in each quadrant. Visit all four.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 3,
    name: 'THE CROSS',
    description: 'Collect a coinbase in each quadrant.',
    parTimeSecs: 25,
    challengeCondition: 'Collect all 4 coinbases',
    obstacleWalls: [
      ...hWall(22, 0, 7),
      ...hWall(22, 24, 7),
      ...vWall(22, 9, 7),
      ...vWall(28, 9, 7),
    ],
    initialCoinbasePositions: [
      [8, 6],
      [42, 6],
      [8, 18],
      [42, 18],
    ],
    modifiers: ['multiple_coinbases'],
    prizeNormal: 2_000,
    prizeNostr: 4_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 4 — Moving Walls
  // Two horizontal bars oscillate vertically. Wait for the gap, then cross.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 4,
    name: 'MOVING WALLS',
    description: 'Two barriers sweep up and down — one from the top, one from the bottom. Wait for the gap to open, then cross before it closes.',
    parTimeSecs: 18,
    challengeCondition: 'Cross through both walls without collision',
    obstacleWalls: [],          // populated dynamically by the engine
    initialCoinbasePositions: [[44, 12], [8, 12]],
    modifiers: ['moving_walls', 'multiple_coinbases'],
    prizeNormal: 3_500,
    prizeNostr: 7_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 5 — The Duel Mirror
  // A maze with an AI opponent racing for coinbases.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 5,
    name: 'THE DUEL MIRROR',
    description: 'An AI opponent races you through the maze. First to 3 wins.',
    parTimeSecs: 45,
    challengeCondition: 'Collect 3 coinbases before the AI',
    obstacleWalls: [
      ...vWall(12, 0, 9),
      ...vWall(12, 16, 9),
      ...vWall(38, 0, 9),
      ...vWall(38, 16, 9),
      ...hWall(12, 9, 5),
      ...hWall(34, 9, 5),
      ...vWall(25, 5, 5),
      ...vWall(25, 15, 5),
    ],
    initialCoinbasePositions: [[25, 12]],
    modifiers: ['ai_opponent'],
    prizeNormal: 6_000,
    prizeNostr: 12_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 6 — Coin Storm
  // 8 coinbases, aggressive shrinking border. Greed is punished.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 6,
    name: 'COIN STORM',
    description: 'Collect as many as you can before the arena collapses.',
    parTimeSecs: 30,
    challengeCondition: 'Collect 5 coinbases before the border reaches center',
    obstacleWalls: [],
    initialCoinbasePositions: [
      [8, 4], [42, 4], [8, 20], [42, 20],
      [20, 12], [30, 12], [25, 6], [25, 18],
    ],
    modifiers: ['multiple_coinbases', 'shrinking_border'],
    prizeNormal: 10_000,
    prizeNostr: 20_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 7 — Shadow Run
  // Grid is invisible. Only your chain and coinbases are visible.
  // Designed to be easy for humans (spatial intuition) and hard for bots.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 7,
    name: 'SHADOW RUN',
    description: 'The grid has gone dark. Trust your instincts.',
    parTimeSecs: 20,
    challengeCondition: 'Collect 3 coinbases without hitting a wall',
    obstacleWalls: [
      ...vWall(10, 2, 21),
      ...vWall(40, 2, 21),
      ...hWall(10, 2, 31),
      ...hWall(10, 22, 31),
    ],
    initialCoinbasePositions: [[25, 12]],
    modifiers: ['invisible_grid'],
    prizeNormal: 15_000,
    prizeNostr: 30_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 8 — Speed Demon
  // Starts at 60ms tick rate (nearly double normal speed).
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 8,
    name: 'SPEED DEMON',
    description: 'Everything happens faster. React or die.',
    parTimeSecs: 15,
    challengeCondition: 'Collect 5 coinbases at max speed',
    obstacleWalls: [
      ...vWall(17, 5, 15),
      ...vWall(33, 5, 15),
    ],
    initialCoinbasePositions: [[25, 12]],
    modifiers: ['speed_60'],
    startStepMs: 60,
    prizeNormal: 21_000,
    prizeNostr: 42_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 9 — The Void
  // Random cells disappear and reappear every 5 seconds.
  // Humans read the pattern by gestalt; bots need perfect state tracking.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 9,
    name: 'THE VOID',
    description: 'Cells blink in and out of existence. The floor is unreliable.',
    parTimeSecs: 35,
    challengeCondition: 'Collect 4 coinbases without stepping on a void cell',
    obstacleWalls: [],
    initialCoinbasePositions: [[25, 12]],
    modifiers: ['void_cells'],
    prizeNormal: 30_000,
    prizeNostr: 60_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 10 — Sovereign Trial
  // All mechanics combined. The ultimate test.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 10,
    name: 'SOVEREIGN TRIAL',
    description: 'Moving walls. Shrinking border. AI opponent. Reward coinbases only. Prove your sovereignty.',
    parTimeSecs: 60,
    challengeCondition: 'Defeat the AI before the arena collapses to 15x15',
    obstacleWalls: [
      ...vWall(10, 3, 7),
      ...vWall(10, 15, 7),
      ...vWall(40, 3, 7),
      ...vWall(40, 15, 7),
    ],
    initialCoinbasePositions: [[25, 12]],
    modifiers: ['ai_opponent', 'shrinking_border', 'reward_only', 'speed_60'],
    startStepMs: 80,
    prizeNormal: 50_000,
    prizeNostr: 100_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 11 — Portal Network
  // 4 pairs of colour-coded portals scattered across a divided arena.
  // Learn their layout, use them to teleport past walls, outrun the AI.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 11,
    name: 'PORTAL NETWORK',
    description: '2 colour-coded portal pairs cross the board diagonally. Step in on one side, exit on the other — use them to outpace the AI and reach coinbases across the map.',
    parTimeSecs: 40,
    challengeCondition: 'Collect 5 coinbases using both portals',
    obstacleWalls: [],
    initialCoinbasePositions: [[25, 12]],
    modifiers: ['portals', 'ai_opponent'],
    portalPairs: 2,
    prizeNormal: 75_000,
    prizeNostr: 150_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 12 — Phase Shift
  // Two boards stacked at different depths. Press Q to phase between them.
  // Each board has walls the other lacks — gaps only exist on one layer.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 12,
    name: 'PHASE SHIFT',
    description: 'Two boards at different depths. Press Q to phase-shift between layers. Walls that block you on one floor are open on the other — use them to reach coinbases.',
    parTimeSecs: 45,
    challengeCondition: 'Collect 5 coinbases by switching layers',
    obstacleWalls: [
      // Layer 0: three vertical barriers with gaps at different heights
      ...vWall(17, 0, 8),
      ...vWall(17, 14, 11),
      ...vWall(33, 6, 9),
      ...vWall(33, 19, 6),
    ],
    altLayerWalls: [
      // Layer 1: complementary walls — gaps where layer 0 blocks
      ...vWall(17, 8, 6),
      ...vWall(33, 0, 6),
      ...vWall(33, 15, 4),
      ...hWall(10, 12, 7),
      ...hWall(34, 12, 7),
    ],
    initialCoinbasePositions: [[25, 12]],
    modifiers: ['layers_3d', 'ai_opponent'],
    prizeNormal: 100_000,
    prizeNostr: 200_000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Level 13 — Quantum Maze
  // Two layered boards + AI. Each layer has different room dividers with
  // generous gaps — press Q to phase between floors and reach blocked areas.
  //
  // Layer 0  horizontal dividers, open in the centre column (x 18-32):
  //   rows y=8 and y=16 are walled on the left and right wings only.
  //
  // Layer 1  vertical dividers, open in the centre row band (y 8-16):
  //   columns x=15 and x=35 are walled in the top and bottom wings only.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 13,
    name: 'QUANTUM MAZE',
    description: 'Two floors, one maze. Walls that trap you on Floor 0 vanish on Floor 1 — and vice versa. Press Q to phase between layers and outmanoeuvre the AI.',
    parTimeSecs: 55,
    challengeCondition: 'Collect 6 coinbases before the AI',
    obstacleWalls: [
      // Layer 0: horizontal room dividers — blocked on wings, open in centre (x 18-32)
      ...hWall(1,  8, 16),   // left wing  row 8  (x 1-16)
      ...hWall(33, 8, 17),   // right wing row 8  (x 33-49)
      ...hWall(1, 16, 16),   // left wing  row 16 (x 1-16)
      ...hWall(33, 16, 17),  // right wing row 16 (x 33-49)
    ],
    altLayerWalls: [
      // Layer 1: vertical room dividers — blocked on top/bottom wings, open in centre (y 9-15)
      ...vWall(15,  1,  7),  // left col  top wing    (y 1-7)
      ...vWall(15, 17,  7),  // left col  bottom wing (y 17-23)
      ...vWall(35,  1,  7),  // right col top wing    (y 1-7)
      ...vWall(35, 17,  7),  // right col bottom wing (y 17-23)
    ],
    initialCoinbasePositions: [
      [7, 4], [43, 4],    // top corners — easier from layer 1
      [7, 20], [43, 20],  // bottom corners — easier from layer 1
      [25, 4], [25, 20],  // top/bottom centre — easier from layer 0
    ],
    modifiers: ['layers_3d', 'ai_opponent', 'multiple_coinbases'],
    prizeNormal: 150_000,
    prizeNostr: 300_000,
  },
];

export function getGauntletLevel(id: number): GauntletLevel {
  const level = GAUNTLET_LEVELS.find((l) => l.id === id);
  if (!level) return GAUNTLET_LEVELS[0];
  return level;
}
