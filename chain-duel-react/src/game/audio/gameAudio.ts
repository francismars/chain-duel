import type { PlayerId } from '@/game/engine/types';

function createAudio(src: string, loop = false): HTMLAudioElement {
  const audio = new Audio(src);
  audio.loop = loop;
  return audio;
}

export class GameAudioSystem {
  private music = createAudio('/sound/chain_duel_produced_game.m4a', true);
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
    } else {
      this.music.muted = false;
      if (this.musicShouldPlay) {
        void this.music.play().catch(() => undefined);
      }
    }
  }

  startMusic(): void {
    this.musicShouldPlay = true;
    if (this.appMusicMuted) {
      return;
    }
    this.music.muted = false;
    void this.music.play().catch(() => undefined);
  }

  stopAll(): void {
    this.musicShouldPlay = false;
    this.music.pause();
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
