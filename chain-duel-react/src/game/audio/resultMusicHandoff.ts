export const MENU_MUSIC_SRC = '/sound/chain_duel_produced_menu.m4a';
let resultPosition: number | null = null;

/** Preserve the loop position when the end screen hands off to the results route. */
export function saveMenuMusicPosition(seconds: number): void {
  resultPosition = seconds;
}

export function resumeMenuMusicPosition(audio: HTMLAudioElement): void {
  if (resultPosition === null || !audio.src.endsWith(MENU_MUSIC_SRC)) return;
  audio.currentTime = resultPosition;
  resultPosition = null;
}
