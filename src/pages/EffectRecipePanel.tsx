import { useEffect, useMemo, useRef, useState } from 'react';
import { type TensionLevel } from '@/game/audio/tension';
import {
  SHIPPED_RECIPE,
  SOUND_FILES,
  applyRecipe,
  captureClipForLength,
  capturePercentForLength,
  cloneRecipe,
  countRecipeDiffs,
  gameRecipe,
  recipesEqual,
  restoreShippedRecipe,
  type MatchRecipe,
} from '@/game/effects/matchRecipe';

type Marks = [number, number, number, number];

const LAYERS = [
  ['Warning', 'Comes in first', 1],
  ['Critical', 'Louder', 3],
] as const;

export function EffectRecipePanel({
  draft,
  onChange,
  levels,
  onPlay,
  playing,
  onEat,
  eatDisabled,
  onShowSats,
  onShowFork,
  onStopMusic,
  onHearMix,
  silenced,
  chainLength,
  chainName,
  onChainLength,
  page,
  liveTick,
}: {
  draft: MatchRecipe;
  onChange: (next: MatchRecipe) => void;
  levels: {
    chain: TensionLevel;
    score: TensionLevel;
  };
  onPlay: (file: string) => void;
  playing: string | null;
  onEat: () => void;
  eatDisabled: boolean;
  onShowSats: () => void;
  onShowFork: () => void;
  onStopMusic: () => void;
  onHearMix: () => void;
  silenced: boolean;
  chainLength: number;
  chainName: string;
  onChainLength: (length: number) => void;
  page: 'music' | 'eat';
  liveTick: number;
}) {
  // liveTick is the signal that the shared recipe changed; gameRecipe() reads it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const live = useMemo(() => gameRecipe(), [liveTick]);

  const patch = (next: Partial<MatchRecipe>) => onChange({ ...draft, ...next });

  if (page === 'music') {
    return (
      <section className="recipe">
        <h2>Music</h2>
        <p className="recipe__hint">
          Warning is the pressure stem. Critical is the critical stem. The
          louder one reached is the one that plays. Drag a tick to move when
          that layer comes in.
        </p>
        <div className="match-lab__actions">
          <button
            type="button"
            aria-pressed={!silenced && playing == null}
            onClick={onHearMix}
          >
            Hear the mix
          </button>
          <button type="button" onClick={onStopMusic}>
            Stop music
          </button>
        </div>
        <p className="recipe__hint">
          {playing
            ? `Playing ${playing} alone.`
            : silenced
              ? 'Music is stopped. Play a row to hear that file alone.'
              : 'The mix is playing. Stop it before you try a file.'}
        </p>
        <SoundRow
          label="Bed"
          detail="Under the layers"
          file={draft.bedFile}
          matchFile={live.bedFile}
          playing={playing === draft.bedFile}
          onPlay={() => onPlay(draft.bedFile)}
          onFile={(bedFile) => patch({ bedFile })}
        />
        {LAYERS.map(([label, detail, index]) => (
          <SoundRow
            key={label}
            label={label}
            detail={detail}
            file={draft.stemFiles[index]!}
            matchFile={live.stemFiles[index]!}
            volume={draft.stemVolumes[index]!}
            matchVolume={live.stemVolumes[index]!}
            playing={playing === draft.stemFiles[index]}
            onPlay={() => onPlay(draft.stemFiles[index]!)}
            onFile={(file) => {
              const stemFiles = [...draft.stemFiles] as [
                string,
                string,
                string,
                string,
              ];
              stemFiles[index] = file;
              patch({ stemFiles });
            }}
            onVolume={(value) => {
              const stemVolumes = [...draft.stemVolumes] as Marks;
              stemVolumes[index] = value;
              patch({ stemVolumes });
            }}
            enabled={draft.stemEnabled[index]}
            matchEnabled={live.stemEnabled[index]}
            onEnabled={(on) => {
              const stemEnabled = [...draft.stemEnabled] as [
                boolean,
                boolean,
                boolean,
                boolean,
              ];
              stemEnabled[index] = on;
              patch({ stemEnabled });
            }}
          />
        ))}
        <h3>When it plays</h3>
        <MarkRail
          label="One chain reaches"
          now={layerName(levels.chain)}
          hint="Warning when any chain reaches the lower tick. Critical when any chain reaches the higher tick."
          names={['warning', 'critical']}
          marks={draft.gapLeader}
          match={live.gapLeader}
          min={1}
          max={100}
          suffix="%"
          onChange={(next) => patch({ gapLeader: [next[0]!, next[1]!] })}
        />
        <MarkRail
          label="Sats left"
          now={layerName(levels.score)}
          hint="Duel lines for the trailer's share. The lower tick is critical, the higher is warning. With more than two chains still in, both scale by 2 / living, so four equal players stay on the bed."
          names={['critical', 'warning']}
          marks={draft.drainMarks}
          match={live.drainMarks}
          min={1}
          max={100}
          suffix="%"
          onChange={(next) => patch({ drainMarks: [next[0]!, next[1]!] })}
        />
        <div className="recipe__pair">
          <VolumeRow
            label="Quiet the bed"
            hint="While a mark is playing, the game bed lowers by this much of that layer."
            value={draft.duck}
            match={live.duck}
            onChange={(duck) => patch({ duck })}
          />
          <HoldRow
            value={draft.holdMs}
            match={live.holdMs}
            onChange={(holdMs) => patch({ holdMs })}
          />
          <HoldRow
            label="Fade out"
            hint="How long a full-volume layer takes to leave. These layers are quieter, so they leave sooner. The way in is twice as fast. Zero cuts it off."
            aria="Fade out"
            value={draft.fadeMs}
            match={live.fadeMs}
            max={10}
            onChange={(fadeMs) => patch({ fadeMs })}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="recipe">
      <h2>When a chain eats</h2>
      <p className="recipe__hint">
        The chain animation and the words that float off the heads. Each button
        shows one thing.
      </p>
      <button
        type="button"
        className="recipe__apply"
        disabled={eatDisabled}
        onClick={onEat}
      >
        Eat once
      </button>
      <div className="recipe__pops">
        <button type="button" onClick={onShowSats}>
          Sats
        </button>
        <button type="button" onClick={onShowFork}>
          REORG
        </button>
      </div>
      <p className="recipe__hint">
        Sats floats the + and − with the percent above the gain, the way an eat
        does. REORG sits on the long chain when a chain at 2% or under resets
        one at 8% or more, or a chain at 4% or under resets one at 16% or more.
        Solo: only when that long chain dies; a short death stays a normal mark.
      </p>
      <LookRow
        title="Tail swell"
        detail="The new tail block grows up to the cell and stops. Watch the tail."
        checked={draft.animGrow}
        match={live.animGrow}
        onChange={(animGrow) => patch({ animGrow })}
      />
      <LookRow
        title="Wave"
        detail="A warm flash runs from the head down the chain."
        checked={draft.animTint}
        match={live.animTint}
        onChange={(animTint) => patch({ animTint })}
      />
      <LookRow
        title="Head pop"
        detail="The head pops larger, then settles."
        checked={draft.animScale}
        match={live.animScale}
        onChange={(animScale) => patch({ animScale })}
      />
      <CaptureLadder
        from={draft.captureFrom}
        percent={draft.capturePercent}
        matchFrom={live.captureFrom}
        matchPercent={live.capturePercent}
        length={chainLength}
        chainName={chainName}
        onFrom={(captureFrom) => patch({ captureFrom })}
        onPercent={(capturePercent) => patch({ capturePercent })}
        onLength={onChainLength}
      />
    </section>
  );
}

export function RecipeBar({
  draft,
  onChange,
  liveTick,
  onBump,
}: {
  draft: MatchRecipe;
  onChange: (next: MatchRecipe) => void;
  liveTick: number;
  onBump: () => void;
}) {
  // liveTick is the signal that the shared recipe changed; gameRecipe() reads it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const live = useMemo(() => gameRecipe(), [liveTick]);
  const diffs = countRecipeDiffs(draft, live);
  const dirty = diffs > 0;
  const custom = !recipesEqual(live, SHIPPED_RECIPE);

  return (
    <div className="recipe__bar">
      <p className="match-lab__note">
        {dirty
          ? 'Not saved yet. Save keeps it in this browser only. Discard drops these edits.'
          : custom
            ? 'Saved on this browser. Clear saved recipe deletes it. The built-in recipe comes back.'
            : 'Nothing is saved on this browser. The match uses the built-in recipe.'}
      </p>
      {dirty ? (
        <div className="match-lab__actions">
          <button
            type="button"
            className="recipe__apply"
            onClick={() => {
              applyRecipe(draft);
              onBump();
            }}
          >
            Save on this browser
          </button>
          <button type="button" onClick={() => onChange(gameRecipe())}>
            Discard edits
          </button>
        </div>
      ) : null}
      {custom ? (
        <button
          type="button"
          onClick={() => {
            restoreShippedRecipe();
            onChange(cloneRecipe(SHIPPED_RECIPE));
            onBump();
          }}
        >
          Clear saved recipe
        </button>
      ) : null}
    </div>
  );
}

function layerName(level: TensionLevel): string {
  return level >= 4 ? 'Critical' : level >= 2 ? 'Warning' : 'Quiet';
}

function sameMarks(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((mark, index) => mark === b[index]);
}

function MarkRail({
  label,
  hint,
  now,
  names,
  marks,
  match,
  min,
  max,
  suffix = '',
  onChange,
}: {
  label: string;
  hint: string;
  now?: string;
  names?: readonly string[];
  marks: readonly number[];
  match: readonly number[];
  min: number;
  max: number;
  suffix?: string;
  onChange: (next: number[]) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const marksRef = useRef(marks);
  if (drag.current === null) marksRef.current = marks;
  const differ = !sameMarks(marks, match);
  const span = max - min || 1;
  const shown = drag.current === null ? marks : marksRef.current;
  const last = marks.length - 1;

  const valueAt = (clientX: number) => {
    const rect = railRef.current!.getBoundingClientRect();
    const t = (clientX - rect.left) / rect.width;
    const raw = min + Math.min(1, Math.max(0, t)) * span;
    return Math.min(max, Math.max(min, Math.round(raw)));
  };

  const commit = (index: number, value: number) => {
    const next = [...marksRef.current];
    next[index] = Math.min(max, Math.max(min, value));
    next.sort((a, b) => a - b);
    marksRef.current = next;
    onChange(next);
  };

  const nudge = (index: number, value: number) => {
    const next = [...marks];
    const lo = index === 0 ? min : next[index - 1]!;
    const hi = index === last ? max : next[index + 1]!;
    next[index] = Math.min(hi, Math.max(lo, value));
    onChange(next);
  };

  return (
    <div className="recipe__mark">
      <div className="recipe__mark-head">
        <span>{label}</span>
        {now ? <em>{now}</em> : null}
        {differ ? (
          <em>match {match.map((mark) => `${mark}${suffix}`).join(' ')}</em>
        ) : null}
      </div>
      <div className="recipe__rail" ref={railRef}>
        <i className="recipe__rail-line" />
        {shown.map((mark, index) => (
          <button
            key={index}
            type="button"
            className="recipe__tick"
            style={{ left: `${((mark - min) / span) * 100}%` }}
            aria-label={`${label} ${names?.[index] ?? `mark ${index + 1}`}, ${mark}${suffix}`}
            onPointerDown={(event) => {
              drag.current = index;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (drag.current !== index) return;
              commit(index, valueAt(event.clientX));
            }}
            onPointerUp={(event) => {
              if (drag.current !== index) return;
              commit(index, valueAt(event.clientX));
              drag.current = null;
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                event.preventDefault();
                nudge(index, mark - 1);
              }
              if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                event.preventDefault();
                nudge(index, mark + 1);
              }
            }}
          >
            <b>
              {mark}
              {suffix}
            </b>
          </button>
        ))}
      </div>
      <p className="recipe__hint">{hint}</p>
    </div>
  );
}

