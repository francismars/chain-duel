import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import '@/components/ui/Button.css';
import './labyrinthSetup.css';

// ============================================================================
// Difficulty presets
// ============================================================================

interface LabyrinthPreset {
  id: string;
  rank: number;
  name: string;
  subtitle: string;
  description: string;
  // Maze shape
  corridorWidth: 1 | 2 | 4 | 5;
  labyrinthSections?: 1 | 3;
  labyrinthTeleports?: boolean;
  loopFactor: number;
  cornerFactor: number;
  // Temporal
  regenInterval: number;
  stepMs: number;
  // AI
  aiTier: string;
  // Visual
  accentColor: string;
  pathWidthLabel: string;
  densityLabel: string;
  pathFill: number;
}

const PRESETS: LabyrinthPreset[] = [
  {
    id: 'novice',
    rank: 1,
    name: 'NOVICE',
    subtitle: '2-wide paths · closed walls · static',
    description:
      'Corridors are 2 cells wide with solid, clean walls throughout. No shortcuts — every passage is exactly what it looks like. Perfect for learning the maze.',
    corridorWidth: 2,
    loopFactor: 0,
    cornerFactor: 0,
    regenInterval: 0,
    stepMs: 130,
    aiTier: 'wanderer',
    accentColor: 'rgba(80,200,130,0.9)',
    pathWidthLabel: '2-CELL WIDE',
    densityLabel: 'OPEN',
    pathFill: 0.82,
  },
  {
    id: 'apprentice',
    rank: 2,
    name: 'APPRENTICE',
    subtitle: '2-wide paths · mutates ~55s',
    description:
      'Same roomy 2-cell corridors with clean walls. Maze slowly mutates every 55 seconds — memorized routes will shift beneath your chain.',
    corridorWidth: 2,
    loopFactor: 0,
    cornerFactor: 0,
    regenInterval: 550,
    stepMs: 110,
    aiTier: 'hunter',
    accentColor: 'rgba(100,180,230,0.9)',
    pathWidthLabel: '2-CELL WIDE',
    densityLabel: 'CLEAN',
    pathFill: 0.72,
  },
  {
    id: 'adept',
    rank: 3,
    name: 'ADEPT',
    subtitle: '1-wide paths · perfect maze · mutates ~45s',
    description:
      'Back to narrow 1-cell corridors and a true perfect maze — exactly one route between any two points. Regenerates every 45 seconds.',
    corridorWidth: 1,
    loopFactor: 0,
    cornerFactor: 0,
    regenInterval: 450,
    stepMs: 100,
    aiTier: 'hunter',
    accentColor: 'rgba(220,190,60,0.9)',
    pathWidthLabel: '1-CELL WIDE',
    densityLabel: 'WINDING',
    pathFill: 0.35,
  },
  {
    id: 'master',
    rank: 4,
    name: 'MASTER',
    subtitle: '1-wide · mutates ~35s · Tactician AI',
    description:
      'Narrow perfect maze that shifts every 35 seconds. Tactician AI uses full pathfinding to exploit every route change. Plan further ahead.',
    corridorWidth: 1,
    loopFactor: 0,
    cornerFactor: 0,
    regenInterval: 350,
    stepMs: 100,
    aiTier: 'tactician',
    accentColor: 'rgba(220,100,60,0.9)',
    pathWidthLabel: '1-CELL WIDE',
    densityLabel: 'DENSE',
    pathFill: 0.18,
  },
  {
    id: 'sovereign',
    rank: 5,
    name: 'SOVEREIGN',
    subtitle: '1-wide · mutates ~15s · 80ms · Sovereign AI',
    description:
      'Maximum density. Perfect maze. Rapid mutation every 15 seconds. 80ms tick speed. Sovereign AI. No shortcuts. No room for error.',
    corridorWidth: 1,
    loopFactor: 0,
    cornerFactor: 0,
    regenInterval: 150,
    stepMs: 80,
    aiTier: 'sovereign',
    accentColor: 'rgba(210,175,30,0.95)',
    pathWidthLabel: '1-CELL WIDE',
    densityLabel: 'PERFECT',
    pathFill: 0.06,
  },
  {
    id: 'quad',
    rank: 6,
    name: 'QUAD-WIDE',
    subtitle: '4-cell wide · static · open arena',
    description:
      '4-cell corridors give you plenty of room to manoeuvre, but only 10 × 4 maze units on the whole board — fewer junctions means fewer choices. A radically different spatial feel.',
    corridorWidth: 4,
    loopFactor: 0,
    cornerFactor: 0,
    regenInterval: 600,
    stepMs: 110,
    aiTier: 'hunter',
    accentColor: 'rgba(160,110,230,0.9)',
    pathWidthLabel: '4-CELL WIDE',
    densityLabel: 'SPARSE',
    pathFill: 0.92,
  },
  {
    id: 'portal',
    rank: 8,
    name: 'PORTAL',
    subtitle: '1-wide · 2 teleport pairs · mutates ~40s',
    description:
      'Narrow perfect maze with 2 pairs of teleport portals scattered across the board. Step through a portal and instantly warp to its partner — use them to ambush or escape.',
    corridorWidth: 1,
    labyrinthTeleports: true,
    loopFactor: 0,
    cornerFactor: 0,
    regenInterval: 400,
    stepMs: 100,
    aiTier: 'tactician',
    accentColor: 'rgba(0,210,255,0.95)',
    pathWidthLabel: '1-CELL WIDE',
    densityLabel: 'PORTAL',
    pathFill: 0.3,
  },
  {
    id: 'highway',
    rank: 9,
    name: 'HIGHWAY',
    subtitle: '5-cell wide · 8×4 units · slow regen',
    description:
      'Massive 5-cell corridors with razor-thin 1-cell walls. Only 8×4 maze units fill the board — very few junctions, but each one is a dramatic wide-open crossroads.',
    corridorWidth: 5,
    labyrinthTeleports: true,
    loopFactor: 0,
    cornerFactor: 0,
    regenInterval: 700,
    stepMs: 115,
    aiTier: 'wanderer',
    accentColor: 'rgba(190,100,255,0.9)',
    pathWidthLabel: '5-CELL WIDE',
    densityLabel: 'FREEWAY + PORTALS',
    pathFill: 0.96,
  },
  {
    id: 'triple',
    rank: 10,
    name: '3-LABYRINTH',
    subtitle: '3 stacked mazes · connected shafts · Tactician',
    description:
      'The board is divided into three independent narrow mazes stacked vertically, linked by 2–3 connector shafts each. Navigate all three zones to corner your opponent.',
    corridorWidth: 1,
    labyrinthSections: 3,
    loopFactor: 0,
    cornerFactor: 0,
    regenInterval: 400,
    stepMs: 100,
    aiTier: 'tactician',
    accentColor: 'rgba(60,200,180,0.9)',
    pathWidthLabel: '1-CELL WIDE',
    densityLabel: 'TRIZONE',
    pathFill: 0.35,
  },
];

