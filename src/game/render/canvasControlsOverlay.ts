import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { pixiTextResolution } from '@/game/render/pixiTextResolution';
import type { GameState, GridPos } from '@/game/engine/types';
import {
  confirmKeyLabel,
  PLAYER_SLOT_INDEX,
  readKeyboardLayoutId,
  slotBindingLabels,
  type PlayerControlSlot,
} from '@/lib/controls/playerControls';
import {
  preStartControllerBobPx,
  type GameSeatIndex,
} from '@/game/controllerTest';
import {
  GAMEPAD_SHELL,
  GAMEPAD_VIEW,
} from '@/features/config/gamepadDiagramGeometry';
import {
  paintMatchGamepadCanvas,
  paintMatchGamepadPixi,
} from '@/game/render/matchGamepadPaint';
import {
  connectedPreMatchPadIndices,
  matchFaceFontPx,
  matchFaceOffset,
  matchPadActivity,
  preMatchGamepadIndex,
  readMatchPad,
  type MatchPadReading,
} from '@/game/render/preMatchGamepad';
import {
  isPreMatchKeyHeld,
  preMatchKeyCapScale,
  type PreMatchKeyDir,
} from '@/game/render/preMatchKeyHighlight';
import { isGraphicsFlat } from '@/lib/graphicsSettings';

const FADE_DELAY_MS = 1000;
const FADE_DURATION_MS = 420;
const KEY_FONT = 'Inter, system-ui, sans-serif';

type PreMatchKeyCapLayout = {
  keyPx: number;
  fontPx: number;
  gap: number;
};

function preMatchKeyCapLayout(
  width: number,
  height: number
): PreMatchKeyCapLayout {
  const compact = width < 560 || height < 260;
  const keyPx = compact
    ? Math.max(14, width * 0.029)
    : Math.max(17, width * 0.027);
  const legacyCap = compact
    ? Math.max(12, width * 0.024)
    : Math.max(14, width * 0.021);
  return {
    keyPx,
    fontPx: Math.max(9, legacyCap * 0.44),
    gap: Math.max(5, keyPx * 0.2),
  };
}

function keyCapCornerRadius(keyPx: number): number {
  return Math.max(2, keyPx * 0.1);
}

/** Confirm labels longer than two characters (Space, Enter) span the three keys above. */
function confirmKeyCapWidth(keyPx: number, gap: number, wide: boolean): number {
  return wide ? keyPx * 3 + gap * 2 : keyPx;
}

function formatKeyCapLabel(label: string, dir: PreMatchKeyDir): string {
  return dir === 'confirm' ? label.toUpperCase() : label;
}

type KeyCap = {
  root: Container;
  border: Graphics;
  label: Text;
  dir: PreMatchKeyDir;
};

type SlotPad = {
  root: Container;
  slot: PlayerControlSlot;
  caps: KeyCap[];
  gamepad: Graphics;
  gamepadLabels: Text[];
};

function snakeHeadForSlot(state: GameState, slot: PlayerControlSlot): GridPos {
  switch (slot) {
    case 'p1':
      return state.p1.head;
    case 'p2':
      return state.p2.head;
    case 'p3':
      return state.extraSnakes[0]?.snake.head ?? [4, 20];
    case 'p4':
      return state.extraSnakes[1]?.snake.head ?? [46, 20];
  }
}

function snakeBodyForSlot(
  state: GameState,
  slot: PlayerControlSlot
): GridPos | null {
  switch (slot) {
    case 'p1':
      return state.p1.body[0] ?? null;
    case 'p2':
      return state.p2.body[0] ?? null;
    case 'p3':
      return state.extraSnakes[0]?.snake.body[0] ?? null;
    case 'p4':
      return state.extraSnakes[1]?.snake.body[0] ?? null;
  }
}

type DpadSpec = {
  dir: PreMatchKeyDir;
  label: string;
  x: number;
  y: number;
  wide?: boolean;
};

