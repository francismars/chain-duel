import { describe, expect, it } from 'vitest';
import { isLiveMatchPath, isLocalGamePath } from './isLiveMatchPath';

describe('isLiveMatchPath', () => {
  it('holds an update during a local or online match', () => {
    expect(isLiveMatchPath('/game')).toBe(true);
    expect(isLiveMatchPath('/game/')).toBe(true);
    expect(isLiveMatchPath('/online/r/abcd')).toBe(true);
    expect(isLiveMatchPath('/online/r')).toBe(true);
  });

  it('tells a local match from an online room', () => {
    expect(isLocalGamePath('/game')).toBe(true);
    expect(isLocalGamePath('/game/')).toBe(true);
    expect(isLocalGamePath('/online/r/abcd')).toBe(false);
    expect(isLocalGamePath('/gamemenu')).toBe(false);
  });

  it('allows an update on menus', () => {
    expect(isLiveMatchPath('/')).toBe(false);
    expect(isLiveMatchPath('/gamemenu')).toBe(false);
    expect(isLiveMatchPath('/practice')).toBe(false);
    expect(isLiveMatchPath('/online')).toBe(false);
    expect(isLiveMatchPath('/p2p')).toBe(false);
  });
});
