import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import type { AiTier, TeamMode } from '@/game/engine/types';
import {
  CONVERGENCE_MIN_COLS,
  CONVERGENCE_MIN_ROWS,
  LOCAL_HUB_CONVERGENCE_SHRINK_INTERVAL_TICKS,
} from '@/game/engine/constants';
import '@/components/ui/Button.css';
import './practiceHub.css';
import '@/styles/pages/p2p-entry.css';
import '@/styles/pages/local-hub.css';
import {
  advanceLocalHubFlatNav,
  moveLocalHubNav,
  normalizeLocalNavFocus,
  type LocalNavFocus,
} from '@/pages/localHubNav';

// ── Convergence: fixed Soldier preset ──────────────────────────────────────

const CONVERGENCE_SOLDIER = {
  shrinkIntervalTicks: LOCAL_HUB_CONVERGENCE_SHRINK_INTERVAL_TICKS,
  stepMs: 100,
  minCols: CONVERGENCE_MIN_COLS,
  minRows: CONVERGENCE_MIN_ROWS,
} as const;

/** Bot tiers — order = easiest → hardest */
const AI_TIER_PRESETS: Array<{
  id: AiTier;
  rank: number;
  name: string;
}> = [
  { id: 'wanderer', rank: 1, name: 'WANDERER' },
  { id: 'hunter',   rank: 2, name: 'HUNTER'   },
  { id: 'tactician',rank: 3, name: 'TACTICIAN' },
  { id: 'sovereign',rank: 4, name: 'SOVEREIGN' },
];

type MatchFormat    = 'solo' | 'ffa';
type OpponentChoice = 'humans' | 'ai';

