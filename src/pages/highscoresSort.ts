export function sortLedgerByPrize<T extends { prize: number }>(
  entries: readonly T[]
): T[] {
  return [...entries].sort((a, b) => Number(b.prize) - Number(a.prize));
}
