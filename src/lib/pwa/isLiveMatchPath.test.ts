import { describe, expect, it } from 'vitest';
import { isLiveMatchPath } from './isLiveMatchPath';

describe('isLiveMatchPath', () => {
  it('holds an update during a local or online match', () => {
    expect(isLiveMatchPath('/game')).toBe(true);
    expect(isLiveMatchPath('/game/')).toBe(true);
    expect(isLiveMatchPath('/online/r/abcd')).toBe(true);
    expect(isLiveMatchPath('/online/r')).toBe(true);
  });

  it('allows an update on menus', () => {
    expect(isLiveMatchPath('/')).toBe(false);
    expect(isLiveMatchPath('/gamemenu')).toBe(false);
    expect(isLiveMatchPath('/practice')).toBe(false);
    expect(isLiveMatchPath('/online')).toBe(false);
    expect(isLiveMatchPath('/p2p')).toBe(false);
  });
});