function padExtents(
  keyPx: number,
  gap: number
): {
  aboveAnchor: number;
  belowAnchor: number;
} {
  const step = keyPx + gap;
  const reach = step + keyPx / 2;
  return {
    aboveAnchor: reach,
    belowAnchor: reach,
  };
}

function buildDpadSpecs(
  labels: ReturnType<typeof slotBindingLabels>,
  confirm: string,
  keyPx: number,
  gap: number
): DpadSpec[] {
  const step = keyPx + gap;
  return [
    { dir: 'up', label: labels.up, x: 0, y: -step },
    { dir: 'left', label: labels.left, x: -step, y: 0 },
    { dir: 'down', label: labels.down, x: 0, y: 0 },
    { dir: 'right', label: labels.right, x: step, y: 0 },
    {
      dir: 'confirm',
      label: confirm,
      x: 0,
      y: step,
      wide: confirm.length > 2,
    },
  ];
}

function computePadAnchor(
  state: GameState,
  slot: PlayerControlSlot,
  width: number,
  height: number,
  layout: PreMatchKeyCapLayout
): { x: number; y: number } {
  const { keyPx, gap } = layout;
  const head = snakeHeadForSlot(state, slot);
  const body = snakeBodyForSlot(state, slot);
  const colSize = width / state.cols;
  const rowSize = height / state.rows;
  const step = keyPx + gap;
  const padH = keyPx * 3.2 + gap * 2.4;
  const { aboveAnchor, belowAnchor } = padExtents(keyPx, gap);

  const headCx = (head[0] + 0.5) * colSize;
  const bodyCx = body ? (body[0] + 0.5) * colSize : headCx;
  const x = (headCx + bodyCx) / 2;

  const headCy = (head[1] + 0.5) * rowSize;
  const bodyCy = body ? (body[1] + 0.5) * rowSize : headCy;
  const bob = preStartControllerBobPx(
    state,
    PLAYER_SLOT_INDEX[slot] as GameSeatIndex,
    rowSize
  );
  const topY = Math.min(headCy, bodyCy) - rowSize * 0.5 + bob;
  const bottomY = Math.max(headCy, bodyCy) + rowSize * 0.5 + bob;
  const stepY = step;
  const chainGap = rowSize * 1.9 - keyPx / 2;
  const avgRow = (head[1] + (body?.[1] ?? head[1])) / 2;
  const placeAbove = avgRow >= state.rows * 0.5;

  let y: number;
  if (placeAbove) {
    y = topY - chainGap - belowAnchor;
  } else {
    y = bottomY + chainGap + stepY + keyPx / 2;
  }

  const margin = padH * 0.55 + 4;
  return {
    x: Math.max(margin, Math.min(width - margin, x)),
    y: Math.min(
      height - margin - belowAnchor,
      Math.max(margin + aboveAnchor, y)
    ),
  };
}

function computeGamepadAnchor(
  state: GameState,
  slot: PlayerControlSlot,
  width: number,
  height: number
): { x: number; y: number; scale: number } {
  const capLayout = preMatchKeyCapLayout(width, height);
  const keyAnchor = computePadAnchor(state, slot, width, height, capLayout);
  const { keyPx, gap } = capLayout;
  const { aboveAnchor } = padExtents(keyPx, gap);
  const shellW = GAMEPAD_SHELL.right - GAMEPAD_SHELL.left;
  const scale = (aboveAnchor * 2 + keyPx + gap) / shellW;
  const keyboardTop = keyAnchor.y - aboveAnchor;
  return {
    x: keyAnchor.x,
    y: keyboardTop + (GAMEPAD_VIEW.cy - GAMEPAD_SHELL.top) * scale,
    scale,
  };
}

export class CanvasControlsOverlay {
  readonly container = new Container();

  private pads: SlotPad[] = [];
  private layoutKey = '';
  private keyPx = 16;
  private keyGap = 4;

