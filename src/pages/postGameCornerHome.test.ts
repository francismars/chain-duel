import { describe, expect, it } from 'vitest';
import { postGameBlocksCornerHome } from './postGameCornerHome';

describe('postGameBlocksCornerHome', () => {
  it('asks before leaving an unclaimed paid result', () => {
    expect(
      postGameBlocksCornerHome({
        practiceMode: false,
        menu: 1,
        loading: false,
      })
    ).toBe(true);
    expect(
      postGameBlocksCornerHome({
        practiceMode: false,
        menu: 2,
        loading: false,
      })
    ).toBe(true);
  });

  it('lets practice and a claimed prize leave', () => {
    expect(
      postGameBlocksCornerHome({
        practiceMode: true,
        menu: 1,
        loading: false,
      })
    ).toBe(false);
    expect(
      postGameBlocksCornerHome({
        practiceMode: false,
        menu: 3,
        loading: false,
      })
    ).toBe(false);
  });

  it('waits to learn the mode before guarding', () => {
    expect(
      postGameBlocksCornerHome({
        practiceMode: false,
        menu: 1,
        loading: true,
      })
    ).toBe(false);
  });
});
