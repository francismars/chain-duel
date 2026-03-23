import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import '@/components/ui/Button.css';
import './strategySetup.css';

// ============================================================================
// Difficulty tiers
// ============================================================================

interface StrategyTier {
  id: string;
  rank: number;
  name: string;
  subtitle: string;
  description: string;
  aiTier: string;
  accentColor: string;
}

const TIERS: StrategyTier[] = [
  {
    id: 'apprentice',
    rank: 1,
    name: 'APPRENTICE',
    subtitle: 'Wanderer AI · Learns the board with you',
    description:
      'A meandering opponent that drifts without deliberate strategy. Use this tier to master the shift-slow mechanic, learn the map geometry, and find the portal routes before stepping up.',
    aiTier: 'wanderer',
    accentColor: 'rgba(80, 200, 130, 0.9)',
  },
  {
    id: 'tactician',
    rank: 2,
    name: 'TACTICIAN',
    subtitle: 'Tactician AI · Plans several moves ahead',
    description:
      'The Tactician predicts your trajectory and contests key coinbase locations. Holding Shift to slow and reposition is often the difference between capture and collision.',
    aiTier: 'tactician',
    accentColor: 'rgba(100, 180, 230, 0.9)',
  },
  {
    id: 'grandmaster',
    rank: 3,
    name: 'GRAND MASTER',
    subtitle: 'Sovereign AI · Full pathfinding, no mercy',
    description:
      'The Sovereign plays optimally — it will race portals, cut corridors, and punish any hesitation. Shift-slow is your only edge. Use it precisely.',
    aiTier: 'sovereign',
    accentColor: 'rgba(210, 175, 30, 0.95)',
  },
];

// ============================================================================
// Mechanic key badge
// ============================================================================

function KeyBadge({ label }: { label: string }) {
  return <kbd className="st-key-badge">{label}</kbd>;
}

// ============================================================================
// Component
// ============================================================================

