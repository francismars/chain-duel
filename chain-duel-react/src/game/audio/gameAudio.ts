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

  startMusic(): void {
    void this.music.play().catch(() => undefined);
  }

  stopAll(): void {
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

  private play(audio: HTMLAudioElement): void {
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }
}
