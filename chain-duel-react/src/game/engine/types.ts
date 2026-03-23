export type Direction = 'Up' | 'Down' | 'Left' | 'Right' | '';
export type PlayerId = 'P1' | 'P2';
export type AiTier = 'wanderer' | 'hunter' | 'tactician' | 'sovereign';

export type GridPos = [number, number];

export interface SnakeState {
  head: GridPos;
  body: GridPos[];
  dir: Direction;
  dirWanted: Direction;
}

export interface Coinbase {
  pos: GridPos;
  reward?: 2 | 4 | 8 | 16 | 32;
  isDecoy?: boolean;
  isBounty?: boolean;
  /** Which 3D board layer this coinbase lives on (undefined = layer 0 / non-3D). */
  layer?: 0 | 1;
}

export interface PointChange {
  player: PlayerId;
  value: number;
  p1Pos: GridPos;
  p2Pos: GridPos;
  p1YOffsetPx: number;
  p2YOffsetPx: number;
  alpha: number;
}

// ============================================================================
// Power-ups
// ============================================================================

export type PowerUpType =
  | 'SURGE'       // Speed boost for self (4s)
  | 'FREEZE'      // Slow opponent (4s)
  | 'PHANTOM'     // Pass through own body (5s)
  | 'ANCHOR'      // Drop immovable wall cell at tail (10s)
  | 'AMPLIFIER'   // Double capture % for next 3 coinbases
  | 'DECOY'       // Spawn fake coinbase that teleports opponent on eat
  | 'FORK';       // Clone chain — auto-AI twin that hunts coinbases for 10s

export interface PowerUpItem {
  pos: GridPos;
  type: PowerUpType;
}

export interface ActivePowerUp {
  type: PowerUpType;
  player: PlayerId;
  expiresAtTick: number;
  chargesLeft?: number;
}

// ============================================================================
// Team / multi-snake modes
// ============================================================================

export type TeamMode = 'solo' | 'teams' | 'ffa';

/** Extra snake (P3/P4) in teams or FFA — AI or human-controlled. */
export interface ExtraSnake {
  snake: SnakeState;
  teamId: 0 | 1;   // 0 = white side, 1 = black side
  color: number;   // hex 24-bit fill color
  /** Optional inner-border color drawn around each segment to distinguish ally from player. */
  outline?: number;
  name: string;
  score: number;   // individual score tracked in FFA mode
  aiTier: AiTier;
  /** When true, player input steers this snake; otherwise `decideExtraSnakeDir` runs. */
  humanControlled: boolean;
  spawnHead: GridPos;
  spawnDir: Direction;
}

// ============================================================================
// Fork power-up — cloned AI chain
// ============================================================================

/** A short-lived AI-controlled clone chain spawned by the FORK power-up. */
export interface ForkChain {
  snake: SnakeState;
  player: PlayerId;
  spawnTick: number;
  expiresAtTick: number;
}

/**
 * A recorded fork-birth event used purely for the split animation.
 * Renderer reads it for the glow burst; the event self-expires after ~35 ticks.
 */
export interface ForkBurst {
  pos: GridPos;
  spawnDir: Direction;
  forkDir: Direction;
  player: PlayerId;
  tick: number;
}

// ============================================================================
// 3D layered board
// ============================================================================

/** Obstacle walls for one alternate board layer (layer 1+). Layer 0 = state.obstacleWalls. */
export interface Board3DLayer {
  obstacleWalls: ObstacleWall[];
}

export interface ObstacleWall {
  pos: GridPos;
  expiresAtTick?: number;
  /** True for walls that are replaced every tick (oscillating / moving walls). */
  isMoving?: boolean;
}

export interface TeleportDoor {
  a: GridPos;
  b: GridPos;
  colorIndex: number;     // 0-3, controls portal color pair
  switchesLayer?: boolean; // if true, also flips the player's 3D layer on exit
}

// ============================================================================
// Convergence shrink border
// ============================================================================

export interface ShrinkBorder {
  top: number;
  bottom: number;
  left: number;
  right: number;
  warningActive: boolean;
}

// ============================================================================
// Gauntlet level
// ============================================================================

export type GauntletModifier =
  | 'ai_opponent'
  | 'speed_60'
  | 'shrinking_border'
  | 'invisible_grid'
  | 'void_cells'
  | 'reward_only'
  | 'multiple_coinbases'
  | 'portals'
  | 'moving_walls'
  | 'layers_3d';

export interface GauntletLevel {
  id: number;
  name: string;
  description: string;
  parTimeSecs: number;
  challengeCondition: string;
  obstacleWalls: GridPos[];
  initialCoinbasePositions: GridPos[];
  modifiers: GauntletModifier[];
  startStepMs?: number;
  /** Number of teleport portal pairs to generate (used with 'portals' modifier). */
  portalPairs?: number;
  /** Obstacle walls for the second 3D board layer (used with 'layers_3d' modifier). */
  altLayerWalls?: GridPos[];
  /** Prize in sats for clearing this level (standard Lightning). */
  prizeNormal: number;
  /** Prize in sats for clearing this level via Nostr/zap mode (2× bonus). */
  prizeNostr: number;
}

