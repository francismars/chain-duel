import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import type { AiTier } from '@/game/engine/types';
import {
  CONVERGENCE_MIN_COLS,
  CONVERGENCE_MIN_ROWS,
  LOCAL_HUB_CONVERGENCE_SHRINK_INTERVAL_TICKS,
} from '@/game/engine/constants';
import '@/components/ui/Button.css';
import './practiceHub.css';
import '@/styles/pages/p2p-entry.css';
import '@/styles/pages/onlinePostGame.css';
import '@/styles/pages/solo-challenges.css';
import { npubEncode } from 'nostr-tools/nip19';
import {
  STORED_NOSTR_PUBKEY_KEY,
} from '@/lib/nostr/signerSession';
import { fetchLatestKind0Profile } from '@/lib/nostr/fetchKind0Profile';

const CONVERGENCE_PRESET = {
  shrinkIntervalTicks: LOCAL_HUB_CONVERGENCE_SHRINK_INTERVAL_TICKS,
  stepMs: 100,
  minCols: CONVERGENCE_MIN_COLS,
  minRows: CONVERGENCE_MIN_ROWS,
} as const;

interface Challenge {
  id: string;
  rank: number;
  name: string;
  tagline: string;
  format: '1v1' | '4P FFA';
  aiTier: AiTier;
  powerup: boolean;
  bounty: number;
}

const CHALLENGES: Challenge[] = [
  {
    id: 'drifter',
    rank: 1,
    name: 'DRIFTER DUEL',
    tagline: 'First steps on the chain',
    format: '1v1',
    aiTier: 'wanderer',
    powerup: false,
    bounty: 21,
  },
  {
    id: 'hunter',
    rank: 2,
    name: "HUNTER'S TRIAL",
    tagline: 'The bot starts fighting back',
    format: '1v1',
    aiTier: 'hunter',
    powerup: false,
    bounty: 210,
  },
  {
    id: 'power-play',
    rank: 3,
    name: 'POWER PLAY',
    tagline: 'Items change everything',
    format: '1v1',
    aiTier: 'hunter',
    powerup: true,
    bounty: 1000,
  },
  {
    id: 'gauntlet',
    rank: 4,
    name: 'GAUNTLET',
    tagline: 'Tactician reads three moves ahead',
    format: '1v1',
    aiTier: 'tactician',
    powerup: false,
    bounty: 5000,
  },
  {
    id: 'ffa-arena',
    rank: 5,
    name: 'FFA ARENA',
    tagline: 'Three bots, one survivor',
    format: '4P FFA',
    aiTier: 'tactician',
    powerup: false,
    bounty: 10000,
  },
  {
    id: 'sovereign',
    rank: 6,
    name: 'SOVEREIGN TRIAL',
    tagline: 'The hardest game on the chain',
    format: '1v1',
    aiTier: 'sovereign',
    powerup: true,
    bounty: 21000,
  },
];

const TIER_LABELS: Record<AiTier, string> = {
  wanderer: 'WANDERER',
  hunter: 'HUNTER',
  tactician: 'TACTICIAN',
  sovereign: 'SOVEREIGN',
};

