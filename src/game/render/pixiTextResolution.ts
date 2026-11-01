/**
 * Pixi Text bitmap resolution: the match canvas resolution, never below 2
 * (2× matches pre-optimization canvas text quality on a 1× screen).
 */
export function pixiTextResolution(canvasResolution: number): number {
  return Math.max(2, canvasResolution);
}