// ============================================================================
// Meta and state
// ============================================================================

export interface GameMeta {
  modeLabel: string;
  isTournament: boolean;
  practiceMode: boolean;
  /** When false, P1 is driven by AI (WASD / pad 1 ignored). */
  p1Human: boolean;
  /** When false, P2 is driven by AI (arrows / pad 2 ignored). */
  p2Human: boolean;
  sovereignMode: boolean;
  aiTier: AiTier;
  overclockMode: boolean;
  overclockMinStepMs: number;
  overclockStepIntervalTicks: number;
  overclockSpeedReductionMs: number;
  convergenceMode: boolean;
  convergenceShrinkInterval: number;
  convergenceMinCols: number;
  convergenceMinRows: number;
  powerupMode: boolean;
  powerupSpawnCooldown: number;
  powerupMaxItems: number;
  powerupAllowedTypes: PowerUpType[];
  strategyMode: boolean;
  gauntletMode: boolean;
  gauntletLevel: number;
  bountyMode: boolean;
  labyrinthMode: boolean;
  labyrinthLoopFactor: number;
  labyrinthCornerFactor: number;
  labyrinthRegenInterval: number;
  labyrinthCorridorWidth: number;   // 1 | 2 | 4 | 5
  labyrinthSections: number;        // 1 | 3
  labyrinthTeleports: boolean;
  teamMode: TeamMode;
  layers3D: boolean;
  invisibleGrid: boolean;
  currentStepMs: number;
  p1ChainAbilityAvailable: boolean;
  p2ChainAbilityAvailable: boolean;
}

export interface GameState {
  cols: number;
  rows: number;
  p1: SnakeState;
  p2: SnakeState;
  coinbases: Coinbase[];
  gameStarted: boolean;
  gameEnded: boolean;
  countdownStart: boolean;
  countdownTicks: number;
  winnerPlayer: PlayerId | null;
  winnerName: string;
  sentWinner: boolean;
  initialScore: [number, number];
  score: [number, number];
  totalPoints: number;
  currentCaptureP1: string;
  currentCaptureP2: string;
  pointChanges: PointChange[];
  p1Name: string;
  p2Name: string;
  meta: GameMeta;
  // New extended fields
  tickCount: number;
  powerUpItems: PowerUpItem[];
  activePowerUps: ActivePowerUp[];
  obstacleWalls: ObstacleWall[];
  shrinkBorder: ShrinkBorder | null;
  powerUpRespawnCooldownTick: number;
  gauntletStartTick: number;
  gauntletCompleted: boolean;
  gauntletElapsedSecs: number;
  voidCells: GridPos[];
  voidCellsNextToggleTick: number;
  // Labyrinth mode
  labyrinthSeed: number;
  labyrinthNextRegenTick: number;
  // Convergence wall-close finale
  convergenceWallClosed: boolean;
  // Labyrinth teleport doors
  teleportDoors: TeleportDoor[];
  // Spawn positions — used by resetSnake to always return to the correct slot
  p1SpawnHead: GridPos;
  p2SpawnHead: GridPos;
  // Multi-snake (teams / ffa) extra snakes
  extraSnakes: ExtraSnake[];
  // 3D layered board
  board3DLayers: Board3DLayer[];      // index 0 = layer 1 walls (layer 0 = state.obstacleWalls)
  p1Layer: 0 | 1;                     // which layer P1 is currently on
  p2Layer: 0 | 1;
  layerSwitchCooldown: number;        // tick count before P1 can switch again
  // Fork power-up — cloned AI chains
  forkChains: ForkChain[];
  forkBursts: ForkBurst[];
  // Strategy mode: per-player shift slow
  p1ShiftHeld: boolean;
  p2ShiftHeld: boolean;
  /** 0.0 = stopped, 1.0 = full speed. Ramped by shift key. */
  p1ShiftFactor: number;
  p2ShiftFactor: number;
  /** Fractional movement credit; player moves when this reaches 1.0. */
  p1MoveCredit: number;
  p2MoveCredit: number;
}

export interface HudState {
  p1Points: number;
  p2Points: number;
  captureP1: string;
  captureP2: string;
  initialWidthP1: number;
  initialWidthP2: number;
  currentWidthP1: number;
  currentWidthP2: number;
}

export interface TickResult {
  winnerChanged: boolean;
  winnerPlayer: PlayerId | null;
  gauntletCompleted?: boolean;
  gauntletElapsedSecs?: number;
}
