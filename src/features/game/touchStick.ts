/** Direction relative to where the finger landed, snapped to the held-key model. */

export type StickAxis = 'up' | 'down' | 'left' | 'right';

export const TOUCH_GESTURE_EVENT = 'chainduel:touch-gesture';

/** A short press inside this radius is a tap. Past it, the finger is steering. */
export const DEAD_ZONE_PX = 22;

const SPLIT = (22.5 * Math.PI) / 180;
const HYSTERESIS = (8 * Math.PI) / 180;

const CARDINALS: { axis: StickAxis; center: number }[] = [
  { axis: 'right', center: 0 },
  { axis: 'down', center: Math.PI / 2 },
  { axis: 'left', center: Math.PI },
  { axis: 'up', center: -Math.PI / 2 },
];

const CLOCKWISE: Record<StickAxis, StickAxis> = {
  right: 'down',
  down: 'left',
  left: 'up',
  up: 'right',
};

const COUNTER: Record<StickAxis, StickAxis> = {
  right: 'up',
  up: 'left',
  left: 'down',
  down: 'right',
};

const AXIS_ORDER: StickAxis[] = ['up', 'down', 'left', 'right'];

export type StickVisual = {
  x: number;
  y: number;
  dx: number;
  dy: number;
};

export type StickBindings = Record<StickAxis, string>;

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(from - to), Math.cos(from - to));
}

function sortAxes(axes: StickAxis[]): StickAxis[] {
  return AXIS_ORDER.filter((axis) => axes.includes(axis));
}

function nearestCardinal(angle: number): {
  axis: StickAxis;
  offset: number;
  delta: number;
} {
  let best = CARDINALS[0]!;
  let bestOffset = Infinity;
  let bestDelta = 0;
  for (const cardinal of CARDINALS) {
    const delta = angleDelta(angle, cardinal.center);
    const offset = Math.abs(delta);
    if (offset < bestOffset) {
      best = cardinal;
      bestOffset = offset;
      bestDelta = delta;
    }
  }
  return { axis: best.axis, offset: bestOffset, delta: bestDelta };
}

/**
 * Cardinal when the drag is near an axis. A diagonal holds both keys so the
 * match can stair-step the same way a keyboard does. `previous` adds a few
 * degrees of stickiness so the snap does not flicker on the boundary.
 */
export function stickAxes(
  dx: number,
  dy: number,
  previous: readonly StickAxis[]
): StickAxis[] {
  if (Math.hypot(dx, dy) < DEAD_ZONE_PX) return [];
  const angle = Math.atan2(dy, dx);
  const { axis, offset, delta } = nearestCardinal(angle);
  const stayedCardinal = previous.length === 1 && previous[0] === axis;
  const stayedDiagonal = previous.length === 2 && previous.includes(axis);
  let diagonal: boolean;
  if (stayedCardinal) diagonal = offset > SPLIT + HYSTERESIS;
  else if (stayedDiagonal) diagonal = offset > SPLIT - HYSTERESIS;
  else diagonal = offset > SPLIT;
  if (!diagonal) return [axis];
  const other = delta > 0 ? CLOCKWISE[axis] : COUNTER[axis];
  return sortAxes([axis, other]);
}

/** `KeyboardEvent.key` for a physical code the match already binds. */
export function keyFromCode(code: string): string {
  if (code === 'Space') return ' ';
  if (code === 'NumpadEnter') return 'Enter';
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3).toLowerCase();
  }
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  return code;
}

const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  '[role="button"]',
  '[role="slider"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="option"]',
].join(', ');

export function isStickBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}

/**
 * One finger. Direction is relative to the landing point. Releasing inside
 * the dead zone is a confirm tap; leaving it and letting go keeps the heading.
 */
export class StickSession {
  private held: StickAxis[] = [];
  private originX = 0;
  private originY = 0;
  private leftDeadZone = false;
  private finished = false;

  constructor(
    private readonly bindings: StickBindings,
    private readonly confirmCode: string,
    private readonly dispatch: (
      type: 'keydown' | 'keyup',
      code: string
    ) => void,
    private readonly onVisual: (visual: StickVisual | null) => void
  ) {}

  begin(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
    this.onVisual({ x, y, dx: 0, dy: 0 });
  }

  move(x: number, y: number): void {
    if (this.finished) return;
    const dx = x - this.originX;
    const dy = y - this.originY;
    if (Math.hypot(dx, dy) >= DEAD_ZONE_PX) this.leftDeadZone = true;
    this.sync(stickAxes(dx, dy, this.held));
    this.onVisual({ x: this.originX, y: this.originY, dx, dy });
  }

  /** Finger lifted. A press that never steered confirms (start / continue). */
  end(): void {
    this.finish(true);
  }

  /** The gesture was cancelled. Do not treat it as a tap. */
  cancel(): void {
    this.finish(false);
  }

  private finish(allowTap: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.releaseAll();
    this.onVisual(null);
    if (allowTap && !this.leftDeadZone) {
      this.dispatch('keydown', this.confirmCode);
      this.dispatch('keyup', this.confirmCode);
    }
  }

  private sync(next: StickAxis[]): void {
    for (const axis of this.held) {
      if (!next.includes(axis)) this.dispatch('keyup', this.bindings[axis]);
    }
    for (const axis of next) {
      if (!this.held.includes(axis))
        this.dispatch('keydown', this.bindings[axis]);
    }
    this.held = next;
  }

  private releaseAll(): void {
    for (const axis of this.held) this.dispatch('keyup', this.bindings[axis]);
    this.held = [];
  }
}
