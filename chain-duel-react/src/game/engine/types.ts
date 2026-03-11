export type Direction = 'Up' | 'Down' | 'Left' | 'Right' | '';
export type PlayerId = 'P1' | 'P2';

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

export interface GameMeta {
  modeLabel: string;
  isTournament: boolean;
  practiceMode: boolean;
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
