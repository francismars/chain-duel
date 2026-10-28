import { GamepadDiagram } from './GamepadDiagram';
import {
  useGamepadSnapshot,
  type GamepadSnapshot,
} from './useGamepadSnapshot';

type GamepadTesterProps = {
  active: boolean;
};

const PLAYER_SLOTS: Array<{ slot: 1 | 2; title: string }> = [
  { slot: 1, title: 'Player 1' },
  { slot: 2, title: 'Player 2' },
];

function restingPad(index: number): GamepadSnapshot {
  return {
    id: '',
    index,
    connected: false,
    mapping: 'standard',
    timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
}

function padForSlot(
  gamepads: GamepadSnapshot[],
  slot: 1 | 2
): GamepadSnapshot | null {
  return gamepads.find((p) => p.index === slot - 1) ?? null;
}

function GamepadSlotPanel({
  slot,
  title,
  pad,
}: {
  slot: 1 | 2;
  title: string;
  pad: GamepadSnapshot | null;
}) {
  const keysLabel = slot === 1 ? 'WASD + Space' : 'Arrows + Enter';
  const connected = pad?.connected === true;
  const diagramPad = pad ?? restingPad(slot - 1);

  return (
    <section className="config-gp-slot" aria-label={title}>
      <header className="config-gp-slot__header">
        <div className="config-gp-slot__identity">
          <h3 className="config-gp-slot__title">{title}</h3>
          <p className="config-gp-slot__device" title={connected ? pad?.id : undefined}>
            {connected ? pad?.id || 'Gamepad' : 'No controller'}
          </p>
        </div>
      </header>

      <p className="config-gp-slot__mapping">
        {keysLabel}
        <span className="config-gp-slot__mapping-sep" aria-hidden>
          ·
        </span>
        {connected ? pad?.mapping || 'custom' : 'standard'} mapping
      </p>

      <div className="config-gp-slot__diagram-wrap">
        <span
          className={`config-gp-slot__badge ${connected ? 'config-gp-slot__badge--on' : 'config-gp-slot__badge--off'}`}
        >
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        <div
          className={connected ? undefined : 'config-gp-slot__diagram-wrap--muted'}
        >
          <GamepadDiagram pad={diagramPad} />
        </div>
      </div>
    </section>
  );
}

export function GamepadTester({ active }: GamepadTesterProps) {
  const livePads = useGamepadSnapshot(active);
  const connectedCount = livePads.length;

  return (
    <div className="config-gp-tester">
      <div className="config-gp-slots">
        <div className="config-gp-tester__intro">
          <p className="config-gp-tester__lede">
            Gamepad 1 maps to player 1 keys; gamepad 2 maps to player 2 keys.
            Press buttons here to verify your controller is detected.
          </p>

          <div className="config-gp-tester__status" role="status">
            <span
              className={`config-gp-tester__count${connectedCount > 0 ? ' config-gp-tester__count--on' : ''}`}
            >
              {connectedCount} controller{connectedCount === 1 ? '' : 's'} detected
            </span>
          </div>
        </div>
        {PLAYER_SLOTS.map(({ slot, title }) => (
          <GamepadSlotPanel
            key={slot}
            slot={slot}
            title={title}
            pad={padForSlot(livePads, slot)}
          />
        ))}
      </div>
    </div>
  );
}
