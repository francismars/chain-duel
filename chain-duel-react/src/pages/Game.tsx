import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { formatPubkeyHex } from '@/lib/nostr/fetchKind0Profile';
import { useNoteContentDisplay } from '@/lib/nostr/formatNoteContentForDisplay';
import { signChallengeBountyNote } from '@/lib/nostr/signChallengeBountyNote';
import { createFlowTrace } from '@/lib/nostr/nip46Trace';
import { resolveSignerMode } from '@/lib/nostr/signerSession';
import { claimChallengeBounty, retryChallengeZap, submitChallengeWin } from '@/lib/challengeBounty';
import {
  clearPendingChallengeClaim,
  loadPendingChallengeClaim,
  savePendingChallengeClaim,
} from '@/lib/pendingChallengeClaim';
import { useNostrSession } from '@/contexts/NostrSessionContext';
import {
  applyTerminalGameOutcome,
  createGameState,
  getHudState,
} from '@/game/engine';
import { initRunRng, clearRunRng } from '@/game/engine/runRng';
import type { GameState } from '@/game/engine/types';
import { normalizeAiTier } from '@/game/engine/types';
import { GameAudioSystem } from '@/game/audio/gameAudio';
import { PixiGameRenderer } from '@/game/render/pixiRenderer';
import { startMempoolFeed, type BitcoinDetails } from '@/game/io/mempool';
import { createNewCoinbase } from '@/game/engine';
import { useGamepad } from '@/hooks/useGamepad';
import { useSocket } from '@/hooks/useSocket';
import { useAudio } from '@/contexts/AudioContext';
import { PlayerRole } from '@/types/socket';
import { formatHudPlayerName } from '@/features/game/gameSession';
import { useGameSocketEvents } from '@/features/game/hooks/useGameSocketEvents';
import { useGameRenderBridge } from '@/features/game/hooks/useGameRenderBridge';
import { useGameInputBindings } from '@/features/game/hooks/useGameInputBindings';
import { PowerUpLegend } from '@/features/game/PowerUpLegend';
import { FfaHud } from '@/features/game/FfaGameHud';
import type { FfaHudPlayer } from '@/game/engine/types';
import { GAME_BOOTSTRAP_TIMEOUT_MS } from '@/shared/constants/timeouts';
import {
  isExplicitPracticeSession,
  isPracticeChallengeConfig,
  isPracticeHubGameMode,
  practiceHubExitPath,
  readSessionGameConfig,
  sessionUsesPracticeHubConfig,
} from '@/pages/practiceHubModes';
import './game.css';

interface ZapMessage {
  id: string;
  username: string;
  content: string;
  amount: number;
  profile: string;
  top: number;
  scale: number;
  hidden: boolean;
}

const DEFAULT_BITCOIN_DETAILS: BitcoinDetails = {
  height: '000000',
  timeAgo: '0 secs ago',
  size: '0.00 Mb',
  txCount: '0000',
  miner: 'Miner',
  medianFee: '00 sat/vb',
};

type SoloEndData = {
  won: boolean;
  name: string;
  bounty: number;
  claimToken?: string;
  noteContent?: string;
  noteTags?: string[][];
  challengeId?: string;
  validating?: boolean;
  validationError?: string;
  zapPaid?: boolean;
  zapReason?: string;
};

