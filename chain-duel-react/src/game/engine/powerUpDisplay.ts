import type { PowerUpType } from '@/game/engine/types';

export interface PowerUpDisplay {
  /** In-game legend title */
  title: string;
  /** Short label on the board (HUD) */
  hud: string;
  /** One-line effect under the title */
  subtitle: string;
  /** Hover tooltip with extra flavor */
  tooltip: string;
}

export const POWERUP_DISPLAY: Record<PowerUpType, PowerUpDisplay> = {
  SURGE: {
    title: 'ASIC Boost',
    hud: 'ASIC',
    subtitle: '2x movement briefly',
    tooltip: 'Move twice as often briefly — like an ASIC surging ahead.',
  },
  FREEZE: {
    title: 'Sybil Attack',
    hud: 'SYBL',
    subtitle: 'Halve rival speed',
    tooltip:
      'Network spam slows rivals — like mempool congestion on everyone else.',
  },
  PHANTOM: {
    title: 'Coinjoin',
    hud: 'CJ',
    subtitle: 'Pass through walls',
    tooltip: 'Mixed path through walls — wrap the grid instead of bouncing.',
  },
  AMPLIFIER: {
    title: 'Full Block',
    hud: 'FULL',
    subtitle: '2x % on next 3 captures',
    tooltip: 'Your next three captures count at double percent.',
  },
  DECOY: {
    title: 'Fork Coin',
    hud: 'FORK',
    subtitle: 'Spawns a fake coin',
    tooltip:
      'Touch the fork coin and you reset to spawn — wrong chain, zero hashrate (BCH joke).',
  },
};

/** Display order for legend and docs */
export const POWERUP_DISPLAY_ORDER: PowerUpType[] = [
  'SURGE',
  'FREEZE',
  'PHANTOM',
  'AMPLIFIER',
  'DECOY',
];

export function getPowerUpHudLabel(type: PowerUpType): string {
  return POWERUP_DISPLAY[type].hud;
}
