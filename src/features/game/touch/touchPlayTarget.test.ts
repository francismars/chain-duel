import { afterEach, describe, expect, it } from 'vitest';
import { readTouchPlaySlot, setTouchPlayTarget } from './touchPlayTarget';

describe('readTouchPlaySlot', () => {
  afterEach(() => setTouchPlayTarget(null));

  it('follows the registered seat', () => {
    setTouchPlayTarget({ getSlot: () => 'p2', active: () => true });
    expect(readTouchPlaySlot()).toBe('p2');
  });

  it('is off while touch play is paused or there is no single seat', () => {
    setTouchPlayTarget({ getSlot: () => 'p2', active: () => false });
    expect(readTouchPlaySlot()).toBeNull();
    setTouchPlayTarget({ getSlot: () => null, active: () => true });
    expect(readTouchPlaySlot()).toBeNull();
  });
});
