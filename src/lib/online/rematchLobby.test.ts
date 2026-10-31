import { describe, expect, it } from 'vitest';
import { rematchLobbyView, type RematchLobbyPostGame } from './rematchLobby';

const ROOM_NOTE = 'room-note-1';

function view(
  postGame: RematchLobbyPostGame | null | undefined,
  sessionId = 'sess-loser',
  roomNote1 = ROOM_NOTE
) {
  return rematchLobbyView({ postGame, roomNote1, sessionId });
}

describe('rematchLobbyView', () => {
  it('uses the room note and clears payer state when no rematch exists', () => {
    expect(view(undefined)).toEqual({
      pending: false,
      noteToPoll: ROOM_NOTE,
      amount: 0,
      eventId: '',
      paymentReady: false,
      loserMustPay: false,
      waitingSessionId: '',
    });
    expect(view(null, 'sess-loser', '')).toMatchObject({
      noteToPoll: '',
      loserMustPay: false,
    });
  });

  it('ignores a leftover rematch note and does not mark a payer before the rematch is requested', () => {
    const result = view({
      rematchRequested: false,
      rematchNote1: 'rematch-note',
      rematchRequiredAmount: 2_000,
      rematchEventId: 'evt-1',
      rematchWaitingForSessionID: 'sess-loser',
    });

    expect(result.pending).toBe(false);
    expect(result.noteToPoll).toBe(ROOM_NOTE);
    expect(result.loserMustPay).toBe(false);
    expect(result.waitingSessionId).toBe('sess-loser');
    expect(result.paymentReady).toBe(true);
    expect(result.amount).toBe(2_000);
    expect(result.eventId).toBe('evt-1');
  });

  it('polls the rematch note while pending, including while that note is still empty', () => {
    expect(
      view({
        rematchRequested: true,
        rematchNote1: '',
      }).noteToPoll
    ).toBe('');
    expect(
      view({
        rematchRequested: true,
      }).noteToPoll
    ).toBe('');
    expect(
      view({
        rematchRequested: true,
        rematchNote1: 'rematch-note',
      }).noteToPoll
    ).toBe('rematch-note');
  });

  it('marks the payer only when a pending rematch names this non-empty session', () => {
    const pending = {
      rematchRequested: true,
      rematchWaitingForSessionID: 'sess-loser',
    };

    expect(view(pending, 'sess-loser').loserMustPay).toBe(true);
    expect(view(pending, 'sess-other').loserMustPay).toBe(false);
    expect(
      view({ rematchRequested: true, rematchWaitingForSessionID: '' }, '')
        .loserMustPay
    ).toBe(false);
    expect(
      view(
        { rematchRequested: true, rematchWaitingForSessionID: 'sess-loser' },
        ''
      ).loserMustPay
    ).toBe(false);
    expect(
      view({
        rematchRequested: true,
      }).loserMustPay
    ).toBe(false);
  });

  it('treats payment as ready only for a positive amount and a non-empty event id', () => {
    expect(
      view({
        rematchRequested: true,
        rematchRequiredAmount: 0,
        rematchEventId: 'evt-1',
      }).paymentReady
    ).toBe(false);
    expect(
      view({
        rematchRequested: true,
        rematchRequiredAmount: 500,
      }).paymentReady
    ).toBe(false);
    expect(
      view({
        rematchRequested: true,
        rematchRequiredAmount: 500,
        rematchEventId: '',
      }).paymentReady
    ).toBe(false);
    expect(
      view({
        rematchRequested: true,
        rematchRequiredAmount: 500,
        rematchEventId: 'evt-1',
      })
    ).toMatchObject({
      paymentReady: true,
      amount: 500,
      eventId: 'evt-1',
    });
    expect(
      view({
        rematchRequiredAmount: 500,
        rematchEventId: ' ',
      }).paymentReady
    ).toBe(true);
  });
});
