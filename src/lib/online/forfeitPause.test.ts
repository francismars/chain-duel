import { describe, expect, it } from 'vitest';
import {
  coerceOnlineForfeitPause,
  coerceOnlinePrizeClaim,
  forfeitPauseCopy,
  formatForfeitRemaining,
  idleSeatBadges,
  resultsAwayLine,
  resultsClaimLine,
  seatAwayLine,
  seatDisconnectLabel,
} from './forfeitPause';

describe('formatForfeitRemaining', () => {
  it('ceils to the next second and floors at 0:00', () => {
    expect(formatForfeitRemaining(0)).toBe('0:00');
    expect(formatForfeitRemaining(-20)).toBe('0:00');
    expect(formatForfeitRemaining(1)).toBe('0:01');
    expect(formatForfeitRemaining(1000)).toBe('0:01');
    expect(formatForfeitRemaining(1001)).toBe('0:02');
    expect(formatForfeitRemaining(59000)).toBe('0:59');
    expect(formatForfeitRemaining(60000)).toBe('1:00');
    expect(formatForfeitRemaining(299001)).toBe('5:00');
    expect(formatForfeitRemaining(300000)).toBe('5:00');
  });
});

describe('forfeitPauseCopy', () => {
  const names = { p1Name: 'Satoshi', p2Name: 'Hal' };

  it('tells player 1 how long the opponent has', () => {
    const copy = forfeitPauseCopy({
      forfeit: { paused: true, limitMs: 300000, p2RemainingMs: 125000 },
      viewer: 'p1',
      ...names,
    });
    expect(copy).toEqual({
      tone: 'opponent',
      lines: [
        {
          kicker: 'Opponent disconnected',
          timeLabel: '2:05',
          message: "You win if they don't return.",
          tone: 'opponent',
        },
      ],
    });
  });

  it('tells player 2 the same when only player 1 is gone', () => {
    const copy = forfeitPauseCopy({
      forfeit: { paused: true, limitMs: 300000, p1RemainingMs: 61000 },
      viewer: 'p2',
      ...names,
    });
    expect(copy?.lines[0]?.message).toBe("You win if they don't return.");
    expect(copy?.lines[0]?.timeLabel).toBe('1:01');
    expect(copy?.tone).toBe('opponent');
  });

  it('warns the disconnected player', () => {
    const copy = forfeitPauseCopy({
      forfeit: { paused: true, limitMs: 300000, p1RemainingMs: 9000 },
      viewer: 'p1',
      ...names,
    });
    expect(copy?.lines[0]).toMatchObject({
      kicker: 'You disconnected',
      timeLabel: '0:09',
      message: 'Rejoin or you forfeit.',
      tone: 'self',
    });
  });

  it('uses the shorter clock when both seats are gone', () => {
    const copy = forfeitPauseCopy({
      forfeit: {
        paused: true,
        limitMs: 300000,
        p1RemainingMs: 20000,
        p2RemainingMs: 45000,
      },
      viewer: 'spectator',
      ...names,
    });
    expect(copy).toEqual({
      tone: 'both',
      lines: [
        {
          kicker: 'Both disconnected',
          timeLabel: '0:20',
          message: 'Ends when the first clock hits zero.',
          tone: 'both',
        },
      ],
    });
  });

  it('names the missing seat for a spectator', () => {
    const copy = forfeitPauseCopy({
      forfeit: { paused: true, limitMs: 300000, p2RemainingMs: 3000 },
      viewer: 'spectator',
      ...names,
    });
    expect(copy?.lines[0]).toMatchObject({
      kicker: 'Hal disconnected',
      timeLabel: '0:03',
      message: 'Waiting for them to return.',
      tone: 'watch',
    });
  });

  it('uses idle copy for the seated player, the opponent, and a spectator', () => {
    expect(
      forfeitPauseCopy({
        forfeit: {
          paused: true,
          limitMs: 300000,
          p1RemainingMs: 9000,
          p1Reason: 'idle',
        },
        viewer: 'p1',
        ...names,
      })?.lines[0]
    ).toMatchObject({
      kicker: "You're not moving.",
      message: 'Move or you forfeit.',
      tone: 'self',
    });
    expect(
      forfeitPauseCopy({
        forfeit: {
          paused: true,
          limitMs: 300000,
          p2RemainingMs: 61000,
          p2Reason: 'idle',
        },
        viewer: 'p1',
        ...names,
      })?.lines[0]
    ).toMatchObject({
      kicker: "Opponent isn't moving.",
      message: "You win if they don't move.",
      tone: 'opponent',
    });
    expect(
      forfeitPauseCopy({
        forfeit: {
          paused: true,
          limitMs: 300000,
          p2RemainingMs: 3000,
          p2Reason: 'idle',
        },
        viewer: 'spectator',
        ...names,
      })?.lines[0]
    ).toMatchObject({
      kicker: "Hal isn't moving.",
      message: 'Waiting for them to move.',
      tone: 'watch',
    });
  });

  it('uses one line when both seats are idle', () => {
    const copy = forfeitPauseCopy({
      forfeit: {
        paused: true,
        limitMs: 300000,
        p1RemainingMs: 20000,
        p2RemainingMs: 45000,
        p1Reason: 'idle',
        p2Reason: 'idle',
      },
      viewer: 'spectator',
      ...names,
    });
    expect(copy).toEqual({
      tone: 'both',
      lines: [
        {
          kicker: 'Neither player is moving.',
          timeLabel: '0:20',
          message: 'Ends when the first clock hits zero.',
          tone: 'both',
        },
      ],
    });
  });

  it('keeps a line per seat when the reasons differ', () => {
    const copy = forfeitPauseCopy({
      forfeit: {
        paused: true,
        limitMs: 300000,
        p1RemainingMs: 9000,
        p2RemainingMs: 61000,
        p1Reason: 'idle',
        p2Reason: 'disconnect',
      },
      viewer: 'p1',
      ...names,
    });
    expect(copy?.lines).toEqual([
      {
        kicker: "You're not moving.",
        timeLabel: '0:09',
        message: 'Move or you forfeit.',
        tone: 'self',
      },
      {
        kicker: 'Opponent disconnected',
        timeLabel: '1:01',
        message: "You win if they don't return.",
        tone: 'opponent',
      },
    ]);
  });

  it('returns nothing when the match is not paused', () => {
    expect(
      forfeitPauseCopy({
        forfeit: { paused: false, limitMs: 300000, p2RemainingMs: 1000 },
        viewer: 'p1',
        ...names,
      })
    ).toBeNull();
    expect(
      forfeitPauseCopy({
        forfeit: { paused: true, limitMs: 300000 },
        viewer: 'p1',
        ...names,
      })
    ).toBeNull();
  });

  it('badges an idle seat without covering a running board', () => {
    const forfeit = {
      paused: false,
      limitMs: 300000,
      p2RemainingMs: 272000,
      p2Reason: 'idle' as const,
    };
    expect(
      forfeitPauseCopy({ forfeit, viewer: 'spectator', ...names })
    ).toBeNull();
    expect(idleSeatBadges({ forfeit, viewer: 'spectator', ...names })).toEqual([
      { seat: 'p2', label: 'Hal idle · 4:32' },
    ]);
    expect(
      idleSeatBadges({
        forfeit: {
          paused: false,
          limitMs: 300000,
          p1RemainingMs: 9000,
          p1Reason: 'idle',
        },
        viewer: 'p1',
        ...names,
      })
    ).toEqual([{ seat: 'p1', label: 'You idle · 0:09' }]);
    expect(
      idleSeatBadges({
        forfeit: {
          paused: true,
          limitMs: 300000,
          p2RemainingMs: 272000,
          p2Reason: 'idle',
        },
        viewer: 'spectator',
        ...names,
      })
    ).toEqual([]);
  });
});

