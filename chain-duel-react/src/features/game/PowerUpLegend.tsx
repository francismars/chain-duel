import type { CSSProperties } from 'react';
import './power-up-legend.css';

const POWER_UPS = [
  {
    id: 'SURGE',
    label: 'SURGE',
    color: '#C8881A',
    desc: 'Extra step every other tick · 4s',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 2L4 9h5l-3 5 8-7H9l1-5z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'FREEZE',
    label: 'FREEZE',
    color: '#2878A8',
    desc: 'Opponent half speed · 4s',
    icon: (
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
  },
  {
    id: 'PHANTOM',
    label: 'GHOST',
    color: '#9898B8',
    desc: 'Warp at walls · ignore own tail · 5s',
    icon: (
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
  },
  {
    id: 'AMPLIFIER',
    label: 'AMP',
    color: '#7AAA70',
    desc: 'Next 3 captures at double %',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 12L7 4l3 5 2-3 3 6H2z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'DECOY',
    label: 'DECOY',
    color: '#E8E8E8',
    desc: 'Fake coin · resets who grabs it',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
] as const;

export function PowerUpLegend() {
  return (
    <section id="powerUpKey" className="powerUpLegend" aria-label="Power-up reference">
      <ul className="powerUpLegend__list">
        {POWER_UPS.map(({ id, label, color, desc, icon }) => (
          <li
            key={id}
            className="powerUpLegend__card powerUpKeyEntry"
            style={{ '--pu-color': color } as CSSProperties}
          >
            <span className="powerUpLegend__swatch" aria-hidden="true" />
            <div className="powerUpLegend__icon" style={{ color }}>
              {icon}
            </div>
            <div className="powerUpLegend__body">
              <span className="powerUpLegend__name" style={{ color }}>
                {label}
              </span>
              <span className="powerUpLegend__desc">{desc}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
