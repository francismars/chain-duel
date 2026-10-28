import type { GameState, PlayerId } from '@/game/engine/types';
import type { ResetCue } from '@/game/audio/resetCue';
import {
  captureClipForLength,
  capturePercentForLength,
  gameRecipe,
  type MatchRecipe,
} from '@/game/effects/matchRecipe';
import {
  getTensionBreakdown,
  tensionPlayers,
  type TensionLevel,
  type TensionPlayer,
} from './tension';
import {
  publishTensionDebug,
  publishTensionLayers,
  pushCaptureRatePop,
  pushSpawnFlash,
  resetTensionDebug,
} from './tensionDebug';
import { saveMenuMusicPosition } from './resultMusicHandoff';
import { readGraphicsSettings } from '@/lib/graphicsSettings';

function headTravel(before: TensionPlayer, after: TensionPlayer): number {
  return (
    Math.abs(after.head[0] - before.head[0]) +
    Math.abs(after.head[1] - before.head[1])
  );
}

/**
 * A chain at 2% or under against 8% or more, or at 4% or under against 16% or more.
 * On the shipped ladder that is 2% vs 8%+, and 2% or 4% vs 16%+.
 */
export function reorgCaptureGap(percentA: number, percentB: number): boolean {
  const low = Math.min(percentA, percentB);
  const high = Math.max(percentA, percentB);
  if (low <= 2 && high >= 8) return true;
  return low <= 4 && high >= 16;
}

/**
 * A reorg mark sits on the richer chain's last head.
 * Head-to-head: both reset on the same tick with heads close.
 * Solo death: the long chain dies while a shorter one keeps going with the gap.
 */
function reorgedLongChain(
  previous: TensionPlayer[],
  players: TensionPlayer[]
): TensionPlayer | null {
  const pairs = players.flatMap((player) => {
    const before = previous.find((entry) => entry.index === player.index);
    return before ? [{ before, after: player }] : [];
  });
  const reset = pairs.filter(
    (pair) =>
      !pair.before.eliminated &&
      !pair.after.eliminated &&
      headTravel(pair.before, pair.after) > 1 &&
      pair.after.length <= pair.before.length
  );
  const recipe = gameRecipe();
  const percentOf = (length: number) =>
    capturePercentForLength(length, recipe.captureFrom, recipe.capturePercent);

  if (reset.length >= 2) {
    const rated = reset.map((pair) => ({
      ...pair,
      percent: percentOf(pair.before.length),
    }));
    for (let i = 0; i < rated.length; i += 1) {
      for (let j = i + 1; j < rated.length; j += 1) {
        const a = rated[i]!;
        const b = rated[j]!;
        if (!reorgCaptureGap(a.percent, b.percent)) continue;
        const apart =
          Math.abs(a.before.head[0] - b.before.head[0]) +
          Math.abs(a.before.head[1] - b.before.head[1]);
        if (apart > 2) continue;
        return a.percent >= b.percent ? a.before : b.before;
      }
    }
    return null;
  }

  if (reset.length !== 1) return null;
  const dead = reset[0]!;
  const deadPercent = percentOf(dead.before.length);
  for (const pair of pairs) {
    if (pair.before.index === dead.before.index) continue;
    if (pair.before.eliminated || pair.after.eliminated) continue;
    if (pair.after.score <= 0) continue;
    const livePercent = percentOf(pair.before.length);
    // Solo reorg: the long chain dies; a short death is an ordinary WALL.
    if (deadPercent <= livePercent) continue;
    if (!reorgCaptureGap(deadPercent, livePercent)) continue;
    return dead.before;
  }
  return null;
}

