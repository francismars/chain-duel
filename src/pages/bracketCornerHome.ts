export type BracketPhase = 'payment' | 'next-game' | 'finished';

/** Which confirm Home should open. Buy-in keeps the refund dialog. */
export type BracketHomeConfirm = 'buy-in' | 'in-progress' | 'unclaimed-prize';

/**
 * The pot is still on this screen until the champion prize is claimed.
 * A finished bracket may leave only after that claim. Previews are labs.
 */
export function bracketBlocksCornerHome(args: {
  preview: boolean;
  phase: BracketPhase;
  prizeClaimed: boolean;
}): boolean {
  if (args.preview) return false;
  if (args.phase === 'finished') return !args.prizeClaimed;
  return true;
}

export function bracketHomeConfirm(args: {
  phase: BracketPhase;
  preStartReady: boolean;
}): BracketHomeConfirm {
  if (args.phase === 'finished') return 'unclaimed-prize';
  if (args.preStartReady || args.phase === 'next-game') return 'in-progress';
  return 'buy-in';
}
