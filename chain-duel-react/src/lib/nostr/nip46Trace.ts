/**
 * Structured timing logs for NIP-46 sign-in, relay RPC, and marspay socket flows.
 * Filter console by `[NIP-46]` to see everything, or `[NIP-46][relay]` / `[marspay]` / `[challenge]`.
 */

export type Nip46TraceChannel = 'relay' | 'marspay' | 'pairing' | 'challenge';

export type FlowTrace = {
  step: (phase: string, detail?: string) => void;
  fail: (phase: string, err: unknown) => void;
  done: (detail?: string) => void;
};

export function relayHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function createFlowTrace(channel: Nip46TraceChannel, flow: string): FlowTrace {
  const t0 = Date.now();
  let last = t0;
  const prefix = `[NIP-46][${channel}] ${flow}`;

  return {
    step(phase, detail) {
      const now = Date.now();
      const delta = now - last;
      const total = now - t0;
      last = now;
      console.log(`${prefix} | ${phase} +${delta}ms (${total}ms)${detail ? ` — ${detail}` : ''}`);
    },
    fail(phase, err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`${prefix} | ${phase} FAILED (${Date.now() - t0}ms) — ${msg}`);
    },
    done(detail) {
      console.log(`${prefix} | ✓ done (${Date.now() - t0}ms)${detail ? ` — ${detail}` : ''}`);
    },
  };
}

/** Tags the next NIP-46 sign_event RPC log (server link vs bounty note, etc.). */
let pendingSignFlow: string | null = null;

export function withNip46SignFlow<T>(flow: string, fn: () => Promise<T>): Promise<T> {
  pendingSignFlow = flow;
  return fn().finally(() => {
    pendingSignFlow = null;
  });
}

export function consumePendingSignFlow(fallback: string): string {
  const flow = pendingSignFlow ?? fallback;
  pendingSignFlow = null;
  return flow;
}
