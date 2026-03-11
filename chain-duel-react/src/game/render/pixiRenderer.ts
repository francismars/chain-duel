import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameState } from '@/game/engine/types';

export class PixiGameRenderer {
  private app: Application | null = null;
  private fallbackCanvas: HTMLCanvasElement | null = null;
  private fallbackCtx: CanvasRenderingContext2D | null = null;
  private host: HTMLElement | null = null;
  private root: Container = new Container();
  private grid: Graphics = new Graphics();
  private scene: Graphics = new Graphics();
  private overlay: Container = new Container();
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
      this.root.addChild(this.grid);
      this.root.addChild(this.scene);
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

  render(state: GameState): void {
    if (!this.app) {
      this.renderFallback(state);
      return;
    }
    const renderer = this.app.renderer;
    if (!renderer) {
      this.renderFallback(state);
      return;
    }
    // Use CSS pixel size of the host (legacy-like responsive behavior),
    // not renderer backing-store size which changes with resolution/DPR.
    const width = this.host?.clientWidth ?? renderer.width;
    const height = this.host?.clientHeight ?? renderer.height;
    if (width <= 0 || height <= 0) {
      this.resize();
      return;
    }
    const colSize = width / state.cols;
    const rowSize = height / state.rows;

    this.grid.clear();
    for (let x = 0; x <= state.cols; x += 1) {
      for (let y = 0; y <= state.rows; y += 1) {
        this.grid
          .rect(x * colSize, y * rowSize, colSize, rowSize)
          .stroke({ width: 1, color: 0xffffff, alpha: 0.05 });
      }
    }

    this.scene.clear();
    this.drawSnake(state.p1, 0xffffff, colSize, rowSize);
    this.drawSnake(state.p2, 0x000000, colSize, rowSize);

    for (const cb of state.coinbases) {
      const radius = rowSize / 2 - rowSize / 5.4;
      const cx = cb.pos[0] * colSize + colSize / 2;
      const cy = cb.pos[1] * rowSize + rowSize / 2;

      // Legacy base coinbase uses white core + strong glow (canvas shadowBlur=20).
      // Pixi Graphics has no shadow blur, so emulate with soft filled halos.
      this.scene.circle(cx, cy, radius * 2.05).fill({ color: 0xffffff, alpha: 0.05 });
      this.scene.circle(cx, cy, radius * 1.7).fill({ color: 0xffffff, alpha: 0.08 });
      this.scene.circle(cx, cy, radius * 1.35).fill({ color: 0xffffff, alpha: 0.14 });
      this.scene.circle(cx, cy, radius * 1.1).fill({ color: 0xffffff, alpha: 0.22 });
      this.scene.circle(cx, cy, radius * 0.9).fill({ color: 0xffffff, alpha: 1 });

      // Reward/event coinbase: adds concentric rings (legacy second type).
      if (cb.reward) {
        const rings =
          cb.reward === 2 ? 2 : cb.reward === 4 ? 3 : cb.reward === 8 ? 4 : cb.reward === 16 ? 5 : 6;
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

    // Legacy precise values from drawPointChange():
    // - y decreases by 1px per animation frame
    // - alpha decreases by (0.1 / 6) per animation frame
    state.pointChanges = state.pointChanges
      .map((change) => ({
        ...change,
        p1YOffsetPx: change.p1YOffsetPx - 1,
        p2YOffsetPx: change.p2YOffsetPx - 1,
        alpha: change.alpha - 0.1 / 6,
      }))
      .filter((change) => change.alpha >= 0);

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
      this.endWinnerText.text = `${state.winnerName.toUpperCase()} WINS!`;
      this.endContinueText.text = 'PRESS ANY BUTTON TO CONTINUE';
    }
  }

  destroy(): void {
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    if (this.fallbackCanvas && this.host) {
      this.host.removeChild(this.fallbackCanvas);
    }
    this.fallbackCanvas = null;
    this.fallbackCtx = null;
  }

  private drawSnake(
    snake: GameState['p1'],
    color: number,
    colSize: number,
    rowSize: number
  ): void {
    this.scene.rect(snake.head[0] * colSize, snake.head[1] * rowSize, colSize, rowSize).fill({ color });
    for (const bodyPart of snake.body) {
      this.scene
        .rect(bodyPart[0] * colSize, bodyPart[1] * rowSize, colSize, rowSize)
        .fill({ color, alpha: 0.6 });
    }
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
      // Legacy: active countdown token is fill-only.
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
      // Legacy: upcoming countdown token is outline-only.
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

  private renderFallback(state: GameState): void {
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

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= state.cols; x += 1) {
      for (let y = 0; y <= state.rows; y += 1) {
        ctx.strokeRect(x * colSize, y * rowSize, colSize, rowSize);
      }
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(state.p1.head[0] * colSize, state.p1.head[1] * rowSize, colSize, rowSize);
    ctx.globalAlpha = 0.6;
    for (const part of state.p1.body) {
      ctx.fillRect(part[0] * colSize, part[1] * rowSize, colSize, rowSize);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#000000';
    ctx.fillRect(state.p2.head[0] * colSize, state.p2.head[1] * rowSize, colSize, rowSize);
    ctx.globalAlpha = 0.6;
    for (const part of state.p2.body) {
      ctx.fillRect(part[0] * colSize, part[1] * rowSize, colSize, rowSize);
    }
    ctx.globalAlpha = 1;

    for (const cb of state.coinbases) {
      const cx = cb.pos[0] * colSize + colSize / 2;
      const cy = cb.pos[1] * rowSize + rowSize / 2;
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
          cb.reward === 2 ? 2 : cb.reward === 4 ? 3 : cb.reward === 8 ? 4 : cb.reward === 16 ? 5 : 6;
        let transparencyAdder = 1;
        for (let ring = rings; ring > 0; ring -= 1) {
          const alpha = 0.1 / rings + transparencyAdder / 20;
          ctx.beginPath();
          ctx.arc(cx, cy, radius + ring * rowSize * 0.38, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          transparencyAdder += 1;
        }
      }
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
      ctx.font = `${Math.floor(width / 17)}px BureauGrotesque`;
      ctx.fillText(`${state.winnerName.toUpperCase()} WINS!`, width / 2, height / 2 - 10);
      ctx.font = `${Math.floor(width / 39)}px BureauGrotesque`;
      ctx.fillText('PRESS ANY BUTTON TO CONTINUE', width / 2, height / 2 + 35);
    }
  }
}
