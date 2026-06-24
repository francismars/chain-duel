import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { navigateToMainMenu } from '@/shared/constants/menuNavigation';
import type { PracticeChallengesPanelHandle } from '@/features/practice/practicePanelHandles';
import type { AiTier } from '@/game/engine/types';
import '@/components/ui/Button.css';
import { useNostrSession } from '@/contexts/NostrSessionContext';
import { savePracticeGameConfig } from '@/pages/practiceHubModes';
import type { PracticeHubFocus } from '@/pages/practiceHubPlayStyleNav';
import { useSocket } from '@/hooks/useSocket';
import { reportClientEvent } from '@/lib/telemetry/reportClientEvent';
import {
  fetchChallengeEligibility,
  requestChallengeRun,
  type ChallengeEligibilityResponse,
} from '@/lib/challengeBounty';
import { clearPendingChallengeClaim } from '@/lib/pendingChallengeClaim';
import { consumeChallengeMenuFocus, peekChallengeMenuFocus } from '@/lib/challengeMenuFocus';
import {
  countGateEligibilityChecks,
  formatGateEligibilityChecks,
  type EligibilityCheckDisplay,
  type EligibilityCheckKey,
} from '@/lib/challengeEligibilityDisplay';
import {
  ChallengeRowIcon,
  type ChallengeIconId,
} from '@/features/practice/ChallengeRowIcon';
import {
  CHALLENGE_CLIENT_NAMES,
  CHALLENGE_CLIENT_RANK,
  CHALLENGE_CLIENT_TAGLINES,
} from '@/lib/challenges/challengeCatalogClient';

interface Challenge {
  id: ChallengeIconId;
  rank: number;
  name: string;
  tagline: string;
  format: '1v1' | '4P FFA' | '2v1';
  aiTier: AiTier;
  powerup: boolean;
  bounty: number;
}

const CHALLENGE_GRID_COLS = 6;

const DEFAULT_CHALLENGES: Challenge[] = (
  Object.keys(CHALLENGE_CLIENT_NAMES) as ChallengeIconId[]
).map((id) => ({
  id,
  rank: CHALLENGE_CLIENT_RANK[id],
  name: CHALLENGE_CLIENT_NAMES[id],
  tagline: CHALLENGE_CLIENT_TAGLINES[id],
  format:
    id === 'ffa'
      ? '4P FFA'
      : id === 'sovereign-stack'
        ? '2v1'
        : '1v1',
  aiTier:
    id === 'normie'
      ? 'normie'
      : id === 'stacker'
        ? 'stacker'
        : id === 'noderunner' || id === 'ffa'
          ? 'noderunner'
          : 'sovereign',
  powerup: id === 'noderunner',
  bounty:
    id === 'normie'
      ? 21
      : id === 'stacker'
        ? 50
        : id === 'noderunner'
          ? 210
          : id === 'ffa'
            ? 600
            : id === 'gauntlet'
              ? 1337
              : 6900,
}));

const TIER_LABELS: Record<AiTier, string> = {
  normie: 'NORMIE',
  stacker: 'STACKER',
  noderunner: 'NODERUNNER',
  sovereign: 'SOVEREIGN',
};

const TIER_PIPS: Record<AiTier, number> = {
  normie: 1,
  stacker: 2,
  noderunner: 3,
  sovereign: 4,
};

const TOTAL_PIPS = 4;

function TierPips({ tier }: { tier: AiTier }) {
  const filled = TIER_PIPS[tier];
  return (
    <span className="sc-tier-pips" aria-hidden="true">
      {Array.from({ length: TOTAL_PIPS }, (_, i) => (
        <span
          key={i}
          className={`sc-tier-pip${i < filled ? ' sc-tier-pip--filled' : ''}`}
        />
      ))}
    </span>
  );
}

function formatBounty(sats: number): string {
  return sats.toLocaleString();
}

