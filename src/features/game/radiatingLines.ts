export type Rgb = [number, number, number];

type RadiateLine = {
  angle: number;
  progress: number;
  speed: number;
  segLen: number;
  width: number;
  baseAlpha: number;
};

const INTRO_MS = 1650;

function introIntensity(elapsedMs: number): number {
  const t = Math.min(1, elapsedMs / INTRO_MS);
  const inv = 1 - t;
  return inv * inv * inv;
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type RadiatingTone = 'full' | 'burst' | 'calm';

/** Full-screen rays used on the solo challenge result. */
export class RadiatingField {
  private lines: RadiateLine[] = [];
  private width = 0;
  private height = 0;
  private maxRadius = 0;
  private startedAt = 0;
  private seeded = false;
  private originX = 0;
  private originY = 0;
  private originSet = false;
  private hole: [number, number, number, number] | null = null;

  constructor(private readonly tone: RadiatingTone = 'full') {}

  /** Burst origin in canvas pixels. Defaults to the viewport center. */
  setOrigin(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
    this.originSet = true;
  }

  /** Keep the playfield clear so the burst reads as coming from behind it. */
  setHole(x: number, y: number, width: number, height: number): void {
    this.hole = [x, y, width, height];
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height && this.lines.length)
      return;
    this.width = width;
    this.height = height;
    this.maxRadius = Math.hypot(width, height) * 0.54;
    const divisor = this.tone === 'calm' ? 42 : 16;
    const count = Math.max(
      this.tone === 'calm' ? 22 : 48,
      Math.floor((width + height) / divisor)
    );
    this.lines = Array.from({ length: count }, () => ({
      angle: Math.random() * Math.PI * 2,
      progress: Math.random(),
      speed: this.calmSpeed(),
      segLen: 40 + Math.random() * 90,
      width: 0.75 + Math.random() * 1.35,
      baseAlpha: 0.14 + Math.random() * 0.16,
    }));
    if (!this.seeded) {
      if (this.tone !== 'calm') this.seedIntro();
      else this.seedCalm();
      this.seeded = true;
      this.startedAt = performance.now();
    }
  }

  paint(
    ctx: CanvasRenderingContext2D,
    now: number,
    accent: Rgb = [255, 255, 255],
    accentStrong: Rgb = [255, 255, 255]
  ): void {
    if (!this.lines.length) return;
    const intro =
      this.tone === 'calm' ? 0 : introIntensity(now - this.startedAt);
    const speedMul = 1 + intro * 4.5;
    const alphaMul = (1 + intro * 2.2) * (this.tone === 'calm' ? 0.42 : 1);
    const segMul = 1 + intro * 0.75;
    const cx = this.originSet ? this.originX : this.width * 0.5;
    const cy = this.originSet ? this.originY : this.height * 0.5;

    ctx.save();
    if (this.hole) {
      const [hx, hy, hw, hh] = this.hole;
      ctx.beginPath();
      ctx.rect(0, 0, this.width, this.height);
      ctx.rect(hx, hy, hw, hh);
      ctx.clip('evenodd');
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${0.045 + (1 - intro) * 0.04})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';

    for (const line of this.lines) {
      line.progress += line.speed * speedMul;
      if (line.progress > 1) {
        line.progress = 0;
        line.angle = Math.random() * Math.PI * 2;
        line.speed =
          intro > 0.1 ? 0.005 + Math.random() * 0.012 : this.calmSpeed();
        line.segLen = 40 + Math.random() * 90;
        line.baseAlpha = 0.14 + Math.random() * 0.16;
        line.width = 0.75 + Math.random() * 1.35;
      }

      const headR = this.maxRadius * line.progress;
      const segLen = line.segLen * segMul;
      const tailR = Math.max(0, headR - segLen);
      const cos = Math.cos(line.angle);
      const sin = Math.sin(line.angle);
      const hx = cx + cos * headR;
      const hy = cy + sin * headR;
      const tx = cx + cos * tailR;
      const ty = cy + sin * tailR;
      const centerFade = Math.min(1, line.progress * 5.5);
      const edgeFade = Math.min(1, (1 - line.progress) * 5);
      const alpha = Math.min(
        0.72,
        line.baseAlpha * alphaMul * centerFade * edgeFade
      );
      if (alpha < 0.015) continue;

      const gradient = ctx.createLinearGradient(tx, ty, hx, hy);
      gradient.addColorStop(0, rgba(accent, 0));
      gradient.addColorStop(0.35, rgba(accent, alpha * 0.42));
      gradient.addColorStop(0.72, rgba(accentStrong, alpha * 0.78));
      gradient.addColorStop(1, rgba(accentStrong, alpha));
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = line.width * (1 + intro * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  private calmSpeed(): number {
    return 0.0022 + Math.random() * 0.0038;
  }

  private seedCalm(): void {
    for (const line of this.lines) {
      line.baseAlpha = 0.08 + Math.random() * 0.08;
      line.width = 0.6 + Math.random() * 0.7;
      line.segLen = 28 + Math.random() * 50;
    }
  }

  private seedIntro(): void {
    for (const line of this.lines) {
      line.progress = Math.random() * 0.18;
      line.speed = 0.008 + Math.random() * 0.018;
      line.segLen = 64 + Math.random() * 130;
      line.baseAlpha = 0.22 + Math.random() * 0.24;
      line.width = 1 + Math.random() * 1.6;
    }
  }
}
