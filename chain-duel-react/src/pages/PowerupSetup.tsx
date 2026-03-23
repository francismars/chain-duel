import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import { SurgeSvg, FreezeSvg, PhantomSvg, AnchorSvg, AmplifierSvg, DecoySvg, ForkSvg } from '@/components/ui/PowerUpIcons';
import '@/components/ui/Button.css';
import './powerupSetup.css';

// ============================================================================
// Types
// ============================================================================

type PowerUpType = 'SURGE' | 'FREEZE' | 'PHANTOM' | 'ANCHOR' | 'AMPLIFIER' | 'DECOY' | 'FORK';
type LoadoutPreset = 'all' | 'duelist' | 'stealth' | 'arsenal' | 'custom';
type AiTier = 'wanderer' | 'hunter' | 'tactician' | 'sovereign';

// ============================================================================
// Config data
// ============================================================================

interface EmissionPreset {
  id: string;
  name: string;
  subtitle: string;
  cooldown: number;  // ticks between spawns
  maxItems: number;  // max concurrent power-ups on board
  accentColor: string;
}

const EMISSION_PRESETS: EmissionPreset[] = [
  {
    id: 'trickle',
    name: 'TRICKLE',
    subtitle: '~15s · 1 at a time',
    cooldown: 150,
    maxItems: 1,
    accentColor: 'rgba(80, 200, 130, 0.9)',
  },
  {
    id: 'standard',
    name: 'STANDARD',
    subtitle: '~9.5s · 1 at a time',
    cooldown: 95,
    maxItems: 1,
    accentColor: 'rgba(100, 180, 230, 0.9)',
  },
  {
    id: 'surge',
    name: 'SURGE',
    subtitle: '~5s · up to 2',
    cooldown: 50,
    maxItems: 2,
    accentColor: 'rgba(200, 140, 30, 0.9)',
  },
  {
    id: 'mayhem',
    name: 'MAYHEM',
    subtitle: '~1.5s · up to 5',
    cooldown: 15,
    maxItems: 5,
    accentColor: 'rgba(210, 60, 60, 0.9)',
  },
];

interface LoadoutDef {
  id: LoadoutPreset;
  name: string;
  subtitle: string;
  types: PowerUpType[] | null; // null = custom
}

const ALL_TYPES: PowerUpType[] = ['SURGE', 'FREEZE', 'PHANTOM', 'ANCHOR', 'AMPLIFIER', 'DECOY', 'FORK'];

const LOADOUTS: LoadoutDef[] = [
  {
    id: 'all',
    name: 'ALL SEVEN',
    subtitle: 'Full arsenal — anything goes',
    types: ALL_TYPES,
  },
  {
    id: 'duelist',
    name: 'DUELIST',
    subtitle: 'SURGE · FREEZE · ANCHOR — pure PvP',
    types: ['SURGE', 'FREEZE', 'ANCHOR'],
  },
  {
    id: 'stealth',
    name: 'STEALTH',
    subtitle: 'PHANTOM · DECOY · FORK — mind games',
    types: ['PHANTOM', 'DECOY', 'FORK'],
  },
  {
    id: 'arsenal',
    name: 'ARSENAL',
    subtitle: 'SURGE · FREEZE · PHANTOM · AMPLIFIER',
    types: ['SURGE', 'FREEZE', 'PHANTOM', 'AMPLIFIER'],
  },
  {
    id: 'custom',
    name: 'CUSTOM',
    subtitle: 'Pick your own mix',
    types: null,
  },
];

const AI_TIERS: { id: AiTier; name: string; subtitle: string; accentColor: string }[] = [
  { id: 'wanderer', name: 'WANDERER', subtitle: 'Random, harmless drift',  accentColor: 'rgba(80,200,130,0.9)'  },
  { id: 'hunter',   name: 'HUNTER',   subtitle: 'Pursues coinbases hard',  accentColor: 'rgba(100,180,230,0.9)' },
  { id: 'tactician',name: 'TACTICIAN',subtitle: 'Plans several moves ahead',accentColor: 'rgba(200,140,30,0.9)'  },
  { id: 'sovereign',name: 'SOVEREIGN',subtitle: 'Full pathfinding, no mercy',accentColor: 'rgba(210,60,60,0.9)'   },
];

// ============================================================================
// Power-up reference data + SVG icons
// ============================================================================

interface PowerUpInfo {
  type: PowerUpType;
  name: string;
  effect: string;
  color: string;
  icon: React.ReactNode;
}


