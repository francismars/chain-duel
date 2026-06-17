import type { Event } from 'nostr-tools';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/socket';
import { createFlowTrace } from '@/lib/nostr/nip46Trace';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const DEFAULT_TIMEOUT_MS = 30_000;

function waitFor<T>(
  socket: GameSocket,
  event: keyof ServerToClientEvents,
  emit: () => void,
  parse: (payload: unknown) => T | null,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${String(event)} timeout`));
    }, timeoutMs);

    const handler = (payload: unknown) => {
      const parsed = parse(payload);
      if (parsed == null) return;
      cleanup();
      resolve(parsed);
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      socket.off(event, handler as (...args: unknown[]) => void);
    };

    socket.on(event, handler as (...args: unknown[]) => void);
    emit();
  });
}

export type ChallengeEligibilityResponse = {
  ok: boolean;
  pubkey: string | null;
  eligible: boolean;
  checks: Record<
    string,
    {
      pass: boolean;
      detail?: string;
      count?: number;
      ageDays?: number | null;
      address?: string | null;
    }
  >;
};

export function fetchChallengeEligibility(
  socket: GameSocket,
  options?: { refresh?: boolean }
): Promise<ChallengeEligibilityResponse> {
  return waitFor(
    socket,
    'resChallengeEligibility',
    () => socket.emit('getChallengeEligibility', { refresh: options?.refresh === true }),
    (p) => SocketBoundaryParsers.resChallengeEligibility(p)
  );
}

export type ChallengeRunResponse =
  | {
      ok: true;
      runId: string;
      seed: string;
      bountySats: number;
      challengeId: string;
      expiresAt: number;
    }
  | { ok: false; reason: string };

export function requestChallengeRun(
  socket: GameSocket,
  challengeId: string
): Promise<ChallengeRunResponse> {
  return waitFor(
    socket,
    'resChallengeRun',
    () => socket.emit('requestChallengeRun', { challengeId }),
    (p) => SocketBoundaryParsers.resChallengeRun(p)
  );
}

export type ChallengeInputEntry = { tick: number; dir: string };

export type SubmitChallengeWinResponse =
  | {
      ok: true;
      claimToken: string;
      claimExpiresAt: number;
      noteContent: string;
      noteTags: string[][];
      bountySats: number;
      challengeName: string;
    }
  | { ok: false; reason: string };

export function submitChallengeWin(
  socket: GameSocket,
  payload: {
    runId: string;
    inputLog: ChallengeInputEntry[];
    countdownStartTick?: number;
  }
): Promise<SubmitChallengeWinResponse> {
  return waitFor(
    socket,
    'resSubmitChallengeWin',
    () => socket.emit('submitChallengeWin', payload),
    (p) => SocketBoundaryParsers.resSubmitChallengeWin(p),
    45_000
  );
}

export type ClaimChallengeBountyResponse =
  | {
      ok: true;
      eventId: string;
      bountySats: number;
      zapPaid: boolean;
      zapReason?: string;
      zapComment?: string;
    }
  | { ok: false; reason: string };

export function claimChallengeBounty(
  socket: GameSocket,
  payload: { claimToken: string; event: Event }
): Promise<ClaimChallengeBountyResponse> {
  const trace = createFlowTrace('marspay', 'claim-bounty');
  trace.step(
    'start',
    `token=${payload.claimToken.slice(0, 8)}… event=${payload.event.id?.slice(0, 12)}…`
  );

  return waitFor(
    socket,
    'resChallengeClaim',
    () => {
      trace.step(
        'emit claimChallengeBounty',
        `socket connected=${socket.connected}`
      );
      socket.emit('claimChallengeBounty', {
        claimToken: payload.claimToken,
        event: payload.event as unknown as Record<string, unknown>,
      });
    },
    (p) => {
      const parsed = SocketBoundaryParsers.resChallengeClaim(p);
      if (parsed == null) return null;
      if (parsed.ok) {
        trace.step(
          'resChallengeClaim ok',
          `eventId=${parsed.eventId.slice(0, 12)}… zapPaid=${parsed.zapPaid} sats=${parsed.bountySats}`
        );
        trace.done(
          parsed.zapPaid
            ? 'zap paid'
            : `zap skipped: ${parsed.zapReason ?? 'unknown'}`
        );
      } else {
        trace.fail('resChallengeClaim', parsed.reason);
      }
      return parsed;
    },
    60_000
  ).catch((err) => {
    trace.fail('claim', err);
    throw err;
  });
}

export function retryChallengeZap(
  socket: GameSocket,
  challengeId: string
): Promise<{ ok: boolean; reason?: string }> {
  return waitFor(
    socket,
    'resRetryChallengeZap',
    () => socket.emit('retryChallengeZap', { challengeId }),
    (p) => SocketBoundaryParsers.resRetryChallengeZap(p)
  );
}
