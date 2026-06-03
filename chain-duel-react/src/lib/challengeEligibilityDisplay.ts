import type { ChallengeEligibilityResponse } from '@/lib/challengeBounty';

export type EligibilityCheckKey = keyof ChallengeEligibilityResponse['checks'];

type CheckEntry = ChallengeEligibilityResponse['checks'][EligibilityCheckKey];

const CHECK_ORDER: EligibilityCheckKey[] = [
  'appSession',
  'nip05',
  'followingCount',
  'followsChainduel',
  'accountAge',
  'lud16',
];

const CHECK_LABELS: Record<EligibilityCheckKey, string> = {
  appSession: 'Signed in',
  nip05: 'Verified NIP-05',
  followingCount: '100+ follows',
  followsChainduel: 'Follow @chainduel',
  accountAge: '30+ day account',
  lud16: 'Zap-enabled Lightning',
};

const DETAIL_HINTS: Record<string, string> = {
  not_signed_in: 'Sign in with Nostr in Config',
  no_app_session: 'Reconnect your Nostr session in Config',
  nip05_missing: 'Add a verified NIP-05 to your profile',
  nip05_mismatch: 'NIP-05 identity does not match your pubkey',
  need_100_follows: 'Build your follow list on Nostr',
  not_following_chainduel: 'Follow @chainduel to unlock bounties',
  chainduel_pubkey_unconfigured: 'Server follow check not configured',
  need_30_days: 'Account must be at least 30 days old',
  no_relay_history: 'No relay history found for this pubkey',
  lud16_missing: 'Add a Lightning address (lud16) to your profile',
  lud16_invalid: 'Lightning address could not be verified',
  lnurl_no_zap: 'Address must support Nostr zaps (NIP-57)',
  lnurl_verify_failed: 'Could not verify Lightning address',
};

function formatDetailHint(detail: string | undefined): string | null {
  if (!detail) return null;
  if (DETAIL_HINTS[detail]) return DETAIL_HINTS[detail];
  if (detail.startsWith('need_') && detail.endsWith('_follows')) {
    return DETAIL_HINTS.need_100_follows;
  }
  if (detail.startsWith('need_') && detail.endsWith('_days')) {
    return DETAIL_HINTS.need_30_days;
  }
  return detail.replace(/_/g, ' ');
}

function formatCheckMeta(key: EligibilityCheckKey, check: CheckEntry): string | null {
  if (key === 'followingCount' && typeof check.count === 'number') {
    return `${check.count.toLocaleString()} / 100`;
  }
  if (key === 'accountAge' && typeof check.ageDays === 'number') {
    return `${check.ageDays} days`;
  }
  if (key === 'lud16' && check.address) {
    return check.address;
  }
  return null;
}

export type EligibilityCheckDisplay = {
  key: EligibilityCheckKey;
  label: string;
  pass: boolean;
  hint: string | null;
  meta: string | null;
};

export function formatEligibilityChecks(
  checks: ChallengeEligibilityResponse['checks']
): EligibilityCheckDisplay[] {
  return CHECK_ORDER.map((key) => {
    const check = checks[key];
    return {
      key,
      label: CHECK_LABELS[key],
      pass: check.pass,
      hint: check.pass ? null : formatDetailHint(check.detail),
      meta: formatCheckMeta(key, check),
    };
  });
}

export function countPassedChecks(checks: ChallengeEligibilityResponse['checks']): {
  passed: number;
  total: number;
} {
  const items = formatEligibilityChecks(checks);
  return {
    passed: items.filter((item) => item.pass).length,
    total: items.length,
  };
}
