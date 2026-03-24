import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from 'react';
import { useNavigate } from 'react-router-dom';
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
import '@/styles/pages/local-hub.css';
import {
  advanceLocalHubFlatNav,
  moveLocalHubNav,
  normalizeLocalNavFocus,
  type LocalNavFocus,
} from '@/pages/localHubNav';

// ── Convergence: fixed Soldier preset (local hub / engine) ──────────────────

/** ~20 shrink steps on 51×25 → 11×11; duration scales with LOCAL_HUB_CONVERGENCE_SHRINK_INTERVAL_TICKS. */
const LOCAL_SHRINK_STEPS_TO_MIN_EST = 20;

const CONVERGENCE_SOLDIER = {
  shrinkIntervalTicks: LOCAL_HUB_CONVERGENCE_SHRINK_INTERVAL_TICKS,
  stepMs: 100,
  minCols: CONVERGENCE_MIN_COLS,
  minRows: CONVERGENCE_MIN_ROWS,
} as const;

const LOCAL_SEC_BETWEEN_SHRINKS =
  (CONVERGENCE_SOLDIER.shrinkIntervalTicks * CONVERGENCE_SOLDIER.stepMs) / 1000;
const LOCAL_EST_MATCH_MIN =
  (LOCAL_SHRINK_STEPS_TO_MIN_EST *
    CONVERGENCE_SOLDIER.shrinkIntervalTicks *
    CONVERGENCE_SOLDIER.stepMs) /
  60_000;

/** Bot tiers — order = easiest → hardest (matches Convergence list UX) */
const AI_TIER_PRESETS: Array<{
  id: AiTier;
  rank: number;
  name: string;
  subtitle: string;
  accentColor: string;
  blurb: string;
}> = [
  {
    id: 'wanderer',
    rank: 1,
    name: 'WANDERER',
    subtitle: 'Random drift · soft targets',
    accentColor: 'rgba(200, 200, 200, 0.95)',
    blurb: 'Barely chases you — good for learning movement.',
  },
  {
    id: 'hunter',
    rank: 2,
    name: 'HUNTER',
    subtitle: 'A* chase · coinbase focus',
    accentColor: 'rgba(220, 160, 50, 0.95)',
    blurb: 'Aggressive pathing toward coinbases and you.',
  },
  {
    id: 'tactician',
    rank: 3,
    name: 'TACTICIAN',
    subtitle: 'Reads threats · cuts angles',
    accentColor: 'rgba(190, 195, 230, 0.95)',
    blurb: 'Anticipates your lines and contests space.',
  },
  {
    id: 'sovereign',
    rank: 4,
    name: 'SOVEREIGN',
    subtitle: 'Full lookahead · no mercy',
    accentColor: 'rgba(230, 195, 40, 1)',
    blurb: 'Territory, tempo, and punishes mistakes.',
  },
];

function tierIndexOf(id: AiTier): number {
  const i = AI_TIER_PRESETS.findIndex((p) => p.id === id);
  return i >= 0 ? i : 1;
}

