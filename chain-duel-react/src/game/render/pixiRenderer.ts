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
  private promptText: Text;
  private winnerText: Text;

  constructor() {
    this.promptText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'BureauGrotesque',
        fill: '#ffffff',
        fontSize: 64,
        align: 'center',
        stroke: { color: '#000000', width: 2 },
      }),
    });
    this.promptText.anchor.set(0.5);
    this.winnerText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'BureauGrotesque',
        fill: '#ffffff',
        fontSize: 34,
        align: 'center',
        stroke: { color: '#000000', width: 2 },
      }),
    });
    this.winnerText.anchor.set(0.5);
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
      this.overlay.addChild(this.promptText);
      this.overlay.addChild(this.winnerText);
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
    const width = renderer.width;
    const height = renderer.height;
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
      this.scene.circle(cx, cy, radius).fill({ color: 0xffffff, alpha: 1 });
      if (cb.reward) {
        const rings = cb.reward === 2 ? 2 : cb.reward === 4 ? 3 : cb.reward === 8 ? 4 : cb.reward === 16 ? 5 : 6;
        for (let ring = rings; ring > 0; ring -= 1) {
          this.scene
            .circle(cx, cy, radius + ring * rowSize * 0.38)
            .stroke({ width: 2, color: 0xffffff, alpha: 0.08 + ring / 25 });
        }
      }
    }

    for (const change of state.pointChanges) {
      const x1 = change.p1Pos[0] * colSize + colSize / 2;
      const y1 = change.p1Pos[1] * rowSize + rowSize / 2;
      const x2 = change.p2Pos[0] * colSize + colSize / 2;
      const y2 = change.p2Pos[1] * rowSize + rowSize / 2;
      this.drawPointText(`+${change.value}`, x1, y1, 0x42a345, change.alpha);
      this.drawPointText(`-${change.value}`, x2, y2, 0xf13838, change.alpha);
    }

    this.promptText.position.set(width / 2, height / 2);
    this.winnerText.position.set(width / 2, height / 2 + 48);
    if (!state.gameStarted && !state.gameEnded && !state.countdownStart) {
      this.promptText.text = 'PRESS BUTTON TO START';
      this.winnerText.text = '';
    } else if (state.countdownStart) {
      const countdownText =
        state.countdownTicks <= 10
          ? '3'
          : state.countdownTicks <= 20
            ? '2'
            : state.countdownTicks <= 30
              ? '1'
              : 'LFG';
      this.promptText.text = countdownText;
      this.winnerText.text = '';
    } else if (state.gameEnded) {
      this.promptText.text = `${state.winnerName.toUpperCase()} WINS!`;
      this.winnerText.text = 'PRESS ANY BUTTON TO CONTINUE';
    } else {
      this.promptText.text = '';
      this.winnerText.text = '';
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
    }, 40);
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
      const radius = rowSize / 3;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;
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
