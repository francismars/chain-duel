import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import {
  autodetectAndApplyLayout,
  confirmKeyLabel,
  isBindableKeyCode,
  KEYBOARD_LAYOUT_LABELS,
  readLayoutSource,
  resetAllPlayerBindings,
  resetSlotBindings,
  slotBindingLabels,
  slotHasCustomBindings,
  writeConfirmBinding,
  writeKeyboardLayoutId,
  writeSlotBinding,
  type KeyboardLayoutId,
  type PlayerControlSlot,
} from '@/lib/controls/playerControls';
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout';
import { usePlayerBindingsRevision } from '@/hooks/usePlayerBindings';
import { useKeyboardLayoutAutodetect } from '@/hooks/useKeyboardLayoutAutodetect';
import './keyboard-controls-settings.css';

type AxisDirection = 'up' | 'down' | 'left' | 'right';

type ListeningState =
  | { kind: 'move'; slot: PlayerControlSlot; direction: AxisDirection }
  | { kind: 'confirm'; slot: PlayerControlSlot };

const CONFIG_SLOTS: PlayerControlSlot[] = ['p1', 'p2', 'p3', 'p4'];
const SLOT_TITLES: Record<PlayerControlSlot, string> = {
  p1: 'Player 1',
  p2: 'Player 2',
  p3: 'Player 3',
  p4: 'Player 4',
};

const DIRECTION_LABELS: Record<AxisDirection, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
};