function BotTierPicker({
  value,
  onChange,
  playSfx,
  focusTierIndex,
  tierButtonRefs,
  onTierNavFocus,
}: {
  value: AiTier;
  onChange: (t: AiTier) => void;
  playSfx: (src: string) => void;
  /** Keyboard/gamepad highlight index 0..3 */
  focusTierIndex?: number | null;
  tierButtonRefs?: MutableRefObject<(HTMLButtonElement | null)[]>;
  onTierNavFocus?: (idx: number) => void;
}) {
  const idx = tierIndexOf(value);
  const preset = AI_TIER_PRESETS[idx]!;

  const go = useCallback(
    (nextIdx: number) => {
      const clamped = Math.max(
        0,
        Math.min(AI_TIER_PRESETS.length - 1, nextIdx)
      );
      if (clamped === idx) return;
      playSfx(SFX.MENU_SELECT);
      onChange(AI_TIER_PRESETS[clamped]!.id);
    },
    [idx, onChange, playSfx]
  );

  const n = AI_TIER_PRESETS.length;
  const barLeft = ((preset.rank - 1) / n) * 100;
  const barWidth = ((n - preset.rank + 1) / n) * 100;

  return (
    <div className="tn-tier-picker" role="group" aria-label="Bot difficulty">
      <div className="tn-tier-detail">
        <h4
          className="tn-tier-detail-name condensed"
          style={{ color: preset.accentColor }}
        >
          {preset.name}
        </h4>
        <p className="tn-tier-detail-desc">{preset.blurb}</p>
        <div className="tn-tier-pressure">
          <span className="tn-tier-pressure-label">RELAXED</span>
          <div className="tn-tier-track">
            <div
              className="tn-tier-fill"
              style={
                {
                  width: `${barWidth}%`,
                  left: `${barLeft}%`,
                  background: preset.accentColor,
                } as CSSProperties
              }
            />
            <div
              className="tn-tier-marker"
              style={
                {
                  left: `${barLeft}%`,
                  background: preset.accentColor,
                } as CSSProperties
              }
            />
          </div>
          <span className="tn-tier-pressure-label">LETHAL</span>
        </div>
      </div>

      <div className="tn-tier-picks" role="listbox" aria-label="Choose tier">
        {AI_TIER_PRESETS.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              if (tierButtonRefs) {
                tierButtonRefs.current[i] = el;
              }
            }}
            type="button"
            role="option"
            aria-selected={i === idx}
            tabIndex={focusTierIndex === i ? 0 : -1}
            className={`tn-tier-pick ${i === idx ? 'active' : ''}${focusTierIndex === i ? ' practice-focus-target' : ''}`}
            style={{ '--accent': p.accentColor } as CSSProperties}
            onClick={() => {
              onTierNavFocus?.(i);
              go(i);
            }}
          >
            <span className="tn-tier-pick-rank condensed">
              {String(p.rank).padStart(2, '0')}
            </span>
            <span className="tn-tier-pick-name condensed">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type MatchFormat = 'solo' | 'ffa';
type OpponentChoice = 'humans' | 'ai';

function buildHudLabel(format: MatchFormat, powerup: boolean): string {
  const parts: string[] = ['LOCAL'];
  if (format === 'ffa') parts.push('FFA');
  else parts.push('1v1');
  parts.push('CVG');
  if (powerup) parts.push('PWR');
  return parts.join(' · ');
}

export default function LocalHub() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  useGamepad(true);

  const [format, setFormat] = useState<MatchFormat>('solo');
  const [opponent, setOpponent] = useState<OpponentChoice>('humans');
  /** P1–P4 human vs AI (FFA). Default all human. */
  const [slotHuman, setSlotHuman] = useState([true, true, true, true]);
  const [aiTier, setAiTier] = useState<AiTier>('hunter');
  const [powerup, setPowerup] = useState(false);

  const [navFocus, setNavFocus] = useState<LocalNavFocus>({
    kind: 'format',
    idx: 0,
  });
  const formatRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const opponentRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tierRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const powerupRef = useRef<HTMLInputElement | null>(null);
  const startRef = useRef<HTMLButtonElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);

  const summaryLine = useMemo(
    () => buildHudLabel(format, powerup),
    [format, powerup]
  );

  const show1v1Opponent = format === 'solo';
  const showTeamControl = format === 'ffa';
  const allFourHuman = showTeamControl && slotHuman.every(Boolean);

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

    let p1Human: boolean;
    let p2Human: boolean;
    let p3Human: boolean;
    let p4Human: boolean;
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

    const config: Record<string, unknown> = {
      mode: 'LOCAL',
      localHudLabel: summaryLine,
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

    if (format === 'ffa') {
      config.ffaAiTier = aiTier;
    }

    sessionStorage.setItem('gameConfig', JSON.stringify(config));
    navigate('/game');
  }, [
    playSfx,
    navigate,
    format,
    opponent,
    slotHuman,
    aiTier,
    powerup,
    summaryLine,
  ]);

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
      normalizeLocalNavFocus(
        f,
        showTeamControl,
        show1v1Opponent,
        opponent,
        allFourHuman
      )
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
      ) {
        return;
      }

      if (e.repeat && isActivate) return;

      if (isTab) {
        e.preventDefault();
        setNavFocus((prev) =>
          advanceLocalHubFlatNav(
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
          advanceLocalHubFlatNav(
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
        activateLocalNavFocus(navFocus);
        return;
      }

      e.preventDefault();
      setNavFocus((prev) =>
        moveLocalHubNav(
          prev,
          isUp ? 'up' : isDown ? 'down' : isLeft ? 'left' : 'right',
          showTeamControl,
          show1v1Opponent,
          opponent,
          allFourHuman
        )
      );
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    activateLocalNavFocus,
    allFourHuman,
    navigate,
    navFocus,
    opponent,
    playSfx,
    show1v1Opponent,
    showTeamControl,
  ]);

  useEffect(() => {
    if (navFocus.kind === 'format') {
      formatRefs.current[navFocus.idx]?.focus();
    } else if (navFocus.kind === 'slot') {
      slotRefs.current[navFocus.idx]?.focus();
    } else if (navFocus.kind === 'opponent') {
      opponentRefs.current[navFocus.idx]?.focus();
    } else if (navFocus.kind === 'tier') {
      tierRefs.current[navFocus.idx]?.focus();
    } else if (navFocus.kind === 'rulePowerup') {
      powerupRef.current?.focus();
    } else if (navFocus.kind === 'start') {
      startRef.current?.focus();
    } else if (navFocus.kind === 'back') {
      backRef.current?.focus();
    }
  }, [navFocus]);

  const tierFocusIdx = navFocus.kind === 'tier' ? navFocus.idx : null;

  return (
    <div className="practice-hub practice-hub--practice local-hub-page">
      <header className="practice-hub-header">
        <h2 className="practice-hub-title">LOCAL</h2>
        <p className="practice-hub-subtitle">
          LOCAL · FREE
        </p>
        <p className="practice-hub-lede">
          Demo play — short, timed sessions. Pick 1v1 or four-way FFA; the board
          shrinks until someone wins on score. Power-ups optional below.
        </p>
      </header>

      <div className="practice-panel" role="main" aria-label="Local practice setup">
        <section className="practice-section" aria-labelledby="tn-format">
          <h3 id="tn-format" className="practice-section-title">
            Match format
          </h3>
          <p className="practice-section-hint">
            1v1 duel, or FFA with four human/AI slots and bot tier for AI.
          </p>
          <div
            className="practice-seg practice-seg--two"
            role="group"
            aria-label="Match format"
          >
            <button
              ref={(el) => {
                formatRefs.current[0] = el;
              }}
              type="button"
              tabIndex={navFocus.kind === 'format' && navFocus.idx === 0 ? 0 : -1}
              className={`practice-seg-btn ${format === 'solo' ? 'active' : ''}${navFocus.kind === 'format' && navFocus.idx === 0 ? ' practice-focus-target' : ''}`}
              onClick={() => {
                setNavFocus({ kind: 'format', idx: 0 });
                playSfx(SFX.MENU_SELECT);
                setFormat('solo');
              }}
            >
              <span className="practice-seg-label">1v1 duel</span>
              <span className="practice-seg-desc">White vs black</span>
            </button>
            <button
              ref={(el) => {
                formatRefs.current[1] = el;
              }}
              type="button"
              tabIndex={navFocus.kind === 'format' && navFocus.idx === 1 ? 0 : -1}
              className={`practice-seg-btn ${format === 'ffa' ? 'active' : ''}${navFocus.kind === 'format' && navFocus.idx === 1 ? ' practice-focus-target' : ''}`}
              onClick={() => {
                setNavFocus({ kind: 'format', idx: 1 });
                playSfx(SFX.MENU_SELECT);
                setFormat('ffa');
              }}
            >
              <span className="practice-seg-label">4-way FFA</span>
              <span className="practice-seg-desc">Four chains</span>
            </button>
          </div>
        </section>

        {showTeamControl ? (
          <section className="practice-section" aria-labelledby="tn-four">
            <h3 id="tn-four" className="practice-section-title">
              Four chains — human or AI
            </h3>
            <p className="practice-section-hint">
              Flip Human/AI per slot. WASD · arrows · IJKL · TFGH.
              {!allFourHuman && <> Bot tier below applies to every AI.</>}
            </p>
            <div className="practice-four-slot" role="group" aria-label="P1 through P4">
              {(['P1', 'P2', 'P3', 'P4'] as const).map((label, idx) => (
                <button
                  key={label}
                  ref={(el) => {
                    slotRefs.current[idx] = el;
                  }}
                  type="button"
                  tabIndex={
                    navFocus.kind === 'slot' && navFocus.idx === idx ? 0 : -1
                  }
                  className={`practice-slot-btn ${slotHuman[idx] ? 'human' : 'ai'}${navFocus.kind === 'slot' && navFocus.idx === idx ? ' practice-focus-target' : ''}`}
                  onClick={() => {
                    setNavFocus({ kind: 'slot', idx: idx as 0 | 1 | 2 | 3 });
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
          </section>
        ) : null}

        {(!showTeamControl || !allFourHuman) && (
          <section className="practice-section" aria-labelledby="tn-opp">
            <h3 id="tn-opp" className="practice-section-title">
              {show1v1Opponent ? 'Black chain' : 'Bot strength'}
            </h3>
            {show1v1Opponent ? (
              <>
                <p className="practice-section-hint">
                  P1 WASD / pad 1 · P2 arrows / pad 2. Vs AI: you play white only.
                </p>
                <div className="practice-seg practice-seg--two" role="group" aria-label="Black chain">
                  <button
                    ref={(el) => {
                      opponentRefs.current[0] = el;
                    }}
                    type="button"
                    tabIndex={
                      navFocus.kind === 'opponent' && navFocus.idx === 0 ? 0 : -1
                    }
                    className={`practice-seg-btn ${opponent === 'humans' ? 'active' : ''}${navFocus.kind === 'opponent' && navFocus.idx === 0 ? ' practice-focus-target' : ''}`}
                    onClick={() => {
                      setNavFocus({ kind: 'opponent', idx: 0 });
                      playSfx(SFX.MENU_SELECT);
                      setOpponent('humans');
                    }}
                  >
                    <span className="practice-seg-label">Two humans</span>
                    <span className="practice-seg-desc">Free practice</span>
                  </button>
                  <button
                    ref={(el) => {
                      opponentRefs.current[1] = el;
                    }}
                    type="button"
                    tabIndex={
                      navFocus.kind === 'opponent' && navFocus.idx === 1 ? 0 : -1
                    }
                    className={`practice-seg-btn ${opponent === 'ai' ? 'active' : ''}${navFocus.kind === 'opponent' && navFocus.idx === 1 ? ' practice-focus-target' : ''}`}
                    onClick={() => {
                      setNavFocus({ kind: 'opponent', idx: 1 });
                      playSfx(SFX.MENU_SELECT);
                      setOpponent('ai');
                    }}
                  >
                    <span className="practice-seg-label">Vs AI</span>
                    <span className="practice-seg-desc">Solo vs bot</span>
                  </button>
                </div>
                {opponent === 'ai' && (
                  <>
                    <span className="practice-field-label">Bot tier</span>
                    <BotTierPicker
                      value={aiTier}
                      onChange={setAiTier}
                      playSfx={playSfx}
                      focusTierIndex={tierFocusIdx}
                      tierButtonRefs={tierRefs}
                      onTierNavFocus={(i) =>
                        setNavFocus({ kind: 'tier', idx: i as 0 | 1 | 2 | 3 })
                      }
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <p className="practice-section-hint">Shared bot tier for all AI chains.</p>
                <>
                  <span className="practice-field-label">Bot tier</span>
                  <BotTierPicker
                    value={aiTier}
                    onChange={setAiTier}
                    playSfx={playSfx}
                    focusTierIndex={tierFocusIdx}
                    tierButtonRefs={tierRefs}
                    onTierNavFocus={(i) =>
                      setNavFocus({ kind: 'tier', idx: i as 0 | 1 | 2 | 3 })
                    }
                  />
                </>
              </>
            )}
          </section>
        )}

        <section className="practice-section" aria-labelledby="tn-rules">
          <h3 id="tn-rules" className="practice-section-title">
            Arena rules
          </h3>
          <p className="practice-section-hint">
            <strong>Convergence</strong> on — border steps ~every{' '}
            {LOCAL_SEC_BETWEEN_SHRINKS.toFixed(0)}s (~{LOCAL_EST_MATCH_MIN.toFixed(0)}{' '}
            min to min size). Ends on score (ties → P1) or sooner at 0 points.
          </p>

          <label
            className={`practice-toggle${navFocus.kind === 'rulePowerup' ? ' practice-focus-target' : ''}`}
            onClick={() => setNavFocus({ kind: 'rulePowerup' })}
          >
            <input
              ref={powerupRef}
              type="checkbox"
              tabIndex={navFocus.kind === 'rulePowerup' ? 0 : -1}
              checked={powerup}
              onChange={() => {
                playSfx(SFX.MENU_SELECT);
                setPowerup((v) => !v);
              }}
            />
            <span className="practice-toggle-ui" />
            <span>
              <strong>Power-up arena</strong> — SHIFT chain abilities (Surge,
              Freeze, Phantom…)
            </span>
          </label>
        </section>

        <div className="practice-summary" aria-live="polite">
          <span className="practice-summary-label">Session</span>
          <code className="practice-summary-code">{summaryLine}</code>
        </div>

        <div className="practice-actions">
          <button
            ref={startRef}
            type="button"
            tabIndex={navFocus.kind === 'start' ? 0 : -1}
            className={`practice-start${navFocus.kind === 'start' ? ' practice-focus-target' : ''}`}
            onClick={() => {
              setNavFocus({ kind: 'start' });
              start();
            }}
          >
            Start practice
          </button>
        </div>
      </div>

      <div className="practice-hub-footer">
        <button
          ref={backRef}
          type="button"
          tabIndex={navFocus.kind === 'back' ? 0 : -1}
          className={`practice-back-btn${navFocus.kind === 'back' ? ' practice-focus-target' : ''}`}
          onClick={() => {
            setNavFocus({ kind: 'back' });
            playSfx(SFX.MENU_SELECT);
            navigate('/');
          }}
        >
          ← MAIN MENU
        </button>
        <span className="practice-hub-hint">
          Arrows / WASD · Enter · Tab · ESC back
        </span>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
