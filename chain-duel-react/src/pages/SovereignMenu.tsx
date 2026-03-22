import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { Button } from '@/components/ui/Button';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import type { AiTier } from '@/game/engine/types';
import '@/components/ui/Button.css';
import './sovereignMenu.css';

interface TierInfo {
  tier: AiTier;
  name: string;
  subtitle: string;
  description: string;
  glowClass: string;
  bestKey: string;
}

const TIERS: TierInfo[] = [
  {
    tier: 'wanderer',
    name: 'WANDERER',
    subtitle: 'Random movement',
    description: 'Your opponent wanders aimlessly. Barely avoids walls. Perfect for first-timers learning the mechanics.',
    glowClass: 'tier-wanderer',
    bestKey: 'sovereign_best_wanderer',
  },
  {
    tier: 'hunter',
    name: 'HUNTER',
    subtitle: 'A* pathfinding',
    description: 'Efficient. Direct. Always chasing the nearest coinbase. Known in the streets as BigToshi.',
    glowClass: 'tier-hunter',
    bestKey: 'sovereign_best_hunter',
  },
  {
    tier: 'tactician',
    name: 'TACTICIAN',
    subtitle: 'Threat modeling',
    description: 'Hunts coinbases and anticipates your position. Will cut off your angles. Hard to outmaneuver.',
    glowClass: 'tier-tactician',
    bestKey: 'sovereign_best_tactician',
  },
  {
    tier: 'sovereign',
    name: 'SOVEREIGN',
    subtitle: 'Full lookahead',
    description: 'Territory control. Power-up awareness. Predicts your movements. Only the best humans survive.',
    glowClass: 'tier-sovereign',
    bestKey: 'sovereign_best_sovereign',
  },
];

type FormatMode = 'solo' | 'teams' | 'ffa';

interface FormatOption {
  id: FormatMode;
  label: string;
  tag: string;
  description: string;
  chains: Array<{ color: string; label: string; border?: string }>;
}

const FORMATS: FormatOption[] = [
  {
    id: 'solo',
    label: '1v1 DUEL',
    tag: 'CLASSIC',
    description: 'You against one AI. Pure 1v1 skill. The original ranked solo ladder.',
    chains: [
      { color: '#ffffff', label: 'YOU' },
      { color: '#222222', label: 'AI' },
    ],
  },
  {
    id: 'teams',
    label: '2v2 TEAMS',
    tag: 'TEAM PLAY',
    description: 'White team vs Black team. Your AI ally cooperates — targets different coinbases. Two enemies coordinate against you.',
    chains: [
      { color: '#ffffff', label: 'YOU',  border: '#FF3333' },
      { color: '#ffffff', label: 'ALLY', border: '#3366FF' },
      { color: '#3a3a3a', label: 'FOE',  border: '#FF3333' },
      { color: '#3a3a3a', label: 'FOE',  border: '#3366FF' },
    ],
  },
  {
    id: 'ffa',
    label: '4-WAY FFA',
    tag: 'FREE FOR ALL',
    description: 'Every chain for themselves. Three AI opponents in shades of grey. Highest score wins.',
    chains: [
      { color: '#ffffff', label: 'YOU' },
      { color: '#555555', label: 'GREY' },
      { color: '#777777', label: 'GHOST' },
      { color: '#aaaaaa', label: 'SPECTER' },
    ],
  },
];

type MenuSlot = 0 | 1 | 2 | 3;

