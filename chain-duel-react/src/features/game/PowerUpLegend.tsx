import type { CSSProperties, ReactNode } from 'react';
import {
  POWERUP_ICON_PATHS,
  powerUpColorHex,
} from '@/game/engine/powerUpIcons';
import {
  POWERUP_DISPLAY,
  POWERUP_DISPLAY_ORDER,
} from '@/game/engine/powerUpDisplay';
import type { PowerUpType } from '@/game/engine/types';
import './power-up-legend.css';

const POWER_UP_ICONS: Record<PowerUpType, ReactNode> = {
  SURGE: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={POWERUP_ICON_PATHS.SURGE} fill="currentColor" />
    </svg>
  ),
  FREEZE: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={POWERUP_ICON_PATHS.FREEZE_CROSS}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
    </svg>
  ),
  PHANTOM: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={POWERUP_ICON_PATHS.PHANTOM} fill="currentColor" opacity="0.95" />
      <circle cx="6" cy="7" r="1.2" fill="currentColor" opacity="0.45" />
      <circle cx="10" cy="7" r="1.2" fill="currentColor" opacity="0.45" />
    </svg>
  ),
  AMPLIFIER: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={POWERUP_ICON_PATHS.AMPLIFIER} fill="currentColor" />
    </svg>
  ),
  DECOY: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="3 2"
      />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  ),
};

export function PowerUpLegend() {
  return (
    <section
      id="powerUpKey"
      className="powerUpLegend"
      aria-label="Power-up reference"
    >
      <ul className="powerUpLegend__list">
        {POWERUP_DISPLAY_ORDER.map((id) => {
          const { title, subtitle, tooltip } = POWERUP_DISPLAY[id];
          const color = powerUpColorHex(id);
          const icon = POWER_UP_ICONS[id];
          return (
            <li
              key={id}
              className="powerUpLegend__card powerUpKeyEntry"
              style={{ '--pu-color': color } as CSSProperties}
              title={tooltip}
            >
              <span className="powerUpLegend__swatch" aria-hidden="true" />
              <div className="powerUpLegend__header">
                <div className="powerUpLegend__icon" style={{ color }}>
                  {icon}
                </div>
                <span className="powerUpLegend__name" style={{ color }}>
                  {title}
                </span>
              </div>
              <span className="powerUpLegend__desc">{subtitle}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
