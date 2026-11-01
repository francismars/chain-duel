import { describe, expect, it } from 'vitest';
import { sortLedgerByPrize } from './Highscores';

describe('sortLedgerByPrize', () => {
  it('places a larger prize ahead of smaller ones that appear earlier in the file', () => {
    const rows = [
      { prize: 247609, name: 'francis-rogzy' },
      { prize: 361000, name: 'francis-science' },
      { prize: 1900000, name: 'rogzy-atlantis' },
      { prize: 760000, name: 'rogzy-field' },
      { prize: 760000, name: 'pedro' },
    ];

    expect(sortLedgerByPrize(rows).map((row) => row.prize)).toEqual([
      1900000, 760000, 760000, 361000, 247609,
    ]);
  });

  it('keeps equal prizes in their original order', () => {
    const rows = [
      { prize: 760000, name: 'first' },
      { prize: 760000, name: 'second' },
    ];

    expect(sortLedgerByPrize(rows).map((row) => row.name)).toEqual([
      'first',
      'second',
    ]);
  });
});
