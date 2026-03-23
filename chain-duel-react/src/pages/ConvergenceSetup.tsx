import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import '@/components/ui/Button.css';
import './convergenceSetup.css';

// ============================================================================
// Presets
// ============================================================================

interface ConvergencePreset {
  id: string;
  rank: number;
  name: string;
  subtitle: string;
  description: string;
  aiTier: string;
  shrinkIntervalTicks: number;   // ticks between shrinks
  stepMs: number;                // game tick speed
  minCols: number;               // arena floor width
  minRows: number;               // arena floor height
  accentColor: string;
  shrinkLabel: string;           // human-readable shrink speed
}

const BOARD_COLS = 51;
const BOARD_ROWS = 25;

const PRESETS: ConvergencePreset[] = [
  {
    id: 'recruit',
    rank: 1,
    name: 'RECRUIT',
    subtitle: 'Wanderer AI · slow shrink · 120ms',
    description:
      'The arena closes gently every 25 seconds. The Wanderer AI moves mostly at random. Plenty of time to think and position — ideal for learning Convergence.',
    aiTier: 'wanderer',
    shrinkIntervalTicks: 250,
    stepMs: 120,
    minCols: 17,
    minRows: 15,
    accentColor: 'rgba(80,200,130,0.9)',
    shrinkLabel: '~25s',
  },
  {
    id: 'soldier',
    rank: 2,
    name: 'SOLDIER',
    subtitle: 'Hunter AI · standard shrink · 100ms',
    description:
      'Standard rules — the arena collapses every 15 seconds down to an 11×11 floor. Hunter AI chases aggressively. The classic Convergence experience.',
    aiTier: 'hunter',
    shrinkIntervalTicks: 150,
    stepMs: 100,
    minCols: 11,
    minRows: 11,
    accentColor: 'rgba(100,180,230,0.9)',
    shrinkLabel: '~15s',
  },
  {
    id: 'commander',
    rank: 3,
    name: 'COMMANDER',
    subtitle: 'Tactician AI · fast shrink · 100ms',
    description:
      'The arena closes every 10 seconds down to a 9×9 pocket. Tactician AI plans several moves ahead and adapts to the shrinking zone.',
    aiTier: 'tactician',
    shrinkIntervalTicks: 100,
    stepMs: 100,
    minCols: 9,
    minRows: 9,
    accentColor: 'rgba(220,100,60,0.9)',
    shrinkLabel: '~10s',
  },
  {
    id: 'sovereign',
    rank: 4,
    name: 'SOVEREIGN',
    subtitle: 'Sovereign AI · lethal shrink · 40ms',
    description:
      'Walls close every second. Final cage is 7×7. Sovereign AI at 40ms — 2.5× standard speed. When the wall fully closes, the board resolves. No margin for error.',
    aiTier: 'sovereign',
    shrinkIntervalTicks: 25,
    stepMs: 40,
    minCols: 7,
    minRows: 7,
    accentColor: 'rgba(210,175,30,0.95)',
    shrinkLabel: '1s',
  },
];

// ============================================================================
// Arena preview — concentric rectangles showing shrink stages
// ============================================================================

interface ArenaPreviewProps {
  minCols: number;
  minRows: number;
  accentColor: string;
}

