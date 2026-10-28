import type { GamepadSnapshot } from './useGamepadSnapshot';
import { buttonIsActive } from './gamepadLabels';

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

function stickPos(x: number, y: number, cx: number, cy: number, radius = 7) {
  const clampedX = Math.max(-1, Math.min(1, x));
  const clampedY = Math.max(-1, Math.min(1, y));
  return {
    cx: cx + clampedX * radius,
    cy: cy - clampedY * radius,
    active: Math.hypot(clampedX, clampedY) > 0.12,
  };
}

/**
 * SN30 Pro shell: two circular grips joined by a short waist.
 * Left center (112, 130) r=70, right center (328, 130) r=70.
 */
const BODY_PATH = [
  'M 112 60',
  'A 70 70 0 1 0 151 188',
  'L 289 188',
  'A 70 70 0 1 0 328 60',
  'L 112 60',
  'Z',
].join(' ');

/** Point on a circle; angles in degrees, SVG y-down (270 = straight up). */
function polar(cx: number, cy: number, r: number, deg: number): string {
  const t = (deg * Math.PI) / 180;
  return `${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`;
}

/**
 * Left-side shoulder band that hugs the grip circle centred on (cx, cy):
 * an arc from `startDeg` up to the top of the grip, then straight to `endX`.
 * Corners are softened with radius `rc`. Mirror it for the right side.
 */
function shoulderBand(
  cx: number,
  cy: number,
  ri: number,
  ro: number,
  startDeg: number,
  endX: number,
  rc = 3
): string {
  const degO = ((rc / ro) * 180) / Math.PI;
  const degI = ((rc / ri) * 180) / Math.PI;
  const top = cy - ro;
  const bottom = cy - ri;
  return [
    `M ${polar(cx, cy, ro, startDeg + degO)}`,
    `A ${ro} ${ro} 0 0 1 ${cx} ${top}`,
    `L ${endX - rc} ${top}`,
    `Q ${endX} ${top} ${endX} ${top + rc}`,
    `L ${endX} ${bottom - rc}`,
    `Q ${endX} ${bottom} ${endX - rc} ${bottom}`,
    `L ${cx} ${bottom}`,
    `A ${ri} ${ri} 0 0 0 ${polar(cx, cy, ri, startDeg + degI)}`,
    `Q ${polar(cx, cy, ri, startDeg)} ${polar(cx, cy, ri + rc, startDeg)}`,
    `L ${polar(cx, cy, ro - rc, startDeg)}`,
    `Q ${polar(cx, cy, ro, startDeg)} ${polar(cx, cy, ro, startDeg + degO)}`,
    'Z',
  ].join(' ');
}

/** L1 sits on the shell outline. L2 sits on L1's outer edge. */
const L1_PATH = shoulderBand(112, 130, 70, 80, 220, 166);
const L2_PATH = shoulderBand(112, 130, 80, 89, 234, 154);
/** Mirror across the controller's centre line (x = 220). */
const MIRROR = 'translate(440 0) scale(-1 1)';

const L_STICK = { cx: 176, cy: 158 };
const R_STICK = { cx: 264, cy: 158 };

const FACE: Record<'x' | 'y' | 'a' | 'b', { cx: number; cy: number; index: number }> = {
  x: { cx: 324, cy: 88, index: 3 },
  y: { cx: 300, cy: 112, index: 2 },
  a: { cx: 348, cy: 112, index: 1 },
  b: { cx: 324, cy: 136, index: 0 },
};

