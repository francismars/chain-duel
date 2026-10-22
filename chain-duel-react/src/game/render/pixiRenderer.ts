import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameState, GridPos, PowerUpType } from '@/game/engine/types';
import { P2_SNAKE_COLOR, POWERUP_COLORS } from '@/game/engine/constants';
import {
  drawPowerUpIconPixi,
  drawPowerUpIconCanvas,
  drawPowerUpTileCanvas,
} from '@/game/engine/powerUpIcons';
import { preStartControllerBobPx } from '@/game/controllerTest';
import type { GameSeatIndex } from '@/game/controllerTest';
import {
  getSnakeEffects,
  type PowerUpPlayerIndex,
} from '@/game/engine/powerups';
import { clearPreMatchKeyHighlight } from '@/game/render/preMatchKeyHighlight';
import {
  anyCaptureAnimFlag,
  captureAnimFlags,
  type CaptureAnimFlags,
} from '@/game/render/captureAnimFlags';
import {
  fitStartPromptToBoard,
  measureStartWordWidth,
  START_PROMPT_GAP_RATIO,
  START_PROMPT_WORDS,
  START_WORD_SHADOW_BLUR,
  startPromptLineWidth,
  type CanvasObjectivesOpts,
} from '@/game/render/matchObjectives';
import {
  CanvasObjectivesOverlay,
} from '@/game/render/canvasObjectivesOverlay';
import {
  CanvasControlsOverlay,
  drawCanvasControlsFallback,
} from '@/game/render/canvasControlsOverlay';
import {
  OnlineStartReadyOverlay,
  drawOnlineStartReadyFallback,
  onlineStartReadyAlpha,
} from '@/game/render/onlineStartReadyOverlay';
import {
  drawPointChangesCanvas,
  PointChangeOverlay,
} from '@/game/render/pointChangeOverlay';
import {
  drawStreakPopsCanvas,
  StreakPopOverlay,
} from '@/game/render/streakPopOverlay';
import { streakPops } from '@/game/audio/tensionDebug';
import {
  EndGameOverlay,
  END_OVERLAY_DELAY_MS,
  END_RESOLVE_DURATION_MS,
  endOverlayRevealDurationMs,
} from './endGameOverlay';
import { pixiTextResolution } from '@/game/render/pixiTextResolution';

type CapturePulse = { startMs: number; reward: number };

export type PixiRenderOpts = {
  replayView?: boolean;
  challengeContinueLabel?: string;
  suppressVictoryOverlay?: boolean;
  canvasObjectives?: CanvasObjectivesOpts;
};

export class PixiGameRenderer {
  private app: Application | null = null;
  private fallbackCanvas: HTMLCanvasElement | null = null;
  private fallbackCtx: CanvasRenderingContext2D | null = null;
  private host: HTMLElement | null = null;
  private root: Container = new Container();
  private deadZone: Graphics = new Graphics();
  private grid: Graphics = new Graphics();
  private scene: Graphics = new Graphics();
  private overlay: Container = new Container();
  private resolveAnimStartMs: number | null = null;
  /** When the end overlay first became eligible; delay starts from this. */
  private endOverlayEligibleAtMs: number | null = null;
  /** When the staggered end-screen reveal began (after the settle delay). */
  private endOverlayAnimStartMs: number | null = null;
  /** True after the reveal finished (or was suppressed). */
  private endOverlayRevealDone = false;
  // Coinbase capture pulse tracking
  private prevScoreP1 = -1;
  private prevScoreP2 = -1;
  private p1Pulses: CapturePulse[] = [];
  private p2Pulses: CapturePulse[] = [];
  private growAt: Record<string, number> = {};
  private captureScales: { pos: GridPos; startMs: number }[] = [];
  private prevCoins: { pos: GridPos; reward: number }[] = [];
  private prevBodyLen: { p1: number; p2: number; extra: number[] } = {
    p1: -1,
    p2: -1,
    extra: [],
  };
  private captureNotedTick = -1;
  /** Lab preview. A real match leaves this empty and reads the applied recipe. */
  private captureAnimOverride: CaptureAnimFlags | null = null;
  private static readonly PULSE_DURATION_MS = 650;
  private static readonly PULSE_MAX_MS = 1000;
  private static readonly SCALE_MS = 390;
  private static readonly GROW_MS = 580;
  // SURGE fading-square trail
  private p1SurgeTrail: { pos: GridPos; time: number }[] = [];
  private p2SurgeTrail: { pos: GridPos; time: number }[] = [];
  private static readonly SURGE_TRAIL_FADE_MS = 480;
  private startWords: Text[] = [];
  private startWordsContainer: Container = new Container();
  private startPromptSubtext: Text;
  private startWordBaseStyle: TextStyle;
  private activeStartPromptWords: readonly string[] = START_PROMPT_WORDS;
  private objectives = new CanvasObjectivesOverlay();
  private startReady = new OnlineStartReadyOverlay();
  private controls = new CanvasControlsOverlay();
  private pointChangesOverlay = new PointChangeOverlay();
  private streakPopOverlay = new StreakPopOverlay();
  private startRevealTime = -1;
  private startLayoutKey = '';
  private startWordMeasureCtx: CanvasRenderingContext2D | null = null;
  private boardRevealTime = -1;
  private lastCountdownPhase: '3' | '2' | '1' | 'LFG' | null = null;
  private lastOverlayWidth = 0;
  private lastOverlayHeight = 0;
  private endOverlay = new EndGameOverlay();
  private countdown3: Text;
  private countdown2: Text;
  private countdown1: Text;
  private countdownLfg: Text;
  private gridCacheKey = '';
  private lastResizeWidth = 0;
  private lastResizeHeight = 0;
  /** Bumped on destroy / remount so in-flight async init cannot attach a stale canvas. */
  private mountGeneration = 0;
  private readonly textResolution = pixiTextResolution();

