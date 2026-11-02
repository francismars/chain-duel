import type { GridPos } from '@/game/engine/types';

/** How long a cell the ASIC Boost head left keeps glowing. */
export const SURGE_TRAIL_FADE_MS = 480;
/** Opacity of a cell the head has just left. */
export const SURGE_TRAIL_PEAK_ALPHA = 0.75;
/** A fully faded cell shrinks to this share of the cell, so the tail tapers. */
const TAIL_MIN_SCALE = 0.3;
/** Enough for ~1.5 cells per tick over the fade, with headroom. */
const CAPACITY = 32;
/** A boosted head moves at most two cells per tick. */
const MAX_STEP_CELLS = 2;
/** Frozen + boosted moves every other tick, so a step can span two ticks. */
const MAX_STEP_SPAN_MS = 200;

/**
 * Cells a boosted head passed through, oldest first, in a fixed ring.
 *
 * One entry per cell the head left, not per frame, so the fade does not
 * depend on frame rate and a cell is never painted twice. A two-cell step
 * also records the cell it jumped over, with departure times spread across
 * the step so the trail fades as a ramp instead of pairs.
 */
export class SurgeTrail {
  private readonly xs = new Int16Array(CAPACITY);
  private readonly ys = new Int16Array(CAPACITY);
  private readonly ts = new Float64Array(CAPACITY);
  private start = 0;
  private count = 0;
  private tracking = false;
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;

  get length(): number {
    return this.count;
  }

  /** Call once per paint. Records cells the head left since the last call. */
  note(head: GridPos, body: GridPos[], surging: boolean, now: number): void {
    if (!surging) {
      this.tracking = false;
      return;
    }
    const hx = head[0];
    const hy = head[1];
    if (!this.tracking) {
      this.tracking = true;
      this.lastX = hx;
      this.lastY = hy;
      this.lastT = now;
      return;
    }
    if (hx === this.lastX && hy === this.lastY) return;

    // The old head is body[0] after one step, body[1] after a double step.
    let k = -1;
    const scan = Math.min(body.length, MAX_STEP_CELLS);
    for (let i = 0; i < scan; i += 1) {
      if (body[i]![0] === this.lastX && body[i]![1] === this.lastY) {
        k = i;
        break;
      }
    }
    // Respawn or reset: nothing to trail between the two heads.
    if (k >= 0) {
      const span = Math.min(Math.max(0, now - this.lastT), MAX_STEP_SPAN_MS);
      const n = k + 1;
      for (let j = k; j >= 0; j -= 1) {
        const left = now - span + (span * (k - j + 1)) / n;
        this.push(body[j]![0], body[j]![1], left);
      }
    }
    this.lastX = hx;
    this.lastY = hy;
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
   * Paints the tail as one tapering streak: a shrinking square per cell, and
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
