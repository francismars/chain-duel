import { describe, expect, it } from 'vitest';
import { localStartPromptWords } from '@/game/render/matchObjectives';

describe('localStartPromptWords', () => {
  it('names Space and Enter when both humans use the keyboard', () => {
    expect(localStartPromptWords(true, true)).toEqual({
      words: ['PRESS', 'SPACE', 'TO', 'START'],
      altWords: ['PRESS', 'ENTER', 'TO', 'START'],
    });
  });

  it('says Button for a seat that is showing a controller', () => {
    expect(localStartPromptWords(true, true, { p1: true })).toEqual({
      words: ['PRESS', 'BUTTON', 'TO', 'START'],
      altWords: ['PRESS', 'ENTER', 'TO', 'START'],
    });
    expect(localStartPromptWords(true, false, { p1: true })).toEqual({
      words: ['PRESS', 'BUTTON', 'TO', 'START'],
    });
    expect(localStartPromptWords(true, true, { p1: true, p2: true })).toEqual({
      words: ['PRESS', 'BUTTON', 'TO', 'START'],
    });
  });
});
