import { describe, expect, it } from 'vitest';
import { ResOnlineSeatLightningSchema } from './schemas';

const bolt11 = 'lnbc10n1pjexample';

describe('ResOnlineSeatLightningSchema', () => {
  it('accepts a host bolt11 invoice', () => {
    const parsed = ResOnlineSeatLightningSchema.parse({
      roomId: 'room-1',
      pr: bolt11,
      lightningUri: `lightning:${bolt11}`,
      buyin: 1000,
      expiresAt: 1_700_000_000_000,
    });
    expect(parsed.pr).toBe(bolt11);
    expect(parsed.roomId).toBe('room-1');
    expect(parsed.lightningUri).toBe(`lightning:${bolt11}`);
  });

  it('accepts the previous LNbits lnurl reply', () => {
    const parsed = ResOnlineSeatLightningSchema.parse({
      lnurl: 'lnurl1dp68gurn8ghj7',
      lightningUri: 'lightning:lnurl1dp68gurn8ghj7',
      buyin: 1000,
      expiresAt: 1_700_000_000_000,
    });
    expect(parsed.lnurl).toBe('lnurl1dp68gurn8ghj7');
    expect(parsed.pr).toBeUndefined();
  });

  it('rejects a reply with no invoice', () => {
    const parsed = ResOnlineSeatLightningSchema.safeParse({
      lightningUri: 'lightning:lnbc10n1',
      buyin: 1000,
      expiresAt: 1_700_000_000_000,
    });
    expect(parsed.success).toBe(false);
  });
});