export default function LocalHub() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  useGamepad(true);

  const [format,    setFormat]    = useState<MatchFormat>('solo');
  const [opponent,  setOpponent]  = useState<OpponentChoice>('humans');
  const [slotHuman, setSlotHuman] = useState([true, true, true, true]);
  const [aiTier,    setAiTier]    = useState<AiTier>('hunter');
  const [powerup,   setPowerup]   = useState(false);

  const [navFocus, setNavFocus] = useState<LocalNavFocus>({ kind: 'format', idx: 0 });

  const formatRefs   = useRef<(HTMLButtonElement | null)[]>([]);
  const slotRefs     = useRef<(HTMLButtonElement | null)[]>([]);
  const opponentRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tierRefs     = useRef<(HTMLButtonElement | null)[]>([]);
  const powerupRef   = useRef<HTMLButtonElement | null>(null);
  const startRef     = useRef<HTMLButtonElement | null>(null);
  const backRef      = useRef<HTMLButtonElement | null>(null);

  const show1v1Opponent = format === 'solo';
  const showTeamControl = format === 'ffa';
  const allFourHuman    = showTeamControl && slotHuman.every(Boolean);

  const toggleSlot = useCallback(
    (idx: number) => {
      playSfx(SFX.MENU_SELECT);
      setSlotHuman((prev) => {
        const next = [...prev];
        next[idx] = !next[idx];
        return next;
      });
    },
    [playSfx]
  );

  const start = useCallback(() => {
    playSfx(SFX.MENU_CONFIRM);

    let p1Human: boolean, p2Human: boolean, p3Human: boolean, p4Human: boolean;
    let practiceMode: boolean;

    if (format === 'solo') {
      p1Human     = true;
      p2Human     = opponent !== 'ai';
      p3Human     = false;
      p4Human     = false;
      practiceMode = !p2Human;
    } else {
      p1Human = slotHuman[0]!;
      p2Human = slotHuman[1]!;
      p3Human = slotHuman[2]!;
      p4Human = slotHuman[3]!;
      practiceMode = !p1Human || !p2Human || !p3Human || !p4Human;
    }

    const parts: string[] = ['LOCAL', format === 'ffa' ? 'FFA' : '1v1', 'CVG'];
    if (powerup) parts.push('PWR');

    const config: Record<string, unknown> = {
      mode: 'LOCAL',
      localHudLabel: parts.join(' · '),
      teamMode: format as TeamMode,
      practiceMode,
      p1Human, p2Human, p3Human, p4Human,
      p1Name: p1Human ? 'Player 1' : 'BigToshi 🌊',
      p2Name: p2Human ? 'Player 2' : 'BigToshi 🌊',
      aiTier,
      convergenceMode: true,
      powerupMode: powerup,
      convergenceShrinkInterval: CONVERGENCE_SOLDIER.shrinkIntervalTicks,
      convergenceMinCols: CONVERGENCE_SOLDIER.minCols,
      convergenceMinRows: CONVERGENCE_SOLDIER.minRows,
      convergenceStepMs: CONVERGENCE_SOLDIER.stepMs,
    };
    if (format === 'ffa') config.ffaAiTier = aiTier;

    sessionStorage.setItem('gameConfig', JSON.stringify(config));
    navigate('/game');
  }, [playSfx, navigate, format, opponent, slotHuman, aiTier, powerup]);

  const activateLocalNavFocus = useCallback(
    (f: LocalNavFocus) => {
      switch (f.kind) {
        case 'format':
          setFormat((['solo', 'ffa'] as const)[f.idx]);
          playSfx(SFX.MENU_SELECT);
          break;
        case 'slot':
          toggleSlot(f.idx);
          break;
        case 'opponent':
          setOpponent(f.idx === 0 ? 'humans' : 'ai');
          playSfx(SFX.MENU_SELECT);
          break;
        case 'tier':
          setAiTier(AI_TIER_PRESETS[f.idx]!.id);
          playSfx(SFX.MENU_SELECT);
          break;
        case 'rulePowerup':
          setPowerup((v) => !v);
          playSfx(SFX.MENU_SELECT);
          break;
        case 'start':
          start();
          break;
        case 'back':
          playSfx(SFX.MENU_SELECT);
          navigate('/');
          break;
        default:
          break;
      }
    },
    [navigate, playSfx, start, toggleSlot]
  );

  useEffect(() => {
    setNavFocus((f) =>
      normalizeLocalNavFocus(f, showTeamControl, show1v1Opponent, opponent, allFourHuman)
    );
  }, [showTeamControl, show1v1Opponent, opponent, allFourHuman]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        navigate('/');
        return;
      }
      const isUp       = e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W';
      const isDown     = e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S';
      const isLeft     = e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A';
      const isRight    = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
      const isActivate = e.key === 'Enter' || e.key === ' ';
      const isTab      = e.key === 'Tab' && !e.shiftKey;
      const isTabBack  = e.key === 'Tab' &&  e.shiftKey;

      if (!isUp && !isDown && !isLeft && !isRight && !isActivate && !isTab && !isTabBack) return;
      if (e.repeat && isActivate) return;

      if (isTab) {
        e.preventDefault();
        setNavFocus((prev) => advanceLocalHubFlatNav(prev, 1, showTeamControl, show1v1Opponent, opponent, allFourHuman));
        return;
      }
      if (isTabBack) {
        e.preventDefault();
        setNavFocus((prev) => advanceLocalHubFlatNav(prev, -1, showTeamControl, show1v1Opponent, opponent, allFourHuman));
        return;
      }
      if (isActivate) {
        e.preventDefault();
        activateLocalNavFocus(navFocus);
        return;
      }
      e.preventDefault();
      setNavFocus((prev) =>
        moveLocalHubNav(
          prev,
          isUp ? 'up' : isDown ? 'down' : isLeft ? 'left' : 'right',
          showTeamControl, show1v1Opponent, opponent, allFourHuman
        )
      );
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [activateLocalNavFocus, allFourHuman, navigate, navFocus, opponent, playSfx, show1v1Opponent, showTeamControl]);

  useEffect(() => {
    if      (navFocus.kind === 'format')    { formatRefs.current[navFocus.idx]?.focus(); }
    else if (navFocus.kind === 'slot')      { slotRefs.current[navFocus.idx]?.focus(); }
    else if (navFocus.kind === 'opponent')  { opponentRefs.current[navFocus.idx]?.focus(); }
    else if (navFocus.kind === 'tier')      { tierRefs.current[navFocus.idx]?.focus(); }
    else if (navFocus.kind === 'rulePowerup') { powerupRef.current?.focus(); }
    else if (navFocus.kind === 'start')     { startRef.current?.focus(); }
    else if (navFocus.kind === 'back')      { backRef.current?.focus(); }
  }, [navFocus]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="practice-hub practice-hub--practice local-hub-page">

      {/* Brand header — identical to P2P */}
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <header className="practice-hub-header">
        <h2 className="practice-hub-title">LOCAL</h2>
      </header>

      <div className="practice-panel" role="main" aria-label="Local practice setup">

        {/* ── FORMAT ──────────────────────────────────────────────────── */}
        <section className="practice-section" aria-labelledby="lh-format">
          <h3 id="lh-format" className="p2p-picker-group-label">FORMAT</h3>
          <div className="p2p-picker-row" role="radiogroup" aria-label="Match format">

            {/* 1V1 — reuse duel card style + sword animation */}
            <button
              ref={(el) => { formatRefs.current[0] = el; }}
              type="button"
              role="radio"
              aria-checked={format === 'solo'}
              tabIndex={navFocus.kind === 'format' && navFocus.idx === 0 ? 0 : -1}
              className={[
                'p2p-picker-card',
                'p2p-picker-card--duel',
                format === 'solo' ? 'p2p-picker-card--selected' : '',
                navFocus.kind === 'format' && navFocus.idx === 0 ? 'practice-focus-target' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                setNavFocus({ kind: 'format', idx: 0 });
                playSfx(SFX.MENU_SELECT);
                setFormat('solo');
              }}
            >
              <svg className="p2p-picker-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <g className="p2p-sword p2p-sword--1">
                  <path d="M19 4L5 19" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  <path d="M13 7L17 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </g>
                <g className="p2p-sword p2p-sword--2">
                  <path d="M5 4L19 19" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  <path d="M7 10L11 7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </g>
              </svg>
              <span className="p2p-picker-label">1V1</span>
              <span className="p2p-picker-sub">Head to head</span>
            </button>

            {/* FFA */}
            <button
              ref={(el) => { formatRefs.current[1] = el; }}
              type="button"
              role="radio"
              aria-checked={format === 'ffa'}
              tabIndex={navFocus.kind === 'format' && navFocus.idx === 1 ? 0 : -1}
              className={[
                'p2p-picker-card',
                'p2p-picker-card--ffa',
                format === 'ffa' ? 'p2p-picker-card--selected' : '',
                navFocus.kind === 'format' && navFocus.idx === 1 ? 'practice-focus-target' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                setNavFocus({ kind: 'format', idx: 1 });
                playSfx(SFX.MENU_SELECT);
                setFormat('ffa');
              }}
            >
              <svg className="p2p-picker-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <g className="lh-ffa-icon">
                  <rect x="2" y="2" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12"/>
                  <rect x="15" y="2" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12"/>
                  <rect x="2" y="15" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12"/>
                  <rect x="15" y="15" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12"/>
                  <path d="M9 5.5h6M18.5 9v6M15 18.5H9M5.5 15V9" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </g>
              </svg>
              <span className="p2p-picker-label">FFA</span>
              <span className="p2p-picker-sub">Four chains</span>
            </button>

          </div>
        </section>

        {/* ── Mode config overlay (same grid cell — no height shift) ──── */}
        <div className="local-mode-config-area">

          {/* Solo / 1v1 section */}
          <section
            className={`practice-section${format !== 'solo' ? ' local-mode-inactive' : ''}`}
            aria-hidden={format !== 'solo'}
          >
            <h3 className="p2p-picker-group-label">OPPONENT</h3>
            <div className="p2p-picker-row" role="radiogroup" aria-label="Opponent type">

              {/* HUMANS */}
              <button
                ref={(el) => { opponentRefs.current[0] = el; }}
                type="button"
                role="radio"
                aria-checked={opponent === 'humans'}
                tabIndex={navFocus.kind === 'opponent' && navFocus.idx === 0 ? 0 : -1}
                className={[
                  'p2p-picker-card',
                  'p2p-picker-card--humans',
                  opponent === 'humans' ? 'p2p-picker-card--selected' : '',
                  navFocus.kind === 'opponent' && navFocus.idx === 0 ? 'practice-focus-target' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  setNavFocus({ kind: 'opponent', idx: 0 });
                  playSfx(SFX.MENU_SELECT);
                  setOpponent('humans');
                }}
              >
                <svg className="p2p-picker-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="8" cy="7" r="2.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M3 18a5 4 0 0 1 10 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                  <circle cx="16" cy="7" r="2.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                  <path d="M11 18a5 4 0 0 1 10 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none"/>
                </svg>
                <span className="p2p-picker-label">HUMANS</span>
                <span className="p2p-picker-sub">Local play</span>
              </button>

              {/* AI */}
              <button
                ref={(el) => { opponentRefs.current[1] = el; }}
                type="button"
                role="radio"
                aria-checked={opponent === 'ai'}
                tabIndex={navFocus.kind === 'opponent' && navFocus.idx === 1 ? 0 : -1}
                className={[
                  'p2p-picker-card',
                  'p2p-picker-card--ai',
                  opponent === 'ai' ? 'p2p-picker-card--selected' : '',
                  navFocus.kind === 'opponent' && navFocus.idx === 1 ? 'practice-focus-target' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  setNavFocus({ kind: 'opponent', idx: 1 });
                  playSfx(SFX.MENU_SELECT);
                  setOpponent('ai');
                }}
              >
                <svg className="p2p-picker-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="6" y="8" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12"/>
                  <circle cx="9.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.3"/>
                  <circle cx="14.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.3"/>
                  <path d="M9 18v2M15 18v2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  <path d="M12 4v4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  <circle cx="12" cy="3.5" r="1" stroke="currentColor" strokeWidth="1"/>
                  <path d="M6 13H3M21 13h-3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
                <span className="p2p-picker-label">AI</span>
                <span className="p2p-picker-sub">vs bot</span>
              </button>

            </div>

            {/* Difficulty — only shown when opponent is AI */}
            {opponent === 'ai' && (
              <div className="local-tier-area">
                <h3 className="p2p-picker-group-label">DIFFICULTY</h3>
                <div className="local-tier-grid">
                  {AI_TIER_PRESETS.map((p, i) => (
                    <button
                      key={p.id}
                      ref={(el) => { tierRefs.current[i] = el; }}
                      type="button"
                      data-tier={p.id}
                      tabIndex={navFocus.kind === 'tier' && navFocus.idx === i ? 0 : -1}
                      className={[
                        'p2p-duel-format__card',
                        'local-tier-card',
                        aiTier === p.id ? 'p2p-duel-format__card--active' : '',
                        navFocus.kind === 'tier' && navFocus.idx === i ? 'practice-focus-target' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => {
                        setNavFocus({ kind: 'tier', idx: i as 0 | 1 | 2 | 3 });
                        playSfx(SFX.MENU_SELECT);
                        setAiTier(p.id);
                      }}
                    >
                      <span className="p2p-duel-format__label">{p.name}</span>
                      <div className="local-tier-pips" aria-hidden="true">
                        {Array.from({ length: 4 }, (_, j) => (
                          <span key={j} className={`local-tier-pip${j < p.rank ? ' local-tier-pip--filled' : ''}`} />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* FFA section */}
          <section
            className={`practice-section${format !== 'ffa' ? ' local-mode-inactive' : ''}`}
            aria-hidden={format !== 'ffa'}
          >
            <h3 className="p2p-picker-group-label">PLAYERS</h3>
            <div className="practice-four-slot" role="group" aria-label="P1 through P4">
              {(['P1', 'P2', 'P3', 'P4'] as const).map((label, idx) => (
                <button
                  key={label}
                  ref={(el) => { slotRefs.current[idx] = el; }}
                  type="button"
                  tabIndex={navFocus.kind === 'slot' && navFocus.idx === idx ? 0 : -1}
                  className={`practice-slot-btn ${slotHuman[idx] ? 'human' : 'ai'}${navFocus.kind === 'slot' && navFocus.idx === idx ? ' practice-focus-target' : ''}`}
                  onClick={() => {
                    setNavFocus({ kind: 'slot', idx: idx as 0 | 1 | 2 | 3 });
                    toggleSlot(idx);
                  }}
                >
                  <span className="practice-slot-id">{label}</span>
                  <span className="practice-slot-role">{slotHuman[idx] ? 'HUMAN' : 'AI'}</span>
                </button>
              ))}
            </div>

            {/* Difficulty for FFA — only shown when any AI */}
            {!allFourHuman && (
              <div className="local-tier-area">
                <h3 className="p2p-picker-group-label">DIFFICULTY</h3>
                <div className="local-tier-grid">
                  {AI_TIER_PRESETS.map((p, i) => (
                    <button
                      key={p.id}
                      ref={(el) => { tierRefs.current[i] = el; }}
                      type="button"
                      data-tier={p.id}
                      tabIndex={navFocus.kind === 'tier' && navFocus.idx === i ? 0 : -1}
                      className={[
                        'p2p-duel-format__card',
                        'local-tier-card',
                        aiTier === p.id ? 'p2p-duel-format__card--active' : '',
                        navFocus.kind === 'tier' && navFocus.idx === i ? 'practice-focus-target' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => {
                        setNavFocus({ kind: 'tier', idx: i as 0 | 1 | 2 | 3 });
                        playSfx(SFX.MENU_SELECT);
                        setAiTier(p.id);
                      }}
                    >
                      <span className="p2p-duel-format__label">{p.name}</span>
                      <div className="local-tier-pips" aria-hidden="true">
                        {Array.from({ length: 4 }, (_, j) => (
                          <span key={j} className={`local-tier-pip${j < p.rank ? ' local-tier-pip--filled' : ''}`} />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

        </div>

        {/* ── MODIFIERS ────────────────────────────────────────────────── */}
        <section className="practice-section local-modifiers-section" aria-label="Game modifiers">
          <h3 className="p2p-picker-group-label">MODIFIERS</h3>
          <div className="local-modifier-row" role="group" aria-label="Game modifiers">
            <button
              ref={powerupRef}
              type="button"
              aria-pressed={powerup}
              tabIndex={navFocus.kind === 'rulePowerup' ? 0 : -1}
              className={[
                'p2p-duel-format__card',
                powerup ? 'p2p-duel-format__card--active' : '',
                navFocus.kind === 'rulePowerup' ? 'practice-focus-target' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                setNavFocus({ kind: 'rulePowerup' });
                playSfx(SFX.MENU_SELECT);
                setPowerup((v) => !v);
              }}
            >
              <svg className="p2p-duel-format__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="10.5" y="3" width="3" height="18" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
                <rect x="3" y="10.5" width="18" height="3" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
              </svg>
              <span className="p2p-duel-format__label">POWER-UPS</span>
            </button>
          </div>
        </section>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="practice-actions">
          <Button
            ref={backRef}
            tabIndex={navFocus.kind === 'back' ? 0 : -1}
            className={`practice-back${navFocus.kind === 'back' ? ' practice-start--focused' : ''}`}
            onClick={() => {
              setNavFocus({ kind: 'back' });
              playSfx(SFX.MENU_SELECT);
              navigate('/');
            }}
          >
            MAIN MENU
          </Button>
          <Button
            ref={startRef}
            tabIndex={navFocus.kind === 'start' ? 0 : -1}
            className={`practice-start${navFocus.kind === 'start' ? ' practice-start--focused' : ''}`}
            onClick={() => {
              setNavFocus({ kind: 'start' });
              start();
            }}
          >
            START PRACTICE
          </Button>
        </div>

      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
