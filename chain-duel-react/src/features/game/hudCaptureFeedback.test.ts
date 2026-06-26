import { describe, expect, it } from 'vitest';
import {
  ambientCaptureIntensity,
  captureFeedbackStyleFromCtx,
  capturePercentToIntensity,
  capturingPlayerIntensity,
  parseCapturePercent,
  satsCaptureBarIntensity,
} from '@/features/game/hudCaptureFeedback';

describe('hudCaptureFeedback', () => {
  it('parses capture labels within game tiers', () => {
    expect(parseCapturePercent('2%')).toBe(2);
    expect(parseCapturePercent('32%')).toBe(32);
    expect(parseCapturePercent('invalid')).toBe(2);
    expect(parseCapturePercent('99%')).toBe(32);
  });

  it('maps capture tiers 2→0 through 32→1', () => {
    expect(capturePercentToIntensity(2)).toBe(0);
    expect(capturePercentToIntensity(4)).toBeCloseTo(0.25);
    expect(capturePercentToIntensity(8)).toBeCloseTo(0.5);
    expect(capturePercentToIntensity(16)).toBeCloseTo(0.75);
    expect(capturePercentToIntensity(32)).toBe(1);
  });

  it('uses the capturing player tier for event intensity', () => {
    const ctx = { captureP1: '16%', captureP2: '4%' };
    expect(capturingPlayerIntensity('P1', ctx)).toBeCloseTo(0.75);
    expect(capturingPlayerIntensity('P2', ctx)).toBeCloseTo(0.25);
  });

  it('uses max capture tier for ambient intensity', () => {
    expect(
      ambientCaptureIntensity({ captureP1: '16%', captureP2: '4%' })
    ).toBeCloseTo(0.75);
    expect(
      ambientCaptureIntensity({ captureP1: '8%', captureP2: '32%' })
    ).toBe(1);
  });

  it('spreads bar hit intensity across capture tiers', () => {
    expect(satsCaptureBarIntensity('P1', { captureP1: '2%', captureP2: '2%' })).toBeCloseTo(0.18);
    expect(satsCaptureBarIntensity('P1', { captureP1: '4%', captureP2: '2%' })).toBeCloseTo(0.385);
    expect(satsCaptureBarIntensity('P1', { captureP1: '8%', captureP2: '2%' })).toBeCloseTo(0.59);
    expect(satsCaptureBarIntensity('P1', { captureP1: '16%', captureP2: '2%' })).toBeCloseTo(0.795);
    expect(satsCaptureBarIntensity('P2', { captureP1: '32%', captureP2: '32%' })).toBe(1);
  });

  it('exports css vars from tier-based intensity', () => {
    const style = captureFeedbackStyleFromCtx({
      captureP1: '8%',
      captureP2: '32%',
    });
    expect(style['--capture-p1-intensity']).toBeCloseTo(0.5);
    expect(style['--capture-p2-intensity']).toBe(1);
    expect(style['--stakes-pressure']).toBe(1);
  });
});
