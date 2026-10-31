import { describe, expect, it } from 'vitest';
import {
  formatZapPayError,
  nextNostrLinkAutoStart,
  nextZapAutoPrepare,
  parseStoredNostrLink,
  prepareZapOnLinkConfirmed,
  resolveSeatZapExpiresAt,
  routeLobbyPayFailure,
  sessionReplacesNostrLink,
} from './lobbySeatPay';

const NOW = 1_700_000_000_000;

function storedLink(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    expiresAt: NOW + 60_000,
    pubkey: 'a'.repeat(64),
    name: 'Satoshi',
    picture: 'https://example.test/p.png',
    sessionID: 'sess-1',
    ...overrides,
  });
}

describe('formatZapPayError', () => {
  it('maps known reasons and replaces underscores otherwise', () => {
    expect(formatZapPayError('nostr_not_linked')).toBe(
      'Nostr room link expired or missing. Tap Link & pay again.'
    );
    expect(formatZapPayError('no_session')).toBe(
      'Lost connection to game server. Refresh the page and try again.'
    );
    expect(formatZapPayError('rematch_not_ready')).toBe(
      'Rematch note is still publishing. Wait a moment — payment will open automatically.'
    );
    expect(formatZapPayError('bolt11_expired')).toBe('bolt11 expired');
  });
});

describe('routeLobbyPayFailure', () => {
  it('shows a pin error on the nostr slot during nostr pay or a rematch', () => {
    expect(
      routeLobbyPayFailure({
        source: 'pin',
        reason: 'amount_too_low',
        paymentMode: 'anon',
        rematchPending: true,
      })
    ).toEqual({
      action: 'show',
      slot: 'nostr',
      message: formatZapPayError('amount_too_low'),
      clearStoredNostrLink: false,
    });
    expect(
      routeLobbyPayFailure({
        source: 'pin',
        reason: 'seats_full',
        paymentMode: 'pin-zap',
        rematchPending: false,
      }).slot
    ).toBe('generic');
  });

  it('ignores rematch_not_ready for lightning and zap before any other effect', () => {
    for (const source of ['lightning', 'zap'] as const) {
      expect(
        routeLobbyPayFailure({
          source,
          reason: 'rematch_not_ready',
          paymentMode: 'nostr',
          rematchPending: true,
        })
      ).toEqual({ action: 'ignore' });
    }
  });

  it('keeps lightning errors on the generic slot', () => {
    expect(
      routeLobbyPayFailure({
        source: 'lightning',
        reason: 'no_session',
        paymentMode: 'nostr',
        rematchPending: true,
      })
    ).toEqual({
      action: 'show',
      slot: 'generic',
      message: formatZapPayError('no_session'),
      clearStoredNostrLink: false,
    });
  });

  it('clears the stored link only for zap nostr_not_linked and no_session', () => {
    expect(
      routeLobbyPayFailure({
        source: 'zap',
        reason: 'nostr_not_linked',
        paymentMode: 'pin-zap',
        rematchPending: false,
      })
    ).toMatchObject({
      action: 'show',
      slot: 'generic',
      clearStoredNostrLink: true,
    });
    expect(
      routeLobbyPayFailure({
        source: 'zap',
        reason: 'no_session',
        paymentMode: 'nostr',
        rematchPending: false,
      })
    ).toMatchObject({ slot: 'nostr', clearStoredNostrLink: true });
    expect(
      routeLobbyPayFailure({
        source: 'zap',
        reason: 'seats_full',
        paymentMode: 'nostr',
        rematchPending: true,
      })
    ).toMatchObject({
      slot: 'nostr',
      clearStoredNostrLink: false,
    });
    expect(
      routeLobbyPayFailure({
        source: 'pin',
        reason: 'nostr_not_linked',
        paymentMode: 'nostr',
        rematchPending: false,
      }).clearStoredNostrLink
    ).toBe(false);
  });

  it('formats a signer error on the nostr slot and keeps the raw text on the generic slot', () => {
    const reason = 'user rejected the prompt';
    expect(
      routeLobbyPayFailure({
        source: 'sign',
        reason,
        paymentMode: 'nostr',
        rematchPending: false,
      })
    ).toEqual({
      action: 'show',
      slot: 'nostr',
      message: formatZapPayError(reason),
      clearStoredNostrLink: false,
    });
    expect(
      routeLobbyPayFailure({
        source: 'sign',
        reason: 'sign_failed_locally',
        paymentMode: 'anon',
        rematchPending: true,
      })
    ).toEqual({
      action: 'show',
      slot: 'generic',
      message: 'sign_failed_locally',
      clearStoredNostrLink: false,
    });
  });
});

