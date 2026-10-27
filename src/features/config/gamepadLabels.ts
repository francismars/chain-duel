/** Standard W3C gamepad button indices → readable labels. */
export const GAMEPAD_BUTTON_LABELS: readonly string[] = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Select',
  'Start',
  'L3',
  'R3',
  'D-Up',
  'D-Down',
  'D-Left',
  'D-Right',
  'Guide',
];

/** What Chain Duel maps each control to for player 1 (pad index 0). */
export const CHAIN_DUEL_P1_HINTS: Partial<Record<number, string>> = {
  0: 'Space (confirm)',
  1: 'Space (confirm)',
  2: 'Space (confirm)',
  3: 'Space (confirm)',
  4: 'LNURL QR (solo pad)',
  5: 'LNURL QR P2 (solo pad)',
  6: 'Pause',
  7: 'Pause',
  12: 'W (up)',
  13: 'S (down)',
  14: 'A (left)',
  15: 'D (right)',
};

export const CHAIN_DUEL_P2_HINTS: Partial<Record<number, string>> = {
  0: 'Enter (confirm)',
  1: 'Enter (confirm)',
  2: 'Enter (confirm)',
  3: 'Enter (confirm)',
  4: 'LNURL QR (dual pad)',
  6: 'Pause',
  7: 'Pause',
  12: '↑',
  13: '↓',
  14: '←',
  15: '→',
};

export function chainDuelStickHint(player: 1 | 2): string {
  return player === 1 ? 'WASD' : 'Arrow keys';
}

export function formatAxisValue(value: number): string {
  return value.toFixed(2);
}

export function buttonIsActive(value: number, pressed: boolean): boolean {
  return pressed || value > 0.12;
}
