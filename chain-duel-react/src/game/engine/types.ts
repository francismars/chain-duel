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
  | 'DECOY';      // Spawn fake coinbase that teleports opponent on eat

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

export interface ObstacleWall {
  pos: GridPos;
  expiresAtTick?: number;
}

export interface TeleportDoor {
  a: GridPos;
  b: GridPos;
  colorIndex: number; // 0-3, controls portal color pair
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
  bountyMode: boolean;
  labyrinthMode: boolean;
  labyrinthLoopFactor: number;
  labyrinthCornerFactor: number;
  labyrinthRegenInterval: number;
  labyrinthCorridorWidth: number;   // 1 | 2 | 4 | 5
  labyrinthSections: number;        // 1 | 3
  labyrinthTeleports: boolean;
  teamMode: TeamMode;
  invisibleGrid: boolean;
  currentStepMs: number;
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
  // Labyrinth mode
  labyrinthSeed: number;
  labyrinthNextRegenTick: number;
  // Convergence wall-close finale
  convergenceWallClosed: boolean;
  // Labyrinth teleport doors
  teleportDoors: TeleportDoor[];
  // Multi-snake (teams / ffa) extra snakes
  extraSnakes: ExtraSnake[];
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
}
