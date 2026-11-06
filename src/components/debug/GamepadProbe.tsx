import { useEffect, useRef, useState } from 'react';
import { isGamepadSyntheticKey } from '@/hooks/useGamepad';

/**
 * Debug: `?gamepads=probe` shows every raw `navigator.getGamepads()` slot, the
 * connect/disconnect events, and the keys the gamepad poller synthesizes.
 * `?gamepads=off` clears it. Kept for the tab session like `?touch=`.
 * `window.__gamepadProbe()` returns the same data as JSON for bug reports.
 */
const PROBE_PARAM = 'gamepads';
const PROBE_STORAGE_KEY = 'chainduel:gamepad-probe';
const LOG_LIMIT = 14;
/** A connected pad whose timestamp hasn't moved for this long is flagged. */
const FROZEN_MS = 3000;

function readProbeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const fromUrl = new URLSearchParams(window.location.search).get(PROBE_PARAM);
  try {
    if (fromUrl === 'off') {
      window.sessionStorage.removeItem(PROBE_STORAGE_KEY);
    } else if (fromUrl === 'probe') {
      window.sessionStorage.setItem(PROBE_STORAGE_KEY, '1');
    }
    return window.sessionStorage.getItem(PROBE_STORAGE_KEY) === '1';
  } catch {
    return fromUrl === 'probe';
  }
}

type SlotReport = {
  slot: number;
  /** What `pollGamepads` does with this slot (it only reads 0 and 1). */
  role: string;
  present: boolean;
  id: string | null;
  padIndex: number | null;
  connected: boolean | null;
  mapping: string | null;
  timestamp: number | null;
  /** ms since this slot's timestamp last changed (pads only tick on input on some browsers). */
  sinceTimestampChange: number | null;
  buttons: number;
  axes: number;
  pressed: number[];
  activeAxes: Array<[number, number]>;
};

type LogEntry = { t: number; text: string };

type ProbeReport = {
  at: string;
  userAgent: string;
  slotCount: number;
  slots: SlotReport[];
  events: LogEntry[];
  keys: LogEntry[];
};

function roleForSlot(slot: number): string {
  if (slot === 0) return 'P1 · WASD/Space';
  if (slot === 1) return 'P2 · Arrows/Enter';
  return 'IGNORED by game';
}

function pushLog(log: LogEntry[], text: string): void {
  log.unshift({ t: Math.round(performance.now()), text });
  if (log.length > LOG_LIMIT) log.length = LOG_LIMIT;
}

