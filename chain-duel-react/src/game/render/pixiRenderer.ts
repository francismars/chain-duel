import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameState, GridPos } from '@/game/engine/types';
import { POWERUP_COLORS, BOUNTY_COINBASE_COLOR, BOUNTY_COINBASE_RINGS, POWERUP_FORK_DURATION_TICKS, POWERUP_FORK_FADE_START_TICKS, POWERUP_FORK_BURST_TICKS } from '@/game/engine/constants';

/** Color palette for teleport portal pairs (4 distinct hues). */
const PORTAL_COLORS: readonly number[] = [
  0x00DDFF,  // cyan
  0xFF22CC,  // magenta
  0x55FF44,  // lime
  0xFFAA00,  // amber
] as const;

export class PixiGameRenderer {
  private app: Application | null = null;
  private fallbackCanvas: HTMLCanvasElement | null = null;
  private fallbackCtx: CanvasRenderingContext2D | null = null;
  private host: HTMLElement | null = null;
  private root: Container = new Container();
  private deadZone: Graphics = new Graphics();
  private grid: Graphics = new Graphics();
  private scene: Graphics = new Graphics();
  private resolveBlocks: Graphics = new Graphics();
  private powerUpLabels: Container = new Container();
  private overlay: Container = new Container();
  private resolveAnimStartMs: number | null = null;
  // Coinbase capture pulse tracking
  private prevScoreP1 = -1;
  private prevScoreP2 = -1;
  private p1Pulses: number[] = [];
  private p2Pulses: number[] = [];
  private static readonly PULSE_DURATION_MS = 650;
  // SURGE fading-square trail
  private p1SurgeTrail: { pos: GridPos; time: number }[] = [];
  private p2SurgeTrail: { pos: GridPos; time: number }[] = [];
  private static readonly SURGE_TRAIL_FADE_MS = 480;
  private startText: Text;
  private endWinnerText: Text;
  private endContinueText: Text;
  private countdown3: Text;
  private countdown2: Text;
  private countdown1: Text;
  private countdownLfg: Text;


