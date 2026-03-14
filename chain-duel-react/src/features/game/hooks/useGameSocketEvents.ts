import { useEffect, type MutableRefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { getMetaFromDuel, createGameState, getHudState } from '@/game/engine';
import type { GameState } from '@/game/engine/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SerializedGameInfo,
} from '@/types/socket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import { DUEL_INFO_TIMEOUT_MS } from '@/shared/constants/timeouts';
import { parseZap, resolveDuelInfo } from '@/features/game/gameSession';

interface HudSnapshot {
  captureP1: string;
  captureP2: string;
  initialWidthP1: number;
  initialWidthP2: number;
  currentWidthP1: number;
  currentWidthP2: number;
}

interface UseGameSocketEventsArgs {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  loading: boolean;
  stateRef: MutableRefObject<GameState | null>;
  localBootRef: MutableRefObject<boolean>;
  winnerSentRef: MutableRefObject<boolean>;
  onSetGameHeader: (data: {
    p1Name: string;
    p2Name: string;
    p1Picture: string;
    p2Picture: string;
    p1Points: number;
    p2Points: number;
    gameLabel: string;
    isTournament: boolean;
  }) => void;
  onHudSync: (hud: HudSnapshot) => void;
  onLoadingResolved: () => void;
  onBootstrapFallback: () => void;
  onPointsUpdated: (data: SerializedGameInfo) => void;
  onZapReceived: (data: {
    username: string;
    content: string;
    amount: number;
    profile: string;
    scale: number;
  }) => void;
}

export function useGameSocketEvents({
  socket,
  loading,
  stateRef,
  localBootRef,
  winnerSentRef,
  onSetGameHeader,
  onHudSync,
  onLoadingResolved,
  onBootstrapFallback,
  onPointsUpdated,
  onZapReceived,
}: UseGameSocketEventsArgs) {
  useEffect(() => {
    if (!socket) return;

    const onDuel = (payload: unknown) => {
      const data = SocketBoundaryParsers.duelInfos(payload);
      if (!data) return;

      localBootRef.current = true;
      const info = resolveDuelInfo(data);
      onSetGameHeader(info);

      const meta = getMetaFromDuel(data.mode);
      const state = createGameState({
        p1Name: info.p1Name,
        p2Name: info.p2Name,
        p1Points: info.p1Points,
        p2Points: info.p2Points,
        modeLabel: info.gameLabel,
        practiceMode: meta.practiceMode || info.practiceMode,
        isTournament: info.isTournament,
      });
      stateRef.current = state;
      winnerSentRef.current = false;
      onHudSync(getHudState(state));
      onLoadingResolved();
    };

    const onUpdate = (payload: unknown) => {
      const data = SocketBoundaryParsers.payments(payload);
      if (!data) return;
      onPointsUpdated(data);
    };

    const onZap = (payload: unknown) => {
      const parsed = parseZap(payload);
      if (!parsed) return;
      onZapReceived(parsed);
    };

    socket.on('resGetDuelInfos', onDuel);
    socket.on('updatePayments', onUpdate);
    socket.on('zapReceived', onZap);

    const duelTimeout = window.setTimeout(() => {
      if (loading && !stateRef.current) {
        onBootstrapFallback();
      }
    }, DUEL_INFO_TIMEOUT_MS);

    return () => {
      window.clearTimeout(duelTimeout);
      socket.off('resGetDuelInfos', onDuel);
      socket.off('updatePayments', onUpdate);
      socket.off('zapReceived', onZap);
    };
  }, [
    loading,
    localBootRef,
    onBootstrapFallback,
    onHudSync,
    onLoadingResolved,
    onPointsUpdated,
    onSetGameHeader,
    onZapReceived,
    socket,
    stateRef,
    winnerSentRef,
  ]);
}
