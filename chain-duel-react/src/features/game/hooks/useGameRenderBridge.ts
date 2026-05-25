import { useEffect, type MutableRefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { getHudState, stepGame } from '@/game/engine';
import type { GameState } from '@/game/engine/types';
import { STEP_SPEED_MS } from '@/game/engine/constants';
import type { PixiGameRenderer } from '@/game/render/pixiRenderer';
import type { GameAudioSystem } from '@/game/audio/gameAudio';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket';

interface HudSnapshot {
  p1Points: number;
  p2Points: number;
  captureP1: string;
  captureP2: string;
  currentWidthP1: number;
  currentWidthP2: number;
}

const MAX_SIM_STEPS_PER_FRAME = 8;

function hudSnapshotEqual(a: HudSnapshot, b: HudSnapshot): boolean {
  return (
    a.p1Points === b.p1Points &&
    a.p2Points === b.p2Points &&
    a.captureP1 === b.captureP1 &&
    a.captureP2 === b.captureP2 &&
    a.currentWidthP1 === b.currentWidthP1 &&
    a.currentWidthP2 === b.currentWidthP2
  );
}

interface UseGameRenderBridgeArgs {
  loading: boolean;
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
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
}

export function useGameRenderBridge({
  loading,
  socket,
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
}: UseGameRenderBridgeArgs) {
  useEffect(() => {
    if (!hostRef.current || !stateRef.current || loading) return;
    let mounted = true;
    const audio = audioRef.current;
    const renderer = createRenderer();
    rendererRef.current = renderer;

    let detachResize: (() => void) | undefined;
    let forcePaint = true;
    let lastFrameMs = performance.now();
    let countdownAccum = 0;
    let gameplayAccum = 0;
    let lastReportedStepMs = STEP_SPEED_MS;
    let lastHud: HudSnapshot | null = null;

    void renderer.mount(hostRef.current).then(() => {
      if (!mounted) return;
      renderer.resize();
      forcePaint = true;
      const onResize = () => {
        renderer.resize();
        forcePaint = true;
      };
      window.addEventListener('resize', onResize);
      detachResize = () => window.removeEventListener('resize', onResize);
    });

    const applyHud = (hud: HudSnapshot) => {
      if (lastHud && hudSnapshotEqual(lastHud, hud)) return;
      lastHud = hud;
      onHudTick(hud);
      if (hud.captureP1 !== captureP1Ref.current) {
        onCaptureChanged('P1');
      }
      if (hud.captureP2 !== captureP2Ref.current) {
        onCaptureChanged('P2');
      }
      captureP1Ref.current = hud.captureP1;
      captureP2Ref.current = hud.captureP2;
    };

    const runSimulation = (state: GameState, deltaMs: number): boolean => {
      let stepped = false;

      if (state.countdownStart && !state.gameStarted) {
        countdownAccum += deltaMs;
        let steps = 0;
        while (countdownAccum >= STEP_SPEED_MS && steps < MAX_SIM_STEPS_PER_FRAME) {
          countdownAccum -= STEP_SPEED_MS;
          steps += 1;
          const prevCountdown = state.countdownTicks;
          stepGame(state);
          stepped = true;
          if (state.countdownStart && state.countdownTicks !== prevCountdown) {
            audio?.playCountdownTick(state.countdownTicks);
          }
        }
        return stepped;
      }

      if (!state.gameStarted || state.gameEnded) {
        countdownAccum = 0;
        gameplayAccum = 0;
        return false;
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
        const prevP1Head = [...state.p1.head] as [number, number];
        const prevP2Head = [...state.p2.head] as [number, number];
        const prevStepMs = state.meta?.currentStepMs ?? STEP_SPEED_MS;

        stepGame(state);
        stepped = true;

        const hud = getHudState(state);
        applyHud(hud);

        const newStepMs = state.meta?.currentStepMs ?? STEP_SPEED_MS;
        if (newStepMs !== prevStepMs && newStepMs !== lastReportedStepMs) {
          lastReportedStepMs = newStepMs;
          onSpeedChanged?.(newStepMs);
          audio?.playBlockFound();
        }

        if (state.p1.body.length > prevP1Len) audio?.playCapture(state.p1.body.length);
        if (state.p2.body.length > prevP2Len) audio?.playCapture(state.p2.body.length);

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

        if (state.gameEnded && state.winnerPlayer && socket && !winnerSentRef.current) {
          emitWinner(state.winnerPlayer);
          winnerSentRef.current = true;
        }
      }

      return stepped;
    };

    let frameRef = 0;
    const frame = (now: number) => {
      if (!mounted) return;
      const state = stateRef.current;
      const deltaMs = Math.min(100, Math.max(0, now - lastFrameMs));
      lastFrameMs = now;

      if (state && rendererRef.current) {
        const simStepped = runSimulation(state, deltaMs);
        const animActive = rendererRef.current.needsPaint(state, now);
        if (simStepped || animActive || forcePaint) {
          rendererRef.current.render(state);
          forcePaint = false;
        }
      }

      frameRef = window.requestAnimationFrame(frame);
    };
    frameRef = window.requestAnimationFrame(frame);

    return () => {
      mounted = false;
      if (detachResize) detachResize();
      window.cancelAnimationFrame(frameRef);
      renderer.destroy();
      audio?.stopAll();
    };
  }, [
    audioRef,
    captureP1Ref,
    captureP2Ref,
    createRenderer,
    emitWinner,
    hostRef,
    loading,
    onCaptureChanged,
    onHudTick,
    onSpeedChanged,
    rendererRef,
    socket,
    stateRef,
    winnerSentRef,
  ]);
}