/** Head-to-head with no capture-rate gap. The mark sits between the two heads. */
function clashedHeads(
  previous: TensionPlayer[],
  players: TensionPlayer[]
): TensionPlayer['head'] | null {
  const pairs = players.flatMap((player) => {
    const before = previous.find((entry) => entry.index === player.index);
    return before ? [{ before, after: player }] : [];
  });
  const reset = pairs.filter(
    (pair) =>
      !pair.before.eliminated &&
      !pair.after.eliminated &&
      headTravel(pair.before, pair.after) > 1 &&
      pair.after.length <= pair.before.length
  );
  for (let i = 0; i < reset.length; i += 1) {
    for (let j = i + 1; j < reset.length; j += 1) {
      const a = reset[i]!;
      const b = reset[j]!;
      const apart =
        Math.abs(a.before.head[0] - b.before.head[0]) +
        Math.abs(a.before.head[1] - b.before.head[1]);
      if (apart > 2) continue;
      return [
        Math.round((a.before.head[0] + b.before.head[0]) / 2),
        Math.round((a.before.head[1] + b.before.head[1]) / 2),
      ];
    }
  }
  return null;
}

// Each pressure stage has its own timbre, synchronized with the original loop.
const PRESSURE_THEMES = [
  { level: 1, name: 'build', volume: 0.22 },
  { level: 2, name: 'pressure', volume: 0.34 },
  { level: 3, name: 'tension', volume: 0.46 },
  { level: 4, name: 'critical', volume: 0.65 },
] as const;

function createAudio(src: string, loop = false): HTMLAudioElement {
  const audio = new Audio(src);
  audio.loop = loop;
  return audio;
}

const boundSoundFile = new WeakMap<HTMLAudioElement, string>();

export class GameAudioSystem {
  private menuMusic = createAudio('/sound/chain_duel_produced_menu.m4a', true);
  private music = createAudio('/sound/chain_duel_produced_game.m4a', true);
  private themes = PRESSURE_THEMES.map((theme) => ({
    ...theme,
    audio: createAudio(`/sound/chain_duel_${theme.name}.m4a`, true),
  }));
  private ending = createAudio('/sound/chain_duel_end.wav');
  private tensionLevel: TensionLevel = 0;
  private tensionHoldUntil = 0;
  private recipe: MatchRecipe = gameRecipe();
  private streakPlayer: number | null = null;
  private streakCount = 0;
  private previousPlayers: TensionPlayer[] | null = null;
  private mixTimer: ReturnType<typeof setInterval> | null = null;
  private endingPlayed = false;
  private previousBorder: GameState['shrinkBorder'] = null;
  /**
   * Config → Graphics → Sound effects & tension. Off skips every effect sound
   * plus the tension / streak / shrink tracking; music and the end jingle stay.
   */
  private readonly extras = readGraphicsSettings().soundAndTension;

  constructor() {
    for (const { audio } of this.themes) audio.volume = 0;
    this.applyRecipeFiles();
  }
  private beep1 = createAudio('/sound/Beep1.m4a');
  private beep2 = createAudio('/sound/Beep2.m4a');
  private p1Reset = createAudio('/sound/P1-HWAC.aac');
  private p2Reset = createAudio('/sound/P2-HWAC.aac');
  /** Same crash files as P1/P2, on their own elements so a shared tick can overlap. */
  private p3Reset = createAudio('/sound/P1-HWAC.aac');
  private p4Reset = createAudio('/sound/P2-HWAC.aac');
  private capture2 = createAudio('/sound/P-FC_2.aac');
  private capture4 = createAudio('/sound/P-FC_4.aac');
  private capture8 = createAudio('/sound/P-FC_8.aac');
  private capture16 = createAudio('/sound/P-FC_16.aac');
  private capture32 = createAudio('/sound/P-FC_32.aac');
  private blockFound = createAudio('/sound/MAINNET_BLOCK.aac');
  private powerUp = createAudio('/sound/powerup.mp3');
  private shrink = createAudio('/sound/chain_duel_shrink.m4a');

  /** Set by startMusic(); gates resume after unmute and avoids BGM before match load. */
  private musicShouldPlay = false;
  /** Full mute (speaker button) — blocks in-game SFX. */
  private appSfxMuted = false;
  /** Music mute (note button) or full mute — blocks looping BGM only. */
  private appMusicMuted = false;

  /** In-game SFX only (not the looping game music). */
  private readonly sfx: HTMLAudioElement[] = [
    this.beep1,
    this.beep2,
    this.p1Reset,
    this.p2Reset,
    this.p3Reset,
    this.p4Reset,
    this.capture2,
    this.capture4,
    this.capture8,
    this.capture16,
    this.capture32,
    this.blockFound,
    this.powerUp,
    this.ending,
    this.shrink,
  ];