export default function Game() {
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const nostrSession = useNostrSession();
  const { stop, isMuted, isMusicMuted } = useAudio();
  useGamepad(true);

  const stateRef = useRef<GameState | null>(null);
  const rendererRef = useRef<PixiGameRenderer | null>(null);
  const audioRef = useRef<GameAudioSystem | null>(null);
  if (!audioRef.current) {
    audioRef.current = new GameAudioSystem();
  }
  const hostRef = useRef<HTMLDivElement | null>(null);
  const winnerSentRef = useRef(false);
  const localBootRef = useRef(false);
  const readyToStartRef = useRef(false);
  const captureP1Ref = useRef('2%');
  const captureP2Ref = useRef('2%');
  const simStepRef = useRef(0);
  const challengeInputLogRef = useRef<Array<{ tick: number; dir: string }>>([]);
  const challengeWinSubmittedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [player1Name, setPlayer1Name] = useState('Player 1');
  const [player2Name, setPlayer2Name] = useState('Player 2');
  const [player1Img, setPlayer1Img] = useState('');
  const [player2Img, setPlayer2Img] = useState('');
  const [p1Points, setP1Points] = useState(0);
  const [p2Points, setP2Points] = useState(0);
  const [gameInfo, setGameInfo] = useState('');
  const [captureP1, setCaptureP1] = useState('2%');
  const [captureP2, setCaptureP2] = useState('2%');
  const [captureP1Highlight, setCaptureP1Highlight] = useState(false);
  const [captureP2Highlight, setCaptureP2Highlight] = useState(false);
  const [initialP1Width, setInitialP1Width] = useState(50);
  const [initialP2Width, setInitialP2Width] = useState(50);
  const [currentP1Width, setCurrentP1Width] = useState(50);
  const [currentP2Width, setCurrentP2Width] = useState(50);
  const [isFfa, setIsFfa] = useState(false);
  const [ffaPlayers, setFfaPlayers] = useState<FfaHudPlayer[]>([]);
  const [ffaCaptureHighlights, setFfaCaptureHighlights] = useState([false, false, false, false]);
  const ffaCapturePrevRef = useRef(['2%', '2%', '2%', '2%']);
  const [bitcoin, setBitcoin] = useState<BitcoinDetails>(DEFAULT_BITCOIN_DETAILS);
  const [footerHighlight, setFooterHighlight] = useState(false);
  const [canvasHighlight, setCanvasHighlight] = useState(false);
  const [zapMessages, setZapMessages] = useState<ZapMessage[]>([]);
  const [soloEndData, setSoloEndData] = useState<SoloEndData | null>(null);
  const [soloPendingEndData, setSoloPendingEndData] = useState<SoloEndData | null>(null);
  const [noteState, setNoteState] = useState<'idle' | 'posting' | 'posted' | 'error' | 'zapping'>('idle');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteAuthorPubkey, setNoteAuthorPubkey] = useState<string | null>(null);
  const [noteAuthorName, setNoteAuthorName] = useState<string>('Nostr user');
  const [noteAuthorAvatar, setNoteAuthorAvatar] = useState<string | null>(null);
  const [noteAuthorAvatarBroken, setNoteAuthorAvatarBroken] = useState(false);
  const noteContentDisplay = useNoteContentDisplay(soloEndData?.noteContent);

  const postBountyNote = useCallback(async () => {
    if (!soloEndData?.claimToken || !soloEndData.noteContent || !soloEndData.noteTags) return;
    const trace = createFlowTrace('challenge', 'post-and-claim');
    setNoteState('posting');
    setNoteError(null);
    try {
      if (!socket) throw new Error('Not connected to server.');
      trace.step('begin', `bounty=${soloEndData.bounty} sats challenge=${soloEndData.challengeId}`);
      const unsigned = {
        kind: 1 as const,
        created_at: Math.floor(Date.now() / 1000),
        tags: soloEndData.noteTags,
        content: soloEndData.noteContent,
      };
      trace.step('signing bounty note', 'see [challenge] sign-bounty-note + [relay] bounty-note/kind-1');
      const signed = await signChallengeBountyNote(unsigned);
      trace.step('sign complete', `event id=${signed.id?.slice(0, 12)}…`);
      setNoteState('zapping');
      trace.step('claiming on server', 'see [marspay] claim-bounty');
      const result = await claimChallengeBounty(socket, {
        claimToken: soloEndData.claimToken,
        event: signed,
      });
      if (!result.ok) throw new Error(result.reason);
      setSoloEndData((prev) =>
        prev ? { ...prev, zapPaid: result.zapPaid, zapReason: result.zapReason } : prev
      );
      clearPendingChallengeClaim();
      setNoteState('posted');
      trace.done(result.zapPaid ? 'posted and zapped' : `posted (zap: ${result.zapReason ?? 'skipped'})`);
    } catch (err) {
      trace.fail('post-and-claim', err);
      setNoteState('error');
      setNoteError(err instanceof Error ? err.message : 'Failed to claim bounty.');
    }
  }, [soloEndData, socket]);

  const retryZap = useCallback(async () => {
    if (!soloEndData?.challengeId || !socket) return;
    setNoteError(null);
    try {
      const result = await retryChallengeZap(socket, soloEndData.challengeId);
      if (!result.ok) throw new Error(result.reason ?? 'Zap retry failed');
      setSoloEndData((prev) => (prev ? { ...prev, zapPaid: true, zapReason: undefined } : prev));
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'Zap retry failed.');
    }
  }, [soloEndData, socket]);

  useEffect(() => {
    setNoteAuthorAvatarBroken(false);
    if (!nostrSession.signedIn || !nostrSession.pubkey) {
      setNoteAuthorPubkey(null);
      setNoteAuthorName('Nostr user');
      setNoteAuthorAvatar(null);
      return;
    }
    setNoteAuthorPubkey(nostrSession.pubkey);
    setNoteAuthorName(nostrSession.displayName ?? 'Nostr user');
    setNoteAuthorAvatar(nostrSession.picture?.trim() || null);
  }, [
    nostrSession.signedIn,
    nostrSession.pubkey,
    nostrSession.displayName,
    nostrSession.picture,
  ]);

  useEffect(() => {
    const pending = loadPendingChallengeClaim();
    if (!pending) return;
    setSoloEndData({
      won: true,
      name: pending.name,
      bounty: pending.bounty,
      challengeId: pending.challengeId,
      claimToken: pending.claimToken,
      noteContent: pending.noteContent,
      noteTags: pending.noteTags,
      validating: false,
    });
  }, []);

  useEffect(() => {
    if (!nostrSession.signedIn) return;
    const pending = loadPendingChallengeClaim();
    if (!pending) return;
    setSoloEndData((prev) => {
      if (prev?.claimToken) return prev;
      return {
        won: true,
        name: pending.name,
        bounty: pending.bounty,
        challengeId: pending.challengeId,
        claimToken: pending.claimToken,
        noteContent: pending.noteContent,
        noteTags: pending.noteTags,
        validating: false,
      };
    });
  }, [nostrSession.signedIn]);

  useEffect(() => {
    if (
      !soloEndData?.won ||
      !soloEndData.claimToken ||
      !soloEndData.noteContent ||
      !soloEndData.noteTags ||
      !soloEndData.challengeId
    ) {
      return;
    }
    if (soloEndData.zapPaid) {
      clearPendingChallengeClaim();
      return;
    }
    savePendingChallengeClaim({
      name: soloEndData.name,
      bounty: soloEndData.bounty,
      challengeId: soloEndData.challengeId,
      claimToken: soloEndData.claimToken,
      noteContent: soloEndData.noteContent,
      noteTags: soloEndData.noteTags,
    });
  }, [soloEndData]);

  const canShowP1Image = useMemo(() => player1Img.length > 0, [player1Img]);
  const canShowP2Image = useMemo(() => player2Img.length > 0, [player2Img]);
  const showFfaUi = isFfa && ffaPlayers.length === 4;

  const isPowerupMode = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('gameConfig');
      if (!raw) return false;
      const cfg = JSON.parse(raw) as Record<string, unknown>;
      const m = String(cfg.mode ?? '').toUpperCase();
      if (
        m === 'PRACTICE' ||
        m === 'LOCAL' ||
        m === 'TESTNET' ||
        m === 'SOLO'
      ) {
        return Boolean(cfg.powerupMode);
      }
      return m === 'POWERUP' || m === 'POWER-UP ARENA';
    } catch {
      return false;
    }
  }, []);

  const ignoreSocketSessionUpdates = useMemo(
    () => sessionUsesPracticeHubConfig(),
    [],
  );

  const isChallengeSession = useMemo(
    () => isPracticeChallengeConfig(readSessionGameConfig()),
    [],
  );

  const bootstrapLocalGame = useCallback(() => {
    // sessionStorage from practice hub (/practice); legacy POWERUP sessions may remain
    const gameConfig = readSessionGameConfig();

    const configMode = String(gameConfig.mode ?? '').toUpperCase();
    const isPracticeHub = isPracticeHubGameMode(configMode);
    const isLegacyPowerup =
      configMode === 'POWERUP' || configMode === 'POWER-UP ARENA';
    const isConvergence = isPracticeHub && Boolean(gameConfig.convergenceMode);
    const isPowerup =
      isLegacyPowerup || (isPracticeHub && Boolean(gameConfig.powerupMode));
    const isPracticeMode = Boolean(gameConfig.practiceMode);
    const aiTier = normalizeAiTier((gameConfig.aiTier as string | undefined) ?? undefined);
    const optCfgStr = (v: unknown): string | undefined => {
      if (v == null) return undefined;
      const s = String(v).trim();
      return s === '' ? undefined : s;
    };
    const p1Name = formatHudPlayerName(
      {
        name: optCfgStr(gameConfig.p1Name),
        fallbackLabel: optCfgStr(gameConfig.p1FallbackLabel),
        nostrPubkey: optCfgStr(gameConfig.p1NostrPubkey ?? gameConfig.p1Npub),
      },
      'Player 1',
    );
    const rawP2Name = String(gameConfig.p2Name ?? (isPracticeMode ? 'BigToshi 🌊' : 'Player 2'));

    let p1Human = true;
    let p2Human = !isPracticeMode;
    if (typeof gameConfig.p1Human === 'boolean') p1Human = gameConfig.p1Human;
    if (typeof gameConfig.p2Human === 'boolean') p2Human = gameConfig.p2Human;
    const p3Human = gameConfig.p3Human === true;
    const p4Human = gameConfig.p4Human === true;

    const hudFromConfig =
      gameConfig.practiceHudLabel ??
      gameConfig.localHudLabel ??
      gameConfig.testnetHudLabel;
    const modeLabel =
      isPracticeHub && typeof hudFromConfig === 'string'
        ? String(hudFromConfig)
        : isLegacyPowerup
          ? 'POWER-UP ARENA'
          : 'PRACTICE';
    const displayP2Name = isPracticeHub
      ? formatHudPlayerName(
          {
            name: optCfgStr(gameConfig.p2Name),
            fallbackLabel: optCfgStr(gameConfig.p2FallbackLabel),
            nostrPubkey: optCfgStr(gameConfig.p2NostrPubkey ?? gameConfig.p2Npub),
          },
          'Player 2',
        )
      : isPracticeMode
        ? rawP2Name
        : 'Player 2';

    const rawTeamMode = (gameConfig.teamMode as string | undefined) ?? 'solo';
    const teamMode = rawTeamMode === 'ffa' ? 'ffa' : 'solo';

    const convergenceShrinkInterval = gameConfig.convergenceShrinkInterval != null
      ? Number(gameConfig.convergenceShrinkInterval)
      : undefined;
    const convergenceMinCols = gameConfig.convergenceMinCols != null
      ? Number(gameConfig.convergenceMinCols)
      : undefined;
    const convergenceMinRows = gameConfig.convergenceMinRows != null
      ? Number(gameConfig.convergenceMinRows)
      : undefined;
    const convergenceStepMs = gameConfig.convergenceStepMs != null
      ? Number(gameConfig.convergenceStepMs)
      : undefined;

    const p1Points = Math.max(
      1,
      Math.floor(Number(gameConfig.p1Points ?? gameConfig.p1Sats ?? 1000)),
    );
    const p2Points = Math.max(
      1,
      Math.floor(Number(gameConfig.p2Points ?? gameConfig.p2Sats ?? 1000)),
    );

    if (!localBootRef.current) {
      localBootRef.current = true;
      simStepRef.current = 0;
      challengeInputLogRef.current = [];
      challengeWinSubmittedRef.current = false;

      const challengeSeed = typeof gameConfig.challengeRunSeed === 'string'
        ? gameConfig.challengeRunSeed
        : '';
      if (isPracticeChallengeConfig(gameConfig) && challengeSeed) {
        initRunRng(challengeSeed);
      } else {
        clearRunRng();
      }

      const state = createGameState({
      p1Name,
      p2Name: displayP2Name,
      p1Points,
      p2Points,
      modeLabel,
      practiceMode: isPracticeMode,
      p1Human,
      p2Human,
      p3Human,
      p4Human,
      isTournament: false,
      aiTier,
      ffaAiTier: gameConfig.ffaAiTier
        ? normalizeAiTier(gameConfig.ffaAiTier as string)
        : undefined,
      convergenceMode: isConvergence,
      convergenceShrinkInterval,
      convergenceMinCols,
      convergenceMinRows,
      convergenceStepMs,
      powerupMode: isPowerup,
      teamMode,
      });
      stateRef.current = state;
      winnerSentRef.current = false;

      const hud = getHudState(state);
      setCaptureP1(hud.captureP1);
      setCaptureP2(hud.captureP2);
      captureP1Ref.current = hud.captureP1;
      captureP2Ref.current = hud.captureP2;
      setInitialP1Width(hud.initialWidthP1);
      setInitialP2Width(hud.initialWidthP2);
      setCurrentP1Width(hud.currentWidthP1);
      setCurrentP2Width(hud.currentWidthP2);
      setIsFfa(teamMode === 'ffa');
      if (hud.ffa?.players) {
        setFfaPlayers(hud.ffa.players);
        ffaCapturePrevRef.current = hud.ffa.players.map((p) => p.capture);
      }
    }

    // Always sync React HUD (Strict Mode re-runs must not skip this).
    setPlayer1Name(p1Name);
    setPlayer2Name(displayP2Name);
    setPlayer1Img(optCfgStr(gameConfig.p1Picture) ?? '');
    setPlayer2Img(optCfgStr(gameConfig.p2Picture) ?? '');
    setP1Points(p1Points);
    setP2Points(p2Points);
    setGameInfo(modeLabel);
    setLoading(false);
    audioRef.current?.startMusic();
  }, []);

  useEffect(() => {
    return () => {
      localBootRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Ensure menu background music is stopped when entering gameplay.
    stop();
  }, [stop]);

  // Gate start-key input until the reveal animations have settled (~1.2 s after load).
  useEffect(() => {
    if (loading) return;
    readyToStartRef.current = false;
    const timer = window.setTimeout(() => {
      readyToStartRef.current = true;
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [loading]);

  // Challenge win: submit replay to server for validation + claim token.
  useEffect(() => {
    if (loading) return;
    let cfg: Record<string, unknown> = {};
    try { const r = sessionStorage.getItem('gameConfig'); if (r) cfg = JSON.parse(r); } catch { /* ignore */ }
    if (!isPracticeChallengeConfig(cfg)) return;

    const poll = window.setInterval(() => {
      const state = stateRef.current;
      if (!state?.gameEnded || !state.winnerPlayer) return;
      window.clearInterval(poll);
      const won = state.winnerPlayer === 'P1';
      const name = String(cfg.soloChallengeName ?? 'CHALLENGE');
      const bounty = Number(cfg.soloBounty ?? 0);
      const runId = String(cfg.challengeRunId ?? '');
      const challengeId = String(cfg.challengeId ?? '');

      window.setTimeout(async () => {
        if (!won) {
          setSoloPendingEndData({ won: false, name, bounty, challengeId });
          return;
        }
        if (!socket || !runId || challengeWinSubmittedRef.current) {
          setSoloPendingEndData({
            won: true,
            name,
            bounty,
            challengeId,
            validating: false,
            validationError: !runId ? 'missing_run' : 'no_socket',
          });
          return;
        }
        challengeWinSubmittedRef.current = true;
        setSoloPendingEndData({ won: true, name, bounty, challengeId, validating: true });
        try {
          const result = await submitChallengeWin(socket, {
            runId,
            inputLog: [...challengeInputLogRef.current],
          });
          if (!result.ok) {
            setSoloPendingEndData({
              won: true,
              name,
              bounty,
              challengeId,
              validating: false,
              validationError: result.reason,
            });
            return;
          }
          setSoloPendingEndData({
            won: true,
            name,
            bounty: result.bountySats,
            challengeId,
            claimToken: result.claimToken,
            noteContent: result.noteContent,
            noteTags: result.noteTags,
            validating: false,
          });
        } catch (err) {
          setSoloPendingEndData({
            won: true,
            name,
            bounty,
            challengeId,
            validating: false,
            validationError: err instanceof Error ? err.message : 'validation_failed',
          });
        }
      }, 2000);
    }, 150);

    return () => window.clearInterval(poll);
  }, [loading, stateRef, socket]);

  useEffect(() => {
    if (soloEndData?.validating && soloPendingEndData && !soloPendingEndData.validating) {
      setSoloEndData(soloPendingEndData);
      setSoloPendingEndData(null);
    }
  }, [soloEndData?.validating, soloPendingEndData]);

  useEffect(() => {
    audioRef.current?.applyAppMuteState(isMuted, isMusicMuted);
  }, [isMuted, isMusicMuted, loading]);


  useEffect(() => {
    const gameConfig = readSessionGameConfig();
    if (isExplicitPracticeSession(gameConfig)) {
      bootstrapLocalGame();
      return;
    }

    if (!socket || !connected) {
      const noSocketTimer = window.setTimeout(() => {
        if (loading && !stateRef.current) {
          bootstrapLocalGame();
        }
      }, GAME_BOOTSTRAP_TIMEOUT_MS);
      return () => window.clearTimeout(noSocketTimer);
    }
    socket.emit('getDuelInfos');
  }, [socket, connected, loading, bootstrapLocalGame]);

  const emitWinner = useCallback((winner: 'P1' | 'P2') => {
    if (!socket) return;
    socket.emit(
      'gameFinished',
      winner === 'P1' ? PlayerRole.Player1 : PlayerRole.Player2
    );
  }, [socket]);

  const handleSetGameHeader = useCallback(
    (info: {
      p1Name: string;
      p2Name: string;
      p1Picture: string;
      p2Picture: string;
      p1Points: number;
      p2Points: number;
      gameLabel: string;
      isTournament: boolean;
    }) => {
      setPlayer1Name(info.p1Name);
      setPlayer2Name(info.p2Name);
      setPlayer1Img(info.p1Picture);
      setPlayer2Img(info.p2Picture);
      setP1Points(info.p1Points);
      setP2Points(info.p2Points);
      setGameInfo(info.gameLabel);
    },
    []
  );

  const handleHudSync = useCallback(
    (hud: {
      captureP1: string;
      captureP2: string;
      initialWidthP1: number;
      initialWidthP2: number;
      currentWidthP1: number;
      currentWidthP2: number;
    }) => {
      setCaptureP1(hud.captureP1);
      setCaptureP2(hud.captureP2);
      captureP1Ref.current = hud.captureP1;
      captureP2Ref.current = hud.captureP2;
      setInitialP1Width(hud.initialWidthP1);
      setInitialP2Width(hud.initialWidthP2);
      setCurrentP1Width(hud.currentWidthP1);
      setCurrentP2Width(hud.currentWidthP2);
    },
    []
  );

  const handleLoadingResolved = useCallback(() => {
    setLoading(false);
    audioRef.current?.startMusic();
  }, []);

  const handlePointsUpdated = useCallback((data: {
    players: Record<string, { value?: number; name?: string; picture?: string; nostrPubkey?: string; fallbackLabel?: string }>;
  }) => {
    const p1 = data.players['Player 1'];
    const p2 = data.players['Player 2'];
    if (p1?.value != null) setP1Points(Math.floor(p1.value));
    if (p2?.value != null) setP2Points(Math.floor(p2.value));
    if (p1?.name?.trim()) {
      setPlayer1Name(formatHudPlayerName(p1, 'Player 1'));
    }
    if (p2?.name?.trim()) {
      setPlayer2Name(formatHudPlayerName(p2, 'Player 2'));
    }
    if (p1?.picture?.trim()) setPlayer1Img(String(p1.picture));
    if (p2?.picture?.trim()) setPlayer2Img(String(p2.picture));

    const state = stateRef.current;
    if (!state) return;
    if (p1?.value != null) state.score[0] = Math.floor(p1.value);
    if (p2?.value != null) state.score[1] = Math.floor(p2.value);
    if (applyTerminalGameOutcome(state)) {
      handleHudSync(getHudState(state));
    }
  }, [handleHudSync]);

  const handleZapReceived = useCallback((data: {
    username: string;
    content: string;
    amount: number;
    profile: string;
    scale: number;
  }) => {
    setZapMessages((prev) => [
      ...prev,
      {
        ...data,
        id: `zap-${Date.now()}-${prev.length}`,
        top: 18,
        hidden: true,
      },
    ]);
  }, []);

  const createRenderer = useCallback(() => new PixiGameRenderer(), []);

  const handleHudTick = useCallback((hud: {
    p1Points: number;
    p2Points: number;
    captureP1: string;
    captureP2: string;
    currentWidthP1: number;
    currentWidthP2: number;
    ffa?: { players: FfaHudPlayer[] };
  }) => {
    setP1Points(hud.p1Points);
    setP2Points(hud.p2Points);
    setCaptureP1(hud.captureP1);
    setCaptureP2(hud.captureP2);
    setCurrentP1Width(hud.currentWidthP1);
    setCurrentP2Width(hud.currentWidthP2);
    if (hud.ffa?.players) {
      setFfaPlayers(hud.ffa.players);
      const prev = ffaCapturePrevRef.current;
      const flashes = hud.ffa.players.map((p, i) => p.capture !== prev[i]);
      if (flashes.some(Boolean)) {
        setFfaCaptureHighlights(flashes);
        window.setTimeout(() => setFfaCaptureHighlights([false, false, false, false]), 100);
      }
      ffaCapturePrevRef.current = hud.ffa.players.map((p) => p.capture);
    }
  }, []);

  const handleCaptureChanged = useCallback((side: 'P1' | 'P2') => {
    if (side === 'P1') {
      setCaptureP1Highlight(true);
      window.setTimeout(() => setCaptureP1Highlight(false), 100);
      return;
    }
    setCaptureP2Highlight(true);
    window.setTimeout(() => setCaptureP2Highlight(false), 100);
  }, []);

  const handleNavigateAfterFinish = useCallback((isTourn: boolean) => {
    if (isTourn) {
      const mode = sessionStorage.getItem('tournamentMode');
      navigate(mode === 'tournamentnostr' ? '/tournbracket?mode=tournamentnostr' : '/tournbracket');
      return;
    }
    // Return to relevant menu for local-only modes
    let gameConfig: Record<string, unknown> = {};
    try {
      const raw = sessionStorage.getItem('gameConfig');
      if (raw) gameConfig = JSON.parse(raw);
    } catch {
      // ignore
    }
    const configMode = String(gameConfig.mode ?? '').toUpperCase();
    if (isPracticeChallengeConfig(gameConfig)) {
      // Challenge flow: first continue key reveals the results modal; second exits to list.
      if (!soloEndData) {
        if (soloPendingEndData) {
          setSoloEndData(soloPendingEndData);
          setSoloPendingEndData(null);
        }
        return;
      }
      navigate(practiceHubExitPath(gameConfig));
      return;
    }
    if (isPracticeHubGameMode(configMode)) {
      navigate(practiceHubExitPath(gameConfig));
      return;
    }
    navigate('/postgame');
  }, [navigate, soloEndData, soloPendingEndData]);

  useGameSocketEvents({
    socket,
    loading,
    ignoreSocketSessionUpdates,
    stateRef,
    localBootRef,
    winnerSentRef,
    onSetGameHeader: handleSetGameHeader,
    onHudSync: handleHudSync,
    onLoadingResolved: handleLoadingResolved,
    onBootstrapFallback: bootstrapLocalGame,
    onRedirectToPostGame: () => navigate('/postgame', { replace: true }),
    onPointsUpdated: handlePointsUpdated,
    onZapReceived: handleZapReceived,
  });

  useGameRenderBridge({
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
    onHudTick: handleHudTick,
    onCaptureChanged: handleCaptureChanged,
    simStepRef: isChallengeSession ? simStepRef : undefined,
    challengeInputLogRef: isChallengeSession ? challengeInputLogRef : undefined,
  });

  useEffect(() => {
    if (loading || !stateRef.current) return;
    let cfg: Record<string, unknown> = {};
    try {
      const raw = sessionStorage.getItem('gameConfig');
      if (raw) cfg = JSON.parse(raw);
    } catch { /* ignore */ }
    const challengeRun = isPracticeChallengeConfig(cfg);

    const stopFeed = startMempoolFeed({
      onInit: (details) => {
        setBitcoin((prev) => {
          const timeAgoOnly =
            !details.height &&
            !details.size &&
            !details.txCount &&
            details.timeAgo &&
            details.timeAgo !== prev.timeAgo;
          if (timeAgoOnly) {
            return { ...prev, timeAgo: details.timeAgo };
          }
          return {
            height: details.height || prev.height,
            timeAgo: details.timeAgo || prev.timeAgo,
            size: details.size || prev.size,
            txCount: details.txCount || prev.txCount,
            miner: details.miner || prev.miner,
            medianFee: details.medianFee || prev.medianFee,
          };
        });
      },
      onNewBlock: (block, details) => {
        setBitcoin(details);
        setCanvasHighlight(true);
        setFooterHighlight(true);
        window.setTimeout(() => setCanvasHighlight(false), 1000);
        window.setTimeout(() => setFooterHighlight(false), 2000);
        // Challenge runs use a seeded arena — no live mempool coinbase spawns.
        if (!challengeRun) {
          createNewCoinbase(stateRef.current!, block.extras?.medianFee ?? -1);
          audioRef.current?.playBlockFound();
        }
      },
    });
    return () => stopFeed();
  }, [loading]);

  useEffect(() => {
    if (zapMessages.length === 0) return;
    const timer = window.setInterval(() => {
      setZapMessages((prev) => {
        const next = prev
          .map((zap) => ({
            ...zap,
            hidden: zap.top > 17.5 ? false : zap.hidden,
            top: zap.top - 0.04,
          }))
          .filter((zap) => zap.top > -1);
        return next;
      });
    }, 16);
    return () => window.clearInterval(timer);
  }, [zapMessages.length]);

  useGameInputBindings({
    stateRef,
    winnerSentRef,
    onEmitWinner: emitWinner,
    onNavigateAfterFinish: handleNavigateAfterFinish,
    readyToStartRef,
  });

  return (
    <>
      <div id="game-bg-overlay" aria-hidden="true" />
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <h1 id="tournament-name" className="hero-outline in-game hide">
        The Merkle Tree
      </h1>

      <div id="gameContainer" className={`flex full game ${loading ? 'hide' : ''}`}>
        <div className={showFfaUi ? 'game-hud-ffa-wrap' : undefined}>
          {showFfaUi ? (
            <>
              <FfaHud
                players={ffaPlayers}
                gameInfo={gameInfo}
                captureHighlights={ffaCaptureHighlights}
              />
              <div id="zapMessages">
                {zapMessages.map((zap) => (
                  <div
                    key={zap.id}
                    className={`zapMessage ${zap.hidden ? 'hidden' : ''}`}
                    style={{ top: `${zap.top}vw`, transform: `scale(${zap.scale})` }}
                  >
                    <div className="zapMessageInner">
                      <img src={zap.profile} alt="" />
                      <div className="zapText">
                        <div className="zapUser">{zap.username}</div>
                        <div className="zapContent condensed">{zap.content}</div>
                        <div className="zapAmount">{zap.amount.toLocaleString()} sats</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex players">
                <div id="player1info" className="condensed">
                  <div className="inline playerSquare white" />
                  <img className={`inline playerImg ${canShowP1Image ? '' : 'hide'}`} id="player1Img" src={player1Img || '/images/loading.gif'} />
                  <div className="inline" id="player1name">
                    {player1Name}
                  </div>
                </div>
                <div id="gameInfo" className="outline condensed">
                  {gameInfo}
                </div>
                <div id="player2info" className="condensed">
                  <div className="inline" id="player2name">
                    {player2Name}
                  </div>
                  <img className={`inline playerImg ${canShowP2Image ? '' : 'hide'}`} id="player2Img" src={player2Img || '/images/loading.gif'} />
                  <div className="inline playerSquare black" />
                </div>

                <div id="zapMessages">
                  {zapMessages.map((zap) => (
                    <div
                      key={zap.id}
                      className={`zapMessage ${zap.hidden ? 'hidden' : ''}`}
                      style={{ top: `${zap.top}vw`, transform: `scale(${zap.scale})` }}
                    >
                      <div className="zapMessageInner">
                        <img src={zap.profile} alt="" />
                        <div className="zapText">
                          <div className="zapUser">{zap.username}</div>
                          <div className="zapContent condensed">{zap.content}</div>
                          <div className="zapAmount">{zap.amount.toLocaleString()} sats</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="gameState">
                <div id="capturing">
                  <div id="capturingP1">
                    <span id="capturingP1Amount" className={`capturingAmount ${captureP1Highlight ? 'highlight' : ''}`}>
                      {captureP1}
                    </span>{' '}
                    capture
                  </div>
                  <div id="capturingP2">
                    capture{' '}
                    <span id="capturingP2Amount" className={`capturingAmount ${captureP2Highlight ? 'highlight' : ''}`}>
                      {captureP2}
                    </span>
                  </div>
                </div>

                <div id="distributions">
                  <div id="initialDistribution" className="distributionBarOutter">
                    <div className="distributionTitle">Initial Distribution</div>
                    <div id="initialDistributionP1" className="distributionBar" style={{ width: `${initialP1Width}%` }} />
                    <div id="initialDistributionP2" className="distributionBar" style={{ width: `${initialP2Width}%` }} />
                  </div>
                  <div id="currentDistribution" className="distributionBarOutter">
                    <div className="distributionTitle">Current Distribution</div>
                    <div id="currentDistributionP1" className="distributionBar" style={{ width: `${currentP1Width}%` }} />
                    <div id="currentDistributionP2" className="distributionBar" style={{ width: `${currentP2Width}%` }} />
                  </div>
                </div>
              </div>

              <div className="flex points">
                <div className="player-sats player-sats-p1">
                  <span id="p1Points" className="condensed">
                    {p1Points.toLocaleString()}
                  </span>{' '}
                  <span className="grey">sats</span>
                </div>
                <Sponsorship id="sponsorshipGame" showLabel={false} />
                <div className="player-sats player-sats-p2">
                  <span className="grey">sats</span>{' '}
                  <span id="p2Points" className="condensed">
                    {p2Points.toLocaleString()}
                  </span>
                </div>
              </div>
            </>
          )}

          <div id="gameCanvas" className={canvasHighlight ? 'highlight' : ''}>
            <div id="gameCanvasHost" ref={hostRef} />
          </div>

          {isPowerupMode && <PowerUpLegend />}

          <div id="bitcoinDetails" className={footerHighlight ? 'highlight' : ''}>
            <div className="detail">
              <div className="label">Latest Block</div>
              <div className="value" id="bitcoinblockHeight">
                {bitcoin.height}
              </div>
            </div>
            <div className="detail">
              <div className="label">Found</div>
              <div className="value" id="bitcoinblockTimeAgo">
                {bitcoin.timeAgo}
              </div>
            </div>
            <div className="detail">
              <div className="label">Size</div>
              <div className="value" id="bitcoinblockSize">
                {bitcoin.size}
              </div>
            </div>
            <div className="detail">
              <div className="label">TX count</div>
              <div className="value" id="bitcoinblockTXcount">
                {bitcoin.txCount}
              </div>
            </div>
            <div className="detail hide">
              <div className="label">Found by</div>
              <div className="value" id="bitcoinblockMiner">
                {bitcoin.miner}
              </div>
            </div>
            <div className="detail">
              <div className="label">Median fee</div>
              <div className="value" id="bitcoinAvgFee">
                {bitcoin.medianFee}
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="bracketDetails in-game hide">
        <div className="bracketDetail" id="bracketDetailPlayers">
          <div className="label">Players</div>
          <div className="value players">
            <h3 id="numberOfPlayers">4</h3>
          </div>
        </div>

        <div className="bracketDetail" id="bracketDetailFinalPrize">
          <div className="label">Final Prize</div>
          <div className="value">
            <h3 id="bracketFinalPrize">400,000</h3> <span>sats</span>
          </div>
        </div>

        <div className="bracketDetail" id="bracketDetailBuyIn">
          <div className="label">Buy In</div>
          <div className="value">
            <h3 id="buyinvalue2">100,000</h3> <span>sats</span>
          </div>
        </div>
      </div>

      <div className={`overlay ${loading ? '' : 'hide'}`} id="loading">
        <img src="/images/loading.gif" alt="Loading" />
      </div>

      {soloEndData && (
        <div className={`solo-zap-overlay${soloEndData.won ? '' : ' solo-zap-overlay--lose'}`} role="dialog" aria-modal="true" aria-label={soloEndData.won ? 'Challenge complete' : 'Game over'}>
          <div className="solo-zap-card">
            {soloEndData.won ? (
              <>
                <div className="solo-zap-header">
                  <span className="solo-zap-badge">⚡ CHALLENGE COMPLETE</span>
                  <h2 className="solo-zap-title">{soloEndData.name}</h2>
                </div>

                <div className="solo-zap-amount">
                  <span className="solo-zap-sats">{soloEndData.bounty.toLocaleString()}</span>
                  <span className="solo-zap-unit">SATS</span>
                </div>

                {soloEndData.validating ? (
                  <p className="solo-zap-note-label">VALIDATING WIN ON SERVER…</p>
                ) : soloEndData.validationError ? (
                  <p className="solo-zap-note-err">Validation failed: {soloEndData.validationError}</p>
                ) : (
                <div className="solo-zap-note-section">
                  <p className="solo-zap-note-label">POST THIS NOTE TO CLAIM YOUR ZAP</p>
                  {resolveSignerMode() === 'nip46' && (noteState === 'posting' || noteState === 'zapping') ? (
                    <p className="solo-zap-note-label">Approve in your Nostr app (Primal / Amber)…</p>
                  ) : null}
                  {nostrSession.pendingNip46AuthUrl && (noteState === 'posting' || noteState === 'zapping') ? (
                    <button
                      type="button"
                      className="solo-zap-post-btn"
                      onClick={() => {
                        window.open(nostrSession.pendingNip46AuthUrl!, '_blank', 'noopener,noreferrer');
                        nostrSession.clearPendingNip46AuthUrl();
                      }}
                    >
                      OPEN PRIMAL TO APPROVE
                    </button>
                  ) : null}
                  <div className="solo-zap-note-preview">
                    {noteAuthorPubkey ? (
                      <div className="solo-zap-note-author">
                        <img
                          className="solo-zap-note-author-avatar"
                          src={!noteAuthorAvatarBroken && noteAuthorAvatar ? noteAuthorAvatar : '/images/social/Nostr.png'}
                          alt=""
                          width={20}
                          height={20}
                          onError={() => setNoteAuthorAvatarBroken(true)}
                        />
                        <div className="solo-zap-note-author-meta">
                          <span className="solo-zap-note-author-name">{noteAuthorName}</span>
                          <span className="solo-zap-note-author-pubkey">{formatPubkeyHex(noteAuthorPubkey)}</span>
                        </div>
                      </div>
                    ) : null}
                    <p className="solo-zap-note-text">
                      {noteContentDisplay}
                    </p>
                  </div>

                  {noteState === 'posted' ? (
                    soloEndData.zapPaid ? (
                      <p className="solo-zap-note-ok">✓ Note posted — zap sent ⚡</p>
                    ) : (
                      <>
                        <p className="solo-zap-note-ok">✓ Note posted</p>
                        <p className="solo-zap-note-err">Zap pending{soloEndData.zapReason ? `: ${soloEndData.zapReason}` : ''}</p>
                        <button type="button" className="solo-zap-post-btn" onClick={() => { void retryZap(); }}>
                          RETRY ZAP ⚡
                        </button>
                      </>
                    )
                  ) : soloEndData.claimToken ? (
                    !nostrSession.signedIn ? (
                      <>
                        <p className="solo-zap-note-label">SIGN IN WITH NOSTR TO CLAIM YOUR ZAP</p>
                        <button
                          type="button"
                          className="solo-zap-post-btn"
                          onClick={() => {
                            navigate('/config', { state: { returnTo: '/game' } });
                          }}
                        >
                          SIGN IN WITH NOSTR ⚡
                        </button>
                      </>
                    ) : (
                    <button
                      type="button"
                      className="solo-zap-post-btn"
                      disabled={noteState === 'posting' || noteState === 'zapping'}
                      onClick={() => { void postBountyNote(); }}
                    >
                      {noteState === 'posting' || noteState === 'zapping' ? (
                        <>
                          <svg className="solo-zap-post-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                            <circle cx="12" cy="12" r="9" strokeOpacity="0.15" />
                            <path d="M12 3a9 9 0 0 1 9 9" />
                          </svg>
                          {resolveSignerMode() === 'nip46' ? 'WAITING FOR APPROVAL…' : noteState === 'zapping' ? 'ZAPPING…' : 'SIGNING…'}
                        </>
                      ) : 'POST NOTE & CLAIM ZAP ⚡'}
                    </button>
                    )
                  ) : null}
                  {noteState === 'error' && noteError ? (
                    <p className="solo-zap-note-err">{noteError}</p>
                  ) : null}
                </div>
                )}
              </>
            ) : (
              <>
                <div className="solo-zap-header">
                  <span className="solo-zap-badge solo-zap-badge--lose">✗ DEFEATED</span>
                  <h2 className="solo-zap-title">GAME OVER</h2>
                  <p className="solo-zap-challenge">{soloEndData.name}</p>
                </div>

                <div className="solo-zap-amount solo-zap-amount--lose">
                  <span className="solo-zap-sats solo-zap-sats--lose">0</span>
                  <span className="solo-zap-unit">SATS</span>
                </div>

                <div className="solo-zap-receipt">
                  <div className="solo-zap-row">
                    <span className="solo-zap-label">BOUNTY</span>
                    <span className="solo-zap-value">{soloEndData.bounty.toLocaleString()} sats — not earned</span>
                  </div>
                  <div className="solo-zap-row">
                    <span className="solo-zap-label">TIP</span>
                    <span className="solo-zap-value solo-zap-value--tip">Study the AI pattern and try again</span>
                  </div>
                </div>
              </>
            )}

            <p className="solo-zap-hint">PRESS ANY BUTTON TO CONTINUE</p>
          </div>
        </div>
      )}
    </>
  );
}