export function GamepadProbe() {
  const [enabled] = useState(readProbeEnabled);
  const [report, setReport] = useState<ProbeReport | null>(null);
  const [copied, setCopied] = useState(false);
  const reportRef = useRef<ProbeReport | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const events: LogEntry[] = [];
    const keys: LogEntry[] = [];
    const lastTimestamp = new Map<number, number>();
    const lastChangeAt = new Map<number, number>();

    const onConnect = (e: GamepadEvent) =>
      pushLog(
        events,
        `+ connected slot ${e.gamepad.index} · ${e.gamepad.id} · ${e.gamepad.mapping || 'custom'}`
      );
    const onDisconnect = (e: GamepadEvent) =>
      pushLog(
        events,
        `− disconnected slot ${e.gamepad.index} · ${e.gamepad.id}`
      );
    const onKey = (e: KeyboardEvent) => {
      if (!isGamepadSyntheticKey(e)) return;
      pushLog(keys, `${e.type === 'keydown' ? '↓' : '↑'} ${e.code || e.key}`);
    };

    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);

    const sample = (): ProbeReport => {
      const now = performance.now();
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const slots: SlotReport[] = [];
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad && lastTimestamp.get(i) !== pad.timestamp) {
          lastTimestamp.set(i, pad.timestamp);
          lastChangeAt.set(i, now);
        }
        const changedAt = lastChangeAt.get(i);
        slots.push({
          slot: i,
          role: roleForSlot(i),
          present: !!pad,
          id: pad?.id ?? null,
          padIndex: pad?.index ?? null,
          connected: pad?.connected ?? null,
          mapping: pad ? pad.mapping || 'custom' : null,
          timestamp: pad ? Math.round(pad.timestamp) : null,
          sinceTimestampChange:
            pad && changedAt !== undefined ? Math.round(now - changedAt) : null,
          buttons: pad?.buttons.length ?? 0,
          axes: pad?.axes.length ?? 0,
          pressed: pad
            ? Array.from(pad.buttons, (b, n) => (b.pressed ? n : -1)).filter(
                (n) => n >= 0
              )
            : [],
          activeAxes: pad
            ? Array.from(pad.axes, (v, n): [number, number] => [
                n,
                Math.round(v * 100) / 100,
              ]).filter(([, v]) => Math.abs(v) >= 0.2)
            : [],
        });
      }
      return {
        at: new Date().toISOString(),
        userAgent: navigator.userAgent,
        slotCount: pads.length,
        slots,
        events: [...events],
        keys: [...keys],
      };
    };

    let rafId = 0;
    let lastRender = 0;
    const tick = (now: number) => {
      const next = sample();
      reportRef.current = next;
      if (now - lastRender > 100) {
        lastRender = now;
        setReport(next);
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    const w = window as unknown as { __gamepadProbe?: () => ProbeReport };
    w.__gamepadProbe = () => reportRef.current ?? sample();

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      delete w.__gamepadProbe;
    };
  }, [enabled]);

  if (!enabled || !report) return null;

  const copy = () => {
    const text = JSON.stringify(reportRef.current ?? report, null, 2);
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => console.log(text)
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        zIndex: 2147483647,
        maxWidth: 'min(560px, calc(100vw - 16px))',
        maxHeight: '70vh',
        overflow: 'auto',
        padding: 8,
        background: 'rgba(0, 0, 0, 0.82)',
        color: '#d7ffd7',
        font: '11px/1.35 ui-monospace, Menlo, monospace',
        borderRadius: 6,
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>gamepad probe · {report.slotCount} slots</strong>
        <button
          type="button"
          tabIndex={-1}
          onClick={copy}
          style={{ pointerEvents: 'auto', font: 'inherit' }}
        >
          {copied ? 'copied' : 'copy JSON'}
        </button>
      </div>
      {report.slots.map((s) => {
        const frozen =
          s.connected && (s.sinceTimestampChange ?? 0) > FROZEN_MS
            ? ` · ts idle ${(s.sinceTimestampChange! / 1000).toFixed(1)}s`
            : '';
        const color = !s.present
          ? '#777'
          : s.slot > 1
            ? '#ff8a8a'
            : s.connected
              ? '#d7ffd7'
              : '#ffd27a';
        return (
          <div key={s.slot} style={{ color, marginTop: 4 }}>
            [{s.slot}] {s.role} —{' '}
            {s.present
              ? `${s.connected ? 'connected' : 'DISCONNECTED'} · idx ${s.padIndex} · ${s.mapping} · ${s.buttons}b/${s.axes}a · ts ${s.timestamp}${frozen}\n    ${s.id}\n    btn [${s.pressed.join(',')}] axes ${s.activeAxes.map(([n, v]) => `${n}:${v}`).join(' ')}`
              : 'empty'}
          </div>
        );
      })}
      <div style={{ marginTop: 6, color: '#9fd0ff' }}>
        events{'\n'}
        {report.events.map((e) => `  ${e.t} ${e.text}`).join('\n') ||
          '  (none since load)'}
      </div>
      <div style={{ marginTop: 6, color: '#ffe79f' }}>
        synthetic keys{'\n'}
        {report.keys.map((e) => `  ${e.t} ${e.text}`).join('\n') ||
          '  (none yet)'}
      </div>
    </div>
  );
}
