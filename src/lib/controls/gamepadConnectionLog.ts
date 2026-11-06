/**
 * Always-on log of controller connects and disconnects, per slot.
 *
 * Browsers fire `gamepadconnected` / `gamepaddisconnected`, but some swap or
 * drop slots without an event, so slots are also diffed a few times a second.
 * A drop within KICK_WINDOW_MS of another pad connecting is flagged as a
 * likely kick (one controller knocking another out).
 *
 * Console lines are prefixed `[gamepad]`; `window.__gamepadLog()` returns the
 * buffer, and the `?gamepads=probe` overlay shows it.
 */

const LOG_LIMIT = 50;
const SLOT_POLL_MS = 250;
const KICK_WINDOW_MS = 1500;

export type GamepadLogKind = 'connect' | 'disconnect' | 'kick';

export type GamepadLogEntry = {
  /** ms since page load. */
  t: number;
  kind: GamepadLogKind;
  slot: number;
  id: string;
  /** 'event' = browser event, 'poll' = slot change seen without an event. */
  source: 'event' | 'poll';
  text: string;
};

type SlotState = { id: string; since: number };

const entries: GamepadLogEntry[] = [];
const slots = new Map<number, SlotState>();
const recent: Array<{
  t: number;
  kind: 'connect' | 'disconnect';
  slot: number;
  id: string;
}> = [];
let installed = false;

function shortId(id: string): string {
  return id.length > 48 ? `${id.slice(0, 45)}…` : id;
}

function record(entry: Omit<GamepadLogEntry, 't'>, t: number): void {
  const full = { ...entry, t: Math.round(t) };
  entries.unshift(full);
  if (entries.length > LOG_LIMIT) entries.length = LOG_LIMIT;
  const line = `[gamepad] ${(t / 1000).toFixed(2)}s ${full.text}`;
  if (entry.kind === 'kick') console.warn(line);
  else console.info(line);
}

function checkKick(
  t: number,
  kind: 'connect' | 'disconnect',
  slot: number,
  id: string,
  source: 'event' | 'poll'
): void {
  for (let i = recent.length - 1; i >= 0; i--) {
    if (t - recent[i].t > KICK_WINDOW_MS) recent.splice(i, 1);
  }
  const isLive = (r: { slot: number; id: string }) =>
    slots.get(r.slot)?.id === r.id;
  // Another pad, or a different pad in the same slot (it took the slot over).
  // The pad that joined must still be live, and the dropped one still gone.
  const otherIndex = recent.findIndex(
    (r) =>
      r.kind !== kind &&
      (r.slot !== slot || r.id !== id) &&
      (kind === 'disconnect' ? isLive(r) : !isLive(r))
  );
  if (otherIndex < 0) {
    recent.push({ t, kind, slot, id });
    return;
  }
  const other = recent[otherIndex];
  const [joined, dropped] =
    kind === 'connect' ? [{ slot, id }, other] : [other, { slot, id }];
  record(
    {
      kind: 'kick',
      slot: dropped.slot,
      id: dropped.id,
      source,
      text: `KICK? slot ${dropped.slot} (${shortId(dropped.id)}) dropped ${Math.round(t - other.t)}ms ${kind === 'connect' ? 'before' : 'after'} slot ${joined.slot} (${shortId(joined.id)}) connected`,
    },
    t
  );
  // Each drop is reported once: consume it, keep the join for further drops.
  if (kind === 'connect') {
    recent.splice(otherIndex, 1);
    recent.push({ t, kind, slot, id });
  }
}

function noteConnect(slot: number, id: string, source: 'event' | 'poll'): void {
  const t = performance.now();
  const prev = slots.get(slot);
  if (prev?.id === id) return;
  if (prev) noteDisconnect(slot, prev.id, source);
  const elsewhere = [...slots.entries()].find(
    ([s, v]) => s !== slot && v.id === id
  );
  slots.set(slot, { id, since: t });
  const live = [...slots.keys()].sort().join(',');
  record(
    {
      kind: 'connect',
      slot,
      id,
      source,
      text: `+ slot ${slot} connected (${source}) · ${shortId(id)}${elsewhere ? ` · same id also in slot ${elsewhere[0]}` : ''} · live slots [${live}]`,
    },
    t
  );
  checkKick(t, 'connect', slot, id, source);
}

function noteDisconnect(
  slot: number,
  id: string,
  source: 'event' | 'poll'
): void {
  const t = performance.now();
  const prev = slots.get(slot);
  if (!prev) return;
  slots.delete(slot);
  const live = [...slots.keys()].sort().join(',');
  record(
    {
      kind: 'disconnect',
      slot,
      id: prev.id || id,
      source,
      text: `− slot ${slot} disconnected (${source}) after ${((t - prev.since) / 1000).toFixed(1)}s · ${shortId(prev.id || id)} · live slots [${live}]`,
    },
    t
  );
  checkKick(t, 'disconnect', slot, prev.id || id, source);
}

function pollSlots(): void {
  const pads = navigator.getGamepads();
  const seen = new Set<number>();
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    if (!pad?.connected) continue;
    seen.add(i);
    noteConnect(i, pad.id, 'poll');
  }
  for (const [slot, state] of [...slots.entries()]) {
    if (!seen.has(slot)) noteDisconnect(slot, state.id, 'poll');
  }
}

/** Newest first. */
export function readGamepadLog(): GamepadLogEntry[] {
  return [...entries];
}

export function installGamepadConnectionLog(): void {
  if (installed || typeof window === 'undefined' || !navigator.getGamepads) {
    return;
  }
  installed = true;
  window.addEventListener('gamepadconnected', (e) =>
    noteConnect(e.gamepad.index, e.gamepad.id, 'event')
  );
  window.addEventListener('gamepaddisconnected', (e) =>
    noteDisconnect(e.gamepad.index, e.gamepad.id, 'event')
  );
  window.setInterval(pollSlots, SLOT_POLL_MS);
  (
    window as unknown as { __gamepadLog?: () => GamepadLogEntry[] }
  ).__gamepadLog = readGamepadLog;
}
