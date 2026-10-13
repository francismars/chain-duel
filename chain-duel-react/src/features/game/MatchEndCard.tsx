import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import type { GameState } from '@/game/engine/types';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { SoloZapRadiatingLines } from '@/features/game/SoloZapRadiatingLines';
import {
  matchEndFigure,
  winnerSats,
} from '@/game/render/endGameOverlay';
import { isPracticeFreePlayConfig } from '@/pages/practiceHubModes';

type EndCopy = {
  winner: string;
  kicker: string;
  figure: ReturnType<typeof matchEndFigure>;
  prompt: string;
};

function matchEndKicker(cfg: Record<string, unknown>): string {
  const hud = [cfg.practiceHudLabel, cfg.localHudLabel, cfg.testnetHudLabel].find(
    (value) => typeof value === 'string' && value.trim()
  );
  const mode = typeof hud === 'string' ? hud.trim() : '';
  return mode ? `${mode} / MATCH COMPLETE` : 'MATCH COMPLETE';
}

function readCopy(
  state: GameState,
  continueLabel: string | null | undefined
): EndCopy {
  let freeGame = false;
  let cfg: Record<string, unknown> = {};
  try {
    const raw = sessionStorage.getItem('gameConfig');
    cfg = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    freeGame = isPracticeFreePlayConfig(cfg);
  } catch {
    freeGame = false;
  }
  const prompt =
    continueLabel === ''
      ? ''
      : (continueLabel ?? 'PRESS ANY BUTTON TO CONTINUE');
  return {
    winner: state.winnerName?.trim() || 'WINNER',
    kicker: matchEndKicker(cfg),
    figure: matchEndFigure(freeGame, winnerSats(state)),
    prompt,
  };
}

/** Match-complete card above the board. Radiating lines sit behind the copy. */
export function MatchEndCard({
  getState,
  suppressedRef,
  continueLabelRef,
  hidden = false,
}: {
  getState: () => GameState | null;
  suppressedRef?: MutableRefObject<boolean>;
  continueLabelRef?: MutableRefObject<string | null>;
  hidden?: boolean;
}) {
  const [copy, setCopy] = useState<EndCopy | null>(null);
  const getStateRef = useRef(getState);
  getStateRef.current = getState;

  useEffect(() => {
    let frame = 0;
    let key = '';
    const tick = () => {
      const state = getStateRef.current();
      const show = Boolean(
        state?.gameEnded &&
          !hidden &&
          !suppressedRef?.current &&
          (state.winnerName.length > 0 || state.winnerPlayer)
      );
      if (!show) {
        if (key) {
          key = '';
          setCopy(null);
        }
      } else if (state) {
        const next = readCopy(state, continueLabelRef?.current);
        const nextKey = `${next.winner}|${next.kicker}|${next.figure.kind}|${next.prompt}`;
        if (nextKey !== key) {
          key = nextKey;
          setCopy(next);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [continueLabelRef, hidden, suppressedRef]);

  if (!copy) return null;

  return createPortal(
    <div className="match-end-layer">
      <SoloZapRadiatingLines className="end-screen-rays match-end-layer__rays" />
      <div className="match-end-card">
        <Sponsorship id="sponsorship-match-end" />
        <p className="match-end-card__kicker">{copy.kicker}</p>
        <p className="match-end-card__name">{copy.winner.toUpperCase()}</p>
        <p className="match-end-card__wins">WINS</p>
        {copy.figure.kind === 'sats' ? (
          <p className="match-end-card__sats">{copy.figure.label}</p>
        ) : (
          <div className="match-end-card__free">
            <p className="match-end-card__sats">{copy.figure.title}</p>
            <p className="match-end-card__note">{copy.figure.note}</p>
          </div>
        )}
        {copy.prompt ? (
          <p className="match-end-card__prompt">{copy.prompt}</p>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