  constructor() {
    this.startText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'BureauGrotesque',
        fill: '#ffffff',
        fontSize: 64,
        fontWeight: '500',
        align: 'center',
        padding: 48,
        dropShadow: {
          color: '#000000',
          alpha: 0.95,
          blur: 44,
          angle: 0,
          distance: 0,
        },
      }),
    });
    this.startText.anchor.set(0.5);
    this.startText.resolution = 2;
    this.endWinnerText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'BureauGrotesque',
        fill: '#ffffff',
        fontSize: 34,
        fontWeight: '500',
        align: 'center',
        padding: 48,
        dropShadow: {
          color: '#000000',
          alpha: 0.95,
          blur: 44,
          angle: 0,
          distance: 0,
        },
      }),
    });
    this.endWinnerText.anchor.set(0.5);
    this.endWinnerText.resolution = 2;
    this.endContinueText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'BureauGrotesque',
        fill: '#ffffff',
        fontSize: 20,
        fontWeight: '500',
        align: 'center',
        padding: 48,
        dropShadow: {
          color: '#000000',
          alpha: 0.95,
          blur: 44,
          angle: 0,
          distance: 0,
        },
      }),
    });
    this.endContinueText.anchor.set(0.5);
    this.endContinueText.resolution = 2;
    this.countdown3 = this.createCountdownText();
    this.countdown2 = this.createCountdownText();
    this.countdown1 = this.createCountdownText();
    this.countdownLfg = this.createCountdownText();
  }

  async mount(host: HTMLElement): Promise<void> {
    this.host = host;
    host.innerHTML = '';
    try {
      const app = new Application();
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        resizeTo: host,
        preference: 'webgl',
      });
      this.app = app;
      host.appendChild(app.canvas);
      this.root.addChild(this.deadZone);
      this.root.addChild(this.grid);
      this.root.addChild(this.scene);
      this.root.addChild(this.resolveBlocks);
      this.root.addChild(this.powerUpLabels);
      this.overlay.addChild(this.startText);
      this.overlay.addChild(this.endWinnerText);
      this.overlay.addChild(this.endContinueText);
      this.overlay.addChild(this.countdown3);
      this.overlay.addChild(this.countdown2);
      this.overlay.addChild(this.countdown1);
      this.overlay.addChild(this.countdownLfg);
      this.root.addChild(this.overlay);
      app.stage.addChild(this.root);
      this.resize();
    } catch {
      this.app = null;
      this.createFallbackCanvas();
    }
  }

  resize(): void {
    if (!this.host) return;
    if (this.app) {
      this.app.renderer.resize(this.host.clientWidth, this.host.clientHeight);
      return;
    }
    if (this.fallbackCanvas) {
      this.fallbackCanvas.width = Math.max(1, this.host.clientWidth);
      this.fallbackCanvas.height = Math.max(1, this.host.clientHeight);
    }
  }

  render(state: GameState, opts?: { replayView?: boolean }): void {
    if (!this.app) {
      this.renderFallback(state, opts);
      return;
    }
    const renderer = this.app.renderer;
    if (!renderer) {
      this.renderFallback(state, opts);
      return;
    }
    const width = this.host?.clientWidth ?? renderer.width;
    const height = this.host?.clientHeight ?? renderer.height;
    if (width <= 0 || height <= 0) {
      this.resize();
      return;
    }
    const colSize = width / state.cols;
    const rowSize = height / state.rows;

    // ── Dead zone / convergence overlay ─────────────────────────────────────
    this.deadZone.clear();
    if (state.shrinkBorder) {
      this.renderDeadZone(state, width, height, colSize, rowSize);
    }

    // ── Resolving blocks (convergence wall-close finale) ─────────────────────
    this.resolveBlocks.clear();
    const resolveProgress = this.getResolveProgress(state);

    // ── Overclock vignette ──────────────────────────────────────────────────
    if (state.meta.overclockMode) {
      const speedFraction = 1 - (state.meta.currentStepMs - 30) / 70;
      if (speedFraction > 0) {
        const vigAlpha = speedFraction * 0.18;
        this.deadZone
          .rect(0, 0, width, height)
          .fill({ color: 0xff2200, alpha: vigAlpha });
      }
    }

    // ── Grid ─────────────────────────────────────────────────────────────────
    this.grid.clear();
    if (!state.meta.invisibleGrid) {
      const gridAlpha = state.meta.overclockMode
        ? 0.05 + (1 - (state.meta.currentStepMs - 30) / 70) * 0.08
        : 0.05;
      for (let x = 0; x <= state.cols; x += 1) {
        for (let y = 0; y <= state.rows; y += 1) {
          this.grid
            .rect(x * colSize, y * rowSize, colSize, rowSize)
            .stroke({ width: 1, color: 0xffffff, alpha: gridAlpha });
        }
      }
    }

    // ── Coinbase capture pulse detection ─────────────────────────────────────
    const now = performance.now();
    if (state.gameStarted && !state.gameEnded) {
      if (this.prevScoreP1 >= 0 && state.score[0] > this.prevScoreP1) this.p1Pulses.push(now);
      if (this.prevScoreP2 >= 0 && state.score[1] > this.prevScoreP2) this.p2Pulses.push(now);
    } else if (!state.gameStarted) {
      this.p1Pulses = [];
      this.p2Pulses = [];
    }
    this.prevScoreP1 = state.score[0];
    this.prevScoreP2 = state.score[1];
    this.p1Pulses = this.p1Pulses.filter((t) => now - t < PixiGameRenderer.PULSE_DURATION_MS);
    this.p2Pulses = this.p2Pulses.filter((t) => now - t < PixiGameRenderer.PULSE_DURATION_MS);

    // ── Scene ─────────────────────────────────────────────────────────────────
    this.scene.clear();

    // ── 3D ghost layer (the inactive board, drawn dim with depth offset) ─────
    if (state.meta.layers3D) {
      this.draw3DGhostLayer(state, colSize, rowSize, now);
    }

    // Obstacle walls — always the same board layout (layer depth is visual only)
    const activeWalls = state.obstacleWalls;
    for (const wall of activeWalls) {
      const px = wall.pos[0] * colSize;
      const py = wall.pos[1] * rowSize;
      this.scene.rect(px, py, colSize, rowSize).fill({ color: 0xffffff, alpha: 0.8 });
      this.scene.rect(px + 1, py + 1, colSize - 2, rowSize - 2).stroke({ width: 1, color: 0xffffff, alpha: 0.4 });
    }

    // Void cells
    for (const vc of state.voidCells) {
      const px = vc[0] * colSize;
      const py = vc[1] * rowSize;
      this.scene.rect(px, py, colSize, rowSize).fill({ color: 0x000000, alpha: 0.85 });
      this.scene.rect(px, py, colSize, rowSize).stroke({ width: 1, color: 0x333333, alpha: 0.5 });
    }

    // Snakes
    const p1Frozen  = state.activePowerUps.some((ap) => ap.type === 'FREEZE'    && ap.player === 'P1');
    const p2Frozen  = state.activePowerUps.some((ap) => ap.type === 'FREEZE'    && ap.player === 'P2');
    const p1Phantom = state.activePowerUps.some((ap) => ap.type === 'PHANTOM'   && ap.player === 'P1');
    const p2Phantom = state.activePowerUps.some((ap) => ap.type === 'PHANTOM'   && ap.player === 'P2');
    const p1Surging = state.activePowerUps.some((ap) => ap.type === 'SURGE'     && ap.player === 'P1');
    const p2Surging = state.activePowerUps.some((ap) => ap.type === 'SURGE'     && ap.player === 'P2');
    const p1Amped   = state.activePowerUps.some((ap) => ap.type === 'AMPLIFIER' && ap.player === 'P1');
    const p2Amped   = state.activePowerUps.some((ap) => ap.type === 'AMPLIFIER' && ap.player === 'P2');

    // Record surge trail positions each frame
    const FADE = PixiGameRenderer.SURGE_TRAIL_FADE_MS;
    if (state.gameStarted && !state.gameEnded) {
      if (p1Surging) this.p1SurgeTrail.push({ pos: [state.p1.head[0], state.p1.head[1]], time: now });
      if (p2Surging) this.p2SurgeTrail.push({ pos: [state.p2.head[0], state.p2.head[1]], time: now });
    }
    this.p1SurgeTrail = this.p1SurgeTrail.filter((t) => now - t.time < FADE);
    this.p2SurgeTrail = this.p2SurgeTrail.filter((t) => now - t.time < FADE);

    // Draw fading orange trail squares (rendered before snakes so snakes appear on top)
    for (const t of this.p1SurgeTrail) {
      const a = (1 - (now - t.time) / FADE) * 0.6;
      const pad = 1;
      this.scene.rect(t.pos[0] * colSize + pad, t.pos[1] * rowSize + pad, colSize - pad * 2, rowSize - pad * 2)
        .fill({ color: 0xFF7200, alpha: a });
    }
    for (const t of this.p2SurgeTrail) {
      const a = (1 - (now - t.time) / FADE) * 0.6;
      const pad = 1;
      this.scene.rect(t.pos[0] * colSize + pad, t.pos[1] * rowSize + pad, colSize - pad * 2, rowSize - pad * 2)
        .fill({ color: 0xFF7200, alpha: a });
    }

    // Extra snakes (teams / ffa) — drawn behind main snakes
    for (const extra of (state.extraSnakes ?? [])) {
      this.drawSnake(extra.snake, extra.color, colSize, rowSize, {
        frozen: false, phantom: false, surging: false, amped: false,
      }, [], now);
      // Ally / shadow border: solid inset outline distinguishes them from P1/P2
      if (extra.outline != null) {
        const lw = Math.max(1, Math.min(colSize, rowSize) * 0.05);
        for (const seg of [extra.snake.head, ...extra.snake.body]) {
          this.scene
            .rect(
              seg[0] * colSize + lw / 2,
              seg[1] * rowSize + lw / 2,
              colSize - lw,
              rowSize - lw,
            )
            .stroke({ width: lw, color: extra.outline, alpha: 0.7 });
        }
      }
    }

    // Fork bursts (must be drawn BEFORE snakes so they show behind)
    if (state.forkBursts?.length) {
      this.drawForkBursts(state, colSize, rowSize, now);
    }
    // Fork chains
    if (state.forkChains?.length) {
      this.drawForkChains(state, colSize, rowSize, now);
    }

    // In 3D levels chains are drawn at their layer's visual depth
    const boardW3D = state.cols * colSize;
    const boardH3D = state.rows * rowSize;
    const p1LayerTr = state.meta.layers3D
      ? this.getLayerTransform3D(state.p1Layer as 0 | 1, colSize, rowSize, boardW3D, boardH3D)
      : undefined;
    const p2LayerTr = state.meta.layers3D
      ? this.getLayerTransform3D(state.p2Layer as 0 | 1, colSize, rowSize, boardW3D, boardH3D)
      : undefined;

    this.drawSnake(state.p1, 0xffffff, colSize, rowSize, {
      frozen: p1Frozen, phantom: p1Phantom, surging: p1Surging, amped: p1Amped,
    }, this.p1Pulses, now, p1LayerTr);

    const p2Color = 0x111111;
    this.drawSnake(state.p2, p2Color, colSize, rowSize, {
      frozen: p2Frozen, phantom: p2Phantom, surging: p2Surging, amped: p2Amped,
    }, this.p2Pulses, now, p2LayerTr);

    // Coinbases — in 3D mode the main board always shows layer-0 coinbases;
    // layer-1 coinbases appear on the ghost board drawn earlier.
    const activeCoinbases = state.meta.layers3D
      ? state.coinbases.filter((cb) => cb.layer === undefined || cb.layer === 0)
      : state.coinbases;
    for (const cb of activeCoinbases) {
      this.drawCoinbase(cb.pos, colSize, rowSize, {
        reward: cb.reward,
        isDecoy: cb.isDecoy,
        isBounty: cb.isBounty,
      });
    }

    // Teleport portals
    if (state.teleportDoors?.length) {
      for (const door of state.teleportDoors) {
        this.drawPortal(door.a, door.colorIndex, colSize, rowSize, now, door.switchesLayer);
        this.drawPortal(door.b, door.colorIndex, colSize, rowSize, now, door.switchesLayer);
        // Thin link line between partners
        const ax = door.a[0] * colSize + colSize / 2;
        const ay = door.a[1] * rowSize + rowSize / 2;
        const bx = door.b[0] * colSize + colSize / 2;
        const by = door.b[1] * rowSize + rowSize / 2;
        const linkAlpha = 0.07 + 0.04 * Math.sin(now / 300 + door.colorIndex);
        this.scene
          .moveTo(ax, ay).lineTo(bx, by)
          .stroke({ width: 1, color: PORTAL_COLORS[door.colorIndex % PORTAL_COLORS.length], alpha: linkAlpha });
      }
    }

    // Power-up items + labels
    this.powerUpLabels.removeChildren().forEach((c) => (c as Text).destroy?.());
    for (const item of state.powerUpItems) {
      this.drawPowerUpItem(item.pos, item.type, colSize, rowSize);
      this.drawPowerUpLabel(item.pos, item.type, colSize, rowSize);
    }

    // Point pop-ups
    for (const change of state.pointChanges) {
      const x1 = change.p1Pos[0] * colSize + colSize / 2;
      const y1 = change.p1Pos[1] * rowSize + rowSize / 2 + change.p1YOffsetPx;
      const x2 = change.p2Pos[0] * colSize + colSize / 2;
      const y2 = change.p2Pos[1] * rowSize + rowSize / 2 + change.p2YOffsetPx;
      if (change.player === 'P1') {
        this.drawPointText(`+${change.value}`, x1, y1, 0x42a345, change.alpha);
        this.drawPointText(`-${change.value}`, x2, y2, 0xf13838, change.alpha);
      } else {
        this.drawPointText(`-${change.value}`, x1, y1, 0xf13838, change.alpha);
        this.drawPointText(`+${change.value}`, x2, y2, 0x42a345, change.alpha);
      }
    }

    if (state.meta?.modeLabel !== 'ONLINE') {
      state.pointChanges = state.pointChanges
        .map((change) => ({
          ...change,
          p1YOffsetPx: change.p1YOffsetPx - 1,
          p2YOffsetPx: change.p2YOffsetPx - 1,
          alpha: change.alpha - 0.1 / 6,
        }))
        .filter((change) => change.alpha >= 0);
    }

    // ── Text overlays ─────────────────────────────────────────────────────────
    this.startText.position.set(width / 2, height / 2);
    this.endWinnerText.position.set(width / 2, height / 2 - 15);
    this.endContinueText.position.set(width / 2, height / 2 + 35);
    this.countdown3.position.set(width * 0.24, height / 2);
    this.countdown2.position.set(width * 0.36, height / 2);
    this.countdown1.position.set(width * 0.47, height / 2);
    this.countdownLfg.position.set(width * 0.675, height / 2);
    this.startText.style.fontSize = Math.max(10, (width / 17) * 1.12);
    this.endWinnerText.style.fontSize = Math.max(10, (width / 17) * 1.12);
    this.endContinueText.style.fontSize = Math.max(10, (width / 39) * 1.1);
    const countdownSize = Math.max(18, height * 0.54);
    this.countdown3.style.fontSize = countdownSize;
    this.countdown2.style.fontSize = countdownSize;
    this.countdown1.style.fontSize = countdownSize;
    this.countdownLfg.style.fontSize = countdownSize;

    this.startText.text = '';
    this.endWinnerText.text = '';
    this.endContinueText.text = '';
    this.countdown3.text = '';
    this.countdown2.text = '';
    this.countdown1.text = '';
    this.countdownLfg.text = '';

    if (!state.gameStarted && !state.gameEnded && !state.countdownStart) {
      this.startText.text = 'PRESS BUTTON TO START';
    } else if (state.countdownStart) {
      this.countdown3.text = '3';
      this.countdown2.text = '2';
      this.countdown1.text = '1';
      this.countdownLfg.text = 'LFG';
      this.applyCountdownState(state.countdownTicks);
    } else if (state.gameEnded) {
      // During the resolving-blocks animation, suppress the text until blocks cover the board
      if (resolveProgress >= 1.0 || !state.convergenceWallClosed) {
        this.endWinnerText.text = `${state.winnerName.toUpperCase()} WINS!`;
        this.endContinueText.text = opts?.replayView ? '' : 'PRESS ANY BUTTON TO CONTINUE';
      }
    }

    // Draw resolving blocks on top of scene (but behind text overlay)
    if (resolveProgress > 0) {
      this.renderResolveBlocks(state, width, height, colSize, rowSize, resolveProgress);
    }
  }

  // ── Resolving blocks animation ─────────────────────────────────────────────

  private static readonly RESOLVE_DURATION_MS = 1400;

  private getResolveProgress(state: GameState): number {
    if (!state.convergenceWallClosed) {
      this.resolveAnimStartMs = null;
      return 0;
    }
    if (this.resolveAnimStartMs === null) {
      this.resolveAnimStartMs = performance.now();
    }
    return Math.min(1, (performance.now() - this.resolveAnimStartMs) / PixiGameRenderer.RESOLVE_DURATION_MS);
  }

  private renderResolveBlocks(
    state: GameState,
    _width: number,
    _height: number,
    colSize: number,
    rowSize: number,
    progress: number,
  ): void {
    const cols = state.cols;
    const rows = state.rows;
    const maxDist = Math.min(Math.floor(cols / 2), Math.floor(rows / 2));
    // Pseudo-random per-cell offset so blocks don't appear in a perfect geometric ring
    const hashOffset = (x: number, y: number) =>
      ((x * 2654435761 + y * 2246822519) >>> 0) % 1000 / 1000;

    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const distFromEdge = Math.min(x, cols - 1 - x, y, rows - 1 - y);
        const threshold = (distFromEdge + hashOffset(x, y) * 0.6) / maxDist;
        if (progress < threshold) continue;

        const px = x * colSize;
        const py = y * rowSize;
        // Layered block: outer amber, inner dark-amber, innermost near-black
        const blockAlpha = Math.min(1, (progress - threshold) * 6 + 0.6);
        this.resolveBlocks
          .rect(px, py, colSize, rowSize)
          .fill({ color: 0xC88820, alpha: blockAlpha * 0.9 });
        this.resolveBlocks
          .rect(px + 1, py + 1, colSize - 2, rowSize - 2)
          .fill({ color: 0x7A5010, alpha: blockAlpha * 0.75 });
        this.resolveBlocks
          .rect(px + 2, py + 2, colSize - 4, rowSize - 4)
          .fill({ color: 0x1A0E00, alpha: blockAlpha * 0.6 });
      }
    }
  }

  // ── Dead zone / convergence overlay ───────────────────────────────────────

  private renderDeadZone(
    state: GameState,
    width: number,
    height: number,
    colSize: number,
    rowSize: number
  ): void {
    const sb = state.shrinkBorder!;
    const leftPx = sb.left * colSize;
    const rightPx = (sb.right + 1) * colSize;
    const topPx = sb.top * rowSize;
    const bottomPx = (sb.bottom + 1) * rowSize;

    const voidAlpha = 0.55;
    const voidColor = 0x000000;

    // Left strip
    if (leftPx > 0) {
      this.deadZone.rect(0, 0, leftPx, height).fill({ color: voidColor, alpha: voidAlpha });
    }
    // Right strip
    if (rightPx < width) {
      this.deadZone.rect(rightPx, 0, width - rightPx, height).fill({ color: voidColor, alpha: voidAlpha });
    }
    // Top strip
    if (topPx > 0) {
      this.deadZone.rect(leftPx, 0, rightPx - leftPx, topPx).fill({ color: voidColor, alpha: voidAlpha });
    }
    // Bottom strip
    if (bottomPx < height) {
      this.deadZone.rect(leftPx, bottomPx, rightPx - leftPx, height - bottomPx).fill({ color: voidColor, alpha: voidAlpha });
    }

    // Amber gradient edge at the live boundary (warning glow)
    const edgeAlpha = sb.warningActive ? 0.55 : 0.18;
    const edgeWidth = colSize * 1.5;
    const edgeColor = 0xC88820;

    if (leftPx > 0) {
      this.deadZone.rect(leftPx, topPx, edgeWidth, bottomPx - topPx).fill({ color: edgeColor, alpha: edgeAlpha });
    }
    if (rightPx < width) {
      this.deadZone.rect(rightPx - edgeWidth, topPx, edgeWidth, bottomPx - topPx).fill({ color: edgeColor, alpha: edgeAlpha });
    }
    if (topPx > 0) {
      this.deadZone.rect(leftPx, topPx, rightPx - leftPx, edgeWidth).fill({ color: edgeColor, alpha: edgeAlpha });
    }
    if (bottomPx < height) {
      this.deadZone.rect(leftPx, bottomPx - edgeWidth, rightPx - leftPx, edgeWidth).fill({ color: edgeColor, alpha: edgeAlpha });
    }
  }

  // ── Snake drawing ──────────────────────────────────────────────────────────

  private drawSnake(
    snake: GameState['p1'],
    color: number,
    colSize: number,
    rowSize: number,
    effects: { frozen?: boolean; phantom?: boolean; surging?: boolean; amped?: boolean },
    pulses: number[] = [],
    now: number = 0,
    layerTransform?: { scale: number; xOff: number; yOff: number; alpha: number },
  ): void {
    // Layer-depth transform helpers
    const sc  = layerTransform?.scale ?? 1;
    const ox  = layerTransform?.xOff  ?? 0;
    const oy  = layerTransform?.yOff  ?? 0;
    const la  = layerTransform?.alpha ?? 1;
    const eCS = colSize * sc;
    const eRS = rowSize * sc;
    const sx  = (gx: number) => ox + gx * eCS;
    const sy  = (gy: number) => oy + gy * eRS;

    const headAlpha    = (effects.phantom ? 0.5 : 1) * la;
    const baseBodyAlpha = (effects.phantom ? 0.25 : 0.6) * la;
    const totalLen = 1 + snake.body.length;
    const isLight  = color === 0xffffff;

    // AMP pulsing gold glow under the whole chain (drawn first, underneath)
    if (effects.amped) {
      const ampPulse = 0.5 + 0.5 * Math.sin(now / 220);
      const ampAlpha = (0.18 + ampPulse * 0.22) * la;
      const expand = 2 + ampPulse * 3;
      this.scene
        .rect(sx(snake.head[0]) - expand, sy(snake.head[1]) - expand, eCS + expand * 2, eRS + expand * 2)
        .fill({ color: 0xFFBB00, alpha: ampAlpha * 1.4 });
      for (const seg of snake.body) {
        this.scene
          .rect(sx(seg[0]) - expand * 0.5, sy(seg[1]) - expand * 0.5, eCS + expand, eRS + expand)
          .fill({ color: 0xFFBB00, alpha: ampAlpha * 0.7 });
      }
    }

    // Head — with glow halo on pulse wave arrival
    const headBoost = this.getSegmentGlow(0, totalLen, pulses, now);
    if (headBoost > 0) {
      const expand = headBoost * 4;
      this.scene
        .rect(sx(snake.head[0]) - expand, sy(snake.head[1]) - expand, eCS + expand * 2, eRS + expand * 2)
        .fill({ color: isLight ? 0xffffff : 0xdddddd, alpha: headBoost * 0.35 * la });
    }
    this.scene.rect(sx(snake.head[0]), sy(snake.head[1]), eCS, eRS)
      .fill({ color, alpha: headAlpha });

    // Orange SURGE border on head
    if (effects.surging) {
      const surgePulse = 0.7 + 0.3 * Math.sin(now / 80);
      this.scene
        .rect(sx(snake.head[0]) - 2, sy(snake.head[1]) - 2, eCS + 4, eRS + 4)
        .stroke({ width: 2.5, color: 0xFF7200, alpha: surgePulse * la });
    }

    // AMP pulsing gold border on head
    if (effects.amped) {
      const ampPulse = 0.6 + 0.4 * Math.sin(now / 220);
      this.scene
        .rect(sx(snake.head[0]) - 2, sy(snake.head[1]) - 2, eCS + 4, eRS + 4)
        .stroke({ width: 2, color: 0xFFBB00, alpha: ampPulse * la });
    }

    // Frozen ring around head
    if (effects.frozen) {
      this.scene
        .rect(sx(snake.head[0]) - 2, sy(snake.head[1]) - 2, eCS + 4, eRS + 4)
        .stroke({ width: 2, color: 0x3090C8, alpha: 0.7 * la });
    }

    // Body — pulse wave travels head → tail
    for (let i = 0; i < snake.body.length; i++) {
      const boost = this.getSegmentGlow(i + 1, totalLen, pulses, now);
      const segAlpha = Math.min(1, baseBodyAlpha + boost * 0.36 * la);
      const px = sx(snake.body[i][0]);
      const py = sy(snake.body[i][1]);

      this.scene.rect(px, py, eCS, eRS).fill({ color, alpha: segAlpha });

      if (!isLight && boost > 0.05) {
        this.scene
          .rect(px + 1, py + 1, eCS - 2, eRS - 2)
          .fill({ color: 0xffffff, alpha: boost * 0.28 * la });
      }

      if (effects.surging) {
        const surgePulse = 0.5 + 0.3 * Math.sin(now / 80 + i * 0.4);
        this.scene
          .rect(px - 1, py - 1, eCS + 2, eRS + 2)
          .stroke({ width: 1.5, color: 0xFF7200, alpha: surgePulse * la });
      }

      if (effects.amped) {
        const ampPulse = 0.4 + 0.3 * Math.sin(now / 220 + i * 0.2);
        this.scene
          .rect(px - 1, py - 1, eCS + 2, eRS + 2)
          .stroke({ width: 1.5, color: 0xFFBB00, alpha: ampPulse * 0.7 * la });
      }
    }
  }

  /** Gaussian pulse: returns 0–1 boost for segment at index i as wave travels head→tail */
  private getSegmentGlow(segIndex: number, totalLen: number, pulses: number[], now: number): number {
    if (pulses.length === 0 || totalLen === 0) return 0;
    const D = PixiGameRenderer.PULSE_DURATION_MS;
    const HALF_W = 0.16; // pulse width as fraction of body
    let max = 0;
    for (const startMs of pulses) {
      const t = (now - startMs) / D;
      if (t < 0 || t > 1.1) continue;
      const frac = totalLen > 1 ? segIndex / (totalLen - 1) : 0;
      const dist = Math.abs(frac - t);
      max = Math.max(max, Math.max(0, 1 - dist / HALF_W));
    }
    return max;
  }

  // ── Coinbase drawing ───────────────────────────────────────────────────────

  private drawCoinbase(
    pos: GridPos,
    colSize: number,
    rowSize: number,
    opts: { reward?: number; isDecoy?: boolean; isBounty?: boolean }
  ): void {
    const radius = rowSize / 2 - rowSize / 5.4;
    const cx = pos[0] * colSize + colSize / 2;
    const cy = pos[1] * rowSize + rowSize / 2;

    if (opts.isBounty) {
      // Bounty coinbase: double size, 6 rings, slow gold pulse
      const bigRadius = radius * 1.6;
      const tick = Date.now() / 1000;
      const pulse = 0.6 + 0.4 * Math.sin(tick * 1.5);

      this.scene.circle(cx, cy, bigRadius * 2.6).fill({ color: BOUNTY_COINBASE_COLOR, alpha: 0.06 * pulse });
      this.scene.circle(cx, cy, bigRadius * 2.0).fill({ color: BOUNTY_COINBASE_COLOR, alpha: 0.10 * pulse });
      this.scene.circle(cx, cy, bigRadius * 1.5).fill({ color: BOUNTY_COINBASE_COLOR, alpha: 0.16 * pulse });
      this.scene.circle(cx, cy, bigRadius * 1.15).fill({ color: BOUNTY_COINBASE_COLOR, alpha: 0.25 * pulse });
      this.scene.circle(cx, cy, bigRadius * 0.9).fill({ color: BOUNTY_COINBASE_COLOR, alpha: 1 });

      for (let ring = BOUNTY_COINBASE_RINGS; ring > 0; ring--) {
        const alpha = (0.15 + ring * 0.05) * pulse;
        this.scene
          .circle(cx, cy, bigRadius + ring * rowSize * 0.45)
          .stroke({ width: 1.5, color: BOUNTY_COINBASE_COLOR, alpha });
      }
      return;
    }

    if (opts.isDecoy) {
      // Decoy: looks almost identical to real coinbase but has a faint irregular pulse
      const tick = Date.now() / 700;
      const pulse = 0.7 + 0.3 * Math.sin(tick * 1.7 + 1.2);
      this.scene.circle(cx, cy, radius * 2.05).fill({ color: 0xffffff, alpha: 0.04 * pulse });
      this.scene.circle(cx, cy, radius * 1.7).fill({ color: 0xffffff, alpha: 0.07 * pulse });
      this.scene.circle(cx, cy, radius * 1.35).fill({ color: 0xffffff, alpha: 0.12 * pulse });
      this.scene.circle(cx, cy, radius * 0.9).fill({ color: 0xffffff, alpha: 0.85 * pulse });
      return;
    }

    // Standard coinbase
    this.scene.circle(cx, cy, radius * 2.05).fill({ color: 0xffffff, alpha: 0.05 });
    this.scene.circle(cx, cy, radius * 1.7).fill({ color: 0xffffff, alpha: 0.08 });
    this.scene.circle(cx, cy, radius * 1.35).fill({ color: 0xffffff, alpha: 0.14 });
    this.scene.circle(cx, cy, radius * 1.1).fill({ color: 0xffffff, alpha: 0.22 });
    this.scene.circle(cx, cy, radius * 0.9).fill({ color: 0xffffff, alpha: 1 });

    // Reward rings
    if (opts.reward) {
      const rings = opts.reward === 2 ? 2 : opts.reward === 4 ? 3 : opts.reward === 8 ? 4 : opts.reward === 16 ? 5 : 6;
      let transparencyAdder = 1;
      for (let ring = rings; ring > 0; ring -= 1) {
        const alpha = 0.1 / rings + transparencyAdder / 20;
        this.scene
          .circle(cx, cy, radius + ring * rowSize * 0.38)
          .stroke({ width: 1, color: 0xffffff, alpha });
        transparencyAdder += 1;
      }
    }
  }

  // ── Layer-depth transform helper ─────────────────────────────────────────
  /**
   * Returns a pixel transform for chains on the "back" (layer 1) board so they
   * appear to recede into the ghost-board perspective behind the main board.
   * Layer 0 (front) returns undefined — no transform needed.
   */
  private getLayerTransform3D(
    layer: 0 | 1,
    colSize: number, rowSize: number,
    boardW: number, boardH: number,
  ): { scale: number; xOff: number; yOff: number; alpha: number } | undefined {
    if (layer === 0) return undefined;
    const dX    = colSize * 3.0;
    const dY    = -rowSize * 1.85;
    const scale = 0.72;
    const ghostW = boardW * scale;
    const ghostH = boardH * scale;
    return {
      scale,
      xOff: (boardW - ghostW) / 2 + dX,
      yOff: (boardH - ghostH) / 2 + dY,
      alpha: 0.62,
    };
  }

  // ── 3D ghost layers ───────────────────────────────────────────────────────
  /**
   * Render a convincing 3-board perspective stack with connecting "shafts"
   * (corner-to-corner edges like the sides of a 3D prism) between each floor:
   *
   *   Deep echo  (floor 2) — 50% scale, 2× depth offset, 11% alpha
   *   Near ghost (floor 1) — 72% scale, 1× depth offset, 26% alpha
   *   Active     (floor 0) — 100% scale, at (0,0), drawn by main render
   *
   * Shaft lines connect the 4 corners of each adjacent board pair, giving
   * the unmistakable look of a stacked building viewed at an angle.
   */
  private draw3DGhostLayer(state: GameState, colSize: number, rowSize: number, _now: number): void {
    // Ghost boards always show the same wall layout as the main board;
    // layer-1 coinbases appear on the back ghost board.
    const ghostWalls = state.obstacleWalls;
    const ghostCoins = state.coinbases.filter((cb) => cb.layer === 1);

    const boardW = state.cols * colSize;
    const boardH = state.rows * rowSize;

    // Back layer always renders upper-right (fixed perspective direction)
    const dX = colSize * 3.0;
    const dY = -rowSize * 1.85;

    // Pre-compute corners for all 3 boards so we can draw the shafts between them.
    // Board corners: [topLeft, topRight, bottomLeft, bottomRight]
    const corners = (scale: number, xs: number, ys: number) => {
      const gW = state.cols * colSize * scale;
      const gH = state.rows * rowSize * scale;
      const ox = (boardW - gW) / 2 + xs;
      const oy = (boardH - gH) / 2 + ys;
      return [
        [ox,      oy     ],   // top-left
        [ox + gW, oy     ],   // top-right
        [ox,      oy + gH],   // bottom-left
        [ox + gW, oy + gH],   // bottom-right
      ];
    };

    const c0 = corners(1.00, 0,      0     );   // active board
    const c1 = corners(0.72, dX,     dY    );   // near ghost
    const c2 = corners(0.50, dX * 2, dY * 2);  // deep echo

    // Draw shafts deep-to-near first (behind both ghost boards)
    const drawShafts = (from: number[][], to: number[][], alpha: number) => {
      for (let i = 0; i < 4; i++) {
        this.scene
          .moveTo(from[i][0], from[i][1])
          .lineTo(to[i][0],   to[i][1])
          .stroke({ width: 1, color: 0x3355aa, alpha });
      }
    };

    drawShafts(c2, c1, 0.18);   // deep-echo → near-ghost shaft
    drawShafts(c1, c0, 0.28);   // near-ghost → active shaft

    // Boards (deepest first — painter's algorithm)
    this.drawGhostBoard(state, ghostWalls, ghostCoins, colSize, rowSize,
      boardW, boardH, 0.50, dX * 2, dY * 2, 0.11, 0.15);
    this.drawGhostBoard(state, ghostWalls, ghostCoins, colSize, rowSize,
      boardW, boardH, 0.72, dX,     dY,     0.26, 0.34);
  }

  /** Render one ghost board at a given scale / depth-offset / alpha. */
  private drawGhostBoard(
    state: GameState,
    walls: Array<{ pos: GridPos }>,
    coins: Array<{ pos: GridPos }>,
    colSize: number, rowSize: number,
    boardW: number, boardH: number,
    scale: number, xShift: number, yShift: number,
    wallAlpha: number, coinAlpha: number,
  ): void {
    const gCS    = colSize * scale;
    const gRS    = rowSize * scale;
    const ghostW = state.cols * gCS;
    const ghostH = state.rows * gRS;
    const xOff   = (boardW - ghostW) / 2 + xShift;
    const yOff   = (boardH - ghostH) / 2 + yShift;

    // Board outline
    this.scene
      .rect(xOff, yOff, ghostW, ghostH)
      .stroke({ width: 1.5, color: 0x4466aa, alpha: wallAlpha * 0.9 });

    // Sparse grid (every 4 cells)
    for (let x = 0; x <= state.cols; x += 4) {
      this.scene
        .rect(xOff + x * gCS, yOff, 1, ghostH)
        .fill({ color: 0x223366, alpha: wallAlpha * 0.4 });
    }
    for (let y = 0; y <= state.rows; y += 4) {
      this.scene
        .rect(xOff, yOff + y * gRS, ghostW, 1)
        .fill({ color: 0x223366, alpha: wallAlpha * 0.4 });
    }

    // Obstacle walls
    for (const wall of walls) {
      const px = xOff + wall.pos[0] * gCS;
      const py = yOff + wall.pos[1] * gRS;
      this.scene.rect(px, py, gCS, gRS)
        .fill({ color: 0x4477cc, alpha: wallAlpha });
      this.scene.rect(px + 1, py + 1, gCS - 2, gRS - 2)
        .stroke({ width: 1, color: 0x88aaee, alpha: wallAlpha * 0.5 });
    }

    // Coinbases
    for (const cb of coins) {
      const cx = xOff + (cb.pos[0] + 0.5) * gCS;
      const cy = yOff + (cb.pos[1] + 0.5) * gRS;
      const r  = Math.min(gCS, gRS) * 0.26;
      this.scene.circle(cx, cy, r).fill({ color: 0xff9910, alpha: coinAlpha });
      this.scene.circle(cx, cy, r).stroke({ width: 1, color: 0xffcc66, alpha: coinAlpha * 0.5 });
    }
  }

  // ── Teleport portals ─────────────────────────────────────────────────────

  private drawPortal(pos: GridPos, colorIndex: number, colSize: number, rowSize: number, now: number, switchesLayer?: boolean): void {
    const color = PORTAL_COLORS[colorIndex % PORTAL_COLORS.length];
    const x0 = pos[0] * colSize;
    const y0 = pos[1] * rowSize;
    const pad = Math.min(colSize, rowSize) * 0.1;
    const pulse = 0.55 + 0.45 * Math.sin(now / 280 + colorIndex * 1.4);
    const cx = x0 + colSize / 2;
    const cy = y0 + rowSize / 2;
    const s = Math.min(colSize, rowSize);

    // Outer glow square
    this.scene
      .rect(x0 - pad, y0 - pad, colSize + pad * 2, rowSize + pad * 2)
      .fill({ color, alpha: 0.07 + pulse * 0.08 });
    // Border square
    this.scene
      .rect(x0 + pad, y0 + pad, colSize - pad * 2, rowSize - pad * 2)
      .stroke({ width: Math.max(1, s * 0.05), color, alpha: 0.5 + pulse * 0.3 });
    // Inner spinning cross
    const arm = s * 0.2;
    const angle = now / 600 + colorIndex * Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = angle + (i * Math.PI) / 2;
      this.scene
        .moveTo(cx, cy)
        .lineTo(cx + Math.cos(a) * arm, cy + Math.sin(a) * arm)
        .stroke({ width: Math.max(1, s * 0.07), color, alpha: 0.6 + pulse * 0.35 });
    }
    // Center: layer-shift portals show stacked up/down chevrons; regular portals show a solid square
    if (switchesLayer) {
      const aw = s * 0.13;
      const ah = s * 0.1;
      const gap = s * 0.06;
      // Up chevron
      this.scene
        .moveTo(cx - aw, cy - gap)
        .lineTo(cx,      cy - gap - ah)
        .lineTo(cx + aw, cy - gap)
        .stroke({ width: Math.max(1, s * 0.06), color: 0xFFFFFF, alpha: 0.7 + pulse * 0.25 });
      // Down chevron
      this.scene
        .moveTo(cx - aw, cy + gap)
        .lineTo(cx,      cy + gap + ah)
        .lineTo(cx + aw, cy + gap)
        .stroke({ width: Math.max(1, s * 0.06), color: 0xFFFFFF, alpha: 0.7 + pulse * 0.25 });
    } else {
      const cs = s * 0.18;
      this.scene.rect(cx - cs / 2, cy - cs / 2, cs, cs).fill({ color, alpha: 0.85 });
    }
  }

  // ── Fork power-up rendering ────────────────────────────────────────────────

  /**
   * Renders the fork-birth burst animation.
   * Three visual layers animate over POWERUP_FORK_BURST_TICKS:
   *  1. Flash disc — bright flood fill at origin, peaks at tick 3, gone by tick 12
   *  2. Expanding ring pair — two rings grow outward in parent/fork directions
   *  3. Trailing glow lines — subtle lines extending along each direction
   */
  private drawForkBursts(state: GameState, colSize: number, rowSize: number, now: number): void {
    const BURST = POWERUP_FORK_BURST_TICKS;
    for (const burst of state.forkBursts) {
      const shimmer = 0.85 + 0.15 * Math.sin(now / 80);
      const age = state.tickCount - burst.tick;
      if (age >= BURST) continue;
      const t = age / BURST;                 // 0→1 lifetime
      const cx = burst.pos[0] * colSize + colSize / 2;
      const cy = burst.pos[1] * rowSize + rowSize / 2;
      const baseColor = burst.player === 'P1' ? 0x44FF88 : 0x44AAFF;
      const s = Math.min(colSize, rowSize);

      // 1 — Flash disc (fast fade-in, medium fade-out, first 35% of burst)
      if (t < 0.35) {
        const flashT = t / 0.35;
        const flashA = flashT < 0.2
          ? flashT / 0.2
          : 1 - (flashT - 0.2) / 0.8;
        const flashR = s * (0.5 + flashT * 1.5);
        this.scene.circle(cx, cy, flashR)
          .fill({ color: baseColor, alpha: flashA * 0.4 });
        this.scene.circle(cx, cy, flashR * 0.5)
          .fill({ color: 0xFFFFFF, alpha: flashA * 0.25 });
      }

      // 2 — Expanding rings (two rings, offset in time, travel outward)
      const dirVec = (dir: string): [number, number] => {
        if (dir === 'Right') return [1, 0];
        if (dir === 'Left')  return [-1, 0];
        if (dir === 'Down')  return [0, 1];
        return [0, -1]; // Up
      };
      const [px, py] = dirVec(burst.spawnDir);
      const [fx, fy] = dirVec(burst.forkDir);

      const ringAge = Math.max(0, t - 0.05);
      const ringR = s * ringAge * 3.5;
      const ringA = (1 - ringAge) * 0.7 * shimmer;
      // Ring in parent direction
      this.scene.circle(cx + px * ringR * 0.4, cy + py * ringR * 0.4, ringR)
        .stroke({ width: Math.max(1, s * 0.08), color: 0xFFFFFF, alpha: ringA * 0.5 });
      this.scene.circle(cx + px * ringR * 0.4, cy + py * ringR * 0.4, ringR)
        .stroke({ width: Math.max(1, s * 0.04), color: baseColor, alpha: ringA });
      // Ring in fork direction
      const ringR2 = s * Math.max(0, ringAge - 0.06) * 3.5;
      this.scene.circle(cx + fx * ringR2 * 0.4, cy + fy * ringR2 * 0.4, ringR2)
        .stroke({ width: Math.max(1, s * 0.08), color: 0xFFFFFF, alpha: ringA * 0.5 });
      this.scene.circle(cx + fx * ringR2 * 0.4, cy + fy * ringR2 * 0.4, ringR2)
        .stroke({ width: Math.max(1, s * 0.04), color: baseColor, alpha: ringA });

      // 3 — Trailing glow lines along each diverge direction
      const lineLen = s * t * 6;
      const lineA = (1 - t) * 0.55;
      const lw = Math.max(1, s * 0.1);
      this.scene
        .moveTo(cx, cy)
        .lineTo(cx + px * lineLen, cy + py * lineLen)
        .stroke({ width: lw, color: baseColor, alpha: lineA });
      this.scene
        .moveTo(cx, cy)
        .lineTo(cx + fx * lineLen, cy + fy * lineLen)
        .stroke({ width: lw, color: baseColor, alpha: lineA });
    }
  }

  /**
   * Draws all active fork chains. Each clone is rendered with a tinted
   * glow matching the owning player, fading in the final 3 seconds.
   */
  private drawForkChains(state: GameState, colSize: number, rowSize: number, now: number): void {
    const FADE_START = POWERUP_FORK_FADE_START_TICKS;
    const TOTAL = POWERUP_FORK_DURATION_TICKS;
    for (const fork of state.forkChains) {
      const age = state.tickCount - fork.spawnTick;
      const alpha = age < FADE_START
        ? 1.0
        : 1.0 - (age - FADE_START) / (TOTAL - FADE_START);
      const clampedAlpha = Math.max(0, Math.min(1, alpha));

      const baseColor = fork.player === 'P1' ? 0x44FF88 : 0x44AAFF;
      const s = Math.min(colSize, rowSize);

      // Body segments (tail to just before head)
      const allSegs = [fork.snake.head, ...fork.snake.body];
      for (let i = allSegs.length - 1; i >= 0; i--) {
        const seg = allSegs[i];
        const isHead = i === 0;
        const segAlpha = clampedAlpha * (isHead ? 0.95 : 0.55 - i * 0.003);
        const pad = isHead ? 1 : 2;
        this.scene
          .rect(seg[0] * colSize + pad, seg[1] * rowSize + pad, colSize - pad * 2, rowSize - pad * 2)
          .fill({ color: baseColor, alpha: Math.max(0, segAlpha) });
      }

      // Glow outline around head
      const h = fork.snake.head;
      const glowPulse = 0.5 + 0.5 * Math.sin(now / 300 + fork.spawnTick);
      const glowW = Math.max(1, s * 0.12);
      this.scene
        .rect(h[0] * colSize + glowW / 2, h[1] * rowSize + glowW / 2, colSize - glowW, rowSize - glowW)
        .stroke({ width: glowW, color: baseColor, alpha: clampedAlpha * (0.5 + glowPulse * 0.4) });
      // Bright inner dot
      const dotR = s * 0.18;
      this.scene
        .circle(h[0] * colSize + colSize / 2, h[1] * rowSize + rowSize / 2, dotR)
        .fill({ color: 0xFFFFFF, alpha: clampedAlpha * 0.7 });
    }
  }

  // ── Power-up item drawing ──────────────────────────────────────────────────

  private drawPowerUpItem(pos: GridPos, type: string, colSize: number, rowSize: number): void {
    const cx = pos[0] * colSize + colSize / 2;
    const cy = pos[1] * rowSize + rowSize / 2;
    const r = Math.min(colSize, rowSize) * 0.42;
    const color = POWERUP_COLORS[type] ?? 0xffffff;
    const tick = Date.now() / 800;
    const pulse = 0.75 + 0.25 * Math.sin(tick * 2);

    // Octagon shape (8 sides)
    const octPoints: number[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 8;
      octPoints.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }

    // Outer glow
    this.scene.circle(cx, cy, r * 1.6).fill({ color, alpha: 0.08 * pulse });
    this.scene.circle(cx, cy, r * 1.3).fill({ color, alpha: 0.12 * pulse });

    // Octagon fill
    this.scene.poly(octPoints).fill({ color: 0x000000, alpha: 0.7 });
    this.scene.poly(octPoints).stroke({ width: 1.5, color, alpha: 0.9 * pulse });

    // Inner symbol (small filled circle)
    this.scene.circle(cx, cy, r * 0.35).fill({ color, alpha: 0.85 * pulse });
  }

  private static readonly POWERUP_SHORT: Record<string, string> = {
    SURGE:     'SURGE',
    FREEZE:    'FREEZE',
    PHANTOM:   'GHOST',
    ANCHOR:    'ANCHOR',
    AMPLIFIER: 'AMP',
    DECOY:     'DECOY',
    FORK:      'FORK',
  };

  private drawPowerUpLabel(pos: GridPos, type: string, colSize: number, rowSize: number): void {
    const color = POWERUP_COLORS[type] ?? 0xffffff;
    const cx = pos[0] * colSize + colSize / 2;
    const cy = pos[1] * rowSize + rowSize / 2;
    const tick = Date.now() / 800;
    const pulse = 0.75 + 0.25 * Math.sin(tick * 2);
    const label = PixiGameRenderer.POWERUP_SHORT[type] ?? type.slice(0, 5);
    const hex = `#${color.toString(16).padStart(6, '0')}`;

    // Name below octagon
    const nameText = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: 'BureauGrotesque',
        fontSize: Math.max(7, rowSize * 0.58),
        fill: hex,
        fontWeight: '700',
        align: 'center',
        letterSpacing: 0.5,
      }),
    });
    nameText.anchor.set(0.5, 0);
    nameText.position.set(cx, cy + rowSize * 0.46);
    nameText.alpha = pulse * 0.95;
    this.powerUpLabels.addChild(nameText);

    // First letter in center
    const letterText = new Text({
      text: type[0],
      style: new TextStyle({
        fontFamily: 'BureauGrotesque',
        fontSize: Math.max(10, rowSize * 0.72),
        fill: hex,
        fontWeight: '700',
        align: 'center',
      }),
    });
    letterText.anchor.set(0.5);
    letterText.position.set(cx, cy - rowSize * 0.04);
    letterText.alpha = pulse;
    this.powerUpLabels.addChild(letterText);
  }

  // ── Point text ─────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    if (this.fallbackCanvas && this.host) {
      this.host.removeChild(this.fallbackCanvas);
    }
    if (this.host) {
      this.host.innerHTML = '';
    }
    this.fallbackCanvas = null;
    this.fallbackCtx = null;
  }

  private drawPointText(
    text: string,
    x: number,
    y: number,
    color: number,
    alpha: number
  ): void {
    const pointText = new Text({
      text,
      style: new TextStyle({
        fontFamily: 'Inter',
        fontSize: 16,
        fill: color,
      }),
    });
    pointText.anchor.set(0.5);
    pointText.position.set(x, y);
    pointText.alpha = alpha;
    this.overlay.addChild(pointText);
    setTimeout(() => {
      this.overlay.removeChild(pointText);
      pointText.destroy();
    }, 0);
  }

  private createCountdownText(): Text {
    const text = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'BureauGrotesque',
        fill: '#ffffff',
        fontSize: 120,
        fontWeight: '500',
        align: 'center',
        stroke: { color: '#ffffff', width: 0 },
        padding: 48,
        dropShadow: {
          color: '#000000',
          alpha: 0.95,
          blur: 44,
          angle: 0,
          distance: 0,
        },
      }),
    });
    text.anchor.set(0.5);
    text.resolution = 2;
    return text;
  }

  private applyCountdownState(ticks: number): void {
    this.setCountdownActive(this.countdown3, true);
    this.setCountdownActive(this.countdown2, ticks > 10);
    this.setCountdownActive(this.countdown1, ticks > 20);
    this.setCountdownActive(this.countdownLfg, ticks > 30);
  }

  private setCountdownActive(text: Text, active: boolean): void {
    if (active) {
      text.style.fill = '#ffffff';
      text.style.stroke = { color: '#ffffff', width: 0 };
      text.style.dropShadow = {
        color: '#000000',
        alpha: 0.95,
        blur: 44,
        angle: 0,
        distance: 0,
      };
    } else {
      text.style.fill = 'rgba(255,255,255,0)';
      text.style.stroke = { color: '#ffffff', width: 1 };
      text.style.dropShadow = false;
    }
  }

  private createFallbackCanvas(): void {
    if (!this.host) return;
    this.fallbackCanvas = document.createElement('canvas');
    this.fallbackCanvas.style.width = '100%';
    this.fallbackCanvas.style.height = '100%';
    this.fallbackCanvas.style.display = 'block';
    this.host.appendChild(this.fallbackCanvas);
    this.fallbackCtx = this.fallbackCanvas.getContext('2d');
    this.resize();
  }

  private renderFallback(state: GameState, opts?: { replayView?: boolean }): void {
    if (!this.host || !this.fallbackCanvas || !this.fallbackCtx) return;
    const ctx = this.fallbackCtx;
    const width = this.fallbackCanvas.width;
    const height = this.fallbackCanvas.height;
    if (width <= 0 || height <= 0) {
      this.resize();
      return;
    }

    const colSize = width / state.cols;
    const rowSize = height / state.rows;

    ctx.clearRect(0, 0, width, height);

    // Dead zone
    if (state.shrinkBorder) {
      const sb = state.shrinkBorder;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, sb.left * colSize, height);
      ctx.fillRect((sb.right + 1) * colSize, 0, width, height);
      ctx.fillRect(sb.left * colSize, 0, (sb.right - sb.left + 1) * colSize, sb.top * rowSize);
      ctx.fillRect(sb.left * colSize, (sb.bottom + 1) * rowSize, (sb.right - sb.left + 1) * colSize, height);

      // Amber edge
      const edgeAlpha = sb.warningActive ? 0.5 : 0.15;
      ctx.fillStyle = `rgba(200,136,32,${edgeAlpha})`;
      const edgeW = colSize * 1.5;
      ctx.fillRect(sb.left * colSize, sb.top * rowSize, edgeW, (sb.bottom - sb.top + 1) * rowSize);
      ctx.fillRect((sb.right + 1) * colSize - edgeW, sb.top * rowSize, edgeW, (sb.bottom - sb.top + 1) * rowSize);
    }

    // Grid
    if (!state.meta.invisibleGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= state.cols; x += 1) {
        for (let y = 0; y <= state.rows; y += 1) {
          ctx.strokeRect(x * colSize, y * rowSize, colSize, rowSize);
        }
      }
    }

    // Obstacle walls
    for (const wall of state.obstacleWalls) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(wall.pos[0] * colSize, wall.pos[1] * rowSize, colSize, rowSize);
    }

    // Void cells
    for (const vc of state.voidCells) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(vc[0] * colSize, vc[1] * rowSize, colSize, rowSize);
    }

    // Pulse detection (fallback path shares same pulse arrays as PixiJS path)
    const nowFb = performance.now();
    if (state.gameStarted && !state.gameEnded) {
      if (this.prevScoreP1 >= 0 && state.score[0] > this.prevScoreP1) this.p1Pulses.push(nowFb);
      if (this.prevScoreP2 >= 0 && state.score[1] > this.prevScoreP2) this.p2Pulses.push(nowFb);
    } else if (!state.gameStarted) {
      this.p1Pulses = [];
      this.p2Pulses = [];
    }
    this.prevScoreP1 = state.score[0];
    this.prevScoreP2 = state.score[1];
    this.p1Pulses = this.p1Pulses.filter((t) => nowFb - t < PixiGameRenderer.PULSE_DURATION_MS);
    this.p2Pulses = this.p2Pulses.filter((t) => nowFb - t < PixiGameRenderer.PULSE_DURATION_MS);

    const fbP1Surging = state.activePowerUps.some((ap) => ap.type === 'SURGE'     && ap.player === 'P1');
    const fbP2Surging = state.activePowerUps.some((ap) => ap.type === 'SURGE'     && ap.player === 'P2');
    const fbP1Amped   = state.activePowerUps.some((ap) => ap.type === 'AMPLIFIER' && ap.player === 'P1');
    const fbP2Amped   = state.activePowerUps.some((ap) => ap.type === 'AMPLIFIER' && ap.player === 'P2');
    const fbP1Frozen  = state.activePowerUps.some((ap) => ap.type === 'FREEZE'    && ap.player === 'P1');
    const fbP2Frozen  = state.activePowerUps.some((ap) => ap.type === 'FREEZE'    && ap.player === 'P2');

    // FADE surge trails
    const FADE_FB = PixiGameRenderer.SURGE_TRAIL_FADE_MS;
    if (state.gameStarted && !state.gameEnded) {
      if (fbP1Surging) this.p1SurgeTrail.push({ pos: [state.p1.head[0], state.p1.head[1]], time: nowFb });
      if (fbP2Surging) this.p2SurgeTrail.push({ pos: [state.p2.head[0], state.p2.head[1]], time: nowFb });
    }
    this.p1SurgeTrail = this.p1SurgeTrail.filter((t) => nowFb - t.time < FADE_FB);
    this.p2SurgeTrail = this.p2SurgeTrail.filter((t) => nowFb - t.time < FADE_FB);
    for (const t of this.p1SurgeTrail) {
      ctx.globalAlpha = (1 - (nowFb - t.time) / FADE_FB) * 0.6;
      ctx.fillStyle = '#FF7200';
      ctx.fillRect(t.pos[0] * colSize + 1, t.pos[1] * rowSize + 1, colSize - 2, rowSize - 2);
    }
    for (const t of this.p2SurgeTrail) {
      ctx.globalAlpha = (1 - (nowFb - t.time) / FADE_FB) * 0.6;
      ctx.fillStyle = '#FF7200';
      ctx.fillRect(t.pos[0] * colSize + 1, t.pos[1] * rowSize + 1, colSize - 2, rowSize - 2);
    }
    ctx.globalAlpha = 1;

    // ── Fallback 3D ghost layers — 3-board perspective stack ─────────────────
    if (state.meta.layers3D) {
      // Ghost boards always show the same wall layout; layer-1 coinbases on back board
      const ghostWalls = state.obstacleWalls;
      const ghostCoins = state.coinbases.filter((c) => c.layer === 1);
      const boardW = state.cols * colSize;
      const boardH = state.rows * rowSize;
      // Back layer is always upper-right (fixed perspective)
      const dX = colSize * 3.0;
      const dY = -rowSize * 1.85;

      // Corner helper
      const fbCorners = (scale: number, xs: number, ys: number) => {
        const gW = state.cols * colSize * scale;
        const gH = state.rows * rowSize * scale;
        const ox = (boardW - gW) / 2 + xs;
        const oy = (boardH - gH) / 2 + ys;
        return [[ox, oy], [ox + gW, oy], [ox, oy + gH], [ox + gW, oy + gH]];
      };
      const fc0 = fbCorners(1.00, 0,      0     );
      const fc1 = fbCorners(0.72, dX,     dY    );
      const fc2 = fbCorners(0.50, dX * 2, dY * 2);

      // Shaft lines (drawn before ghost boards so they appear behind)
      const drawFbShafts = (from: number[][], to: number[][], alpha: number) => {
        ctx.globalAlpha = alpha; ctx.strokeStyle = '#3355aa'; ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath(); ctx.moveTo(from[i][0], from[i][1]); ctx.lineTo(to[i][0], to[i][1]); ctx.stroke();
        }
      };
      drawFbShafts(fc2, fc1, 0.18);
      drawFbShafts(fc1, fc0, 0.28);

      // Helper: draw one ghost board on the fallback canvas
      const drawFbGhost = (scale: number, xShift: number, yShift: number, wAlpha: number, cAlpha: number) => {
        const gCS    = colSize * scale;
        const gRS    = rowSize * scale;
        const ghostW = state.cols * gCS;
        const ghostH = state.rows * gRS;
        const xOff   = (boardW - ghostW) / 2 + xShift;
        const yOff   = (boardH - ghostH) / 2 + yShift;
        // Border
        ctx.globalAlpha = wAlpha * 0.9; ctx.strokeStyle = '#4466aa'; ctx.lineWidth = 1.5;
        ctx.strokeRect(xOff, yOff, ghostW, ghostH);
        // Grid
        ctx.globalAlpha = wAlpha * 0.35; ctx.strokeStyle = '#223366'; ctx.lineWidth = 1;
        for (let x = 0; x <= state.cols; x += 4) {
          ctx.beginPath(); ctx.moveTo(xOff + x * gCS, yOff); ctx.lineTo(xOff + x * gCS, yOff + ghostH); ctx.stroke();
        }
        for (let y = 0; y <= state.rows; y += 4) {
          ctx.beginPath(); ctx.moveTo(xOff, yOff + y * gRS); ctx.lineTo(xOff + ghostW, yOff + y * gRS); ctx.stroke();
        }
        // Walls
        ctx.fillStyle = '#4477cc'; ctx.globalAlpha = wAlpha;
        for (const w of ghostWalls) ctx.fillRect(xOff + w.pos[0] * gCS, yOff + w.pos[1] * gRS, gCS, gRS);
        // Coinbases
        ctx.fillStyle = '#ff9910'; ctx.globalAlpha = cAlpha;
        for (const cb of ghostCoins) {
          const cx = xOff + (cb.pos[0] + 0.5) * gCS;
          const cy = yOff + (cb.pos[1] + 0.5) * gRS;
          ctx.beginPath(); ctx.arc(cx, cy, Math.min(gCS, gRS) * 0.26, 0, Math.PI * 2); ctx.fill();
        }
      };

      // Draw deepest echo then near ghost (painter's order)
      drawFbGhost(0.50, dX * 2, dY * 2, 0.11, 0.15);
      drawFbGhost(0.72, dX,     dY,     0.26, 0.34);
      ctx.globalAlpha = 1;
    }

    // ── Fork bursts (fallback) ─────────────────────────────────────────────
    for (const burst of (state.forkBursts ?? [])) {
      const age = state.tickCount - burst.tick;
      const BURST = POWERUP_FORK_BURST_TICKS;
      if (age >= BURST) continue;
      const t = age / BURST;
      const bx = burst.pos[0] * colSize + colSize / 2;
      const by = burst.pos[1] * rowSize + rowSize / 2;
      const hexColor = burst.player === 'P1' ? '#44FF88' : '#44AAFF';
      const s = Math.min(colSize, rowSize);
      const dirVecFb = (dir: string): [number, number] => {
        if (dir === 'Right') return [1, 0];
        if (dir === 'Left')  return [-1, 0];
        if (dir === 'Down')  return [0, 1];
        return [0, -1];
      };
      const [px, py] = dirVecFb(burst.spawnDir);
      const [fx, fy] = dirVecFb(burst.forkDir);
      // Flash disc
      if (t < 0.35) {
        const ft = t / 0.35;
        const fa = (ft < 0.2 ? ft / 0.2 : 1 - (ft - 0.2) / 0.8) * 0.35;
        ctx.globalAlpha = fa;
        ctx.fillStyle = hexColor;
        ctx.beginPath(); ctx.arc(bx, by, s * (0.5 + ft * 1.5), 0, Math.PI * 2); ctx.fill();
      }
      // Expanding ring
      const ringAge = Math.max(0, t - 0.05);
      const ringR = s * ringAge * 3.5;
      const ringA = (1 - ringAge) * 0.7;
      ctx.strokeStyle = hexColor; ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.globalAlpha = ringA;
      ctx.beginPath(); ctx.arc(bx + px * ringR * 0.4, by + py * ringR * 0.4, ringR, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx + fx * ringR * 0.4, by + fy * ringR * 0.4, ringR, 0, Math.PI * 2); ctx.stroke();
      // Trailing lines
      const lineLen = s * t * 6;
      const lineA = (1 - t) * 0.55;
      ctx.strokeStyle = hexColor; ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.globalAlpha = lineA;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + px * lineLen, by + py * lineLen); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + fx * lineLen, by + fy * lineLen); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Fork chains (fallback) ─────────────────────────────────────────────
    for (const fork of (state.forkChains ?? [])) {
      const age = state.tickCount - fork.spawnTick;
      const alpha = age < POWERUP_FORK_FADE_START_TICKS
        ? 1.0
        : 1.0 - (age - POWERUP_FORK_FADE_START_TICKS) / (POWERUP_FORK_DURATION_TICKS - POWERUP_FORK_FADE_START_TICKS);
      const clampedA = Math.max(0, Math.min(1, alpha));
      const hexColor = fork.player === 'P1' ? '#44FF88' : '#44AAFF';
      // Body
      const allSegs = [fork.snake.head, ...fork.snake.body];
      for (let i = allSegs.length - 1; i >= 0; i--) {
        const seg = allSegs[i];
        const isHead = i === 0;
        const segA = clampedA * (isHead ? 0.9 : Math.max(0.1, 0.5 - i * 0.003));
        ctx.globalAlpha = segA;
        ctx.fillStyle = hexColor;
        const pad = isHead ? 1 : 2;
        ctx.fillRect(seg[0] * colSize + pad, seg[1] * rowSize + pad, colSize - pad * 2, rowSize - pad * 2);
      }
      // Head glow ring
      const h = fork.snake.head;
      const gp = 0.5 + 0.5 * Math.sin(nowFb / 300 + fork.spawnTick);
      ctx.globalAlpha = clampedA * (0.5 + gp * 0.4);
      ctx.strokeStyle = hexColor;
      ctx.lineWidth = Math.max(1, Math.min(colSize, rowSize) * 0.12);
      ctx.strokeRect(h[0] * colSize + 1, h[1] * rowSize + 1, colSize - 2, rowSize - 2);
      ctx.globalAlpha = 1;
    }

    // ── Fallback layer-depth transform (chains on layer 1 appear on ghost board) ─
    const fbBoardW = state.cols * colSize;
    const fbBoardH = state.rows * rowSize;
    const fbGetLayerTr = (layer: number) => {
      if (!state.meta.layers3D || layer === 0) return null;
      const dX = colSize * 3.0, dY = -rowSize * 1.85, sc = 0.72;
      return { ox: (fbBoardW - fbBoardW * sc) / 2 + dX, oy: (fbBoardH - fbBoardH * sc) / 2 + dY, sc };
    };
    const fbP1Tr = fbGetLayerTr(state.p1Layer);
    const fbP2Tr = fbGetLayerTr(state.p2Layer);

    // P1
    const p1Total = 1 + state.p1.body.length;
    if (fbP1Tr) { ctx.save(); ctx.translate(fbP1Tr.ox, fbP1Tr.oy); ctx.scale(fbP1Tr.sc, fbP1Tr.sc); }
    // AMP under-glow
    if (fbP1Amped) {
      const ampP = 0.5 + 0.5 * Math.sin(nowFb / 220);
      const expand = 2 + ampP * 3;
      ctx.globalAlpha = 0.18 + ampP * 0.22;
      ctx.fillStyle = '#FFBB00';
      ctx.fillRect(state.p1.head[0] * colSize - expand, state.p1.head[1] * rowSize - expand, colSize + expand * 2, rowSize + expand * 2);
      for (const seg of state.p1.body) {
        ctx.fillRect(seg[0] * colSize - expand * 0.5, seg[1] * rowSize - expand * 0.5, colSize + expand, rowSize + expand);
      }
      ctx.globalAlpha = 1;
    }
    // Extra snakes (teams / ffa) – drawn behind main snakes
    for (const extra of (state.extraSnakes ?? [])) {
      const hexStr = '#' + extra.color.toString(16).padStart(6, '0');
      ctx.fillStyle = hexStr;
      ctx.fillRect(extra.snake.head[0] * colSize, extra.snake.head[1] * rowSize, colSize, rowSize);
      ctx.globalAlpha = 0.75;
      for (const seg of extra.snake.body) {
        ctx.fillRect(seg[0] * colSize, seg[1] * rowSize, colSize, rowSize);
      }
      ctx.globalAlpha = 1;
      // Ally / shadow: solid inset border
      if (extra.outline != null) {
        const lw = Math.max(1, Math.min(colSize, rowSize) * 0.05);
        ctx.strokeStyle = '#' + extra.outline.toString(16).padStart(6, '0');
        ctx.lineWidth = lw;
        ctx.globalAlpha = 0.7;
        for (const seg of [extra.snake.head, ...extra.snake.body]) {
          ctx.strokeRect(
            seg[0] * colSize + lw / 2,
            seg[1] * rowSize + lw / 2,
            colSize - lw,
            rowSize - lw,
          );
        }
        ctx.globalAlpha = 1;
      }
    }

    ctx.fillStyle = '#ffffff';
    // Head halo
    const p1HeadBoost = this.getSegmentGlow(0, p1Total, this.p1Pulses, nowFb);
    if (p1HeadBoost > 0) {
      const exp = p1HeadBoost * 4;
      ctx.globalAlpha = p1HeadBoost * 0.35;
      ctx.fillRect(state.p1.head[0] * colSize - exp, state.p1.head[1] * rowSize - exp, colSize + exp * 2, rowSize + exp * 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillRect(state.p1.head[0] * colSize, state.p1.head[1] * rowSize, colSize, rowSize);
    if (fbP1Surging) {
      const sp = 0.7 + 0.3 * Math.sin(nowFb / 80);
      ctx.globalAlpha = sp; ctx.strokeStyle = '#FF7200'; ctx.lineWidth = 2.5;
      ctx.strokeRect(state.p1.head[0] * colSize - 2, state.p1.head[1] * rowSize - 2, colSize + 4, rowSize + 4);
      ctx.globalAlpha = 1;
    }
    if (fbP1Amped) {
      const ap = 0.6 + 0.4 * Math.sin(nowFb / 220);
      ctx.globalAlpha = ap; ctx.strokeStyle = '#FFBB00'; ctx.lineWidth = 2;
      ctx.strokeRect(state.p1.head[0] * colSize - 2, state.p1.head[1] * rowSize - 2, colSize + 4, rowSize + 4);
      ctx.globalAlpha = 1;
    }
    if (fbP1Frozen) {
      ctx.globalAlpha = 0.7; ctx.strokeStyle = '#3090C8'; ctx.lineWidth = 2;
      ctx.strokeRect(state.p1.head[0] * colSize - 2, state.p1.head[1] * rowSize - 2, colSize + 4, rowSize + 4);
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < state.p1.body.length; i++) {
      const boost = this.getSegmentGlow(i + 1, p1Total, this.p1Pulses, nowFb);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = Math.min(1, 0.6 + boost * 0.36);
      ctx.fillRect(state.p1.body[i][0] * colSize, state.p1.body[i][1] * rowSize, colSize, rowSize);
      ctx.globalAlpha = 1;
      if (fbP1Surging) {
        const sp = 0.5 + 0.3 * Math.sin(nowFb / 80 + i * 0.4);
        ctx.globalAlpha = sp; ctx.strokeStyle = '#FF7200'; ctx.lineWidth = 1.5;
        ctx.strokeRect(state.p1.body[i][0] * colSize - 1, state.p1.body[i][1] * rowSize - 1, colSize + 2, rowSize + 2);
        ctx.globalAlpha = 1;
      }
      if (fbP1Amped) {
        const ap = (0.4 + 0.3 * Math.sin(nowFb / 220 + i * 0.2)) * 0.7;
        ctx.globalAlpha = ap; ctx.strokeStyle = '#FFBB00'; ctx.lineWidth = 1.5;
        ctx.strokeRect(state.p1.body[i][0] * colSize - 1, state.p1.body[i][1] * rowSize - 1, colSize + 2, rowSize + 2);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
    if (fbP1Tr) ctx.restore();

    // P2
    const p2Total = 1 + state.p2.body.length;
    if (fbP2Tr) { ctx.save(); ctx.translate(fbP2Tr.ox, fbP2Tr.oy); ctx.scale(fbP2Tr.sc, fbP2Tr.sc); }
    if (fbP2Amped) {
      const ampP = 0.5 + 0.5 * Math.sin(nowFb / 220);
      const expand = 2 + ampP * 3;
      ctx.globalAlpha = 0.18 + ampP * 0.22;
      ctx.fillStyle = '#FFBB00';
      ctx.fillRect(state.p2.head[0] * colSize - expand, state.p2.head[1] * rowSize - expand, colSize + expand * 2, rowSize + expand * 2);
      for (const seg of state.p2.body) {
        ctx.fillRect(seg[0] * colSize - expand * 0.5, seg[1] * rowSize - expand * 0.5, colSize + expand, rowSize + expand);
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = state.meta?.teamMode === 'ffa' ? '#111111'
      : state.meta?.teamMode === 'teams' ? '#111111'
      : '#111111';
    const p2HeadBoost = this.getSegmentGlow(0, p2Total, this.p2Pulses, nowFb);
    if (p2HeadBoost > 0) {
      const exp = p2HeadBoost * 4;
      ctx.globalAlpha = p2HeadBoost * 0.3;
      ctx.fillStyle = '#dddddd';
      ctx.fillRect(state.p2.head[0] * colSize - exp, state.p2.head[1] * rowSize - exp, colSize + exp * 2, rowSize + exp * 2);
      ctx.fillStyle = '#111111';
    }
    ctx.globalAlpha = 1;
    ctx.fillRect(state.p2.head[0] * colSize, state.p2.head[1] * rowSize, colSize, rowSize);
    if (fbP2Surging) {
      const sp = 0.7 + 0.3 * Math.sin(nowFb / 80);
      ctx.globalAlpha = sp; ctx.strokeStyle = '#FF7200'; ctx.lineWidth = 2.5;
      ctx.strokeRect(state.p2.head[0] * colSize - 2, state.p2.head[1] * rowSize - 2, colSize + 4, rowSize + 4);
      ctx.globalAlpha = 1;
    }
    if (fbP2Amped) {
      const ap = 0.6 + 0.4 * Math.sin(nowFb / 220);
      ctx.globalAlpha = ap; ctx.strokeStyle = '#FFBB00'; ctx.lineWidth = 2;
      ctx.strokeRect(state.p2.head[0] * colSize - 2, state.p2.head[1] * rowSize - 2, colSize + 4, rowSize + 4);
      ctx.globalAlpha = 1;
    }
    if (fbP2Frozen) {
      ctx.globalAlpha = 0.7; ctx.strokeStyle = '#3090C8'; ctx.lineWidth = 2;
      ctx.strokeRect(state.p2.head[0] * colSize - 2, state.p2.head[1] * rowSize - 2, colSize + 4, rowSize + 4);
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < state.p2.body.length; i++) {
      const boost = this.getSegmentGlow(i + 1, p2Total, this.p2Pulses, nowFb);
      ctx.fillStyle = state.meta?.teamMode === 'ffa' ? '#111111'
        : state.meta?.teamMode === 'teams' ? '#111111'
        : '#111111';
      ctx.globalAlpha = Math.min(1, 0.6 + boost * 0.36);
      ctx.fillRect(state.p2.body[i][0] * colSize, state.p2.body[i][1] * rowSize, colSize, rowSize);
      ctx.globalAlpha = 1;
      if (boost > 0.05) {
        ctx.globalAlpha = boost * 0.28;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(state.p2.body[i][0] * colSize + 1, state.p2.body[i][1] * rowSize + 1, colSize - 2, rowSize - 2);
      }
      ctx.globalAlpha = 1;
      if (fbP2Surging) {
        const sp = 0.5 + 0.3 * Math.sin(nowFb / 80 + i * 0.4);
        ctx.globalAlpha = sp; ctx.strokeStyle = '#FF7200'; ctx.lineWidth = 1.5;
        ctx.strokeRect(state.p2.body[i][0] * colSize - 1, state.p2.body[i][1] * rowSize - 1, colSize + 2, rowSize + 2);
        ctx.globalAlpha = 1;
      }
      if (fbP2Amped) {
        const ap = (0.4 + 0.3 * Math.sin(nowFb / 220 + i * 0.2)) * 0.7;
        ctx.globalAlpha = ap; ctx.strokeStyle = '#FFBB00'; ctx.lineWidth = 1.5;
        ctx.strokeRect(state.p2.body[i][0] * colSize - 1, state.p2.body[i][1] * rowSize - 1, colSize + 2, rowSize + 2);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
    if (fbP2Tr) ctx.restore();

    // Teleport portals (fallback)
    if (state.teleportDoors?.length) {
      for (const door of state.teleportDoors) {
        for (const pos of [door.a, door.b]) {
          const pc = PORTAL_COLORS[door.colorIndex % PORTAL_COLORS.length];
          const pr = (pc >> 16) & 0xff;
          const pg = (pc >> 8) & 0xff;
          const pb = pc & 0xff;
          const pcss = `rgb(${pr},${pg},${pb})`;
          const pulseFb = 0.55 + 0.45 * Math.sin(nowFb / 280 + door.colorIndex * 1.4);
          const px0 = pos[0] * colSize;
          const py0 = pos[1] * rowSize;
          const pad = Math.min(colSize, rowSize) * 0.1;
          const lw = Math.max(2, Math.min(colSize, rowSize) * 0.12);
          // Outer glow square
          ctx.globalAlpha = 0.07 + pulseFb * 0.08;
          ctx.fillStyle = pcss;
          ctx.fillRect(px0 - pad, py0 - pad, colSize + pad * 2, rowSize + pad * 2);
          // Border square
          ctx.globalAlpha = 0.55 + pulseFb * 0.35;
          ctx.strokeStyle = pcss;
          ctx.lineWidth = lw;
          ctx.strokeRect(px0 + pad + lw / 2, py0 + pad + lw / 2, colSize - pad * 2 - lw, rowSize - pad * 2 - lw);
          // Bright center square
          const cs = Math.min(colSize, rowSize) * 0.18;
          const pcx = px0 + colSize / 2;
          const pcy = py0 + rowSize / 2;
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = pcss;
          ctx.fillRect(pcx - cs / 2, pcy - cs / 2, cs, cs);
          ctx.globalAlpha = 1;
        }
      }
    }


    // Coinbases (in 3D mode only show active-layer coinbases)
    // In 3D levels main board always shows layer-0 coinbases; layer-1 appear on ghost board
    const fbActiveCoinbases = state.meta.layers3D
      ? state.coinbases.filter((cb) => cb.layer === undefined || cb.layer === 0)
      : state.coinbases;
    for (const cb of fbActiveCoinbases) {
      const cx = cb.pos[0] * colSize + colSize / 2;
      const cy = cb.pos[1] * rowSize + rowSize / 2;
      const radius = rowSize / 2 - rowSize / 5.4;
      ctx.beginPath();
      ctx.arc(cx, cy, cb.isBounty ? radius * 1.5 : radius, 0, Math.PI * 2);
      ctx.fillStyle = cb.isBounty ? `#${BOUNTY_COINBASE_COLOR.toString(16).padStart(6, '0')}` : '#ffffff';
      ctx.shadowColor = cb.isBounty ? '#C89020' : '#ffffff';
      ctx.shadowBlur = cb.isBounty ? 30 : 20;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (cb.reward) {
        const rings = cb.reward === 2 ? 2 : cb.reward === 4 ? 3 : cb.reward === 8 ? 4 : cb.reward === 16 ? 5 : 6;
        let ta = 1;
        for (let ring = rings; ring > 0; ring -= 1) {
          const alpha = 0.1 / rings + ta / 20;
          ctx.beginPath();
          ctx.arc(cx, cy, radius + ring * rowSize * 0.38, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ta++;
        }
      }
    }

    // Power-up items (fallback: colored squares)
    for (const item of state.powerUpItems) {
      const color = POWERUP_COLORS[item.type] ?? 0xffffff;
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
      ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
      ctx.fillRect(item.pos[0] * colSize + 2, item.pos[1] * rowSize + 2, colSize - 4, rowSize - 4);
      const shortLabel = PixiGameRenderer.POWERUP_SHORT[item.type] ?? item.type.slice(0, 5);
      const cx2 = item.pos[0] * colSize + colSize / 2;
      const cy2 = item.pos[1] * rowSize + rowSize / 2;
      // First letter centered
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.floor(rowSize * 0.72)}px BureauGrotesque`;
      ctx.fillText(item.type[0], cx2, cy2 - rowSize * 0.04);
      // Full short name below
      ctx.font = `bold ${Math.floor(rowSize * 0.58)}px BureauGrotesque`;
      ctx.textBaseline = 'top';
      ctx.fillText(shortLabel, cx2, cy2 + rowSize * 0.46);
    }

    // Resolving blocks (Canvas2D fallback)
    const resolveProgressFb = this.getResolveProgress(state);
    if (resolveProgressFb > 0) {
      const cols2 = state.cols;
      const rows2 = state.rows;
      const maxDist2 = Math.min(Math.floor(cols2 / 2), Math.floor(rows2 / 2));
      for (let x = 0; x < cols2; x++) {
        for (let y = 0; y < rows2; y++) {
          const distFromEdge = Math.min(x, cols2 - 1 - x, y, rows2 - 1 - y);
          const hashOff = ((x * 2654435761 + y * 2246822519) >>> 0) % 1000 / 1000;
          const threshold = (distFromEdge + hashOff * 0.6) / maxDist2;
          if (resolveProgressFb < threshold) continue;
          const px = x * colSize;
          const py = y * rowSize;
          const blockAlpha = Math.min(1, (resolveProgressFb - threshold) * 6 + 0.6);
          ctx.globalAlpha = blockAlpha * 0.9;
          ctx.fillStyle = '#C88820';
          ctx.fillRect(px, py, colSize, rowSize);
          ctx.globalAlpha = blockAlpha * 0.75;
          ctx.fillStyle = '#7A5010';
          ctx.fillRect(px + 1, py + 1, colSize - 2, rowSize - 2);
          ctx.globalAlpha = blockAlpha * 0.6;
          ctx.fillStyle = '#1A0E00';
          ctx.fillRect(px + 2, py + 2, colSize - 4, rowSize - 4);
        }
      }
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    if (!state.gameStarted && !state.gameEnded && !state.countdownStart) {
      ctx.font = `${Math.floor(width / 17)}px BureauGrotesque`;
      ctx.fillText('PRESS BUTTON TO START', width / 2, height / 2);
    } else if (state.countdownStart) {
      const countdownText =
        state.countdownTicks <= 10 ? '3' : state.countdownTicks <= 20 ? '2' : state.countdownTicks <= 30 ? '1' : 'LFG';
      ctx.font = `${Math.floor(height * 0.5)}px BureauGrotesque`;
      ctx.fillText(countdownText, width / 2, height / 2);
    } else if (state.gameEnded) {
      if (resolveProgressFb >= 1.0 || !state.convergenceWallClosed) {
        ctx.font = `${Math.floor(width / 17)}px BureauGrotesque`;
        ctx.fillText(`${state.winnerName.toUpperCase()} WINS!`, width / 2, height / 2 - 10);
        if (!opts?.replayView) {
          ctx.font = `${Math.floor(width / 39)}px BureauGrotesque`;
          ctx.fillText('PRESS ANY BUTTON TO CONTINUE', width / 2, height / 2 + 35);
        }
      }
    }
  }
}
