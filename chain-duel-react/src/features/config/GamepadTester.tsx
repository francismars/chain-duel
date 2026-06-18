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

  if (!pad) {
    return (
      <section className="config-gp-slot config-gp-slot--empty" aria-label={title}>
        <header className="config-gp-slot__header">
          <h3 className="config-gp-slot__title">{title}</h3>
          <span className="config-gp-slot__badge config-gp-slot__badge--off">
            Not connected
          </span>
        </header>
        <p className="config-gp-slot__empty-text">
          Plug in a controller and press any button to wake it up. Maps to{' '}
          <strong>{keysLabel}</strong>.
        </p>
      </section>
    );
  }

  return (
    <section className="config-gp-slot" aria-label={title}>
      <header className="config-gp-slot__header">
        <div className="config-gp-slot__identity">
          <h3 className="config-gp-slot__title">{title}</h3>
          <p className="config-gp-slot__device" title={pad.id}>
            {pad.id || 'Gamepad'}
          </p>
        </div>
        <span className="config-gp-slot__badge config-gp-slot__badge--on">
          Connected
        </span>
      </header>

      <p className="config-gp-slot__mapping">
        {keysLabel}
        <span className="config-gp-slot__mapping-sep" aria-hidden>
          ·
        </span>
        {pad.mapping || 'custom'} mapping
      </p>

      <div className="config-gp-slot__diagram-wrap">
        <GamepadDiagram pad={pad} />
      </div>
    </section>
  );
}

export function GamepadTester({ active }: GamepadTesterProps) {
  const gamepads = useGamepadSnapshot(active);
  const connectedCount = gamepads.length;

  return (
    <div className="config-gp-tester">
      <p className="config-gp-tester__lede">
        Player 1 = <strong>WASD + Space</strong>, Player 2 ={' '}
        <strong>arrows + Enter</strong>. Controller input is captured here only
        — use the keyboard to change tabs.
      </p>

      <div className="config-gp-tester__status" role="status">
        <span
          className={`config-gp-tester__count${connectedCount > 0 ? ' config-gp-tester__count--on' : ''}`}
        >
          {connectedCount} controller{connectedCount === 1 ? '' : 's'} detected
        </span>
      </div>

      <div className="config-gp-slots">
        {PLAYER_SLOTS.map(({ slot, title }) => (
          <GamepadSlotPanel
            key={slot}
            slot={slot}
            title={title}
            pad={padForSlot(gamepads, slot)}
          />
        ))}
      </div>
    </div>
  );
}
