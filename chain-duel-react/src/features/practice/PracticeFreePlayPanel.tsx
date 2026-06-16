import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudio, SFX } from '@/contexts/AudioContext';
import type { AiTier, TeamMode } from '@/game/engine/types';
import {
  CONVERGENCE_MIN_COLS,
  CONVERGENCE_MIN_ROWS,
  PRACTICE_HUB_CONVERGENCE_SHRINK_INTERVAL_TICKS,
} from '@/game/engine/constants';
import '@/components/ui/Button.css';
import {
  advancePracticeHubFlatNav,
  movePracticeHubNav,
  normalizePracticeNavFocus,
  type PracticeNavFocus,
} from '@/pages/practiceHubNav';
import { navigateToMainMenu } from '@/shared/constants/menuNavigation';
import type { PracticeFreePlayPanelHandle } from '@/features/practice/practicePanelHandles';
import { GameModifiersSection } from '@/components/paidEntry/GameModifiersSection';
import { savePracticeGameConfig } from '@/pages/practiceHubModes';
import type { PracticeHubFocus } from '@/pages/practiceHubPlayStyleNav';

// ── Convergence: fixed Soldier preset ──────────────────────────────────────

const CONVERGENCE_SOLDIER = {
  shrinkIntervalTicks: PRACTICE_HUB_CONVERGENCE_SHRINK_INTERVAL_TICKS,
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
  { id: 'normie', rank: 1, name: 'NORMIE' },
  { id: 'stacker', rank: 2, name: 'STACKER' },
  { id: 'noderunner', rank: 3, name: 'NODERUNNER' },
  { id: 'sovereign', rank: 4, name: 'SOVEREIGN' },
];

type MatchFormat = 'solo' | 'ffa';
type OpponentChoice = 'humans' | 'ai';

interface PracticeFreePlayPanelProps {
  isActive: boolean;
  menuZone: PracticeHubFocus['zone'];
  footerBackRef: RefObject<HTMLButtonElement | null>;
  footerStartRef: RefObject<HTMLButtonElement | null>;
  onExitToPlayStyle?: () => void;
  onEnterFooter?: (which: 'back' | 'start') => void;
}

export const PracticeFreePlayPanel = forwardRef<
  PracticeFreePlayPanelHandle,
  PracticeFreePlayPanelProps
