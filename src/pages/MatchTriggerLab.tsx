import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAudio } from '@/contexts/AudioContext';
import { GameAudioSystem, reorgCaptureGap } from '@/game/audio/gameAudio';
import {
  advanceStreakPops,
  clearStreakPops,
  pushCaptureRatePop,
  pushSpawnFlash,
  DEFAULT_RESET_MARK_STYLE,
  setResetMarkStyle,
  streakPops,
  subscribeTensionDebug,
  tensionDebugSnapshot,
  type ResetMarkStyle,
  type TensionDebugSnapshot,
} from '@/game/audio/tensionDebug';
import { lostPlayablePercent } from '@/game/audio/tension';
import { STEP_SPEED_MS } from '@/game/engine/constants';
import { visibleDeathCell } from '@/game/engine/deathCell';
import { captureRateLabel } from '@/game/engine/captureRateLabel';
import {
  advancePointChanges,
  createGameState,
  createNewCoinbase,
  stepGame,
} from '@/game/engine';
import { resetCuesFromStep } from '@/game/audio/resetCue';
import {
  makeDirector,
  makeTourState,
  TOURS,
  type TourId,
} from './matchTriggerLabTours';
import type {
  Coinbase,
  Direction,
  GameState,
  GridPos,
  SnakeState,
} from '@/game/engine/types';
import {
  classifyStep,
  commitMove,
  inPlay,
  projectSnake,
  routeAround,
  type Rider,
} from './matchTriggerLabMotion';
import { GameInfoLabel } from '@/features/game/GameInfoLabel';
import { MempoolFooter } from '@/features/game/MempoolFooter';
import { MatchEndCard } from '@/features/game/MatchEndCard';
import { PowerUpLegend } from '@/features/game/PowerUpLegend';
import { OnlineVictoryReveal } from '@/components/online/OnlineVictoryReveal';
import { DEBUG_P1_SESSION } from '@/lib/online/onlineUiDebug';
import { PlayerRole, type OnlineRoomState } from '@/types/socket';
import '@/styles/components/matchResults.css';
import {
  captureFeedbackStyleFromCtx,
  captureHitStyleVars,
  distributionTrackFeedbackStyle,
  satsCaptureBarIntensityFromLabel,
  type CaptureSide,
} from '@/features/game/hudCaptureFeedback';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { PixiGameRenderer } from '@/game/render/pixiRenderer';
import {
  captureClipForLength,
  capturePercentForLength,
  gameRecipe,
  type MatchRecipe,
} from '@/game/effects/matchRecipe';
import { EffectRecipePanel, RecipeBar } from './EffectRecipePanel';
// The HUD above the board is the real game HUD. Its layout lives in game.css.
import './game.css';
import './matchTriggerLab.css';

const POT = 10000;
const MAX_CHAIN = 36;
const MAX_INSET = 8;

type LabModeId =
  'freeplay' | 'p2p' | 'tournament' | 'online' | 'challenge' | 'ffa';

type LabMode = {
  id: LabModeId;
  label: string;
  summary: string;
  convergence: boolean;
  powerups: boolean;
  block: boolean;
  practice: boolean;
  tournament: boolean;
  /** Four chains. Drain, death color, and crash sounds follow the free-for-all. */
  ffa: boolean;
  modeLabel: string;
};

const LAB_MODES: LabMode[] = [
  {
    id: 'freeplay',
    label: 'Free play',
    summary: 'Walls close. Power-ups can appear. A new block plays a sound.',
    convergence: true,
    powerups: true,
    block: true,
    practice: true,
    tournament: false,
    ffa: false,
    modeLabel: 'FREE PLAY',
  },
  {
    id: 'p2p',
    label: 'P2P',
    summary: 'Walls stay open. No power-ups. A new block still plays a sound.',
    convergence: false,
    powerups: false,
    block: true,
    practice: false,
    tournament: false,
    ffa: false,
    modeLabel: 'P2P',
  },
  {
    id: 'tournament',
    label: 'Tournament',
    summary:
      'Same board as P2P. The bracket and the payment sit outside the match.',
    convergence: false,
    powerups: false,
    block: true,
    practice: false,
    tournament: true,
    ffa: false,
    modeLabel: 'TOURNAMENT',
  },
  {
    id: 'online',
    label: 'Online',
    summary:
      'Walls stay open. No power-ups. Scrubbing a replay fires the score pops again.',
    convergence: false,
    powerups: false,
    block: true,
    practice: false,
    tournament: false,
    ffa: false,
    modeLabel: 'ONLINE',
  },
  {
    id: 'challenge',
    label: 'Challenge',
    summary: 'Walls stay open. A new block is silent.',
    convergence: false,
    powerups: false,
    block: false,
    practice: true,
    tournament: false,
    ffa: false,
    modeLabel: 'CHALLENGE',
  },
  {
    id: 'ffa',
    label: 'Free for all',
    summary:
      'Four chains, equal sats. Drain follows how many still hold sats. Each death uses that chain’s color and crash sound.',
    convergence: false,
    powerups: false,
    block: true,
    practice: true,
    tournament: false,
    ffa: true,
    modeLabel: 'FFA',
  },
];

type SoloClip = {
  id: string;
  name: string;
  src: string;
  loop: boolean;
  where: string;
  /** Modes where this is heard. Menus are outside the board. */
  inMode: (mode: LabMode) => boolean;
};

const SOLO_CLIPS: SoloClip[] = [
  {
    id: 'menu',
    name: 'Menu',
    src: '/sound/chain_duel_produced_menu.m4a',
    loop: true,
    where: 'Menus, lobby, bracket, results',
    inMode: () => true,
  },
  {
    id: 'game',
    name: 'Game bed',
    src: '/sound/chain_duel_produced_game.m4a',
    loop: true,
    where: 'Every match',
    inMode: () => true,
  },
  {
    id: 'build',
    name: 'Build',
    src: '/sound/chain_duel_build.m4a',
    loop: true,
    where: 'Pressure mark 1',
    inMode: () => true,
  },
  {
    id: 'pressure',
    name: 'Pressure',
    src: '/sound/chain_duel_pressure.m4a',
    loop: true,
    where: 'Pressure mark 2',
    inMode: () => true,
  },
  {
    id: 'tension',
    name: 'Tension',
    src: '/sound/chain_duel_tension.m4a',
    loop: true,
    where: 'Pressure mark 3',
    inMode: () => true,
  },
  {
    id: 'critical',
    name: 'Critical',
    src: '/sound/chain_duel_critical.m4a',
    loop: true,
    where: 'Pressure mark 4',
    inMode: () => true,
  },
  {
    id: 'end',
    name: 'End',
    src: '/sound/chain_duel_end.wav',
    loop: false,
    where: 'Match over, once',
    inMode: () => true,
  },
  {
    id: 'warn',
    name: 'Wall warning',
    src: '/sound/chain_duel_warn.wav',
    loop: false,
    where: 'Border lights, the second before a step',
    inMode: (mode) => mode.convergence,
  },
  {
    id: 'shrink',
    name: 'Shrink',
    src: '/sound/chain_duel_shrink.wav',
    loop: false,
    where: 'Walls step in',
    inMode: (mode) => mode.convergence,
  },
  {
    id: 'beep1',
    name: 'Beep 1',
    src: '/sound/Beep1.m4a',
    loop: false,
    where: 'Countdown 3, 2, 1',
    inMode: () => true,
  },
  {
    id: 'beep2',
    name: 'Beep 2',
    src: '/sound/Beep2.m4a',
    loop: false,
    where: 'Countdown LFG',
    inMode: () => true,
  },
  {
    id: 'p1',
    name: 'White dies',
    src: '/sound/P1-HWAC.aac',
    loop: false,
    where: 'White resets',
    inMode: () => true,
  },
  {
    id: 'p2',
    name: 'Black dies',
    src: '/sound/P2-HWAC.aac',
    loop: false,
    where: 'Black resets',
    inMode: () => true,
  },
  {
    id: 'c2',
    name: 'Capture 2',
    src: '/sound/P-FC_2.aac',
    loop: false,
    where: 'Chain length 1 · 2%',
    inMode: () => true,
  },
  {
    id: 'c4',
    name: 'Capture 4',
    src: '/sound/P-FC_4.aac',
    loop: false,
    where: 'Chain length 2–3 · 4%',
    inMode: () => true,
  },
  {
    id: 'c8',
    name: 'Capture 8',
    src: '/sound/P-FC_8.aac',
    loop: false,
    where: 'Chain length 4–6 · 8%',
    inMode: () => true,
  },
  {
    id: 'c16',
    name: 'Capture 16',
    src: '/sound/P-FC_16.aac',
    loop: false,
    where: 'Chain length 7–10 · 16%',
    inMode: () => true,
  },
  {
    id: 'c32',
    name: 'Capture 32',
    src: '/sound/P-FC_32.aac',
    loop: false,
    where: 'Chain length 11+ · 32%',
    inMode: () => true,
  },
  {
    id: 'power',
    name: 'Power-up',
    src: '/sound/powerup.mp3',
    loop: false,
    where: 'A power-up is taken',
    inMode: (mode) => mode.powerups,
  },
  {
    id: 'block',
    name: 'Block',
    src: '/sound/MAINNET_BLOCK.aac',
    loop: false,
    where: 'New block, or speed change',
    inMode: (mode) => mode.block,
  },
  {
    id: 'select',
    name: 'Menu move',
    src: '/sound/button-select.mp3',
    loop: false,
    where: 'Focus moves in a menu',
    inMode: () => true,
  },
  {
    id: 'confirm',
    name: 'Menu confirm',
    src: '/sound/button-focus.mp3',
    loop: false,
    where: 'A menu button confirms',
    inMode: () => true,
  },
];

const OTHER_CLIPS = SOLO_CLIPS.filter(
  (clip) =>
    !['game', 'build', 'pressure', 'tension', 'critical'].includes(clip.id)
);

function labMode(id: LabModeId): LabMode {
  return LAB_MODES.find((mode) => mode.id === id) ?? LAB_MODES[0];
}

const COUNTDOWN = [
  { tick: 1, label: '3', clip: 'Beep1' },
  { tick: 11, label: '2', clip: 'Beep1' },
  { tick: 21, label: '1', clip: 'Beep1' },
  { tick: 31, label: 'LFG', clip: 'Beep2' },
] as const;