function splitChallengeTitle(name: string): [string, string] {
  const spaceIdx = name.indexOf(' ');
  if (spaceIdx === -1) return [name, ''];
  return [name.slice(0, spaceIdx), name.slice(spaceIdx + 1)];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function violatorJitter(seed: string) {
  const h = hashString(seed);
  const r1 = (h % 1000) / 1000;
  const r2 = ((h >>> 10) % 1000) / 1000;
  const r3 = ((h >>> 20) % 1000) / 1000;
  return {
    topVw: 1 + r1 * 2,
    leftVw: 1 + r2 * 2,
    rotateDeg: 21 + (r3 * 48 - 24),
  };
}

/** Per-challenge sticker tweaks — hash jitter can land awkwardly on some ids */
const VIOLATOR_ROTATE_NUDGE_BY_ID: Partial<Record<Challenge['id'], number>> = {
  normie: 14,
  stacker: -26,
};

const VIOLATOR_LEFT_NUDGE_BY_ID: Partial<Record<Challenge['id'], number>> = {
  'sovereign-stack': 1.1,
};

const VIOLATOR_JITTER_BY_ID = Object.fromEntries(
  DEFAULT_CHALLENGES.map((c) => {
    const jitter = violatorJitter(c.id);
    return [
      c.id,
      {
        ...jitter,
        leftVw: jitter.leftVw + (VIOLATOR_LEFT_NUDGE_BY_ID[c.id] ?? 0),
        rotateDeg: jitter.rotateDeg + (VIOLATOR_ROTATE_NUDGE_BY_ID[c.id] ?? 0),
      },
    ];
  })
);

type ServerCatalogEntry = {
  id: string;
  rank: number;
  name: string;
  format: '1v1' | '4P FFA' | '2v1';
  aiTier: AiTier;
  powerup: boolean;
  bountySats: number;
};

function mergeServerCatalog(entries: ServerCatalogEntry[]): Challenge[] {
  const byId = new Map(DEFAULT_CHALLENGES.map((c) => [c.id, c]));
  return entries
    .map((entry) => {
      const fallback = byId.get(entry.id as ChallengeIconId);
      if (!fallback) return null;
      const id = entry.id as ChallengeIconId;
      return {
        ...fallback,
        rank: entry.rank,
        name: CHALLENGE_CLIENT_NAMES[id] ?? fallback.name,
        tagline: CHALLENGE_CLIENT_TAGLINES[id] ?? fallback.tagline,
        format: entry.format,
        aiTier: entry.aiTier,
        powerup: entry.powerup,
        bounty: entry.bountySats,
      };
    })
    .filter((c): c is Challenge => c !== null)
    .sort((a, b) => a.rank - b.rank);
}

function getGateCopy(opts: { signedIn: boolean; payoutReady: boolean }): {
  eyebrow: string | null;
  title: string | null;
  lede: string;
} {
  if (opts.signedIn) {
    return {
      eyebrow: null,
      title: 'Validation checks',
      lede: opts.payoutReady
        ? 'Win, sign your note, get zapped to your Lightning address.'
        : '',
    };
  }
  return {
    eyebrow: 'Get zapped to win.',
    title: null,
    lede: 'Sign in to unlock sat bounties paid to your Lightning address.',
  };
}

const LN_ADDRESS_KEY = 'arcadeLnAddress';

const CHECK_DESCRIPTIONS: Record<
  Exclude<EligibilityCheckKey, 'appSession'>,
  string
> = {
  nip05:
    'A verified NIP-05 proves you own your Nostr handle. Bounty payouts require an identity tied to your pubkey.',
  followingCount:
    'Follow at least 100 accounts in the Chain Duel circle to show you are an active Nostr participant.',
  followsChainduel:
    'Follow @chainduel on Nostr so we can verify you are part of the community.',
  accountAge:
    'Your Nostr account must be at least 30 days old to reduce spam and sybil bounty claims.',
  lud16:
    'Add a Lightning address (LUD16) to your Nostr profile so bounty sats can zap you when you win.',
};

type GateCheckOverlayAction =
  | { type: 'button'; label: string; disabled?: boolean }
  | { type: 'ln-form' };

function getGateCheckOverlayAction(
  key: Exclude<EligibilityCheckKey, 'appSession'>,
  item: EligibilityCheckDisplay,
  checks: ChallengeEligibilityResponse['checks']
): GateCheckOverlayAction {
  if (item.pass) {
    return { type: 'button', label: 'Done' };
  }
  switch (key) {
    case 'nip05':
      return { type: 'button', label: 'Buy NIP-05' };
    case 'followingCount':
      return { type: 'button', label: 'Follow 100 Chain Duel friends' };
    case 'followsChainduel':
      return { type: 'button', label: 'Follow Chain Duel' };
    case 'accountAge': {
      const ageDays = checks.accountAge?.ageDays ?? 0;
      if (ageDays < 30) return { type: 'button', label: 'Buy NIP-05' };
      return { type: 'button', label: 'Check account age', disabled: true };
    }
    case 'lud16':
      return { type: 'ln-form' };
    default:
      return { type: 'button', label: 'Continue' };
  }
}

function GateCheckIcon({ pass }: { pass: boolean }) {
  if (pass) {
    return (
      <svg
        className="sc-gate__check-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return (
    <svg
      className="sc-gate__check-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function GateProgressBadge({
  passed,
  total,
}: {
  passed: number;
  total: number;
}) {
  const complete = total > 0 && passed >= total;

  return (
    <span
      className={[
        'sc-gate__progress',
        complete ? 'sc-gate__progress--complete' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {complete ? (
        <svg
          className="sc-gate__progress-check"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : null}
      <span className="sc-gate__progress-count">
        {passed}/{total}
      </span>
    </span>
  );
}

interface PracticeChallengesPanelProps {
  isActive: boolean;
  menuZone: PracticeHubFocus['zone'];
  footerBackRef: RefObject<HTMLButtonElement | null>;
  footerStartRef: RefObject<HTMLButtonElement | null>;
  onExitToPlayStyle?: () => void;
  onEnterFooter?: (which: 'back' | 'start') => void;
  onLaunchStateChange?: (
    launching: boolean,
    phase?: 'checking' | 'server' | 'entering'
  ) => void;
}

export const PracticeChallengesPanel = forwardRef<
  PracticeChallengesPanelHandle,
  PracticeChallengesPanelProps
>(function PracticeChallengesPanel(
  {
    isActive,
    menuZone,
    footerBackRef,
    footerStartRef,
    onExitToPlayStyle,
    onEnterFooter,
    onLaunchStateChange,
  },
  ref
) {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const nostrSession = useNostrSession();
  const { socket, connected } = useSocket();

  const [challenges, setChallenges] = useState<Challenge[]>(DEFAULT_CHALLENGES);

  useEffect(() => {
    if (!socket) return;
    const onCatalog = (data: { ok?: boolean; challenges?: unknown[] }) => {
      if (!data?.ok || !Array.isArray(data.challenges)) return;
      const parsed: ServerCatalogEntry[] = [];
      for (const item of data.challenges) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const id = String(row.id ?? '');
        const rank = Number(row.rank);
        const name = String(row.name ?? '');
        const format = row.format;
        const aiTier = row.aiTier;
        const powerup = row.powerup;
        const bountySats = Number(row.bountySats);
        if (
          !id ||
          !Number.isFinite(rank) ||
          (format !== '1v1' && format !== '4P FFA' && format !== '2v1') ||
          (aiTier !== 'normie' &&
            aiTier !== 'stacker' &&
            aiTier !== 'noderunner' &&
            aiTier !== 'sovereign') ||
          typeof powerup !== 'boolean' ||
          !Number.isFinite(bountySats)
        ) {
          continue;
        }
        parsed.push({
          id,
          rank,
          name,
          format,
          aiTier,
          powerup,
          bountySats,
        });
      }
      if (parsed.length > 0) setChallenges(mergeServerCatalog(parsed));
    };
    socket.on('resChallengeCatalog', onCatalog);
    socket.emit('getChallengeCatalog');
    return () => {
      socket.off('resChallengeCatalog', onCatalog);
    };
  }, [socket, connected]);

  const [eligibility, setEligibility] =
    useState<ChallengeEligibilityResponse | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchPending, setLaunchPending] = useState(false);

  useEffect(() => {
    if (eligibilityLoading || !eligibility || eligibility.eligible) return;
    reportClientEvent(socket, 'client.ui.error', {
      route: '/practice?play=challenges',
      detail: 'challenge_eligibility_failed',
    });
  }, [eligibility, eligibilityLoading, socket]);

  const [selected, setSelected] = useState(
    () => peekChallengeMenuFocus() ?? 0
  );
  const [hoveredChallenge, setHoveredChallenge] = useState<number | null>(null);
  const [nostrProfilePicBroken, setNostrProfilePicBroken] = useState(false);

  const [displayBounty, setDisplayBounty] = useState(DEFAULT_CHALLENGES[0].bounty);
  const [lockedBountyDisplays, setLockedBountyDisplays] = useState<number[]>(
    () => DEFAULT_CHALLENGES.map(() => 0)
  );
  const [gateActionFocused, setGateActionFocused] = useState(false);
  const [gateSetupFocus, setGateSetupFocus] = useState<'config' | 'refresh' | null>(
    null
  );
  const [listRevealed, setListRevealed] = useState(false);
  const [listRevealKey, setListRevealKey] = useState(0);
  const [activeCheckOverlay, setActiveCheckOverlay] = useState<Exclude<
    EligibilityCheckKey,
    'appSession'
  > | null>(null);
  const [lnAddressDraft, setLnAddressDraft] = useState('');
  const [checkFocusIdx, setCheckFocusIdx] = useState(0);
  const [overlayFocus, setOverlayFocus] = useState<'back' | 'input' | 'action'>(
    'back'
  );

  const panelKeyboardFocus =
    isActive && menuZone === 'panel' && !activeCheckOverlay;
  const overlayKeyboardFocus = isActive && Boolean(activeCheckOverlay);
  const gateBtnFocused = panelKeyboardFocus && gateActionFocused;

  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const checkRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const gateActionRef = useRef<HTMLButtonElement | null>(null);
  const gateRefreshRef = useRef<HTMLButtonElement | null>(null);
  const overlayBackRef = useRef<HTMLButtonElement | null>(null);
  const overlayActionRef = useRef<HTMLButtonElement | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);
  const lastCheckFocusIdxRef = useRef(0);
  const [checksRowFocused, setChecksRowFocused] = useState(false);
  const prevMenuZoneRef = useRef(menuZone);
  const prevSelectedRef = useRef(selected);
  const bountyRafRef = useRef<number | null>(null);
  const lockedBountyRafRefs = useRef<(number | null)[]>(
    DEFAULT_CHALLENGES.map(() => null)
  );
  const prevChallengesActiveRef = useRef(false);
  const hasPickedChallengeRef = useRef(false);
  const pendingMenuFocusRef = useRef<number | null>(null);
  const eligibilityRef = useRef(eligibility);
  eligibilityRef.current = eligibility;

  const npubDisplay = nostrSession.npub;
  const nostrNip05 = (nostrSession.nip05 ?? '').trim();
  const nostrLightning = (
    nostrSession.lud16 ??
    nostrSession.lud06 ??
    ''
  ).trim();
  const nostrProfileName = nostrSession.displayName ?? 'Nostr user';
  const nostrProfilePic = nostrSession.picture;
  const payoutReady = eligibility?.eligible === true;
  const showSignedInSetup = nostrSession.signedIn;
  const showSetupGate = showSignedInSetup && !payoutReady;
  const challengesLocked =
    !nostrSession.signedIn || eligibilityLoading || !payoutReady;
  const eligibilityChecks = useMemo(
    () =>
      eligibility && showSignedInSetup
        ? formatGateEligibilityChecks(eligibility.checks)
        : [],
    [eligibility, showSignedInSetup]
  );
  const eligibilityProgress =
    eligibility && showSignedInSetup
      ? countGateEligibilityChecks(eligibility.checks)
      : null;
  const gateCopy = getGateCopy({
    signedIn: nostrSession.signedIn,
    payoutReady,
  });
  const showSignInGate = !nostrSession.signedIn && !payoutReady;
  /** Gate has a focusable button (sign-in / config); absent when payout-ready (status text only). */
  const hasGateActionButton = showSignInGate || showSignedInSetup;
  const showBountyViolator = !nostrSession.signedIn || showSetupGate;
  const setupViolatorPrompt = useMemo((): [string, string] => {
    if (eligibilityLoading) return ['Checking', 'validation'];
    return ['Complete', 'validation'];
  }, [eligibilityLoading]);

  useEffect(() => {
    if (eligibilityChecks.length === 0) return;
    setCheckFocusIdx((prev) => Math.min(prev, eligibilityChecks.length - 1));
  }, [eligibilityChecks.length]);

  useEffect(() => {
    if (!panelKeyboardFocus || !checksRowFocused) return;
    checkRefs.current[checkFocusIdx]?.focus({ preventScroll: true });
  }, [checkFocusIdx, panelKeyboardFocus, checksRowFocused]);

  useEffect(() => {
    if (panelKeyboardFocus) {
      if (document.activeElement === gateActionRef.current) {
        setGateActionFocused(true);
        setGateSetupFocus('config');
      } else if (document.activeElement === gateRefreshRef.current) {
        setGateActionFocused(true);
        setGateSetupFocus('refresh');
      }
      return;
    }
    if (!isActive || menuZone !== 'panel') {
      setGateActionFocused(false);
      setGateSetupFocus(null);
      setChecksRowFocused(false);
    }
  }, [panelKeyboardFocus, isActive, menuZone]);

  useEffect(() => {
    if (!isActive) {
      setListRevealed(false);
      return;
    }
    setListRevealKey((key) => key + 1);
    setListRevealed(false);
    const timer = window.setTimeout(() => setListRevealed(true), 920);
    return () => window.clearTimeout(timer);
  }, [isActive]);

  const loadEligibility = useCallback(
    (options?: { refresh?: boolean; background?: boolean }) => {
      const refresh = options?.refresh === true;
      const background = options?.background === true;
      if (!socket || !connected || !nostrSession.signedIn) {
        setEligibility(null);
        return;
      }
      if (!background) {
        setEligibilityLoading(true);
      }
      void fetchChallengeEligibility(socket, { refresh })
        .then((res) => {
          setEligibility(res);
        })
        .catch(() => {
          if (!background) {
            setEligibility(null);
          }
        })
        .finally(() => {
          if (!background) {
            setEligibilityLoading(false);
          }
        });
    },
    [socket, connected, nostrSession.signedIn, nostrSession.pubkey]
  );

  useEffect(() => {
    loadEligibility();
  }, [loadEligibility]);

  useEffect(() => {
    if (!isActive || !nostrSession.signedIn) return;
    // Revisit after a match: keep showing cached checks; don't force-refresh Nostr gates.
    loadEligibility({ background: eligibilityRef.current != null });
  }, [isActive, loadEligibility, nostrSession.signedIn]);

  const openConfigForNostr = useCallback(() => {
    navigate('/config', { state: { returnTo: '/practice?play=challenges' } });
  }, [navigate]);

  useEffect(() => {
    setNostrProfilePicBroken(false);
  }, [nostrSession.pubkey, nostrSession.picture]);

  // Keep compatibility with payout surfaces that still read this legacy key.
  useEffect(() => {
    if (nostrLightning) {
      localStorage.setItem(LN_ADDRESS_KEY, nostrLightning);
    } else {
      localStorage.removeItem(LN_ADDRESS_KEY);
    }
  }, [nostrLightning]);

  useEffect(() => {
    setLnAddressDraft(nostrLightning);
  }, [nostrLightning, activeCheckOverlay]);

  const openCheckOverlay = useCallback(
    (key: Exclude<EligibilityCheckKey, 'appSession'>, fromIdx?: number) => {
      if (fromIdx != null) {
        lastCheckFocusIdxRef.current = fromIdx;
        setCheckFocusIdx(fromIdx);
      }
      playSfx(SFX.MENU_SELECT);
      setActiveCheckOverlay(key);
    },
    [playSfx]
  );

  const clearChecksFocus = useCallback(() => {
    setChecksRowFocused(false);
    checkRefs.current.forEach((el) => el?.blur());
  }, []);

  const focusCheckAt = useCallback((idx: number) => {
    setChecksRowFocused(true);
    setCheckFocusIdx(idx);
    lastCheckFocusIdxRef.current = idx;
    setGateActionFocused(false);
    setGateSetupFocus(null);
    checkRefs.current[idx]?.focus({ preventScroll: true });
  }, []);

  const focusGateAction = useCallback(() => {
    setChecksRowFocused(false);
    setGateActionFocused(true);
    setGateSetupFocus('config');
    gateActionRef.current?.focus({ preventScroll: true });
  }, []);

  const focusGateRefresh = useCallback(() => {
    setChecksRowFocused(false);
    setGateActionFocused(true);
    setGateSetupFocus('refresh');
    gateRefreshRef.current?.focus({ preventScroll: true });
  }, []);

  const handleCheckPointerDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      clearChecksFocus();
      setGateActionFocused(false);
      setGateSetupFocus(null);
    },
    [clearChecksFocus]
  );

  const closeCheckOverlay = useCallback(() => {
    playSfx(SFX.MENU_SELECT);
    setActiveCheckOverlay(null);
    window.requestAnimationFrame(() => {
      focusCheckAt(lastCheckFocusIdxRef.current);
    });
  }, [focusCheckAt, playSfx]);

  useEffect(() => {
    if (!isActive) setActiveCheckOverlay(null);
  }, [isActive]);

  const activeCheckItem = useMemo(() => {
    if (!activeCheckOverlay) return null;
    return (
      eligibilityChecks.find((item) => item.key === activeCheckOverlay) ?? null
    );
  }, [activeCheckOverlay, eligibilityChecks]);

  const activeCheckAction = useMemo(() => {
    if (!activeCheckOverlay || !activeCheckItem || !eligibility) return null;
    return getGateCheckOverlayAction(
      activeCheckOverlay,
      activeCheckItem,
      eligibility.checks
    );
  }, [activeCheckOverlay, activeCheckItem, eligibility]);

  const overlayFocusRef = useRef(overlayFocus);
  overlayFocusRef.current = overlayFocus;

  useEffect(() => {
    if (!activeCheckOverlay || !activeCheckAction) return;
    setOverlayFocus(activeCheckAction.type === 'ln-form' ? 'input' : 'action');
  }, [activeCheckOverlay, activeCheckAction]);

  useEffect(() => {
    if (!overlayKeyboardFocus) return;
    const frame = window.requestAnimationFrame(() => {
      switch (overlayFocus) {
        case 'back':
          overlayBackRef.current?.focus({ preventScroll: true });
          break;
        case 'action':
          overlayActionRef.current?.focus({ preventScroll: true });
          break;
        case 'input':
          overlayInputRef.current?.focus({ preventScroll: true });
          break;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [overlayFocus, overlayKeyboardFocus]);

  useEffect(() => {
    if (!overlayKeyboardFocus) return;

    const handleKey = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const onInput = activeEl === overlayInputRef.current;
      const hasLnForm = activeCheckAction?.type === 'ln-form';

      if (onInput) {
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          e.preventDefault();
          e.stopImmediatePropagation();
          setOverlayFocus('action');
        } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          e.preventDefault();
          e.stopImmediatePropagation();
          setOverlayFocus('back');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeCheckOverlay();
        }
        return;
      }

      const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
      const isUp = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
      const isLeft = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
      const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
      const isActivate = e.key === 'Enter' || e.key === ' ';

      if (
        !(
          isDown ||
          isUp ||
          isLeft ||
          isRight ||
          isActivate ||
          e.key === 'Escape'
        )
      ) {
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();

      if (e.key === 'Escape') {
        closeCheckOverlay();
        return;
      }

      if (isActivate) {
        if (e.repeat) return;
        playSfx(SFX.MENU_CONFIRM);
        if (overlayFocusRef.current === 'back') {
          closeCheckOverlay();
        } else if (overlayFocusRef.current === 'action') {
          overlayActionRef.current?.click();
        }
        return;
      }

      if (isLeft || isUp) {
        playSfx(SFX.MENU_SELECT);
        if (hasLnForm && isUp && overlayFocusRef.current !== 'input') {
          setOverlayFocus('input');
          return;
        }
        setOverlayFocus('back');
        return;
      }

      if (isRight || isDown) {
        playSfx(SFX.MENU_SELECT);
        if (hasLnForm && isDown && overlayFocusRef.current === 'back') {
          setOverlayFocus('input');
          return;
        }
        setOverlayFocus('action');
      }
    };

    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [activeCheckAction, closeCheckOverlay, overlayKeyboardFocus, playSfx]);

  const animateLockedRowBounty = useCallback((rowIndex: number) => {
    const target = challenges[rowIndex]?.bounty;
    if (target == null) return;

    const existing = lockedBountyRafRefs.current[rowIndex];
    if (existing !== null) cancelAnimationFrame(existing);

    const duration = 520;
    const startAt = performance.now();

    setLockedBountyDisplays((prev) => {
      const next = [...prev];
      next[rowIndex] = 0;
      return next;
    });

    const tick = (now: number) => {
      const t = Math.min((now - startAt) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const value = Math.round(eased * target);
      setLockedBountyDisplays((prev) => {
        const next = [...prev];
        next[rowIndex] = value;
        return next;
      });
      if (t < 1) {
        lockedBountyRafRefs.current[rowIndex] = requestAnimationFrame(tick);
      } else {
        lockedBountyRafRefs.current[rowIndex] = null;
      }
    };

    lockedBountyRafRefs.current[rowIndex] = requestAnimationFrame(tick);
  }, []);

  const cancelLockedBountyAnimations = useCallback(() => {
    lockedBountyRafRefs.current.forEach((id, i) => {
      if (id !== null) {
        cancelAnimationFrame(id);
        lockedBountyRafRefs.current[i] = null;
      }
    });
  }, []);

  useEffect(() => {
    if (bountyRafRef.current !== null)
      cancelAnimationFrame(bountyRafRef.current);
    if (!nostrSession.signedIn) return;

    const target = challenges[selected].bounty;
    const duration = 520;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplayBounty(Math.round(eased * target));
      if (t < 1) {
        bountyRafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayBounty(target);
        bountyRafRef.current = null;
      }
    };
    bountyRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (bountyRafRef.current !== null)
        cancelAnimationFrame(bountyRafRef.current);
    };
  }, [selected, nostrSession.signedIn]);

  useEffect(() => {
    const challengesActive = isActive && !nostrSession.signedIn;
    const panelJustEntered =
      challengesActive && !prevChallengesActiveRef.current;
    prevChallengesActiveRef.current = challengesActive;

    if (!challengesActive) {
      cancelLockedBountyAnimations();
      return;
    }

    if (panelJustEntered) {
      challenges.forEach((_, i) => animateLockedRowBounty(i));
    }

    return cancelLockedBountyAnimations;
  }, [
    isActive,
    nostrSession.signedIn,
    animateLockedRowBounty,
    cancelLockedBountyAnimations,
  ]);

  useEffect(() => {
    if (!isActive || nostrSession.signedIn) return;
    animateLockedRowBounty(selected);
  }, [selected, isActive, nostrSession.signedIn, animateLockedRowBounty]);

  const launchChallenge = useCallback(
    async (idx?: number, fromEligibilityResume = false) => {
      if (!fromEligibilityResume && (launching || launchPending)) return;
      const challenge = challenges[idx ?? selected];
      if (!challenge) return;

      const abortLaunch = () => {
        setLaunchPending(false);
        setLaunching(false);
        onLaunchStateChange?.(false);
      };

      const beginLaunch = (phase: 'checking' | 'server' | 'entering') => {
        setLaunchError(null);
        setLaunching(true);
        onLaunchStateChange?.(true, phase);
      };

      if (!socket) {
        onLaunchStateChange?.(false);
        setLaunchError('Not connected to server');
        return;
      }
      if (!nostrSession.signedIn || !nostrSession.pubkey) {
        onLaunchStateChange?.(false);
        setLaunchError('Sign in with Nostr to start a bounty challenge');
        playSfx(SFX.MENU_SELECT);
        return;
      }
      if (eligibilityLoading && !fromEligibilityResume) {
        setLaunchPending(true);
        beginLaunch('checking');
        playSfx(SFX.MENU_CONFIRM);
        return;
      }
      if (!payoutReady) {
        onLaunchStateChange?.(false);
        setLaunchError('Complete all requirements before starting a challenge');
        playSfx(SFX.MENU_SELECT);
        return;
      }
      setLaunchPending(false);
      clearPendingChallengeClaim();
      playSfx(SFX.MENU_CONFIRM);
      beginLaunch('server');

      try {
        const runResult = await requestChallengeRun(socket, challenge.id);
        if (!runResult.ok) {
          const runReasonMessages: Record<string, string> = {
            not_eligible: 'Complete all requirements before starting a challenge',
            nostr_sign_in_required: 'Sign in with Nostr to start a bounty challenge',
            rate_limited: 'Too many attempts — wait a moment and try again',
          };
          setLaunchError(
            runReasonMessages[runResult.reason] ?? runResult.reason
          );
          playSfx(SFX.MENU_SELECT);
          abortLaunch();
          return;
        }

        const isFfa = challenge.format === '4P FFA';
        const is2v1 = challenge.format === '2v1';
        const parts: string[] = ['PRACTICE', isFfa ? 'FFA' : is2v1 ? '2v1' : '1v1'];
        if (challenge.powerup) parts.push('PWR');

        const config: Record<string, unknown> = {
          mode: 'PRACTICE',
          practiceChallenge: true,
          challengeId: challenge.id,
          challengeRank: challenge.rank,
          challengeRunId: runResult.runId,
          challengeRunSeed: runResult.seed,
          soloChallengeName:
            CHALLENGE_CLIENT_NAMES[challenge.id as ChallengeIconId] ??
            challenge.name,
          soloBounty: runResult.bountySats,
          practiceHudLabel: parts.join(' · '),
          teamMode: isFfa ? 'ffa' : is2v1 ? '2v1' : 'solo',
          practiceMode: true,
          p1Human: true,
          p2Human: false,
          p3Human: false,
          p4Human: false,
          p1Name: nostrSession.displayName?.trim() || 'Player 1',
          ...(nostrSession.pubkey ? { p1NostrPubkey: nostrSession.pubkey } : {}),
          ...(nostrProfilePic?.trim()
            ? { p1Picture: nostrProfilePic.trim() }
            : {}),
          p2Name: 'BigToshi 🌊',
          aiTier: challenge.aiTier,
          convergenceMode: false,
          powerupMode: challenge.powerup,
        };
        if (isFfa || is2v1) config.ffaAiTier = challenge.aiTier;

        onLaunchStateChange?.(true, 'entering');
        savePracticeGameConfig(config);
        navigate('/game');
      } catch {
        setLaunchError('Could not start challenge — check connection and try again');
        playSfx(SFX.MENU_SELECT);
        abortLaunch();
      }
    },
    [
      selected,
      challenges,
      playSfx,
      navigate,
      socket,
      nostrProfilePic,
      nostrSession.pubkey,
      nostrSession.displayName,
      nostrSession.signedIn,
      payoutReady,
      eligibilityLoading,
      launching,
      launchPending,
      onLaunchStateChange,
    ]
  );

  useEffect(() => {
    if (!launchPending || eligibilityLoading) return;
    if (!payoutReady) {
      setLaunchPending(false);
      setLaunching(false);
      onLaunchStateChange?.(false);
      setLaunchError('Complete all requirements before starting a challenge');
      playSfx(SFX.MENU_SELECT);
      return;
    }
    void launchChallenge(undefined, true);
  }, [
    launchPending,
    eligibilityLoading,
    payoutReady,
    launchChallenge,
    onLaunchStateChange,
    playSfx,
  ]);

  const hasReturningChallengeFocus = useCallback(
    () =>
      pendingMenuFocusRef.current !== null ||
      peekChallengeMenuFocus() !== null,
    []
  );

  const restoreReturningChallengeSelection = useCallback(() => {
    let idx = pendingMenuFocusRef.current;
    if (idx === null) {
      idx = peekChallengeMenuFocus();
      if (idx !== null) {
        pendingMenuFocusRef.current = idx;
      }
    }
    if (idx === null) return null;
    hasPickedChallengeRef.current = true;
    setSelected(idx);
    return idx;
  }, []);

  const focusReturningChallengeStart = useCallback(() => {
    if (restoreReturningChallengeSelection() === null) return;
    if (challengesLocked) return;

    pendingMenuFocusRef.current = null;
    consumeChallengeMenuFocus();
    onEnterFooter?.('start');
    footerStartRef.current?.focus({ preventScroll: true });
  }, [
    challengesLocked,
    footerStartRef,
    onEnterFooter,
    restoreReturningChallengeSelection,
  ]);

  const focusChallengeFromGate = useCallback(() => {
    if (challengesLocked) {
      if (hasReturningChallengeFocus()) return;
      focusGateAction();
      return;
    }
    const idx = hasPickedChallengeRef.current ? selected : 0;
    setSelected(idx);
    rowRefs.current[idx]?.focus({ preventScroll: true });
  }, [challengesLocked, focusGateAction, hasReturningChallengeFocus, selected]);

  useEffect(() => {
    const idx = peekChallengeMenuFocus();
    if (idx === null) return;
    pendingMenuFocusRef.current = idx;
    hasPickedChallengeRef.current = true;
    setSelected(idx);
  }, []);

  const focusDefault = useCallback(() => {
    if (hasReturningChallengeFocus()) {
      focusReturningChallengeStart();
      return;
    }
    if (hasGateActionButton) {
      focusGateAction();
    } else {
      focusChallengeFromGate();
    }
  }, [
    focusChallengeFromGate,
    focusGateAction,
    focusReturningChallengeStart,
    hasGateActionButton,
    hasReturningChallengeFocus,
  ]);

  const lastMenuZoneRef = useRef(menuZone);
  useEffect(() => {
    const prev = lastMenuZoneRef.current;
    lastMenuZoneRef.current = menuZone;
    if (!isActive || activeCheckOverlay) return;
    // Footer → panel is handled by PracticeHub.resumePanelFromFooter (focusBeforeFooter).
    if (prev !== 'panel' && menuZone === 'panel' && prev !== 'footer') {
      window.requestAnimationFrame(() => {
        focusDefault();
      });
    }
  }, [activeCheckOverlay, focusDefault, isActive, menuZone]);

  useEffect(() => {
    if (!isActive || menuZone !== 'panel' || activeCheckOverlay) return;
    if (!hasReturningChallengeFocus()) return;
    window.requestAnimationFrame(() => {
      focusDefault();
    });
  }, [
    activeCheckOverlay,
    focusDefault,
    hasReturningChallengeFocus,
    isActive,
    menuZone,
  ]);

  useEffect(() => {
    if (
      !isActive ||
      menuZone !== 'panel' ||
      activeCheckOverlay ||
      challengesLocked
    ) {
      return;
    }
    if (!hasReturningChallengeFocus()) return;
    window.requestAnimationFrame(() => {
      focusReturningChallengeStart();
    });
  }, [
    activeCheckOverlay,
    challengesLocked,
    focusReturningChallengeStart,
    hasReturningChallengeFocus,
    isActive,
    menuZone,
  ]);

  const focusBeforeFooter = useCallback(() => {
    if (challengesLocked) {
      focusGateAction();
      return;
    }
    const lastIdx = challenges.length - 1;
    const idx = hasPickedChallengeRef.current ? selected : lastIdx;
    setSelected(idx);
    rowRefs.current[idx]?.focus({ preventScroll: true });
  }, [challengesLocked, focusGateAction, selected]);

  useImperativeHandle(
    ref,
    () => ({
      launchSelected: () => {
        void launchChallenge();
      },
      focusDefault,
      focusBeforeFooter,
    }),
    [launchChallenge, focusDefault, focusBeforeFooter]
  );

  useEffect(() => {
    if (!isActive || menuZone !== 'panel' || activeCheckOverlay) return;

    const hasSetupChecks = showSignedInSetup && eligibilityChecks.length > 0;

    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const activeEl = document.activeElement as HTMLElement | null;
      const onBack = activeEl === footerBackRef.current;
      const onStart = activeEl === footerStartRef.current;
      const onGateConfig = activeEl === gateActionRef.current;
      const onGateRefresh = activeEl === gateRefreshRef.current;
      const onGateAction = onGateConfig || onGateRefresh;
      const focusedCheckIndex = checkRefs.current.findIndex(
        (r) => r === activeEl
      );
      const onCheck = focusedCheckIndex >= 0;
      const focusedRowIndex = rowRefs.current.findIndex((r) => r === activeEl);
      const onRow = focusedRowIndex >= 0;
      const focusOutsidePanel =
        activeEl != null &&
        panelRef.current != null &&
        !panelRef.current.contains(activeEl) &&
        activeEl !== footerBackRef.current &&
        activeEl !== footerStartRef.current;
      // Clicks on non-focusables leave focus on <body>; keep navigating from last selection.
      const orphanListNav =
        !onRow &&
        !onCheck &&
        !onGateAction &&
        !onBack &&
        !onStart &&
        !focusOutsidePanel &&
        document.body.contains(activeEl);
      const rowNavIndex = onRow
        ? focusedRowIndex
        : orphanListNav
          ? selected
          : -1;

      // Footer keys are owned by PracticeHub (gamepad lands here before hub zone updates).
      if (onBack || onStart) {
        return;
      }

      const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
      const isUp = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
      const isLeft = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
      const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';

      if (isDown) {
        e.preventDefault();
        if (focusOutsidePanel) {
          playSfx(SFX.MENU_SELECT);
          focusDefault();
          return;
        }
        if (onGateAction) {
          playSfx(SFX.MENU_SELECT);
          if (onGateConfig && showSignedInSetup) {
            focusGateRefresh();
            return;
          }
          if (hasSetupChecks && eligibilityChecks.length > 0) {
            focusCheckAt(Math.min(checkFocusIdx, eligibilityChecks.length - 1));
          } else if (!challengesLocked) {
            focusChallengeFromGate();
          }
          return;
        }
        if (onCheck) {
          e.preventDefault();
          playSfx(SFX.MENU_SELECT);
          clearChecksFocus();
          focusChallengeFromGate();
          return;
        }
        if (onStart) {
          playSfx(SFX.MENU_SELECT);
          onEnterFooter?.('back');
          footerBackRef.current?.focus({ preventScroll: true });
          return;
        }
        if (onBack) {
          playSfx(SFX.MENU_SELECT);
          onEnterFooter?.('start');
          footerStartRef.current?.focus({ preventScroll: true });
          return;
        }
        if (rowNavIndex < 0) return;
        if (challengesLocked) {
          playSfx(SFX.MENU_SELECT);
          focusGateAction();
          return;
        }
        setSelected((prev) => {
          const from = onRow ? focusedRowIndex : prev;
          const next = from + CHALLENGE_GRID_COLS;
          if (next < challenges.length) {
            playSfx(SFX.MENU_SELECT);
            hasPickedChallengeRef.current = true;
            return next;
          }
          playSfx(SFX.MENU_SELECT);
          onEnterFooter?.('start');
          footerStartRef.current?.focus({ preventScroll: true });
          return prev;
        });
        return;
      }

      if (isUp) {
        e.preventDefault();
        if (onGateAction) {
          playSfx(SFX.MENU_SELECT);
          if (onGateRefresh) {
            focusGateAction();
            return;
          }
          onExitToPlayStyle?.();
          return;
        }
        if (onCheck) {
          playSfx(SFX.MENU_SELECT);
          if (showSignedInSetup) {
            focusGateRefresh();
          } else {
            focusGateAction();
          }
          return;
        }
        if (onStart) {
          playSfx(SFX.MENU_SELECT);
          focusBeforeFooter();
          return;
        }
        if (onBack) {
          playSfx(SFX.MENU_SELECT);
          onEnterFooter?.('start');
          footerStartRef.current?.focus({ preventScroll: true });
          return;
        }
        if (rowNavIndex < 0) return;
        if (challengesLocked) {
          playSfx(SFX.MENU_SELECT);
          focusGateAction();
          return;
        }
        const from = onRow ? focusedRowIndex : selected;
        if (from < CHALLENGE_GRID_COLS) {
          playSfx(SFX.MENU_SELECT);
          if (hasSetupChecks) {
            focusCheckAt(
              Math.min(
                lastCheckFocusIdxRef.current,
                eligibilityChecks.length - 1
              )
            );
          } else if (hasGateActionButton) {
            focusGateAction();
          } else {
            onExitToPlayStyle?.();
          }
          return;
        }
        setSelected((prev) => {
          const idx = onRow ? focusedRowIndex : prev;
          const next = idx - CHALLENGE_GRID_COLS;
          if (next >= 0) {
            playSfx(SFX.MENU_SELECT);
            hasPickedChallengeRef.current = true;
          }
          return Math.max(next, 0);
        });
        return;
      }

      if (isLeft) {
        if (onGateAction && hasSetupChecks) {
          e.preventDefault();
          playSfx(SFX.MENU_SELECT);
          setChecksRowFocused(true);
          setCheckFocusIdx(0);
          lastCheckFocusIdxRef.current = 0;
          checkRefs.current[0]?.focus({ preventScroll: true });
          return;
        }
        if (onCheck) {
          e.preventDefault();
          playSfx(SFX.MENU_SELECT);
          setChecksRowFocused(true);
          if (focusedCheckIndex === 0) {
            setChecksRowFocused(false);
            focusGateAction();
            return;
          }
          const next = focusedCheckIndex - 1;
          setCheckFocusIdx(next);
          lastCheckFocusIdxRef.current = next;
          checkRefs.current[next]?.focus({ preventScroll: true });
          return;
        }
        if (rowNavIndex < 0) return;
        if (challengesLocked) {
          playSfx(SFX.MENU_SELECT);
          focusGateAction();
          return;
        }
        e.preventDefault();
        const from = onRow ? focusedRowIndex : selected;
        playSfx(SFX.MENU_SELECT);
        hasPickedChallengeRef.current = true;
        if (from % CHALLENGE_GRID_COLS === 0) {
          setSelected(challenges.length - 1);
        } else {
          setSelected(from - 1);
        }
        return;
      }

      if (isRight) {
        if (onGateAction && hasSetupChecks) {
          e.preventDefault();
          playSfx(SFX.MENU_SELECT);
          setChecksRowFocused(true);
          const lastIdx = eligibilityChecks.length - 1;
          setCheckFocusIdx(lastIdx);
          lastCheckFocusIdxRef.current = lastIdx;
          checkRefs.current[lastIdx]?.focus({ preventScroll: true });
          return;
        }
        if (onCheck) {
          e.preventDefault();
          playSfx(SFX.MENU_SELECT);
          const lastIdx = eligibilityChecks.length - 1;
          if (focusedCheckIndex >= lastIdx) {
            setChecksRowFocused(false);
            focusGateAction();
            return;
          }
          setChecksRowFocused(true);
          const next = focusedCheckIndex + 1;
          setCheckFocusIdx(next);
          lastCheckFocusIdxRef.current = next;
          checkRefs.current[next]?.focus({ preventScroll: true });
          return;
        }
        if (rowNavIndex < 0) return;
        if (challengesLocked) {
          playSfx(SFX.MENU_SELECT);
          focusGateAction();
          return;
        }
        e.preventDefault();
        const from = onRow ? focusedRowIndex : selected;
        const onRightCol =
          from % CHALLENGE_GRID_COLS === CHALLENGE_GRID_COLS - 1;
        playSfx(SFX.MENU_SELECT);
        hasPickedChallengeRef.current = true;
        if (onRightCol) {
          const next = from + 1;
          setSelected(next < challenges.length ? next : 0);
        } else {
          setSelected(from + 1);
        }
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (onGateConfig) {
          gateActionRef.current?.click();
          return;
        }
        if (onGateRefresh) {
          gateRefreshRef.current?.click();
          return;
        }
        if (onCheck) {
          if (e.repeat) return;
          playSfx(SFX.MENU_CONFIRM);
          checkRefs.current[focusedCheckIndex]?.click();
          return;
        }
        if (onBack) {
          playSfx(SFX.MENU_CONFIRM);
          navigateToMainMenu(navigate);
          return;
        }
        if (onStart) {
          if (!challengesLocked) launchChallenge();
          return;
        }
        if (challengesLocked) {
          focusGateAction();
          return;
        }
        launchChallenge();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [
    activeCheckOverlay,
    checkFocusIdx,
    clearChecksFocus,
    eligibilityChecks.length,
    focusBeforeFooter,
    focusDefault,
    focusChallengeFromGate,
    focusCheckAt,
    focusGateAction,
    focusGateRefresh,
    isActive,
    menuZone,
    onEnterFooter,
    onExitToPlayStyle,
    playSfx,
    navigate,
    launchChallenge,
    footerBackRef,
    footerStartRef,
    hasGateActionButton,
    showSignedInSetup,
    challengesLocked,
    selected,
  ]);

  useEffect(() => {
    if (!isActive || menuZone !== 'panel' || challengesLocked) {
      prevMenuZoneRef.current = menuZone;
      return;
    }

    const panelJustEntered = prevMenuZoneRef.current !== 'panel';
    const selectedChanged = prevSelectedRef.current !== selected;
    prevMenuZoneRef.current = menuZone;
    prevSelectedRef.current = selected;

    // Entering from HOW TO PLAY — focusDefault targets the sign-in gate.
    if (panelJustEntered || !selectedChanged) return;

    const el = rowRefs.current[selected];
    if (!el) return;
    el.focus({ preventScroll: true });

    const inner = innerRefs.current[selected];
    if (!inner) return;

    const timer = setTimeout(() => {
      inner.classList.remove('sc-row__inner--pop');
      void inner.offsetWidth;
      inner.classList.add('sc-row__inner--pop');
    }, 0);

    const onEnd = () => inner.classList.remove('sc-row__inner--pop');
    inner.addEventListener('animationend', onEnd, { once: true });
    return () => {
      clearTimeout(timer);
      inner.removeEventListener('animationend', onEnd);
      inner.classList.remove('sc-row__inner--pop');
    };
  }, [challengesLocked, isActive, menuZone, selected]);

  const checkOverlayPortal =
    typeof document !== 'undefined' &&
    activeCheckOverlay &&
    activeCheckItem &&
    activeCheckAction
      ? createPortal(
          <div
            className="sc-gate-check-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sc-gate-check-overlay-title"
          >
            <div
              className="sc-gate-check-overlay__backdrop"
              aria-hidden="true"
            />
            <div className="sc-gate-check-overlay__panel">
              <h4
                id="sc-gate-check-overlay-title"
                className="sc-gate-check-overlay__title"
              >
                {activeCheckItem.label}
              </h4>
              <p className="sc-gate-check-overlay__desc">
                {CHECK_DESCRIPTIONS[activeCheckOverlay]}
              </p>
              {activeCheckItem.meta ? (
                <p className="sc-gate-check-overlay__meta">
                  {activeCheckItem.meta}
                </p>
              ) : null}
              {activeCheckAction.type === 'ln-form' ? (
                <div className="sc-gate-check-overlay__ln-form">
                  <label
                    className="sc-gate-check-overlay__ln-label"
                    htmlFor="sc-gate-ln-address"
                  >
                    Lightning address (LUD16)
                  </label>
                  <input
                    ref={overlayInputRef}
                    id="sc-gate-ln-address"
                    className={[
                      'sc-gate-check-overlay__ln-input',
                      overlayFocus === 'input' ? 'practice-focus-target' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    placeholder="you@wallet.com"
                    value={lnAddressDraft}
                    onChange={(e) => setLnAddressDraft(e.target.value)}
                    onFocus={() => setOverlayFocus('input')}
                  />
                </div>
              ) : null}
              <div className="sc-gate-check-overlay__actions">
                <button
                  ref={overlayBackRef}
                  type="button"
                  className={[
                    'sc-gate-check-overlay__btn',
                    'sc-gate-check-overlay__btn--back',
                    overlayFocus === 'back' ? 'practice-focus-target' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  tabIndex={overlayFocus === 'back' ? 0 : -1}
                  onFocus={() => setOverlayFocus('back')}
                  onClick={closeCheckOverlay}
                >
                  Back
                </button>
                {activeCheckAction.type === 'ln-form' ? (
                  <button
                    ref={overlayActionRef}
                    type="button"
                    className={[
                      'sc-gate-check-overlay__btn',
                      'sc-gate-check-overlay__btn--action',
                      overlayFocus === 'action' ? 'practice-focus-target' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    tabIndex={overlayFocus === 'action' ? 0 : -1}
                    onFocus={() => setOverlayFocus('action')}
                    onClick={() => {
                      playSfx(SFX.MENU_CONFIRM);
                    }}
                  >
                    Save kind 0
                  </button>
                ) : (
                  <button
                    ref={overlayActionRef}
                    type="button"
                    className={[
                      'sc-gate-check-overlay__btn',
                      'sc-gate-check-overlay__btn--action',
                      overlayFocus === 'action' ? 'practice-focus-target' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    tabIndex={overlayFocus === 'action' ? 0 : -1}
                    onFocus={() => setOverlayFocus('action')}
                    disabled={activeCheckAction.disabled}
                    onClick={() => {
                      playSfx(SFX.MENU_CONFIRM);
                      if (activeCheckAction.label === 'Done')
                        closeCheckOverlay();
                    }}
                  >
                    {activeCheckAction.label}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div
      ref={panelRef}
      className="practice-challenges-panel solo-challenges-panel"
      role="group"
      aria-label="Challenges"
    >
      {checkOverlayPortal}
      <div className="solo-challenges-layout">
        <div className="solo-challenges-col solo-challenges-col--left">
          {/* ── Nostr / LN payout gate ── */}
          <div
            className={`sc-gate${payoutReady ? ' sc-gate--ready' : ''}${listRevealed ? ' sc-gate--revealed' : ''}`}
          >
            <div
              className={[
                'sc-gate__card',
                showSignInGate ? 'sc-gate__card--sign-in' : '',
                showSignedInSetup ? 'sc-gate__card--setup' : '',
                gateBtnFocused ? 'sc-gate__card--action-focused' : '',
                checksRowFocused && !gateBtnFocused
                  ? 'sc-gate__card--check-focused'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {showSignedInSetup ? (
                <>
                  <div className="sc-gate__setup-bar">
                    <div
                      className="sc-gate__setup-identity-cluster"
                      aria-label="Signed in Nostr profile"
                    >
                      <img
                        className="sc-gate__setup-avatar"
                        src={
                          !nostrProfilePicBroken && nostrProfilePic
                            ? nostrProfilePic
                            : '/images/social/Nostr.png'
                        }
                        alt=""
                        width={28}
                        height={28}
                        onError={() => setNostrProfilePicBroken(true)}
                      />
                      <span className="sc-gate__setup-meta">
                        <span className="sc-gate__setup-identity">
                          <span className="sc-gate__setup-name">
                            {nostrProfileName}
                          </span>
                          {nostrNip05 ? (
                            <span className="sc-gate__setup-nip05">
                              {nostrNip05}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className="sc-gate__setup-npub"
                          title={npubDisplay ?? undefined}
                        >
                          {npubDisplay
                            ? `${npubDisplay.slice(0, 12)}…${npubDisplay.slice(-8)}`
                            : '—'}
                        </span>
                      </span>
                    </div>
                    <div className="sc-gate__setup-heading">
                      {eligibilityProgress ? (
                        <GateProgressBadge
                          passed={eligibilityProgress.passed}
                          total={eligibilityProgress.total}
                        />
                      ) : null}
                      {gateCopy.title ? (
                        <h3 className="sc-gate__title">{gateCopy.title}</h3>
                      ) : null}
                    </div>
                    <div className="sc-gate__setup-actions">
                      <button
                        type="button"
                        className={[
                          'sc-gate__config-link sc-gate__config-link--setup',
                          gateSetupFocus === 'config' ? 'practice-focus-target' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        ref={gateActionRef}
                        tabIndex={panelKeyboardFocus ? 0 : -1}
                        onFocus={() => {
                          setChecksRowFocused(false);
                          setGateActionFocused(true);
                          setGateSetupFocus('config');
                        }}
                        onBlur={(e) => {
                          const next = e.relatedTarget as Node | null;
                          if (
                            next === gateActionRef.current ||
                            next === gateRefreshRef.current
                          ) {
                            return;
                          }
                          setGateActionFocused(false);
                          setGateSetupFocus(null);
                        }}
                        onClick={() => {
                          playSfx(SFX.MENU_CONFIRM);
                          openConfigForNostr();
                        }}
                      >
                        Config
                      </button>
                      <button
                        type="button"
                        className={[
                          'sc-gate__config-link sc-gate__config-link--setup',
                          gateSetupFocus === 'refresh' ? 'practice-focus-target' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        ref={gateRefreshRef}
                        tabIndex={panelKeyboardFocus ? 0 : -1}
                        disabled={eligibilityLoading}
                        onFocus={() => {
                          setChecksRowFocused(false);
                          setGateActionFocused(true);
                          setGateSetupFocus('refresh');
                        }}
                        onBlur={(e) => {
                          const next = e.relatedTarget as Node | null;
                          if (
                            next === gateActionRef.current ||
                            next === gateRefreshRef.current
                          ) {
                            return;
                          }
                          setGateActionFocused(false);
                          setGateSetupFocus(null);
                        }}
                        onClick={() => {
                          playSfx(SFX.MENU_SELECT);
                          loadEligibility({ refresh: true });
                        }}
                      >
                        Re-check
                      </button>
                    </div>
                  </div>

                  {eligibilityLoading ? (
                    <p className="sc-gate__status">Checking eligibility…</p>
                  ) : null}

                  {eligibility && eligibilityChecks.length > 0 ? (
                    <ul
                      className={[
                        'sc-gate__checks',
                        listRevealed ? 'sc-gate__checks--revealed' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label="Eligibility requirements"
                    >
                      {eligibilityChecks.map((item, i) => (
                        <li
                          key={item.key}
                          className={[
                            'sc-gate__check-item',
                            panelKeyboardFocus &&
                            checksRowFocused &&
                            checkFocusIdx === i
                              ? 'sc-gate__check-item--focused'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <button
                            ref={(el) => {
                              checkRefs.current[i] = el;
                            }}
                            type="button"
                            className={[
                              'sc-gate__check',
                              item.pass
                                ? 'sc-gate__check--pass'
                                : 'sc-gate__check--fail',
                              panelKeyboardFocus &&
                              checksRowFocused &&
                              checkFocusIdx === i
                                ? 'practice-focus-target sc-gate__check--focused'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            tabIndex={
                              panelKeyboardFocus &&
                              checksRowFocused &&
                              checkFocusIdx === i
                                ? 0
                                : -1
                            }
                            onFocus={() => {
                              setChecksRowFocused(true);
                              setCheckFocusIdx(i);
                              lastCheckFocusIdxRef.current = i;
                              setGateActionFocused(false);
                            }}
                            onMouseDown={handleCheckPointerDown}
                            onClick={() =>
                              openCheckOverlay(
                                item.key as Exclude<
                                  EligibilityCheckKey,
                                  'appSession'
                                >,
                                i
                              )
                            }
                            aria-label={`${item.label}${item.meta ? `, ${item.meta}` : ''}${item.pass ? ', passed' : ', not passed'}`}
                          >
                            <span
                              className="sc-gate__check-mark"
                              aria-hidden="true"
                            >
                              <GateCheckIcon pass={item.pass} />
                            </span>
                            <span className="sc-gate__check-body">
                              <span className="sc-gate__check-label">
                                {item.label}
                              </span>
                              {item.meta ? (
                                <span className="sc-gate__check-meta">
                                  {item.meta}
                                </span>
                              ) : null}
                              {!item.pass && item.hint ? (
                                <span className="sc-gate__check-hint">
                                  {item.hint}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {launchError ? (
                    <p className="sc-gate__error" role="alert">
                      {launchError}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  {eligibilityProgress && !payoutReady ? (
                    <div className="sc-gate__header">
                      <GateProgressBadge
                        passed={eligibilityProgress.passed}
                        total={eligibilityProgress.total}
                      />
                    </div>
                  ) : null}

                  <div className="sc-gate__split">
                    <div className="sc-gate__copy">
                      <div className="sc-gate__headline">
                        {gateCopy.eyebrow ? (
                          <span className="sc-gate__eyebrow">
                            {gateCopy.eyebrow}
                          </span>
                        ) : null}
                        {gateCopy.title ? (
                          <h3 className="sc-gate__title">{gateCopy.title}</h3>
                        ) : null}
                      </div>
                      {gateCopy.lede ? (
                        <p className="sc-gate__lede">{gateCopy.lede}</p>
                      ) : null}
                    </div>

                    <div className="sc-gate__action">
                      <div className="sc-gate__top">
                        {!showSignInGate && payoutReady ? (
                          <p
                            className={`sc-gate__status sc-gate__status--ready`}
                          >
                            Eligible — win, sign, get zapped
                          </p>
                        ) : (
                          <button
                            className={[
                              'sc-gate__nostr-btn',
                              gateBtnFocused ? 'practice-focus-target' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            ref={gateActionRef}
                            tabIndex={panelKeyboardFocus ? 0 : -1}
                            onFocus={() => {
                              setChecksRowFocused(false);
                              setGateActionFocused(true);
                            }}
                            onBlur={() => setGateActionFocused(false)}
                            onClick={() => {
                              playSfx(SFX.MENU_CONFIRM);
                              openConfigForNostr();
                            }}
                            type="button"
                            title="Opens Config to connect your Nostr extension"
                          >
                            <svg
                              className="sc-gate__icon"
                              viewBox="0 0 1343 1567"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M1341.73 359.738C1338.13 324.538 1326.53 292.738 1304.13 264.938C1284.33 240.338 1258.93 222.738 1234.93 202.938C1222.93 193.138 1191.13 166.538 1187.13 151.538C1182.33 133.338 1189.73 114.738 1206.33 108.738C1231.33 100.338 1273.13 100.538 1297.33 102.138C1317.93 103.738 1339.13 96.5377 1339.93 88.1377C1340.73 79.7377 1328.53 67.3377 1312.33 63.5377C1299.53 60.5377 1279.93 55.9377 1268.13 48.1377C1247.13 33.9377 1225.73 7.93768 1196.53 2.13768C1154.93 -6.06232 1125.93 9.53768 1112.33 45.3377C1090.73 96.5377 1104.73 162.138 1150.13 210.138C1170.53 231.738 1194.33 250.338 1217.13 269.738C1233.93 284.138 1248.73 299.938 1262.93 317.538C1300.93 364.938 1260.73 451.938 1251.13 461.938C1217.53 496.738 1188.33 503.138 1130.33 500.738C1073.33 498.338 925.525 421.938 847.325 419.538C653.725 413.538 519.325 502.938 473.925 526.138C405.925 560.938 309.125 563.138 306.125 564.138C262.325 567.538 171.525 570.938 126.525 586.538C63.1252 604.138 28.9252 633.138 5.7252 697.938C-1.4748 725.938 -2.87477 751.338 7.32523 766.738C29.5252 800.338 89.3252 828.338 116.525 843.738C130.525 851.738 158.125 841.738 163.525 837.938C193.925 817.338 220.725 801.138 256.725 795.938C264.325 794.738 315.125 785.738 340.725 804.538C359.325 818.138 375.325 826.338 396.325 835.938C434.725 853.338 519.325 875.338 520.925 875.738C532.325 878.738 546.925 884.538 546.925 894.738C546.925 909.138 412.525 1021.54 405.125 1024.34C371.325 1038.14 351.725 1060.34 345.525 1092.34C343.525 1102.74 338.925 1113.54 333.125 1122.14C311.325 1153.74 214.725 1290.94 189.125 1328.54C176.925 1346.14 164.325 1354.94 146.925 1357.74C121.925 1361.74 103.125 1362.34 92.5252 1380.14C85.9252 1391.54 90.1252 1413.74 94.5252 1428.14C99.5252 1444.54 85.9252 1464.94 84.9252 1467.34C72.9252 1490.74 67.9252 1513.14 69.7252 1535.74C70.3252 1544.94 70.9252 1566.34 86.1252 1566.94C101.325 1567.74 105.325 1557.94 107.125 1554.34C109.325 1549.94 117.725 1531.74 120.125 1527.34C129.925 1509.14 167.325 1469.94 171.525 1465.34C184.925 1450.54 384.925 1175.14 384.925 1175.14C395.925 1160.74 407.325 1145.94 425.925 1138.74C451.725 1128.74 468.925 1108.14 473.925 1080.94C475.125 1074.94 554.925 1013.74 588.925 987.938C601.325 978.538 676.525 948.338 677.725 948.738C677.725 949.338 608.925 1052.94 587.525 1107.94C584.125 1116.74 578.525 1146.74 584.725 1161.94C594.325 1185.34 614.925 1195.54 638.325 1188.54C645.525 1186.34 651.925 1182.74 658.125 1179.34C660.925 1177.74 663.725 1176.34 666.525 1174.94C669.325 1173.54 671.925 1172.14 674.725 1170.74C681.125 1167.34 687.325 1164.14 693.525 1162.14C716.525 1154.54 739.725 1147.34 762.925 1140.14L809.925 1125.54C842.725 1115.34 875.525 1105.14 908.325 1095.14C915.525 1092.94 922.525 1090.34 931.525 1090.54C936.525 1090.54 941.925 1092.54 943.725 1099.94C943.725 1100.34 947.525 1122.74 961.325 1131.74C968.325 1136.34 983.325 1139.94 994.525 1139.54C1004.33 1139.14 1016.73 1141.94 1023.13 1147.54L1031.33 1154.54C1037.33 1159.54 1044.73 1162.34 1049.73 1163.74C1054.93 1165.14 1064.53 1165.14 1070.13 1159.34C1076.13 1152.94 1073.93 1142.54 1073.13 1139.34C1071.93 1134.94 1069.53 1131.54 1067.73 1128.54L1062.73 1120.74C1057.93 1113.14 1053.33 1105.54 1048.33 1097.94C1034.53 1076.94 1020.93 1056.14 1006.93 1035.34C992.325 1013.74 969.725 1005.14 940.125 1009.74C928.725 1011.54 678.525 1089.14 676.725 1089.54C690.125 1064.94 770.325 954.138 792.725 940.138C809.325 930.338 816.325 920.938 846.525 915.738C905.525 905.738 1033.53 876.138 1065.33 853.138C1127.13 808.338 1132.13 706.538 1131.13 686.138C1129.93 665.738 1136.53 651.738 1154.33 642.338C1163.13 637.738 1258.33 585.138 1304.93 507.538C1332.93 462.138 1347.33 413.538 1341.73 359.738Z"
                                fill="currentColor"
                              />
                            </svg>
                            <span className="sc-gate__label">
                              Sign in with Nostr
                            </span>
                          </button>
                        )}
                      </div>

                      {launchError ? (
                        <p className="sc-gate__error" role="alert">
                          {launchError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="solo-challenges-col solo-challenges-col--right">
          {/* ── Challenge rows ── */}
          <div
            key={listRevealKey}
            className={[
              'sc-list',
              listRevealed ? 'sc-list--revealed' : '',
              challengesLocked ? 'sc-list--locked' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="listbox"
            aria-label="Solo challenges"
            aria-disabled={challengesLocked}
            onMouseLeave={() => setHoveredChallenge(null)}
          >
            {challenges.map((c, i) => {
              const isSelected = selected === i;
              const showSelectedStyle =
                isSelected &&
                (hoveredChallenge === null || hoveredChallenge === i);
              const [titleLine1, titleLine2] = splitChallengeTitle(c.name);
              return (
                <button
                  key={c.id}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className={[
                    'sc-row',
                    showSelectedStyle ? 'sc-row--selected' : '',
                    challengesLocked ? 'sc-row--locked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={challengesLocked}
                  disabled={challengesLocked}
                  tabIndex={
                    challengesLocked
                      ? -1
                      : panelKeyboardFocus && isSelected
                        ? 0
                        : -1
                  }
                  onMouseEnter={() => {
                    if (!challengesLocked) setHoveredChallenge(i);
                  }}
                  onClick={() => {
                    if (challengesLocked) return;
                    hasPickedChallengeRef.current = true;
                    setSelected(i);
                    launchChallenge(i);
                  }}
                  type="button"
                  data-tier={c.aiTier}
                  data-rank={c.rank}
                  data-challenge={c.id}
                >
                  <div
                    ref={(el) => {
                      innerRefs.current[i] = el;
                    }}
                    className="sc-row__inner"
                  >
                    <div className="sc-row__info">
                      <div className="sc-row__title">
                        <div className="sc-row__title-icon" aria-hidden="true">
                          <ChallengeRowIcon id={c.id} />
                        </div>
                        <div className="sc-row__title-text">
                          <span className="sc-row__name">
                            <span className="sc-row__name-line">
                              {titleLine1}
                            </span>
                            <span className="sc-row__name-line">
                              {titleLine2 || '\u00a0'}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="sc-row__tags">
                        <span
                          className="sc-tag sc-tag--tier"
                          data-tier={c.aiTier}
                        >
                          {TIER_LABELS[c.aiTier]}
                          <TierPips tier={c.aiTier} />
                        </span>
                        <span className="sc-tag">{c.format}</span>
                        {c.powerup && (
                          <span className="sc-tag sc-tag--mod">+POWER-UPS</span>
                        )}
                      </div>
                    </div>

                    <div
                      className={[
                        'sc-row__bounty',
                        !nostrSession.signedIn ? 'sc-row__bounty--locked' : '',
                        showBountyViolator ? 'sc-row__bounty--violator' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="sc-row__sats-line">
                        {!nostrSession.signedIn ? (
                          <svg
                            className="sc-row__lock"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M7 10V8a5 5 0 0 1 10 0v2"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                            />
                            <rect
                              x="5"
                              y="10"
                              width="14"
                              height="10"
                              rx="2"
                              stroke="currentColor"
                              strokeWidth="1.6"
                            />
                            <circle
                              cx="12"
                              cy="15"
                              r="1.2"
                              fill="currentColor"
                            />
                          </svg>
                        ) : null}
                        <span className="sc-row__sats">
                          {formatBounty(
                            nostrSession.signedIn
                              ? i === selected
                                ? displayBounty
                                : c.bounty
                              : lockedBountyDisplays[i]
                          )}
                        </span>
                      </span>
                      <span
                        className="sc-row__unit"
                        style={
                          showBountyViolator
                            ? ({
                                '--sc-unit-jitter-top': `${VIOLATOR_JITTER_BY_ID[c.id].topVw}vw`,
                                '--sc-unit-jitter-left': `${VIOLATOR_JITTER_BY_ID[c.id].leftVw}vw`,
                                '--sc-unit-rotate': `${VIOLATOR_JITTER_BY_ID[c.id].rotateDeg}deg`,
                              } as React.CSSProperties)
                            : undefined
                        }
                      >
                        {!showBountyViolator ? (
                          'SATS'
                        ) : !nostrSession.signedIn ? (
                          <>
                            <span className="sc-row__unit-line">Sign in</span>
                            <span className="sc-row__unit-line">to claim</span>
                          </>
                        ) : (
                          <>
                            <span className="sc-row__unit-line">
                              {setupViolatorPrompt[0]}
                            </span>
                            <span className="sc-row__unit-line">
                              {setupViolatorPrompt[1]}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