export default function SovereignMenu() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const [format, setFormat] = useState<FormatMode>('solo');
  const [selected, setSelected] = useState<MenuSlot>(1);
  const [bests, setBests] = useState<Record<AiTier, number | null>>({
    wanderer: null,
    hunter: null,
    tactician: null,
    sovereign: null,
  });

  useGamepad(true);

  useEffect(() => {
    const loaded: Record<AiTier, number | null> = {
      wanderer: null,
      hunter: null,
      tactician: null,
      sovereign: null,
    };
    for (const t of TIERS) {
      const stored = localStorage.getItem(t.bestKey);
      if (stored) loaded[t.tier] = Number(stored);
    }
    setBests(loaded);
  }, []);

  const startGame = useCallback((tier: AiTier) => {
    playSfx(SFX.MENU_CONFIRM);
    sessionStorage.setItem('gameConfig', JSON.stringify({
      mode: 'SOVEREIGN',
      aiTier: tier,
      p1Name: 'Player 1',
      p2Name: tierAiName(tier),
      teamMode: format,
    }));
    navigate('/game');
  }, [navigate, playSfx, format]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        setSelected((prev) => (prev === 0 ? 3 : (prev - 1) as MenuSlot));
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        setSelected((prev) => (prev === 3 ? 0 : (prev + 1) as MenuSlot));
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.repeat) return;
        e.preventDefault();
        startGame(TIERS[selected].tier);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        navigate('/solo');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected, startGame, navigate, playSfx]);

  const activeTier   = TIERS[selected];
  const activeFormat = FORMATS.find((f) => f.id === format)!;

  return (
    <div className="sovereign-menu flex full flex-center">
      <header className="sovereign-header">
        <h2 className="sovereign-title">SOVEREIGN MODE</h2>
        <p className="sovereign-subtitle">MASTER YOURSELF BEFORE YOU DUEL OTHERS</p>
      </header>

      {/* ── Format selector ─────────────────────────────────────────────── */}
      <div className="sovereign-format-bar">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            className={`sov-format-btn ${format === f.id ? 'active' : ''}`}
            onClick={() => { playSfx(SFX.MENU_SELECT); setFormat(f.id); }}
          >
            <span className="sov-format-tag">{f.tag}</span>
            <span className="sov-format-label">{f.label}</span>
            <div className="sov-format-chains">
              {f.chains.map((c, i) => (
                <span
                  key={i}
                  className="sov-chain-dot"
                  style={{
                    background: c.color,
                    boxShadow: c.border
                      ? `0 0 0 1.5px ${c.border}`
                      : `0 0 4px ${c.color}`,
                    outline: c.border ? `1.5px solid ${c.border}` : undefined,
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* Format description */}
      <p className="sov-format-desc">{activeFormat.description}</p>

      {/* ── Tier list + detail ───────────────────────────────────────────── */}
      <div className="sovereign-content">
        <div className="sovereign-tier-list">
          {TIERS.map((t, i) => {
            const best = bests[t.tier];
            return (
              <div
                key={t.tier}
                className={`sovereign-tier-row ${selected === i ? 'selected' : ''} ${t.glowClass}`}
                onClick={() => {
                  playSfx(SFX.MENU_SELECT);
                  setSelected(i as MenuSlot);
                }}
                onDoubleClick={() => startGame(t.tier)}
              >
                <div className="tier-row-inner">
                  <div className="tier-name condensed">{t.name}</div>
                  <div className="tier-subtitle">{t.subtitle}</div>
                  {best !== null && (
                    <div className="tier-best">BEST: {best.toLocaleString()} sats</div>
                  )}
                </div>
                <div className={`tier-indicator ${selected === i ? 'active' : ''}`} />
              </div>
            );
          })}
        </div>

        <div className="sovereign-detail">
          <div className={`detail-badge ${activeTier.glowClass}`}>
            <span className="detail-tier-name condensed">{activeTier.name}</span>
          </div>
          <p className="detail-description">{activeTier.description}</p>

          {/* Team layout preview */}
          <div className="sov-team-preview">
            {activeFormat.chains.map((c, i) => (
              <div key={i} className="sov-team-row">
                <span
                  className="sov-team-dot"
                  style={{
                    background: c.color,
                    boxShadow: c.border ? `0 0 0 2px ${c.border}` : `0 0 6px ${c.color}`,
                    outline: c.border ? `2px solid ${c.border}` : undefined,
                  }}
                />
                <span className="sov-team-name" style={{ color: c.color === '#ffffff' ? '#ffffff' : '#aaaaaa' }}>
                  {c.label}
                  {c.label === 'YOU' && ' ← YOU'}
                </span>
              </div>
            ))}
          </div>

          <div className="sovereign-actions">
            <Button
              className={`sovereign-start ${activeTier.glowClass}`}
              onClick={() => startGame(activeTier.tier)}
            >
              START {format === 'solo' ? '1v1' : format === 'teams' ? '2v2' : 'FFA'}
            </Button>
            <Button
              className="sovereign-back"
              onClick={() => {
                playSfx(SFX.MENU_SELECT);
                navigate('/solo');
              }}
            >
              ← SOLO MODES
            </Button>
          </div>
        </div>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}

function tierAiName(tier: AiTier): string {
  switch (tier) {
    case 'wanderer': return 'The Wanderer';
    case 'hunter': return 'BigToshi 🌊';
    case 'tactician': return 'The Tactician';
    case 'sovereign': return 'SOVEREIGN ◈';
  }
}
