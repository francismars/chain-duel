import type { GameState, PlayerId } from '@/game/engine/types';
import { getTensionLevel, type TensionLevel } from './tension';
import { saveMenuMusicPosition } from './resultMusicHandoff';

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

export class GameAudioSystem {
  private menuMusic = createAudio('/sound/chain_duel_produced_menu.m4a', true);
  private music = createAudio('/sound/chain_duel_produced_game.m4a', true);
  private themes = PRESSURE_THEMES.map((theme) => ({
    ...theme,
    audio: createAudio(`/sound/chain_duel_${theme.name}.m4a`, true),
  }));
  private ending = createAudio('/sound/chain_duel_end.m4a');
  private tensionLevel: TensionLevel = 0;
  private tensionHoldUntil = 0;
  private mixTimer: ReturnType<typeof setInterval> | null = null;
  private endingPlayed = false;
  private previousBorder: GameState['shrinkBorder'] = null;

  constructor() {
    for (const { audio } of this.themes) audio.volume = 0;
  }
  private beep1 = createAudio('/sound/Beep1.m4a');
  private beep2 = createAudio('/sound/Beep2.m4a');
  private p1Reset = createAudio('/sound/P1-HWAC.aac');
  private p2Reset = createAudio('/sound/P2-HWAC.aac');
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
    if (this.mixTimer === null) {
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
    this.previousBorder = null;
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
        this.play(this.ending);
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
    const next = getTensionLevel(state);
    const now = performance.now();
    if (next >= this.tensionLevel) {
      this.tensionLevel = next;
      this.tensionHoldUntil = now + 4000;
    } else if (!state.gameStarted || now >= this.tensionHoldUntil) {
      this.tensionLevel = next;
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
    for (const { audio } of this.themes) {
      audio.muted = false;
      audio.currentTime = this.music.currentTime;
      void audio.play().catch(() => undefined);
    }
  }

  private updateMix(): void {
    if (this.appMusicMuted || !this.musicShouldPlay || this.endingPlayed)
      return;
    let combinedVolume = 0;
    for (const theme of this.themes) {
      const { audio } = theme;
      const target = this.tensionLevel === theme.level ? theme.volume : 0;
      // Crossfade themes without restarting their musical phrases.
      const step = audio.volume < target ? 0.02 : 0.01;
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
    this.music.volume = 1 - Math.min(1, combinedVolume) * 0.35;
  }

  playCountdownTick(tick: number): void {
    if ([1, 11, 21].includes(tick)) {
      this.play(this.beep1);
    }
    if (tick === 31) {
      this.play(this.beep2);
    }
  }

  playReset(player: PlayerId): void {
    this.play(player === 'P1' ? this.p1Reset : this.p2Reset);
  }

  playCapture(bodyLength: number): void {
    if (bodyLength <= 1) this.play(this.capture2);
    else if (bodyLength <= 2) this.play(this.capture4);
    else if (bodyLength < 8) this.play(this.capture8);
    else if (bodyLength < 16) this.play(this.capture16);
    else this.play(this.capture32);
  }

  playBlockFound(): void {
    this.play(this.blockFound);
  }

  playPowerUp(): void {
    this.play(this.powerUp);
  }

  private play(audio: HTMLAudioElement): void {
    if (this.appSfxMuted) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }
}