const TRACK_NAME = [
  'off',
  'warning',
  'warning',
  'critical',
  'critical',
] as const;

type Seat = 'P1' | 'P2' | 'P3' | 'P4';

const SEATS: { seat: Seat; rider: Rider; label: string }[] = [
  { seat: 'P1', rider: 'p1', label: 'White' },
  { seat: 'P2', rider: 'p2', label: 'Black' },
  { seat: 'P3', rider: 'p3', label: 'Ghost' },
  { seat: 'P4', rider: 'p4', label: 'Specter' },
];

function labSnake(state: GameState, rider: Rider): SnakeState {
  if (rider === 'p1') return state.p1;
  if (rider === 'p2') return state.p2;
  if (rider === 'p3') return state.extraSnakes[0]!.snake;
  return state.extraSnakes[1]!.snake;
}

function seatOf(rider: Rider): Seat {
  return SEATS.find((entry) => entry.rider === rider)?.seat ?? 'P1';
}

function seatIndex(seat: Seat): number {
  return seat === 'P1' ? 0 : seat === 'P2' ? 1 : seat === 'P3' ? 2 : 3;
}

function presentSeats(state: GameState) {
  return SEATS.filter((entry) => {
    if (entry.rider === 'p3') return Boolean(state.extraSnakes[0]);
    if (entry.rider === 'p4') return Boolean(state.extraSnakes[1]);
    return true;
  });
}

function chainPercent(
  state: GameState,
  rider: Rider,
  recipe: MatchRecipe
): number {
  if (!presentSeats(state).some((entry) => entry.rider === rider)) return 0;
  return capturePercentForLength(
    labSnake(state, rider).body.length,
    recipe.captureFrom,
    recipe.capturePercent
  );
}

function makeLabState(mode: LabMode): GameState {
  const stake = mode.ffa ? POT / 4 : POT / 2;
  const state = createGameState({
    p1Name: 'White',
    p2Name: 'Black',
    p1Points: stake,
    p2Points: stake,
    modeLabel: mode.modeLabel,
    practiceMode: mode.practice,
    convergenceMode: mode.convergence,
    powerupMode: mode.powerups,
    isTournament: mode.tournament,
    teamMode: mode.ffa ? 'ffa' : 'solo',
    p1Human: true,
    p2Human: true,
    p3Human: mode.ffa,
    p4Human: mode.ffa,
  });
  state.gameStarted = true;
  state.p1.dirWanted = 'Right';
  state.p2.dirWanted = 'Left';
  if (mode.ffa) {
    state.p1Name = 'White';
    state.p2Name = 'Black';
    if (state.extraSnakes[0]) state.extraSnakes[0].name = 'Ghost';
    if (state.extraSnakes[1]) state.extraSnakes[1].name = 'Specter';
  }
  return state;
}

function applyInset(state: GameState, inset: number): void {
  const border = state.shrinkBorder;
  if (!border) return;
  const next = Math.max(0, Math.min(MAX_INSET, inset));
  border.left = next;
  border.right = state.cols - 1 - next;
  border.top = next;
  border.bottom = state.rows - 1 - next;
  border.warningActive = next > 0;
}

function applyWhiteShare(state: GameState, share: number): void {
  const clamped = Math.max(0.01, Math.min(0.99, share));
  const p1 = Math.round(state.totalPoints * clamped);
  state.score = [p1, Math.max(0, state.totalPoints - p1)];
}

function readScore(state: GameState, index: number): number {
  if (index === 0) return state.score[0];
  if (index === 1) return state.score[1];
  return state.extraSnakes[index - 2]?.score ?? 0;
}

function writeScore(state: GameState, index: number, value: number): void {
  if (index === 0) state.score[0] = value;
  else if (index === 1) state.score[1] = value;
  else if (state.extraSnakes[index - 2])
    state.extraSnakes[index - 2]!.score = value;
}

/** Selected chain takes `share` of the pot. The other three split what remains. */
function applyFfaShare(state: GameState, rider: Rider, share: number): void {
  const clamped = Math.max(0.01, Math.min(0.99, share));
  const mine = Math.round(state.totalPoints * clamped);
  const rest = Math.max(0, state.totalPoints - mine);
  const base = Math.floor(rest / 3);
  let spare = rest - base * 3;
  const selected = seatIndex(seatOf(rider));
  for (let index = 0; index < 4; index += 1) {
    if (index === selected) writeScore(state, index, mine);
    else {
      writeScore(state, index, base + (spare > 0 ? 1 : 0));
      if (spare > 0) spare -= 1;
    }
  }
}

function whiteShareOf(state: GameState): number {
  const pool = state.score[0] + state.score[1];
  if (pool <= 0) return 0.5;
  return state.score[0] / pool;
}

function selectedShare(state: GameState, rider: Rider): number {
  if (state.meta.teamMode !== 'ffa') return whiteShareOf(state);
  const scores = [0, 1, 2, 3].map((index) => readScore(state, index));
  const pool = scores.reduce((sum, score) => sum + score, 0);
  if (pool <= 0) return 0.25;
  return readScore(state, seatIndex(seatOf(rider))) / pool;
}

function captureClip(recipe: MatchRecipe, length: number): string {
  return `P-FC_${captureClipForLength(length, recipe.captureFrom, recipe.capturePercent)}`;
}

function placeBody(state: GameState, snake: SnakeState, length: number): void {
  const taken = new Set<string>();
  const block = (cell: GridPos) => taken.add(`${cell[0]},${cell[1]}`);
  block(snake.head);
  for (const entry of presentSeats(state)) {
    const other = labSnake(state, entry.rider);
    if (other === snake) continue;
    block(other.head);
    for (const cell of other.body) block(cell);
  }
  const facing = snake.dir || snake.dirWanted || 'Right';
  const steps: GridPos[] =
    facing === 'Left'
      ? [
          [1, 0],
          [0, 1],
          [0, -1],
          [-1, 0],
        ]
      : facing === 'Up'
        ? [
            [0, 1],
            [1, 0],
            [-1, 0],
            [0, -1],
          ]
        : facing === 'Down'
          ? [
              [0, -1],
              [1, 0],
              [-1, 0],
              [0, 1],
            ]
          : [
              [-1, 0],
              [0, 1],
              [0, -1],
              [1, 0],
            ];
  const body: GridPos[] = [];
  let x = snake.head[0];
  let y = snake.head[1];
  let dir = steps[0]!;
  for (let index = 0; index < length; index += 1) {
    const options = [dir, ...steps.filter((step) => step !== dir)];
    let placed = false;
    for (const step of options) {
      const nx = x + step[0];
      const ny = y + step[1];
      if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) continue;
      if (taken.has(`${nx},${ny}`)) continue;
      body.push([nx, ny]);
      taken.add(`${nx},${ny}`);
      x = nx;
      y = ny;
      dir = step;
      placed = true;
      break;
    }
    if (!placed) break;
  }
  snake.body = body;
}

function ahead(snake: SnakeState): GridPos {
  const dir = snake.dir || snake.dirWanted || 'Right';
  const [x, y] = snake.head;
  if (dir === 'Left') return [x - 1, y];
  if (dir === 'Up') return [x, y - 1];
  if (dir === 'Down') return [x, y + 1];
  return [x + 1, y];
}

function placeSnake(
  snake: SnakeState,
  head: GridPos,
  dir: SnakeState['dir'],
  body: GridPos[]
): void {
  snake.head = [head[0], head[1]];
  snake.body = body.map((cell) => [cell[0], cell[1]]);
  snake.dir = dir;
  snake.dirWanted = dir;
}

/** Park the selected chain on the top row, centered, facing out. */
function stageWallCrash(state: GameState, rider: Rider): GridPos {
  const border = state.shrinkBorder;
  const left = border?.left ?? 0;
  const right = border?.right ?? state.cols - 1;
  const top = border?.top ?? 0;
  const snake = labSnake(state, rider);
  const otherCells = new Set<string>();
  for (const entry of SEATS) {
    if (entry.rider === rider) continue;
    if (entry.rider === 'p3' && !state.extraSnakes[0]) continue;
    if (entry.rider === 'p4' && !state.extraSnakes[1]) continue;
    const other = labSnake(state, entry.rider);
    otherCells.add(`${other.head[0]},${other.head[1]}`);
    for (const cell of other.body) otherCells.add(`${cell[0]},${cell[1]}`);
  }
  let x = Math.floor((left + right) / 2);
  x = Math.max(left, Math.min(right, x));
  if (otherCells.has(`${x},${top}`) || otherCells.has(`${x},${top + 1}`)) {
    x = x + 2 <= right ? x + 2 : Math.max(left, x - 2);
  }
  placeSnake(snake, [x, top], 'Up', [[x, top + 1]]);
  return [x, top - 1];
}

/** Shared mid-board face-off used by Head to head and Head-on REORG. */
function headOnCenter(state: GameState): { x: number; y: number } {
  const border = state.shrinkBorder;
  const top = border?.top ?? 0;
  const bottom = border?.bottom ?? state.rows - 1;
  const left = border?.left ?? 0;
  const right = border?.right ?? state.cols - 1;
  const y = Math.min(bottom - 1, Math.max(top + 1, 12));
  let x = Math.floor((left + right) / 2) - 1;
  x = Math.max(left + 2, Math.min(right - 4, x));
  return { x, y };
}

/** Another chain that is actually on the board. */
function otherRider(state: GameState, rider: Rider): Rider {
  return (
    presentSeats(state).find((entry) => entry.rider !== rider)?.rider ??
    (rider === 'p1' ? 'p2' : 'p1')
  );
}

/**
 * Selected chain faces the other chain's body, one step away.
 * The next step lands on that body, not the head.
 */
function stageBodyHit(state: GameState, rider: Rider): GridPos {
  const { x, y } = headOnCenter(state);
  const mover = labSnake(state, rider);
  const other = labSnake(state, otherRider(state, rider));
  placeSnake(mover, [x, y], 'Right', [
    [x - 1, y],
    [x - 2, y],
  ]);
  placeSnake(other, [x + 1, y - 1], 'Down', [
    [x + 1, y],
    [x + 1, y + 1],
  ]);
  return [x + 1, y];
}

/**
 * Selected chain faces its own body, one step away.
 * The cell ahead is a middle segment, not the tail, so the step is a self hit.
 */