function ArenaPreview({ minCols, minRows, accentColor }: ArenaPreviewProps) {
  const stages = 4;
  const colStep = Math.floor((BOARD_COLS - minCols) / (2 * stages));
  const rowStep = Math.floor((BOARD_ROWS - minRows) / (2 * stages));

  // Build rectangles from outer to inner
  const rects = Array.from({ length: stages + 1 }, (_, i) => ({
    left:   i * colStep,
    top:    i * rowStep,
    right:  BOARD_COLS - 1 - i * colStep,
    bottom: BOARD_ROWS - 1 - i * rowStep,
    isFinal: i === stages,
  }));

  const W = BOARD_COLS;
  const H = BOARD_ROWS;

  return (
    <div className="arena-preview" aria-hidden="true">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="arena-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background */}
        <rect x={0} y={0} width={W} height={H} fill="rgba(0,0,0,0.4)" />
        {/* Shrink stage rings (outer → inner) */}
        {rects.map((r, i) => (
          <rect
            key={i}
            x={r.left + 0.5}
            y={r.top + 0.5}
            width={r.right - r.left}
            height={r.bottom - r.top}
            fill="none"
            stroke={r.isFinal ? accentColor : `rgba(255,255,255,${0.08 + i * 0.06})`}
            strokeWidth={r.isFinal ? 1.2 : 0.6}
          />
        ))}
        {/* Floor label */}
        <text
          x={W / 2}
          y={H / 2 + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="3.5"
          fill={accentColor}
          fontFamily="monospace"
          opacity="0.8"
        >
          {minCols}×{minRows}
        </text>
      </svg>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export default function ConvergenceSetup() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const [selected, setSelected] = useState(1); // default: SOLDIER
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useGamepad(true);

  useEffect(() => {
    rowRefs.current[selected]?.focus({ preventScroll: true });
  }, [selected]);

  const launch = useCallback(
    (preset: ConvergencePreset, vsAi: boolean) => {
      playSfx(SFX.MENU_CONFIRM);
      const config = {
        mode: 'CONVERGENCE',
        p1Name: 'Player 1',
        p2Name: vsAi ? 'BigToshi 🌊' : 'Player 2',
        practiceMode: vsAi,
        aiTier: vsAi ? preset.aiTier : undefined,
        convergenceShrinkInterval: preset.shrinkIntervalTicks,
        convergenceMinCols: preset.minCols,
        convergenceMinRows: preset.minRows,
        convergenceStepMs: preset.stepMs,
      };
      sessionStorage.setItem('gameConfig', JSON.stringify(config));
      navigate('/game');
    },
    [navigate, playSfx]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        setSelected((p) => Math.max(0, p - 1));
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        setSelected((p) => Math.min(PRESETS.length - 1, p + 1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (e.repeat) return;
        e.preventDefault();
        launch(PRESETS[selected], true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        navigate('/solo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, launch, navigate, playSfx]);

  const preset = PRESETS[selected];

  return (
    <div className="convergence-setup">

      <header className="cs-header">
        <h2 className="cs-title condensed">CONVERGENCE</h2>
        <p className="cs-subtitle">SHRINKING ARENA · CHOOSE YOUR OPPONENT</p>
      </header>

      <div className="cs-body">

        {/* Left: tier list */}
        <div className="cs-list">
          {PRESETS.map((p, i) => (
            <button
              key={p.id}
              ref={(el) => { rowRefs.current[i] = el; }}
              className={`cs-tier-btn ${selected === i ? 'active' : ''}`}
              style={{ '--accent': p.accentColor } as React.CSSProperties}
              onClick={() => { playSfx(SFX.MENU_SELECT); setSelected(i); }}
              onDoubleClick={() => launch(p, true)}
            >
              <span className="cs-rank condensed">{String(p.rank).padStart(2, '0')}</span>
              <span className="cs-name condensed">{p.name}</span>
              <span className="cs-sub">{p.subtitle}</span>
            </button>
          ))}
        </div>

        {/* Right: detail */}
        <div className="cs-detail">
          <div className="cs-detail-top">

            <ArenaPreview
              minCols={preset.minCols}
              minRows={preset.minRows}
              accentColor={preset.accentColor}
            />

            <div className="cs-detail-info">
              <h3
                className="cs-detail-name condensed"
                style={{ color: preset.accentColor }}
              >
                {preset.name}
              </h3>
              <p className="cs-detail-desc">{preset.description}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="cs-stats">
            <div className="cs-stat">
              <div className="cs-stat-label">OPPONENT</div>
              <div className="cs-stat-val condensed">{preset.aiTier.toUpperCase()}</div>
            </div>
            <div className="cs-stat">
              <div className="cs-stat-label">SHRINK EVERY</div>
              <div className="cs-stat-val condensed">{preset.shrinkLabel}</div>
            </div>
            <div className="cs-stat">
              <div className="cs-stat-label">FLOOR SIZE</div>
              <div className="cs-stat-val condensed">{preset.minCols}×{preset.minRows}</div>
            </div>
            <div className="cs-stat">
              <div className="cs-stat-label">SPEED</div>
              <div className="cs-stat-val condensed">{preset.stepMs}ms</div>
            </div>
            <div className="cs-stat">
              <div className="cs-stat-label">START SIZE</div>
              <div className="cs-stat-val condensed">51×25</div>
            </div>
          </div>

          {/* Shrink pressure bar */}
          <div className="cs-pressure-bar">
            <span className="cs-bar-label">RELAXED</span>
            <div className="cs-bar-track">
              <div
                className="cs-bar-fill"
                style={{
                  width: `${((4 - preset.rank + 1) / 4) * 100}%`,
                  background: preset.accentColor,
                  left: `${((preset.rank - 1) / 4) * 100}%`,
                }}
              />
              <div
                className="cs-bar-marker"
                style={{
                  left: `${((preset.rank - 1) / 4) * 100}%`,
                  background: preset.accentColor,
                }}
              />
            </div>
            <span className="cs-bar-label">LETHAL</span>
          </div>

          {/* Actions */}
          <div className="cs-actions">
            <button
              className="cs-btn cs-btn-primary"
              style={{ '--accent': preset.accentColor } as React.CSSProperties}
              onClick={() => launch(preset, true)}
            >
              SOLO
            </button>
            <button
              className="cs-btn cs-btn-secondary"
              onClick={() => launch(preset, false)}
            >
              2P LOCAL
            </button>
          </div>

          <p className="cs-hint">↑↓ to navigate · ENTER to start solo · ESC to go back</p>
        </div>
      </div>

      <footer className="cs-footer">
        <button
          className="cs-back-btn"
          onClick={() => { playSfx(SFX.MENU_SELECT); navigate('/solo'); }}
        >
          ← SOLO MODES
        </button>
      </footer>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
