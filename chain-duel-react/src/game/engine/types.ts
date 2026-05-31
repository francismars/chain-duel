export type Direction = 'Up' | 'Down' | 'Left' | 'Right' | '';
export type PlayerId = 'P1' | 'P2';
export type AiTier = 'normie' | 'stacker' | 'noderunner' | 'sovereign';

const LEGACY_AI_TIER: Record<string, AiTier> = {
  wanderer: 'normie',
  hunter: 'stacker',
  tactician: 'noderunner',
  sovereign: 'sovereign',
};

/** Map persisted / legacy tier slugs to current AiTier values. */
export function normalizeAiTier(tier: string | undefined): AiTier {
  if (tier === 'normie' || tier === 'stacker' || tier === 'noderunner' || tier === 'sovereign') {
    return tier;
  }
  if (tier && tier in LEGACY_AI_TIER) return LEGACY_AI_TIER[tier]!;
  return 'stacker';
}

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

export type PowerUpType =
  | 'SURGE'
  | 'FREEZE'
  | 'PHANTOM'
  | 'AMPLIFIER'
  | 'DECOY';

export interface PowerUpItem {
  pos: GridPos;
  type: PowerUpType;
}

export interface ActivePowerUp {
  type: PowerUpType;
  playerIndex: 0 | 1 | 2 | 3;
  expiresAtTick: number;
  chargesLeft?: number;
}

export type TeamMode = 'solo' | 'ffa';

export interface ExtraSnake {
  snake: SnakeState;
  teamId: 0 | 1;
  color: number;
  outline?: number;
  name: string;
  score: number;
  aiTier: AiTier;
  humanControlled: boolean;
  spawnHead: GridPos;
  spawnDir: Direction;
}

export interface ObstacleWall {
  pos: GridPos;
  expiresAtTick?: number;
}

export interface ShrinkBorder {
  top: number;
  bottom: number;
  left: number;
  right: number;
  warningActive: boolean;
}

export interface GameMeta {
  modeLabel: string;
  isTournament: boolean;
  practiceMode: boolean;
  p1Human: boolean;
  p2Human: boolean;
  aiTier: AiTier;
  convergenceMode: boolean;
  convergenceShrinkInterval: number;
  convergenceMinCols: number;
  convergenceMinRows: number;
  powerupMode: boolean;
  teamMode: TeamMode;
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
  tickCount: number;
  powerUpItems: PowerUpItem[];
  activePowerUps: ActivePowerUp[];
  obstacleWalls: ObstacleWall[];
  shrinkBorder: ShrinkBorder | null;
  powerUpRespawnCooldownTick: number;
  convergenceWallClosed: boolean;
  extraSnakes: ExtraSnake[];
  /** FFA: per-player starting sats (P1, P2, P3, P4). */
  ffaInitialScores?: [number, number, number, number];
}

export interface FfaHudPlayer {
  index: 0 | 1 | 2 | 3;
  name: string;
  color: string;
  score: number;
  capture: string;
  initialShare: number;
  currentShare: number;
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
  ffa?: {
    players: FfaHudPlayer[];
  };
}

export interface TickResult {
  winnerChanged: boolean;
  winnerPlayer: PlayerId | null;
}