describe('seat and results disconnect copy', () => {
  const names = { p1Name: 'Satoshi', p2Name: 'Hal' };

  it('prints the server time on a seat and omits it when missing', () => {
    expect(seatDisconnectLabel(undefined)).toBe('Disconnected');
    expect(seatDisconnectLabel(Number.NaN)).toBe('Disconnected');
    expect(seatDisconnectLabel(125000)).toBe('Disconnected · 2:05');
  });

  it('names who is away for the intro and the spectator card', () => {
    expect(
      seatAwayLine({
        p1Away: false,
        p2Away: true,
        viewer: 'spectator',
        ...names,
        forfeit: { paused: true, limitMs: 300000, p2RemainingMs: 125000 },
      })
    ).toBe('Hal is away · 2:05');
    expect(
      seatAwayLine({
        p1Away: true,
        p2Away: false,
        viewer: 'p1',
        ...names,
        forfeit: { paused: true, limitMs: 300000, p1RemainingMs: 61000 },
      })
    ).toBe('You are away · 1:01');
    expect(
      seatAwayLine({
        p1Away: true,
        p2Away: true,
        viewer: 'p2',
        ...names,
        forfeit: {
          paused: true,
          limitMs: 300000,
          p1RemainingMs: 20000,
          p2RemainingMs: 94000,
        },
      })
    ).toBe('Both away · 0:20');
    expect(
      seatAwayLine({
        p1Away: false,
        p2Away: true,
        viewer: 'spectator',
        ...names,
      })
    ).toBe('Hal is away');
    expect(
      seatAwayLine({
        p1Away: false,
        p2Away: false,
        viewer: 'spectator',
        ...names,
      })
    ).toBeNull();
  });

  it('states who is away on the results screen without a clock', () => {
    expect(
      resultsAwayLine({
        p1Away: true,
        p2Away: false,
        viewer: 'spectator',
        ...names,
      })
    ).toBe('Satoshi is away.');
    expect(
      resultsAwayLine({
        p1Away: false,
        p2Away: true,
        viewer: 'p2',
        ...names,
      })
    ).toBe('You are away.');
    expect(
      resultsAwayLine({
        p1Away: true,
        p2Away: true,
        viewer: 'p1',
        ...names,
      })
    ).toBe('Both players are away.');
  });

  it('tells the winner and the room what an unclaimed prize will do', () => {
    const claim = { remainingMs: 125000, limitMs: 300000 };
    expect(
      resultsClaimLine({
        claim,
        viewerIsWinner: true,
        winnerName: 'Satoshi',
        hasLnAddress: true,
        ticking: true,
      })
    ).toBe("Pays to your Lightning address in 2:05 if you don't withdraw.");
    expect(
      resultsClaimLine({
        claim,
        viewerIsWinner: false,
        winnerName: 'Satoshi',
        hasLnAddress: true,
        ticking: true,
      })
    ).toBe("Pays to Satoshi's Lightning address in 2:05.");
    expect(
      resultsClaimLine({
        claim,
        viewerIsWinner: true,
        winnerName: 'Satoshi',
        hasLnAddress: false,
        ticking: true,
      })
    ).toBe(
      'Withdraw or double before 2:05. Then the prize is held.'
    );
    expect(
      resultsClaimLine({
        claim: { remainingMs: 900000, limitMs: 900000 },
        viewerIsWinner: true,
        winnerName: 'Satoshi',
        hasLnAddress: false,
        ticking: true,
      })
    ).toBe(
      'Withdraw or double before 15:00. Then the prize is held.'
    );
    expect(
      resultsClaimLine({
        claim,
        viewerIsWinner: false,
        winnerName: 'Satoshi',
        hasLnAddress: false,
        ticking: true,
      })
    ).toBe('Prize is held for a manual payout in 2:05.');
    expect(
      resultsClaimLine({
        claim,
        viewerIsWinner: true,
        winnerName: 'Satoshi',
        hasLnAddress: true,
        ticking: false,
      })
    ).toBe(
      "Pays to your Lightning address if you don't withdraw. Deadline 2:05."
    );
    expect(
      resultsClaimLine({
        claim,
        viewerIsWinner: false,
        winnerName: 'Satoshi',
        hasLnAddress: false,
        ticking: false,
      })
    ).toBe('Prize deadline 2:05. It is held for a manual payout.');
    expect(
      resultsClaimLine({
        claim,
        viewerIsWinner: true,
        winnerName: 'Satoshi',
        hasLnAddress: false,
        ticking: false,
      })
    ).toBe(
      'Withdraw or double by 2:05. Then the prize is held.'
    );
    expect(
      resultsClaimLine({
        claim: null,
        viewerIsWinner: false,
        winnerName: 'Satoshi',
        hasLnAddress: true,
        ticking: true,
      })
    ).toBeNull();
  });
});

describe('coerceOnlinePrizeClaim', () => {
  it('keeps a valid claim and drops a missing one', () => {
    expect(
      coerceOnlinePrizeClaim({ remainingMs: 1000, limitMs: 300000 })
    ).toEqual({ remainingMs: 1000, limitMs: 300000 });
    expect(coerceOnlinePrizeClaim(undefined)).toBeUndefined();
    expect(coerceOnlinePrizeClaim({ remainingMs: 1000 })).toBeUndefined();
  });
});

describe('coerceOnlineForfeitPause', () => {
  it('keeps a valid pause and drops a missing one', () => {
    expect(
      coerceOnlineForfeitPause({
        paused: true,
        limitMs: 300000,
        p2RemainingMs: 1000,
        p2Reason: 'idle',
        p1Reason: 'later',
      })
    ).toEqual({
      paused: true,
      limitMs: 300000,
      p2RemainingMs: 1000,
      p2Reason: 'idle',
    });
    expect(coerceOnlineForfeitPause(undefined)).toBeUndefined();
    expect(coerceOnlineForfeitPause({ paused: 'yes' })).toBeUndefined();
  });
});
