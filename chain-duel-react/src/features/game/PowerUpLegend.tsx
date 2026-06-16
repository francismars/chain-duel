import type { CSSProperties, ReactNode } from 'react';
import { POWERUP_COLORS } from '@/game/engine/constants';
import {
  POWERUP_DISPLAY,
  POWERUP_DISPLAY_ORDER,
} from '@/game/engine/powerUpDisplay';
import type { PowerUpType } from '@/game/engine/types';
import './power-up-legend.css';

function powerUpColorHex(type: PowerUpType): string {
  const n = POWERUP_COLORS[type] ?? 0xffffff;
  return `#${n.toString(16).padStart(6, '0')}`;
}

const POWER_UP_ICONS: Record<PowerUpType, ReactNode> = {
  SURGE: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 2L4 9h5l-3 5 8-7H9l1-5z" fill="currentColor" />
    </svg>
  ),
  FREEZE: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1v14M1 8h14M3.5 3.5l9 9M12.5 3.5l-9 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
    </svg>
  ),
  PHANTOM: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 14V7a5 5 0 0110 0v7l-2-1.5-2 1.5-2-1.5L5 15l-2-1z"
        fill="currentColor"
        opacity="0.85"
      />
      <circle cx="6" cy="7" r="1.2" fill="currentColor" opacity="0.45" />
      <circle cx="10" cy="7" r="1.2" fill="currentColor" opacity="0.45" />
    </svg>
  ),
  AMPLIFIER: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 12L7 4l3 5 2-3 3 6H2z" fill="currentColor" />
    </svg>
  ),
  DECOY: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="5"
        stroke="currentColor"
        strokeWidth="1.4"
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
