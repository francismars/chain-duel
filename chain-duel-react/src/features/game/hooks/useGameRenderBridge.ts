import { useEffect, useRef, type MutableRefObject } from 'react';
import { getHudState, stepGame } from '@/game/engine';
import type { FfaHudPlayer, GameState } from '@/game/engine/types';
import { STEP_SPEED_MS } from '@/game/engine/constants';
import type { PixiGameRenderer } from '@/game/render/pixiRenderer';
import type { GameAudioSystem } from '@/game/audio/gameAudio';

interface HudSnapshot {
  p1Points: number;
  p2Points: number;
  captureP1: string;
  captureP2: string;
  currentWidthP1: number;
  currentWidthP2: number;
  ffa?: { players: FfaHudPlayer[] };
}

const MAX_SIM_STEPS_PER_FRAME = 8;

function ffaHudEqual(a?: HudSnapshot['ffa'], b?: HudSnapshot['ffa']): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.players.length !== b.players.length) return false;
  return a.players.every((p, i) => {
    const q = b.players[i];
    return (
      p.score === q.score &&
      p.capture === q.capture &&
      Math.round(p.currentShare * 10) === Math.round(q.currentShare * 10)
    );
  });
}

function hudSnapshotEqual(a: HudSnapshot, b: HudSnapshot): boolean {
  return (
    a.p1Points === b.p1Points &&
    a.p2Points === b.p2Points &&
    a.captureP1 === b.captureP1 &&
    a.captureP2 === b.captureP2 &&
    a.currentWidthP1 === b.currentWidthP1 &&
    a.currentWidthP2 === b.currentWidthP2 &&
    ffaHudEqual(a.ffa, b.ffa)
  );
}

interface UseGameRenderBridgeArgs {
  loading: boolean;
  stateRef: MutableRefObject<GameState | null>;
  rendererRef: MutableRefObject<PixiGameRenderer | null>;
  audioRef: MutableRefObject<GameAudioSystem | null>;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  winnerSentRef: MutableRefObject<boolean>;
  captureP1Ref: MutableRefObject<string>;
  captureP2Ref: MutableRefObject<string>;
  createRenderer: () => PixiGameRenderer;
  emitWinner: (winner: 'P1' | 'P2') => void;
  onHudTick: (hud: HudSnapshot) => void;
  onCaptureChanged: (side: 'P1' | 'P2') => void;
  onSpeedChanged?: (stepMs: number) => void;
  simStepRef?: MutableRefObject<number>;
  /** When set, record P1 direction changes at sim step boundaries (challenge replay). */
  challengeInputLogRef?: MutableRefObject<Array<{ tick: number; dir: string }>>;
  /** Optional canvas continue hint while challenge bounty is validating. */
  challengeContinueLabelRef?: MutableRefObject<string | null>;
}

