import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NOSTR_CONNECT_RELAYS,
  normalizeSignerRelays,
  parseSwitchRelaysResult,
  relaysForNip46Rpc,
  relaysForNostrConnectQr,
} from './nip46Relays';

describe('relaysForNip46Rpc', () => {
  it('uses Amber-style signer relays without forcing Primal-only', () => {
    const amber = ['wss://relay.damus.io', 'wss://nos.lol'];
    expect(relaysForNip46Rpc(amber)).toEqual(amber);
  });

  it('uses Primal signer relays when the bunker returns them', () => {
    const primal = ['wss://relay.primal.net', 'wss://premium.primal.net'];
    expect(relaysForNip46Rpc(primal)).toEqual(primal);
  });

  it('adds fallbacks when the bunker returns a single relay', () => {
    const out = relaysForNip46Rpc(['wss://relay.nsec.app']);
    expect(out[0]).toBe('wss://relay.nsec.app');
    expect(out.length).toBe(3);
    expect(out).not.toEqual(['wss://relay.nsec.app']);
  });

  it('drops blocked hosts from signer list', () => {
    expect(
      relaysForNip46Rpc([
        'wss://relay.damus.io',
        'wss://relay.nsecbunker.com',
        'wss://nos.lol',
      ])
    ).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
  });
});

describe('normalizeSignerRelays', () => {
  it('preserves signer order and does not merge QR defaults', () => {
    const signer = ['wss://relay.nsec.app', 'wss://relay.damus.io'];
    expect(normalizeSignerRelays(signer)).toEqual(signer);
    expect(normalizeSignerRelays(signer)).not.toContain('wss://relay.primal.net');
  });

  it('falls back to QR defaults when signer list is empty', () => {
    expect(normalizeSignerRelays([])).toEqual(
      DEFAULT_NOSTR_CONNECT_RELAYS.slice(0, 4)
    );
  });
});

describe('relaysForNostrConnectQr', () => {
  it('merges hints with defaults up to 6', () => {
    const out = relaysForNostrConnectQr(['wss://custom.example']);
    expect(out[0]).toBe('wss://custom.example');
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out).toContain('wss://relay.damus.io');
  });
});

describe('parseSwitchRelaysResult', () => {
  it('parses JSON relay array', () => {
    expect(
      parseSwitchRelaysResult(
        JSON.stringify(['wss://relay.damus.io', 'wss://nos.lol'])
      )
    ).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
  });

  it('returns null for null result', () => {
    expect(parseSwitchRelaysResult('null')).toBeNull();
  });
});