// ============================================================================
// Miniature maze preview (static visual — no real generation)
// ============================================================================

interface MazePreviewProps {
  pathFill: number;
  corridorWidth: 1 | 2 | 4 | 5;
  labyrinthSections?: 1 | 3;
  labyrinthTeleports?: boolean;
}

function MazePreview({ pathFill, corridorWidth, labyrinthSections, labyrinthTeleports }: MazePreviewProps) {
  // ── 3-section preview ──
  if (labyrinthSections === 3) {
    const COLS = 13;
    const cells = Array.from({ length: 13 }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        if (c === 0 || c === COLS - 1) return 'wall';
        if (r === 4 || r === 8) {
          // separator rows with 2 connector shafts
          return c === 3 || c === 9 ? 'open' : 'wall';
        }
        // 3 sections: 0–3, 5–7, 9–12
        const inSection = r < 4 || (r > 4 && r < 8) || r > 8;
        if (!inSection) return 'wall';
        if (c % 2 === 1 && r % 2 === 1) return 'cell';
        const h = ((c * 17 + r * 31) % 97) / 97;
        return h < 0.35 ? 'open' : 'wall';
      })
    );
    return (
      <div className="maze-preview maze-preview--triple" aria-hidden="true">
        {cells.map((row, r) => (
          <div key={r} className="maze-preview-row">
            {row.map((type, c) => (
              <div key={c} className={`maze-cell maze-cell--${type}`} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ── 5-cell wide (period-6) preview ──
  if (corridorWidth === 5) {
    const COLS = 13;
    const ROWS = 13;
    const P = 6;
    const openGaps = new Set(['6,2','6,3','6,4','6,5', '2,6','3,6','4,6','5,6', '6,7','6,8','6,9','6,10', '7,6','8,6','9,6','10,6']);
    const cells = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        if (openGaps.has(`${c},${r}`)) return 'open';
        const inMazeX = c >= 1 && c <= COLS - 2 && c % P !== 0;
        const inMazeY = r >= 1 && r <= ROWS - 2 && r % P !== 0;
        if (inMazeX && inMazeY) return 'cell';
        return 'wall';
      })
    );
    return (
      <div className="maze-preview maze-preview--penta" aria-hidden="true">
        {cells.map((row, r) => (
          <div key={r} className="maze-preview-row">
            {row.map((type, c) => (
              <div key={c} className={`maze-cell maze-cell--${type}`} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ── 4-cell wide (period-5) preview ──
  if (corridorWidth === 4) {
    const COLS = 11;
    const ROWS = 11;
    // Walls at c%5===0 or r%5===0; cells elsewhere inside [1..9]×[1..9]
    // Hard-code one horizontal and one vertical passage
    const openGaps = new Set(['5,2', '5,3', '5,4', '2,5', '3,5', '4,5', '6,5', '7,5', '8,5', '5,6', '5,7', '5,8']);
    const cells = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        if (openGaps.has(`${c},${r}`)) return 'open';
        const inMazeX = c >= 1 && c <= 9 && c % 5 !== 0;
        const inMazeY = r >= 1 && r <= 9 && r % 5 !== 0;
        if (inMazeX && inMazeY) return 'cell';
        return 'wall';
      })
    );
    return (
      <div className="maze-preview maze-preview--quad" aria-hidden="true">
        {cells.map((row, r) => (
          <div key={r} className="maze-preview-row">
            {row.map((type, c) => (
              <div key={c} className={`maze-cell maze-cell--${type}`} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ── period-3 (2-cell wide) preview ──
  if (corridorWidth === 2) {
    // Period-3 preview: cells are 2-wide with 1-wide walls between them
    // Use a 13-col × 7-row grid: cells at (c-1)%3<2 and (r-1)%3<2, c>=1, r>=1
    const COLS = 13;
    const ROWS = 7;
    // Hard-code a simple wide-corridor perfect maze for illustration
    // Open gaps: [col,row] pairs
    const openGaps = new Set([
      '3,1','3,2', '6,1','6,2', '9,1','9,2',
      '1,3','2,3', '4,3','5,3', '7,3','8,3', '10,3','11,3',
      '3,4','3,5', '6,4','6,5', '9,4','9,5',
    ]);
    const cells = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        if (c === 0 || c >= 12 || r === 0) return 'wall';
        const isCell = (c - 1) % 3 < 2 && (r - 1) % 3 < 2 && c <= 11 && r <= 6;
        if (isCell) return 'cell';
        if (openGaps.has(`${c},${r}`)) return 'open';
        return 'wall';
      })
    );
    return (
      <div className="maze-preview maze-preview--wide" aria-hidden="true">
        {cells.map((row, r) => (
          <div key={r} className="maze-preview-row">
            {row.map((type, c) => (
              <div key={c} className={`maze-cell maze-cell--${type}`} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Period-2 (narrow) preview — optionally shows portal markers
  const COLS = 13;
  const ROWS = 7;
  // Portal pair positions for visual hint
  const portalPairs: [number, number][][] = labyrinthTeleports
    ? [[[3, 1], [9, 5]], [[1, 5], [11, 1]]]
    : [];
  const portalSet = new Set(portalPairs.flatMap((pair) => pair.map(([c, r]) => `${c},${r}`)));
  const cells = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      if (c === 0 || c === COLS - 1 || r === 0 || r === ROWS - 1) return 'wall';
      if (portalSet.has(`${c},${r}`)) return 'portal';
      if (c % 2 === 1 && r % 2 === 1) return 'cell';
      const h = ((c * 17 + r * 31) % 97) / 97;
      return h < pathFill ? 'open' : 'wall';
    })
  );
  return (
    <div className="maze-preview" aria-hidden="true">
      {cells.map((row, r) => (
        <div key={r} className="maze-preview-row">
          {row.map((type, c) => {
            const pIdx = portalPairs.findIndex((pair) => pair.some(([pc, pr]) => pc === c && pr === r));
            return (
              <div
                key={c}
                className={`maze-cell maze-cell--${type}`}
                style={type === 'portal' ? { background: pIdx === 0 ? 'rgba(0,210,255,0.85)' : 'rgba(255,30,200,0.85)', borderRadius: '50%' } : undefined}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export default function LabyrinthSetup() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const [selected, setSelected] = useState(2); // default: ADEPT
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useGamepad(true);

  useEffect(() => {
    rowRefs.current[selected]?.focus({ preventScroll: true });
  }, [selected]);

  const launch = useCallback(
    (preset: LabyrinthPreset, vsAi: boolean) => {
      playSfx(SFX.MENU_CONFIRM);
      const config = {
        mode: 'LABYRINTH',
        p1Name: 'Player 1',
        p2Name: vsAi ? 'BigToshi 🌊' : 'Player 2',
        practiceMode: vsAi,
        aiTier: vsAi ? preset.aiTier : undefined,
        labyrinthCorridorWidth: preset.corridorWidth,
        labyrinthSections: preset.labyrinthSections ?? 1,
        labyrinthTeleports: preset.labyrinthTeleports ?? false,
        labyrinthLoopFactor: preset.loopFactor,
        labyrinthCornerFactor: preset.cornerFactor,
        labyrinthRegenInterval: preset.regenInterval,
        labyrinthStepMs: preset.stepMs,
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
    <div className="labyrinth-setup">

      {/* ── Header ── */}
      <header className="ls-header">
        <h2 className="ls-title condensed">LABYRINTH</h2>
        <p className="ls-subtitle">RECURSIVE BACKTRACKING · EVERY MAZE IS UNIQUE</p>
      </header>

      {/* ── Body ── */}
      <div className="ls-body">

        {/* Left: difficulty list */}
        <div className="ls-list">
          {PRESETS.map((p, i) => (
            <button
              key={p.id}
              ref={(el) => { rowRefs.current[i] = el; }}
              className={`ls-tier-btn ${selected === i ? 'active' : ''}`}
              style={{ '--accent': p.accentColor } as React.CSSProperties}
              onClick={() => {
                playSfx(SFX.MENU_SELECT);
                setSelected(i);
              }}
              onDoubleClick={() => launch(p, true)}
            >
              <span className="ls-tier-rank condensed">{String(p.rank).padStart(2, '0')}</span>
              <span className="ls-tier-name condensed">{p.name}</span>
              <span className="ls-tier-sub">{p.subtitle}</span>
            </button>
          ))}
        </div>

        {/* Right: detail panel */}
        <div className="ls-detail">
          <div className="ls-detail-top">
            <MazePreview pathFill={preset.pathFill} corridorWidth={preset.corridorWidth} labyrinthSections={preset.labyrinthSections} labyrinthTeleports={preset.labyrinthTeleports} />

            <div className="ls-detail-info">
              <h3
                className="ls-detail-name condensed"
                style={{ color: preset.accentColor }}
              >
                {preset.name}
              </h3>
              <p className="ls-detail-desc">{preset.description}</p>
            </div>
          </div>

          {/* Stats row */}
          <div className="ls-stats">
            <div className="ls-stat">
              <div className="ls-stat-label">PATH WIDTH</div>
              <div className="ls-stat-val condensed">{preset.pathWidthLabel}</div>
            </div>
            <div className="ls-stat">
              <div className="ls-stat-label">DENSITY</div>
              <div className="ls-stat-val condensed">{preset.densityLabel}</div>
            </div>
            <div className="ls-stat">
              <div className="ls-stat-label">MUTATION</div>
              <div className="ls-stat-val condensed">
                {preset.regenInterval === 0
                  ? 'STATIC'
                  : `~${Math.round((preset.regenInterval * preset.stepMs) / 1000)}s`}
              </div>
            </div>
            <div className="ls-stat">
              <div className="ls-stat-label">SPEED</div>
              <div className="ls-stat-val condensed">{preset.stepMs}ms</div>
            </div>
            <div className="ls-stat">
              <div className="ls-stat-label">OPPONENT</div>
              <div className="ls-stat-val condensed">{preset.aiTier.toUpperCase()}</div>
            </div>
          </div>

          {/* Density bar */}
          <div className="ls-density-bar">
            <span className="ls-bar-label">OPEN</span>
            <div className="ls-bar-track">
              <div
                className="ls-bar-fill"
                style={{
                  width: `${(1 - preset.pathFill) * 100}%`,
                  background: preset.accentColor,
                }}
              />
            </div>
            <span className="ls-bar-label">DENSE</span>
          </div>

          {/* Actions */}
          <div className="ls-actions">
            <button
              className="ls-btn ls-btn-primary"
              style={{ '--accent': preset.accentColor } as React.CSSProperties}
              onClick={() => launch(preset, true)}
            >
              SOLO
            </button>
            <button
              className="ls-btn ls-btn-secondary"
              onClick={() => launch(preset, false)}
            >
              2P LOCAL
            </button>
          </div>

          <p className="ls-hint">↑↓ to navigate · ENTER to start solo · ESC to go back</p>
        </div>
      </div>

      <footer className="ls-footer">
        <button
          className="ls-back-btn"
          onClick={() => { playSfx(SFX.MENU_SELECT); navigate('/solo'); }}
        >
          ← SOLO MODES
        </button>
      </footer>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