const TIER_PIPS: Record<AiTier, number> = {
  wanderer: 1,
  hunter: 2,
  tactician: 3,
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

const LN_ADDRESS_KEY = 'arcadeLnAddress';

export default function SoloChallenges() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  useGamepad(true);

  const [selected, setSelected] = useState(0);
  const [npub, setNpub] = useState<string | null>(null);
  const [npubDisplay, setNpubDisplay] = useState<string | null>(null);
  const [lockedPreviewRow, setLockedPreviewRow] = useState<number | null>(null);
  const [lockedPreviewValue, setLockedPreviewValue] = useState<number | null>(null);
  const [nostrLightning, setNostrLightning] = useState('');
  const [nostrProfileName, setNostrProfileName] = useState<string>('Nostr user');
  const [nostrProfilePic, setNostrProfilePic] = useState<string | null>(null);
  const [nostrProfilePicBroken, setNostrProfilePicBroken] = useState(false);

  const [displayBounty, setDisplayBounty] = useState(CHALLENGES[0].bounty);

  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const gateActionRef = useRef<HTMLButtonElement | null>(null);
  const didMountRef = useRef(false);
  const bountyRafRef = useRef<number | null>(null);
  const lockedPreviewRafRef = useRef<number | null>(null);

  const payoutReady = !!npub && nostrLightning.trim().length > 0;

  useEffect(() => {
    const storedPubkey = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY);
    if (storedPubkey) setNpub(storedPubkey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setNostrProfilePicBroken(false);
    if (!npub) {
      setNpubDisplay(null);
      setNostrProfileName('Nostr user');
      setNostrProfilePic(null);
      setNostrLightning('');
      return () => {
        cancelled = true;
      };
    }
    try {
      setNpubDisplay(npubEncode(npub));
    } catch {
      setNpubDisplay(npub);
    }
    void fetchLatestKind0Profile(npub).then((p) => {
      if (cancelled) return;
      setNostrProfileName(p?.displayTitle ?? 'Nostr user');
      setNostrProfilePic(p?.picture?.trim() || null);
      setNostrLightning(p?.lud16?.trim() || p?.lud06?.trim() || '');
    });
    return () => {
      cancelled = true;
    };
  }, [npub]);

  // Keep compatibility with payout surfaces that still read this legacy key.
  useEffect(() => {
    if (nostrLightning.trim()) {
      localStorage.setItem(LN_ADDRESS_KEY, nostrLightning.trim());
    } else {
      localStorage.removeItem(LN_ADDRESS_KEY);
    }
  }, [nostrLightning]);

  useEffect(() => {
    if (bountyRafRef.current !== null) cancelAnimationFrame(bountyRafRef.current);
    const target = CHALLENGES[selected].bounty;
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
    return () => { if (bountyRafRef.current !== null) cancelAnimationFrame(bountyRafRef.current); };
  }, [selected]);

  const clearLockedPreview = useCallback((rowIndex?: number) => {
    if (lockedPreviewRafRef.current !== null) {
      cancelAnimationFrame(lockedPreviewRafRef.current);
      lockedPreviewRafRef.current = null;
    }
    setLockedPreviewRow((curr) => {
      if (rowIndex == null) return null;
      return curr === rowIndex ? null : curr;
    });
    setLockedPreviewValue((curr) => {
      if (rowIndex == null) return null;
      return lockedPreviewRow === rowIndex ? null : curr;
    });
  }, [lockedPreviewRow]);

  const startLockedPreviewToZero = useCallback((rowIndex: number) => {
    if (npub) return;
    if (lockedPreviewRafRef.current !== null) {
      cancelAnimationFrame(lockedPreviewRafRef.current);
      lockedPreviewRafRef.current = null;
    }

    const from = rowIndex === selected ? displayBounty : CHALLENGES[rowIndex].bounty;
    const durationMs = 280;
    const startAt = performance.now();
    setLockedPreviewRow(rowIndex);
    setLockedPreviewValue(from);

    const tick = (now: number) => {
      const t = Math.min((now - startAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const value = Math.max(0, Math.round(from * (1 - eased)));
      setLockedPreviewValue(value);
      if (t < 1) {
        lockedPreviewRafRef.current = requestAnimationFrame(tick);
      } else {
        lockedPreviewRafRef.current = null;
      }
    };

    lockedPreviewRafRef.current = requestAnimationFrame(tick);
  }, [npub, selected, displayBounty]);

  useEffect(() => {
    return () => {
      if (lockedPreviewRafRef.current !== null) {
        cancelAnimationFrame(lockedPreviewRafRef.current);
      }
    };
  }, []);

  const launchChallenge = useCallback((idx?: number) => {
    const challenge = CHALLENGES[idx ?? selected];
    if (!challenge) return;
    playSfx(SFX.MENU_CONFIRM);

    const isFfa = challenge.format === '4P FFA';
    const parts: string[] = ['SOLO', isFfa ? 'FFA' : '1v1', 'CVG'];
    if (challenge.powerup) parts.push('PWR');

    const config: Record<string, unknown> = {
      mode: 'SOLO',
      soloChallengeName: challenge.name,
      soloBounty: challenge.bounty,
      localHudLabel: parts.join(' · '),
      teamMode: isFfa ? 'ffa' : 'solo',
      practiceMode: true,
      p1Human: true,
      p2Human: false,
      p3Human: false,
      p4Human: false,
      p1Name: 'Player',
      p2Name: 'BigToshi 🌊',
      aiTier: challenge.aiTier,
      convergenceMode: true,
      powerupMode: challenge.powerup,
      convergenceShrinkInterval: CONVERGENCE_PRESET.shrinkIntervalTicks,
      convergenceMinCols: CONVERGENCE_PRESET.minCols,
      convergenceMinRows: CONVERGENCE_PRESET.minRows,
      convergenceStepMs: CONVERGENCE_PRESET.stepMs,
    };
    if (isFfa) config.ffaAiTier = challenge.aiTier;

    sessionStorage.setItem('gameConfig', JSON.stringify(config));
    navigate('/game');
  }, [selected, playSfx, navigate]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const activeEl = document.activeElement as HTMLElement | null;
      const onBack = activeEl === backRef.current;
      const onGateAction = activeEl === gateActionRef.current;
      const focusedRowIndex = rowRefs.current.findIndex((r) => r === activeEl);
      const onRow = focusedRowIndex >= 0;
      // Clicks on non-focusables leave focus on <body>; keep navigating from last selection.
      const orphanListNav =
        !onRow && !onGateAction && !onBack && document.body.contains(activeEl);
      const rowNavIndex = onRow ? focusedRowIndex : orphanListNav ? selected : -1;

      const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
      const isUp   = e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W';
      const isLeft = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
      const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';

      if (isDown) {
        e.preventDefault();
        if (onGateAction) {
          playSfx(SFX.MENU_SELECT);
          setSelected(0);
          rowRefs.current[0]?.focus({ preventScroll: true });
          return;
        }
        if (onBack) {
          playSfx(SFX.MENU_SELECT);
          gateActionRef.current?.focus({ preventScroll: true });
          return;
        }
        if (rowNavIndex < 0) return;
        setSelected((prev) => {
          const from = onRow ? focusedRowIndex : prev;
          if (from < CHALLENGES.length - 1) {
            playSfx(SFX.MENU_SELECT);
            return from + 1;
          }
          playSfx(SFX.MENU_SELECT);
          backRef.current?.focus();
          return prev;
        });
        return;
      }

      if (isUp) {
        e.preventDefault();
        if (onGateAction) {
          playSfx(SFX.MENU_SELECT);
          backRef.current?.focus({ preventScroll: true });
          return;
        }
        if (onBack) {
          playSfx(SFX.MENU_SELECT);
          const lastIdx = CHALLENGES.length - 1;
          setSelected(lastIdx);
          rowRefs.current[lastIdx]?.focus({ preventScroll: true });
          return;
        }
        if (rowNavIndex < 0) return;
        if ((onRow ? focusedRowIndex : selected) === 0) {
          playSfx(SFX.MENU_SELECT);
          gateActionRef.current?.focus({ preventScroll: true });
          return;
        }
        setSelected((prev) => {
          const from = onRow ? focusedRowIndex : prev;
          if (from > 0) playSfx(SFX.MENU_SELECT);
          return Math.max(from - 1, 0);
        });
        return;
      }

      if (isLeft) {
        if (rowNavIndex < 0) return;
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        gateActionRef.current?.focus({ preventScroll: true });
        return;
      }

      if (isRight) {
        if (rowNavIndex < 0) return;
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        backRef.current?.focus({ preventScroll: true });
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (onGateAction) {
          gateActionRef.current?.click();
          return;
        }
        if (onBack) {
          playSfx(SFX.MENU_CONFIRM);
          navigate('/');
        } else {
          launchChallenge();
        }
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [playSfx, navigate, launchChallenge]);

  useEffect(() => {
    const el = rowRefs.current[selected];
    if (!el) return;
    el.focus({ preventScroll: true });

    // Skip the pop on initial mount — the reveal stagger is still running
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    // Pop the inner wrapper so the button's glowing animation is untouched
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
  }, [selected]);

  return (
    <div className="practice-hub practice-hub--practice solo-challenges-page">
      <header id="brand" aria-hidden="true">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <header className="practice-hub-header">
        <h2 className="practice-hub-title solo-challenges-title">SOLO</h2>
        <p className="sc-page-lede">Beat the bot, earn sats. Connect Nostr&nbsp;+ a Lightning address to receive payouts.</p>
      </header>

      <div className="practice-panel solo-challenges-panel">
        <div className="solo-challenges-layout">
          <div className="solo-challenges-col solo-challenges-col--left">
            {/* ── Nostr / LN payout gate ── */}
            <div className={`sc-gate${payoutReady ? ' sc-gate--ready' : ''}`}>
              <div className="sc-gate__top">
                {npub ? (
                  <div className="sc-gate__nostr-profile" aria-label="Signed in Nostr profile">
                    <img
                      className="sc-gate__nostr-avatar"
                      src={!nostrProfilePicBroken && nostrProfilePic ? nostrProfilePic : '/images/social/Nostr.png'}
                      alt=""
                      width={20}
                      height={20}
                      onError={() => setNostrProfilePicBroken(true)}
                    />
                    <span className="sc-gate__nostr-meta">
                      <span className="sc-gate__nostr-name">{nostrProfileName}</span>
                      <span className="sc-gate__nostr-pubkey" title={npubDisplay ?? npub}>
                        {npubDisplay
                          ? `${npubDisplay.slice(0, 12)}…${npubDisplay.slice(-8)}`
                          : npub}
                      </span>
                      <span className="sc-gate__nostr-ln">
                        {nostrLightning.trim() ? `⚡ ${nostrLightning.trim()}` : 'No Lightning in kind 0 profile'}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="sc-gate__config-link"
                      ref={gateActionRef}
                      onClick={() => {
                        playSfx(SFX.MENU_CONFIRM);
                        navigate('/config');
                      }}
                    >
                      CONFIG
                    </button>
                  </div>
                ) : (
                  <button
                    className="sc-gate__nostr-btn"
                    ref={gateActionRef}
                    onClick={() => {
                      playSfx(SFX.MENU_CONFIRM);
                      navigate('/config');
                    }}
                    type="button"
                  >
                    <svg className="sc-gate__icon" viewBox="0 0 1343 1567" fill="none" aria-hidden="true">
                      <path
                        d="M1341.73 359.738C1338.13 324.538 1326.53 292.738 1304.13 264.938C1284.33 240.338 1258.93 222.738 1234.93 202.938C1222.93 193.138 1191.13 166.538 1187.13 151.538C1182.33 133.338 1189.73 114.738 1206.33 108.738C1231.33 100.338 1273.13 100.538 1297.33 102.138C1317.93 103.738 1339.13 96.5377 1339.93 88.1377C1340.73 79.7377 1328.53 67.3377 1312.33 63.5377C1299.53 60.5377 1279.93 55.9377 1268.13 48.1377C1247.13 33.9377 1225.73 7.93768 1196.53 2.13768C1154.93 -6.06232 1125.93 9.53768 1112.33 45.3377C1090.73 96.5377 1104.73 162.138 1150.13 210.138C1170.53 231.738 1194.33 250.338 1217.13 269.738C1233.93 284.138 1248.73 299.938 1262.93 317.538C1300.93 364.938 1260.73 451.938 1251.13 461.938C1217.53 496.738 1188.33 503.138 1130.33 500.738C1073.33 498.338 925.525 421.938 847.325 419.538C653.725 413.538 519.325 502.938 473.925 526.138C405.925 560.938 309.125 563.138 306.125 564.138C262.325 567.538 171.525 570.938 126.525 586.538C63.1252 604.138 28.9252 633.138 5.7252 697.938C-1.4748 725.938 -2.87477 751.338 7.32523 766.738C29.5252 800.338 89.3252 828.338 116.525 843.738C130.525 851.738 158.125 841.738 163.525 837.938C193.925 817.338 220.725 801.138 256.725 795.938C264.325 794.738 315.125 785.738 340.725 804.538C359.325 818.138 375.325 826.338 396.325 835.938C434.725 853.338 519.325 875.338 520.925 875.738C532.325 878.738 546.925 884.538 546.925 894.738C546.925 909.138 412.525 1021.54 405.125 1024.34C371.325 1038.14 351.725 1060.34 345.525 1092.34C343.525 1102.74 338.925 1113.54 333.125 1122.14C311.325 1153.74 214.725 1290.94 189.125 1328.54C176.925 1346.14 164.325 1354.94 146.925 1357.74C121.925 1361.74 103.125 1362.34 92.5252 1380.14C85.9252 1391.54 90.1252 1413.74 94.5252 1428.14C99.5252 1444.54 85.9252 1464.94 84.9252 1467.34C72.9252 1490.74 67.9252 1513.14 69.7252 1535.74C70.3252 1544.94 70.9252 1566.34 86.1252 1566.94C101.325 1567.74 105.325 1557.94 107.125 1554.34C109.325 1549.94 117.725 1531.74 120.125 1527.34C129.925 1509.14 167.325 1469.94 171.525 1465.34C184.925 1450.54 384.925 1175.14 384.925 1175.14C395.925 1160.74 407.325 1145.94 425.925 1138.74C451.725 1128.74 468.925 1108.14 473.925 1080.94C475.125 1074.94 554.925 1013.74 588.925 987.938C601.325 978.538 676.525 948.338 677.725 948.738C677.725 949.338 608.925 1052.94 587.525 1107.94C584.125 1116.74 578.525 1146.74 584.725 1161.94C594.325 1185.34 614.925 1195.54 638.325 1188.54C645.525 1186.34 651.925 1182.74 658.125 1179.34C660.925 1177.74 663.725 1176.34 666.525 1174.94C669.325 1173.54 671.925 1172.14 674.725 1170.74C681.125 1167.34 687.325 1164.14 693.525 1162.14C716.525 1154.54 739.725 1147.34 762.925 1140.14L809.925 1125.54C842.725 1115.34 875.525 1105.14 908.325 1095.14C915.525 1092.94 922.525 1090.34 931.525 1090.54C936.525 1090.54 941.925 1092.54 943.725 1099.94C943.725 1100.34 947.525 1122.74 961.325 1131.74C968.325 1136.34 983.325 1139.94 994.525 1139.54C1004.33 1139.14 1016.73 1141.94 1023.13 1147.54L1031.33 1154.54C1037.33 1159.54 1044.73 1162.34 1049.73 1163.74C1054.93 1165.14 1064.53 1165.14 1070.13 1159.34C1076.13 1152.94 1073.93 1142.54 1073.13 1139.34C1071.93 1134.94 1069.53 1131.54 1067.73 1128.54L1062.73 1120.74C1057.93 1113.14 1053.33 1105.54 1048.33 1097.94C1034.53 1076.94 1020.93 1056.14 1006.93 1035.34C992.325 1013.74 969.725 1005.14 940.125 1009.74C928.725 1011.54 678.525 1089.14 676.725 1089.54C690.125 1064.94 770.325 954.138 792.725 940.138C809.325 930.338 816.325 920.938 846.525 915.738C905.525 905.738 1033.53 876.138 1065.33 853.138C1127.13 808.338 1132.13 706.538 1131.13 686.138C1129.93 665.738 1136.53 651.738 1154.33 642.338C1163.13 637.738 1258.33 585.138 1304.93 507.538C1332.93 462.138 1347.33 413.538 1341.73 359.738Z"
                        fill="currentColor"
                      />
                    </svg>
                    <span className="sc-gate__label">SIGN IN WITH NOSTR</span>
                  </button>
                )}
              </div>

              <div className={`sc-gate__status${payoutReady ? ' sc-gate__status--ready' : ''}`}>
                {payoutReady
                  ? 'WIN AND POST SIGNED NOTE TO CLAIM ZAP'
                  : npub
                    ? 'ADD LIGHTNING TO KIND 0 PROFILE'
                    : 'CONNECT TO UNLOCK SATS PRIZES'}
              </div>
            </div>

            {/* ── Action buttons ── */}
            <div className="practice-actions">
              <Button
                ref={backRef}
                className="practice-back"
                tabIndex={0}
                onClick={() => {
                  playSfx(SFX.MENU_CONFIRM);
                  navigate('/');
                }}
              >
                MAIN MENU
              </Button>
            </div>
          </div>

          <div className="solo-challenges-col solo-challenges-col--right">
            {/* ── Challenge rows ── */}
            <div className="sc-list" role="listbox" aria-label="Solo challenges">
              {CHALLENGES.map((c, i) => {
                const isSelected = selected === i;
                return (
                  <button
                    key={c.id}
                    ref={(el) => { rowRefs.current[i] = el; }}
                    className={`sc-row${isSelected ? ' sc-row--selected' : ''}`}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => {
                      setSelected(i);
                      launchChallenge(i);
                    }}
                    onMouseEnter={() => {
                      startLockedPreviewToZero(i);
                    }}
                    onMouseLeave={() => {
                      if (!npub) clearLockedPreview(i);
                    }}
                    onFocus={() => {
                      startLockedPreviewToZero(i);
                    }}
                    onBlur={() => {
                      if (!npub) clearLockedPreview(i);
                    }}
                    type="button"
                    data-tier={c.aiTier}
                  >
                    <div
                      ref={(el) => { innerRefs.current[i] = el; }}
                      className="sc-row__inner"
                    >
                      <span className="sc-row__rank">{c.rank}</span>

                      <div className="sc-row__info">
                        <span className="sc-row__name">{c.name}</span>
                        <div className="sc-row__tags">
                          <span className="sc-tag">{c.format}</span>
                          <span className="sc-tag sc-tag--tier" data-tier={c.aiTier}>
                            {TIER_LABELS[c.aiTier]}
                            <TierPips tier={c.aiTier} />
                          </span>
                          <span className="sc-tag sc-tag--cvg">CVG</span>
                          {c.powerup && <span className="sc-tag sc-tag--mod">+ITEMS</span>}
                        </div>
                      </div>

                      <div className={`sc-row__bounty${!npub ? ' sc-row__bounty--locked' : ''}`}>
                        <span className="sc-row__sats-line">
                          {!npub ? (
                            <svg className="sc-row__lock" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M7 10V8a5 5 0 0 1 10 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                              <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                              <circle cx="12" cy="15" r="1.2" fill="currentColor"/>
                            </svg>
                          ) : null}
                          <span className="sc-row__sats">
                            {formatBounty(
                              !npub && lockedPreviewRow === i && lockedPreviewValue !== null
                                ? lockedPreviewValue
                                : i === selected
                                  ? displayBounty
                                  : c.bounty
                            )}
                          </span>
                        </span>
                        <span className="sc-row__unit">{npub ? 'SATS' : 'PRIZE LOCKED'}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={false} />
    </div>
  );
}
