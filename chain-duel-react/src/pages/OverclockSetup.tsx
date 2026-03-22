import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import { useGamepad } from '@/hooks/useGamepad';
import '@/components/ui/Button.css';
import './overclockSetup.css';

// ============================================================================
// Presets
// ============================================================================

interface OverclockPreset {
  id: string;
  rank: number;
  name: string;
  subtitle: string;
  description: string;
  aiTier: string;
  startStepMs: number;        // initial tick speed
  minStepMs: number;          // floor tick speed
  stepIntervalTicks: number;  // ticks between each speed increase
  speedReductionMs: number;   // ms removed per step
  accentColor: string;
}

const PRESETS: OverclockPreset[] = [
  {
    id: 'novice',
    rank: 1,
    name: 'NOVICE',
    subtitle: 'Wanderer AI · 130ms start · 60ms floor',
    description:
      'Starts slow. Speed ramps every 25 seconds, settling at 60ms. The Wanderer AI drifts without clear intent — a comfortable introduction to escalating speed.',
    aiTier: 'wanderer',
    startStepMs: 130,
    minStepMs: 60,
    stepIntervalTicks: 250,
    speedReductionMs: 10,
    accentColor: 'rgba(80,200,130,0.9)',
  },
  {
    id: 'soldier',
    rank: 2,
    name: 'SOLDIER',
    subtitle: 'Hunter AI · 100ms start · 40ms floor',
    description:
      'Standard Overclock. Speed climbs every 20 seconds from 100ms to a 40ms floor. Hunter AI chases hard — you need to outrun both the bot and the clock.',
    aiTier: 'hunter',
    startStepMs: 100,
    minStepMs: 40,
    stepIntervalTicks: 200,
    speedReductionMs: 10,
    accentColor: 'rgba(100,180,230,0.9)',
  },
  {
    id: 'commander',
    rank: 3,
    name: 'COMMANDER',
    subtitle: 'Tactician AI · 80ms start · 25ms floor',
    description:
      'Already fast at the gun. Speed drops every 15 seconds down to a brutal 25ms. Tactician AI plans ahead. Muscle memory is the only way through.',
    aiTier: 'tactician',
    startStepMs: 80,
    minStepMs: 25,
    stepIntervalTicks: 150,
    speedReductionMs: 10,
    accentColor: 'rgba(220,100,60,0.9)',
  },
  {
    id: 'sovereign',
    rank: 4,
    name: 'SOVEREIGN',
    subtitle: 'Sovereign AI · 60ms start · 15ms floor',
    description:
      'Starts at near-max speed. Drops every 10 seconds to a 15ms floor — 6× the base rate. Sovereign AI at full pathfinding. Almost certainly fatal.',
    aiTier: 'sovereign',
    startStepMs: 60,
    minStepMs: 15,
    stepIntervalTicks: 100,
    speedReductionMs: 10,
    accentColor: 'rgba(210,175,30,0.95)',
  },
];

// ============================================================================
// Speed ramp visualiser
// ============================================================================

interface RampPreviewProps {
  preset: OverclockPreset;
}

