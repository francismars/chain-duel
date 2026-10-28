import { useState } from 'react';
import {
  DEFAULT_GRAPHICS_SETTINGS,
  performanceGraphicsSettings,
  readGraphicsSettings,
  writeGraphicsSettings,
  type AnimationMode,
  type GraphicsSettings,
  type PointPopupMode,
} from '@/lib/graphicsSettings';
import './graphics-settings.css';

type BooleanKey = {
  [K in keyof GraphicsSettings]: GraphicsSettings[K] extends boolean ? K : never;
}[keyof GraphicsSettings];

type ToggleSpec = {
  key: BooleanKey;
  title: string;
  copy: string;
};

type ChoiceSpec<K extends 'pointPopups' | 'animations'> = {
  key: K;
  title: string;
  copy: string;
  options: { value: GraphicsSettings[K]; label: string }[];
};

const POINT_POPUPS: ChoiceSpec<'pointPopups'> = {
  key: 'pointPopups',
  title: 'Point popups',
  copy: 'The +/- sats numbers after a capture. Simple shows a flat number without glow or bounce.',
  options: [
    { value: 'full' satisfies PointPopupMode, label: 'Full' },
    { value: 'simple' satisfies PointPopupMode, label: 'Simple' },
    { value: 'off' satisfies PointPopupMode, label: 'Off' },
  ],
};

const ANIMATIONS: ChoiceSpec<'animations'> = {
  key: 'animations',
  title: 'Animations',
  copy: 'Reduced updates chain effects once per move and drops the HUD flash. Off also removes capture pulses, trails, streak rings, and reveals.',
  options: [
    { value: 'full' satisfies AnimationMode, label: 'Full' },
    { value: 'reduced' satisfies AnimationMode, label: 'Reduced' },
    { value: 'off' satisfies AnimationMode, label: 'Off' },
  ],
};

const TOGGLES: ToggleSpec[] = [
  {
    key: 'antialias',
    title: 'Antialiasing',
    copy: 'Smooths square edges. Off is faster, mostly on Safari.',
  },
  {
    key: 'shadowsAndTransparency',
    title: 'Shadows & transparency',
    copy: 'Blurred shadows on the countdown and hints, the coin halo, and the see-through board. Off draws a solid board with flat text.',
  },
  {
    key: 'measureEveryFrame',
    title: 'Measure board every frame',
    copy: 'Reads the board size from the page each frame. Off uses the last resize, which avoids a layout pass.',
  },
];

const SOUND_TOGGLE: ToggleSpec = {
  key: 'soundAndTension',
  title: 'Sound effects & tension',
  copy: 'Capture, power-up, and countdown sounds, plus the tension tracking that layers the music and marks streaks. Off skips that work; music still plays.',
};

const FPS_TOGGLE: ToggleSpec = {
  key: 'showFps',
  title: 'Show FPS',
  copy: 'Frame rate and slowest frame in the corner during a match.',
};

function sameSettings(a: GraphicsSettings, b: GraphicsSettings): boolean {
  return (Object.keys(a) as (keyof GraphicsSettings)[]).every(
    (key) => a[key] === b[key]
  );
}

function ChoiceRow<K extends 'pointPopups' | 'animations'>({
  spec,
  value,
  onChange,
}: {
  spec: ChoiceSpec<K>;
  value: GraphicsSettings[K];
  onChange: (value: GraphicsSettings[K]) => void;
}) {
  const titleId = `graphics-${spec.key}-title`;
  return (
    <li className="graphics-settings__row graphics-settings__row--choice">
      <span className="graphics-settings__text">
        <span id={titleId} className="graphics-settings__title">
          {spec.title}
        </span>
        <span className="graphics-settings__copy">{spec.copy}</span>
      </span>
      <span
        className="graphics-settings__segmented"
        role="radiogroup"
        aria-labelledby={titleId}
      >
        {spec.options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={`graphics-settings__segment${value === option.value ? ' graphics-settings__segment--active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </span>
    </li>
  );
}

export function GraphicsSettingsPanel() {
  const [settings, setSettings] = useState(readGraphicsSettings);

  const apply = (next: GraphicsSettings) => {
    setSettings(next);
    writeGraphicsSettings(next);
  };

  const performance = performanceGraphicsSettings(settings);
  const defaults = {
    ...DEFAULT_GRAPHICS_SETTINGS,
    soundAndTension: settings.soundAndTension,
  };

  const renderToggle = ({ key, title, copy }: ToggleSpec) => (
    <li key={key}>
      <label className="graphics-settings__row">
        <span className="graphics-settings__text">
          <span className="graphics-settings__title">{title}</span>
          <span className="graphics-settings__copy">{copy}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="graphics-settings__switch"
          checked={settings[key]}
          onChange={(e) => apply({ ...settings, [key]: e.target.checked })}
        />
      </label>
    </li>
  );

  return (
    <div className="graphics-settings">
      <div className="graphics-settings__actions">
        <button
          type="button"
          className="graphics-settings__action"
          disabled={sameSettings(settings, performance)}
          onClick={() => apply(performance)}
        >
          Performance mode
        </button>
        <button
          type="button"
          className="graphics-settings__action"
          disabled={sameSettings(settings, defaults)}
          onClick={() => apply(defaults)}
        >
          Restore defaults
        </button>
      </div>

      <ul className="graphics-settings__list">
        <ChoiceRow
          spec={POINT_POPUPS}
          value={settings.pointPopups}
          onChange={(pointPopups) => apply({ ...settings, pointPopups })}
        />
        <ChoiceRow
          spec={ANIMATIONS}
          value={settings.animations}
          onChange={(animations) => apply({ ...settings, animations })}
        />
        {TOGGLES.map(renderToggle)}
        {renderToggle(SOUND_TOGGLE)}
        {renderToggle(FPS_TOGGLE)}
      </ul>
    </div>
  );
}