  constructor() {
    const startWordStyle = new TextStyle({
      fontFamily: 'BureauGrotesque',
      fill: '#ffffff',
      fontSize: 64,
      fontWeight: '500',
      padding: 48,
      dropShadow: {
        color: '#000000',
        alpha: 0.95,
        blur: 44,
        angle: 0,
        distance: 0,
      },
    });
    this.startWordBaseStyle = startWordStyle;
    for (const word of START_PROMPT_WORDS) {
      const t = new Text({ text: word, style: startWordStyle.clone() });
      t.anchor.set(0.5, 0.5);
      t.resolution = this.textResolution;
      t.alpha = 0;
      this.startWords.push(t);
      this.startWordsContainer.addChild(t);
    }
    this.startPromptSubtext = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fill: 'rgba(255,255,255,0.62)',
        fontSize: 14,
        fontWeight: '500',
        align: 'center',
      }),
    });
    this.startPromptSubtext.anchor.set(0.5, 0);
    this.startPromptSubtext.resolution = this.textResolution;
    this.startPromptSubtext.visible = false;
    this.countdown3 = this.createCountdownText('3');
    this.countdown2 = this.createCountdownText('2');
    this.countdown1 = this.createCountdownText('1');
    this.countdownLfg = this.createCountdownText('LFG');
  }

  private static async waitForHostLayout(
    host: HTMLElement,
    maxFrames = 12
  ): Promise<void> {
    for (let i = 0; i < maxFrames; i += 1) {
      if (host.clientWidth > 0 && host.clientHeight > 0) return;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    }
  }

  async mount(host: HTMLElement): Promise<void> {
    const generation = ++this.mountGeneration;
    this.host = host;
    host.innerHTML = '';
    await PixiGameRenderer.waitForHostLayout(host);
    // Load the brand faces before Pixi caches text metrics (also on direct game links).
    if (document.fonts) {
      await Promise.allSettled([
        document.fonts.load('16px BureauGrotesque'),
        document.fonts.load('16px Inter'),
      ]);
    }
    if (generation !== this.mountGeneration || this.host !== host) return;
    const initWidth = Math.max(1, host.clientWidth);
    const initHeight = Math.max(1, host.clientHeight);
    try {
      const app = new Application();
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        width: initWidth,
        height: initHeight,
        preference: 'webgl',
      });
      if (generation !== this.mountGeneration || this.host !== host) {
        app.destroy(true, { children: true });
        return;
      }
      this.app = app;
      host.appendChild(app.canvas);
      this.root.addChild(this.deadZone);
      this.root.addChild(this.grid);
      this.root.addChild(this.scene);
      this.overlay.addChild(this.startWordsContainer);
      this.overlay.addChild(this.startPromptSubtext);
      this.overlay.addChild(this.startReady.container);
      this.overlay.addChild(this.controls.container);
      this.overlay.addChild(this.objectives.container);
      this.overlay.addChild(this.countdown3);
      this.overlay.addChild(this.countdown2);
      this.overlay.addChild(this.countdown1);
      this.overlay.addChild(this.countdownLfg);
      this.overlay.addChild(this.pointChangesOverlay.container);
      this.overlay.addChild(this.streakPopOverlay.container);
      // Results cover the last capture's green/red amount popups.
      this.overlay.addChild(this.endOverlay.container);
      this.root.addChild(this.overlay);
      app.stage.addChild(this.root);
      this.resize();
    } catch {
      this.app = null;
      this.createFallbackCanvas();
      this.resize();
    }
  }

  resize(): void {
    if (!this.host) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    if (width === this.lastResizeWidth && height === this.lastResizeHeight)
      return;
    this.lastResizeWidth = width;
    this.lastResizeHeight = height;
    this.gridCacheKey = '';
    if (this.app) {
      this.app.renderer.resize(width, height);
      return;
    }
    if (this.fallbackCanvas) {
      this.fallbackCanvas.width = width;
      this.fallbackCanvas.height = height;
    }
  }

  /** True when a paint is needed for time-based motion (bridge still paints on sim ticks). */
  needsPaint(state: GameState): boolean {
    const preStart =
      !state.gameStarted && !state.countdownStart && !state.gameEnded;
    if (preStart) {
      if (this.shouldThrottleIdlePreStartPaint(state)) {
        return false;
      }
      // Keep painting until the player starts — otherwise the loop stops after
      // reveal animations and the board stays blank (transparent canvas + CSS bg).
      return true;
    }
    if (state.countdownStart && !state.gameStarted) {
      return true;
    }
    if (state.gameStarted && !state.gameEnded) {
      if ((state.pointChanges?.length ?? 0) > 0) return true;
      if (streakPops().length > 0) return true;
      if ((state.powerUpItems?.length ?? 0) > 0) return true;
      if (this.p1Pulses.length > 0 || this.p2Pulses.length > 0) return true;
      if (this.growAnimating(performance.now())) return true;
      if (this.captureScales.length > 0) return true;
      if (this.p1SurgeTrail.length > 0 || this.p2SurgeTrail.length > 0)
        return true;
      if (
        state.activePowerUps?.some(
          (ap) => ap.type === 'SURGE' || ap.type === 'AMPLIFIER'
        )
      ) {
        return true;
      }
      return false;
    }
    if (state.gameEnded) {
      const resolve = this.getResolveProgress(state);
      if (resolve > 0 && resolve < 1) return true;
      // Keep painting through the hold and the reveal frame itself.
      return this.needsEndOverlayPaint(state, resolve);
    }
    return false;
  }

  /** After board reveal settles and pre-match overlays are gone, idle paints may be skipped. */
  shouldThrottleIdlePreStartPaint(state: GameState): boolean {
    if (this.boardRevealTime === -1) {
      return false;
    }
    const boardElapsed = Math.max(
      0,
      performance.now() - this.boardRevealTime - 800
    );
    if (boardElapsed < 700) {
      return false;
    }
    if (this.preMatchOverlayVisible()) {
      return false;
    }
    if (state.countdownStart || state.gameStarted || state.gameEnded) {
      return false;
    }
    return true;
  }

  private preMatchOverlayVisible(): boolean {
    return (
      (this.objectives.container.visible &&
        this.objectives.container.alpha > 0.02) ||
      (this.controls.container.visible && this.controls.container.alpha > 0.02) ||
      (this.startReady.container.visible &&
        this.startReady.container.alpha > 0.02) ||
      this.startWords.some((t) => t.alpha > 0.02) ||
      (this.startPromptSubtext.visible && this.startPromptSubtext.alpha > 0.02)
    );
  }

  private finishPreMatchDismiss(): void {
    clearPreMatchKeyHighlight();
    this.objectives.hide();
    this.startReady.hide();
    this.controls.hide();
    this.startRevealTime = -1;
    this.startLayoutKey = '';
    this.startWordsContainer.scale.set(1);
    for (const t of this.startWords) {
      t.alpha = 0;
      t.y = 0;
    }
    this.startPromptSubtext.visible = false;
    this.startPromptSubtext.alpha = 0;
  }

  private syncStartPromptWords(words: readonly string[]): void {
    if (
      words.length === this.activeStartPromptWords.length &&
      words.every((word, i) => word === this.activeStartPromptWords[i])
    ) {
      return;
    }

    this.activeStartPromptWords = words;
    this.startLayoutKey = '';

    while (this.startWords.length < words.length) {
      const t = new Text({
        text: '',
        style: this.startWordBaseStyle.clone(),
      });
      t.anchor.set(0.5, 0.5);
      t.resolution = this.textResolution;
      t.alpha = 0;
      this.startWords.push(t);
      this.startWordsContainer.addChild(t);
    }

    for (let i = 0; i < this.startWords.length; i += 1) {
      const t = this.startWords[i];
      if (i < words.length) {
        t.text = words[i]!;
        t.visible = true;
      } else {
        t.visible = false;
        t.alpha = 0;
        t.y = 0;
      }
    }
  }

  /** Size and position start words so the full line fits; re-run when metrics change. */
  private measureStartWordGlyphWidth(word: string, fontSize: number): number {
    if (!this.startWordMeasureCtx) {
      const canvas = document.createElement('canvas');
      this.startWordMeasureCtx = canvas.getContext('2d');
    }
    const ctx = this.startWordMeasureCtx;
    if (!ctx) {
      return measureStartWordWidth(word, fontSize, 0);
    }
    ctx.font = `500 ${fontSize}px BureauGrotesque`;
    return measureStartWordWidth(
      word,
      fontSize,
      ctx.measureText(word).width
    );
  }

  private fitAndLayoutStartWords(
    width: number,
    height: number,
    words: readonly string[],
    opts: CanvasObjectivesOpts
  ): number {
    const wordWidthsForSize = (fontSize: number) =>
      words.map((word) => this.measureStartWordGlyphWidth(word, fontSize));

    const measureLine = (fontSize: number) =>
      startPromptLineWidth(fontSize, wordWidthsForSize(fontSize)) +
      START_WORD_SHADOW_BLUR;

    const fontSize = fitStartPromptToBoard(width, height, measureLine, opts);
    const gap = fontSize * START_PROMPT_GAP_RATIO;
    const wordWidths = wordWidthsForSize(fontSize);
    const widthSig = wordWidths.map((w) => Math.ceil(w)).join(',');
    const layoutKey = `${words.join('|')}:${width}x${height}:${Math.round(fontSize)}:${widthSig}`;
    if (layoutKey === this.startLayoutKey) {
      for (let i = 0; i < words.length; i += 1) {
        this.startWords[i].style.fontSize = fontSize;
      }
      return fontSize;
    }
    this.startLayoutKey = layoutKey;
    const totalW = startPromptLineWidth(fontSize, wordWidths);
    let x = -totalW / 2;
    for (let i = 0; i < words.length; i += 1) {
      const t = this.startWords[i];
      const w = wordWidths[i] ?? 0;
      t.style.fontSize = fontSize;
      t.x = x + w / 2;
      x += w + gap;
    }

    return fontSize;
  }

  setCaptureAnimOverride(flags: CaptureAnimFlags | null): void {
    this.captureAnimOverride = flags;
  }

  private animFlags(): CaptureAnimFlags {
    return this.captureAnimOverride ?? captureAnimFlags();
  }

  render(state: GameState, opts?: PixiRenderOpts): void {
    this.host?.closest('#gameCanvas')?.classList.toggle('game-result-active', state.gameEnded);
    if (!this.app) {
      this.renderFallback(state, opts);
      return;
    }
    const renderer = this.app.renderer;
    if (!renderer) {
      this.renderFallback(state, opts);
      return;
    }
    let width = this.host?.clientWidth ?? renderer.width;
    let height = this.host?.clientHeight ?? renderer.height;
    if (width <= 0 || height <= 0) {
      this.resize();
      width = this.host?.clientWidth ?? renderer.width;
      height = this.host?.clientHeight ?? renderer.height;
    }
    if (width > 0 && height > 0) {
      this.lastOverlayWidth = width;
      this.lastOverlayHeight = height;
    } else if (this.lastOverlayWidth > 0 && this.lastOverlayHeight > 0) {
      width = this.lastOverlayWidth;
      height = this.lastOverlayHeight;
    } else {
      return;
    }
    const colSize = width / state.cols;
    const rowSize = height / state.rows;

    // ── Dead zone / convergence overlay ─────────────────────────────────────
    this.deadZone.clear();
    if (state.shrinkBorder) {
      this.renderDeadZone(state, width, height, colSize, rowSize);
    }

    const resolveProgress = this.getResolveProgress(state);

    // ── Grid (cached; rebuild only on size change) ──
    const gridAlpha = 0.05;
    const cacheKey = `${width}|${height}|${state.cols}|${state.rows}|${gridAlpha.toFixed(3)}`;
    if (cacheKey !== this.gridCacheKey) {
      this.rebuildStaticGrid(state, colSize, rowSize, gridAlpha);
      this.gridCacheKey = cacheKey;
    }

    // ── Coinbase capture pulse detection ─────────────────────────────────────
    const now = performance.now();
    this.noteCaptures(state, now);

    // ── Scene ─────────────────────────────────────────────────────────────────
    this.scene.clear();

    // Obstacle walls
    for (const wall of state.obstacleWalls ?? []) {
      const px = wall.pos[0] * colSize;
      const py = wall.pos[1] * rowSize;
      this.scene
        .rect(px, py, colSize, rowSize)
        .fill({ color: 0xffffff, alpha: 0.8 });
      this.scene
        .rect(px + 1, py + 1, colSize - 2, rowSize - 2)
        .stroke({ width: 1, color: 0xffffff, alpha: 0.4 });
    }

    // ── Board reveal (pre-start only) ────────────────────────────────────────
    const preStart =
      !state.gameStarted && !state.countdownStart && !state.gameEnded;
    if (preStart) {
      if (this.boardRevealTime === -1) this.boardRevealTime = performance.now();
    } else {
      this.boardRevealTime = -1;
    }
    // Infinity = fully visible (during gameplay / after reveal completes).
    // 800ms initial delay lets the CSS canvas scale-in finish first.
    const boardElapsed =
      this.boardRevealTime !== -1
        ? Math.max(0, performance.now() - this.boardRevealTime - 800)
        : Infinity;

    // Snakes
    const p1Effects = getSnakeEffects(state, 0);
    const p2Effects = getSnakeEffects(state, 1);
    const p1Frozen = p1Effects.frozen;
    const p2Frozen = p2Effects.frozen;
    const p1Phantom = p1Effects.phantom;
    const p2Phantom = p2Effects.phantom;
    const p1Surging = p1Effects.surging;
    const p2Surging = p2Effects.surging;
    const p1Amped = p1Effects.amped;
    const p2Amped = p2Effects.amped;

    // Record surge trail positions each frame
    const FADE = PixiGameRenderer.SURGE_TRAIL_FADE_MS;
    if (state.gameStarted && !state.gameEnded) {
      if (p1Surging)
        this.p1SurgeTrail.push({
          pos: [state.p1.head[0], state.p1.head[1]],
          time: now,
        });
      if (p2Surging)
        this.p2SurgeTrail.push({
          pos: [state.p2.head[0], state.p2.head[1]],
          time: now,
        });
    }
    this.p1SurgeTrail = this.p1SurgeTrail.filter((t) => now - t.time < FADE);
    this.p2SurgeTrail = this.p2SurgeTrail.filter((t) => now - t.time < FADE);

    // Draw fading orange trail squares (rendered before snakes so snakes appear on top)
    for (const t of this.p1SurgeTrail) {
      const a = (1 - (now - t.time) / FADE) * 0.6;
      const pad = 1;
      this.scene
        .rect(
          t.pos[0] * colSize + pad,
          t.pos[1] * rowSize + pad,
          colSize - pad * 2,
          rowSize - pad * 2
        )
        .fill({ color: 0xff7200, alpha: a });
    }
    for (const t of this.p2SurgeTrail) {
      const a = (1 - (now - t.time) / FADE) * 0.6;
      const pad = 1;
      this.scene
        .rect(
          t.pos[0] * colSize + pad,
          t.pos[1] * rowSize + pad,
          colSize - pad * 2,
          rowSize - pad * 2
        )
        .fill({ color: 0xff7200, alpha: a });
    }

    // Extra snakes (teams / ffa) — drawn behind main snakes
    for (let ei = 0; ei < (state.extraSnakes ?? []).length; ei += 1) {
      const extra = state.extraSnakes[ei];
      const extraEffects = getSnakeEffects(
        state,
        (ei + 2) as PowerUpPlayerIndex
      );
      const extraBob = preStartControllerBobPx(
        state,
        (ei + 2) as GameSeatIndex,
        rowSize
      );
      this.drawSnake(
        extra.snake,
        extra.color,
        colSize,
        rowSize,
        extraEffects,
        [],
        now,
        boardElapsed,
        extraBob,
        `e${ei}`
      );
      // Ally / shadow border: solid inset outline distinguishes them from P1/P2
      if (extra.outline != null) {
        const lw = Math.max(1.5, Math.min(colSize, rowSize) * 0.1);
        const bob = extraBob;
        const segTop = (gy: number) => gy * rowSize - bob;
        const segH = rowSize + bob * 2;
        for (const seg of [extra.snake.head, ...extra.snake.body]) {
          this.scene
            .rect(
              seg[0] * colSize + lw / 2,
              segTop(seg[1]) + lw / 2,
              colSize - lw,
              segH - lw
            )
            .stroke({ width: lw, color: extra.outline, alpha: 0.85 });
        }
      }
    }

    const p1Bob = preStartControllerBobPx(state, 0, rowSize);
    this.drawSnake(
      state.p1,
      0xffffff,
      colSize,
      rowSize,
      {
        frozen: p1Frozen,
        phantom: p1Phantom,
        surging: p1Surging,
        amped: p1Amped,
      },
      this.p1Pulses,
      now,
      boardElapsed,
      p1Bob,
      'p1'
    );

    const p2Color = P2_SNAKE_COLOR;
    const p2Bob = preStartControllerBobPx(state, 1, rowSize);
    this.drawSnake(
      state.p2,
      p2Color,
      colSize,
      rowSize,
      {
        frozen: p2Frozen,
        phantom: p2Phantom,
        surging: p2Surging,
        amped: p2Amped,
      },
      this.p2Pulses,
      now,
      boardElapsed,
      p2Bob,
      'p2'
    );

    for (const cb of state.coinbases ?? []) {
      this.drawCoinbase(
        cb.pos,
        colSize,
        rowSize,
        {
          reward: cb.reward,
          isDecoy: cb.isDecoy,
        },
        boardElapsed
      );
    }

    // Power-up items
    for (const item of state.powerUpItems ?? []) {
      this.drawPowerUpItem(item.pos, item.type, colSize, rowSize, now);
    }

    // Point pop-ups (decay runs in useGameRenderBridge / online client anims)
    this.pointChangesOverlay.render(
      state.pointChanges ?? [],
      colSize,
      rowSize,
      width,
      height
    );
    if (this.streakPopOverlay.container.parent !== this.overlay) {
      this.overlay.addChild(this.streakPopOverlay.container);
    }
    this.streakPopOverlay.render(colSize, rowSize, width, height);

    // ── Text overlays ─────────────────────────────────────────────────────────
    this.endOverlay.hide();
    if (!state.gameEnded) {
      this.resetEndOverlayTiming();
    }

    const preMatch =
      !state.gameStarted && !state.gameEnded && !state.countdownStart;
    this.host
      ?.closest('#gameCanvas')
      ?.classList.toggle('is-prematch', preMatch);

    if (preMatch) {
      this.hideCountdownOverlay();
      const objOpts = opts?.canvasObjectives ?? {};
      if (this.startRevealTime === -1) this.startRevealTime = performance.now();
      this.objectives.hide();
      for (const word of this.startWords) {
        word.alpha = 0;
        word.visible = false;
      }
      this.startPromptSubtext.visible = false;
      this.controls.render(
        state,
        width,
        height,
        objOpts.controlSlots ?? [],
        this.startRevealTime,
        objOpts.controlLabelSlots
      );
      const readyAlpha = onlineStartReadyAlpha(
        Boolean(objOpts.onlineStartReady),
        1
      );
      this.startReady.render(
        colSize,
        rowSize,
        state.p1,
        state.p2,
        p1Bob,
        p2Bob,
        objOpts.onlineStartReady,
        readyAlpha
      );
    } else {
      this.startReady.hide();
      if (
        state.countdownStart &&
        !state.gameStarted &&
        this.preMatchOverlayVisible()
      ) {
        this.finishPreMatchDismiss();
      }

      if (state.countdownStart) {
        this.renderCountdownOverlay(state, width, height);
      } else {
        this.hideCountdownOverlay();
        if (state.gameEnded) {
          const elapsed = this.beginEndOverlayReveal(
            state,
            resolveProgress,
            Boolean(opts?.suppressVictoryOverlay)
          );
          if (elapsed !== null) {
            this.endOverlay.hide();
          }
        }
      }
    }

    // Keep WebGL buffer in sync with layout (avoids stretched / nested-frame artifacts).
    const rw = this.app.renderer.width;
    const rh = this.app.renderer.height;
    if (Math.abs(rw - width) > 1 || Math.abs(rh - height) > 1) {
      this.app.renderer.resize(width, height);
      this.lastResizeWidth = width;
      this.lastResizeHeight = height;
      this.gridCacheKey = '';
    }
    try {
      this.app.render();
    } catch {
      this.destroy();
    }
  }

  // ── Resolving blocks animation ─────────────────────────────────────────────

  private getResolveProgress(state: GameState): number {
    if (!state.convergenceWallClosed) {
      this.resolveAnimStartMs = null;
      return 0;
    }
    if (this.resolveAnimStartMs === null) {
      this.resolveAnimStartMs = performance.now();
    }
    return Math.min(
      1,
      (performance.now() - this.resolveAnimStartMs) / END_RESOLVE_DURATION_MS
    );
  }

  private resetEndOverlayTiming(): void {
    this.endOverlayEligibleAtMs = null;
    this.endOverlayAnimStartMs = null;
    this.endOverlayRevealDone = false;
  }

  /** Board settled enough for the winner overlay (blocks done, or no resolve anim). */
  private isEndOverlayEligible(
    state: GameState,
    resolveProgress: number
  ): boolean {
    if (!state.gameEnded) {
      this.resetEndOverlayTiming();
      return false;
    }
    return resolveProgress >= 1.0 || !state.convergenceWallClosed;
  }

  private armEndOverlayDelay(
    state: GameState,
    resolveProgress: number
  ): boolean {
    if (!this.isEndOverlayEligible(state, resolveProgress)) return false;
    if (this.endOverlayEligibleAtMs === null) {
      this.endOverlayEligibleAtMs = performance.now();
    }
    return true;
  }

  /** Keep painting through the settle hold and staggered reveal. */
  private needsEndOverlayPaint(
    state: GameState,
    resolveProgress: number
  ): boolean {
    if (this.endOverlayRevealDone) return false;
    if (!this.armEndOverlayDelay(state, resolveProgress)) return false;
    return true;
  }

  /**
   * After the settle delay, starts the stagger clock and returns elapsed ms.
   * Suppressed overlays skip the animation and mark the reveal done.
   * Returns null while still in the settle hold.
   */
  private beginEndOverlayReveal(
    state: GameState,
    resolveProgress: number,
    suppressed: boolean
  ): number | null {
    if (this.endOverlayRevealDone && this.endOverlayAnimStartMs !== null) {
      return endOverlayRevealDurationMs();
    }
    if (!this.armEndOverlayDelay(state, resolveProgress)) return null;
    const sinceEligible =
      performance.now() - (this.endOverlayEligibleAtMs as number);
    if (sinceEligible < END_OVERLAY_DELAY_MS) return null;

    if (suppressed) {
      this.endOverlayRevealDone = true;
      return null;
    }

    if (this.endOverlayAnimStartMs === null) {
      this.endOverlayAnimStartMs = performance.now();
    }
    const elapsed = performance.now() - this.endOverlayAnimStartMs;
    if (elapsed >= endOverlayRevealDurationMs()) {
      this.endOverlayRevealDone = true;
    }
    return elapsed;
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
      this.deadZone
        .rect(0, 0, leftPx, height)
        .fill({ color: voidColor, alpha: voidAlpha });
    }
    // Right strip
    if (rightPx < width) {
      this.deadZone
        .rect(rightPx, 0, width - rightPx, height)
        .fill({ color: voidColor, alpha: voidAlpha });
    }
    // Top strip
    if (topPx > 0) {
      this.deadZone
        .rect(leftPx, 0, rightPx - leftPx, topPx)
        .fill({ color: voidColor, alpha: voidAlpha });
    }
    // Bottom strip
    if (bottomPx < height) {
      this.deadZone
        .rect(leftPx, bottomPx, rightPx - leftPx, height - bottomPx)
        .fill({ color: voidColor, alpha: voidAlpha });
    }

    // Amber gradient edge at the live boundary (warning glow)
    const edgeAlpha = sb.warningActive ? 0.55 : 0.18;
    const colEdge = colSize;
    const rowEdge = rowSize;
    const edgeColor = 0xc88820;

    if (leftPx > 0) {
      this.deadZone
        .rect(leftPx, topPx, colEdge, bottomPx - topPx)
        .fill({ color: edgeColor, alpha: edgeAlpha });
    }
    if (rightPx < width) {
      this.deadZone
        .rect(rightPx - colEdge, topPx, colEdge, bottomPx - topPx)
        .fill({ color: edgeColor, alpha: edgeAlpha });
    }
    if (topPx > 0) {
      this.deadZone
        .rect(leftPx, topPx, rightPx - leftPx, rowEdge)
        .fill({ color: edgeColor, alpha: edgeAlpha });
    }
    if (bottomPx < height) {
      this.deadZone
        .rect(leftPx, bottomPx - rowEdge, rightPx - leftPx, rowEdge)
        .fill({ color: edgeColor, alpha: edgeAlpha });
    }
  }

  // ── Snake drawing ──────────────────────────────────────────────────────────

  private drawSnake(
    snake: GameState['p1'],
    color: number,
    colSize: number,
    rowSize: number,
    effects: {
      frozen?: boolean;
      phantom?: boolean;
      surging?: boolean;
      amped?: boolean;
    },
    pulses: CapturePulse[] = [],
    now: number = 0,
    boardElapsed: number = Infinity,
    preStartBobPx: number = 0,
    growKey = ''
  ): void {
    const bob = preStartBobPx;
    const segTop = (gy: number) => gy * rowSize - bob;
    const segHeight = rowSize + bob * 2;

    // Per-segment reveal: head first, then body tail-to-tip with 50ms stagger each
    const segReveal = (segIdx: number): number => {
      if (boardElapsed === Infinity) return 1;
      const t = Math.max(0, Math.min(1, (boardElapsed - segIdx * 80) / 700));
      return 1 - Math.pow(1 - t, 3); // cubic ease-out
    };
    const headAlpha = (effects.phantom ? 0.5 : 1) * segReveal(0);
    const baseBodyAlpha = effects.phantom ? 0.25 : 0.6;
    const totalLen = 1 + snake.body.length;
    const isLight = color === 0xffffff;

    // AMP pulsing gold glow under the whole chain (drawn first, underneath)
    if (effects.amped) {
      const ampPulse = 0.5 + 0.5 * Math.sin(now / 220);
      const ampAlpha = 0.18 + ampPulse * 0.22;
      const expand = 2 + ampPulse * 3;
      // Head glow
      this.scene
        .rect(
          snake.head[0] * colSize - expand,
          segTop(snake.head[1]) - expand,
          colSize + expand * 2,
          segHeight + expand * 2
        )
        .fill({ color: 0xffbb00, alpha: ampAlpha * 1.4 });
      // Body glow
      for (const seg of snake.body) {
        this.scene
          .rect(
            seg[0] * colSize - expand * 0.5,
            segTop(seg[1]) - expand * 0.5,
            colSize + expand,
            segHeight + expand
          )
          .fill({ color: 0xffbb00, alpha: ampAlpha * 0.7 });
      }
    }

    // Head — with glow halo on pulse wave arrival
    const headPulse = this.segmentPulse(0, totalLen, pulses, now);
    const headBoost = headPulse.glow;
    const flags = this.animFlags();
    // Warm on both chains. White-on-white disappeared into the light snake.
    const pulseTint = isLight ? 0xffb15a : 0xffc98a;
    if (flags.tint && headBoost > 0) {
      const expand = headBoost * 8;
      this.scene
        .rect(
          snake.head[0] * colSize - expand,
          segTop(snake.head[1]) - expand,
          colSize + expand * 2,
          segHeight + expand * 2
        )
        .fill({
          color: pulseTint,
          alpha: headBoost * 0.62,
        });
    }
    const headScale = this.scaleAtCell(snake.head, now);
    this.fillSegment(
      snake.head[0] * colSize,
      segTop(snake.head[1]),
      colSize,
      segHeight,
      headScale,
      color,
      Math.max(0, headAlpha)
    );
    if (flags.tint && headBoost > 0.05 && !isLight) {
      this.fillSegment(
        snake.head[0] * colSize,
        segTop(snake.head[1]),
        colSize,
        segHeight,
        headScale,
        pulseTint,
        headBoost * 0.85
      );
    }

    // Orange SURGE border on head
    if (effects.surging) {
      const surgePulse = 0.7 + 0.3 * Math.sin(now / 80);
      this.scene
        .rect(
          snake.head[0] * colSize - 2,
          segTop(snake.head[1]) - 2,
          colSize + 4,
          segHeight + 4
        )
        .stroke({ width: 2.5, color: 0xff7200, alpha: surgePulse });
    }

    // AMP pulsing gold border on head (on top of base)
    if (effects.amped) {
      const ampPulse = 0.6 + 0.4 * Math.sin(now / 220);
      this.scene
        .rect(
          snake.head[0] * colSize - 2,
          segTop(snake.head[1]) - 2,
          colSize + 4,
          segHeight + 4
        )
        .stroke({ width: 2, color: 0xffbb00, alpha: ampPulse });
    }

    // Frozen ring around head
    if (effects.frozen) {
      this.scene
        .rect(
          snake.head[0] * colSize - 2,
          segTop(snake.head[1]) - 2,
          colSize + 4,
          segHeight + 4
        )
        .stroke({ width: 2, color: 0x3090c8, alpha: 0.7 });
    }

    const growT =
      flags.grow && growKey ? this.growProgress(growKey, now, totalLen) : 1;

    // Body — pulse wave travels head → tail
    for (let i = 0; i < snake.body.length; i++) {
      const pulse = this.segmentPulse(i + 1, totalLen, pulses, now);
      const boost = flags.tint ? pulse.glow : 0;
      const segAlpha =
        (flags.tint
          ? Math.min(1, baseBodyAlpha + boost * 0.62)
          : baseBodyAlpha) * segReveal(i + 1);
      const px = snake.body[i][0] * colSize;
      const py = segTop(snake.body[i][1]);
      const isNewLink = i === snake.body.length - 1 && growT < 1;
      const linkScale = isNewLink ? this.growLinkScale(growKey, now) : 1;
      const blockScale = linkScale * this.scaleAtCell(snake.body[i]!, now);

      this.fillSegment(
        px,
        py,
        colSize,
        segHeight,
        blockScale,
        color,
        Math.max(0, segAlpha) * (isNewLink ? growT : 1)
      );

      if (flags.tint && !isLight && boost > 0.05) {
        this.fillSegment(
          px + 1,
          py + 1,
          colSize - 2,
          segHeight - 2,
          blockScale,
          pulseTint,
          boost * 0.85
        );
      }

      // Orange SURGE border on each body segment
      if (effects.surging) {
        const surgePulse = 0.5 + 0.3 * Math.sin(now / 80 + i * 0.4);
        this.scene
          .rect(px - 1, py - 1, colSize + 2, segHeight + 2)
          .stroke({ width: 1.5, color: 0xff7200, alpha: surgePulse });
      }

      // AMP gold border on body (subtler than head)
      if (effects.amped) {
        const ampPulse = 0.4 + 0.3 * Math.sin(now / 220 + i * 0.2);
        this.scene
          .rect(px - 1, py - 1, colSize + 2, segHeight + 2)
          .stroke({ width: 1.5, color: 0xffbb00, alpha: ampPulse * 0.7 });
      }
    }
  }

  private fillSegment(
    x: number,
    y: number,
    w: number,
    h: number,
    scale: number,
    color: number,
    alpha: number
  ): void {
    const dw = w * scale;
    const dh = h * scale;
    this.scene
      .rect(x - (dw - w) / 2, y - (dh - h) / 2, dw, dh)
      .fill({ color, alpha });
  }

  private pulseDuration(_totalLen: number): number {
    return PixiGameRenderer.PULSE_DURATION_MS;
  }

  /** New link grows from nothing, overshoots, then settles to full size. */
  private growLinkScale(key: string, now: number): number {
    const start = this.growAt[key];
    if (start == null) return 1;
    const t = Math.max(0, Math.min(1, (now - start) / PixiGameRenderer.GROW_MS));
    if (t < 0.45) return (t / 0.45) * 1.42;
    return 1.42 - ((t - 0.45) / 0.55) * 0.42;
  }

  private growProgress(key: string, now: number, _totalLen: number): number {
    const start = this.growAt[key];
    if (start == null) return 1;
    const t = (now - start) / PixiGameRenderer.GROW_MS;
    if (t >= 1) return 1;
    if (t <= 0) return 0;
    return 1 - Math.pow(1 - t, 2);
  }

  private growAnimating(now: number): boolean {
    if (!this.animFlags().grow) return false;
    return Object.values(this.growAt).some(
      (start) => now - start < PixiGameRenderer.PULSE_MAX_MS
    );
  }

  /** Brightness peak for segment `segIndex` as the capture wave travels head → tail. */
  private segmentPulse(
    segIndex: number,
    totalLen: number,
    pulses: CapturePulse[],
    now: number
  ): { glow: number; reward: number } {
    if (pulses.length === 0 || totalLen === 0) return { glow: 0, reward: 2 };
    const D = this.pulseDuration(totalLen);
    const halfW = 0.16;
    let glow = 0;
    let reward = 2;
    for (const pulse of pulses) {
      const t = (now - pulse.startMs) / D;
      if (t < 0 || t > 1.1) continue;
      const frac = totalLen > 1 ? segIndex / (totalLen - 1) : 0;
      const dist = Math.abs(frac - t);
      const amount = Math.max(0, 1 - dist / halfW);
      if (amount > glow) {
        glow = amount;
        reward = pulse.reward;
      }
    }
    return { glow, reward };
  }

  private getSegmentGlow(
    segIndex: number,
    totalLen: number,
    pulses: CapturePulse[],
    now: number
  ): number {
    return this.segmentPulse(segIndex, totalLen, pulses, now).glow;
  }

  private noteCaptures(state: GameState, now: number): void {
    const flags = this.animFlags();
    const alive = (pulse: CapturePulse) =>
      now - pulse.startMs < PixiGameRenderer.PULSE_MAX_MS;

    if (!state.gameStarted) {
      this.p1Pulses = [];
      this.p2Pulses = [];
      this.growAt = {};
      this.captureScales = [];
      this.rememberCaptureBaseline(state);
      return;
    }

    if (!state.gameEnded && state.tickCount !== this.captureNotedTick) {
      this.captureNotedTick = state.tickCount;
      if (anyCaptureAnimFlag(flags)) {
        const coins = state.coinbases ?? [];
        for (const prev of this.prevCoins) {
          const still = coins.some(
            (coin) => coin.pos[0] === prev.pos[0] && coin.pos[1] === prev.pos[1]
          );
          if (still) continue;
          const eaters: { head: GridPos; pulses: CapturePulse[] }[] = [
            { head: state.p1.head, pulses: this.p1Pulses },
            { head: state.p2.head, pulses: this.p2Pulses },
          ];
          const eater = eaters.find(
            (entry) =>
              entry.head[0] === prev.pos[0] && entry.head[1] === prev.pos[1]
          );
          if (!eater) continue;
          if (flags.tint) {
            eater.pulses.push({ startMs: now, reward: prev.reward });
          }
          if (flags.scale) {
            this.captureScales.push({
              pos: [prev.pos[0], prev.pos[1]],
              startMs: now,
            });
          }
        }
        if (flags.grow) {
          if (
            this.prevBodyLen.p1 >= 0 &&
            state.p1.body.length > this.prevBodyLen.p1
          ) {
            this.growAt.p1 = now;
          }
          if (
            this.prevBodyLen.p2 >= 0 &&
            state.p2.body.length > this.prevBodyLen.p2
          ) {
            this.growAt.p2 = now;
          }
          for (let i = 0; i < state.extraSnakes.length; i += 1) {
            const prev = this.prevBodyLen.extra[i] ?? -1;
            if (prev >= 0 && state.extraSnakes[i]!.snake.body.length > prev) {
              this.growAt[`e${i}`] = now;
            }
          }
        }
      }
      this.rememberCaptureBaseline(state);
    }

    this.p1Pulses = this.p1Pulses.filter(alive);
    this.p2Pulses = this.p2Pulses.filter(alive);
    this.captureScales = this.captureScales.filter(
      (hit) => now - hit.startMs < PixiGameRenderer.SCALE_MS
    );
  }

  /** Scale only the cell the reward occupied, for a short pop. */
  private scaleAtCell(pos: GridPos, now: number): number {
    if (!this.animFlags().scale) return 1;
    let scale = 1;
    for (const hit of this.captureScales) {
      if (hit.pos[0] !== pos[0] || hit.pos[1] !== pos[1]) continue;
      const t = (now - hit.startMs) / PixiGameRenderer.SCALE_MS;
      if (t < 0 || t > 1) continue;
      const pop = Math.sin(t * Math.PI);
      scale = Math.max(scale, 1 + pop * 1.05);
    }
    return scale;
  }

  private rememberCaptureBaseline(state: GameState): void {
    this.prevScoreP1 = state.score[0];
    this.prevScoreP2 = state.score[1];
    this.prevCoins = (state.coinbases ?? []).map((coin) => ({
      pos: [coin.pos[0], coin.pos[1]] as GridPos,
      reward: coin.reward ?? 2,
    }));
    this.prevBodyLen = {
      p1: state.p1.body.length,
      p2: state.p2.body.length,
      extra: state.extraSnakes.map((extra) => extra.snake.body.length),
    };
  }

  // ── Coinbase drawing ───────────────────────────────────────────────────────

  private drawCoinbase(
    pos: GridPos,
    colSize: number,
    rowSize: number,
    opts: { reward?: number; isDecoy?: boolean },
    boardElapsed: number = Infinity
  ): void {
    const coinReveal = (() => {
      if (boardElapsed === Infinity) return 1;
      const t = Math.max(0, Math.min(1, (boardElapsed - 250) / 800));
      return 1 - Math.pow(1 - t, 3);
    })();
    const baseRadius = rowSize / 2 - rowSize / 5.4;
    const radius = baseRadius * coinReveal;
    const cx = pos[0] * colSize + colSize / 2;
    const cy = pos[1] * rowSize + rowSize / 2;

    if (opts.isDecoy) {
      const iconSize = Math.min(colSize, rowSize) * 1.8 * coinReveal;
      const pulse = 0.7 + 0.3 * Math.sin((Date.now() / 700) * 1.7 + 1.2);
      drawPowerUpIconPixi(
        this.scene,
        cx,
        cy,
        iconSize,
        'DECOY',
        POWERUP_COLORS.DECOY,
        0.95 * pulse
      );
      return;
    }

    // Standard coinbase
    this.scene
      .circle(cx, cy, radius * 2.05)
      .fill({ color: 0xffffff, alpha: 0.05 });
    this.scene
      .circle(cx, cy, radius * 1.7)
      .fill({ color: 0xffffff, alpha: 0.08 });
    this.scene
      .circle(cx, cy, radius * 1.35)
      .fill({ color: 0xffffff, alpha: 0.14 });
    this.scene
      .circle(cx, cy, radius * 1.1)
      .fill({ color: 0xffffff, alpha: 0.22 });
    this.scene.circle(cx, cy, radius * 0.9).fill({ color: 0xffffff, alpha: 1 });

    // Reward rings
    if (opts.reward) {
      const rings =
        opts.reward === 2
          ? 2
          : opts.reward === 4
            ? 3
            : opts.reward === 8
              ? 4
              : opts.reward === 16
                ? 5
                : 6;
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

  // ── Power-up item drawing ──────────────────────────────────────────────────

  private rebuildStaticGrid(
    state: GameState,
    colSize: number,
    rowSize: number,
    gridAlpha: number
  ): void {
    this.grid.clear();
    for (let x = 0; x <= state.cols; x += 1) {
      for (let y = 0; y <= state.rows; y += 1) {
        this.grid
          .rect(x * colSize, y * rowSize, colSize, rowSize)
          .stroke({ width: 1, color: 0xffffff, alpha: gridAlpha });
      }
    }
  }

  private drawPowerUpItem(
    pos: GridPos,
    type: string,
    colSize: number,
    rowSize: number,
    now: number
  ): void {
    const cx = pos[0] * colSize + colSize / 2;
    const cy = pos[1] * rowSize + rowSize / 2;
    const iconSize = Math.min(colSize, rowSize) * 1.5;
    const color = POWERUP_COLORS[type] ?? 0xffffff;
    const pulse = 0.75 + 0.25 * Math.sin((now / 800) * 2);

    drawPowerUpIconPixi(
      this.scene,
      cx,
      cy,
      iconSize,
      type as PowerUpType,
      color,
      0.95 * pulse
    );
  }

  destroy(): void {
    this.host?.closest('#gameCanvas')?.classList.remove('game-result-active');
    this.mountGeneration += 1;
    this.gridCacheKey = '';
    this.lastResizeWidth = 0;
    this.lastResizeHeight = 0;
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

  private createCountdownText(label: string): Text {
    const text = new Text({
      text: label,
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
    text.resolution = this.textResolution;
    text.visible = false;
    text.alpha = 0;
    return text;
  }

  /** 3 → 2 → 1 → LFG: swap visibility only (never mutate .text — that flickers in Pixi). */
  private countdownPhaseFromTicks(ticks: number): '3' | '2' | '1' | 'LFG' {
    if (ticks <= 10) return '3';
    if (ticks <= 20) return '2';
    if (ticks <= 30) return '1';
    return 'LFG';
  }

  private layoutCountdownOverlay(width: number, height: number): void {
    const countdownSize = Math.max(18, Math.floor(height * 0.54));
    const cx = width / 2;
    const cy = height / 2;
    for (const node of [
      this.countdown3,
      this.countdown2,
      this.countdown1,
      this.countdownLfg,
    ]) {
      node.style.fontSize = countdownSize;
      node.position.set(cx, cy);
      node.alpha = 1;
    }
  }

  private renderCountdownOverlay(
    state: GameState,
    width: number,
    height: number
  ): void {
    const phase = this.countdownPhaseFromTicks(state.countdownTicks);
    const sizeChanged =
      this.lastOverlayWidth !== width || this.lastOverlayHeight !== height;
    const phaseChanged = this.lastCountdownPhase !== phase;

    if (sizeChanged || phaseChanged) {
      this.layoutCountdownOverlay(width, height);
    }
    this.countdown3.visible = phase === '3';
    this.countdown2.visible = phase === '2';
    this.countdown1.visible = phase === '1';
    this.countdownLfg.visible = phase === 'LFG';
    if (phase === '3') this.countdown3.alpha = 1;
    if (phase === '2') this.countdown2.alpha = 1;
    if (phase === '1') this.countdown1.alpha = 1;
    if (phase === 'LFG') this.countdownLfg.alpha = 1;
    this.lastCountdownPhase = phase;
  }

  private hideCountdownOverlay(): void {
    this.countdown3.visible = false;
    this.countdown2.visible = false;
    this.countdown1.visible = false;
    this.countdownLfg.visible = false;
    this.countdown3.alpha = 0;
    this.countdown2.alpha = 0;
    this.countdown1.alpha = 0;
    this.countdownLfg.alpha = 0;
    this.lastCountdownPhase = null;
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

  private renderFallback(state: GameState, opts?: PixiRenderOpts): void {
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
      ctx.fillRect(
        sb.left * colSize,
        0,
        (sb.right - sb.left + 1) * colSize,
        sb.top * rowSize
      );
      ctx.fillRect(
        sb.left * colSize,
        (sb.bottom + 1) * rowSize,
        (sb.right - sb.left + 1) * colSize,
        height
      );

      // Amber edge
      const edgeAlpha = sb.warningActive ? 0.5 : 0.15;
      ctx.fillStyle = `rgba(200,136,32,${edgeAlpha})`;
      ctx.fillRect(
        sb.left * colSize,
        sb.top * rowSize,
        colSize,
        (sb.bottom - sb.top + 1) * rowSize
      );
      ctx.fillRect(
        (sb.right + 1) * colSize - colSize,
        sb.top * rowSize,
        colSize,
        (sb.bottom - sb.top + 1) * rowSize
      );
    }

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= state.cols; x += 1) {
      for (let y = 0; y <= state.rows; y += 1) {
        ctx.strokeRect(x * colSize, y * rowSize, colSize, rowSize);
      }
    }

    // Obstacle walls
    for (const wall of state.obstacleWalls ?? []) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(
        wall.pos[0] * colSize,
        wall.pos[1] * rowSize,
        colSize,
        rowSize
      );
    }

    const nowFb = performance.now();
    this.noteCaptures(state, nowFb);

    const fbP1Effects = getSnakeEffects(state, 0);
    const fbP2Effects = getSnakeEffects(state, 1);
    const fbP1Surging = fbP1Effects.surging;
    const fbP2Surging = fbP2Effects.surging;
    const fbP1Amped = fbP1Effects.amped;
    const fbP2Amped = fbP2Effects.amped;
    const fbP1Frozen = fbP1Effects.frozen;
    const fbP2Frozen = fbP2Effects.frozen;

    // FADE surge trails
    const FADE_FB = PixiGameRenderer.SURGE_TRAIL_FADE_MS;
    if (state.gameStarted && !state.gameEnded) {
      if (fbP1Surging)
        this.p1SurgeTrail.push({
          pos: [state.p1.head[0], state.p1.head[1]],
          time: nowFb,
        });
      if (fbP2Surging)
        this.p2SurgeTrail.push({
          pos: [state.p2.head[0], state.p2.head[1]],
          time: nowFb,
        });
    }
    this.p1SurgeTrail = this.p1SurgeTrail.filter(
      (t) => nowFb - t.time < FADE_FB
    );
    this.p2SurgeTrail = this.p2SurgeTrail.filter(
      (t) => nowFb - t.time < FADE_FB
    );
    for (const t of this.p1SurgeTrail) {
      ctx.globalAlpha = (1 - (nowFb - t.time) / FADE_FB) * 0.6;
      ctx.fillStyle = '#FF7200';
      ctx.fillRect(
        t.pos[0] * colSize + 1,
        t.pos[1] * rowSize + 1,
        colSize - 2,
        rowSize - 2
      );
    }
    for (const t of this.p2SurgeTrail) {
      ctx.globalAlpha = (1 - (nowFb - t.time) / FADE_FB) * 0.6;
      ctx.fillStyle = '#FF7200';
      ctx.fillRect(
        t.pos[0] * colSize + 1,
        t.pos[1] * rowSize + 1,
        colSize - 2,
        rowSize - 2
      );
    }
    ctx.globalAlpha = 1;

    // P1
    const p1Total = 1 + state.p1.body.length;
    // AMP under-glow
    if (fbP1Amped) {
      const ampP = 0.5 + 0.5 * Math.sin(nowFb / 220);
      const expand = 2 + ampP * 3;
      ctx.globalAlpha = 0.18 + ampP * 0.22;
      ctx.fillStyle = '#FFBB00';
      ctx.fillRect(
        state.p1.head[0] * colSize - expand,
        state.p1.head[1] * rowSize - expand,
        colSize + expand * 2,
        rowSize + expand * 2
      );
      for (const seg of state.p1.body) {
        ctx.fillRect(
          seg[0] * colSize - expand * 0.5,
          seg[1] * rowSize - expand * 0.5,
          colSize + expand,
          rowSize + expand
        );
      }
      ctx.globalAlpha = 1;
    }
    // Extra snakes (teams / ffa) – drawn behind main snakes
    for (let ei = 0; ei < (state.extraSnakes ?? []).length; ei += 1) {
      const extra = state.extraSnakes[ei]!;
      const extraBob = preStartControllerBobPx(
        state,
        (ei + 2) as GameSeatIndex,
        rowSize
      );
      const extraTop = (gy: number) => gy * rowSize - extraBob;
      const extraH = rowSize + extraBob * 2;
      const hexStr = '#' + extra.color.toString(16).padStart(6, '0');
      ctx.fillStyle = hexStr;
      ctx.fillRect(
        extra.snake.head[0] * colSize,
        extraTop(extra.snake.head[1]),
        colSize,
        extraH
      );
      ctx.globalAlpha = 0.75;
      for (const seg of extra.snake.body) {
        ctx.fillRect(seg[0] * colSize, extraTop(seg[1]), colSize, extraH);
      }
      ctx.globalAlpha = 1;
      // Ally / shadow: solid inset border
      if (extra.outline != null) {
        const lw = Math.max(1.5, Math.min(colSize, rowSize) * 0.1);
        ctx.strokeStyle = '#' + extra.outline.toString(16).padStart(6, '0');
        ctx.lineWidth = lw;
        ctx.globalAlpha = 0.85;
        for (const seg of [extra.snake.head, ...extra.snake.body]) {
          ctx.strokeRect(
            seg[0] * colSize + lw / 2,
            extraTop(seg[1]) + lw / 2,
            colSize - lw,
            extraH - lw
          );
        }
        ctx.globalAlpha = 1;
      }
    }

    const p1Bob = preStartControllerBobPx(state, 0, rowSize);
    const p1SegTop = (gy: number) => gy * rowSize - p1Bob;
    const p1SegH = rowSize + p1Bob * 2;

    ctx.fillStyle = '#ffffff';
    // Head halo
    const p1HeadBoost = this.getSegmentGlow(0, p1Total, this.p1Pulses, nowFb);
    if (p1HeadBoost > 0) {
      const exp = p1HeadBoost * 4;
      ctx.globalAlpha = p1HeadBoost * 0.35;
      ctx.fillRect(
        state.p1.head[0] * colSize - exp,
        p1SegTop(state.p1.head[1]) - exp,
        colSize + exp * 2,
        p1SegH + exp * 2
      );
    }
    ctx.globalAlpha = 1;
    ctx.fillRect(
      state.p1.head[0] * colSize,
      p1SegTop(state.p1.head[1]),
      colSize,
      p1SegH
    );
    if (fbP1Surging) {
      const sp = 0.7 + 0.3 * Math.sin(nowFb / 80);
      ctx.globalAlpha = sp;
      ctx.strokeStyle = '#FF7200';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(
        state.p1.head[0] * colSize - 2,
        p1SegTop(state.p1.head[1]) - 2,
        colSize + 4,
        p1SegH + 4
      );
      ctx.globalAlpha = 1;
    }
    if (fbP1Amped) {
      const ap = 0.6 + 0.4 * Math.sin(nowFb / 220);
      ctx.globalAlpha = ap;
      ctx.strokeStyle = '#FFBB00';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        state.p1.head[0] * colSize - 2,
        p1SegTop(state.p1.head[1]) - 2,
        colSize + 4,
        p1SegH + 4
      );
      ctx.globalAlpha = 1;
    }
    if (fbP1Frozen) {
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#3090C8';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        state.p1.head[0] * colSize - 2,
        p1SegTop(state.p1.head[1]) - 2,
        colSize + 4,
        p1SegH + 4
      );
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < state.p1.body.length; i++) {
      const boost = this.getSegmentGlow(i + 1, p1Total, this.p1Pulses, nowFb);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = Math.min(1, 0.6 + boost * 0.36);
      ctx.fillRect(
        state.p1.body[i][0] * colSize,
        p1SegTop(state.p1.body[i][1]),
        colSize,
        p1SegH
      );
      ctx.globalAlpha = 1;
      if (fbP1Surging) {
        const sp = 0.5 + 0.3 * Math.sin(nowFb / 80 + i * 0.4);
        ctx.globalAlpha = sp;
        ctx.strokeStyle = '#FF7200';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          state.p1.body[i][0] * colSize - 1,
          p1SegTop(state.p1.body[i][1]) - 1,
          colSize + 2,
          p1SegH + 2
        );
        ctx.globalAlpha = 1;
      }
      if (fbP1Amped) {
        const ap = (0.4 + 0.3 * Math.sin(nowFb / 220 + i * 0.2)) * 0.7;
        ctx.globalAlpha = ap;
        ctx.strokeStyle = '#FFBB00';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          state.p1.body[i][0] * colSize - 1,
          p1SegTop(state.p1.body[i][1]) - 1,
          colSize + 2,
          p1SegH + 2
        );
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;

    // P2
    const p2Total = 1 + state.p2.body.length;
    if (fbP2Amped) {
      const ampP = 0.5 + 0.5 * Math.sin(nowFb / 220);
      const expand = 2 + ampP * 3;
      ctx.globalAlpha = 0.18 + ampP * 0.22;
      ctx.fillStyle = '#FFBB00';
      ctx.fillRect(
        state.p2.head[0] * colSize - expand,
        state.p2.head[1] * rowSize - expand,
        colSize + expand * 2,
        rowSize + expand * 2
      );
      for (const seg of state.p2.body) {
        ctx.fillRect(
          seg[0] * colSize - expand * 0.5,
          seg[1] * rowSize - expand * 0.5,
          colSize + expand,
          rowSize + expand
        );
      }
      ctx.globalAlpha = 1;
    }
    const p2Bob = preStartControllerBobPx(state, 1, rowSize);
    const p2SegTop = (gy: number) => gy * rowSize - p2Bob;
    const p2SegH = rowSize + p2Bob * 2;

    ctx.fillStyle = '#111111';
    const p2HeadBoost = this.getSegmentGlow(0, p2Total, this.p2Pulses, nowFb);
    if (p2HeadBoost > 0) {
      const exp = p2HeadBoost * 4;
      ctx.globalAlpha = p2HeadBoost * 0.3;
      ctx.fillStyle = '#dddddd';
      ctx.fillRect(
        state.p2.head[0] * colSize - exp,
        p2SegTop(state.p2.head[1]) - exp,
        colSize + exp * 2,
        p2SegH + exp * 2
      );
      ctx.fillStyle = '#111111';
    }
    ctx.globalAlpha = 1;
    ctx.fillRect(
      state.p2.head[0] * colSize,
      p2SegTop(state.p2.head[1]),
      colSize,
      p2SegH
    );
    if (fbP2Surging) {
      const sp = 0.7 + 0.3 * Math.sin(nowFb / 80);
      ctx.globalAlpha = sp;
      ctx.strokeStyle = '#FF7200';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(
        state.p2.head[0] * colSize - 2,
        p2SegTop(state.p2.head[1]) - 2,
        colSize + 4,
        p2SegH + 4
      );
      ctx.globalAlpha = 1;
    }
    if (fbP2Amped) {
      const ap = 0.6 + 0.4 * Math.sin(nowFb / 220);
      ctx.globalAlpha = ap;
      ctx.strokeStyle = '#FFBB00';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        state.p2.head[0] * colSize - 2,
        p2SegTop(state.p2.head[1]) - 2,
        colSize + 4,
        p2SegH + 4
      );
      ctx.globalAlpha = 1;
    }
    if (fbP2Frozen) {
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#3090C8';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        state.p2.head[0] * colSize - 2,
        p2SegTop(state.p2.head[1]) - 2,
        colSize + 4,
        p2SegH + 4
      );
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < state.p2.body.length; i++) {
      const boost = this.getSegmentGlow(i + 1, p2Total, this.p2Pulses, nowFb);
      ctx.fillStyle = '#111111';
      ctx.globalAlpha = Math.min(1, 0.6 + boost * 0.36);
      ctx.fillRect(
        state.p2.body[i][0] * colSize,
        p2SegTop(state.p2.body[i][1]),
        colSize,
        p2SegH
      );
      ctx.globalAlpha = 1;
      if (boost > 0.05) {
        ctx.globalAlpha = boost * 0.28;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
          state.p2.body[i][0] * colSize + 1,
          p2SegTop(state.p2.body[i][1]) + 1,
          colSize - 2,
          p2SegH - 2
        );
      }
      ctx.globalAlpha = 1;
      if (fbP2Surging) {
        const sp = 0.5 + 0.3 * Math.sin(nowFb / 80 + i * 0.4);
        ctx.globalAlpha = sp;
        ctx.strokeStyle = '#FF7200';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          state.p2.body[i][0] * colSize - 1,
          p2SegTop(state.p2.body[i][1]) - 1,
          colSize + 2,
          p2SegH + 2
        );
        ctx.globalAlpha = 1;
      }
      if (fbP2Amped) {
        const ap = (0.4 + 0.3 * Math.sin(nowFb / 220 + i * 0.2)) * 0.7;
        ctx.globalAlpha = ap;
        ctx.strokeStyle = '#FFBB00';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          state.p2.body[i][0] * colSize - 1,
          p2SegTop(state.p2.body[i][1]) - 1,
          colSize + 2,
          p2SegH + 2
        );
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;

    for (const cb of state.coinbases ?? []) {
      const cx = cb.pos[0] * colSize + colSize / 2;
      const cy = cb.pos[1] * rowSize + rowSize / 2;
      if (cb.isDecoy) {
        const iconSize = Math.min(colSize, rowSize) * 1.8;
        const pulse = 0.7 + 0.3 * Math.sin((Date.now() / 700) * 1.7 + 1.2);
        drawPowerUpIconCanvas(
          ctx,
          cx,
          cy,
          iconSize,
          'DECOY',
          POWERUP_COLORS.DECOY,
          0.95 * pulse
        );
        continue;
      }
      const radius = rowSize / 2 - rowSize / 5.4;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (cb.reward) {
        const rings =
          cb.reward === 2
            ? 2
            : cb.reward === 4
              ? 3
              : cb.reward === 8
                ? 4
                : cb.reward === 16
                  ? 5
                  : 6;
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

    // Power-up items (fallback: octagon tiles + icons)
    const puPulse = 0.75 + 0.25 * Math.sin((nowFb / 800) * 2);
    for (const item of state.powerUpItems ?? []) {
      const color = POWERUP_COLORS[item.type] ?? 0xffffff;
      const cx2 = item.pos[0] * colSize + colSize / 2;
      const cy2 = item.pos[1] * rowSize + rowSize / 2;
      const iconSize = Math.min(colSize, rowSize) * 1.5;
      drawPowerUpTileCanvas(
        ctx,
        cx2,
        cy2,
        iconSize,
        item.type as PowerUpType,
        color,
        puPulse
      );
    }

    drawPointChangesCanvas(ctx, state.pointChanges ?? [], colSize, rowSize);
    drawStreakPopsCanvas(ctx, colSize, rowSize);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    const preMatch =
      !state.gameStarted && !state.gameEnded && !state.countdownStart;
    this.host
      ?.closest('#gameCanvas')
      ?.classList.toggle('is-prematch', preMatch);
    if (preMatch) {
      const objOpts = opts?.canvasObjectives ?? {};
      if (this.startRevealTime === -1) this.startRevealTime = performance.now();
      drawOnlineStartReadyFallback(
        ctx,
        colSize,
        rowSize,
        state.p1,
        state.p2,
        p1Bob,
        p2Bob,
        objOpts.onlineStartReady,
        onlineStartReadyAlpha(Boolean(objOpts.onlineStartReady), 1)
      );
      drawCanvasControlsFallback(
        ctx,
        state,
        width,
        height,
        objOpts.controlSlots ?? [],
        1,
        objOpts.controlLabelSlots
      );
    } else if (state.countdownStart) {
      if (this.preMatchOverlayVisible()) {
        this.finishPreMatchDismiss();
      }
      const countdownText =
        state.countdownTicks <= 10
          ? '3'
          : state.countdownTicks <= 20
            ? '2'
            : state.countdownTicks <= 30
              ? '1'
              : 'LFG';
      ctx.font = `${Math.floor(height * 0.5)}px BureauGrotesque`;
      ctx.fillText(countdownText, width / 2, height / 2);
    } else if (state.gameEnded) {
      this.startRevealTime = -1;
      const resolveProgressFb = this.getResolveProgress(state);
      const elapsed = this.beginEndOverlayReveal(
        state,
        resolveProgressFb,
        Boolean(opts?.suppressVictoryOverlay)
      );
      if (elapsed !== null) {
        // Winner card is DOM. Keep the reveal timer so continue actions still wait.
      }
    }
  }
}
