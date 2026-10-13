import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { GameState } from '@/game/engine/types';
import {
  MATCH_OBJECTIVES,
  resolveStartPromptWords,
  type CanvasObjectivesOpts,
} from '@/game/render/matchObjectives';

type PromptCopy = {
  words: readonly string[];
  subtext: string;
  stakesHint: string;
};

function readCopy(opts: CanvasObjectivesOpts | undefined): PromptCopy {
  return {
    words: resolveStartPromptWords(opts),
    subtext: opts?.startPromptSubtext?.trim() ?? '',
    stakesHint: opts?.stakesHint?.trim() ?? '',
  };
}

function copyKey(copy: PromptCopy): string {
  return `${copy.words.join('|')}\n${copy.subtext}\n${copy.stakesHint}`;
}

/** Pre-match objective cycle and start line, laid out in the DOM over the board. */
export function MatchStartPrompt({
  getState,
  optsRef,
}: {
  getState: () => GameState | null;
  optsRef: MutableRefObject<CanvasObjectivesOpts>;
}) {
  const [visible, setVisible] = useState(false);
  const [copy, setCopy] = useState<PromptCopy>(() => readCopy(optsRef.current));
  const getStateRef = useRef(getState);
  getStateRef.current = getState;

  useEffect(() => {
    let frame = 0;
    let shown = false;
    let key = copyKey(readCopy(optsRef.current));

    const tick = () => {
      const state = getStateRef.current();
      const board = document.getElementById('gameCanvas');
      const fromState = Boolean(
        state && !state.gameStarted && !state.gameEnded && !state.countdownStart
      );
      const nextShown = fromState || Boolean(board?.classList.contains('is-prematch'));
      if (nextShown !== shown) {
        shown = nextShown;
        setVisible(nextShown);
      }
      if (nextShown) {
        const next = readCopy(optsRef.current);
        const nextKey = copyKey(next);
        if (nextKey !== key) {
          key = nextKey;
          setCopy(next);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [optsRef]);

  if (!visible) return null;

  return (
    <div className="match-start" aria-hidden={false}>
      <div className="match-start__objectives">
        {MATCH_OBJECTIVES.map((item) => (
          <div className="match-start__card" key={item.title}>
            <div className="match-start__title">{item.title}</div>
            <p className="match-start__body">{item.body}</p>
          </div>
        ))}
      </div>
      {copy.stakesHint ? (
        <p className="match-start__stakes">{copy.stakesHint}</p>
      ) : null}
      <div className="match-start__line">
        {copy.words.map((word, index) => (
          <span
            className="match-start__word"
            key={`${word}-${index}`}
            style={{ animationDelay: `${index * 105}ms, ${1.5 + index * 0.1}s` }}
          >
            {word}
          </span>
        ))}
      </div>
      {copy.subtext ? <p className="match-start__sub">{copy.subtext}</p> : null}
    </div>
  );
}
