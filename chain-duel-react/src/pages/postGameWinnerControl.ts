export type PostGameWinner = 'Player 1' | 'Player 2';
export type PostGameMenu = 1 | 2 | 3;

/**
 * Legacy cabinet lock (`public/javascripts/postGame.js`):
 * Pad 1 = Space / WASD, Pad 2 = Enter / arrows.
 * Only the winner's pad may claim, reveal/blur the QR, or confirm double-or-nothing.
 * Practice unlocks both pads. Ledger (menu 3) unlocks both. Left/right were never gated.
 */
export function postGameWinnerAllowsKey(
  winner: PostGameWinner,
  key: string,
  opts: { practiceMode: boolean; menu: PostGameMenu }
): boolean {
  if (opts.menu === 3 || opts.practiceMode) return true;
  if (isHorizontalMenuKey(key)) return true;
  if (winner === 'Player 1') return isPlayer1ControlKey(key);
  return isPlayer2ControlKey(key);
}

function isHorizontalMenuKey(key: string): boolean {
  return (
    key === 'a' ||
    key === 'A' ||
    key === 'd' ||
    key === 'D' ||
    key === 'ArrowLeft' ||
    key === 'ArrowRight'
  );
}

function isPlayer1ControlKey(key: string): boolean {
  return key === ' ' || key === 'w' || key === 'W' || key === 's' || key === 'S';
}

function isPlayer2ControlKey(key: string): boolean {
  return key === 'Enter' || key === 'ArrowUp' || key === 'ArrowDown';
}