function stageSelfHit(state: GameState, rider: Rider): GridPos {
  const { x, y } = headOnCenter(state);
  const border = state.shrinkBorder;
  const right = border?.right ?? state.cols - 1;
  const bottom = border?.bottom ?? state.rows - 1;
  const parks: GridPos[] = [
    [Math.min(right - 2, 40), Math.min(bottom - 1, 4)],
    [Math.min(right - 2, 40), Math.max(2, bottom - 4)],
    [Math.max((border?.left ?? 0) + 2, 4), Math.min(bottom - 1, 4)],
  ];
  let spot = 0;
  for (const entry of presentSeats(state)) {
    if (entry.rider === rider) continue;
    const head = parks[spot] ?? parks[0]!;
    spot += 1;
    // Length 3 is 4%. The loop below is 8%, which is not a reorg against 4%.
    placeSnake(labSnake(state, entry.rider), head, 'Left', [
      [head[0] + 1, head[1]],
      [head[0] + 2, head[1]],
      [head[0] + 3, head[1]],
    ]);
  }
  // The cell ahead is in the body and is not the tail, so the step is a self hit.
  placeSnake(labSnake(state, rider), [x, y], 'Right', [
    [x - 1, y],
    [x - 1, y + 1],
    [x, y + 1],
    [x + 1, y + 1],
    [x + 1, y],
    [x + 2, y],
  ]);
  return [x + 1, y];
}

/** Face both heads across one shared cell. The selected chain takes the step. */
function stageHeadOn(state: GameState, rider: Rider): GridPos {
  const { x, y } = headOnCenter(state);
  const mover = labSnake(state, rider);
  const partner: Rider = rider === 'p2' ? 'p1' : 'p2';
  const other = labSnake(state, partner);
  placeSnake(mover, [x, y], 'Right', [
    [x - 1, y],
    [x - 2, y],
  ]);
  placeSnake(other, [x + 1, y], 'Left', [
    [x + 2, y],
    [x + 3, y],
  ]);
  return [x + 1, y];
}

/**
 * Same center lineup as head-to-head, but one chain is long (16%+) and the
 * other is short (2%) so the next step is a REORG. The long chain stands on
 * the left. The selected chain takes the step.
 */
function stageHeadOnReorg(
  state: GameState,
  rider: Rider,
  recipe: MatchRecipe,
  rich: Rider
): GridPos {
  const { x, y } = headOnCenter(state);
  const poor = otherRider(state, rich);
  const longBody = Array.from(
    { length: 7 },
    (_, index) => [x - 1 - index, y] as GridPos
  );
  placeSnake(labSnake(state, rich), [x, y], 'Right', longBody);
  placeSnake(labSnake(state, poor), [x + 1, y], 'Left', [[x + 2, y]]);
  state.currentCaptureP1 = labelFor(recipe, state.p1.body.length);
  state.currentCaptureP2 = labelFor(recipe, state.p2.body.length);
  if (rider === rich) return [x + 1, y];
  if (rider === poor) return [x, y];
  return [x + 1, y];
}

/** Long chain faces the top wall. Every other chain stays short, so the hit is a solo REORG. */
function stageSoloReorg(
  state: GameState,
  rider: Rider,
  recipe: MatchRecipe
): GridPos {
  const border = state.shrinkBorder;
  const right = border?.right ?? state.cols - 1;
  const bottom = border?.bottom ?? state.rows - 1;
  const park: GridPos[] = [
    [Math.min(right - 2, 30), Math.min(bottom - 1, 6)],
    [Math.min(right - 2, 30), Math.max(2, bottom - 6)],
    [Math.min(right - 2, 40), Math.min(bottom - 1, 6)],
  ];
  let spot = 0;
  for (const entry of presentSeats(state)) {
    if (entry.rider === rider) continue;
    const head = park[spot] ?? park[0]!;
    spot += 1;
    placeSnake(labSnake(state, entry.rider), head, 'Left', [
      [head[0] + 1, head[1]],
    ]);
  }
  const fatal = stageWallCrash(state, rider);
  const long = labSnake(state, rider);
  const [hx, hy] = long.head;
  placeSnake(
    long,
    [hx, hy],
    'Up',
    Array.from({ length: 7 }, (_, index) => [hx, hy + 1 + index] as GridPos)
  );
  state.currentCaptureP1 = labelFor(recipe, state.p1.body.length);
  state.currentCaptureP2 = labelFor(recipe, state.p2.body.length);
  return fatal;
}

function snapSnake(state: GameState, player: 'P1' | 'P2'): void {
  const border = state.shrinkBorder;
  if (player === 'P1') {
    const spawnX = border ? Math.max(6, border.left + 2) : 6;
    state.p1.head = [spawnX, 12];
    state.p1.body = [[Math.max(border ? border.left + 1 : 0, spawnX - 1), 12]];
    state.p1.dir = '';
    state.p1.dirWanted = 'Right';
    state.currentCaptureP1 = '2%';
    return;
  }
  const spawnX = border ? Math.min(44, border.right - 2) : 44;
  state.p2.head = [spawnX, 12];
  state.p2.body = [[Math.min(border ? border.right - 1 : 50, spawnX + 1), 12]];
  state.p2.dir = '';
  state.p2.dirWanted = 'Left';
  state.currentCaptureP2 = '2%';
}

function tailBehind(head: GridPos, dir: Direction): GridPos {
  const [x, y] = head;
  if (dir === 'Left') return [x + 1, y];
  if (dir === 'Up') return [x, y + 1];
  if (dir === 'Down') return [x, y - 1];
  return [x - 1, y];
}

function snapSeat(state: GameState, seat: Seat): void {
  if (seat === 'P1' || seat === 'P2') {
    snapSnake(state, seat);
    return;
  }
  const extra = state.extraSnakes[seat === 'P3' ? 0 : 1];
  if (!extra) return;
  const dir: Direction = extra.spawnDir === '' ? 'Right' : extra.spawnDir;
  extra.snake.head = [extra.spawnHead[0], extra.spawnHead[1]];
  extra.snake.body = [tailBehind(extra.snake.head, dir)];
  extra.snake.dir = '';
  extra.snake.dirWanted = dir;
}

function finishMatch(state: GameState): boolean {
  if (state.score[0] > 0 && state.score[1] > 0) return false;
  if (state.score[0] <= 0 && state.score[1] <= 0) return false;
  state.gameEnded = true;
  state.gameStarted = false;
  if (state.score[0] <= 0) {
    state.winnerPlayer = 'P2';
    state.winnerName = state.p2Name;
  } else {
    state.winnerPlayer = 'P1';
    state.winnerName = state.p1Name;
  }
  return true;
}

function cellFromPointer(
  event: React.PointerEvent,
  board: HTMLElement,
  cols: number,
  rows: number
): GridPos | null {
  const rect = board.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * cols);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * rows);
  if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
  return [x, y];
}

function labelFor(recipe: MatchRecipe, length: number): string {
  return `${capturePercentForLength(length, recipe.captureFrom, recipe.capturePercent)}%`;
}

/** Record positions without treating a lab teleport as a wall or clash. */
function quietBaseline(audio: GameAudioSystem, state: GameState): void {
  state.gameStarted = false;
  audio.updateGameState(state);
  state.gameStarted = true;
}

function pushSatsPop(
  state: GameState,
  player: 'P1' | 'P2',
  value: number,
  percent: number,
  rateLabel: string | undefined
): void {
  const p1Pos: GridPos = [state.p1.head[0], state.p1.head[1]];
  const p2Pos: GridPos = [state.p2.head[0], state.p2.head[1]];
  state.pointChanges.push({
    player,
    value,
    p1Pos,
    p2Pos,
    gainPos: player === 'P1' ? p1Pos : p2Pos,
    lossPos: player === 'P1' ? p2Pos : p1Pos,
    capturePercent: percent,
    captureRateLabel: rateLabel,
    p1YOffsetPx: 0,
    p2YOffsetPx: 0,
    alpha: 1,
  });
}

function transferToP1(state: GameState, amount: number): number {
  const gain = Math.min(amount, state.score[1]);
  state.score[0] += gain;
  state.score[1] -= gain;
  return gain;
}

function transferToP2(state: GameState, amount: number): number {
  const gain = Math.min(amount, state.score[0]);
  state.score[1] += gain;
  state.score[0] -= gain;
  return gain;
}

function transferToExtra(
  state: GameState,
  rider: Rider,
  amount: number
): number {
  const index = seatIndex(seatOf(rider));
  let richest = -1;
  let richestScore = 0;
  for (let other = 0; other < 4; other += 1) {
    if (other === index) continue;
    const score = readScore(state, other);
    if (score > richestScore) {
      richest = other;
      richestScore = score;
    }
  }
  if (richest < 0) return 0;
  const gain = Math.min(amount, richestScore);
  writeScore(state, richest, richestScore - gain);
  writeScore(state, index, readScore(state, index) + gain);
  return gain;
}

function layerLabel(name: string): string {
  if (name === 'game') return 'Bed';
  if (name === 'pressure') return 'Warning';
  if (name === 'critical') return 'Critical';
  if (name === 'end') return 'End';
  if (name === 'menu') return 'Menu';
  return name;
}

function musicReason(tension: TensionDebugSnapshot): string {
  const ended = tension.layers.some(
    (layer) => layer.name === 'end' || layer.name === 'menu'
  );
  if (ended)
    return 'Match over. The end cue plays once, then the menu loop continues.';
  if (tension.level === 0) return 'Bed only.';
  const name = tension.level >= 4 ? 'Critical' : 'Warning';
  const causes = (
    [
      ['capture', tension.chain, "one chain's capture percent"],
      ['drain', tension.score, 'one side running out of sats'],
    ] as const
  )
    .filter((entry) => entry[1] === tension.level)
    .map((entry) => entry[2]);
  const because = causes.length > 0 ? causes.join(' and ') : 'the held level';
  const held = tension.held ? ' Holding after that passed.' : '';
  return `${name} is in because of ${because}.${held}`;
}

/** Setup drawer width, open and closed. matchTriggerLab.css uses the same values. */
const SETUP_OPEN_WIDTH = '20rem';
const PANE_RAIL_WIDTH = '2.25rem';

/**
 * Game config each lab mode's outro reads, the way the real pages write it.
 * Practice modes show FREE GAME; paid ones show the sats won.
 */
