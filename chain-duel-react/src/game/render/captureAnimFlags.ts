import { gameRecipe } from '@/game/effects/matchRecipe';

export type CaptureAnimFlags = {
  grow: boolean;
  tint: boolean;
  scale: boolean;
};

export function captureAnimFlags(): CaptureAnimFlags {
  const recipe = gameRecipe();
  return {
    grow: recipe.animGrow,
    tint: recipe.animTint,
    scale: recipe.animScale,
  };
}

export function anyCaptureAnimFlag(flags: CaptureAnimFlags): boolean {
  return flags.grow || flags.tint || flags.scale;
}
