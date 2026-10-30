import type {
  OnlineForfeitPause,
  OnlineForfeitReason,
  OnlinePrizeClaim,
} from '@/types/socket';

export type { OnlinePrizeClaim };

export type ForfeitViewer = 'p1' | 'p2' | 'spectator';

export function formatForfeitRemaining(ms: number): string {
  const safe = Number.isFinite(ms) ? ms : 0;
  const totalSec = Math.max(0, Math.ceil(safe / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function coerceOnlineForfeitPause(
  value: unknown
): OnlineForfeitPause | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.paused !== 'boolean') {
    return undefined;
  }
  if (typeof raw.limitMs !== 'number' || !Number.isFinite(raw.limitMs)) {
    return undefined;
  }
  const forfeit: OnlineForfeitPause = {
    paused: raw.paused,
    limitMs: raw.limitMs,
  };
  if (
    typeof raw.p1RemainingMs === 'number' &&
    Number.isFinite(raw.p1RemainingMs)
  ) {
    forfeit.p1RemainingMs = raw.p1RemainingMs;
  }
  if (
    typeof raw.p2RemainingMs === 'number' &&
    Number.isFinite(raw.p2RemainingMs)
  ) {
    forfeit.p2RemainingMs = raw.p2RemainingMs;
  }
  const p1Reason = forfeitReason(raw.p1Reason);
  const p2Reason = forfeitReason(raw.p2Reason);
  if (p1Reason) {
    forfeit.p1Reason = p1Reason;
  }
  if (p2Reason) {
    forfeit.p2Reason = p2Reason;
  }
  return forfeit;
}

function forfeitReason(value: unknown): OnlineForfeitReason | undefined {
  return value === 'disconnect' || value === 'idle' ? value : undefined;
}

function finiteMs(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

export type ForfeitPauseTone = 'opponent' | 'self' | 'both' | 'watch';

export type ForfeitPauseLine = {
  kicker: string;
  timeLabel: string;
  message: string;
  tone: ForfeitPauseTone;
};

type AwaySeat = 'p1' | 'p2';

function seatPauseReason(
  forfeit: OnlineForfeitPause,
  seat: AwaySeat
): OnlineForfeitReason {
  const reason = seat === 'p1' ? forfeit.p1Reason : forfeit.p2Reason;
  return reason === 'idle' ? 'idle' : 'disconnect';
}

/** One seat's overlay line. A missing reason is a disconnect. */
function seatPauseLine(args: {
  seat: AwaySeat;
  remainingMs: number;
  reason: OnlineForfeitReason;
  viewer: ForfeitViewer;
  name: string;
}): ForfeitPauseLine {
  const timeLabel = formatForfeitRemaining(args.remainingMs);
  const you = args.viewer === args.seat;
  if (args.reason === 'idle') {
    if (args.viewer === 'spectator') {
      return {
        kicker: `${args.name} isn't moving.`,
        timeLabel,
        message: 'Waiting for them to move.',
        tone: 'watch',
      };
    }
    if (you) {
      return {
        kicker: "You're not moving.",
        timeLabel,
        message: 'Move or you forfeit.',
        tone: 'self',
      };
    }
    return {
      kicker: "Opponent isn't moving.",
      timeLabel,
      message: "You win if they don't move.",
      tone: 'opponent',
    };
  }
  if (args.viewer === 'spectator') {
    return {
      kicker: `${args.name} disconnected`,
      timeLabel,
      message: 'Waiting for them to return.',
      tone: 'watch',
    };
  }
  if (you) {
    return {
      kicker: 'You disconnected',
      timeLabel,
      message: 'Rejoin or you forfeit.',
      tone: 'self',
    };
  }
  return {
    kicker: 'Opponent disconnected',
    timeLabel,
    message: "You win if they don't return.",
    tone: 'opponent',
  };
}

export type IdleSeatBadge = {
  seat: AwaySeat;
  label: string;
};

/** Idle seats while the board is still running. No badge when the match is paused. */
export function idleSeatBadges(args: {
  forfeit: OnlineForfeitPause;
  viewer: ForfeitViewer;
  p1Name: string;
  p2Name: string;
}): IdleSeatBadge[] {
  if (args.forfeit.paused) {
    return [];
  }
  const badges: IdleSeatBadge[] = [];
  const seats: AwaySeat[] = ['p1', 'p2'];
  for (const seat of seats) {
    const reason =
      seat === 'p1' ? args.forfeit.p1Reason : args.forfeit.p2Reason;
    const remainingMs = finiteMs(
      seat === 'p1' ? args.forfeit.p1RemainingMs : args.forfeit.p2RemainingMs
    );
    if (reason !== 'idle' || remainingMs == null) {
      continue;
    }
    const name = seat === 'p1' ? args.p1Name : args.p2Name;
    const who = args.viewer === seat ? 'You' : name;
    badges.push({
      seat,
      label: `${who} idle · ${formatForfeitRemaining(remainingMs)}`,
    });
  }
  return badges;
}

/** Copy for the pause overlay. Only when the server has paused the match. */
export function forfeitPauseCopy(args: {
  forfeit: OnlineForfeitPause;
  viewer: ForfeitViewer;
  p1Name: string;
  p2Name: string;
}): { tone: ForfeitPauseTone; lines: ForfeitPauseLine[] } | null {
  if (!args.forfeit.paused) {
    return null;
  }
  const p1 = finiteMs(args.forfeit.p1RemainingMs);
  const p2 = finiteMs(args.forfeit.p2RemainingMs);
  if (p1 == null && p2 == null) {
    return null;
  }

  if (p1 != null && p2 != null) {
    const p1Reason = seatPauseReason(args.forfeit, 'p1');
    const p2Reason = seatPauseReason(args.forfeit, 'p2');
    if (p1Reason !== p2Reason) {
      const seats: AwaySeat[] =
        args.viewer === 'p2' ? ['p2', 'p1'] : ['p1', 'p2'];
      const lines = seats.map((seat) =>
        seatPauseLine({
          seat,
          remainingMs: seat === 'p1' ? p1 : p2,
          reason: seat === 'p1' ? p1Reason : p2Reason,
          viewer: args.viewer,
          name: seat === 'p1' ? args.p1Name : args.p2Name,
        })
      );
      return { tone: 'both', lines };
    }
    const idle = p1Reason === 'idle';
    return {
      tone: 'both',
      lines: [
        {
          kicker: idle ? 'Neither player is moving.' : 'Both disconnected',
          timeLabel: formatForfeitRemaining(Math.min(p1, p2)),
          message: 'Ends when the first clock hits zero.',
          tone: 'both',
        },
      ],
    };
  }

  const seat: AwaySeat = p1 != null ? 'p1' : 'p2';
  const line = seatPauseLine({
    seat,
    remainingMs: (p1 ?? p2) as number,
    reason: seatPauseReason(args.forfeit, seat),
    viewer: args.viewer,
    name: seat === 'p1' ? args.p1Name : args.p2Name,
  });
  return { tone: line.tone, lines: [line] };
}

/** Seat meta. Time comes only from the server remaining ms. */
export function seatDisconnectLabel(remainingMs?: number): string {
  const ms = finiteMs(remainingMs);
  if (ms == null) {
    return 'Disconnected';
  }
  return `Disconnected · ${formatForfeitRemaining(ms)}`;
}

function withAwayTime(text: string, ms: number | undefined): string {
  if (ms == null) {
    return text;
  }
  return `${text} · ${formatForfeitRemaining(ms)}`;
}

/** One line for the match intro and the spectator card. */
export function seatAwayLine(args: {
  p1Away: boolean;
  p2Away: boolean;
  viewer: ForfeitViewer;
  p1Name: string;
  p2Name: string;
  forfeit?: OnlineForfeitPause | null;
}): string | null {
  if (!args.p1Away && !args.p2Away) {
    return null;
  }
  const p1Ms = finiteMs(args.forfeit?.p1RemainingMs);
  const p2Ms = finiteMs(args.forfeit?.p2RemainingMs);
  if (args.p1Away && args.p2Away) {
    const ms =
      p1Ms != null && p2Ms != null ? Math.min(p1Ms, p2Ms) : (p1Ms ?? p2Ms);
    return withAwayTime('Both away', ms);
  }
  const p1 = args.p1Away;
  const name = p1 ? args.p1Name : args.p2Name;
  const ms = p1 ? p1Ms : p2Ms;
  const you = (args.viewer === 'p1' && p1) || (args.viewer === 'p2' && !p1);
  return withAwayTime(you ? 'You are away' : `${name} is away`, ms);
}

/** Results screen. No clock. */
export function resultsAwayLine(args: {
  p1Away: boolean;
  p2Away: boolean;
  viewer: ForfeitViewer;
  p1Name: string;
  p2Name: string;
}): string | null {
  if (!args.p1Away && !args.p2Away) {
    return null;
  }
  if (args.p1Away && args.p2Away) {
    return 'Both players are away.';
  }
  const p1 = args.p1Away;
  const name = p1 ? args.p1Name : args.p2Name;
  const you = (args.viewer === 'p1' && p1) || (args.viewer === 'p2' && !p1);
  return you ? 'You are away.' : `${name} is away.`;
}

/**
 * Prize deadline from the last claim the server sent. Countdown wording only
 * while remainingMs is decreasing. A held or higher value is a static deadline.
 * Omitted claim hides the line. limitMs is not used for the sentence.
 */
export function resultsClaimLine(args: {
  claim?: OnlinePrizeClaim | null;
  viewerIsWinner: boolean;
  winnerName: string;
  hasLnAddress: boolean;
  ticking: boolean;
}): string | null {
  const ms = finiteMs(args.claim?.remainingMs);
  if (ms == null) {
    return null;
  }
  const time = formatForfeitRemaining(ms);
  if (!args.ticking) {
    if (args.hasLnAddress) {
      return args.viewerIsWinner
        ? `Pays to your Lightning address if you don't withdraw. Deadline ${time}.`
        : `Pays to ${args.winnerName}'s Lightning address. Deadline ${time}.`;
    }
    return args.viewerIsWinner
      ? `Withdraw or start double-or-nothing. Deadline ${time}. After that the prize is held for a manual payout.`
      : `Prize deadline ${time}. It is held for a manual payout.`;
  }
  if (args.hasLnAddress) {
    return args.viewerIsWinner
      ? `Pays to your Lightning address in ${time} if you don't withdraw.`
      : `Pays to ${args.winnerName}'s Lightning address in ${time}.`;
  }
  return args.viewerIsWinner
    ? `Withdraw or start double-or-nothing before ${time}. After that the prize is held for a manual payout.`
    : `Prize is held for a manual payout in ${time}.`;
}

export function coerceOnlinePrizeClaim(
  value: unknown
): OnlinePrizeClaim | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.remainingMs !== 'number' ||
    !Number.isFinite(raw.remainingMs)
  ) {
    return undefined;
  }
  if (typeof raw.limitMs !== 'number' || !Number.isFinite(raw.limitMs)) {
    return undefined;
  }
  return { remainingMs: raw.remainingMs, limitMs: raw.limitMs };
}