export default function StrategySetup() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const [selected, setSelected] = useState(0);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useGamepad(true);

  useEffect(() => {
    rowRefs.current[selected]?.focus({ preventScroll: true });
  }, [selected]);

  const launch = useCallback(
    (tier: StrategyTier, vsAi: boolean) => {
      playSfx(SFX.MENU_CONFIRM);
      const config = {
        mode: 'STRATEGY',
        p1Name: 'Player 1',
        p2Name: vsAi ? 'Strategos ♟' : 'Player 2',
        practiceMode: vsAi,
        aiTier: vsAi ? tier.aiTier : undefined,
      };
      sessionStorage.setItem('gameConfig', JSON.stringify(config));
      navigate('/game');
    },
    [navigate, playSfx],
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
        setSelected((p) => Math.min(TIERS.length - 1, p + 1));
      } else if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        launch(TIERS[selected], true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        navigate('/solo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, launch, navigate, playSfx]);

  const tier = TIERS[selected];

  return (
    <div className="strategy-setup">
      <header className="st-header">
        <h2 className="st-title condensed">STRATEGY</h2>
        <p className="st-subtitle">TACTICAL ARENA · SHIFT TO THINK · CHAIN TO WIN</p>
      </header>

      <div className="st-body">

        {/* Left: tier selector */}
        <div className="st-list">
          {TIERS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => { rowRefs.current[i] = el; }}
              className={`st-tier-btn ${selected === i ? 'active' : ''}`}
              style={{ '--accent': t.accentColor } as React.CSSProperties}
              onClick={() => { playSfx(SFX.MENU_SELECT); setSelected(i); }}
              onDoubleClick={() => launch(t, true)}
            >
              <span className="st-rank condensed">{String(t.rank).padStart(2, '0')}</span>
              <span className="st-name condensed">{t.name}</span>
              <span className="st-sub">{t.subtitle}</span>
            </button>
          ))}

          {/* Shift mechanic explainer */}
          <div className="st-shift-card">
            <div className="st-shift-title">SHIFT TO SLOW</div>
            <div className="st-shift-controls">
              <div className="st-shift-row">
                <KeyBadge label="L⇧" />
                <span className="st-shift-label">P1 slow chain</span>
              </div>
              <div className="st-shift-row">
                <KeyBadge label="R⇧" />
                <span className="st-shift-label">P2 slow chain</span>
              </div>
            </div>
            <p className="st-shift-desc">
              Hold shift to decelerate to a stop. Release to re-accelerate. Opponents move at full speed while you think.
            </p>
          </div>
        </div>

        {/* Right: detail */}
        <div className="st-detail">

          {/* Map preview diagram — scaled to 99×49 board (viewBox 198×98) */}
          <div className="st-map-preview" aria-hidden="true">
            <svg className="st-map-svg" viewBox="0 0 198 98" preserveAspectRatio="xMidYMid meet">
              {/* Board border */}
              <rect x="0.5" y="0.5" width="197" height="97" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />

              {/* Central fortress — x:40–58 → sx:80–116, y:16–32 → sy:32–64, gaps 2 cells */}
              <rect x="80" y="32" width="36" height="32" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
              {/* Gap: top-center */}
              <rect x="96" y="31.5" width="5" height="1.5" fill="#0a0a0a" />
              {/* Gap: bottom-center */}
              <rect x="96" y="63" width="5" height="1.5" fill="#0a0a0a" />
              {/* Gap: left-mid */}
              <rect x="79.5" y="46" width="1.5" height="5" fill="#0a0a0a" />
              {/* Gap: right-mid */}
              <rect x="115" y="46" width="1.5" height="5" fill="#0a0a0a" />

              {/* Left barriers  y=10→20, y=38→76 */}
              <line x1="16" y1="20" x2="62" y2="20" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              <line x1="16" y1="76" x2="62" y2="76" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />

              {/* Right barriers */}
              <line x1="134" y1="20" x2="180" y2="20" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              <line x1="134" y1="76" x2="180" y2="76" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />

              {/* Mid pillars  x:22–28→44–56 */}
              <line x1="44" y1="36" x2="58" y2="36" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
              <line x1="44" y1="60" x2="58" y2="60" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
              <line x1="140" y1="36" x2="154" y2="36" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
              <line x1="140" y1="60" x2="154" y2="60" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

              {/* Center spines  x=49→98 */}
              <line x1="98" y1="4" x2="98" y2="24" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <line x1="98" y1="72" x2="98" y2="92" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

              {/* Corner pocket walls  x=8→16, y:18–25 */}
              <line x1="16" y1="36" x2="16" y2="52" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <line x1="182" y1="36" x2="182" y2="52" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

              {/* P1 spawn */}
              <circle cx="6" cy="48" r="3.5" fill="rgba(255,255,255,0.9)" />
              <line x1="6" y1="48" x2="14" y2="48" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <text x="3" y="59" fontSize="5" fill="rgba(255,255,255,0.45)" fontFamily="sans-serif">P1</text>

              {/* P2 spawn */}
              <circle cx="192" cy="48" r="3.5" fill="rgba(80,160,255,0.9)" />
              <line x1="184" y1="48" x2="192" y2="48" stroke="rgba(80,160,255,0.3)" strokeWidth="1.5" />
              <text x="183" y="59" fontSize="5" fill="rgba(80,160,255,0.45)" fontFamily="sans-serif">P2</text>

              {/* Coinbase dots — (49,24)→(98,48), corners */}
              {[[98,48],[26,12],[170,12],[26,84],[170,84]].map(([cx,cy], i) => (
                <circle key={i} cx={cx} cy={cy} r="2.5" fill="rgba(200,160,30,0.85)" />
              ))}

              {/* Portal hints */}
              <circle cx="30" cy="48" r="3" fill="none" stroke="rgba(160,100,255,0.6)" strokeWidth="0.8" />
              <circle cx="168" cy="48" r="3" fill="none" stroke="rgba(160,100,255,0.6)" strokeWidth="0.8" />

              <text x="4" y="93" fontSize="4.5" fill="rgba(255,255,255,0.18)" fontFamily="sans-serif">99 × 49 TACTICAL ARENA</text>
            </svg>
            <div className="st-map-legend">
              <span className="st-legend-item"><span className="st-legend-dot st-legend-coin" />coinbase</span>
              <span className="st-legend-item"><span className="st-legend-dot st-legend-portal" />portal</span>
              <span className="st-legend-item"><span className="st-legend-dot st-legend-wall" />walls</span>
            </div>
          </div>

          {/* Detail info */}
          <div className="st-detail-info">
            <h3 className="st-detail-name condensed" style={{ color: tier.accentColor }}>
              {tier.name}
            </h3>
            <p className="st-detail-desc">{tier.description}</p>

            <div className="st-features">
              <div className="st-feature">
                <span className="st-feature-icon">⚡</span>
                <span>Power-ups spawn throughout the match</span>
              </div>
              <div className="st-feature">
                <span className="st-feature-icon">◎</span>
                <span>3 portal pairs for fast repositioning</span>
              </div>
              <div className="st-feature">
                <span className="st-feature-icon">◈</span>
                <span>5 coinbases on the board</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="st-actions">
            <button
              className="st-btn st-btn-primary"
              style={{ '--accent': tier.accentColor } as React.CSSProperties}
              onClick={() => launch(tier, true)}
            >
              SOLO vs AI
            </button>
            <button
              className="st-btn st-btn-secondary"
              onClick={() => launch(tier, false)}
            >
              2P LOCAL
            </button>
          </div>

          <p className="st-hint">↑↓ to navigate · ENTER to start solo · ESC to go back</p>
        </div>
      </div>

      <footer className="st-footer">
        <button
          className="st-back-btn"
          onClick={() => { playSfx(SFX.MENU_SELECT); navigate('/solo'); }}
        >
          ← SOLO MODES
        </button>
      </footer>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