function BindingPad({
  slot,
  layout,
  listening,
  onPick,
  onPickConfirm,
}: {
  slot: PlayerControlSlot;
  layout: KeyboardLayoutId;
  listening: ListeningState | null;
  onPick: (direction: AxisDirection) => void;
  onPickConfirm: () => void;
}) {
  const labels = slotBindingLabels(slot, layout);
  const startLabel = confirmKeyLabel(slot, layout);
  const isListeningConfirm =
    listening?.kind === 'confirm' && listening.slot === slot;

  const renderButton = (direction: AxisDirection, className: string) => {
    const isListening =
      listening?.kind === 'move' &&
      listening.slot === slot &&
      listening.direction === direction;
    return (
      <button
        key={direction}
        type="button"
        className={[
          'keyboard-controls-settings__bind-key',
          className,
          isListening ? 'keyboard-controls-settings__bind-key--listening' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={`${SLOT_TITLES[slot]} ${DIRECTION_LABELS[direction]}: ${labels[direction]}`}
        aria-pressed={isListening}
        onClick={() => onPick(direction)}
      >
        <span className="keyboard-controls-settings__bind-key-label">
          {labels[direction]}
        </span>
        <span className="keyboard-controls-settings__bind-key-hint">
          {isListening ? 'Press key…' : DIRECTION_LABELS[direction]}
        </span>
      </button>
    );
  };

  return (
    <div className="keyboard-controls-settings__bind-pad">
      <div className="keyboard-controls-settings__bind-row keyboard-controls-settings__bind-row--up">
        {renderButton('up', 'keyboard-controls-settings__bind-key--up')}
      </div>
      <div className="keyboard-controls-settings__bind-row keyboard-controls-settings__bind-row--middle">
        {renderButton('left', 'keyboard-controls-settings__bind-key--left')}
        {renderButton('down', 'keyboard-controls-settings__bind-key--down')}
        {renderButton('right', 'keyboard-controls-settings__bind-key--right')}
      </div>
      <button
        type="button"
        className={[
          'keyboard-controls-settings__bind-start',
          isListeningConfirm
            ? 'keyboard-controls-settings__bind-start--listening'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={`${SLOT_TITLES[slot]} start key: ${startLabel}`}
        aria-pressed={isListeningConfirm}
        onClick={onPickConfirm}
      >
        <span className="keyboard-controls-settings__bind-key-label">
          {startLabel}
        </span>
        <span className="keyboard-controls-settings__bind-key-hint">
          {isListeningConfirm ? 'Press key…' : 'Start'}
        </span>
      </button>
    </div>
  );
}

type KeyboardControlsSettingsProps = {
  /** When set, parent Config nav skips keys while a bind is in progress. */
  bindListeningRef?: MutableRefObject<boolean>;
};

export function KeyboardControlsSettings({
  bindListeningRef,
}: KeyboardControlsSettingsProps = {}) {
  const layout = useKeyboardLayout();
  usePlayerBindingsRevision();
  useKeyboardLayoutAutodetect();

  const [listening, setListening] = useState<ListeningState | null>(null);
  const [detecting, setDetecting] = useState(false);
  const layoutSource = readLayoutSource();

  const cancelListening = useCallback(() => setListening(null), []);

  useEffect(() => {
    if (!bindListeningRef) return;
    bindListeningRef.current = listening != null;
    return () => {
      bindListeningRef.current = false;
    };
  }, [listening, bindListeningRef]);

  useEffect(() => {
    if (!listening) return;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.code === 'Escape') {
        cancelListening();
        return;
      }

      if (!isBindableKeyCode(event.code)) return;

      if (listening.kind === 'confirm') {
        writeConfirmBinding(listening.slot, event.code);
      } else {
        writeSlotBinding(listening.slot, listening.direction, event.code);
      }
      setListening(null);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [listening, cancelListening]);

  const runAutodetect = async () => {
    setDetecting(true);
    try {
      await autodetectAndApplyLayout();
    } finally {
      setDetecting(false);
    }
  };

  const setManualLayout = (next: KeyboardLayoutId) => {
    writeKeyboardLayoutId(next, 'manual');
  };

  const listenLabel =
    listening == null
      ? null
      : listening.kind === 'confirm'
        ? `start for ${SLOT_TITLES[listening.slot]}`
        : `${DIRECTION_LABELS[listening.direction]} for ${SLOT_TITLES[listening.slot]}`;

  return (
    <section className="keyboard-controls-settings" aria-labelledby="keyboard-controls-title">
      <div className="keyboard-controls-settings__header">
        <div>
          <h2 id="keyboard-controls-title" className="keyboard-controls-settings__title">
            Keyboard controls
          </h2>
          <p className="keyboard-controls-settings__copy">
            Click a direction or Start, then press the key you want. Labels follow
            your keyboard layout automatically.
          </p>
        </div>
        <div className="keyboard-controls-settings__layout-bar">
          <span className="keyboard-controls-settings__layout-badge">
            {layoutSource === 'auto' ? 'Auto' : 'Manual'}:{' '}
            {KEYBOARD_LAYOUT_LABELS[layout]}
          </span>
          <button
            type="button"
            className="keyboard-controls-settings__layout-action"
            onClick={() => void runAutodetect()}
            disabled={detecting}
          >
            {detecting ? 'Detecting…' : 'Re-detect layout'}
          </button>
        </div>
      </div>

      <details className="keyboard-controls-settings__advanced">
        <summary>Layout override</summary>
        <p className="keyboard-controls-settings__advanced-copy">
          Only needed if auto-detect is wrong. Hints use this to show the letter on
          your key cap.
        </p>
        <div className="keyboard-controls-settings__layout-pills">
          {(['qwerty', 'azerty', 'qwertz'] as KeyboardLayoutId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={[
                'keyboard-controls-settings__layout-pill',
                layout === id && layoutSource === 'manual'
                  ? 'keyboard-controls-settings__layout-pill--active'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setManualLayout(id)}
            >
              {KEYBOARD_LAYOUT_LABELS[id]}
            </button>
          ))}
        </div>
      </details>

      <div className="keyboard-controls-settings__players">
        {CONFIG_SLOTS.map((slot) => (
          <article key={slot} className="keyboard-controls-settings__player-card">
            <div className="keyboard-controls-settings__player-head">
              <h3 className="keyboard-controls-settings__player-title">
                {SLOT_TITLES[slot]}
              </h3>
              {slotHasCustomBindings(slot) ? (
                <button
                  type="button"
                  className="keyboard-controls-settings__text-btn"
                  onClick={() => resetSlotBindings(slot)}
                >
                  Reset
                </button>
              ) : null}
            </div>
            <BindingPad
              slot={slot}
              layout={layout}
              listening={listening}
              onPick={(direction) =>
                setListening({ kind: 'move', slot, direction })
              }
              onPickConfirm={() => setListening({ kind: 'confirm', slot })}
            />
          </article>
        ))}
      </div>

      <div className="keyboard-controls-settings__footer">
        <button
          type="button"
          className="keyboard-controls-settings__text-btn"
          onClick={() => resetAllPlayerBindings()}
        >
          Reset all players to defaults
        </button>
      </div>

      {listening && listenLabel ? (
        <div className="keyboard-controls-settings__listen-banner" role="status">
          Press a key for {listenLabel} — Esc to cancel
        </div>
      ) : null}
    </section>
  );
}
