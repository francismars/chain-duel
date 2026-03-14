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
}: UseGameRenderBridgeArgs) {
  useEffect(() => {
    if (!hostRef.current || !stateRef.current || loading) return;
    let mounted = true;
    const audio = audioRef.current;
    const renderer = createRenderer();
    rendererRef.current = renderer;

    let detachResize: (() => void) | undefined;
    void renderer.mount(hostRef.current).then(() => {
      if (!mounted) return;
      renderer.resize();
      const onResize = () => renderer.resize();
      window.addEventListener('resize', onResize);
      detachResize = () => window.removeEventListener('resize', onResize);
    });

    const gameLoop = window.setInterval(() => {
      const state = stateRef.current;
      if (!state) return;
      const prevCountdown = state.countdownTicks;
      const prevP1Len = state.p1.body.length;
      const prevP2Len = state.p2.body.length;
      const prevP1Head = [...state.p1.head] as [number, number];
      const prevP2Head = [...state.p2.head] as [number, number];

      stepGame(state);
      const hud = getHudState(state);
      onHudTick({
        p1Points: hud.p1Points,
        p2Points: hud.p2Points,
        captureP1: hud.captureP1,
        captureP2: hud.captureP2,
        currentWidthP1: hud.currentWidthP1,
        currentWidthP2: hud.currentWidthP2,
      });

      if (hud.captureP1 !== captureP1Ref.current) {
        onCaptureChanged('P1');
      }
      if (hud.captureP2 !== captureP2Ref.current) {
        onCaptureChanged('P2');
      }
      captureP1Ref.current = hud.captureP1;
      captureP2Ref.current = hud.captureP2;

      if (state.countdownStart && state.countdownTicks !== prevCountdown) {
        audio?.playCountdownTick(state.countdownTicks);
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
    }, STEP_SPEED_MS);

    const frame = () => {
      const state = stateRef.current;
      if (state && rendererRef.current) rendererRef.current.render(state);
      frameRef = window.requestAnimationFrame(frame);
    };
    let frameRef = window.requestAnimationFrame(frame);

    return () => {
      mounted = false;
      if (detachResize) detachResize();
      window.clearInterval(gameLoop);
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
    rendererRef,
    socket,
    stateRef,
    winnerSentRef,
  ]);
}
