import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import '@/components/ui/Button.css';
import './soloHub.css';

// ============================================================================
// Mode card definitions
// ============================================================================

interface ModeCard {
  id: string;
  name: string;
  tag: string;
  description: string;
  controls: string;
  accentClass: string;
  action: 'navigate' | 'start' | 'start-2p';
  route?: string;
  gameConfig?: Record<string, unknown>;
}

const MODES: ModeCard[] = [
  {
    id: 'sovereign',
    name: 'SOVEREIGN',
    tag: 'SOLO VS AI',
    description: 'Four AI tiers from Wanderer to SOVEREIGN. Ranked solo ladder — master yourself before you duel others.',
    controls: 'WASD · AI controls P2',
    accentClass: 'accent-sovereign',
    action: 'navigate',
    route: '/sovereign',
  },
  {
    id: 'overclock',
    name: 'OVERCLOCK',
    tag: '4 DIFFICULTY TIERS',
    description: 'Speed escalates until the floor. NOVICE (130→60ms) to SOVEREIGN (60→15ms). React or die.',
    controls: 'WASD vs ARROWS · configure before play',
    accentClass: 'accent-overclock',
    action: 'navigate',
    route: '/overclock',
  },
  {
    id: 'convergence',
    name: 'CONVERGENCE',
    tag: '4 DIFFICULTY TIERS',
    description: 'The arena shrinks. 51×25 → floor size. RECRUIT → SOVEREIGN — choose your opponent and pressure.',
    controls: 'WASD vs ARROWS · configure before play',
    accentClass: 'accent-convergence',
    action: 'navigate',
    route: '/convergence',
  },
  {
    id: 'powerup',
    name: 'POWER-UP ARENA',
    tag: 'SOLO · 2P LOCAL',
    description: 'SURGE · FREEZE · PHANTOM · ANCHOR · AMPLIFIER · DECOY. White chain boosts length, Black retains speed on reset.',
    controls: 'WASD vs ARROWS · SHIFT = special',
    accentClass: 'accent-powerup',
    action: 'start',
    gameConfig: {
      mode: 'POWERUP',
      p1Name: 'Player 1',
      p2Name: 'BigToshi 🌊',
      aiTier: 'hunter',
    },
  },
  {
    id: 'labyrinth',
    name: 'LABYRINTH',
    tag: '5 DIFFICULTY TIERS',
    description: 'Recursive backtracking maze — every run unique. Choose path width, density, and mutation speed. NOVICE → SOVEREIGN.',
    controls: 'WASD vs ARROWS · configure before play',
    accentClass: 'accent-labyrinth',
    action: 'navigate',
    route: '/labyrinth',
  },
  {
    id: 'gauntlet',
    name: 'GAUNTLET',
    tag: '10 LEVELS',
    description: '10 pre-built obstacle courses. Shadow Run · The Void · Sovereign Trial. Complete 7 to unlock Bounty Hunt.',
    controls: 'WASD · select level',
    accentClass: 'accent-gauntlet',
    action: 'navigate',
    route: '/gauntlet',
  },
];

// ============================================================================
// Component
// ============================================================================

export default function SoloHub() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();

  useGamepad(true);

  const startMode = useCallback(
    (card: ModeCard, forceAi = true) => {
      playSfx(SFX.MENU_CONFIRM);

      if (card.action === 'navigate' && card.route) {
        navigate(card.route);
        return;
      }

      const config = { ...(card.gameConfig ?? {}) };

      if (forceAi) {
        // Solo: P2 controlled by AI
        config.aiTier = config.aiTier ?? 'hunter';
        // Mark as practiceMode so arrow keys don't control P2
        config.practiceMode = true;
      } else {
        // 2P local: no AI, both keyboards active
        config.practiceMode = false;
        config.p2Name = 'Player 2';
        delete config.aiTier;
      }

      sessionStorage.setItem('gameConfig', JSON.stringify(config));
      navigate('/game');
    },
    [navigate, playSfx]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, playSfx]);

  return (
    <div className="solo-hub">
      <header className="solo-hub-header">
        <h2 className="solo-hub-title">SOLO MODES</h2>
        <p className="solo-hub-subtitle">INDIVIDUAL · SOVEREIGN · UNCHALLENGED</p>
      </header>

      <div className="solo-hub-grid">
        {MODES.map((card) => (
          <div key={card.id} className={`mode-card ${card.accentClass}`}>
            {card.id === 'gauntlet' && (
              <div className="gauntlet-violator" aria-hidden="true">
                <div className="gauntlet-violator-inner">
                  <div className="violator-top">WIN UP TO</div>
                  <div className="violator-amount">300K</div>
                  <div className="violator-unit">SATS</div>
                  <div className="violator-sub">⚡ NOSTR ZAP</div>
                </div>
              </div>
            )}
            <div className="mode-card-inner">
              <div className="mode-card-top">
                <span className="mode-tag">{card.tag}</span>
                <h3 className="mode-name condensed">{card.name}</h3>
                <p className="mode-description">{card.description}</p>
                <p className="mode-controls">{card.controls}</p>
              </div>

              <div className="mode-card-actions">
                {card.action === 'navigate' ? (
                  <button
                    className="mode-btn mode-btn-primary"
                    onClick={() => startMode(card, true)}
                  >
                    SELECT
                  </button>
                ) : (
                  <>
                    <button
                      className="mode-btn mode-btn-primary"
                      onClick={() => startMode(card, true)}
                      title="Solo — WASD to control, AI controls P2"
                    >
                      SOLO
                    </button>
                    <button
                      className="mode-btn mode-btn-secondary"
                      onClick={() => startMode(card, false)}
                      title="2P local — WASD + Arrow keys"
                    >
                      2P LOCAL
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="solo-hub-footer">
        <button
          className="solo-back-btn"
          onClick={() => {
            playSfx(SFX.MENU_SELECT);
            navigate('/');
          }}
        >
          ← MAIN MENU
        </button>
        <span className="solo-hub-hint">ESC to go back</span>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