/** Wait until #gameContainer is visible and laid out (drops `display:none` hide class). */
function waitForHostVisible(host: HTMLElement, maxFrames = 24): Promise<void> {
  return new Promise((resolve) => {
    let frames = 0;
    const tick = () => {
      frames += 1;
      const rect = host.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        resolve();
        return;
      }
      if (frames >= maxFrames) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function useGameRenderBridge({
  loading,
  stateRef,
  rendererRef,
  audioRef,
  hostRef,
  winnerSentRef,
  captureP1Ref,
  captureP2Ref,
  createRenderer,
  emitWinner,
  onHudTick,
  onCaptureChanged,
  onSpeedChanged,
  simStepRef,
  challengeInputLogRef,
  challengeContinueLabelRef,
}: UseGameRenderBridgeArgs) {
  const emitWinnerRef = useRef(emitWinner);
  const onHudTickRef = useRef(onHudTick);
  const onCaptureChangedRef = useRef(onCaptureChanged);
  const onSpeedChangedRef = useRef(onSpeedChanged);
  emitWinnerRef.current = emitWinner;
  onHudTickRef.current = onHudTick;
  onCaptureChangedRef.current = onCaptureChanged;
  onSpeedChangedRef.current = onSpeedChanged;

  useEffect(() => {
    if (loading || !hostRef.current || !stateRef.current) return;

    let mounted = true;
    let cancelled = false;
    let mountReady = false;
    const host = hostRef.current;
    const audio = audioRef.current;
    const renderer = createRenderer();
    rendererRef.current = renderer;

    let detachResize: (() => void) | undefined;
    let lastFrameMs = performance.now();
    let countdownAccum = 0;
    let gameplayAccum = 0;
    let lastReportedStepMs = STEP_SPEED_MS;
    let lastHud: HudSnapshot | null = null;
    let lastLoggedP1Dir = '';

    const recordChallengeInput = (state: GameState) => {
      if (!challengeInputLogRef || !simStepRef || !state.meta.p1Human) return;
      const dir = state.p1.dirWanted;
      if (!dir || dir === lastLoggedP1Dir) return;
      lastLoggedP1Dir = dir;
      challengeInputLogRef.current.push({ tick: simStepRef.current, dir });
    };

    const renderOpts = () => {
      const label = challengeContinueLabelRef?.current;
      return label ? { challengeContinueLabel: label } : undefined;
    };

    void (async () => {
      await waitForHostVisible(host);
      if (cancelled || !mounted) return;
      await renderer.mount(host);
      if (cancelled || !mounted) {
        renderer.destroy();
        return;
      }
      mountReady = true;
      renderer.resize();
      const initialState = stateRef.current;
      if (initialState) {
        lastLoggedP1Dir = initialState.p1.dirWanted || 'Right';
        renderer.render(initialState, renderOpts());
      }
      const onResize = () => {
        renderer.resize();
      };
      window.addEventListener('resize', onResize);
      const ro = new ResizeObserver(onResize);
      ro.observe(host);
      detachResize = () => {
        window.removeEventListener('resize', onResize);
        ro.disconnect();
      };
    })();

    const applyHud = (hud: HudSnapshot) => {
      if (lastHud && hudSnapshotEqual(lastHud, hud)) return;
      lastHud = hud;
      onHudTickRef.current(hud);
      if (hud.captureP1 !== captureP1Ref.current) {
        onCaptureChangedRef.current('P1');
      }
      if (hud.captureP2 !== captureP2Ref.current) {
        onCaptureChangedRef.current('P2');
      }
      captureP1Ref.current = hud.captureP1;
      captureP2Ref.current = hud.captureP2;
    };

    const runSimulation = (state: GameState, deltaMs: number): void => {
      if (state.countdownStart && !state.gameStarted) {
        countdownAccum += deltaMs;
        let steps = 0;
        while (
          countdownAccum >= STEP_SPEED_MS &&
          steps < MAX_SIM_STEPS_PER_FRAME
        ) {
          countdownAccum -= STEP_SPEED_MS;
          steps += 1;
          const prevCountdown = state.countdownTicks;
          recordChallengeInput(state);
          stepGame(state);
          if (simStepRef) simStepRef.current += 1;
          if (state.countdownStart && state.countdownTicks !== prevCountdown) {
            audio?.playCountdownTick(state.countdownTicks);
          }
        }
        return;
      }

      if (!state.gameStarted || state.gameEnded) {
        countdownAccum = 0;
        gameplayAccum = 0;
        return;
      }

      countdownAccum = 0;
      const stepMs = state.meta?.currentStepMs ?? STEP_SPEED_MS;
      gameplayAccum += deltaMs;
      let steps = 0;
      while (gameplayAccum >= stepMs && steps < MAX_SIM_STEPS_PER_FRAME) {
        gameplayAccum -= stepMs;
        steps += 1;

        const prevP1Len = state.p1.body.length;
        const prevP2Len = state.p2.body.length;
        const prevExtraLen = state.extraSnakes[0]?.body.length ?? 1;
        const prevP1Head = [...state.p1.head] as [number, number];
        const prevP2Head = [...state.p2.head] as [number, number];
        const prevStepMs = state.meta?.currentStepMs ?? STEP_SPEED_MS;
        const prevPowerUpItems = state.powerUpItems.length;

        recordChallengeInput(state);
        stepGame(state);
        if (simStepRef) simStepRef.current += 1;

        if (state.powerUpItems.length < prevPowerUpItems) {
          audio?.playPowerUp();
        }

        const hud = getHudState(state);
        applyHud({
          p1Points: hud.p1Points,
          p2Points: hud.p2Points,
          captureP1: hud.captureP1,
          captureP2: hud.captureP2,
          currentWidthP1: hud.currentWidthP1,
          currentWidthP2: hud.currentWidthP2,
          ffa: hud.ffa,
        });

        const newStepMs = state.meta?.currentStepMs ?? STEP_SPEED_MS;
        if (newStepMs !== prevStepMs && newStepMs !== lastReportedStepMs) {
          lastReportedStepMs = newStepMs;
          onSpeedChangedRef.current?.(newStepMs);
          audio?.playBlockFound();
        }

        if (state.p1.body.length > prevP1Len)
          audio?.playCapture(state.p1.body.length);
        if (state.p2.body.length > prevP2Len)
          audio?.playCapture(state.p2.body.length);
        const extraLen = state.extraSnakes[0]?.body.length ?? 1;
        if (extraLen > prevExtraLen)
          audio?.playCapture(extraLen);

        if (
          (prevP1Head[0] !== 6 || prevP1Head[1] !== 12) &&
          state.p1.head[0] === 6 &&
          state.p1.head[1] === 12
        ) {
          audio?.playReset('P1');
        }
        if (
          (prevP2Head[0] !== 44 || prevP2Head[1] !== 12) &&
          state.p2.head[0] === 44 &&
          state.p2.head[1] === 12
        ) {
          audio?.playReset('P2');
        }

        if (state.gameEnded && state.winnerPlayer && !winnerSentRef.current) {
          emitWinnerRef.current(state.winnerPlayer);
          winnerSentRef.current = true;
        }
      }
    };

    let frameRef = 0;
    const frame = (now: number) => {
      if (!mounted) return;
      const state = stateRef.current;
      const deltaMs = Math.min(100, Math.max(0, now - lastFrameMs));
      lastFrameMs = now;

      if (mountReady && state) {
        runSimulation(state, deltaMs);
        renderer.render(state, renderOpts());
      }

      frameRef = window.requestAnimationFrame(frame);
    };
    frameRef = window.requestAnimationFrame(frame);

    return () => {
      mounted = false;
      cancelled = true;
      if (detachResize) detachResize();
      window.cancelAnimationFrame(frameRef);
      rendererRef.current = null;
      renderer.destroy();
      audio?.stopAll();
    };
  }, [
    loading,
    createRenderer,
    audioRef,
    captureP1Ref,
    captureP2Ref,
    challengeInputLogRef,
    challengeContinueLabelRef,
    hostRef,
    rendererRef,
    simStepRef,
    stateRef,
    winnerSentRef,
  ]);
}
