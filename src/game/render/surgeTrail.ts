import type { GridPos } from '@/game/engine/types';

/** How long a cell the ASIC Boost head left keeps glowing. */
export const SURGE_TRAIL_FADE_MS = 480;
/** Opacity of a cell the head has just left. */
export const SURGE_TRAIL_PEAK_ALPHA = 0.75;
/** A fully faded cell shrinks to this share of the cell, so the tail tapers. */
const TAIL_MIN_SCALE = 0.3;
/** Enough for ~1.5 cells per tick over the fade, with headroom. */
const CAPACITY = 32;
/** A boosted chain moves at most two cells per tick. */
const MAX_STEP_CELLS = 2;
/** Frozen + boosted moves every other tick, so a step can span two ticks. */
const MAX_STEP_SPAN_MS = 200;

/** Not a board cell: marks a chain too short to have that cell. */
const NONE = -32768;

/**
 * Cells a boosted chain's tail let go of, oldest first, in a fixed ring: the
 * exhaust behind the last block.
 *
 * One entry per cell the tail left, not per frame, so the fade does not
 * depend on frame rate and a cell is never painted twice. A two-cell step
 * also records the second cell, with departure times spread across the step
 * so the trail fades as a ramp instead of pairs.
 */
export class SurgeTrail {
  private readonly xs = new Int16Array(CAPACITY);
  private readonly ys = new Int16Array(CAPACITY);
  private readonly ts = new Float64Array(CAPACITY);
  private start = 0;
  private count = 0;
  private tracking = false;
  /** The chain's last cells last paint: [0] the tail, then towards the head. */
  private readonly endX = new Int16Array(MAX_STEP_CELLS + 1);
  private readonly endY = new Int16Array(MAX_STEP_CELLS + 1);
  private lastT = 0;

  get length(): number {
    return this.count;
  }

  /** Call once per paint. Records cells the tail left since the last call. */
  note(head: GridPos, body: GridPos[], surging: boolean, now: number): void {
    if (!surging) {
      this.tracking = false;
      return;
    }
    const last = body.length;
    // The tail, and how many of the previous end cells the chain moved past.
    const tx = last > 0 ? body[last - 1]![0] : head[0];
    const ty = last > 0 ? body[last - 1]![1] : head[1];
    if (this.tracking && (tx !== this.endX[0] || ty !== this.endY[0])) {
      let k = -1;
      for (let i = 1; i <= MAX_STEP_CELLS; i += 1) {
        if (this.endX[i] === tx && this.endY[i] === ty) {
          k = i;
          break;
        }
      }
      // Respawn or reset: nothing to trail between the two tails.
      if (k > 0) {
        const span = Math.min(Math.max(0, now - this.lastT), MAX_STEP_SPAN_MS);
        for (let j = 0; j < k; j += 1) {
          this.push(
            this.endX[j]!,
            this.endY[j]!,
            now - span + (span * (j + 1)) / k
          );
        }
      }
    }
    for (let i = 0; i <= MAX_STEP_CELLS; i += 1) {
      // Index i from the tail, along body then head.
      const at = last - 1 - i;
      const cell = at >= 0 ? body[at]! : at === -1 ? head : null;
      this.endX[i] = cell ? cell[0] : NONE;
      this.endY[i] = cell ? cell[1] : NONE;
    }
    this.tracking = true;
    this.lastT = now;
  }

  /** Drops faded cells from the front. Times are recorded in order. */
  prune(now: number): void {
    while (
      this.count > 0 &&
      now - this.ts[this.start]! >= SURGE_TRAIL_FADE_MS
    ) {
      this.start = (this.start + 1) % CAPACITY;
      this.count -= 1;
    }
  }

  cellX(i: number): number {
    return this.xs[(this.start + i) % CAPACITY]!;
  }

  cellY(i: number): number {
    return this.ys[(this.start + i) % CAPACITY]!;
  }

  /** Eases to zero with no slope at either end, so the tail never pops off. */
  alpha(i: number, now: number): number {
    const t =
      (now - this.ts[(this.start + i) % CAPACITY]!) / SURGE_TRAIL_FADE_MS;
    if (t <= 0) return SURGE_TRAIL_PEAK_ALPHA;
    if (t >= 1) return 0;
    const k = 1 - t * t;
    return SURGE_TRAIL_PEAK_ALPHA * k * k;
  }

  /** Square size as a share of the cell: shrinks as the cell fades. */
  scale(i: number, now: number): number {
    const t = Math.min(
      1,
      Math.max(
        0,
        (now - this.ts[(this.start + i) % CAPACITY]!) / SURGE_TRAIL_FADE_MS
      )
    );
    return 1 - (1 - TAIL_MIN_SCALE) * t * (2 - t);
  }

  /**
   * Paints the trail as one tapering streak: a shrinking square per cell, and
   * a bridge between neighbouring cells so the 1px grid gaps and the size
   * steps do not break it into separate blocks.
   */
  paint(
    now: number,
    colSize: number,
    rowSize: number,
    pad: number,
    draw: (x: number, y: number, w: number, h: number, alpha: number) => void
  ): void {
    for (let i = 0; i < this.count; i += 1) {
      const x = this.cellX(i);
      const y = this.cellY(i);
      const a = this.alpha(i, now);
      const s = this.scale(i, now);
      const w = (colSize - pad * 2) * s;
      const h = (rowSize - pad * 2) * s;
      const cx = (x + 0.5) * colSize;
      const cy = (y + 0.5) * rowSize;
      draw(cx - w / 2, cy - h / 2, w, h, a);
      if (i + 1 >= this.count) continue;
      const nx = this.cellX(i + 1);
      const ny = this.cellY(i + 1);
      // Only neighbours: a wrap or a respawn jumps across the board.
      if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
      // The bridge takes the older cell's size and opacity, so it never
      // stands out from the square it leads into.
      const ncx = (nx + 0.5) * colSize;
      const ncy = (ny + 0.5) * rowSize;
      if (nx !== x) {
        draw(Math.min(cx, ncx), cy - h / 2, colSize, h, a);
      } else {
        draw(cx - w / 2, Math.min(cy, ncy), w, rowSize, a);
      }
    }
  }

  private push(x: number, y: number, time: number): void {
    // Full ring: overwrite the oldest cell.
    if (this.count === CAPACITY) {
      this.start = (this.start + 1) % CAPACITY;
      this.count -= 1;
    }
    const at = (this.start + this.count) % CAPACITY;
    this.xs[at] = x;
    this.ys[at] = y;
    this.ts[at] = time;
    this.count += 1;
  }
}
