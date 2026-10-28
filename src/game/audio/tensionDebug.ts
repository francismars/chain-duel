import type { GridPos } from '@/game/engine/types';
import {
  TENSION_TRACKS,
  type TensionBreakdown,
  type TensionLevel,
  type TensionTrack,
} from './tension';

export interface TensionLayer {
  name: string;
  /** 0–1, already quantized so the panel does not repaint every mix step. */
  volume: number;
}

export interface TensionDebugSnapshot {
  /** Match is in progress, so the numbers are meaningful. */
  active: boolean;
  chain: TensionLevel;
  walls: TensionLevel;
  score: TensionLevel;
  streak: TensionLevel;
  level: TensionLevel;
  /** Level is being held after a drop. */
  held: boolean;
  track: TensionTrack;
  streakCount: number;
  /** Stems currently audible, including the base game bed. */
  layers: TensionLayer[];
}

export interface StreakPop {
  id: number;
  text: string;
  col: number;
  row: number;
  yOffsetPx: number;
  alpha: number;
  /** True when the capture rate went up. */
  up: boolean;
  /** Wall, clash, and reorg are white or black. */
  tone?: 'white' | 'black';
  /** On-board fill for a wall or spawn. Gold marks ignore it. */
  fill?: number;
  /** Spawn cell for a thin death→home wipe. */
  toCol?: number;
  toRow?: number;
}

const EMPTY: TensionDebugSnapshot = {
  active: false,
  chain: 0,
  walls: 0,
  score: 0,
  streak: 0,
  level: 0,
  held: false,
  track: 'off',
  streakCount: 0,
  layers: [],
};

let snapshot: TensionDebugSnapshot = EMPTY;
let pops: StreakPop[] = [];
let nextPopId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function tensionDebugSnapshot(): TensionDebugSnapshot {
  return snapshot;
}

export function subscribeTensionDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishTensionDebug(
  breakdown: TensionBreakdown,
  active: boolean,
  level: TensionLevel,
  held: boolean
): void {
  const next: TensionDebugSnapshot = {
    active,
    chain: breakdown.chain,
    walls: breakdown.walls,
    score: breakdown.score,
    streak: breakdown.streak,
    level,
    held,
    track: TENSION_TRACKS[level] ?? 'off',
    streakCount: breakdown.streakCount,
    layers: snapshot.layers,
  };
  if (
    snapshot.active === next.active &&
    snapshot.chain === next.chain &&
    snapshot.walls === next.walls &&
    snapshot.score === next.score &&
    snapshot.streak === next.streak &&
    snapshot.level === next.level &&
    snapshot.held === next.held &&
    snapshot.streakCount === next.streakCount
  ) {
    return;
  }
  snapshot = next;
  emit();
}

export function publishTensionLayers(layers: readonly TensionLayer[]): void {
  const audible = layers
    .filter((layer) => layer.volume >= 0.02)
    .map((layer) => ({
      name: layer.name,
      volume: Math.round(layer.volume * 100) / 100,
    }));
  if (
    audible.length === snapshot.layers.length &&
    audible.every(
      (layer, index) =>
        layer.name === snapshot.layers[index]?.name &&
        layer.volume === snapshot.layers[index]?.volume
    )
  ) {
    return;
  }
  snapshot = { ...snapshot, layers: audible };
  emit();
}

export function resetTensionDebug(): void {
  snapshot = EMPTY;
  pops = [];
  emit();
}

export function clearStreakPops(): void {
  if (pops.length === 0) return;
  pops = [];
  emit();
}

/** Floating capture rate / collision mark. Optional home draws a death→spawn wipe. */
export function pushCaptureRatePop(
  head: GridPos,
  label: string,
  up: boolean,
  tone?: 'white' | 'black',
  home?: GridPos,
  fill?: number
): void {
  pops = [
    ...pops,
    {
      id: nextPopId,
      text: label,
      col: head[0],
      row: head[1],
      yOffsetPx: 0,
      alpha: 1,
      up,
      tone,
      fill,
      toCol: home?.[0],
      toRow: home?.[1],
    },
  ];
  nextPopId += 1;
  emit();
}

/** Soft flash on the cell a chain snaps back to. */
export function pushSpawnFlash(
  head: GridPos,
  tone: 'white' | 'black',
  fill?: number
): void {
  pushCaptureRatePop(head, 'SPAWN', true, tone, undefined, fill);
}

export function streakPops(): readonly StreakPop[] {
  return pops;
}

/**
 * WALL/CLASH ~0.35s, REORG ~0.5s, SPAWN ~0.25s at 60fps.
 */
export function advanceStreakPops(): void {
  if (pops.length === 0) return;
  pops = pops
    .map((pop) => ({
      ...pop,
      yOffsetPx: pop.yOffsetPx,
      alpha:
        pop.alpha -
        (pop.text === 'SPAWN' ? 0.06 : pop.text === 'REORG' ? 0.028 : 0.045),
    }))
    .filter((pop) => pop.alpha >= 0);
}