  /**
   * Keeps in-game audio aligned with `AudioContext` / corner controls:
   * full mute silences everything; music-only mute pauses game BGM like the menu player.
   */
  applyAppMuteState(isMuted: boolean, isMusicMuted: boolean): void {
    this.appSfxMuted = isMuted;
    this.appMusicMuted = isMuted || isMusicMuted;

    for (const a of this.sfx) {
      a.muted = this.appSfxMuted;
    }

    if (this.appMusicMuted) {
      this.music.muted = true;
      this.music.pause();
      this.menuMusic.pause();
      this.menuMusic.muted = true;
      for (const { audio } of this.themes) {
        audio.pause();
        audio.muted = true;
      }
    } else {
      this.music.muted = false;
      if (this.musicShouldPlay) {
        this.playMusicLayers();
      }
    }
  }

  startMusic(): void {
    this.musicShouldPlay = true;
    // Without tension the layers never rise above 0, so skip the 20 Hz mix
    // (volume ramps plus seeks to keep five tracks in sync).
    if (this.mixTimer === null && this.extras) {
      this.mixTimer = setInterval(() => this.updateMix(), 50);
    }
    if (this.appMusicMuted) {
      return;
    }
    this.playMusicLayers();
  }

  stopAll(): void {
    if (this.endingPlayed) saveMenuMusicPosition(this.menuMusic.currentTime);
    this.musicShouldPlay = false;
    this.music.pause();
    this.menuMusic.pause();
    for (const { audio } of this.themes) audio.pause();
    for (const { audio } of this.themes) audio.volume = 0;
    this.music.volume = 1;
    this.tensionLevel = 0;
    this.tensionHoldUntil = 0;
    this.streakPlayer = null;
    this.streakCount = 0;
    this.previousPlayers = null;
    this.previousBorder = null;
    resetTensionDebug();
    if (this.mixTimer !== null) clearInterval(this.mixTimer);
    this.mixTimer = null;
    for (const audio of this.sfx) audio.pause();
  }

  /** Called for local frames and authoritative online/replay snapshots. */
  updateGameState(state: GameState): void {
    if (state.gameEnded) {
      if (!this.endingPlayed) {
        this.endingPlayed = true;
        this.stopAll();
        this.menuMusic.currentTime = 0;
        this.startMusic();
        this.play(this.ending, true);
      }
      return;
    }
    if (this.endingPlayed) {
      this.endingPlayed = false;
      this.ending.pause();
      this.menuMusic.pause();
      this.music.currentTime = 0;
      this.startMusic();
    }
    // Collision squares and wipe lines are board graphics. The tension mix is optional.
    if (!this.extras) {
      this.trackStreak(state);
      return;
    }
    const border = state.gameStarted ? state.shrinkBorder : null;
    const previous = this.previousBorder;
    if (
      border &&
      previous &&
      border.left >= previous.left &&
      border.right <= previous.right &&
      border.top >= previous.top &&
      border.bottom <= previous.bottom &&
      (border.left > previous.left ||
        border.right < previous.right ||
        border.top > previous.top ||
        border.bottom < previous.bottom)
    ) {
      this.play(this.shrink);
    }
    // Local simulation mutates the same border object; retain a value snapshot.
    this.previousBorder = border ? { ...border } : null;
    this.trackStreak(state);
    const breakdown = getTensionBreakdown(state, this.streakCount, this.recipe);
    const next = breakdown.level;
    const now = performance.now();
    if (next >= this.tensionLevel) {
      this.tensionLevel = next;
      this.tensionHoldUntil = now + this.recipe.holdMs;
    } else if (!state.gameStarted || now >= this.tensionHoldUntil) {
      this.tensionLevel = next;
    }
    const active = state.gameStarted && !state.gameEnded;
    publishTensionDebug(
      breakdown,
      active,
      active ? this.tensionLevel : 0,
      active && this.tensionLevel > next
    );
  }