  constructor() {
    for (let i = 0; i < 4; i += 1) {
      const root = new Container();
      const caps: KeyCap[] = [];
      const dirs: PreMatchKeyDir[] = ['up', 'left', 'down', 'right', 'confirm'];
      for (const dir of dirs) {
        const capRoot = new Container();
        const border = new Graphics();
        const label = new Text({ text: '', style: new TextStyle() });
        label.anchor.set(0.5);
        label.resolution = pixiTextResolution();
        capRoot.addChild(border);
        capRoot.addChild(label);
        root.addChild(capRoot);
        caps.push({ root: capRoot, border, label, dir });
      }
      const gamepad = new Graphics();
      gamepad.visible = false;
      root.addChild(gamepad);
      const gamepadLabels: Text[] = [];
      for (const letter of ['B', 'A', 'X']) {
        const face = new Text({
          text: letter,
          style: new TextStyle({
            fontFamily: KEY_FONT,
            fill: '#ffffff',
            fontSize: 11,
            fontWeight: '700',
            align: 'center',
          }),
        });
        face.anchor.set(0.5);
        face.resolution = pixiTextResolution();
        face.visible = false;
        root.addChild(face);
        gamepadLabels.push(face);
      }
      this.container.addChild(root);
      this.pads.push({ root, slot: 'p1', caps, gamepad, gamepadLabels });
    }
    this.container.visible = false;
    this.container.alpha = 0;
  }

  hide(): void {
    this.container.visible = false;
    this.container.alpha = 0;
    this.layoutKey = '';
    for (const pad of this.pads) {
      pad.root.visible = false;
    }
  }

  setAlpha(alpha: number): void {
    this.container.visible = alpha > 0.02;
    this.container.alpha = alpha;
  }

  render(
    state: GameState,
    width: number,
    height: number,
    slots: readonly PlayerControlSlot[],
    startRevealTime: number,
    labelSlots?: readonly PlayerControlSlot[]
  ): void {
    if (slots.length === 0) {
      this.hide();
      return;
    }

    const layout = readKeyboardLayoutId();
    const headsKey = slots
      .map((slot) => {
        const head = snakeHeadForSlot(state, slot);
        return `${slot}:${head[0]},${head[1]}`;
      })
      .join('|');
    const bindingsKey = slots
      .map((slot, i) => {
        const labelSlot = labelSlots?.[i] ?? slot;
        const labels = slotBindingLabels(labelSlot, layout);
        const confirm = confirmKeyLabel(labelSlot, layout);
        return `${labelSlot}:${labels.up}${labels.down}${labels.left}${labels.right}${confirm}`;
      })
      .join('|');
    const connected = connectedPreMatchPadIndices();
    const modes = slots.map((slot) =>
      preMatchGamepadIndex(slot, slots, connected)
    );
    const token = `${width}x${height}:${state.cols}x${state.rows}:${headsKey}:${bindingsKey}:${modes.join(',')}`;
    if (token !== this.layoutKey) {
      this.layoutKey = token;
      this.applyLayout(state, width, height, slots, layout, labelSlots, modes);
    }

    const now = performance.now();
    for (let i = 0; i < this.pads.length; i += 1) {
      const pad = this.pads[i];
      const slot = slots[i];
      if (!slot) continue;
      const reading =
        modes[i] === null || modes[i] === undefined
          ? null
          : readMatchPad(modes[i]!);
      if (reading) {
        this.showGamepad(pad, reading);
        continue;
      }
      this.showKeys(pad, slot, now);
    }

    const elapsed =
      startRevealTime === -1
        ? 0
        : Math.max(0, performance.now() - startRevealTime - FADE_DELAY_MS);
    const t = Math.min(1, elapsed / FADE_DURATION_MS);
    const eased = 1 - Math.pow(1 - t, 3);

    this.container.visible = eased > 0.02;
    this.container.alpha = eased;
  }