export function GamepadDiagram({ pad }: GamepadDiagramProps) {
  const b = (i: number) => btn(pad, i);
  const lx = pad.axes[0] ?? 0;
  const ly = pad.axes[1] ?? 0;
  const rx = pad.axes[2] ?? 0;
  const ry = pad.axes[3] ?? 0;
  const leftStick = stickPos(lx, ly, L_STICK.cx, L_STICK.cy);
  const rightStick = stickPos(rx, ry, R_STICK.cx, R_STICK.cy);

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
      <path className="config-gp-diagram__body" d={BODY_PATH} />

      {/* L2 / R2 share an edge with L1 / R1, and L1 / R1 share the shell outline. */}
      <path className={shoulderClass(6)} d={L2_PATH} />
      <path className={shoulderClass(4)} d={L1_PATH} />
      <path className={shoulderClass(7)} d={L2_PATH} transform={MIRROR} />
      <path className={shoulderClass(5)} d={L1_PATH} transform={MIRROR} />

      <g className="config-gp-diagram__dpad" transform="translate(94 90)">
        <path
          className="config-gp-diagram__dpad-cross"
          d="M 16 4 Q 16 0 20 0 H 28 Q 32 0 32 4 V 16 H 44 Q 48 16 48 20 V 28 Q 48 32 44 32 H 32 V 44 Q 32 48 28 48 H 20 Q 16 48 16 44 V 32 H 4 Q 0 32 0 28 V 20 Q 0 16 4 16 H 16 Z"
        />
        <path
          className={dpadClass(12)}
          d="M 16 18 V 4 Q 16 0 20 0 H 28 Q 32 0 32 4 V 18 Z"
        />
        <path
          className={dpadClass(13)}
          d="M 16 30 V 44 Q 16 48 20 48 H 28 Q 32 48 32 44 V 30 Z"
        />
        <path
          className={dpadClass(14)}
          d="M 18 16 H 4 Q 0 16 0 20 V 28 Q 0 32 4 32 H 18 Z"
        />
        <path
          className={dpadClass(15)}
          d="M 30 16 H 44 Q 48 16 48 20 V 28 Q 48 32 44 32 H 30 Z"
        />
        <path
          className="config-gp-diagram__dpad-outline"
          d="M 16 4 Q 16 0 20 0 H 28 Q 32 0 32 4 V 16 H 44 Q 48 16 48 20 V 28 Q 48 32 44 32 H 32 V 44 Q 32 48 28 48 H 20 Q 16 48 16 44 V 32 H 4 Q 0 32 0 28 V 20 Q 0 16 4 16 H 16 Z"
        />
        <circle className="config-gp-diagram__dpad-hub" cx="24" cy="24" r="5.5" />
      </g>

      <rect className={metaClass(8)} x="188" y="100" width="28" height="12" rx="6" />
      <rect className={metaClass(9)} x="224" y="100" width="28" height="12" rx="6" />
      <text className="config-gp-diagram__meta-caption" x="202" y="124" textAnchor="middle">
        select
      </text>
      <text className="config-gp-diagram__meta-caption" x="238" y="124" textAnchor="middle">
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
        const face = FACE[key];
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

      <g className={b(10).active ? 'config-gp-diagram__stick config-gp-diagram__stick--active' : 'config-gp-diagram__stick'}>
        <circle className="config-gp-diagram__stick-well" cx={L_STICK.cx} cy={L_STICK.cy} r="22" />
        <circle
          className="config-gp-diagram__stick-cap"
          cx={L_STICK.cx}
          cy={L_STICK.cy}
          r="16"
        />
        <circle
          className={`config-gp-diagram__stick-dot${leftStick.active ? ' config-gp-diagram__stick-dot--active' : ''}`}
          cx={leftStick.cx}
          cy={leftStick.cy}
          r="2.4"
        />
      </g>
      <g className={b(11).active ? 'config-gp-diagram__stick config-gp-diagram__stick--active' : 'config-gp-diagram__stick'}>
        <circle className="config-gp-diagram__stick-well" cx={R_STICK.cx} cy={R_STICK.cy} r="22" />
        <circle
          className="config-gp-diagram__stick-cap"
          cx={R_STICK.cx}
          cy={R_STICK.cy}
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
      <text className="config-gp-diagram__star-icon" x="128" y="179" textAnchor="middle">
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