  /**
   * A catch by the same player extends the streak. A death, or a catch by
   * someone else, clears it. The first snapshot only records a baseline.
   */
  private trackStreak(state: GameState): void {
    const players = tensionPlayers(state);
    const previous = this.previousPlayers;
    this.previousPlayers = players.map((player) => ({
      ...player,
      head: [...player.head] as TensionPlayer['head'],
    }));
    if (!previous || !state.gameStarted || state.gameEnded) {
      this.streakPlayer = null;
      this.streakCount = 0;
      return;
    }

    const reorged = reorgedLongChain(previous, players);
    const clash = reorged ? null : clashedHeads(previous, players);
    const toneFor = (index: number): 'white' | 'black' =>
      index === 0 ? 'white' : 'black';
    const resets = players.flatMap((player) => {
      const before = previous.find((entry) => entry.index === player.index);
      if (!before || before.eliminated || player.eliminated) return [];
      if (headTravel(before, player) <= 1) return [];
      if (player.length > before.length) return [];
      return [{ before, after: player }];
    });
    const lined = new Set<number>();
    if (reorged) {
      // Gold marks the crash. The line home is the chain's own color, below.
      pushCaptureRatePop(reorged.head, 'REORG', true, 'gold');
    } else if (clash) pushCaptureRatePop(clash, 'CLASH', true, 'gold');
    else {
      for (const { before, after } of resets) {
        // Wall, own body, or another body: one ordinary square in that chain's color.
        pushCaptureRatePop(
          before.head,
          'WALL',
          true,
          toneFor(before.index),
          after.head,
          before.color
        );
        lined.add(before.index);
      }
    }
    for (const { before, after } of resets) {
      if (lined.has(before.index)) continue;
      // Clash and REORG squares have no destination. The wipe is this chain's color.
      pushCaptureRatePop(
        before.head,
        'WIPE',
        true,
        toneFor(before.index),
        after.head,
        before.color
      );
    }
    for (const { after } of resets) {
      pushSpawnFlash(after.head, toneFor(after.index), after.color);
    }

    const died = new Set<number>();
    for (const player of players) {
      const before = previous.find((entry) => entry.index === player.index);
      if (!before) continue;
      if (player.eliminated && !before.eliminated) died.add(player.index);
      else if (player.length < before.length) died.add(player.index);
    }
    if (this.streakPlayer !== null && died.has(this.streakPlayer)) {
      this.streakPlayer = null;
      this.streakCount = 0;
    }

    const gainers = players.filter((player) => {
      const before = previous.find((entry) => entry.index === player.index);
      return before !== undefined && player.score > before.score;
    });
    if (gainers.length !== 1) {
      if (gainers.length > 1) {
        this.streakPlayer = null;
        this.streakCount = 0;
      }
      return;
    }

    const gainer = gainers[0];
    if (died.has(gainer.index)) return;
    if (this.streakPlayer === gainer.index) this.streakCount += 1;
    else {
      this.streakPlayer = gainer.index;
      this.streakCount = 1;
    }
  }

  private playMusicLayers(): void {
    if (this.endingPlayed) {
      this.menuMusic.muted = false;
      void this.menuMusic.play().catch(() => undefined);
      return;
    }
    this.music.muted = false;
    void this.music.play().catch(() => undefined);
    if (!this.extras) return;
    for (const { audio } of this.themes) {
      audio.muted = false;
      audio.currentTime = this.music.currentTime;
      void audio.play().catch(() => undefined);
    }
  }

  private updateMix(): void {
    if (this.appMusicMuted || !this.musicShouldPlay || this.endingPlayed) {
      this.publishHeardLayers();
      return;
    }
    let combinedVolume = 0;
    for (const theme of this.themes) {
      const { audio } = theme;
      const audible = this.audibleLevel();
      const target =
        audible === theme.level ? this.recipe.stemVolumes[theme.level - 1]! : 0;
      const fadeMs = Number.isFinite(this.recipe.fadeMs) ? this.recipe.fadeMs : 2500;
      const step =
        fadeMs <= 0 ? 1 : (50 / fadeMs) * (audio.volume < target ? 2 : 1);
      audio.volume +=
        Math.sign(target - audio.volume) *
        Math.min(step, Math.abs(target - audio.volume));
      combinedVolume += audio.volume;
      if (
        audio.readyState >= 1 &&
        Math.abs(audio.currentTime - this.music.currentTime) > 0.15
      ) {
        audio.currentTime = this.music.currentTime;
      }
    }
    this.music.volume = 1 - Math.min(1, combinedVolume) * this.recipe.duck;
    this.publishHeardLayers();
  }