  private applyLayout(
    state: GameState,
    width: number,
    height: number,
    slots: readonly PlayerControlSlot[],
    layout: ReturnType<typeof readKeyboardLayoutId>,
    labelSlots: readonly PlayerControlSlot[] | undefined,
    modes: readonly (number | null)[]
  ): void {
    const capLayout = preMatchKeyCapLayout(width, height);
    const { keyPx, fontPx, gap } = capLayout;
    this.keyPx = keyPx;
    this.keyGap = gap;

    for (let i = 0; i < this.pads.length; i += 1) {
      const pad = this.pads[i];
      const slot = slots[i];
      if (!slot) {
        pad.root.visible = false;
        continue;
      }
      pad.slot = slot;
      pad.root.visible = true;

      if (modes[i] != null) {
        const { x, y, scale } = computeGamepadAnchor(
          state,
          slot,
          width,
          height
        );
        pad.root.position.set(x, y);
        pad.gamepad.scale.set(scale);
        pad.gamepad.position.set(
          -GAMEPAD_VIEW.cx * scale,
          -GAMEPAD_VIEW.cy * scale
        );
        continue;
      }

      const labelSlot = labelSlots?.[i] ?? slot;
      const labels = slotBindingLabels(labelSlot, layout);
      const confirm = confirmKeyLabel(labelSlot, layout);
      const { x: anchorX, y: anchorY } = computePadAnchor(
        state,
        slot,
        width,
        height,
        capLayout
      );

      const dpad = buildDpadSpecs(labels, confirm, keyPx, gap);

      pad.root.position.set(anchorX, anchorY);

      const textStyle = new TextStyle({
        fontFamily: KEY_FONT,
        fill: '#f4f4f4',
        fontSize: fontPx,
        fontWeight: '600',
        align: 'center',
      });

      for (let c = 0; c < pad.caps.length; c += 1) {
        const cap = pad.caps[c];
        const spec = dpad[c];
        cap.dir = spec.dir;
        cap.label.style = textStyle;
        cap.label.text = formatKeyCapLabel(spec.label, spec.dir);
        cap.root.position.set(spec.x, spec.y);
        this.paintCap(cap, slot);
      }
    }
  }

  private showKeys(pad: SlotPad, slot: PlayerControlSlot, now: number): void {
    pad.gamepad.visible = false;
    for (const label of pad.gamepadLabels) label.visible = false;
    for (const cap of pad.caps) {
      cap.root.visible = true;
      const scale = preMatchKeyCapScale(slot, cap.dir, now);
      cap.root.scale.set(scale);
      this.paintCap(cap, slot);
    }
  }

  private showGamepad(pad: SlotPad, reading: MatchPadReading): void {
    for (const cap of pad.caps) cap.root.visible = false;
    const scale = pad.gamepad.scale.x || 1;
    pad.gamepad.visible = true;
    paintMatchGamepadPixi(pad.gamepad, reading, scale);
    const activity = matchPadActivity(reading);
    const fontPx = matchFaceFontPx(scale);
    for (let i = 0; i < pad.gamepadLabels.length; i += 1) {
      const face = activity.faces[i];
      const label = pad.gamepadLabels[i];
      if (!face || !label) continue;
      label.visible = true;
      label.text = face.label;
      const offset = matchFaceOffset(face, scale);
      label.position.set(offset.x, offset.y);
      label.style.fontSize = fontPx;
      label.style.fill = '#ffffff';
      label.alpha = face.active ? 0.9 : 0.72;
    }
  }

  private paintCap(cap: KeyCap, slot: PlayerControlSlot): void {
    const keyPx = this.keyPx;
    const wide = cap.dir === 'confirm' && cap.label.text.length > 2;
    const capW = confirmKeyCapWidth(keyPx, this.keyGap, wide);
    const capH = keyPx;
    const active = isPreMatchKeyHeld(slot, cap.dir);
    const flat = isGraphicsFlat();
    const borderAlpha = active ? (flat ? 1 : 0.48) : 0.42;
    const borderWidth = active ? (flat ? 2 : 1.2) : 1;
    const labelColor = active
      ? flat
        ? '#111111'
        : 'rgba(255,255,255,0.55)'
      : '#e8e8e8';

    const cornerR = keyCapCornerRadius(keyPx);

    cap.border.clear();
    if (active) {
      cap.border
        .roundRect(-capW / 2, -capH / 2, capW, capH, cornerR)
        .fill({ color: 0xffffff, alpha: flat ? 1 : 0.05 });
    }
    cap.border
      .roundRect(-capW / 2, -capH / 2, capW, capH, cornerR)
      .stroke({ width: borderWidth, color: 0xffffff, alpha: borderAlpha });

    cap.label.style.fill = labelColor;
  }
}

