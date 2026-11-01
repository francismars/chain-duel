/**
 * Corner Home leaves at once unless this page cancels it.
 * A paid result stays guarded until the prize is claimed (menu 3).
 * Practice, and the screen after the claim, keep the current leave.
 */
export function postGameBlocksCornerHome(args: {
  practiceMode: boolean;
  menu: 1 | 2 | 3;
  loading: boolean;
}): boolean {
  if (args.loading || args.practiceMode || args.menu === 3) return false;
  return true;
}