const OUTRO_CONFIG: Record<LabModeId, Record<string, unknown>> = {
  freeplay: {
    sessionOrigin: 'practice',
    mode: 'PRACTICE',
    practiceHudLabel: 'FREE PLAY',
  },
  ffa: {
    sessionOrigin: 'practice',
    mode: 'PRACTICE',
    practiceHudLabel: 'FREE FOR ALL',
  },
  challenge: {
    sessionOrigin: 'practice',
    mode: 'SOLO',
    practiceHudLabel: 'CHALLENGE',
  },
  p2p: { mode: 'P2P' },
  tournament: { mode: 'TOURNAMENT' },
  // Online uses OnlineVictoryReveal instead.
  online: { mode: 'ONLINE' },
};

/** A finished online room built from the lab match, for the online outro. */
function labOnlineRoom(state: GameState): OnlineRoomState {
  const [p1Score, p2Score] = state.score;
  const whiteWon = state.winnerPlayer !== 'P2';
  const winnerRole = whiteWon ? PlayerRole.Player1 : PlayerRole.Player2;
  const winnerName = whiteWon ? state.p1Name : state.p2Name;
  const total = p1Score + p2Score;
  return {
    roomId: 'lab',
    roomCode: 'LAB',
    hostSessionID: DEBUG_P1_SESSION,
    buyin: Math.floor(total / 2),
    matchRound: 1,
    phase: 'postgame',
    seats: {
      [PlayerRole.Player1]: {
        role: PlayerRole.Player1,
        name: state.p1Name,
        sessionID: DEBUG_P1_SESSION,
        status: 'paid',
      },
      [PlayerRole.Player2]: {
        role: PlayerRole.Player2,
        name: state.p2Name,
        sessionID: 'lab-p2',
        status: 'paid',
      },
    },
    spectators: [],
    snapshot: {
      tick: state.tickCount,
      phase: 'postgame',
      state: {
        score: [p1Score, p2Score],
        p1Name: state.p1Name,
        p2Name: state.p2Name,
      },
      hud: {
        p1Points: p1Score,
        p2Points: p2Score,
        captureP1: '',
        captureP2: '',
        initialWidthP1: 1,
        initialWidthP2: 1,
        currentWidthP1: 1,
        currentWidthP2: 1,
      },
    },
    result: {
      winnerName,
      p1Name: state.p1Name,
      p2Name: state.p2Name,
      p1Score,
      p2Score,
      netPrize: Math.floor(total * 0.95),
      winnerRole,
    },
    postGame: {
      winnerRole,
      winnerName,
      winnerPoints: whiteWon ? p1Score : p2Score,
      totalPrize: total,
      doubleOrNothingVotes: 0,
    },
  } as OnlineRoomState;
}

/** Pane title bar. Collapses the pane to a rail on wide screens, a bar on phones. */
function PaneHead({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="match-lab__pane-head"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="match-lab__pane-title">{title}</span>
      <span className="match-lab__pane-chevron" aria-hidden="true">
        {open ? '−' : '+'}
      </span>
    </button>
  );
}