describe('parseStoredNostrLink', () => {
  it('leaves missing storage alone and drops bad JSON', () => {
    expect(parseStoredNostrLink(null, NOW, 'sess-1')).toEqual({
      action: 'absent',
    });
    expect(parseStoredNostrLink('', NOW, 'sess-1')).toEqual({
      action: 'absent',
    });
    expect(parseStoredNostrLink('{', NOW, 'sess-1')).toEqual({
      action: 'drop',
    });
    expect(parseStoredNostrLink('null', NOW, 'sess-1')).toEqual({
      action: 'drop',
    });
  });

  it('drops a stored session only when both ids are set and differ', () => {
    expect(parseStoredNostrLink(storedLink(), NOW, 'sess-2')).toEqual({
      action: 'drop',
    });
    expect(parseStoredNostrLink(storedLink(), NOW, 'sess-1').action).toBe(
      'restore'
    );
    expect(parseStoredNostrLink(storedLink(), NOW, '').action).toBe('restore');
    expect(
      parseStoredNostrLink(storedLink({ sessionID: '' }), NOW, 'sess-2').action
    ).toBe('restore');
  });

  it('restores a live link and fills a missing name', () => {
    expect(parseStoredNostrLink(storedLink(), NOW, 'sess-1')).toEqual({
      action: 'restore',
      link: {
        expiresAt: NOW + 60_000,
        pubkey: 'a'.repeat(64),
        name: 'Satoshi',
        picture: 'https://example.test/p.png',
      },
    });
    const pubkey = 'b'.repeat(64);
    expect(
      parseStoredNostrLink(
        storedLink({ pubkey, name: 1, picture: null }),
        NOW,
        'sess-1'
      )
    ).toEqual({
      action: 'restore',
      link: {
        expiresAt: NOW + 60_000,
        pubkey,
        name: `${pubkey.slice(0, 12)}…`,
        picture: null,
      },
    });
  });

  it('drops an expired or incomplete link', () => {
    expect(
      parseStoredNostrLink(storedLink({ expiresAt: NOW }), NOW, 'sess-1')
    ).toEqual({ action: 'drop' });
    expect(
      parseStoredNostrLink(storedLink({ pubkey: 12 }), NOW, 'sess-1')
    ).toEqual({ action: 'drop' });
  });
});

describe('sessionReplacesNostrLink', () => {
  it('clears only when a previous id exists and differs', () => {
    expect(sessionReplacesNostrLink(null, 'next')).toBe(false);
    expect(sessionReplacesNostrLink('', 'next')).toBe(false);
    expect(sessionReplacesNostrLink('same', 'same')).toBe(false);
    expect(sessionReplacesNostrLink('prev', 'next')).toBe(true);
  });
});

describe('nextZapAutoPrepare', () => {
  const ready = {
    paymentMode: 'nostr' as const,
    nostrLinkActive: true,
    hasSeatZapInvoice: false,
    zapPayBusy: false,
    signedIn: true,
    rematchLoserPay: false,
    rematchReady: true,
  };

  it('resets when leaving nostr, when the link is inactive, or when rematch is not ready', () => {
    expect(nextZapAutoPrepare({ ...ready, paymentMode: 'anon' })).toBe('reset');
    expect(nextZapAutoPrepare({ ...ready, nostrLinkActive: false })).toBe(
      'reset'
    );
    expect(
      nextZapAutoPrepare({
        ...ready,
        rematchLoserPay: true,
        rematchReady: false,
      })
    ).toBe('reset');
  });

  it('holds for an invoice, a busy zap, or a signed-out session', () => {
    expect(nextZapAutoPrepare({ ...ready, hasSeatZapInvoice: true })).toBe(
      'hold'
    );
    expect(nextZapAutoPrepare({ ...ready, zapPayBusy: true })).toBe('hold');
    expect(nextZapAutoPrepare({ ...ready, signedIn: false })).toBe('hold');
  });

  it('prepares when the nostr link is ready, including a rematch that is already payable', () => {
    expect(nextZapAutoPrepare(ready)).toBe('prepare');
    expect(
      nextZapAutoPrepare({
        ...ready,
        rematchLoserPay: true,
        rematchReady: true,
      })
    ).toBe('prepare');
  });

  it('does not apply the rematch gate while an invoice or busy zap is holding', () => {
    expect(
      nextZapAutoPrepare({
        ...ready,
        hasSeatZapInvoice: true,
        rematchLoserPay: true,
        rematchReady: false,
      })
    ).toBe('hold');
  });
});

describe('nextNostrLinkAutoStart', () => {
  const ready = {
    paymentMode: 'nostr' as const,
    signedIn: true,
    nostrLinkActive: false,
    hasSeatZapInvoice: false,
    linkBusy: false,
    canEmit: true,
    payError: false,
    signerAvailable: true,
  };

  it('resets only when the mode leaves nostr or the session signs out', () => {
    expect(nextNostrLinkAutoStart({ ...ready, paymentMode: null })).toBe(
      'reset'
    );
    expect(nextNostrLinkAutoStart({ ...ready, signedIn: false })).toBe('reset');
    expect(
      nextNostrLinkAutoStart({
        ...ready,
        paymentMode: 'pin-zap',
        canEmit: false,
      })
    ).toBe('reset');
  });

  it('holds on the other blockers and starts when the path is clear', () => {
    expect(nextNostrLinkAutoStart({ ...ready, nostrLinkActive: true })).toBe(
      'hold'
    );
    expect(nextNostrLinkAutoStart({ ...ready, hasSeatZapInvoice: true })).toBe(
      'hold'
    );
    expect(nextNostrLinkAutoStart({ ...ready, linkBusy: true })).toBe('hold');
    expect(nextNostrLinkAutoStart({ ...ready, canEmit: false })).toBe('hold');
    expect(nextNostrLinkAutoStart({ ...ready, payError: true })).toBe('hold');
    expect(nextNostrLinkAutoStart({ ...ready, signerAvailable: false })).toBe(
      'hold'
    );
    expect(nextNostrLinkAutoStart(ready)).toBe('start');
  });
});

describe('prepareZapOnLinkConfirmed', () => {
  it('fires for nostr and ignores rematch readiness by taking only the mode', () => {
    expect(prepareZapOnLinkConfirmed('nostr')).toBe(true);
    expect(prepareZapOnLinkConfirmed('anon')).toBe(false);
    expect(prepareZapOnLinkConfirmed('pin-zap')).toBe(false);
    expect(prepareZapOnLinkConfirmed(null)).toBe(false);
  });
});

describe('resolveSeatZapExpiresAt', () => {
  it('falls back to one hour when neither invoice decodes', () => {
    expect(resolveSeatZapExpiresAt('not-a-bolt11', 'lightning:nope', NOW)).toBe(
      NOW + 60 * 60 * 1000
    );
  });
});