>(function PracticeFreePlayPanel(
  {
    isActive,
    menuZone,
    footerBackRef,
    footerStartRef,
    onExitToPlayStyle,
    onEnterFooter,
  },
  ref
) {
  const navigate = useNavigate();
  const { playSfx } = useAudio();

  const [format, setFormat] = useState<MatchFormat>('solo');
  const [opponent, setOpponent] = useState<OpponentChoice>('ai');
  const [slotHuman, setSlotHuman] = useState([true, true, true, true]);
  const [aiTier, setAiTier] = useState<AiTier>('stacker');
  const [powerup, setPowerup] = useState(false);

  const [navFocus, setNavFocus] = useState<PracticeNavFocus>({
    kind: 'format',
    idx: 0,
  });

  const formatRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const opponentRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tierRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const p2pLinkRef = useRef<HTMLButtonElement | null>(null);
  const powerupRef = useRef<HTMLButtonElement | null>(null);

  const show1v1Opponent = format === 'solo';
  const showTeamControl = format === 'ffa';
  const allFourHuman = showTeamControl && slotHuman.every(Boolean);
  const panelKeyboardFocus = isActive && menuZone === 'panel';

  const hasPanelNavFocus = (
    kind: PracticeNavFocus['kind'],
    idx?: number
  ): boolean =>
    panelKeyboardFocus &&
    navFocus.kind === kind &&
    (idx === undefined || ('idx' in navFocus && navFocus.idx === idx));

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
      p1Human = true;
      p2Human = opponent !== 'ai';
      p3Human = false;
      p4Human = false;
      practiceMode = !p2Human;
    } else {
      p1Human = slotHuman[0]!;
      p2Human = slotHuman[1]!;
      p3Human = slotHuman[2]!;
      p4Human = slotHuman[3]!;
      practiceMode = !p1Human || !p2Human || !p3Human || !p4Human;
    }

    const parts: string[] = [
      'PRACTICE',
      format === 'ffa' ? 'FFA' : '1v1',
      'CVG',
    ];
    if (powerup) parts.push('PWR');

    const config: Record<string, unknown> = {
      mode: 'PRACTICE',
      practiceHudLabel: parts.join(' · '),
      teamMode: format as TeamMode,
      practiceMode,
      p1Human,
      p2Human,
      p3Human,
      p4Human,
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

    savePracticeGameConfig(config);
    navigate('/game');
  }, [playSfx, navigate, format, opponent, slotHuman, aiTier, powerup]);

  const focusDefault = useCallback(() => {
    setNavFocus({ kind: 'format', idx: 0 });
  }, []);

  const focusBeforeFooter = useCallback(() => {
    setNavFocus({ kind: 'rulePowerup' });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      startPractice: start,
      focusDefault,
      focusBeforeFooter,
    }),
    [start, focusDefault, focusBeforeFooter]
  );

  const activatePracticeNavFocus = useCallback(
    (f: PracticeNavFocus) => {
      switch (f.kind) {
        case 'format':
          setFormat((['solo', 'ffa'] as const)[f.idx]);
          playSfx(SFX.MENU_SELECT);
          break;
        case 'slot':
          toggleSlot(f.idx);
          break;
        case 'opponent':
          setOpponent(f.idx === 0 ? 'ai' : 'humans');
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
        case 'p2pLink':
          playSfx(SFX.MENU_CONFIRM);
          navigate('/p2p');
          break;
        case 'start':
          footerStartRef.current?.click();
          break;
        case 'back':
          footerBackRef.current?.click();
          break;
        default:
          break;
      }
    },
    [footerBackRef, footerStartRef, navigate, playSfx, toggleSlot]
  );

  useEffect(() => {
    setNavFocus((f) =>
      normalizePracticeNavFocus(
        f,
        showTeamControl,
        show1v1Opponent,
        opponent,
        allFourHuman
      )
    );
  }, [showTeamControl, show1v1Opponent, opponent, allFourHuman]);

  useEffect(() => {
    if (!isActive || menuZone !== 'panel') return;

    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active === footerBackRef.current ||
        active === footerStartRef.current
      ) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        navigateToMainMenu(navigate);
        return;
      }
      const isUp = e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
      const isDown = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
      const isLeft = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
      const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
      const isActivate = e.key === 'Enter' || e.key === ' ';
      const isTab = e.key === 'Tab' && !e.shiftKey;
      const isTabBack = e.key === 'Tab' && e.shiftKey;

      if (
        !isUp &&
        !isDown &&
        !isLeft &&
        !isRight &&
        !isActivate &&
        !isTab &&
        !isTabBack
      )
        return;
      if (e.repeat && isActivate) return;

      if (isTab) {
        e.preventDefault();
        setNavFocus((prev) =>
          advancePracticeHubFlatNav(
            prev,
            1,
            showTeamControl,
            show1v1Opponent,
            opponent,
            allFourHuman
          )
        );
        return;
      }
      if (isTabBack) {
        e.preventDefault();
        setNavFocus((prev) =>
          advancePracticeHubFlatNav(
            prev,
            -1,
            showTeamControl,
            show1v1Opponent,
            opponent,
            allFourHuman
          )
        );
        return;
      }
      if (isActivate) {
        e.preventDefault();
        activatePracticeNavFocus(navFocus);
        return;
      }

      if (isUp && navFocus.kind === 'format' && navFocus.idx === 0) {
        e.preventDefault();
        onExitToPlayStyle?.();
        return;
      }

      e.preventDefault();
      setNavFocus((prev) => {
        if (isDown && prev.kind === 'rulePowerup') {
          onEnterFooter?.('start');
          return prev;
        }
        const next = movePracticeHubNav(
          prev,
          isUp ? 'up' : isDown ? 'down' : isLeft ? 'left' : 'right',
          showTeamControl,
          show1v1Opponent,
          opponent,
          allFourHuman
        );
        return next;
      });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    activatePracticeNavFocus,
    allFourHuman,
    isActive,
    menuZone,
    navigate,
    navFocus,
    onEnterFooter,
    onExitToPlayStyle,
    opponent,
    playSfx,
    show1v1Opponent,
    showTeamControl,
    footerBackRef,
    footerStartRef,
  ]);

  useEffect(() => {
    if (!panelKeyboardFocus) return;
    if (navFocus.kind === 'format') {
      formatRefs.current[navFocus.idx]?.focus();
    } else if (navFocus.kind === 'slot') {
      slotRefs.current[navFocus.idx]?.focus();
    } else if (navFocus.kind === 'opponent') {
      opponentRefs.current[navFocus.idx]?.focus();
    } else if (navFocus.kind === 'tier') {
      tierRefs.current[navFocus.idx]?.focus();
    } else if (navFocus.kind === 'p2pLink') {
      p2pLinkRef.current?.focus();
    } else if (navFocus.kind === 'rulePowerup') {
      powerupRef.current?.focus();
    }
  }, [navFocus, panelKeyboardFocus]);

  return (
    <div
      className="practice-free-play-panel"
      role="group"
      aria-label="Free play setup"
    >
      <div className="practice-free-play-panel__body">
        <div className="local-setup-top-row">
          {/* ── FORMAT ──────────────────────────────────────────────────── */}
          <section
            className="practice-section local-format-section"
            aria-labelledby="lh-format"
          >
            <div className="ph-picker-block">
              <h3 id="lh-format" className="p2p-picker-group-label">
                FORMAT
              </h3>
              <div
                className="p2p-picker-row"
                role="radiogroup"
                aria-label="Match format"
              >
                {/* 1V1 — reuse duel card style + sword animation */}
                <button
                  ref={(el) => {
                    formatRefs.current[0] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={format === 'solo'}
                  tabIndex={hasPanelNavFocus('format', 0) ? 0 : -1}
                  className={[
                    'p2p-picker-card',
                    'p2p-picker-card--compact-inline',
                    'p2p-picker-card--duel',
                    format === 'solo' ? 'p2p-picker-card--selected' : '',
                    hasPanelNavFocus('format', 0)
                      ? 'practice-focus-target'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    setNavFocus({ kind: 'format', idx: 0 });
                    playSfx(SFX.MENU_SELECT);
                    setFormat('solo');
                  }}
                >
                  <svg
                    className="p2p-picker-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <g className="p2p-sword p2p-sword--1">
                      <path
                        d="M19 4L5 19"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                      <path
                        d="M13 7L17 10"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                    </g>
                    <g className="p2p-sword p2p-sword--2">
                      <path
                        d="M5 4L19 19"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                      <path
                        d="M7 10L11 7"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                    </g>
                  </svg>
                  <span className="p2p-picker-label">One vs One</span>
                  <span className="p2p-picker-sub">Head to head</span>
                </button>

                {/* FFA */}
                <button
                  ref={(el) => {
                    formatRefs.current[1] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={format === 'ffa'}
                  tabIndex={hasPanelNavFocus('format', 1) ? 0 : -1}
                  className={[
                    'p2p-picker-card',
                    'p2p-picker-card--compact-inline',
                    'p2p-picker-card--ffa',
                    format === 'ffa' ? 'p2p-picker-card--selected' : '',
                    hasPanelNavFocus('format', 1)
                      ? 'practice-focus-target'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    setNavFocus({ kind: 'format', idx: 1 });
                    playSfx(SFX.MENU_SELECT);
                    setFormat('ffa');
                  }}
                >
                  <svg
                    className="p2p-picker-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <g className="lh-ffa-icon">
                      <rect
                        x="2"
                        y="2"
                        width="7"
                        height="7"
                        stroke="currentColor"
                        strokeWidth="1"
                        fill="currentColor"
                        fillOpacity="0.12"
                      />
                      <rect
                        x="15"
                        y="2"
                        width="7"
                        height="7"
                        stroke="currentColor"
                        strokeWidth="1"
                        fill="currentColor"
                        fillOpacity="0.12"
                      />
                      <rect
                        x="2"
                        y="15"
                        width="7"
                        height="7"
                        stroke="currentColor"
                        strokeWidth="1"
                        fill="currentColor"
                        fillOpacity="0.12"
                      />
                      <rect
                        x="15"
                        y="15"
                        width="7"
                        height="7"
                        stroke="currentColor"
                        strokeWidth="1"
                        fill="currentColor"
                        fillOpacity="0.12"
                      />
                      <path
                        d="M9 5.5h6M18.5 9v6M15 18.5H9M5.5 15V9"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                    </g>
                  </svg>
                  <span className="p2p-picker-label">Free for All</span>
                  <span className="p2p-picker-sub">Four chains</span>
                </button>
              </div>
            </div>
          </section>

          {/* ── Mode config overlay (same grid cell — no height shift) ──── */}
          <div className="local-mode-config-area">
            {/* Solo / 1v1 section */}
            <section
              className={`practice-section${format !== 'solo' ? ' local-mode-inactive' : ''}`}
              aria-hidden={format !== 'solo'}
            >
              <div className="ph-picker-block local-mode-config-block">
                <h3 className="p2p-picker-group-label">OPPONENT</h3>
                <div
                  className="p2p-picker-row"
                  role="radiogroup"
                  aria-label="Opponent type"
                >
                  {/* AI */}
                  <button
                    ref={(el) => {
                      opponentRefs.current[0] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={opponent === 'ai'}
                    tabIndex={hasPanelNavFocus('opponent', 0) ? 0 : -1}
                    className={[
                      'p2p-picker-card',
                      'p2p-picker-card--compact-inline',
                      'p2p-picker-card--ai',
                      opponent === 'ai' ? 'p2p-picker-card--selected' : '',
                      hasPanelNavFocus('opponent', 0)
                        ? 'practice-focus-target'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      setNavFocus({ kind: 'opponent', idx: 0 });
                      playSfx(SFX.MENU_SELECT);
                      setOpponent('ai');
                    }}
                  >
                    <svg
                      className="p2p-picker-icon p2p-picker-icon--ai"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <rect
                        x="6"
                        y="8"
                        width="12"
                        height="10"
                        rx="1"
                        stroke="currentColor"
                        strokeWidth="1"
                        fill="currentColor"
                        fillOpacity="0.12"
                      />
                      <circle
                        cx="9.5"
                        cy="12"
                        r="1.5"
                        stroke="currentColor"
                        strokeWidth="1"
                        fill="currentColor"
                        fillOpacity="0.3"
                      />
                      <circle
                        cx="14.5"
                        cy="12"
                        r="1.5"
                        stroke="currentColor"
                        strokeWidth="1"
                        fill="currentColor"
                        fillOpacity="0.3"
                      />
                      <path
                        d="M9 18v2M15 18v2"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                      <path
                        d="M12 4v4"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                      <circle
                        cx="12"
                        cy="3.5"
                        r="1"
                        stroke="currentColor"
                        strokeWidth="1"
                      />
                      <path
                        d="M6 13H3M21 13h-3"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="p2p-picker-label">AI</span>
                    <span className="p2p-picker-sub">vs bot</span>
                  </button>

                  {/* HUMANS */}
                  <button
                    ref={(el) => {
                      opponentRefs.current[1] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={opponent === 'humans'}
                    tabIndex={hasPanelNavFocus('opponent', 1) ? 0 : -1}
                    className={[
                      'p2p-picker-card',
                      'p2p-picker-card--compact-inline',
                      'p2p-picker-card--humans',
                      opponent === 'humans' ? 'p2p-picker-card--selected' : '',
                      hasPanelNavFocus('opponent', 1)
                        ? 'practice-focus-target'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      setNavFocus({ kind: 'opponent', idx: 1 });
                      playSfx(SFX.MENU_SELECT);
                      setOpponent('humans');
                    }}
                  >
                    <svg
                      className="p2p-picker-icon p2p-picker-icon--people"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        cx="8"
                        cy="7"
                        r="2.5"
                        stroke="currentColor"
                        strokeWidth="1"
                        fill="currentColor"
                        fillOpacity="0.15"
                      />
                      <path
                        d="M3 18a5 4 0 0 1 10 0"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <circle
                        cx="16"
                        cy="7"
                        r="2.5"
                        stroke="currentColor"
                        strokeWidth="1"
                        fill="currentColor"
                        fillOpacity="0.15"
                      />
                      <path
                        d="M11 18a5 4 0 0 1 10 0"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                    <span className="p2p-picker-label">HUMAN</span>
                    <span className="p2p-picker-sub">Local play</span>
                  </button>
                </div>

                {opponent === 'humans' && (
                  <button
                    ref={p2pLinkRef}
                    type="button"
                    className={[
                      'button',
                      'local-human-p2p-link',
                      hasPanelNavFocus('p2pLink')
                        ? 'practice-focus-target'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    tabIndex={hasPanelNavFocus('p2pLink') ? 0 : -1}
                    onClick={() => {
                      playSfx(SFX.MENU_CONFIRM);
                      navigate('/p2p');
                    }}
                  >
                    Play for sats? Go to P2P
                  </button>
                )}

                {opponent === 'ai' && (
                  <>
                    <h3 className="p2p-picker-group-label">DIFFICULTY</h3>
                    <div
                      className="local-tier-grid"
                      role="radiogroup"
                      aria-label="AI difficulty"
                    >
                      {AI_TIER_PRESETS.map((p, i) => (
                        <button
                          key={p.id}
                          ref={(el) => {
                            tierRefs.current[i] = el;
                          }}
                          type="button"
                          role="radio"
                          aria-checked={aiTier === p.id}
                          data-tier={p.id}
                          tabIndex={hasPanelNavFocus('tier', i) ? 0 : -1}
                          className={[
                            'p2p-duel-format__card',
                            'local-tier-card',
                            aiTier === p.id
                              ? 'p2p-duel-format__card--active'
                              : '',
                            hasPanelNavFocus('tier', i)
                              ? 'practice-focus-target'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            setNavFocus({
                              kind: 'tier',
                              idx: i as 0 | 1 | 2 | 3,
                            });
                            playSfx(SFX.MENU_SELECT);
                            setAiTier(p.id);
                          }}
                        >
                          <span className="p2p-duel-format__label">
                            {p.name}
                          </span>
                          <div className="local-tier-pips" aria-hidden="true">
                            {Array.from({ length: 4 }, (_, j) => (
                              <span
                                key={j}
                                className={`local-tier-pip${j < p.rank ? ' local-tier-pip--filled' : ''}`}
                              />
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* FFA section */}
            <section
              className={`practice-section${format !== 'ffa' ? ' local-mode-inactive' : ''}`}
              aria-hidden={format !== 'ffa'}
            >
              <div className="ph-picker-block local-mode-config-block">
                <h3 className="p2p-picker-group-label">PLAYERS</h3>
                <div
                  className="practice-four-slot"
                  role="group"
                  aria-label="P1 through P4"
                >
                  {(['P1', 'P2', 'P3', 'P4'] as const).map((label, idx) => (
                    <button
                      key={label}
                      ref={(el) => {
                        slotRefs.current[idx] = el;
                      }}
                      type="button"
                      tabIndex={hasPanelNavFocus('slot', idx) ? 0 : -1}
                      className={`practice-slot-btn ${slotHuman[idx] ? 'human' : 'ai'}${hasPanelNavFocus('slot', idx) ? ' practice-focus-target' : ''}`}
                      onClick={() => {
                        setNavFocus({
                          kind: 'slot',
                          idx: idx as 0 | 1 | 2 | 3,
                        });
                        toggleSlot(idx);
                      }}
                    >
                      <span className="practice-slot-id">{label}</span>
                      <span className="practice-slot-role">
                        {slotHuman[idx] ? 'HUMAN' : 'AI'}
                      </span>
                    </button>
                  ))}
                </div>

                {!allFourHuman && (
                  <>
                    <h3 className="p2p-picker-group-label">DIFFICULTY</h3>
                    <div
                      className="local-tier-grid"
                      role="radiogroup"
                      aria-label="AI difficulty"
                    >
                      {AI_TIER_PRESETS.map((p, i) => (
                        <button
                          key={p.id}
                          ref={(el) => {
                            tierRefs.current[i] = el;
                          }}
                          type="button"
                          role="radio"
                          aria-checked={aiTier === p.id}
                          data-tier={p.id}
                          tabIndex={hasPanelNavFocus('tier', i) ? 0 : -1}
                          className={[
                            'p2p-duel-format__card',
                            'local-tier-card',
                            aiTier === p.id
                              ? 'p2p-duel-format__card--active'
                              : '',
                            hasPanelNavFocus('tier', i)
                              ? 'practice-focus-target'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            setNavFocus({
                              kind: 'tier',
                              idx: i as 0 | 1 | 2 | 3,
                            });
                            playSfx(SFX.MENU_SELECT);
                            setAiTier(p.id);
                          }}
                        >
                          <span className="p2p-duel-format__label">
                            {p.name}
                          </span>
                          <div className="local-tier-pips" aria-hidden="true">
                            {Array.from({ length: 4 }, (_, j) => (
                              <span
                                key={j}
                                className={`local-tier-pip${j < p.rank ? ' local-tier-pip--filled' : ''}`}
                              />
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>

        <GameModifiersSection
          powerups={{
            enabled: powerup,
            focused: hasPanelNavFocus('rulePowerup'),
            buttonRef: powerupRef,
            onToggle: () => {
              setNavFocus({ kind: 'rulePowerup' });
              playSfx(SFX.MENU_SELECT);
              setPowerup((v) => !v);
            },
          }}
        />
      </div>
    </div>
  );
});
