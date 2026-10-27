import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket';

export type ClientTelemetrySocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

export type ClientEventDetail = {
  route?: string;
  detail?: string;
  mode?: string;
  challengeId?: string;
  roomCode?: string;
  outcome?: 'win' | 'loss' | 'draw' | 'ok' | 'reject';
  durationMs?: number;
  opponentType?: string;
  payMethod?: string;
  replaySpeed?: number;
  signerMode?: string;
  platform?: string;
  referrer?: string;
  buyinSats?: number;
  bracketSize?: number;
  powerups?: boolean;
  convergence?: boolean;
};

const ALLOWED_EVENTS = new Set([
  'client.page.view',
  'client.funnel.abandon',
  'client.ui.error',
  'client.session.context',
  'client.menu.selected',
  'client.practice.tab',
  'client.quickmatch.configured',
  'client.quickmatch.started',
  'client.quickmatch.completed',
  'client.challenge.catalog_viewed',
  'client.challenge.card_clicked',
  'client.challenge.completed',
  'client.p2p.configured',
  'client.p2p.game_started',
  'client.p2p.game_completed',
  'client.p2p.withdrawal_created',
  'client.p2p.double_or_nothing',
  'client.online.replay_started',
  'client.online.replay_ended',
  'client.online.replay_speed_changed',
  'client.online.spectate_started',
]);

type QueuedPayload = {
  event: string;
} & ClientEventDetail;

const pendingQueue: QueuedPayload[] = [];
const wiredSockets = new WeakSet<ClientTelemetrySocket>();

function buildPayload(
  event: string,
  detail?: ClientEventDetail
): QueuedPayload {
  return {
    event,
    route: detail?.route,
    detail: detail?.detail,
    mode: detail?.mode,
    challengeId: detail?.challengeId,
    roomCode: detail?.roomCode,
    outcome: detail?.outcome,
    durationMs: detail?.durationMs,
    opponentType: detail?.opponentType,
    payMethod: detail?.payMethod,
    replaySpeed: detail?.replaySpeed,
    signerMode: detail?.signerMode,
    platform: detail?.platform,
    referrer: detail?.referrer,
    buyinSats: detail?.buyinSats,
    bracketSize: detail?.bracketSize,
    powerups: detail?.powerups,
    convergence: detail?.convergence,
  };
}

function emitPayload(socket: ClientTelemetrySocket, payload: QueuedPayload): void {
  socket.emit('reportClientEvent', payload);
}

function flushQueue(socket: ClientTelemetrySocket): void {
  if (!socket.connected) return;
  while (pendingQueue.length > 0) {
    const payload = pendingQueue.shift();
    if (payload) emitPayload(socket, payload);
  }
}

function wireSocketFlush(socket: ClientTelemetrySocket): void {
  if (wiredSockets.has(socket)) {
    flushQueue(socket);
    return;
  }
  wiredSockets.add(socket);
  socket.on('connect', () => flushQueue(socket));
  flushQueue(socket);
}

export function reportClientEvent(
  socket: ClientTelemetrySocket | null,
  event: string,
  detail?: ClientEventDetail
): void {
  if (!ALLOWED_EVENTS.has(event)) return;
  pendingQueue.push(buildPayload(event, detail));
  if (!socket) return;
  wireSocketFlush(socket);
}
