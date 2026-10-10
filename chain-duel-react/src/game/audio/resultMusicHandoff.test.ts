import { describe, expect, it } from 'vitest';
import {
  MENU_MUSIC_SRC,
  resumeMenuMusicPosition,
  saveMenuMusicPosition,
} from './resultMusicHandoff';

describe('results music handoff', () => {
  it('resumes the saved position once, and leaves other tracks alone', () => {
    saveMenuMusicPosition(23.5);
    const menu = {
      src: '/sound/chain_duel_produced_game.m4a',
      currentTime: 0,
    } as HTMLAudioElement;
    resumeMenuMusicPosition(menu);
    expect(menu.currentTime).toBe(0);
    const result = {
      src: `http://localhost${MENU_MUSIC_SRC}`,
      currentTime: 0,
    } as HTMLAudioElement;
    resumeMenuMusicPosition(result);
    expect(result.currentTime).toBe(23.5);
    result.currentTime = 25;
    resumeMenuMusicPosition(result);
    expect(result.currentTime).toBe(25);
  });
});