const POWERUP_INFO: PowerUpInfo[] = [
  {
    type: 'SURGE',
    name: 'SURGE',
    effect: 'Speed boost for 4s — your chain accelerates past the opponent.',
    color: '#C8881A',
    icon: <SurgeSvg className="pu-icon-svg" />,
  },
  {
    type: 'FREEZE',
    name: 'FREEZE',
    effect: 'Slows the opponent for 4s — they crawl while you manoeuvre.',
    color: '#4A9AC8',
    icon: <FreezeSvg className="pu-icon-svg" />,
  },
  {
    type: 'PHANTOM',
    name: 'PHANTOM',
    effect: 'Phase through your own body for 5s — no self-collision.',
    color: '#9898B8',
    icon: <PhantomSvg className="pu-icon-svg" />,
  },
  {
    type: 'ANCHOR',
    name: 'ANCHOR',
    effect: 'Drops an immovable wall at your tail for 10s.',
    color: '#D0D0D0',
    icon: <AnchorSvg className="pu-icon-svg" />,
  },
  {
    type: 'AMPLIFIER',
    name: 'AMPLIFIER',
    effect: 'Next 3 coinbase captures earn double percentage.',
    color: '#7AAA70',
    icon: <AmplifierSvg className="pu-icon-svg" />,
  },
  {
    type: 'DECOY',
    name: 'DECOY',
    effect: 'Plants a fake coinbase — opponent teleports on eat.',
    color: '#CCCCCC',
    icon: <DecoySvg className="pu-icon-svg" />,
  },
  {
    type: 'FORK',
    name: 'FORK',
    effect: 'Spawns an AI clone of your chain that hunts coinbases for 10s.',
    color: '#44EE88',
    icon: <ForkSvg className="pu-icon-svg" />,
  },
];

// ============================================================================
// Component
// ============================================================================

