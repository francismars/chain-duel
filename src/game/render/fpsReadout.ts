/** Per-frame work the game loop times, so a slow frame can be blamed on a part. */
export type FrameSection = 'sim' | 'audio' | 'scene' | 'submit';

const SECTIONS: FrameSection[] = ['sim', 'audio', 'scene', 'submit'];

export type FpsSummary = {
  fps: number;
  worstFrameMs: number;
  /** Average per frame, ms. */
  avg: Record<FrameSection, number>;
  /** Slowest single frame, ms. */
  max: Record<FrameSection, number>;
  /** Average frame time not spent in our JS (browser style, layout, paint, compositing, GC). */
  browserMs: number;
};

declare global {
  interface Window {
    /** Last Show FPS summary, for profiling from devtools or a test harness. */
    __chainduelPerf?: FpsSummary;
  }
}

function zero(): Record<FrameSection, number> {
  return { sim: 0, audio: 0, scene: 0, submit: 0 };
}

const fmt = (ms: number) => ms.toFixed(1);

/**
 * Config → Graphics → Show FPS. Updates twice a second so it barely touches
 * the DOM. Shows frame rate, the slowest frame, and where the JS time went.
 */
export function createFpsReadout() {
  const el = document.createElement('div');
  el.className = 'graphics-fps-readout';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  let windowStart = -1;
  let frames = 0;
  let worstMs = 0;
  let frameTotalMs = 0;
  let sums = zero();
  let maxes = zero();
  let current = zero();

  return {
    /** Time spent in one part of the current frame. */
    add(section: FrameSection, ms: number) {
      current[section] += ms;
    },
    frame(now: number, frameMs: number) {
      // Close out the previous frame's sections.
      for (const key of SECTIONS) {
        sums[key] += current[key];
        maxes[key] = Math.max(maxes[key], current[key]);
      }
      current = zero();
      if (windowStart < 0) {
        windowStart = now;
        sums = zero();
        maxes = zero();
        return;
      }
      frames += 1;
      frameTotalMs += frameMs;
      worstMs = Math.max(worstMs, frameMs);
      const elapsed = now - windowStart;
      if (elapsed < 500) return;

      const avg = zero();
      let jsAvg = 0;
      for (const key of SECTIONS) {
        avg[key] = sums[key] / frames;
        jsAvg += avg[key];
      }
      const summary: FpsSummary = {
        fps: Math.round((frames * 1000) / elapsed),
        worstFrameMs: Math.round(worstMs),
        avg,
        max: { ...maxes },
        browserMs: Math.max(0, frameTotalMs / frames - jsAvg),
      };
      window.__chainduelPerf = summary;
      el.textContent =
        `${summary.fps} fps · worst ${summary.worstFrameMs} ms\n` +
        `js avg ${fmt(jsAvg)} ms: sim ${fmt(avg.sim)} audio ${fmt(avg.audio)} scene ${fmt(avg.scene)} submit ${fmt(avg.submit)}\n` +
        `js max: sim ${fmt(maxes.sim)} audio ${fmt(maxes.audio)} scene ${fmt(maxes.scene)} submit ${fmt(maxes.submit)}`;

      windowStart = now;
      frames = 0;
      worstMs = 0;
      frameTotalMs = 0;
      sums = zero();
      maxes = zero();
    },
    remove() {
      el.remove();
      delete window.__chainduelPerf;
    },
  };
}
