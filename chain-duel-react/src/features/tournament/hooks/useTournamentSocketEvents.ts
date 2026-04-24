import { useEffect } from 'react';
import { asSocketBoundary, SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import { LOADING_FALLBACK_TIMEOUT_MS } from '@/shared/constants/timeouts';

interface TournamentInfosPayload {
  gameInfo?: {
    numberOfPlayers?: number;
    winners?: string[];
    players?: Record<
      string,
      { name?: string; picture?: string; fallbackLabel?: string; nostrPubkey?: string }
    >;
  };
  lnurlp?: string;
  lnurlw?: string;
  min?: number;
  claimedCount?: number;
  nostrMeta?: {
    note1: string;
    emojis: string;
    min: number;
    mode: string;
    playersNeeded: number;
    currentAdmissions: number;
  };
}

interface UseTournamentSocketEventsArgs {
  socket: unknown;
  urlDeposit: number;
  numberOfPlayersFromUrl: number;
  isNostrTournament: boolean;
  onLoading: (loading: boolean) => void;
  onInfos: (data: TournamentInfosPayload) => void;
  onPayments: (
    players: Record<
      string,
      { name?: string; picture?: string; fallbackLabel?: string; nostrPubkey?: string }
    >
  ) => void;
  onCancel: (data: { depositcount: number; lnurlw?: string }) => void;
  onPrizeWithdrawn: () => void;
}

export function useTournamentSocketEvents({
  socket,
  urlDeposit,
  numberOfPlayersFromUrl,
  isNostrTournament,
  onLoading,
  onInfos,
  onPayments,
  onCancel,
  onPrizeWithdrawn,
}: UseTournamentSocketEventsArgs) {
  useEffect(() => {
    const s = asSocketBoundary(socket);
    if (!s) return;

    const emitTournamentInfos = () => {
      const hostLNAddress = localStorage.getItem('hostLNAddress') || undefined;
      s.emit(isNostrTournament ? 'getTournamentInfosNostr' : 'getTournamentInfos', {
        buyin: urlDeposit,
        players: numberOfPlayersFromUrl,
        hostLNAddress,
      });
    };

    const onInfosEvent = (payload: unknown) => {
      const parsed = isNostrTournament
        ? SocketBoundaryParsers.tournamentInfosNostr(payload)
        : SocketBoundaryParsers.tournamentInfos(payload);
      if (!parsed) return;
      onLoading(false);
      onInfos(parsed);
    };

    const onPaymentsEvent = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const source = payload as {
        players?: Record<
          string,
          { name?: string; picture?: string; fallbackLabel?: string; nostrPubkey?: string }
        >;
      };
      if (!source.players) return;
      onLoading(false);
      onPayments(source.players);
    };

    const onCancelEvent = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.cancelTournament(payload);
      if (!parsed) return;
      onLoading(false);
      onCancel(parsed);
    };

    const onReconnect = () => {
      onLoading(true);
      emitTournamentInfos();
    };

    s.on(
      isNostrTournament ? 'resGetTournamentInfosNostr' : 'resGetTournamentInfos',
      onInfosEvent
    );
    s.on('updatePayments', onPaymentsEvent);
    if (isNostrTournament) {
      s.on('updatePaymentsNostrTournament', onPaymentsEvent);
    }
    s.on('rescanceltourn', onCancelEvent);
    s.on('prizeWithdrawn', onPrizeWithdrawn);
    s.on('connect', onReconnect);

    if (s.connected) emitTournamentInfos();

    const loadingTimer = window.setTimeout(
      () => onLoading(false),
      LOADING_FALLBACK_TIMEOUT_MS
    );

    return () => {
      window.clearTimeout(loadingTimer);
      s.off(
        isNostrTournament ? 'resGetTournamentInfosNostr' : 'resGetTournamentInfos',
        onInfosEvent
      );
      s.off('updatePayments', onPaymentsEvent);
      if (isNostrTournament) {
        s.off('updatePaymentsNostrTournament', onPaymentsEvent);
      }
      s.off('rescanceltourn', onCancelEvent);
      s.off('prizeWithdrawn', onPrizeWithdrawn);
      s.off('connect', onReconnect);
    };
  }, [
    numberOfPlayersFromUrl,
    isNostrTournament,
    onCancel,
    onInfos,
    onLoading,
    onPayments,
    onPrizeWithdrawn,
    socket,
    urlDeposit,
  ]);
}
