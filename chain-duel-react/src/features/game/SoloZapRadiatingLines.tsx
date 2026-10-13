import { useEffect, useRef } from 'react';
import {
  RadiatingField,
  type RadiatingTone,
  type Rgb,
} from '@/features/game/radiatingLines';
import '@/features/game/endScreenRays.css';

type SoloZapRadiatingLinesProps = {
  className?: string;
  accent?: Rgb;
  accentStrong?: Rgb;
  /** Burst sits under the board. Calm is the faint set behind the end card. */
  tone?: RadiatingTone;
};

const DEFAULT_ACCENT: Rgb = [255, 255, 255];
const DEFAULT_ACCENT_STRONG: Rgb = [255, 255, 255];

export function SoloZapRadiatingLines({
  className = '',
  accent = DEFAULT_ACCENT,
  accentStrong = DEFAULT_ACCENT_STRONG,
  tone = 'full',
}: SoloZapRadiatingLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentRef = useRef(accent);
  const accentStrongRef = useRef(accentStrong);
  accentRef.current = accent;
  accentStrongRef.current = accentStrong;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const field = new RadiatingField(tone);
    let raf = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      field.resize(width, height);
      if (tone === 'burst') {
        const board = document.getElementById('gameCanvas');
        if (board) {
          const rect = board.getBoundingClientRect();
          field.setOrigin(rect.left + rect.width / 2, rect.top + rect.height / 2);
          field.setHole(rect.left, rect.top, rect.width, rect.height);
        }
      }
    };

    const draw = (now: number) => {
      field.paint(ctx, now, accentRef.current, accentStrongRef.current);
      raf = window.requestAnimationFrame(draw);
    };

    resize();
    const parent = canvas.parentElement;
    const ro = parent ? new ResizeObserver(resize) : null;
    if (parent) ro?.observe(parent);
    raf = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [tone]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