function ScoreHud({
  state,
  modeLabel,
  barHit,
}: {
  state: GameState | null;
  modeLabel: string;
  barHit: { side: CaptureSide; intensity: number; id: number } | null;
}) {
  const captureP1 = state?.currentCaptureP1 ?? '2%';
  const captureP2 = state?.currentCaptureP2 ?? '2%';
  const p1Points = state?.score[0] ?? 0;
  const p2Points = state?.score[1] ?? 0;
  const pool = p1Points + p2Points;
  const p1Width = pool > 0 ? (p1Points / pool) * 100 : 50;
  const p2Width = 100 - p1Width;
  const ctx = { captureP1, captureP2 };
  const hitP1 = barHit?.side === 'P1';
  const hitP2 = barHit?.side === 'P2';

  return (
    <>
      <div className="flex players">
        <div id="player1info" className="condensed">
          <div className="inline playerSquare white" />
          <div className="inline" id="player1name">
            {state?.p1Name ?? 'White'}
          </div>
        </div>
        <GameInfoLabel
          id="gameInfo"
          gameInfo={state?.meta.modeLabel || modeLabel}
        />
        <div id="player2info" className="condensed">
          <div className="inline" id="player2name">
            {state?.p2Name ?? 'Black'}
          </div>
          <div className="inline playerSquare black" />
        </div>
      </div>

      <div className="game-hud-stakes" style={captureFeedbackStyleFromCtx(ctx)}>
        <div className="gameState">
          <div id="capturing">
            <div
              id="capturingP1"
              className={hitP1 ? 'capture-row--flash' : undefined}
            >
              <span
                id="capturingP1Amount"
                className={`capturingAmount${hitP1 ? ' highlight' : ''}`}
              >
                {captureP1}
              </span>{' '}
              capture
            </div>
            <div
              id="capturingP2"
              className={hitP2 ? 'capture-row--flash' : undefined}
            >
              capture{' '}
              <span
                id="capturingP2Amount"
                className={`capturingAmount${hitP2 ? ' highlight' : ''}`}
              >
                {captureP2}
              </span>
            </div>
          </div>

          <div id="distributions">
            <div
              id="currentDistribution"
              className={`distributionBarOutter${
                hitP1 ? ' distribution-track--p1-outer-glow' : ''
              }`}
              style={distributionTrackFeedbackStyle(ctx, p1Width, barHit)}
            >
              <div
                id="currentDistributionP1"
                key={hitP1 ? barHit.id : 'p1'}
                className={`distributionBar${hitP1 ? ' distribution-bar--capture-hit' : ''}`}
                style={{
                  width: `${p1Width}%`,
                  ...(hitP1 ? captureHitStyleVars(barHit.intensity) : {}),
                }}
              />
              <div
                id="currentDistributionP2"
                key={hitP2 ? barHit.id : 'p2'}
                className={`distributionBar${hitP2 ? ' distribution-bar--capture-hit' : ''}`}
                style={{
                  width: `${p2Width}%`,
                  ...(hitP2 ? captureHitStyleVars(barHit.intensity) : {}),
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex points">
          <div
            className={`player-sats player-sats-p1${hitP1 ? ' player-sats--surge' : ''}`}
          >
            <span id="p1Points" className="condensed">
              {p1Points.toLocaleString()}
            </span>{' '}
            <span className="grey">sats</span>
          </div>
          <Sponsorship id="sponsorshipGame" showLabel={false} />
          <div
            className={`player-sats player-sats-p2${hitP2 ? ' player-sats--surge' : ''}`}
          >
            <span className="grey">sats</span>{' '}
            <span id="p2Points" className="condensed">
              {p2Points.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function lookLabel(recipe: MatchRecipe): string {
  const parts = [
    recipe.animGrow ? 'tail swell' : '',
    recipe.animTint ? 'wave' : '',
    recipe.animScale ? 'head pop' : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'no eat animation';
}

export default function MatchTriggerLab() {
  const { stop, isMuted, isMusicMuted, musicVolume, masterVolume } = useAudio();
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const stateRef = useRef<GameState | null>(null);
  if (!stateRef.current) stateRef.current = makeLabState(labMode('freeplay'));
  const audioRef = useRef<GameAudioSystem | null>(null);
  const rendererRef = useRef<PixiGameRenderer | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);
  const pathRef = useRef<GridPos[]>([]);
  const historyRef = useRef<Array<{ state: GameState; bait: string[] }>>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const riderRef = useRef<Rider>('p1');
  const growRef = useRef(false);
  const endedRef = useRef(false);
  const countdownGen = useRef(0);
  const tourGen = useRef(0);
  const [touring, setTouring] = useState<TourId | null>(null);
  const touringRef = useRef<TourId | null>(null);
  touringRef.current = touring;
  const [blockLit, setBlockLit] = useState(false);
  // The stage hosts the outro, so it covers the board and not the panes.
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null);
  const noPromptRef = useRef<string | null>('');
  const [setupOpen, setSetupOpen] = useState(true);
  const [triggersOpen, setTriggersOpen] = useState(true);
  // The floating corner buttons ride the Setup drawer's right edge on wide screens.
  useEffect(() => {
    const root = document.documentElement;
    const wide = window.matchMedia('(min-width: 961px)');
    const apply = () => {
      if (wide.matches) {
        root.style.setProperty(
          '--corner-controls-offset',
          setupOpen ? SETUP_OPEN_WIDTH : PANE_RAIL_WIDTH
        );
      } else {
        root.style.removeProperty('--corner-controls-offset');
      }
    };
    apply();
    wide.addEventListener('change', apply);
    return () => {
      wide.removeEventListener('change', apply);
      root.style.removeProperty('--corner-controls-offset');
    };
  }, [setupOpen]);
  const [tension, setTension] =
    useState<TensionDebugSnapshot>(tensionDebugSnapshot);
  const [revision, setRevision] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [ended, setEnded] = useState(false);
  const [rider, setRider] = useState<Rider>('p1');
  const [growOn, setGrowOn] = useState(false);
  const [markStyle, setMarkStyle] = useState<ResetMarkStyle>(
    DEFAULT_RESET_MARK_STYLE
  );
  useEffect(() => {
    setResetMarkStyle(markStyle);
    return () => setResetMarkStyle(DEFAULT_RESET_MARK_STYLE);
  }, [markStyle]);
  const [modeId, setModeId] = useState<LabModeId>('freeplay');
  const [draft, setDraft] = useState<MatchRecipe>(() => gameRecipe());
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [soloId, setSoloId] = useState<string | null>(null);
  const [silenced, setSilenced] = useState(false);
  const silenceRef = useRef(false);
  const [otherId, setOtherId] = useState('menu');
  const [desk, setDesk] = useState<'board' | 'music' | 'eat'>('board');
  const [recipeTick, setRecipeTick] = useState(0);
  const soloRef = useRef<HTMLAudioElement | null>(null);
  const baitRef = useRef(new WeakSet<Coinbase>());
  const hitClearRef = useRef(0);
  const [barHit, setBarHit] = useState<{
    side: CaptureSide;
    intensity: number;
    id: number;
  } | null>(null);
  const masterVolumeRef = useRef(masterVolume);
  masterVolumeRef.current = masterVolume;
  const mode = labMode(modeId);
  riderRef.current = rider;
  growRef.current = growOn;
  endedRef.current = ended;

  const bump = useCallback(() => setRevision((value) => value + 1), []);
  const note = useCallback((line: string) => {
    setLog((prev) => [line, ...prev].slice(0, 8));
  }, []);

  const snakeOf = (state: GameState) => labSnake(state, riderRef.current);

  const remember = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    const bait = current.coinbases
      .filter((coin) => baitRef.current.has(coin))
      .map((coin) => `${coin.pos[0]},${coin.pos[1]}`);
    historyRef.current.push({ state: structuredClone(current), bait });
    if (historyRef.current.length > 240) historyRef.current.shift();
    setHistoryCount(historyRef.current.length);
  }, []);

  const performStep = useCallback(
    (next: GridPos, grow: boolean) => {
      const state = stateRef.current;
      const audio = audioRef.current;
      if (!state || !audio || state.gameEnded) return;
      const rider = riderRef.current;
      const snake = snakeOf(state);
      const kind = classifyStep(state, rider, snake, next);
      if (kind === 'blocked') {
        pathRef.current.shift();
        return;
      }
      remember();
      pathRef.current.shift();
      if (kind !== 'ok') {
        const recipe = draftRef.current;
        const deadPercent = chainPercent(state, rider, recipe);
        const livePercent = Math.max(
          ...presentSeats(state)
            .filter((entry) => entry.rider !== rider)
            .map((entry) => chainPercent(state, entry.rider, recipe))
        );
        const captureGap = reorgCaptureGap(deadPercent, livePercent);
        const gap =
          kind === 'headon'
            ? captureGap
            : captureGap && deadPercent > livePercent;
        const player = seatOf(rider);
        const struck =
          kind === 'headon'
            ? presentSeats(state).find((entry) => {
                if (entry.rider === rider) return false;
                const head = labSnake(state, entry.rider).head;
                return head[0] === next[0] && head[1] === next[1];
              })
            : undefined;
        commitMove(snake, next, false);
        state.tickCount += 1;
        const seats = struck ? [player, struck.seat] : [player];
        for (const seat of seats) {
          const dyingRider =
            SEATS.find((entry) => entry.seat === seat)?.rider ?? rider;
          const dying = labSnake(state, dyingRider);
          if (!state.deathAt) state.deathAt = [];
          const index = seatIndex(seat);
          if (!state.deathAt[index]) {
            state.deathAt[index] = visibleDeathCell(
              dying.head,
              dying.dir || dying.dirWanted,
              state.cols,
              state.rows
            );
          }
          snapSeat(state, seat);
          audio.playReset(seat);
        }
        pathRef.current = [];
        state.tickCount += 1;
        // One mark from the detector only — a second lab CSS square on a
        // different cell was reading as "different squares" on REORG.
        audio.updateGameState(state);
        note(
          kind === 'headon'
            ? gap
              ? 'Head-on · REORG'
              : 'Head-on · both reset'
            : gap
              ? `${player} reset · REORG`
              : kind === 'wall'
                ? `${player} hit the wall · reset`
                : kind === 'self'
                  ? `${player} hit himself · reset`
                  : `${player} hit a body · reset`
        );
        bump();
        return;
      }
      const coinIndex = state.coinbases.findIndex(
        (coin) => coin.pos[0] === next[0] && coin.pos[1] === next[1]
      );
      const eaten = coinIndex >= 0 ? state.coinbases[coinIndex] : undefined;
      const eating = (grow || coinIndex >= 0) && snake.body.length < MAX_CHAIN;
      commitMove(snake, next, eating);
      const respawn =
        Boolean(eaten) &&
        !eaten!.reward &&
        !eaten!.isDecoy &&
        !baitRef.current.has(eaten!);
      if (respawn) createNewCoinbase(state);
      if (coinIndex >= 0) state.coinbases.splice(coinIndex, 1);
      state.currentCaptureP1 = labelFor(draftRef.current, state.p1.body.length);
      state.currentCaptureP2 = labelFor(draftRef.current, state.p2.body.length);
      state.tickCount += 1;
      if (eating) {
        const length = snake.body.length;
        const playerIndex = seatIndex(seatOf(rider));
        const percent = Number.parseInt(labelFor(draftRef.current, length), 10);
        const rate = captureRateLabel(state, playerIndex, percent);
        const requested = Math.max(
          1,
          Math.floor((state.totalPoints * percent) / 100)
        );
        const gained =
          rider === 'p1'
            ? transferToP1(state, requested)
            : rider === 'p2'
              ? transferToP2(state, requested)
              : transferToExtra(state, rider, requested);
        const side: CaptureSide = rider === 'p2' ? 'P2' : 'P1';
        if (gained > 0 && (rider === 'p1' || rider === 'p2')) {
          pushSatsPop(state, side, gained, percent, rate);
          const intensity = satsCaptureBarIntensityFromLabel(
            labelFor(draftRef.current, length)
          );
          setBarHit((prev) => ({ side, intensity, id: (prev?.id ?? 0) + 1 }));
          window.clearTimeout(hitClearRef.current);
          hitClearRef.current = window.setTimeout(() => setBarHit(null), 900);
        }
        audio.playCapture(length);
        note(
          `Eat · ${lookLabel(draftRef.current)} · +${gained} sats${rate ? ` ${rate}` : ''} · ${captureClip(draftRef.current, length)}${respawn ? ' · new food' : ''}`
        );
      }
      if (finishMatch(state)) {
        pathRef.current = [];
        setEnded(true);
        note(`${state.winnerName} wins · match over`);
      }
      audio.updateGameState(state);
      bump();
    },
    [bump, note, remember]
  );

  useEffect(() => {
    stopRef.current();
    const audio = new GameAudioSystem();
    audio.setRecipe(draftRef.current);
    audioRef.current = audio;
    const state = stateRef.current!;
    audio.updateGameState(state);
    audio.startMusic();
    const unlock = () => {
      if (silenceRef.current) return;
      audio.startMusic();
    };
    window.addEventListener('pointerdown', unlock);
    const unsubscribe = subscribeTensionDebug(() => {
      setTension(tensionDebugSnapshot());
    });

    const renderer = new PixiGameRenderer();
    renderer.setCaptureAnimOverride({
      grow: draftRef.current.animGrow,
      tint: draftRef.current.animTint,
      scale: draftRef.current.animScale,
    });
    rendererRef.current = renderer;
    const host = hostRef.current;
    let cancelled = false;
    if (host) {
      void renderer.mount(host).then(() => {
        if (cancelled) {
          renderer.destroy();
          return;
        }
        readyRef.current = true;
        renderer.resize();
      });
    }

    const pump = window.setInterval(() => {
      const next = pathRef.current[0];
      if (!next || endedRef.current) return;
      performStep(next, growRef.current);
    }, STEP_SPEED_MS);

    let frame = 0;
    const loop = () => {
      const live = stateRef.current;
      const currentAudio = audioRef.current;
      const currentRenderer = rendererRef.current;
      if (live && currentAudio) {
        advancePointChanges(live);
        advanceStreakPops();
        currentAudio.updateGameState(live);
      }
      if (readyRef.current && live && currentRenderer) {
        currentRenderer.render(live, { suppressVictoryOverlay: true });
      }
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);

    const observer = new ResizeObserver(() => rendererRef.current?.resize());
    const observed = host ?? boardRef.current;
    if (observed) observer.observe(observed);

    return () => {
      cancelled = true;
      countdownGen.current += 1;
      tourGen.current += 1;
      unsubscribe();
      window.removeEventListener('pointerdown', unlock);
      window.clearInterval(pump);
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      readyRef.current = false;
      soloRef.current?.pause();
      window.clearTimeout(hitClearRef.current);
      renderer.destroy();
      rendererRef.current = null;
      audio.stopAll();
      audioRef.current = null;
    };
  }, [performStep]);

  useEffect(() => {
    audioRef.current?.setRecipe(draft);
    rendererRef.current?.setCaptureAnimOverride({
      grow: draft.animGrow,
      tint: draft.animTint,
      scale: draft.animScale,
    });
    const live = stateRef.current;
    if (live) {
      live.currentCaptureP1 = labelFor(draft, live.p1.body.length);
      live.currentCaptureP2 = labelFor(draft, live.p2.body.length);
      bump();
    }
  }, [draft, bump]);

  useEffect(() => {
    audioRef.current?.applyAppMuteState(
      isMuted,
      isMusicMuted,
      musicVolume,
      masterVolume
    );
    if (soloRef.current) {
      soloRef.current.muted = masterVolume <= 0;
      soloRef.current.volume = masterVolume;
    }
  }, [isMuted, isMusicMuted, musicVolume, masterVolume]);

  const state = stateRef.current;
  const inset = state?.shrinkBorder?.left ?? 0;
  const whiteShare = state ? selectedShare(state, rider) : 0.5;
  const driven = SEATS.find((entry) => entry.rider === rider) ?? SEATS[0]!;
  // Follows the chain you drive, not always White.
  const drivenLength =
    state && presentSeats(state).some((entry) => entry.rider === rider)
      ? labSnake(state, rider).body.length
      : (state?.p1.body.length ?? 1);
  const lost = state ? lostPlayablePercent(state) : 0;
  void revision;

  const extendPath = (cell: GridPos) => {
    const live = stateRef.current;
    if (!live || live.gameEnded) return;
    const rider = riderRef.current;
    const projected = projectSnake(
      live,
      rider,
      labSnake(live, rider),
      pathRef.current,
      growRef.current,
      MAX_CHAIN
    );
    if (projected.crashed) return;
    const steps = routeAround(
      live,
      rider,
      projected.snake,
      cell,
      growRef.current,
      MAX_CHAIN
    );
    if (steps.length === 0) return;
    pathRef.current.push(...steps);
    if (!growRef.current) return;
    for (const step of steps) {
      if (!inPlay(live, step)) continue;
      placeBait(live, step);
    }
  };

  const placeBait = (live: GameState, step: GridPos) => {
    const taken = live.coinbases.some(
      (coin) => coin.pos[0] === step[0] && coin.pos[1] === step[1]
    );
    const occupied =
      (live.p1.head[0] === step[0] && live.p1.head[1] === step[1]) ||
      (live.p2.head[0] === step[0] && live.p2.head[1] === step[1]) ||
      live.p1.body.some((cell) => cell[0] === step[0] && cell[1] === step[1]) ||
      live.p2.body.some((cell) => cell[0] === step[0] && cell[1] === step[1]);
    if (taken || occupied) return;
    const coin: Coinbase = { pos: step };
    live.coinbases.push(coin);
    baitRef.current.add(coin);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (endedRef.current || !stateRef.current || touringRef.current) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Untrusted events still route the chain.
    }
    const cell = cellFromPointer(
      event,
      event.currentTarget,
      stateRef.current.cols,
      stateRef.current.rows
    );
    if (cell) extendPath(cell);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (!stateRef.current) return;
    const cell = cellFromPointer(
      event,
      event.currentTarget,
      stateRef.current.cols,
      stateRef.current.rows
    );
    if (cell) extendPath(cell);
  };

  const stopSolo = () => {
    soloRef.current?.pause();
    soloRef.current = null;
    setSoloId(null);
  };

  const playAlone = (clip: SoloClip) => {
    silenceRef.current = true;
    setSilenced(true);
    audioRef.current?.stopAll();
    stopSolo();
    const clipAudio = new Audio(clip.src);
    clipAudio.loop = clip.loop;
    clipAudio.muted = masterVolumeRef.current <= 0;
    clipAudio.volume = masterVolumeRef.current;
    void clipAudio.play().catch(() => undefined);
    soloRef.current = clipAudio;
    setSoloId(clip.id);
    note(`Alone · ${clip.name}`);
  };

  const stopMusic = () => {
    silenceRef.current = true;
    setSilenced(true);
    stopSolo();
    audioRef.current?.stopAll();
    note('Music stopped');
  };

  const hearMix = () => {
    silenceRef.current = false;
    setSilenced(false);
    stopSolo();
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio) return;
    audio.updateGameState(current);
    audio.startMusic();
    note('Match mix');
  };

  const playingFile = soloId?.startsWith('file:') ? soloId.slice(5) : null;

  const playFile = (file: string) => {
    const id = `file:${file}`;
    if (soloId === id) {
      stopMusic();
      return;
    }
    playAlone({
      id,
      name: file,
      src: `/sound/${file}`,
      loop:
        file.startsWith('chain_duel') &&
        !file.includes('end') &&
        !file.includes('shrink'),
      where: '',
      inMode: () => true,
    });
  };

  const switchMode = (id: LabModeId) => {
    const nextMode = labMode(id);
    pathRef.current = [];
    baitRef.current = new WeakSet();
    historyRef.current = [];
    setHistoryCount(0);
    stopSolo();
    silenceRef.current = false;
    setSilenced(false);
    const next = makeLabState(nextMode);
    stateRef.current = next;
    setModeId(id);
    setEnded(false);
    if (
      !nextMode.ffa &&
      (riderRef.current === 'p3' || riderRef.current === 'p4')
    ) {
      riderRef.current = 'p1';
      setRider('p1');
    }
    const audio = audioRef.current;
    if (audio) {
      audio.stopAll();
      audio.updateGameState(next);
      audio.startMusic();
    }
    note(`${nextMode.label} · ${nextMode.summary}`);
    bump();
  };

  const setWalls = (nextInset: number) => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded || !current.shrinkBorder)
      return;
    const before = current.shrinkBorder?.left ?? 0;
    applyInset(current, nextInset);
    audio.updateGameState(current);
    const after = current.shrinkBorder?.left ?? 0;
    note(
      after > before
        ? `Walls step in · shrink cue · dead zone closes · ${lostPlayablePercent(current).toFixed(0)}% gone`
        : `Walls open · ${lostPlayablePercent(current).toFixed(0)}% gone`
    );
    bump();
  };

  const setScoreShare = (nextShare: number) => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    current.gameStarted = false;
    if (current.meta.teamMode === 'ffa')
      applyFfaShare(current, riderRef.current, nextShare);
    else applyWhiteShare(current, nextShare);
    audio.updateGameState(current);
    current.gameStarted = true;
    audio.updateGameState(current);
    if (current.meta.teamMode === 'ffa') {
      const label =
        SEATS.find((entry) => entry.rider === riderRef.current)?.label ??
        'Chain';
      const share =
        Math.round(selectedShare(current, riderRef.current) * 1000) / 10;
      note(
        `${label} holds ${share}% of the pot. Warning at 12.5%, critical at 5%.`
      );
    } else {
      const white = Math.round(whiteShareOf(current) * 100);
      note(
        `Score split · white ${white}% · black ${100 - white}% · streak reset so this slider is not a catch`
      );
    }
    bump();
  };

  const eatOne = () => {
    const current = stateRef.current;
    if (!current || current.gameEnded) return;
    const rider = riderRef.current;
    const projected = projectSnake(
      current,
      rider,
      labSnake(current, rider),
      pathRef.current,
      growRef.current,
      MAX_CHAIN
    );
    if (projected.crashed) return;
    const next = ahead(projected.snake);
    const kind = classifyStep(current, rider, projected.snake, next);
    if (kind === 'blocked') return;
    if (kind === 'ok') placeBait(current, next);
    pathRef.current.push(next);
  };

  const undoMove = () => {
    const snap = historyRef.current.pop();
    const audio = audioRef.current;
    if (!snap || !audio) return;
    pathRef.current = [];
    stateRef.current = snap.state;
    baitRef.current = new WeakSet();
    for (const coin of snap.state.coinbases) {
      if (snap.bait.includes(`${coin.pos[0]},${coin.pos[1]}`))
        baitRef.current.add(coin);
    }
    setHistoryCount(historyRef.current.length);
    setEnded(snap.state.gameEnded);
    if (snap.state.gameEnded) {
      audio.updateGameState(snap.state);
    } else {
      audio.stopAll();
      audio.updateGameState(snap.state);
      if (!silenceRef.current) audio.startMusic();
    }
    note('Back one move');
    bump();
  };

  const lineUp = (fatal: GridPos, line: string) => {
    pathRef.current = [fatal];
    note(line);
    bump();
  };

  const hitWall = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    remember();
    clearStreakPops();
    const fatal = stageWallCrash(current, riderRef.current);
    quietBaseline(audio, current);
    const who = riderRef.current === 'p1' ? 'White' : 'Black';
    lineUp(fatal, `${who} lined up on the wall`);
  };

  const hitHeadOn = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    remember();
    clearStreakPops();
    const fatal = stageHeadOn(current, riderRef.current);
    quietBaseline(audio, current);
    lineUp(fatal, 'Chains lined up · next step is head to head');
  };

  const hitBody = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    remember();
    clearStreakPops();
    const fatal = stageBodyHit(current, riderRef.current);
    quietBaseline(audio, current);
    const who =
      SEATS.find((entry) => entry.rider === riderRef.current)?.label ?? 'Chain';
    lineUp(fatal, `${who} lined up on a body`);
  };

  const hitSelf = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    remember();
    clearStreakPops();
    const fatal = stageSelfHit(current, riderRef.current);
    quietBaseline(audio, current);
    const who =
      SEATS.find((entry) => entry.rider === riderRef.current)?.label ?? 'Chain';
    lineUp(fatal, `${who} lined up to hit himself`);
  };

  const die = (player: Seat) => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    if (player === 'P3' && !current.extraSnakes[0]) return;
    if (player === 'P4' && !current.extraSnakes[1]) return;
    remember();
    pathRef.current = [];
    clearStreakPops();
    const dyingRider =
      SEATS.find((entry) => entry.seat === player)?.rider ?? 'p1';
    const dying = labSnake(current, dyingRider);
    const head: GridPos = [dying.head[0], dying.head[1]];
    const recipe = draftRef.current;
    const deadPercent = chainPercent(current, dyingRider, recipe);
    const livePercent = Math.max(
      ...presentSeats(current)
        .filter((entry) => entry.seat !== player)
        .map((entry) => chainPercent(current, entry.rider, recipe))
    );
    // Solo reorg: the long chain dies. Short deaths are ordinary WALL.
    const isReorg =
      deadPercent > livePercent && reorgCaptureGap(deadPercent, livePercent);
    const markAt: GridPos = head;
    audio.playReset(player);
    snapSeat(current, player);
    current.tickCount += 1;
    // Same path as free play: detector marks + spawn flash. Only force them
    // when the chain was already on spawn so the teleport never registers.
    audio.updateGameState(current);
    const want = isReorg ? 'REORG' : 'WALL';
    const tone = player === 'P1' ? 'white' : 'black';
    const home: GridPos = [dying.head[0], dying.head[1]];
    if (!streakPops().some((pop) => pop.text === want)) {
      pushCaptureRatePop(markAt, want, true, tone, isReorg ? undefined : home);
    }
    if (!streakPops().some((pop) => pop.text === 'SPAWN')) {
      pushSpawnFlash(home, player === 'P1' ? 'white' : 'black');
    }
    note(
      isReorg
        ? `${player} reset · REORG · ${player === 'P1' ? 'P1-HWAC' : 'P2-HWAC'}`
        : `${player} reset to spawn · ${player === 'P1' ? 'P1-HWAC' : 'P2-HWAC'}`
    );
    bump();
  };

  const hitHeadOnReorg = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    remember();
    clearStreakPops();
    const rich = riderRef.current;
    // Same timing as Head to head: line up, then the step pump takes the crash.
    const fatal = stageHeadOnReorg(current, rich, draftRef.current, rich);
    quietBaseline(audio, current);
    const who = SEATS.find((entry) => entry.rider === rich)?.label ?? 'Chain';
    const other =
      SEATS.find((entry) => entry.rider === otherRider(current, rich))?.label ??
      'the other';
    lineUp(
      fatal,
      `Lined up · long ${who.toLowerCase()} vs short ${other.toLowerCase()} · next step is REORG`
    );
  };

  const soloReorg = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    remember();
    clearStreakPops();
    const dying: 'p1' | 'p2' = riderRef.current === 'p2' ? 'p2' : 'p1';
    if (riderRef.current !== dying) {
      riderRef.current = dying;
      setRider(dying);
    }
    const fatal = stageSoloReorg(current, dying, draftRef.current);
    quietBaseline(audio, current);
    lineUp(
      fatal,
      `${dying === 'p1' ? 'White' : 'Black'} lined up · long chain hits the wall · next step is REORG`
    );
  };

  const selectedHead = () => {
    const current = stateRef.current;
    if (!current) return null;
    return riderRef.current === 'p1' ? current.p1.head : current.p2.head;
  };

  const showSats = () => {
    const current = stateRef.current;
    if (!current) return;
    const player = riderRef.current === 'p1' ? 'P1' : 'P2';
    const p1Pos: GridPos = [current.p1.head[0], current.p1.head[1]];
    const p2Pos: GridPos = [current.p2.head[0], current.p2.head[1]];
    const length =
      player === 'P1' ? current.p1.body.length : current.p2.body.length;
    const rate = labelFor(draftRef.current, length);
    current.pointChanges.push({
      player,
      value: 200,
      p1Pos,
      p2Pos,
      gainPos: player === 'P1' ? p1Pos : p2Pos,
      lossPos: player === 'P1' ? p2Pos : p1Pos,
      capturePercent: Number.parseInt(rate, 10),
      captureRateLabel: rate,
      p1YOffsetPx: 0,
      p2YOffsetPx: 0,
      alpha: 1,
    });
    note(`Sats popup · +200 ${rate} together, −200 on the other`);
    bump();
  };

  const showFork = () => {
    const head = selectedHead();
    if (!head) return;
    pushCaptureRatePop(head, 'REORG', true);
    note('REORG popup · above the selected chain');
    bump();
  };

  const setChainLength = (length: number) => {
    const current = stateRef.current;
    if (!current || current.gameEnded) return;
    const snake = snakeOf(current);
    placeBody(current, snake, length);
    current.currentCaptureP1 = labelFor(
      draftRef.current,
      current.p1.body.length
    );
    current.currentCaptureP2 = labelFor(
      draftRef.current,
      current.p2.body.length
    );
    const who = riderRef.current === 'p1' ? 'White' : 'Black';
    note(
      `${who} length ${snake.body.length} · ${labelFor(draftRef.current, snake.body.length)}`
    );
    bump();
  };

  const countdown = () => {
    const audio = audioRef.current;
    const current = stateRef.current;
    if (!audio || !current) return;
    const gen = countdownGen.current + 1;
    countdownGen.current = gen;
    void (async () => {
      current.countdownStart = true;
      for (const step of COUNTDOWN) {
        if (countdownGen.current !== gen) return;
        current.countdownTicks = step.tick;
        audio.playCountdownTick(step.tick);
        note(`Countdown ${step.label} · ${step.clip}`);
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      if (countdownGen.current !== gen) return;
      current.countdownStart = false;
      current.countdownTicks = 0;
    })();
  };

  const powerUp = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded || !current.meta.powerupMode)
      return;
    if (current.powerUpItems.length === 0) {
      current.powerUpItems = [{ pos: [25, 8], type: 'SURGE' }];
      note('Surge power-up is on the board. Click again to collect it.');
      bump();
      return;
    }
    current.powerUpItems = [];
    current.tickCount += 1;
    audio.playPowerUp();
    note('Power-up collected · powerup.mp3');
    bump();
  };

  const block = () => {
    if (!labMode(modeId).block) return;
    audioRef.current?.playBlockFound();
    boardRef.current?.classList.add('is-block');
    setBlockLit(true);
    window.setTimeout(() => {
      boardRef.current?.classList.remove('is-block');
      setBlockLit(false);
    }, 1000);
    note('New block · MAINNET_BLOCK · board flashes');
  };

  const endMatch = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    remember();
    pathRef.current = [];
    current.gameEnded = true;
    // The outro needs a winner. The leader takes it, like a match on time.
    const whiteLeads = current.score[0] >= current.score[1];
    current.winnerPlayer = whiteLeads ? 'P1' : 'P2';
    current.winnerName = whiteLeads ? current.p1Name : current.p2Name;
    audio.updateGameState(current);
    setEnded(true);
    note('Match end · end cue, then menu music');
    bump();
  };

  const resume = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || !current.gameEnded) return;
    if (current.score[0] <= 0 || current.score[1] <= 0) return;
    current.gameEnded = false;
    current.winnerPlayer = null;
    current.winnerName = '';
    audio.updateGameState(current);
    setEnded(false);
    note('Match resumed · game bed from the start');
    bump();
  };

  /** New block, the way the game takes one: board and footer flash, reward drops. */
  const dropBlock = (state: GameState, medianFee: number | null) => {
    if (medianFee !== null) createNewCoinbase(state, medianFee);
    audioRef.current?.playBlockFound();
    boardRef.current?.classList.add('is-block');
    setBlockLit(true);
    window.setTimeout(() => {
      boardRef.current?.classList.remove('is-block');
      setBlockLit(false);
    }, 1000);
    note(
      medianFee === null
        ? 'New block'
        : `New block · median fee ${medianFee} sat/vB`
    );
  };

  const stopTour = () => {
    tourGen.current += 1;
    setTouring(null);
    switchMode(modeId);
  };

  /**
   * Plays a real match: both seats are engine bots on the game tick, with the
   * game's countdown, capture, power-up, reset, and block sounds. A short
   * script per tour steers it so each rule shows up, then it loops.
   */
  const playTour = (id: TourId) => {
    const gen = tourGen.current + 1;
    tourGen.current = gen;
    setTouring(id);
    const live = () => tourGen.current === gen;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    const tour = TOURS.find((entry) => entry.id === id)!;

    const runOnce = async () => {
      const audio = audioRef.current;
      if (!audio) return;
      const state = makeTourState(tour);
      pathRef.current = [];
      baitRef.current = new WeakSet();
      historyRef.current = [];
      setHistoryCount(0);
      clearStreakPops();
      stateRef.current = state;
      setEnded(false);
      audio.stopAll();
      audio.updateGameState(state);
      if (!silenceRef.current) audio.startMusic();
      note(`Tour · ${tour.label}`);
      bump();

      const director = makeDirector(tour, {
        dropBlock: (fee) => dropBlock(state, fee),
        note,
      });
      let last = performance.now();
      let accum = 0;
      let elapsed = 0;
      while (live() && !state.gameEnded) {
        await wait(16);
        const now = performance.now();
        const delta = Math.min(250, now - last);
        last = now;
        const counting = state.countdownStart && !state.gameStarted;
        const stepMs = counting
          ? STEP_SPEED_MS
          : (state.meta.currentStepMs ?? STEP_SPEED_MS);
        accum += delta;
        if (!counting) elapsed += delta;
        let steps = 0;
        while (accum >= stepMs && steps < 4 && !state.gameEnded) {
          accum -= stepMs;
          steps += 1;
          const before = {
            countdown: state.countdownTicks,
            p1: state.p1.body.length,
            p2: state.p2.body.length,
            items: state.powerUpItems.length,
            changes: state.pointChanges.length,
          };
          if (!counting) director.beforeStep(state, elapsed);
          stepGame(state);
          if (counting) {
            if (state.countdownTicks !== before.countdown)
              audio.playCountdownTick(state.countdownTicks);
            continue;
          }
          director.afterStep(state);
          if (state.powerUpItems.length < before.items) audio.playPowerUp();
          if (state.p1.body.length > before.p1)
            audio.playCapture(state.p1.body.length);
          if (state.p2.body.length > before.p2)
            audio.playCapture(state.p2.body.length);
          for (const player of resetCuesFromStep(state)) {
            audio.playReset(player);
            note(
              `${player === 'P1' ? 'White' : player === 'P2' ? 'Black' : player} resets to genesis`
            );
          }
          const change = state.pointChanges[state.pointChanges.length - 1];
          if (
            state.pointChanges.length > before.changes &&
            (change?.player === 'P1' || change?.player === 'P2')
          ) {
            const side: CaptureSide = change.player;
            const intensity = satsCaptureBarIntensityFromLabel(
              change.captureRateLabel ?? '2%'
            );
            setBarHit((prev) => ({ side, intensity, id: (prev?.id ?? 0) + 1 }));
            window.clearTimeout(hitClearRef.current);
            hitClearRef.current = window.setTimeout(() => setBarHit(null), 900);
          }
        }
        // Out of time with no winner: start over quietly, with no fake result.
        if (!state.gameEnded && elapsed >= tour.lengthMs) break;
        if (steps > 0 || state.gameEnded) bump();
      }
      if (state.gameEnded) {
        setEnded(true);
        note(`${state.winnerName ?? 'Match'} wins · match over`);
      }
      return state.gameEnded;
    };

    void (async () => {
      while (live()) {
        const finished = await runOnce();
        // Hold on the end card after a real finish, then go again.
        await wait(finished ? 4000 : 400);
      }
    })();
  };

  return (
    <main
      className={`match-lab${setupOpen ? '' : ' match-lab--setup-closed'}${
        triggersOpen ? '' : ' match-lab--triggers-closed'
      }`}
    >
      <aside
        className="match-lab__panel match-lab__pane match-lab__pane--setup"
        data-open={setupOpen}
      >
        <PaneHead
          title="Setup"
          open={setupOpen}
          onToggle={() => setSetupOpen((value) => !value)}
        />
        <div className="match-lab__pane-body">
          <div className="match-lab__nav" role="tablist" aria-label="Lab pages">
            {(
              [
                ['board', 'Board'],
                ['music', 'Music'],
                ['eat', 'Eat'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={desk === id}
                onClick={() => setDesk(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="match-lab__sheet">
            {desk === 'board' ? (
              <>
                <section>
                  <h2>Tour</h2>
                  <div className="match-lab__tours">
                    {TOURS.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        aria-pressed={touring === entry.id}
                        onClick={() =>
                          touring === entry.id ? stopTour() : playTour(entry.id)
                        }
                      >
                        {touring === entry.id
                          ? `■ ${entry.label}`
                          : `▶ ${entry.label}`}
                      </button>
                    ))}
                  </div>
                  <p className="match-lab__note">
                    {touring
                      ? TOURS.find((entry) => entry.id === touring)?.blurb
                      : 'Two bots play a real match on the game tick. Pick the whole match or one rule. Tap again to stop.'}
                  </p>
                </section>

                <section>
                  <h2>Mode</h2>
                  <div className="match-lab__ride">
                    {LAB_MODES.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        aria-pressed={entry.id === modeId}
                        onClick={() => switchMode(entry.id)}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                  <p className="match-lab__note">{mode.summary}</p>
                </section>

                <section>
                  <h2>Drive</h2>
                  <div className="match-lab__ride">
                    {(mode.ffa ? SEATS : SEATS.slice(0, 2)).map((entry) => (
                      <button
                        key={entry.rider}
                        type="button"
                        aria-pressed={rider === entry.rider}
                        onClick={() => setRider(entry.rider)}
                      >
                        {entry.label}
                      </button>
                    ))}
                    <label className="match-lab__check">
                      <input
                        type="checkbox"
                        checked={growOn}
                        onChange={(event) => setGrowOn(event.target.checked)}
                      />
                      Grow
                    </label>
                    <button
                      type="button"
                      disabled={historyCount === 0}
                      onClick={undoMove}
                    >
                      Undo
                    </button>
                  </div>
                  <p className="match-lab__note">
                    Drag the selected chain. Grow turns each new cell into an
                    eat.
                  </p>
                </section>

                <section>
                  <h2>Score and walls</h2>
                  <label className="slider">
                    <span>
                      {mode.ffa
                        ? `${driven.label} ${Math.round(whiteShare * 100)}% of the pot`
                        : `White ${Math.round(whiteShare * 100)}% · Black ${100 - Math.round(whiteShare * 100)}%`}
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={99}
                      value={Math.min(
                        99,
                        Math.max(1, Math.round(whiteShare * 100))
                      )}
                      disabled={ended}
                      aria-label="Score split"
                      onChange={(event) =>
                        setScoreShare(Number(event.target.value) / 100)
                      }
                    />
                  </label>
                  <label className="slider">
                    <span>Wall inset {inset}</span>
                    <input
                      type="range"
                      min={0}
                      max={MAX_INSET}
                      value={inset}
                      disabled={ended || !mode.convergence}
                      aria-label="Wall inset"
                      onChange={(event) => setWalls(Number(event.target.value))}
                    />
                  </label>
                  {mode.convergence ? null : (
                    <p className="match-lab__note">
                      Walls stay open in {mode.label}.
                    </p>
                  )}
                  {mode.ffa ? (
                    <p className="match-lab__note">
                      Four equal chains stay on the bed. This slider gives the
                      selected chain that share. Warning at 12.5%, critical at
                      5%.
                    </p>
                  ) : null}
                </section>

                <section>
                  <h2>Reset marks</h2>
                  <div className="match-lab__ride">
                    {(
                      [
                        ['grid', 'Grid'],
                        ['classic', 'Classic'],
                        ['classic-v2', 'Classic v2'],
                        ['classic-v3', 'Classic v3'],
                      ] as const
                    ).map(([style, label]) => (
                      <button
                        key={style}
                        type="button"
                        aria-pressed={markStyle === style}
                        onClick={() => setMarkStyle(style)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="match-lab__note">
                    How crashes and respawns draw on the board.
                  </p>
                </section>
              </>
            ) : null}
            {desk === 'music' || desk === 'eat' ? (
              <EffectRecipePanel
                page={desk}
                liveTick={recipeTick}
                draft={draft}
                onChange={setDraft}
                levels={{
                  chain: tension.chain,
                  score: tension.score,
                }}
                onPlay={playFile}
                playing={playingFile}
                onEat={eatOne}
                eatDisabled={ended}
                onShowSats={showSats}
                onShowFork={showFork}
                onStopMusic={stopMusic}
                onHearMix={hearMix}
                silenced={silenced}
                chainLength={
                  state &&
                  presentSeats(state).some((entry) => entry.rider === rider)
                    ? labSnake(state, rider).body.length
                    : (state?.p1.body.length ?? 1)
                }
                chainName={driven.label}
                onChainLength={setChainLength}
              />
            ) : null}
            {desk === 'music' ? (
              <section>
                <h2>Other sounds</h2>
                <p className="match-lab__note">
                  Deaths, captures, the countdown, and the menu. Play stops the
                  mix so you can hear this clip on its own.
                </p>
                <div className="recipe__pick">
                  <select
                    aria-label="Other sound"
                    value={otherId}
                    onChange={(event) => setOtherId(event.target.value)}
                  >
                    {OTHER_CLIPS.map((clip) => (
                      <option key={clip.id} value={clip.id}>
                        {clip.name} — {clip.where}
                        {clip.inMode(mode) ? '' : ' · not in this mode'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-pressed={soloId === otherId}
                    onClick={() => {
                      const clip = OTHER_CLIPS.find(
                        (entry) => entry.id === otherId
                      );
                      if (!clip) return;
                      if (soloId === clip.id) stopMusic();
                      else playAlone(clip);
                    }}
                  >
                    {soloId === otherId ? 'Stop' : 'Play'}
                  </button>
                </div>
              </section>
            ) : null}
          </div>
          <div className="match-lab__dock">
            <RecipeBar
              draft={draft}
              onChange={setDraft}
              liveTick={recipeTick}
              onBump={() => setRecipeTick((value) => value + 1)}
            />
            <Link className="match-lab__back" to="/preview?debug">
              UI test pages
            </Link>
          </div>
        </div>
      </aside>
      <section className="match-lab__stage" ref={setStageEl}>
        {/* The real outro for the selected mode, kept inside the stage. */}
        {modeId === 'online' ? (
          state?.gameEnded ? (
            <OnlineVictoryReveal
              room={labOnlineRoom(state)}
              sessionID={DEBUG_P1_SESSION}
              onComplete={() => undefined}
            />
          ) : null
        ) : (
          <MatchEndCard
            getState={() => stateRef.current}
            config={OUTRO_CONFIG[modeId]}
            portalTarget={stageEl}
            continueLabelRef={noPromptRef}
          />
        )}
        <div className="match-lab__match">
          <ScoreHud state={state} modeLabel={mode.modeLabel} barHit={barHit} />
          <div
            className="match-lab__board"
            ref={boardRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
          >
            <div className="match-lab__host" ref={hostRef} />
          </div>
        </div>
        {touring === 'powerups' ? <PowerUpLegend /> : null}
        <MempoolFooter highlight={blockLit} />
        <section
          className="match-lab__readout"
          aria-label="Music tension inputs"
        >
          <p className="match-lab__readout-title">
            Music tension · what the game reads to pick the track
          </p>
          <div className="match-lab__hud">
            <div>
              <em>{driven.label} chain</em>
              <b>
                {drivenLength} · {labelFor(draft, drivenLength)}
              </b>
              <small>Length of the driven chain and its capture rate</small>
            </div>
            <div>
              <em>Walls closed</em>
              <b>{lost.toFixed(0)}%</b>
              <small>Share of the board the walls have taken</small>
            </div>
            <div>
              <em>Capture streak</em>
              <b>
                {tension.streakCount}
                {tension.held ? ' · held' : ''}
              </b>
              <small>Captures in a row by one side. A crash resets it</small>
            </div>
            <div>
              <em>Music</em>
              <b>{TRACK_NAME[tension.level] ?? 'off'}</b>
              <small>Tension track playing: off, warning, critical</small>
            </div>
          </div>
        </section>
      </section>

      <aside
        className="match-lab__panel match-lab__pane match-lab__pane--triggers"
        data-open={triggersOpen}
      >
        <PaneHead
          title="Triggers"
          open={triggersOpen}
          onToggle={() => setTriggersOpen((value) => !value)}
        />
        <div className="match-lab__pane-body">
          <div className="match-lab__sheet">
            <section>
              <h2>Moments</h2>
              <div className="match-lab__moments">
                <button
                  type="button"
                  className="wide"
                  disabled={ended}
                  onClick={eatOne}
                >
                  Eat one step
                </button>
              </div>
              <div className="match-lab__moment-group">
                <p>Reset</p>
                <div className="match-lab__moments">
                  {(mode.ffa ? SEATS : SEATS.slice(0, 2)).map((entry) => (
                    <button
                      key={entry.seat}
                      type="button"
                      disabled={ended}
                      onClick={() => die(entry.seat)}
                    >
                      {entry.label} dies
                    </button>
                  ))}
                  <button type="button" disabled={ended} onClick={hitWall}>
                    Hit the wall
                  </button>
                  <button type="button" disabled={ended} onClick={hitHeadOn}>
                    Head to head
                  </button>
                  <button type="button" disabled={ended} onClick={hitBody}>
                    Hit a body
                  </button>
                  <button type="button" disabled={ended} onClick={hitSelf}>
                    Hit himself
                  </button>
                </div>
              </div>
              <div className="match-lab__moment-group">
                <p>Reorg</p>
                <div className="match-lab__moments match-lab__moments--reorg">
                  <button
                    type="button"
                    disabled={ended}
                    onClick={hitHeadOnReorg}
                  >
                    Head-on
                    <span>selected chain</span>
                  </button>
                  <button type="button" disabled={ended} onClick={soloReorg}>
                    Solo
                    <span>one chain</span>
                  </button>
                </div>
              </div>
              <div className="match-lab__moment-group">
                <p>Match</p>
                <div className="match-lab__moments">
                  <button
                    type="button"
                    disabled={ended || !mode.powerups}
                    onClick={powerUp}
                  >
                    Power-up
                  </button>
                  <button type="button" disabled={!mode.block} onClick={block}>
                    New block
                  </button>
                  <button type="button" onClick={countdown}>
                    Countdown
                  </button>
                  {ended && !state?.winnerPlayer ? (
                    <button type="button" onClick={resume}>
                      Resume
                    </button>
                  ) : ended ? null : (
                    <button type="button" onClick={endMatch}>
                      End match
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h2>Heard now</h2>
              {tension.layers.length === 0 ? (
                <p className="match-lab__note">
                  Nothing audible yet. Click the board once if the browser
                  blocked the bed.
                </p>
              ) : (
                <>
                  <p className="match-lab__why">{musicReason(tension)}</p>
                  <div className="match-lab__layers">
                    {tension.layers.map((layer) => (
                      <div className="match-lab__layer" key={layer.name}>
                        <span>{layerLabel(layer.name)}</span>
                        <b>
                          <i
                            style={{
                              width: `${Math.round(layer.volume * 100)}%`,
                            }}
                          />
                        </b>
                        <span>{layer.volume.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section>
              <h2>Last events</h2>
              <div className="match-lab__log">
                {log.length === 0 ? (
                  <p>Drag the board, or eat one step.</p>
                ) : (
                  log.map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </aside>
    </main>
  );
}
