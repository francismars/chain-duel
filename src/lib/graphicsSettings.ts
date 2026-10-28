import { STORAGE_KEY_GRAPHICS } from '@/shared/constants/storageKeys';

/** full = glow + pop-in; simple = flat number only; off = no popups. */
export type PointPopupMode = 'full' | 'simple' | 'off';
/**
 * full = every effect; reduced = chain effects once per move, no HUD flash;
 * off = no capture/surge/streak/reveal motion, CSS animations jump to their end.
 */
export type AnimationMode = 'full' | 'reduced' | 'off';

/**
 * Renderer knobs for slow browsers (Safari mainly). Read when a match mounts,
 * so a change applies to the next game, not the one already running.
 */
export interface GraphicsSettings {
  /** WebGL MSAA. Off saves a resolve pass each frame. */
  antialias: boolean;
  /** Read the board size from the DOM every frame. Off trusts the ResizeObserver size and skips the forced layout. */
  measureEveryFrame: boolean;
  /** Blurred text shadows (countdown, start words, hints), coin halo, and see-through board/HUD layers. */
  shadowsAndTransparency: boolean;
  /** The +/- sats numbers over the chains after a capture. */
  pointPopups: PointPopupMode;
  /** Capture pulses, surge trails, streak rings, board reveal, and HUD/CSS motion. */
  animations: AnimationMode;
  /** Effect sounds plus tension (music layers), streak, and shrink tracking. Music itself keeps playing. */
  soundAndTension: boolean;
  /** Small frames-per-second readout in the corner during a match. */
  showFps: boolean;
}

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  antialias: true,
  measureEveryFrame: true,
  shadowsAndTransparency: true,
  pointPopups: 'full',
  animations: 'full',
  soundAndTension: true,
  showFps: false,
};

const POINT_POPUP_MODES: readonly string[] = ['full', 'simple', 'off'];
const ANIMATION_MODES: readonly string[] = ['full', 'reduced', 'off'];

/** On <html> while the HUD capture flash is off; game.css drops the animation. */
const NO_HUD_FLASH_CLASS = 'graphics-no-hud-flash';
/** On <html> while shadows & transparency are off; game.css flattens the board and HUD. */
const FLAT_CLASS = 'graphics-flat';

export function isGraphicsFlat(): boolean {
  return document.documentElement.classList.contains(FLAT_CLASS);
}
/** On <html> while animations are off; game.css jumps game-page animations to their end. */
const NO_ANIM_CLASS = 'graphics-anim-off';

/** Applies the settings that live in CSS. Called at boot and on every change. */
export function applyGraphicsDocumentClasses(settings: GraphicsSettings): void {
  const root = document.documentElement.classList;
  root.toggle(NO_HUD_FLASH_CLASS, settings.animations !== 'full');
  root.toggle(FLAT_CLASS, !settings.shadowsAndTransparency);
  root.toggle(NO_ANIM_CLASS, settings.animations === 'off');
}

type StoredGraphicsSettings = Partial<
  Record<keyof GraphicsSettings, unknown>
> & {
  /** Earlier builds stored these as switches; mapped onto the three-way modes. */
  popupGlow?: unknown;
  smoothChainEffects?: unknown;
  hudCaptureFlash?: unknown;
};

export function readGraphicsSettings(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GRAPHICS);
    if (!raw) return { ...DEFAULT_GRAPHICS_SETTINGS };
    const parsed = JSON.parse(raw) as StoredGraphicsSettings;
    const merged = { ...DEFAULT_GRAPHICS_SETTINGS };
    if (typeof parsed.antialias === 'boolean')
      merged.antialias = parsed.antialias;
    if (typeof parsed.measureEveryFrame === 'boolean')
      merged.measureEveryFrame = parsed.measureEveryFrame;
    if (typeof parsed.shadowsAndTransparency === 'boolean')
      merged.shadowsAndTransparency = parsed.shadowsAndTransparency;
    if (typeof parsed.showFps === 'boolean') merged.showFps = parsed.showFps;
    if (typeof parsed.soundAndTension === 'boolean')
      merged.soundAndTension = parsed.soundAndTension;

    if (
      typeof parsed.pointPopups === 'string' &&
      POINT_POPUP_MODES.includes(parsed.pointPopups)
    ) {
      merged.pointPopups = parsed.pointPopups as PointPopupMode;
    } else if (parsed.popupGlow === false) {
      merged.pointPopups = 'simple';
    }
    if (
      typeof parsed.animations === 'string' &&
      ANIMATION_MODES.includes(parsed.animations)
    ) {
      merged.animations = parsed.animations as AnimationMode;
    } else if (
      parsed.smoothChainEffects === false ||
      parsed.hudCaptureFlash === false
    ) {
      merged.animations = 'reduced';
    }
    return merged;
  } catch {
    return { ...DEFAULT_GRAPHICS_SETTINGS };
  }
}

export function writeGraphicsSettings(settings: GraphicsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_GRAPHICS, JSON.stringify(settings));
  } catch {
    // Private mode / blocked storage: settings last for this page only.
  }
  applyGraphicsDocumentClasses(settings);
}

/** Cheapest look that still shows every number; sound and the FPS readout keep their choice. */
export function performanceGraphicsSettings(
  current: GraphicsSettings
): GraphicsSettings {
  return {
    antialias: false,
    measureEveryFrame: false,
    shadowsAndTransparency: false,
    pointPopups: 'simple',
    animations: 'reduced',
    // Sound is a choice, not just a cost; keep whatever the player picked.
    soundAndTension: current.soundAndTension,
    showFps: current.showFps,
  };
}
