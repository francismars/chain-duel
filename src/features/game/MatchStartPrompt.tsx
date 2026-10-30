import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { GameState } from '@/game/engine/types';
import { isCoarsePointer } from '@/shared/utils/inputMode';
import {
  connectedPreMatchPadIndices,
  preMatchGamepadIndex,
} from '@/game/render/preMatchGamepad';
import {
  localStartPromptWords,
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

const TAP_TO_START = ['TAP', 'TO', 'START'] as const;

function isKeyboardStartLine(words: readonly string[] | undefined): boolean {
  if (!words || words.length === 0) return true;
  const line = words.join(' ');
  return (
    line === 'PRESS SPACE TO START' ||
    line === 'PRESS ENTER TO START' ||
    line === 'PRESS BUTTON TO START'
  );
}

function readCopy(opts: CanvasObjectivesOpts | undefined): PromptCopy {
  const slots = opts?.controlSlots ?? [];
  const seated = slots.includes('p1') || slots.includes('p2');
  const localLine =
    isKeyboardStartLine(opts?.startPromptWords) &&
    isKeyboardStartLine(opts?.startPromptAltWords);
  if (seated && localLine && isCoarsePointer()) {
    // Phones / tablets start with a tap (the landscape stick sends the confirm key).
    return {
      words: TAP_TO_START,
      altWords: null,
      // Keyboard-only hints ("PRESS X TO SWITCH…") don't apply to a finger.
      subtext: /^PRESS\b/i.test(opts?.startPromptSubtext?.trim() ?? '')
        ? ''
        : (opts?.startPromptSubtext?.trim() ?? ''),
      stakesHint: opts?.stakesHint?.trim() ?? '',
    };
  }
  if (seated && localLine) {
    const connected = connectedPreMatchPadIndices();
    const prompt = localStartPromptWords(
      slots.includes('p1'),
      slots.includes('p2'),
      {
        p1: preMatchGamepadIndex('p1', slots, connected) !== null,
        p2: preMatchGamepadIndex('p2', slots, connected) !== null,
      }
    );
    return {
      words: prompt.words,
      altWords:
        prompt.altWords && prompt.altWords.length > 0 ? prompt.altWords : null,
      subtext: opts?.startPromptSubtext?.trim() ?? '',
      stakesHint: opts?.stakesHint?.trim() ?? '',
    };
  }
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
      const nextShown =
        fromState || Boolean(board?.classList.contains('is-prematch'));
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
