import { CAPTURE_LEVELS } from '@/game/engine/constants';

export type CaptureSide = 'P1' | 'P2';
export type FfaPlayerIndex = 0 | 1 | 2 | 3;
export type SegmentGlowStyle = 'light' | 'dark';

export interface CaptureFeedbackContext {
  captureP1: string;
  captureP2: string;
}

export const CAPTURE_POP_MS = 720;
export const DISTRIBUTION_SURGE_MS = 900;

const CAPTURE_TIER_PERCENTS = CAPTURE_LEVELS.map((level) => level.percent);
const MIN_CAPTURE_PERCENT = CAPTURE_TIER_PERCENTS[0] ?? 2;
const MAX_CAPTURE_PERCENT =
  CAPTURE_TIER_PERCENTS[CAPTURE_TIER_PERCENTS.length - 1] ?? 32;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function parseCapturePercent(label: string): number {
  const n = Number.parseInt(String(label).replace('%', ''), 10);
  return clamp(Number.isFinite(n) ? n : MIN_CAPTURE_PERCENT, MIN_CAPTURE_PERCENT, MAX_CAPTURE_PERCENT);
}

/**
 * Map game capture tiers (2, 4, 8, 16, 32) to 0–1 intensity.
 * 2% is weakest; 32% is full strength.
 */
export function capturePercentToIntensity(percent: number): number {
  const clamped = clamp(percent, MIN_CAPTURE_PERCENT, MAX_CAPTURE_PERCENT);
  const tierIndex = CAPTURE_TIER_PERCENTS.indexOf(
    clamped as (typeof CAPTURE_TIER_PERCENTS)[number]
  );
  if (tierIndex >= 0) {
    return tierIndex / Math.max(1, CAPTURE_TIER_PERCENTS.length - 1);
  }
  return (
    (clamped - MIN_CAPTURE_PERCENT) /
    Math.max(1, MAX_CAPTURE_PERCENT - MIN_CAPTURE_PERCENT)
  );
}

/** Intensity for the player who just gained capture tier. */
export function capturingPlayerIntensity(
  side: CaptureSide,
  ctx: CaptureFeedbackContext
): number {
  const label = side === 'P1' ? ctx.captureP1 : ctx.captureP2;
  return capturePercentToIntensity(parseCapturePercent(label));
}

/** Bar hit strength — tier-scaled with a visible floor and full spread through 32%. */
export function satsCaptureBarIntensity(
  side: CaptureSide,
  ctx: CaptureFeedbackContext
): number {
  const tier = capturingPlayerIntensity(side, ctx);
  return satsCaptureBarIntensityFromTier(tier);
}

export function satsCaptureBarIntensityFromTier(tier: number): number {
  return 0.18 + tier * 0.82;
}

export function satsCaptureBarIntensityFromLabel(captureLabel: string): number {
  return satsCaptureBarIntensityFromTier(
    capturePercentToIntensity(parseCapturePercent(captureLabel))
  );
}

function parseHexColor(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, '');
  if (hex.length === 3) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    return [r, g, b];
  }
  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

/** Light bar segments get outer glow; dark segments get inset edge glow. */
export function segmentGlowStyleFromColor(color: string): SegmentGlowStyle {
  const rgb = parseHexColor(color);
  if (!rgb) return 'dark';
  const [r, g, b] = rgb;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance >= 0.45 ? 'light' : 'dark';
}

export function distributionSurgeDurationMs(intensity: number): number {
  return Math.round(520 + intensity * 680);
}

export function captureHitFlashDurationMs(intensity: number): number {
  return Math.round(300 + intensity * 120);
}

export function captureHitStyleVars(
  intensity: number
): Record<string, string | number> {
  return {
    '--capture-hit-intensity': intensity,
    '--capture-hit-ms': `${distributionSurgeDurationMs(intensity)}ms`,
    '--capture-hit-flash-ms': `${captureHitFlashDurationMs(intensity)}ms`,
  };
}

/** Ambient HUD intensity — follows the highest capture tier on the board. */
export function ambientCaptureIntensity(ctx: CaptureFeedbackContext): number {
  const p1 = parseCapturePercent(ctx.captureP1);
  const p2 = parseCapturePercent(ctx.captureP2);
  return capturePercentToIntensity(Math.max(p1, p2));
}

export function capturePopDurationMs(intensity: number): number {
  return Math.round(480 + intensity * 320);
}

export function captureFeedbackStyleFromCtx(
  ctx: CaptureFeedbackContext
): Record<string, string | number> {
  const p1 = capturePercentToIntensity(parseCapturePercent(ctx.captureP1));
  const p2 = capturePercentToIntensity(parseCapturePercent(ctx.captureP2));
  const lead = Math.max(p1, p2);

  return {
    '--capture-p1-intensity': p1,
    '--capture-p2-intensity': p2,
    '--capture-p1-effect': 0.1 + p1 * 0.9,
    '--capture-p2-effect': 0.1 + p2 * 0.9,
    '--stakes-pressure': lead,
    '--stakes-effect': 0.1 + lead * 0.9,
    '--stakes-pop-ms': `${capturePopDurationMs(lead)}ms`,
    '--stakes-surge-ms': `${distributionSurgeDurationMs(lead)}ms`,
  };
}

export function distributionTrackFeedbackStyle(
  ctx: CaptureFeedbackContext,
  p1WidthPercent: number,
  barCaptureHit?: { side: CaptureSide; intensity: number } | null
): Record<string, string | number> {
  return {
    ...captureFeedbackStyleFromCtx(ctx),
    '--distribution-p1-width': `${p1WidthPercent}%`,
    ...(barCaptureHit ? captureHitStyleVars(barCaptureHit.intensity) : {}),
  };
}
