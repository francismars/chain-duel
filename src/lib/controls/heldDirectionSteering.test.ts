import { describe, expect, it } from 'vitest';
import {
  createEmptyHeldAxes,
  resolveHeldSteeringDirection,
} from '@/lib/controls/heldDirectionSteering';

describe('resolveHeldSteeringDirection', () => {
  it('alternates vertical while facing horizontal with left+down held', () => {
    const held = { ...createEmptyHeldAxes(), left: true, down: true };
    expect(resolveHeldSteeringDirection('Right', held)).toBe('Down');
    expect(resolveHeldSteeringDirection('Down', held)).toBe('Left');
    expect(resolveHeldSteeringDirection('Left', held)).toBe('Down');
  });

  it('uses a single held axis', () => {
    const held = { ...createEmptyHeldAxes(), down: true };
    expect(resolveHeldSteeringDirection('Right', held)).toBe('Down');
  });

  it('prefers lastAxis when opposing keys on the same axis are held', () => {
    const held = { ...createEmptyHeldAxes(), left: true, right: true };
    expect(resolveHeldSteeringDirection('Up', held, 'right')).toBe('Right');
    expect(resolveHeldSteeringDirection('Up', held, 'left')).toBe('Left');
  });
});
