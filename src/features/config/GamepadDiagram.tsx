import { useId } from 'react';
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

function stickPos(x: number, y: number, cx: number, cy: number, radius = 10) {
  const clampedX = Math.max(-1, Math.min(1, x));
  const clampedY = Math.max(-1, Math.min(1, y));
  return {
    cx: cx + clampedX * radius,
    cy: cy - clampedY * radius,
    active: Math.hypot(clampedX, clampedY) > 0.12,
  };
}

function FaceButton({
  cx,
  cy,
  label,
  active,
  idleFill,
  activeFill,
  glowFilter,
}: {
  cx: number;
  cy: number;
  label: string;
  active: boolean;
  idleFill: string;
  activeFill: string;
  glowFilter: string;
}) {
  return (
    <g className="config-gp-diagram__face-group">
      <circle
        className={`config-gp-diagram__face-btn${active ? ' config-gp-diagram__face-btn--active' : ''}`}
        cx={cx}
        cy={cy}
        r="10"
        fill={active ? activeFill : idleFill}
        filter={active ? glowFilter : undefined}
      />
      <text
        className={`config-gp-diagram__face-label${active ? ' config-gp-diagram__face-label--active' : ''}`}
        x={cx}
        y={cy + 3.5}
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}

/**
 * SN30 Pro silhouette — bulbous grips, pinched center waist top + bottom.
 * viewBox 400 × 220
 */
const BODY_PATH = [
  'M 200 52',
  'C 168 56 136 62 104 64',
  'C 52 64 16 92 16 118',
  'C 16 144 44 176 88 176',
  'C 116 176 138 164 154 156',
  'C 170 164 186 170 200 170',
  'C 214 170 230 164 246 156',
  'C 262 164 284 176 312 176',
  'C 356 176 384 144 384 118',
  'C 384 92 348 64 296 64',
  'C 264 62 232 56 200 52',
  'Z',
].join(' ');

const BODY_RIM_PATH = [
  'M 200 58',
  'C 172 62 144 66 116 68',
  'C 68 68 36 92 36 114',
  'C 36 136 58 162 92 162',
  'C 114 162 132 154 146 146',
  'C 162 154 178 158 200 158',
  'C 222 158 238 154 254 146',
  'C 268 162 286 162 308 162',
  'C 342 162 364 136 364 114',
  'C 364 92 332 68 284 68',
  'C 256 66 228 62 200 58',
  'Z',
].join(' ');

const L_STICK = { cx: 172, cy: 140 };
const R_STICK = { cx: 228, cy: 140 };

export function GamepadDiagram({ pad }: GamepadDiagramProps) {
  const uid = useId().replace(/:/g, '');
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

  const faceIdle = `url(#${uid}-face-idle)`;
  const faceActive = `url(#${uid}-face-active)`;
  const glowFilter = `url(#${uid}-glow)`;

  return (
    <svg
      className="config-gp-diagram"
      viewBox="0 0 400 220"
      aria-label="Controller diagram"
    >
      <defs>
        <linearGradient id={`${uid}-body-top`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(54 54 58)" />
          <stop offset="100%" stopColor="rgb(22 22 26)" />
        </linearGradient>
        <linearGradient id={`${uid}-body-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(255 255 255 / 0.16)" />
          <stop offset="100%" stopColor="rgb(255 255 255 / 0.02)" />
        </linearGradient>
        <radialGradient id={`${uid}-face-idle`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="rgb(200 60 130)" />
          <stop offset="100%" stopColor="rgb(120 28 78)" />
        </radialGradient>
        <radialGradient id={`${uid}-face-active`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="rgb(255 120 190)" />
          <stop offset="100%" stopColor="rgb(220 50 140)" />
        </radialGradient>
        <radialGradient id={`${uid}-stick-cap`} cx="38%" cy="32%" r="68%">
          <stop offset="0%" stopColor="rgb(118 118 126)" />
          <stop offset="100%" stopColor="rgb(48 48 54)" />
        </radialGradient>
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse
        className="config-gp-diagram__shadow"
        cx="200"
        cy="196"
        rx="138"
        ry="8"
      />

      <path
        className="config-gp-diagram__body"
        fill={`url(#${uid}-body-top)`}
        d={BODY_PATH}
      />
      <path
        className="config-gp-diagram__body-rim"
        fill={`url(#${uid}-body-rim)`}
        d={BODY_RIM_PATH}
      />

      {/* Shoulders — molded into grip tops */}
      <path
        className={shoulderClass(6)}
        d="M 42 50 C 42 42 58 38 82 38 C 98 38 106 44 106 50 L 106 56 C 106 60 42 60 42 56 Z"
      />
      <path
        className={shoulderClass(4)}
        d="M 46 56 C 46 52 60 48 80 48 L 100 48 C 106 50 106 54 106 58 L 106 64 C 106 66 46 66 46 62 Z"
      />
      <path
        className={shoulderClass(7)}
        d="M 358 50 C 358 42 342 38 318 38 C 302 38 294 44 294 50 L 294 56 C 294 60 358 60 358 56 Z"
      />
      <path
        className={shoulderClass(5)}
        d="M 354 56 C 354 52 340 48 320 48 L 300 48 C 294 50 294 54 294 58 L 294 64 C 294 66 354 66 354 62 Z"
      />

      <rect className={metaClass(8)} x="178" y="88" width="20" height="8" rx="4" />
      <rect className={metaClass(9)} x="202" y="88" width="20" height="8" rx="4" />
      <text className="config-gp-diagram__meta-caption" x="188" y="106" textAnchor="middle">
        select
      </text>
      <text className="config-gp-diagram__meta-caption" x="212" y="106" textAnchor="middle">
        start
      </text>

      <g className="config-gp-diagram__dpad" transform="translate(52 108)">
        <rect className={dpadClass(12)} x="12" y="0" width="11" height="13" rx="1.5" />
        <rect className={dpadClass(13)} x="12" y="24" width="11" height="13" rx="1.5" />
        <rect className={dpadClass(14)} x="0" y="12" width="13" height="11" rx="1.5" />
        <rect className={dpadClass(15)} x="23" y="12" width="13" height="11" rx="1.5" />
        <circle className="config-gp-diagram__dpad-hub" cx="17.5" cy="18.5" r="5" />
      </g>

      <circle className="config-gp-diagram__star" cx="96" cy="154" r="5.5" />
      <text className="config-gp-diagram__star-icon" x="96" y="157" textAnchor="middle">
        ★
      </text>

      <FaceButton
        cx={308}
        cy={96}
        label="Y"
        active={b(3).active}
        idleFill={faceIdle}
        activeFill={faceActive}
        glowFilter={glowFilter}
      />
      <FaceButton
        cx={286}
        cy={116}
        label="X"
        active={b(2).active}
        idleFill={faceIdle}
        activeFill={faceActive}
        glowFilter={glowFilter}
      />
      <FaceButton
        cx={330}
        cy={116}
        label="A"
        active={b(0).active}
        idleFill={faceIdle}
        activeFill={faceActive}
        glowFilter={glowFilter}
      />
      <FaceButton
        cx={308}
        cy={136}
        label="B"
        active={b(1).active}
        idleFill={faceIdle}
        activeFill={faceActive}
        glowFilter={glowFilter}
      />

      <circle
        className={`config-gp-diagram__home${b(16).active ? ' config-gp-diagram__home--active' : ''}`}
        cx="342"
        cy="78"
        r="5.5"
        filter={b(16).active ? glowFilter : undefined}
      />

      {(
        [
          { stick: leftStick, ...L_STICK },
          { stick: rightStick, ...R_STICK },
        ] as const
      ).map(({ stick, cx, cy }, i) => (
        <g key={i} className="config-gp-diagram__stick">
          <circle className="config-gp-diagram__stick-well" cx={cx} cy={cy} r="20" />
          <circle className="config-gp-diagram__stick-groove" cx={cx} cy={cy} r="17" />
          <circle
            className="config-gp-diagram__stick-cap"
            cx={cx}
            cy={cy}
            r="13"
            fill={`url(#${uid}-stick-cap)`}
          />
          <circle
            className={`config-gp-diagram__stick-dot${stick.active ? ' config-gp-diagram__stick-dot--active' : ''}`}
            cx={stick.cx}
            cy={stick.cy}
            r="4.5"
            filter={stick.active ? glowFilter : undefined}
          />
        </g>
      ))}

      <title>
        {`L stick ${lx.toFixed(2)}, ${ly.toFixed(2)} · R stick ${rx.toFixed(2)}, ${ry.toFixed(2)}`}
      </title>
    </svg>
  );
}
