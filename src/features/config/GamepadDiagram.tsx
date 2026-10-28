import type { GamepadSnapshot } from './useGamepadSnapshot';
import { buttonIsActive } from './gamepadLabels';
import {
  GAMEPAD_BODY_PATH,
  GAMEPAD_DPAD_DOWN,
  GAMEPAD_DPAD_LEFT,
  GAMEPAD_DPAD_ORIGIN,
  GAMEPAD_DPAD_OUTLINE,
  GAMEPAD_DPAD_RIGHT,
  GAMEPAD_DPAD_UP,
  GAMEPAD_FACE,
  GAMEPAD_L1_PATH,
  GAMEPAD_L2_PATH,
  GAMEPAD_L_STICK,
  GAMEPAD_MIRROR,
  GAMEPAD_R_STICK,
  gamepadStickDot,
} from './gamepadDiagramGeometry';

type GamepadDiagramProps = {
  pad: GamepadSnapshot;
};

function btn(
  pad: GamepadSnapshot,
  index: number
): { active: boolean; value: number } {
  const b = pad.buttons[index];
  if (!b) return { active: false, value: 0 };
  return { active: buttonIsActive(b.value, b.pressed), value: b.value };
}

export function GamepadDiagram({ pad }: GamepadDiagramProps) {
  const b = (i: number) => btn(pad, i);
  const lx = pad.axes[0] ?? 0;
  const ly = pad.axes[1] ?? 0;
  const rx = pad.axes[2] ?? 0;
  const ry = pad.axes[3] ?? 0;
  const leftStick = gamepadStickDot(
    lx,
    ly,
    GAMEPAD_L_STICK.cx,
    GAMEPAD_L_STICK.cy
  );
  const rightStick = gamepadStickDot(
    rx,
    ry,
    GAMEPAD_R_STICK.cx,
    GAMEPAD_R_STICK.cy
  );

  const dpadClass = (i: number) =>
    `config-gp-diagram__dpad-arm${b(i).active ? ' config-gp-diagram__dpad-arm--active' : ''}`;

  const shoulderClass = (i: number) =>
    `config-gp-diagram__shoulder${b(i).active ? ' config-gp-diagram__shoulder--active' : ''}`;

  const metaClass = (i: number) =>
    `config-gp-diagram__meta${b(i).active ? ' config-gp-diagram__meta--active' : ''}`;

  return (
    <svg
      className="config-gp-diagram"
      viewBox="0 0 440 230"
      aria-label="Controller diagram"
    >
      <path className="config-gp-diagram__body" d={GAMEPAD_BODY_PATH} />

      {/* L2 / R2 share an edge with L1 / R1, and L1 / R1 share the shell outline. */}
      <path className={shoulderClass(6)} d={GAMEPAD_L2_PATH} />
      <path className={shoulderClass(4)} d={GAMEPAD_L1_PATH} />
      <path
        className={shoulderClass(7)}
        d={GAMEPAD_L2_PATH}
        transform={GAMEPAD_MIRROR}
      />
      <path
        className={shoulderClass(5)}
        d={GAMEPAD_L1_PATH}
        transform={GAMEPAD_MIRROR}
      />

      <g
        className="config-gp-diagram__dpad"
        transform={`translate(${GAMEPAD_DPAD_ORIGIN.x} ${GAMEPAD_DPAD_ORIGIN.y})`}
      >
        <path
          className="config-gp-diagram__dpad-cross"
          d={GAMEPAD_DPAD_OUTLINE}
        />
        <path className={dpadClass(12)} d={GAMEPAD_DPAD_UP} />
        <path className={dpadClass(13)} d={GAMEPAD_DPAD_DOWN} />
        <path className={dpadClass(14)} d={GAMEPAD_DPAD_LEFT} />
        <path className={dpadClass(15)} d={GAMEPAD_DPAD_RIGHT} />
        <path
          className="config-gp-diagram__dpad-outline"
          d={GAMEPAD_DPAD_OUTLINE}
        />
        <circle
          className="config-gp-diagram__dpad-hub"
          cx="24"
          cy="24"
          r="5.5"
        />
      </g>

      <rect
        className={metaClass(8)}
        x="188"
        y="100"
        width="28"
        height="12"
        rx="6"
      />
      <rect
        className={metaClass(9)}
        x="224"
        y="100"
        width="28"
        height="12"
        rx="6"
      />
      <text
        className="config-gp-diagram__meta-caption"
        x="202"
        y="124"
        textAnchor="middle"
      >
        select
      </text>
      <text
        className="config-gp-diagram__meta-caption"
        x="238"
        y="124"
        textAnchor="middle"
      >
        start
      </text>

      {(
        [
          ['x', 'X'],
          ['y', 'Y'],
          ['a', 'A'],
          ['b', 'B'],
        ] as const
      ).map(([key, label]) => {
        const face = GAMEPAD_FACE[key];
        const active = b(face.index).active;
        return (
          <g key={key}>
            <circle
              className={`config-gp-diagram__face-btn${active ? ' config-gp-diagram__face-btn--active' : ''}`}
              cx={face.cx}
              cy={face.cy}
              r="12"
            />
            <text
              className={`config-gp-diagram__face-label${active ? ' config-gp-diagram__face-label--active' : ''}`}
              x={face.cx}
              y={face.cy + 4}
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        );
      })}

      <g
        className={
          b(10).active
            ? 'config-gp-diagram__stick config-gp-diagram__stick--active'
            : 'config-gp-diagram__stick'
        }
      >
        <circle
          className="config-gp-diagram__stick-well"
          cx={GAMEPAD_L_STICK.cx}
          cy={GAMEPAD_L_STICK.cy}
          r="22"
        />
        <circle
          className="config-gp-diagram__stick-cap"
          cx={GAMEPAD_L_STICK.cx}
          cy={GAMEPAD_L_STICK.cy}
          r="16"
        />
        <circle
          className={`config-gp-diagram__stick-dot${leftStick.active ? ' config-gp-diagram__stick-dot--active' : ''}`}
          cx={leftStick.cx}
          cy={leftStick.cy}
          r="2.4"
        />
      </g>
      <g
        className={
          b(11).active
            ? 'config-gp-diagram__stick config-gp-diagram__stick--active'
            : 'config-gp-diagram__stick'
        }
      >
        <circle
          className="config-gp-diagram__stick-well"
          cx={GAMEPAD_R_STICK.cx}
          cy={GAMEPAD_R_STICK.cy}
          r="22"
        />
        <circle
          className="config-gp-diagram__stick-cap"
          cx={GAMEPAD_R_STICK.cx}
          cy={GAMEPAD_R_STICK.cy}
          r="16"
        />
        <circle
          className={`config-gp-diagram__stick-dot${rightStick.active ? ' config-gp-diagram__stick-dot--active' : ''}`}
          cx={rightStick.cx}
          cy={rightStick.cy}
          r="2.4"
        />
      </g>

      <circle className="config-gp-diagram__star" cx="128" cy="176" r="7" />
      <text
        className="config-gp-diagram__star-icon"
        x="128"
        y="179"
        textAnchor="middle"
      >
        ★
      </text>
      <circle
        className={`config-gp-diagram__home${b(16).active ? ' config-gp-diagram__home--active' : ''}`}
        cx="312"
        cy="176"
        r="7"
      />

      <title>
        {`L stick ${lx.toFixed(2)}, ${ly.toFixed(2)} · R stick ${rx.toFixed(2)}, ${ry.toFixed(2)}`}
      </title>
    </svg>
  );
}
