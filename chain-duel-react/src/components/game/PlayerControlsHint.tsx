import {
  confirmKeyLabel,
  slotBindingLabels,
  type PlayerControlSlot,
} from '@/lib/controls/playerControls';
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout';
import { usePlayerBindingsRevision } from '@/hooks/usePlayerBindings';
import './PlayerControlsHint.css';

type PlayerControlsHintProps = {
  slot: PlayerControlSlot;
  size?: 'xs' | 'sm' | 'md';
  showConfirm?: boolean;
  className?: string;
};

function KeyCap({
  label,
  wide = false,
}: {
  label: string;
  wide?: boolean;
}) {
  return (
    <kbd
      className={['control-key-cap', wide ? 'control-key-cap--wide' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </kbd>
  );
}

export function PlayerControlsHint({
  slot,
  size = 'sm',
  showConfirm = true,
  className = '',
}: PlayerControlsHintProps) {
  const layout = useKeyboardLayout();
  usePlayerBindingsRevision();
  const labels = slotBindingLabels(slot, layout);
  const startLabel = confirmKeyLabel(slot, layout);
  const compactConfirm = showConfirm && size === 'xs';
  const labeledConfirm = showConfirm && size !== 'xs';

  return (
    <div
      className={['player-controls-hint', `player-controls-hint--${size}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${slot.toUpperCase()} movement and start controls`}
    >
      <div className="player-controls-hint__pad" aria-hidden="true">
        <div className="player-controls-hint__row player-controls-hint__row--up">
          <KeyCap label={labels.up} />
        </div>
        <div className="player-controls-hint__row player-controls-hint__row--middle">
          <KeyCap label={labels.left} />
          <KeyCap label={labels.down} />
          <KeyCap label={labels.right} />
        </div>
        {compactConfirm ? (
          <div className="player-controls-hint__row player-controls-hint__row--confirm">
            <KeyCap label={startLabel} wide={startLabel.length > 2} />
          </div>
        ) : null}
      </div>
      {labeledConfirm ? (
        <div className="player-controls-hint__confirm">
          <span className="player-controls-hint__confirm-label">Start</span>
          <KeyCap label={startLabel} />
        </div>
      ) : null}
    </div>
  );
}
