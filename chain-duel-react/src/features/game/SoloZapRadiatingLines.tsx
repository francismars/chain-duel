import { useEffect, useRef } from 'react';

type Rgb = [number, number, number];

type RadiateLine = {
  angle: number;
  progress: number;
  speed: number;
  segLen: number;
  width: number;
  baseAlpha: number;
};

type SoloZapRadiatingLinesProps = {
  className?: string;
  accent?: Rgb;
  accentStrong?: Rgb;
};

const INTRO_MS = 1650;
const DEFAULT_ACCENT: Rgb = [255, 255, 255];
const DEFAULT_ACCENT_STRONG: Rgb = [255, 255, 255];

function introIntensity(elapsedMs: number): number {
  const t = Math.min(1, elapsedMs / INTRO_MS);
  const inv = 1 - t;
  return inv * inv * inv;
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function SoloZapRadiatingLines({
  className = '',
  accent = DEFAULT_ACCENT,
  accentStrong = DEFAULT_ACCENT_STRONG,
}: SoloZapRadiatingLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentRef = useRef(accent);
  const accentStrongRef = useRef(accentStrong);

  accentRef.current = accent;
  accentStrongRef.current = accentStrong;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (prefersReducedMotion) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lines: RadiateLine[] = [];
    let width = 0;
    let height = 0;
    let maxRadius = 0;
    const startedAt = performance.now();
    let hasSeededIntro = false;

    const calmSpeed = () => 0.0022 + Math.random() * 0.0038;

    const buildLines = () => {
      const count = Math.max(48, Math.floor((width + height) / 16));
      lines = Array.from({ length: count }, () => ({
        angle: Math.random() * Math.PI * 2,
        progress: Math.random(),
        speed: calmSpeed(),
        segLen: 40 + Math.random() * 90,
        width: 0.75 + Math.random() * 1.35,
        baseAlpha: 0.14 + Math.random() * 0.16,
      }));
    };

    const seedIntroBurst = () => {
      for (const line of lines) {
        line.progress = Math.random() * 0.18;
        line.speed = 0.008 + Math.random() * 0.018;
        line.segLen = 64 + Math.random() * 130;
        line.baseAlpha = 0.22 + Math.random() * 0.24;
        line.width = 1 + Math.random() * 1.6;
      }
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;
      maxRadius = Math.hypot(width, height) * 0.54;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildLines();
      if (!hasSeededIntro) {
        seedIntroBurst();
        hasSeededIntro = true;
      }
    };

    const draw = (now: number) => {
      const intro = introIntensity(now - startedAt);
      const speedMul = 1 + intro * 4.5;
      const alphaMul = 1 + intro * 2.2;
      const segMul = 1 + intro * 0.75;
      const cx = width * 0.5;
      const cy = height * 0.5;
      const accentRgb = accentRef.current;
      const accentStrongRgb = accentStrongRef.current;

      canvas.style.opacity = String(0.52 + intro * 0.32);

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0, 0, 0, ${0.045 + (1 - intro) * 0.04})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';

      ctx.lineCap = 'round';

      for (const line of lines) {
        line.progress += line.speed * speedMul;
        if (line.progress > 1) {
          line.progress = 0;
          line.angle = Math.random() * Math.PI * 2;
          line.speed = intro > 0.1 ? 0.005 + Math.random() * 0.012 : calmSpeed();
          line.segLen = 40 + Math.random() * 90;
          line.baseAlpha = 0.14 + Math.random() * 0.16;
          line.width = 0.75 + Math.random() * 1.35;
        }

        const headR = maxRadius * line.progress;
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
        gradient.addColorStop(0, rgba(accentRgb, 0));
        gradient.addColorStop(0.35, rgba(accentRgb, alpha * 0.42));
        gradient.addColorStop(0.72, rgba(accentStrongRgb, alpha * 0.78));
        gradient.addColorStop(1, rgba(accentStrongRgb, alpha));

        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = line.width * (1 + intro * 0.4);
        ctx.stroke();
      }

      raf = window.requestAnimationFrame(draw);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    raf = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden
    />
  );
}
