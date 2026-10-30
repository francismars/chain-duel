import { describe, expect, it } from 'vitest';
import {
  StickSession,
  createStickKeyEvent,
  keyFromCode,
  stickAxes,
  type StickAxis,
  type StickBindings,
} from './touchStick';

const WASD: StickBindings = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
};

describe('stickAxes', () => {
  it('stays quiet inside the dead zone', () => {
    expect(stickAxes(10, 8, [])).toEqual([]);
  });

  it('snaps a drag to the nearest cardinal', () => {
    expect(stickAxes(80, 0, [])).toEqual(['right']);
    expect(stickAxes(-80, 0, [])).toEqual(['left']);
    expect(stickAxes(0, -80, [])).toEqual(['up']);
    expect(stickAxes(0, 80, [])).toEqual(['down']);
    expect(stickAxes(80, 12, [])).toEqual(['right']);
  });

  it('holds both keys on a diagonal so the chain can stair-step', () => {
    expect(stickAxes(80, 80, [])).toEqual(['down', 'right']);
    expect(stickAxes(80, -80, [])).toEqual(['up', 'right']);
  });

  it('keeps the current snap until the finger clearly crosses the boundary', () => {
    const right: StickAxis[] = ['right'];
    expect(stickAxes(80, 42, right)).toEqual(['right']);
    expect(stickAxes(80, 64, right)).toEqual(['down', 'right']);

    const diagonal: StickAxis[] = ['down', 'right'];
    expect(stickAxes(80, 26, diagonal)).toEqual(['down', 'right']);
    expect(stickAxes(80, 12, diagonal)).toEqual(['right']);
  });
});

describe('keyFromCode', () => {
  it('maps the codes the match reads from keyboard events', () => {
    expect(keyFromCode('KeyW')).toBe('w');
    expect(keyFromCode('Space')).toBe(' ');
    expect(keyFromCode('Enter')).toBe('Enter');
    expect(keyFromCode('ArrowUp')).toBe('ArrowUp');
    expect(keyFromCode('NumpadEnter')).toBe('Enter');
  });
});

describe('createStickKeyEvent', () => {
  it('keeps the code and key the match reads', () => {
    const event = createStickKeyEvent('keydown', 'KeyD');
    expect(event.type).toBe('keydown');
    expect((event as KeyboardEvent).code).toBe('KeyD');
    expect((event as KeyboardEvent).key).toBe('d');
  });
});

describe('StickSession', () => {
  function session() {
    const events: { type: 'keydown' | 'keyup'; code: string }[] = [];
    const visuals: ({ dx: number; dy: number } | null)[] = [];
    const stick = new StickSession(
      WASD,
      'Space',
      (type, code) => events.push({ type, code }),
      (visual) => visuals.push(visual ? { dx: visual.dx, dy: visual.dy } : null)
    );
    return { stick, events, visuals };
  }

  it('treats a press that never leaves the dead zone as a confirm tap', () => {
    const { stick, events } = session();
    stick.begin(40, 40);
    stick.move(48, 44);
    stick.end();
    expect(events).toEqual([
      { type: 'keydown', code: 'Space' },
      { type: 'keyup', code: 'Space' },
    ]);
  });

  it('holds a direction and lets go without confirming', () => {
    const { stick, events } = session();
    stick.begin(0, 0);
    stick.move(80, 0);
    stick.move(80, 80);
    stick.end();
    expect(events).toEqual([
      { type: 'keydown', code: 'KeyD' },
      { type: 'keydown', code: 'KeyS' },
      { type: 'keyup', code: 'KeyS' },
      { type: 'keyup', code: 'KeyD' },
    ]);
  });

  it('drops a direction that the finger leaves, and ignores a cancelled tap', () => {
    const { stick, events } = session();
    stick.begin(0, 0);
    stick.move(0, -90);
    stick.move(4, -4);
    stick.cancel();
    stick.end();
    expect(events).toEqual([
      { type: 'keydown', code: 'KeyW' },
      { type: 'keyup', code: 'KeyW' },
    ]);
  });
});