export function drawCanvasControlsFallback(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number,
  slots: readonly PlayerControlSlot[],
  alpha: number,
  labelSlots?: readonly PlayerControlSlot[]
): void {
  if (alpha < 0.02 || slots.length === 0) return;

  const layout = readKeyboardLayoutId();
  const capLayout = preMatchKeyCapLayout(width, height);
  const { keyPx, fontPx, gap } = capLayout;
  const now = performance.now();
  const cornerR = keyCapCornerRadius(keyPx);

  const connected = connectedPreMatchPadIndices();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;

  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i]!;
    const padIndex = preMatchGamepadIndex(slot, slots, connected);
    const reading = padIndex === null ? null : readMatchPad(padIndex);
    if (reading) {
      const { x, y, scale } = computeGamepadAnchor(state, slot, width, height);
      paintMatchGamepadCanvas(ctx, reading, x, y, scale);
      const activity = matchPadActivity(reading);
      ctx.font = `700 ${matchFaceFontPx(scale)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const face of activity.faces) {
        const offset = matchFaceOffset(face, scale);
        ctx.fillStyle = face.active
          ? 'rgba(255,255,255,0.9)'
          : 'rgba(255,255,255,0.72)';
        ctx.fillText(face.label, x + offset.x, y + offset.y);
      }
      continue;
    }

    const labelSlot = labelSlots?.[i] ?? slot;
    const labels = slotBindingLabels(labelSlot, layout);
    const confirm = confirmKeyLabel(labelSlot, layout);
    const { x: anchorX, y: anchorY } = computePadAnchor(
      state,
      slot,
      width,
      height,
      capLayout
    );

    const dpad = buildDpadSpecs(labels, confirm, keyPx, gap);
    ctx.font = `600 ${Math.floor(fontPx)}px Inter, system-ui, sans-serif`;

    for (const spec of dpad) {
      const scale = preMatchKeyCapScale(slot, spec.dir, now);
      const capW = confirmKeyCapWidth(keyPx, gap, Boolean(spec.wide)) * scale;
      const capH = keyPx * scale;
      const x = anchorX + spec.x;
      const y = anchorY + spec.y;
      const active = isPreMatchKeyHeld(slot, spec.dir);
      const flat = isGraphicsFlat();
      ctx.strokeStyle = active
        ? flat
          ? '#ffffff'
          : 'rgba(255,255,255,0.48)'
        : 'rgba(255,255,255,0.42)';
      ctx.lineWidth = active ? (flat ? 2 : 1.2) : 1;
      if (active) {
        ctx.fillStyle = flat ? '#ffffff' : 'rgba(255,255,255,0.05)';
        fillRoundedRect(
          ctx,
          x - capW / 2,
          y - capH / 2,
          capW,
          capH,
          cornerR * scale
        );
        ctx.fill();
      }
      strokeRoundedRect(
        ctx,
        x - capW / 2,
        y - capH / 2,
        capW,
        capH,
        cornerR * scale
      );
      ctx.stroke();
      ctx.fillStyle = active
        ? flat
          ? '#111111'
          : 'rgba(255,255,255,0.55)'
        : '#e8e8e8';
      ctx.fillText(formatKeyCapLabel(spec.label, spec.dir), x, y);
    }
  }

  ctx.restore();
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  strokeRoundedRect(ctx, x, y, w, h, r);
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