function RampPreview({ preset }: RampPreviewProps) {
  const { startStepMs, minStepMs, stepIntervalTicks, speedReductionMs, accentColor } = preset;

  // Compute ramp steps: each step lowers stepMs by speedReductionMs until minStepMs
  const steps: number[] = [startStepMs];
  let cur = startStepMs;
  while (cur > minStepMs) {
    cur = Math.max(minStepMs, cur - speedReductionMs);
    steps.push(cur);
  }

  // Each step takes stepIntervalTicks × current stepMs wall-clock ms
  // Accumulate real-time seconds for X axis
  const times: number[] = [0];
  let elapsed = 0;
  for (let i = 0; i < steps.length - 1; i++) {
    elapsed += (stepIntervalTicks * steps[i]) / 1000;
    times.push(elapsed);
  }
  const totalTime = elapsed;

  const W = 200;
  const H = 52;
  const PAD_L = 2;
  const PAD_R = 2;
  const PAD_T = 4;
  const PAD_B = 4;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xOf = (t: number) => PAD_L + (totalTime > 0 ? (t / totalTime) * innerW : 0);
  // Y: higher stepMs = slower = top; lower stepMs = faster = bottom
  const yOf = (ms: number) =>
    PAD_T + ((ms - minStepMs) / (startStepMs - minStepMs)) * innerH;

  // Build polyline points
  const pts = steps.map((ms, i) => `${xOf(times[i])},${yOf(ms)}`).join(' ');
  // Close to bottom-right, bottom-left for fill
  const fillPts =
    pts +
    ` ${xOf(totalTime)},${H - PAD_B} ${PAD_L},${H - PAD_B}`;

  return (
    <div className="ramp-preview" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className="ramp-svg" preserveAspectRatio="none">
        {/* Filled area under curve */}
        <polygon
          points={fillPts}
          fill={accentColor.replace('0.9', '0.12').replace('0.95', '0.12')}
        />
        {/* Curve */}
        <polyline
          points={pts}
          fill="none"
          stroke={accentColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Floor line */}
        <line
          x1={PAD_L} y1={yOf(minStepMs) + 0.5}
          x2={W - PAD_R} y2={yOf(minStepMs) + 0.5}
          stroke={accentColor}
          strokeWidth="0.5"
          strokeDasharray="3 2"
          opacity="0.4"
        />
        {/* Step markers */}
        {steps.map((ms, i) => (
          <circle
            key={i}
            cx={xOf(times[i])}
            cy={yOf(ms)}
            r={i === 0 || i === steps.length - 1 ? 2.5 : 1.5}
            fill={accentColor}
            opacity={i === 0 || i === steps.length - 1 ? 1 : 0.6}
          />
        ))}
      </svg>
      <div className="ramp-labels">
        <span className="ramp-lbl">{startStepMs}ms</span>
        <span className="ramp-lbl ramp-center">SPEED RAMP</span>
        <span className="ramp-lbl ramp-floor">{minStepMs}ms</span>
      </div>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export default function OverclockSetup() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const [selected, setSelected] = useState(1); // default: SOLDIER

  useGamepad(true);

  const launch = useCallback(
    (preset: OverclockPreset, vsAi: boolean) => {
      playSfx(SFX.MENU_CONFIRM);
      const config = {
        mode: 'OVERCLOCK',
        p1Name: 'Player 1',
        p2Name: vsAi ? 'BigToshi 🌊' : 'Player 2',
        practiceMode: vsAi,
        aiTier: vsAi ? preset.aiTier : undefined,
        overclockStartStepMs: preset.startStepMs,
        overclockMinStepMs: preset.minStepMs,
        overclockStepIntervalTicks: preset.stepIntervalTicks,
        overclockSpeedReductionMs: preset.speedReductionMs,
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
        setSelected((p) => Math.min(PRESETS.length - 1, p + 1));
      } else if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
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

  // Compute ramp step count for stat
  const rampSteps = Math.ceil((preset.startStepMs - preset.minStepMs) / preset.speedReductionMs);

  return (
    <div className="overclock-setup">
      <header className="os-header">
        <h2 className="os-title condensed">OVERCLOCK</h2>
        <p className="os-subtitle">SPEED ESCALATION · CHOOSE YOUR THRESHOLD</p>
      </header>

      <div className="os-body">

        {/* Left: tier list */}
        <div className="os-list">
          {PRESETS.map((p, i) => (
            <button
              key={p.id}
              className={`os-tier-btn ${selected === i ? 'active' : ''}`}
              style={{ '--accent': p.accentColor } as React.CSSProperties}
              onClick={() => { playSfx(SFX.MENU_SELECT); setSelected(i); }}
              onDoubleClick={() => launch(p, true)}
            >
              <span className="os-rank condensed">{String(p.rank).padStart(2, '0')}</span>
              <span className="os-name condensed">{p.name}</span>
              <span className="os-sub">{p.subtitle}</span>
            </button>
          ))}
        </div>

        {/* Right: detail */}
        <div className="os-detail">
          <div className="os-detail-top">
            <RampPreview preset={preset} />
            <div className="os-detail-info">
              <h3 className="os-detail-name condensed" style={{ color: preset.accentColor }}>
                {preset.name}
              </h3>
              <p className="os-detail-desc">{preset.description}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="os-stats">
            <div className="os-stat">
              <div className="os-stat-label">OPPONENT</div>
              <div className="os-stat-val condensed">{preset.aiTier.toUpperCase()}</div>
            </div>
            <div className="os-stat">
              <div className="os-stat-label">START SPEED</div>
              <div className="os-stat-val condensed">{preset.startStepMs}ms</div>
            </div>
            <div className="os-stat">
              <div className="os-stat-label">FLOOR SPEED</div>
              <div className="os-stat-val condensed">{preset.minStepMs}ms</div>
            </div>
            <div className="os-stat">
              <div className="os-stat-label">RAMP EVERY</div>
              <div className="os-stat-val condensed">
                ~{Math.round((preset.stepIntervalTicks * preset.startStepMs) / 1000)}s
              </div>
            </div>
            <div className="os-stat">
              <div className="os-stat-label">STEPS</div>
              <div className="os-stat-val condensed">{rampSteps}</div>
            </div>
          </div>

          {/* Speed gradient bar */}
          <div className="os-speed-bar">
            <span className="os-bar-label">SLOW</span>
            <div className="os-bar-track">
              <div
                className="os-bar-fill"
                style={{
                  background: `linear-gradient(to right, rgba(255,255,255,0.08), ${preset.accentColor})`,
                  width: `${100 - (preset.minStepMs / 130) * 100}%`,
                  left: `${(preset.minStepMs / 130) * 100}%`,
                }}
              />
              {/* Start marker */}
              <div
                className="os-bar-marker os-bar-start"
                style={{ left: `${(1 - preset.startStepMs / 130) * 100}%` }}
                title={`${preset.startStepMs}ms start`}
              />
              {/* Floor marker */}
              <div
                className="os-bar-marker os-bar-floor"
                style={{
                  left: `${(1 - preset.minStepMs / 130) * 100}%`,
                  background: preset.accentColor,
                }}
                title={`${preset.minStepMs}ms floor`}
              />
            </div>
            <span className="os-bar-label">MAX</span>
          </div>

          {/* Actions */}
          <div className="os-actions">
            <button
              className="os-btn os-btn-primary"
              style={{ '--accent': preset.accentColor } as React.CSSProperties}
              onClick={() => launch(preset, true)}
            >
              SOLO
            </button>
            <button
              className="os-btn os-btn-secondary"
              onClick={() => launch(preset, false)}
            >
              2P LOCAL
            </button>
          </div>

          <p className="os-hint">↑↓ to navigate · ENTER to start solo · ESC to go back</p>
        </div>
      </div>

      <footer className="os-footer">
        <button
          className="os-back-btn"
          onClick={() => { playSfx(SFX.MENU_SELECT); navigate('/solo'); }}
        >
          ← SOLO MODES
        </button>
      </footer>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