function SoundRow({
  label,
  detail,
  file,
  matchFile,
  volume,
  matchVolume,
  playing,
  enabled,
  matchEnabled,
  onEnabled,
  onPlay,
  onFile,
  onVolume,
}: {
  label: string;
  detail?: string;
  file: string;
  matchFile: string;
  volume?: number;
  matchVolume?: number;
  playing: boolean;
  enabled?: boolean;
  matchEnabled?: boolean;
  onEnabled?: (on: boolean) => void;
  onPlay: () => void;
  onFile: (file: string) => void;
  onVolume?: (value: number) => void;
}) {
  const fileDiffers = file !== matchFile;
  const volumeDiffers =
    volume != null &&
    matchVolume != null &&
    Math.abs(volume - matchVolume) >= 0.005;
  return (
    <div className="recipe__sound">
      <div className="recipe__sound-head">
        <span>
          {label}
          {detail ? <em> {detail}</em> : null}
          {fileDiffers ? <em> match {matchFile}</em> : null}
          {enabled != null &&
          matchEnabled != null &&
          enabled !== matchEnabled ? (
            <em> match {matchEnabled ? 'on' : 'off'}</em>
          ) : null}
        </span>
        {onEnabled != null && enabled != null ? (
          <label className="match-lab__check">
            <input
              type="checkbox"
              checked={enabled}
              aria-label={`${label} plays`}
              onChange={(event) => onEnabled(event.target.checked)}
            />
            Plays
          </label>
        ) : null}
        <button type="button" aria-pressed={playing} onClick={onPlay}>
          {playing ? 'Stop' : 'Play'}
        </button>
      </div>
      {onVolume && volume != null ? (
        <label className="recipe__vol">
          <span>
            Volume
            {volumeDiffers ? <em> match {matchVolume!.toFixed(2)}</em> : null}
          </span>
          <b>{volume.toFixed(2)}</b>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label={`${label} volume`}
            onChange={(event) => onVolume(Number(event.target.value))}
          />
        </label>
      ) : null}
      <select
        aria-label={`${label} sound`}
        value={file}
        onChange={(event) => onFile(event.target.value)}
      >
        {SOUND_FILES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

function LookRow({
  title,
  detail,
  checked,
  match,
  onChange,
}: {
  title: string;
  detail: string;
  checked: boolean;
  match: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="recipe__look">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
        {checked !== match ? <em>match {match ? 'on' : 'off'}</em> : null}
      </span>
    </label>
  );
}

function VolumeRow({
  label,
  hint,
  value,
  match,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  match: number;
  onChange: (value: number) => void;
}) {
  const differ = Math.abs(value - match) >= 0.005;
  return (
    <label className="recipe__vol">
      <span>
        {label}
        <em> {hint}</em>
        {differ ? <em> match {match.toFixed(2)}</em> : null}
      </span>
      <b>{value.toFixed(2)}</b>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function HoldRow({
  value,
  match,
  onChange,
  label = 'Layer hold',
  hint = 'After the mark drops, the layer stays at full volume for this long',
  aria = 'Layer hold',
  max = 8,
}: {
  value: number;
  match: number;
  onChange: (ms: number) => void;
  label?: string;
  hint?: string;
  aria?: string;
  max?: number;
}) {
  const seconds = value / 1000;
  const differ = value !== match;
  return (
    <label className="recipe__vol">
      <span>
        {label}
        <em> {hint}</em>
        {differ ? <em> match {(match / 1000).toFixed(1)}s</em> : null}
      </span>
      <b>{seconds.toFixed(1)}s</b>
      <input
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={seconds}
        aria-label={aria}
        onChange={(event) => onChange(Number(event.target.value) * 1000)}
      />
    </label>
  );
}

type Five = [number, number, number, number, number];

function CaptureLadder({
  from,
  percent,
  matchFrom,
  matchPercent,
  length,
  chainName,
  onFrom,
  onPercent,
  onLength,
}: {
  from: Five;
  percent: Five;
  matchFrom: Five;
  matchPercent: Five;
  length: number;
  chainName: string;
  onFrom: (next: Five) => void;
  onPercent: (next: Five) => void;
  onLength: (length: number) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const fromRef = useRef(from);
  fromRef.current = from;
  const min = 1;
  const max = 36;
  const span = max - min;
  const taken = capturePercentForLength(length, from, percent);
  const clip = captureClipForLength(length, from, percent);
  const active = from.findIndex(
    (start, index) =>
      length >= start && (index === 4 || length < from[index + 1]!)
  );
  const [picked, setPicked] = useState(active < 0 ? 0 : active);
  useEffect(() => {
    if (active >= 0) setPicked(active);
  }, [active]);
  const band = picked >= 0 && picked < 5 ? picked : 0;
  const differ =
    from.join(',') !== matchFrom.join(',') ||
    percent.join(',') !== matchPercent.join(',');
  const bandStart = from[band]!;
  const bandEnd = band === 4 ? null : from[band + 1]! - 1;
  const bandRange =
    bandEnd == null
      ? `${bandStart}+`
      : bandEnd === bandStart
        ? `${bandStart}`
        : `${bandStart}–${bandEnd}`;

  const valueAt = (clientX: number) => {
    const rail = railRef.current;
    if (!rail) return min;
    const rect = rail.getBoundingClientRect();
    const ratio = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
    return Math.round(min + Math.min(1, Math.max(0, ratio)) * span);
  };

  const commit = (index: number, value: number) => {
    const next = [...fromRef.current] as Five;
    const lo = next[index - 1]! + 1;
    const hi = index === 4 ? max : next[index + 1]! - 1;
    next[index] = Math.min(Math.max(lo, value), hi);
    next[0] = 1;
    onFrom(next);
  };

  return (
    <div className="recipe__capture">
      <div className="recipe__mark-head">
        <span>Capture percent</span>
        {differ ? <em>match differs</em> : null}
      </div>
      <p className="recipe__hint">
        {chainName} is length {length}, so an eat takes {taken}% and plays the{' '}
        {clip} clip. Drag a tick to move where a band starts. Click a band, then
        set its percent once.
      </p>
      <div className="recipe__bands">
        {from.map((start, index) => {
          const end = index === 4 ? max : from[index + 1]!;
          const width = ((end - start) / span) * 100;
          const here =
            length >= start && (index === 4 ? length <= max : length < end);
          const chosen = index === band;
          return (
            <button
              key={index}
              type="button"
              className={here ? 'on' : undefined}
              aria-pressed={chosen}
              style={{ width: `${width}%` }}
              onClick={() => setPicked(index)}
            >
              {percent[index]}%
            </button>
          );
        })}
        <span
          className="recipe__now"
          style={{
            left: `${((Math.min(max, Math.max(min, length)) - min) / span) * 100}%`,
          }}
        />
      </div>
      <div className="recipe__rail" ref={railRef}>
        <i className="recipe__rail-line" />
        {from.slice(1).map((mark, offset) => {
          const index = offset + 1;
          return (
            <button
              key={index}
              type="button"
              className="recipe__tick"
              style={{ left: `${((mark - min) / span) * 100}%` }}
              aria-label={`${percent[index]} percent starts at length ${mark}`}
              onPointerDown={(event) => {
                drag.current = index;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (drag.current !== index) return;
                commit(index, valueAt(event.clientX));
              }}
              onPointerUp={(event) => {
                if (drag.current !== index) return;
                commit(index, valueAt(event.clientX));
                drag.current = null;
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  commit(index, mark - 1);
                }
                if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  commit(index, mark + 1);
                }
              }}
            >
              <b>{mark}</b>
            </button>
          );
        })}
      </div>
      <label className="recipe__tier">
        <span>Length {bandRange}</span>
        <input
          type="number"
          min={1}
          max={100}
          value={percent[band]}
          aria-label={`Percent at length ${bandRange}`}
          onChange={(event) => {
            const next = [...percent] as Five;
            const value = Number(event.target.value);
            next[band] = Number.isFinite(value)
              ? Math.min(100, Math.max(1, Math.round(value)))
              : next[band]!;
            onPercent(next);
          }}
        />
        <b>%</b>
      </label>
      <label className="slider">
        <span>
          {chainName} length {length}
        </span>
        <input
          type="range"
          min={1}
          max={36}
          value={Math.min(36, Math.max(1, length))}
          aria-label={`${chainName} length`}
          onChange={(event) => onLength(Number(event.target.value))}
        />
      </label>
      <p className="recipe__hint">
        The slider grows that chain on the board. The score stays put. The
        capture line and the eat clip follow the percent.
      </p>
    </div>
  );
}
