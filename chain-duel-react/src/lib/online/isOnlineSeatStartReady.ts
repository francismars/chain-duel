export type OnlineSeatStartSignal = {
  status?: 'open' | 'paid';
  ready?: boolean;
  startConfirmed?: boolean;
  disconnectedAt?: number;
};

/** Lobby `ready` vs arena `startConfirmed` (Space/Enter on canvas). */
export function isOnlineSeatStartReady(
  seat: OnlineSeatStartSignal | null | undefined,
  phase?: string
): boolean {
  if (!seat || seat.status === 'open') {
    return false;
  }
  if (phase === 'playing') {
    return seat.startConfirmed === true;
  }
  return seat.ready === true;
}

export function onlineSeatStartMeta(
  seat: OnlineSeatStartSignal | null | undefined,
  phase?: string
): string {
  if (!seat || seat.status === 'open') {
    return 'Waiting payment';
  }
  if (isOnlineSeatStartReady(seat, phase)) {
    return phase === 'playing' ? 'Paid · Ready to start' : 'Paid · Ready';
  }
  if (seat.disconnectedAt) {
    return 'Paid · Offline';
  }
  return phase === 'playing' ? 'Paid · Press Space or Enter' : 'Paid · Not ready';
}
