import { describe, expect, it } from 'vitest';
import {
  captureGapTension,
  chainTension,
  drainTension,
  scoreTension,
  wallsTension,
} from '@/game/audio/tension';
import {
  SHIPPED_RECIPE,
  captureClipForLength,
  capturePercentForLength,
  levelFromMarks,
  sanitizeRecipe,
} from '@/game/effects/matchRecipe';

describe('match recipe', () => {
  it('keeps the shipped thresholds', () => {
    expect(chainTension(3)).toBe(0);
    expect(chainTension(4)).toBe(1);
    expect(chainTension(16)).toBe(4);
    expect(wallsTension(0)).toBe(0);
    expect(wallsTension(1)).toBe(1);
    expect(wallsTension(25)).toBe(2);
    expect(scoreTension(0.6)).toBe(1);
    expect(scoreTension(0.85)).toBe(3);
    expect(scoreTension(0.95)).toBe(4);
  });

  it('reads custom marks on their own', () => {
    expect(chainTension(10, [4, 12, 20, 30])).toBe(1);
    expect(chainTension(4)).toBe(1);
  });

  it('keeps a zero wall mark and fills missing fields from the shipped recipe', () => {
    const recipe = sanitizeRecipe({ wallMarks: [0, 10, 20, 30], duck: 0 });
    expect(recipe.wallMarks).toEqual([0, 10, 20, 30]);
    expect(recipe.duck).toBe(0);
    expect(recipe.stemVolumes).toEqual(SHIPPED_RECIPE.stemVolumes);
    expect(recipe.holdMs).toBe(1000);
    expect(recipe.fadeMs).toBe(2500);
    expect(recipe.stemEnabled).toEqual([true, true, true, true]);
    expect(recipe.bedFile).toBe('chain_duel_produced_game.m4a');
    expect(recipe.stemFiles[0]).toBe('chain_duel_build.m4a');
    expect(recipe.captureFrom).toEqual([1, 2, 4, 7, 11]);
    expect(recipe.capturePercent).toEqual([2, 4, 8, 16, 32]);
    expect(recipe.gapLeader).toEqual([16, 32]);
    expect(recipe.drainMarks).toEqual([10, 25]);
  });

  it('lets a saved capture line and sats line move the music', () => {
    const recipe = sanitizeRecipe({
      gapLeader: [20, 40],
      drainMarks: [15, 5],
    });
    expect(recipe.gapLeader).toEqual([20, 40]);
    expect(recipe.drainMarks).toEqual([5, 15]);
    expect(captureGapTension(16, recipe)).toBe(0);
    expect(captureGapTension(20, recipe)).toBe(2);
    expect(captureGapTension(40, recipe)).toBe(4);
    expect(drainTension(0.12, recipe.drainMarks)).toBe(2);
    expect(drainTension(0.05, recipe.drainMarks)).toBe(4);
    expect(drainTension(0.2, recipe.drainMarks)).toBe(0);
  });

  it('treats the first wall mark as above that number', () => {
    expect(levelFromMarks(10, [10, 20, 40, 60], 'gt')).toBe(0);
    expect(levelFromMarks(11, [10, 20, 40, 60], 'gt')).toBe(1);
  });

  it('maps chain length onto the shipped capture percents', () => {
    expect(capturePercentForLength(1)).toBe(2);
    expect(capturePercentForLength(3)).toBe(4);
    expect(capturePercentForLength(6)).toBe(8);
    expect(capturePercentForLength(10)).toBe(16);
    expect(capturePercentForLength(11)).toBe(32);
    expect(capturePercentForLength(8, [1, 3, 5, 9, 12], [2, 5, 9, 20, 40])).toBe(9);
  });

  it('plays the eat clip for the capture percent of that length', () => {
    expect(captureClipForLength(1)).toBe(2);
    expect(captureClipForLength(3)).toBe(4);
    expect(captureClipForLength(6)).toBe(8);
    expect(captureClipForLength(10)).toBe(16);
    expect(captureClipForLength(11)).toBe(32);
    expect(captureClipForLength(36)).toBe(32);
    expect(captureClipForLength(10, [1, 3, 5, 9, 12], [2, 5, 9, 20, 40])).toBe(16);
    expect(captureClipForLength(12, [1, 3, 5, 9, 12], [2, 5, 9, 20, 40])).toBe(32);
  });
});
