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
  if (sats >= 1000) return `${sats / 1000}K`;
  return String(sats);
}

const LN_ADDRESS_KEY = 'arcadeLnAddress';
const NOSTR_PUBKEY_KEY = 'arcadeNostrPubkey';

export default function SoloChallenges() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  useGamepad(true);

  const [selected, setSelected] = useState(0);
  const [npub, setNpub] = useState<string | null>(null);
  const [lnAddress, setLnAddress] = useState('');
  const [nostrLoading, setNostrLoading] = useState(false);
  const [nostrError, setNostrError] = useState<string | null>(null);

  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const didMountRef = useRef(false);
  const lnInputRef = useRef<HTMLInputElement | null>(null);

  const payoutReady = !!npub && lnAddress.trim().includes('@');

  useEffect(() => {
    const storedPubkey = localStorage.getItem(NOSTR_PUBKEY_KEY);
    const storedLn = localStorage.getItem(LN_ADDRESS_KEY);
    if (storedPubkey) setNpub(storedPubkey);
    if (storedLn) setLnAddress(storedLn);
  }, []);

  const connectNostr = useCallback(async () => {
    if (!window.nostr) {
      setNostrError('No Nostr extension found. Install Alby or nos2x.');
      return;
    }
    setNostrLoading(true);
    setNostrError(null);
    try {
      const pubkey = await window.nostr.getPublicKey();
      setNpub(pubkey);
      localStorage.setItem(NOSTR_PUBKEY_KEY, pubkey);
      playSfx(SFX.MENU_CONFIRM);
    } catch {
      setNostrError('Nostr connection rejected.');
    } finally {
      setNostrLoading(false);
    }
  }, [playSfx]);

  const handleLnChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLnAddress(val);
    localStorage.setItem(LN_ADDRESS_KEY, val);
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
      if (tag === 'INPUT') return;

      const onBack   = document.activeElement === backRef.current;
      const onButton = onBack;

      const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
      const isUp   = e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W';

      if (isDown) {
        e.preventDefault();
        if (onButton) return;
        setSelected((prev) => {
          if (prev < CHALLENGES.length - 1) {
            playSfx(SFX.MENU_SELECT);
            return prev + 1;
          }
          // Last row → move focus to MAIN MENU
          playSfx(SFX.MENU_SELECT);
          backRef.current?.focus();
          return prev;
        });
        return;
      }

      if (isUp) {
        e.preventDefault();
        if (onButton) {
          playSfx(SFX.MENU_SELECT);
          const lastIdx = CHALLENGES.length - 1;
          setSelected(lastIdx);
          rowRefs.current[lastIdx]?.focus({ preventScroll: true });
          return;
        }
        setSelected((prev) => {
          if (prev > 0) playSfx(SFX.MENU_SELECT);
          return Math.max(prev - 1, 0);
        });
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
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

        {/* ── Nostr / LN payout gate ── */}
        <div className={`sc-gate${payoutReady ? ' sc-gate--ready' : ''}`}>
          <div className="sc-gate__row">
            <button
              className={`sc-gate__nostr-btn${npub ? ' sc-gate__nostr-btn--connected' : ''}`}
              onClick={connectNostr}
              disabled={nostrLoading}
              type="button"
            >
              {npub ? (
                <>
                  <svg className="sc-gate__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5l-2 2-1.41-1.41L12 7.67l4.41 4.42L15 13.5l-2-2v5h-2z" fill="currentColor"/>
                  </svg>
                  <span className="sc-gate__label">
                    {npub.slice(0, 8)}…{npub.slice(-4)}
                  </span>
                </>
              ) : (
                <>
                  <svg className="sc-gate__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/>
                  </svg>
                  <span className="sc-gate__label">
                    {nostrLoading ? 'CONNECTING…' : 'CONNECT NOSTR'}
                  </span>
                </>
              )}
            </button>

            <div className="sc-gate__ln-wrap">
              <svg className="sc-gate__icon sc-gate__icon--ln" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
              <input
                ref={lnInputRef}
                className="sc-gate__ln-input"
                type="text"
                placeholder="you@wallet.domain"
                value={lnAddress}
                onChange={handleLnChange}
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            <div className={`sc-gate__status${payoutReady ? ' sc-gate__status--ready' : ''}`}>
              {payoutReady ? 'PAYOUT READY' : 'CONNECT TO WIN SATS'}
            </div>
          </div>
          {nostrError && <p className="sc-gate__error">{nostrError}</p>}
        </div>

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

                  <div className="sc-row__bounty">
                    <span className="sc-row__sats">{formatBounty(c.bounty)}</span>
                    <span className="sc-row__unit">SATS</span>
                  </div>
                </div>
              </button>
            );
          })}
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

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={false} />
    </div>
  );
}
