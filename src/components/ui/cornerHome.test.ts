import { describe, expect, it } from 'vitest';
import { hideCornerHomeButton } from './cornerHome';

describe('hideCornerHomeButton', () => {
  it('hides Home on a live online room', () => {
    expect(hideCornerHomeButton('/online/r/abcd', false)).toBe(true);
    expect(hideCornerHomeButton('/online/r/abcd', true)).toBe(true);
    expect(hideCornerHomeButton('/online/r', false)).toBe(true);
  });

  it('hides Home on a paid local match and keeps it for practice', () => {
    expect(hideCornerHomeButton('/game', false)).toBe(true);
    expect(hideCornerHomeButton('/game/', false)).toBe(true);
    expect(hideCornerHomeButton('/game', true)).toBe(false);
    expect(hideCornerHomeButton('/game/', true)).toBe(false);
  });

  it('keeps Home on menus, including deposit screens', () => {
    expect(hideCornerHomeButton('/', false)).toBe(false);
    expect(hideCornerHomeButton('/gamemenu', false)).toBe(false);
    expect(hideCornerHomeButton('/tournlobby', false)).toBe(false);
    expect(hideCornerHomeButton('/tournbracket', false)).toBe(false);
    expect(hideCornerHomeButton('/practice', true)).toBe(false);
  });
});
