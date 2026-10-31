export type RematchLobbyPostGame = {
  rematchRequested?: boolean;
  rematchNote1?: string;
  rematchRequiredAmount?: number;
  rematchEventId?: string;
  rematchWaitingForSessionID?: string;
};

export type RematchLobbyView = {
  pending: boolean;
  /** Kind1 id to poll. The rematch note, even when still empty, while pending. */
  noteToPoll: string;
  amount: number;
  eventId: string;
  /**
   * Amount and event id only. Does not require a pending rematch.
   * Callers that pay still gate on `loserMustPay`.
   */
  paymentReady: boolean;
  /**
   * This session must pay. Both ids have to be non-empty and equal,
   * and a rematch has to be pending. An empty session does not match.
   */
  loserMustPay: boolean;
  /** `''` when the server has not named a payer yet. */
  waitingSessionId: string;
};

/**
 * Rematch fields the lobby was reading in three places.
 * Seat identity (session or socket) stays in the page.
 */
export function rematchLobbyView(input: {
  postGame: RematchLobbyPostGame | null | undefined;
  roomNote1: string;
  sessionId: string;
}): RematchLobbyView {
  const postGame = input.postGame;
  const pending = Boolean(postGame?.rematchRequested);
  const noteToPoll = pending ? (postGame?.rematchNote1 ?? '') : input.roomNote1;
  const amount = postGame?.rematchRequiredAmount ?? 0;
  const eventId = postGame?.rematchEventId ?? '';
  const waitingSessionId = postGame?.rematchWaitingForSessionID ?? '';
  const paymentReady = amount > 0 && Boolean(eventId);
  const loserMustPay = Boolean(
    pending && waitingSessionId && waitingSessionId === input.sessionId
  );

  return {
    pending,
    noteToPoll,
    amount,
    eventId,
    paymentReady,
    loserMustPay,
    waitingSessionId,
  };
}
