import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { GameState } from '@/game/engine/types';
import {
  MATCH_OBJECTIVES,
  resolveStartPromptWords,
  type CanvasObjectivesOpts,
} from '@/game/render/matchObjectives';

type PromptCopy = {
  words: readonly string[];
  altWords: readonly string[] | null;
  subtext: string;
  stakesHint: string;
};

function readCopy(opts: CanvasObjectivesOpts | undefined): PromptCopy {
  const alt = opts?.startPromptAltWords;
  return {
    words: resolveStartPromptWords(opts),
    altWords: alt && alt.length > 0 ? alt : null,
    subtext: opts?.startPromptSubtext?.trim() ?? '',
    stakesHint: opts?.stakesHint?.trim() ?? '',
  };
}

function copyKey(copy: PromptCopy): string {
  return `${copy.words.join('|')}\n${copy.altWords?.join('|') ?? ''}\n${copy.subtext}\n${copy.stakesHint}`;
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
  const [cycleIndex, setCycleIndex] = useState(0);
  const [lineFading, setLineFading] = useState(false);
  const phraseKey = copyKey(copy);
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

  useEffect(() => {
    setCycleIndex(0);
    setLineFading(false);
  }, [phraseKey]);

  useEffect(() => {
    if (!copy.altWords || !visible) return;
    const hold = window.setTimeout(() => setLineFading(true), 2800);
    return () => window.clearTimeout(hold);
  }, [copy.altWords, visible, cycleIndex, phraseKey]);

  useEffect(() => {
    if (!lineFading) return;
    const swap = window.setTimeout(() => {
      setCycleIndex((index) => (index === 0 ? 1 : 0));
      setLineFading(false);
    }, 420);
    return () => window.clearTimeout(swap);
  }, [lineFading]);

  const activeWords =
    cycleIndex === 1 && copy.altWords ? copy.altWords : copy.words;

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
      <div className="match-start__prompt">
        <div
          className={`match-start__line${lineFading ? ' is-fading' : ''}`}
          key={`${phraseKey}-${cycleIndex}`}
        >
          {activeWords.map((word, index) => (
            <span
              className="match-start__word"
              key={`${word}-${index}`}
              style={{
                animationDelay: `${index * 220}ms, ${1.15 + index * 0.22}s`,
              }}
            >
              {word}
            </span>
          ))}
        </div>
        {copy.subtext ? (
          <p
            className="match-start__sub"
            style={{ animationDelay: `${activeWords.length * 220 + 80}ms` }}
          >
            {copy.subtext}
          </p>
        ) : null}
      </div>
    </div>
  );
}