  /**
   * Warning plays the pressure stem (mark 2). Critical plays the critical stem
   * (mark 4). A switched-off critical layer falls back to warning.
   */
  private audibleLevel(): number {
    const enabled = this.recipe.stemEnabled;
    if (this.tensionLevel >= 4 && enabled?.[3] !== false) return 4;
    if (this.tensionLevel >= 2 && enabled?.[1] !== false) return 2;
    return 0;
  }

  /** Base bed plus any pressure stem that still has volume during a crossfade. */
  private publishHeardLayers(): void {
    if (!this.musicShouldPlay || this.appMusicMuted) {
      publishTensionLayers([]);
      return;
    }
    if (this.endingPlayed) {
      publishTensionLayers([
        { name: 'end', volume: this.ending.paused ? 0 : 1 },
        { name: 'menu', volume: this.menuMusic.paused ? 0 : 1 },
      ]);
      return;
    }
    publishTensionLayers([
      { name: 'game', volume: this.music.volume },
      ...this.themes.map((theme) => ({
        name: theme.name,
        volume: theme.audio.volume,
      })),
    ]);
  }

  playCountdownTick(tick: number): void {
    if ([1, 11, 21].includes(tick)) {
      this.play(this.beep1);
    }
    if (tick === 31) {
      this.play(this.beep2);
    }
  }

  playReset(player: ResetCue | PlayerId): void {
    const audio =
      player === 'P1'
        ? this.p1Reset
        : player === 'P3'
          ? this.p3Reset
          : player === 'P4'
            ? this.p4Reset
            : this.p2Reset;
    this.play(audio);
  }

  setRecipe(recipe: MatchRecipe): void {
    this.recipe = recipe;
    this.applyRecipeFiles();
  }

  private applyRecipeFiles(): void {
    this.bindFile(this.music, this.recipe.bedFile, true);
    this.themes.forEach((theme, index) => {
      this.bindFile(theme.audio, this.recipe.stemFiles[index]!, true);
    });
  }

  private bindFile(audio: HTMLAudioElement, file: string, loop: boolean): void {
    audio.loop = loop;
    const bound = boundSoundFile.get(audio);
    if (bound === file) return;
    boundSoundFile.set(audio, file);
    if (bound == null && audio.src.includes(file)) return;
    const playing = audio.paused === false;
    const time = audio.currentTime;
    audio.src = `/sound/${file}`;
    if (!playing) return;
    const resume = () => {
      if (Number.isFinite(time) && time > 0) {
        try {
          audio.currentTime = time;
        } catch {
          // A shorter file cannot seek that far.
        }
      }
      void audio.play().catch(() => undefined);
    };
    if (audio.readyState >= 1) resume();
    else audio.addEventListener('loadedmetadata', resume, { once: true });
  }

  playCapture(bodyLength: number): void {
    const clip = captureClipForLength(
      bodyLength,
      this.recipe.captureFrom,
      this.recipe.capturePercent
    );
    const audio =
      clip >= 32
        ? this.capture32
        : clip >= 16
          ? this.capture16
          : clip >= 8
            ? this.capture8
            : clip >= 4
              ? this.capture4
              : this.capture2;
    this.play(audio);
  }

  playBlockFound(): void {
    this.play(this.blockFound);
  }

  playPowerUp(): void {
    this.play(this.powerUp);
  }

  /** `always` keeps the end jingle when sound effects are turned off in Config. */
  private play(audio: HTMLAudioElement, always = false): void {
    if (this.appSfxMuted || (!this.extras && !always)) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }
}
