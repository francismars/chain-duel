import { describe, expect, it } from 'vitest';
import { keyForCode } from './syntheticKeys';

describe('keyForCode', () => {
  it('maps codes to the key a physical press reports', () => {
    expect(keyForCode('Space')).toBe(' ');
    expect(keyForCode('Enter')).toBe('Enter');
    expect(keyForCode('KeyW')).toBe('w');
    expect(keyForCode('ArrowUp')).toBe('ArrowUp');
  });
});