export default function PowerupSetup() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();

  const [emissionId, setEmissionId] = useState('standard');
  const [loadout, setLoadout] = useState<LoadoutPreset>('all');
  const [customTypes, setCustomTypes] = useState<Set<PowerUpType>>(new Set(ALL_TYPES));
  const [aiTierIdx, setAiTierIdx] = useState(1); // hunter default

  const emissionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useGamepad(true);

  useEffect(() => {
    emissionRefs.current[EMISSION_PRESETS.findIndex((e) => e.id === emissionId)]?.focus({ preventScroll: true });
  }, [emissionId]);

  const getActiveTypes = useCallback((): PowerUpType[] => {
    if (loadout === 'custom') return [...customTypes];
    return LOADOUTS.find((l) => l.id === loadout)?.types ?? ALL_TYPES;
  }, [loadout, customTypes]);

  const launch = useCallback(
    (vsAi: boolean) => {
      const activeTypes = getActiveTypes();
      if (activeTypes.length === 0) return;
      playSfx(SFX.MENU_CONFIRM);
      const emPreset = EMISSION_PRESETS.find((e) => e.id === emissionId) ?? EMISSION_PRESETS[1];
      const config = {
        mode: 'POWERUP',
        p1Name: 'Player 1',
        p2Name: vsAi ? 'BigToshi 🌊' : 'Player 2',
        practiceMode: vsAi,
        aiTier: vsAi ? AI_TIERS[aiTierIdx].id : undefined,
        powerupSpawnCooldown: emPreset.cooldown,
        powerupMaxItems: emPreset.maxItems,
        powerupAllowedTypes: activeTypes,
      };
      sessionStorage.setItem('gameConfig', JSON.stringify(config));
      navigate('/game');
    },
    [navigate, playSfx, emissionId, aiTierIdx, getActiveTypes],
  );

  const toggleCustomType = useCallback((type: PowerUpType) => {
    setCustomTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type); // keep at least one
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setEmissionId((prev) => {
          const idx = EMISSION_PRESETS.findIndex((p) => p.id === prev);
          return EMISSION_PRESETS[Math.max(0, idx - 1)].id;
        });
        playSfx(SFX.MENU_SELECT);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setEmissionId((prev) => {
          const idx = EMISSION_PRESETS.findIndex((p) => p.id === prev);
          return EMISSION_PRESETS[Math.min(EMISSION_PRESETS.length - 1, idx + 1)].id;
        });
        playSfx(SFX.MENU_SELECT);
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        setAiTierIdx((p) => Math.max(0, p - 1));
        playSfx(SFX.MENU_SELECT);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setAiTierIdx((p) => Math.min(AI_TIERS.length - 1, p + 1));
        playSfx(SFX.MENU_SELECT);
      } else if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        launch(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        navigate('/solo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [launch, navigate, playSfx]);

  const activeTypes = getActiveTypes();
  const emPreset = EMISSION_PRESETS.find((e) => e.id === emissionId) ?? EMISSION_PRESETS[1];

  return (
    <div className="pu-setup">
      <header className="pu-header">
        <h2 className="pu-title condensed">POWER-UP ARENA</h2>
        <p className="pu-subtitle">CONFIGURE YOUR ARSENAL</p>
      </header>

      <div className="pu-body">

        {/* ── Left: config ── */}
        <div className="pu-config">

          {/* Emission rate */}
          <section className="pu-section">
            <div className="pu-section-label">EMISSION RATE</div>
            <div className="pu-emission-row">
              {EMISSION_PRESETS.map((preset, i) => (
                <button
                  key={preset.id}
                  ref={(el) => { emissionRefs.current[i] = el; }}
                  className={`pu-emission-btn${emissionId === preset.id ? ' active' : ''}`}
                  style={{ '--accent': preset.accentColor } as React.CSSProperties}
                  onClick={() => { playSfx(SFX.MENU_SELECT); setEmissionId(preset.id); }}
                >
                  <span className="pu-em-name condensed">{preset.name}</span>
                  <span className="pu-em-sub">{preset.subtitle}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Loadout */}
          <section className="pu-section">
            <div className="pu-section-label">LOADOUT</div>
            <div className="pu-loadout-row">
              {LOADOUTS.map((l) => (
                <button
                  key={l.id}
                  className={`pu-loadout-btn${loadout === l.id ? ' active' : ''}`}
                  onClick={() => { playSfx(SFX.MENU_SELECT); setLoadout(l.id); }}
                  title={l.subtitle}
                >
                  {l.name}
                </button>
              ))}
            </div>
            {loadout === 'custom' && (
              <div className="pu-custom-grid">
                {ALL_TYPES.map((type) => {
                  const info = POWERUP_INFO.find((p) => p.type === type)!;
                  const on = customTypes.has(type);
                  return (
                    <button
                      key={type}
                      className={`pu-custom-toggle${on ? ' on' : ''}`}
                      style={{ '--pu-color': info.color } as React.CSSProperties}
                      onClick={() => { playSfx(SFX.MENU_SELECT); toggleCustomType(type); }}
                      aria-pressed={on}
                    >
                      <span className="pu-ct-icon">{info.icon}</span>
                      <span className="pu-ct-name condensed">{type}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {loadout !== 'custom' && (
              <p className="pu-loadout-desc">
                {LOADOUTS.find((l2) => l2.id === loadout)?.subtitle}
              </p>
            )}
          </section>

          {/* AI difficulty */}
          <section className="pu-section">
            <div className="pu-section-label">DIFFICULTY</div>
            <div className="pu-ai-list">
              {AI_TIERS.map((tier, i) => (
                <button
                  key={tier.id}
                  className={`pu-ai-btn${aiTierIdx === i ? ' active' : ''}`}
                  style={{ '--accent': tier.accentColor } as React.CSSProperties}
                  onClick={() => { playSfx(SFX.MENU_SELECT); setAiTierIdx(i); }}
                >
                  <span className="pu-ai-rank condensed">{String(i + 1).padStart(2, '0')}</span>
                  <span className="pu-ai-name condensed">{tier.name}</span>
                  <span className="pu-ai-sub">{tier.subtitle}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Actions */}
          <div className="pu-actions">
            <button
              className="pu-launch-btn pu-launch-primary"
              onClick={() => launch(true)}
              disabled={activeTypes.length === 0}
              title={`SOLO vs ${AI_TIERS[aiTierIdx].name} AI · ${emPreset.name} emission`}
            >
              SOLO
            </button>
            <button
              className="pu-launch-btn pu-launch-secondary"
              onClick={() => launch(false)}
              disabled={activeTypes.length === 0}
              title="2P local — WASD + Arrow keys"
            >
              2P LOCAL
            </button>
          </div>

          <div className="pu-footer">
            <button
              className="pu-back-btn"
              onClick={() => { playSfx(SFX.MENU_SELECT); navigate('/solo'); }}
            >
              ← SOLO MODES
            </button>
            <span className="pu-hint">←→ emission · ↑↓ difficulty · ENTER solo · ESC back</span>
          </div>
        </div>

        {/* ── Right: power-up reference ── */}
        <div className="pu-reference">
          <div className="pu-ref-header">POWER-UPS</div>
          <div className="pu-ref-grid">
            {POWERUP_INFO.map((info) => {
              const active = activeTypes.includes(info.type);
              return (
                <div
                  key={info.type}
                  className={`pu-ref-card${active ? ' active' : ' inactive'}`}
                  style={{ '--pu-color': info.color } as React.CSSProperties}
                >
                  <div className="pu-ref-icon">{info.icon}</div>
                  <div className="pu-ref-text">
                    <div className="pu-ref-name condensed">{info.name}</div>
                    <div className="pu-ref-effect">{info.effect}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
