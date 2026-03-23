import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { Button } from '@/components/ui/Button';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import { GAUNTLET_LEVELS } from '@/game/engine/gauntletLevels';
import '@/components/ui/Button.css';
import './gauntletMenu.css';

const SOVEREIGN_RANK_KEY = 'sovereign_rank_earned';
const GAUNTLET_CLEAR_KEY = 'gauntlet_cleared_levels';

function getCleared(): Set<number> {
  try {
    const raw = localStorage.getItem(GAUNTLET_CLEAR_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

export function markGauntletLevelCleared(levelId: number): void {
  const cleared = getCleared();
  cleared.add(levelId);
  localStorage.setItem(GAUNTLET_CLEAR_KEY, JSON.stringify([...cleared]));
  if (cleared.size >= 13) {
    localStorage.setItem(SOVEREIGN_RANK_KEY, 'true');
  }
}

export function hasSovereignRank(): boolean {
  return localStorage.getItem(SOVEREIGN_RANK_KEY) === 'true';
}

export function unlockAllLevels(): void {
  const allIds = Array.from({ length: 13 }, (_, i) => i + 1);
  localStorage.setItem(GAUNTLET_CLEAR_KEY, JSON.stringify(allIds));
  localStorage.setItem(SOVEREIGN_RANK_KEY, 'true');
}

export default function GauntletMenu() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const [selected, setSelected] = useState(0);
  const [cleared, setCleared] = useState<Set<number>>(new Set());
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [sovereignRank, setSovereignRank] = useState(false);

  useGamepad(true);

  useEffect(() => {
    const c = getCleared();
    setCleared(c);
    setSovereignRank(localStorage.getItem(SOVEREIGN_RANK_KEY) === 'true');
  }, []);

  useEffect(() => {
    rowRefs.current[selected]?.focus({ preventScroll: true });
    rowRefs.current[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const isUnlocked = useCallback((levelId: number): boolean => {
    if (levelId === 1) return true;
    return cleared.has(levelId - 1);
  }, [cleared]);

  const handleUnlockAll = useCallback(() => {
    unlockAllLevels();
    const allIds = new Set(Array.from({ length: 13 }, (_, i) => i + 1));
    setCleared(allIds);
    setSovereignRank(true);
    playSfx(SFX.MENU_CONFIRM);
  }, [playSfx]);

  const startLevel = useCallback((levelId: number) => {
    if (!isUnlocked(levelId)) {
      playSfx(SFX.MENU_SELECT);
      return;
    }
    playSfx(SFX.MENU_CONFIRM);
    sessionStorage.setItem('gameConfig', JSON.stringify({
      mode: 'GAUNTLET',
      gauntletLevel: levelId,
      p1Name: 'Player 1',
      p2Name: [5, 10, 11, 12, 13].includes(levelId) ? 'The Machine' : '',
    }));
    navigate('/game');
  }, [isUnlocked, navigate, playSfx]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If focus is on an interactive element (button, a, input…), let the
      // browser fire its native click so the action buttons stay accessible.
      const focused = document.activeElement;
      const isOnControl = focused instanceof HTMLButtonElement
        || focused instanceof HTMLAnchorElement
        || focused instanceof HTMLInputElement;

      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        setSelected((prev) => Math.max(0, prev - 1));
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        setSelected((prev) => Math.min(GAUNTLET_LEVELS.length - 1, prev + 1));
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.repeat) return;
        // Yield to the focused button so Enter/Space trigger its onClick
        if (isOnControl) return;
        e.preventDefault();
        startLevel(GAUNTLET_LEVELS[selected].id);
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
  }, [selected, startLevel, navigate, playSfx]);

  const activeLevel = GAUNTLET_LEVELS[selected];
  const isActiveUnlocked = isUnlocked(activeLevel.id);

  return (
    <div className="gauntlet-menu flex full flex-center">
      <header className="gauntlet-header">
        <h2 className="gauntlet-title">GAUNTLET</h2>
        <p className="gauntlet-subtitle">13 LEVELS · PROVE YOUR SOVEREIGNTY</p>
        {sovereignRank && (
          <div className="sovereign-badge">◈ SOVEREIGN RANK EARNED</div>
        )}
      </header>

      <div className="gauntlet-content">
        <div className="gauntlet-level-list">
          {GAUNTLET_LEVELS.map((level, i) => {
            const unlocked = isUnlocked(level.id);
            const done = cleared.has(level.id);
            return (
              <div
                key={level.id}
                ref={(el) => { rowRefs.current[i] = el; }}
                tabIndex={0}
                className={[
                  'gauntlet-level-row',
                  selected === i ? 'selected' : '',
                  done ? 'cleared' : '',
                  !unlocked ? 'locked' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  playSfx(SFX.MENU_SELECT);
                  setSelected(i);
                }}
                onDoubleClick={() => startLevel(level.id)}
              >
                <span className="level-number condensed">{String(level.id).padStart(2, '0')}</span>
                <span className="level-name condensed">{level.name}</span>
                <span className="level-prize condensed">
                  ⚡{level.prizeNormal.toLocaleString()}
                  <span className="level-prize-unit"> sats</span>
                </span>
                <span className="level-status">
                  {done ? '✓' : !unlocked ? '🔒' : ''}
                </span>
              </div>
            );
          })}
        </div>

        <div className="gauntlet-detail">
          <div className="gauntlet-level-badge">
            <span className="badge-number condensed">{String(activeLevel.id).padStart(2, '0')}</span>
            <span className="badge-name condensed">{activeLevel.name}</span>
          </div>

          <p className="gauntlet-description">{activeLevel.description}</p>

          {/* Prize card */}
          <div className="gauntlet-prize-card">
            <div className="prize-card-row">
              <div className="prize-tier prize-tier--lightning">
                <div className="prize-tier-label">⚡ LIGHTNING</div>
                <div className="prize-tier-amount condensed">
                  {activeLevel.prizeNormal.toLocaleString()}
                </div>
                <div className="prize-tier-unit">SATS</div>
              </div>
              <div className="prize-card-divider" />
              <div className="prize-tier prize-tier--nostr">
                <div className="prize-tier-label">◆ NOSTR ZAP</div>
                <div className="prize-tier-amount condensed">
                  {activeLevel.prizeNostr.toLocaleString()}
                </div>
                <div className="prize-tier-unit">SATS · 2×</div>
              </div>
            </div>
            <div className="prize-card-hint">Pay with zap to double your winnings</div>
          </div>

          <div className="gauntlet-stats">
            <div className="stat">
              <div className="stat-label">PAR TIME</div>
              <div className="stat-value condensed">{activeLevel.parTimeSecs}s</div>
            </div>
            <div className="stat">
              <div className="stat-label">CHALLENGE</div>
              <div className="stat-value-sm">{activeLevel.challengeCondition}</div>
            </div>
            <div className="stat" style={{ visibility: activeLevel.modifiers.length > 0 ? 'visible' : 'hidden' }}>
              <div className="stat-label">MODIFIERS</div>
              <div className="gauntlet-modifiers">
                {activeLevel.modifiers.map((m) => (
                  <span key={m} className="modifier-tag">{modifierLabel(m)}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="gauntlet-actions">
            {isActiveUnlocked ? (
              <Button
                className="gauntlet-start"
                onClick={() => startLevel(activeLevel.id)}
              >
                START LEVEL
              </Button>
            ) : (
              <div className="gauntlet-locked-msg">
                Complete level {activeLevel.id - 1} to unlock
              </div>
            )}
            <Button
              className="gauntlet-back"
              onClick={() => {
                playSfx(SFX.MENU_SELECT);
                navigate('/solo');
              }}
            >
              ← SOLO MODES
            </Button>
            {cleared.size < 13 && (
              <button
                className="gauntlet-unlock-all"
                onClick={handleUnlockAll}
                title="Dev: unlock all levels"
              >
                UNLOCK ALL
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="gauntlet-prize-banner">
        <div className="gpb-section gpb-section--lightning">
          <div className="gpb-label">⚡ PRIZE POOL</div>
          <p className="gpb-text">
            Every level pays out in sats the moment you clear it — no buy-in, no entry fee.
            Prizes scale from <strong>500 sats</strong> on Level 1 up to{' '}
            <strong>150,000 sats</strong> on the final Quantum Maze.
            Clear all 13 to earn <strong>Sovereign Rank</strong> and unlock Bounty Hunt.
          </p>
        </div>
        <div className="gpb-divider" />
        <div className="gpb-section gpb-section--nostr">
          <div className="gpb-label">◆ NOSTR ZAP BONUS</div>
          <p className="gpb-text">
            Play with <strong>Nostr mode</strong> and pay your entry via zap to unlock a{' '}
            <strong>2× multiplier</strong> on every payout. Share your cleared level on Nostr
            and your zapped post boosts your pool weight — the community funds the prize.
            Level 13 pays up to <strong>300,000 sats</strong> via Nostr.
          </p>
        </div>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}

function modifierLabel(mod: string): string {
  const labels: Record<string, string> = {
    ai_opponent: 'AI',
    speed_60: 'FAST',
    shrinking_border: 'SHRINK',
    invisible_grid: 'DARK',
    void_cells: 'VOID',
    reward_only: 'REWARD ONLY',
    multiple_coinbases: 'MULTI',
    portals: 'PORTALS',
    moving_walls: 'MOVING',
    layers_3d: '3D LAYERS',
  };
  return labels[mod] ?? mod.toUpperCase();
}
