import type { ReactNode, RefObject } from 'react';

export type GameModifiersPowerupsControl = {
  enabled: boolean;
  focused: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
  onFocus?: () => void;
};

export type GameModifiersSectionProps = {
  /** When set, power-ups is interactive; zone and time limit stay disabled. */
  powerups?: GameModifiersPowerupsControl;
};

function ZoneIcon() {
  return (
    <svg className="p2p-duel-format__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="12" cy="12" r="1.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

function TimeLimitIcon() {
  return (
    <svg className="p2p-duel-format__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PowerupsIcon() {
  return (
    <svg className="p2p-duel-format__icon p2p-duel-format__icon--pop" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M 10.5 3 H 13.5 V 10.5 H 21 V 13.5 H 13.5 V 21 H 10.5 V 13.5 H 3 V 10.5 H 10.5 Z"
        stroke="currentColor"
        strokeWidth="1"
        fill="currentColor"
        fillOpacity="0.15"
      />
    </svg>
  );
}

function DisabledModifierCard({
  label,
  desc,
  icon,
}: {
  label: string;
  desc: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      className="p2p-duel-format__card p2p-duel-format__card--disabled"
      disabled
      aria-disabled="true"
    >
      {icon}
      <span className="p2p-duel-format__label">{label}</span>
      <span className="p2p-duel-format__desc">{desc}</span>
      <span className="p2p-duel-format__soon">SOON</span>
    </button>
  );
}

export function GameModifiersSection({ powerups }: GameModifiersSectionProps) {
  return (
    <section className="practice-section p2p-modifiers-section" aria-label="Game modifiers">
      <div className="ph-picker-block">
        <h3 className="p2p-picker-group-label">MODIFIERS</h3>
        <div className="p2p-duel-format" role="group" aria-label="Game modifiers">
        {powerups ? (
          <button
            ref={powerups.buttonRef}
            type="button"
            aria-pressed={powerups.enabled}
            tabIndex={powerups.focused ? 0 : -1}
            className={[
              'p2p-duel-format__card',
              powerups.enabled ? 'p2p-duel-format__card--active' : '',
              powerups.focused ? 'practice-focus-target' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={powerups.onToggle}
            onFocus={powerups.onFocus}
          >
            <PowerupsIcon />
            <span className="p2p-duel-format__label">Power-ups</span>
            <span className="p2p-duel-format__desc">Items</span>
          </button>
        ) : (
          <DisabledModifierCard label="Power-ups" desc="Items" icon={<PowerupsIcon />} />
        )}
        <DisabledModifierCard label="Zone" desc="Convergence" icon={<ZoneIcon />} />
        <DisabledModifierCard label="3 min" desc="Time limit" icon={<TimeLimitIcon />} />
      </div>
      </div>
    </section>
  );
}
