import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sponsorship } from '@/components/ui/Sponsorship';
import {
  createGameState,
  createNewCoinbase,
  getHudState,
} from '@/game/engine';
import type { GameState } from '@/game/engine/types';
import { GameAudioSystem } from '@/game/audio/gameAudio';
import { PixiGameRenderer } from '@/game/render/pixiRenderer';
import { startMempoolFeed, type BitcoinDetails } from '@/game/io/mempool';
import { useGamepad } from '@/hooks/useGamepad';
import { useSocket } from '@/hooks/useSocket';
import { useAudio } from '@/contexts/AudioContext';
import { PlayerRole } from '@/types/socket';
import { useGameSocketEvents } from '@/features/game/hooks/useGameSocketEvents';
import { useGameRenderBridge } from '@/features/game/hooks/useGameRenderBridge';
import { useGameInputBindings } from '@/features/game/hooks/useGameInputBindings';
import { GAME_BOOTSTRAP_TIMEOUT_MS } from '@/shared/constants/timeouts';
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

export default function Game() {
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
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
  const [bitcoin, setBitcoin] = useState<BitcoinDetails>(DEFAULT_BITCOIN_DETAILS);
  const [footerHighlight, setFooterHighlight] = useState(false);
  const [canvasHighlight, setCanvasHighlight] = useState(false);
  const [zapMessages, setZapMessages] = useState<ZapMessage[]>([]);
  const [soloEndData, setSoloEndData] = useState<{ won: boolean; name: string; bounty: number; preimage: string; lnAddress: string } | null>(null);

  const canShowP1Image = useMemo(() => player1Img.length > 0, [player1Img]);
  const canShowP2Image = useMemo(() => player2Img.length > 0, [player2Img]);

  const isPowerupMode = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('gameConfig');
      if (!raw) return false;
      const cfg = JSON.parse(raw) as Record<string, unknown>;
      const m = String(cfg.mode ?? '').toUpperCase();
      if (m === 'LOCAL' || m === 'TESTNET' || m === 'SOLO') return Boolean(cfg.powerupMode);
      return m === 'POWERUP' || m === 'POWER-UP ARENA';
    } catch {
      return false;
    }
  }, []);

  const bootstrapLocalGame = useCallback(() => {
    if (localBootRef.current) return;
    localBootRef.current = true;

    // sessionStorage from local hub (/local); legacy POWERUP sessions may remain
    let gameConfig: Record<string, unknown> = {};
    try {
      const raw = sessionStorage.getItem('gameConfig');
      if (raw) gameConfig = JSON.parse(raw);
    } catch {
      // ignore
    }

    const configMode = String(gameConfig.mode ?? '').toUpperCase();
    const isLocalHub = configMode === 'LOCAL' || configMode === 'TESTNET' || configMode === 'SOLO';
    const isLegacyPowerup =
      configMode === 'POWERUP' || configMode === 'POWER-UP ARENA';
    const isConvergence = isLocalHub && Boolean(gameConfig.convergenceMode);
    const isPowerup =
      isLegacyPowerup || (isLocalHub && Boolean(gameConfig.powerupMode));
    const isPracticeMode = Boolean(gameConfig.practiceMode);
    const aiTier = (gameConfig.aiTier as string) ?? 'hunter';
    const p1Name = String(gameConfig.p1Name ?? 'Player 1');
    const rawP2Name = String(gameConfig.p2Name ?? (isPracticeMode ? 'BigToshi 🌊' : 'Player 2'));

    let p1Human = true;
    let p2Human = !isPracticeMode;
    if (typeof gameConfig.p1Human === 'boolean') p1Human = gameConfig.p1Human;
    if (typeof gameConfig.p2Human === 'boolean') p2Human = gameConfig.p2Human;
    const p3Human = gameConfig.p3Human === true;
    const p4Human = gameConfig.p4Human === true;

    const hudFromConfig =
      gameConfig.localHudLabel ?? gameConfig.testnetHudLabel;
    const modeLabel =
      isLocalHub && typeof hudFromConfig === 'string'
        ? String(hudFromConfig)
        : isLegacyPowerup
          ? 'POWER-UP ARENA'
          : 'LOCAL';
    const displayP2Name = isLocalHub
      ? String(gameConfig.p2Name ?? 'Player 2')
      : isPracticeMode
        ? rawP2Name
        : 'Player 2';

    const teamMode = (gameConfig.teamMode as 'solo' | 'teams' | 'ffa') ?? 'solo';

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

    const state = createGameState({
      p1Name,
      p2Name: displayP2Name,
      p1Points: 1000,
      p2Points: 1000,
      modeLabel,
      practiceMode: isPracticeMode,
      p1Human,
      p2Human,
      p3Human,
      p4Human,
      isTournament: false,
      sovereignMode: false,
      aiTier: aiTier as import('@/game/engine/types').AiTier,
      teamAllyAiTier: gameConfig.teamAllyAiTier as import('@/game/engine/types').AiTier | undefined,
      teamEnemyAiTier: gameConfig.teamEnemyAiTier as import('@/game/engine/types').AiTier | undefined,
      ffaAiTier: gameConfig.ffaAiTier as import('@/game/engine/types').AiTier | undefined,
      overclockMode: false,
      convergenceMode: isConvergence,
      convergenceShrinkInterval,
      convergenceMinCols,
      convergenceMinRows,
      convergenceStepMs,
      powerupMode: isPowerup,
      gauntletMode: false,
      gauntletLevel: 1,
      labyrinthMode: false,
      teamMode,
    });
    stateRef.current = state;
    winnerSentRef.current = false;
    setPlayer1Name(p1Name);
    setPlayer2Name(displayP2Name);
    setP1Points(1000);
    setP2Points(1000);
    setGameInfo(modeLabel);

    const hud = getHudState(state);
    setCaptureP1(hud.captureP1);
    setCaptureP2(hud.captureP2);
    captureP1Ref.current = hud.captureP1;
    captureP2Ref.current = hud.captureP2;
    setInitialP1Width(hud.initialWidthP1);
    setInitialP2Width(hud.initialWidthP2);
    setCurrentP1Width(hud.currentWidthP1);
    setCurrentP2Width(hud.currentWidthP2);
    setLoading(false);
    audioRef.current?.startMusic();
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

  // Detect P1 win in SOLO mode and surface the mock zap-proof overlay.
  useEffect(() => {
    if (loading) return;
    let cfg: Record<string, unknown> = {};
    try { const r = sessionStorage.getItem('gameConfig'); if (r) cfg = JSON.parse(r); } catch { /* ignore */ }
    if (String(cfg.mode ?? '').toUpperCase() !== 'SOLO') return;

    const poll = window.setInterval(() => {
      const state = stateRef.current;
      if (!state?.gameEnded || !state.winnerPlayer) return;
      window.clearInterval(poll);
      const won    = state.winnerPlayer === 'P1';
      const bounty = Number(cfg.soloBounty ?? 0);
      const name   = String(cfg.soloChallengeName ?? 'CHALLENGE');
      const ln     = localStorage.getItem('arcadeLnAddress') ?? '';
      const preimage = won
        ? Array.from({ length: 32 }, () =>
            Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
          ).join('')
        : '';
      setSoloEndData({ won, name, bounty, preimage, lnAddress: ln });
    }, 150);

    return () => window.clearInterval(poll);
  }, [loading, stateRef]);

  useEffect(() => {
    audioRef.current?.applyAppMuteState(isMuted, isMusicMuted);
  }, [isMuted, isMusicMuted, loading]);


  useEffect(() => {
    // Local hub (and legacy POWERUP) bootstrap without waiting for socket
    let gameConfig: Record<string, unknown> = {};
    try {
      const raw = sessionStorage.getItem('gameConfig');
      if (raw) gameConfig = JSON.parse(raw);
    } catch {
      // ignore
    }
    const localModes = ['LOCAL', 'TESTNET', 'POWERUP', 'POWER-UP ARENA', 'SOLO'];
    const configMode = String(gameConfig.mode ?? '').toUpperCase();
    if (localModes.includes(configMode)) {
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
    players: Record<string, { value?: number }>;
  }) => {
    const p1 = data.players['Player 1'];
    const p2 = data.players['Player 2'];
    if (p1?.value != null) setP1Points(Math.floor(p1.value));
    if (p2?.value != null) setP2Points(Math.floor(p2.value));
  }, []);

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
  }) => {
    setP1Points(hud.p1Points);
    setP2Points(hud.p2Points);
    setCaptureP1(hud.captureP1);
    setCaptureP2(hud.captureP2);
    setCurrentP1Width(hud.currentWidthP1);
    setCurrentP2Width(hud.currentWidthP2);
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
    const modeRoutes: Record<string, string> = {
      LOCAL: '/local',
      TESTNET: '/local',
      POWERUP: '/local',
      'POWER-UP ARENA': '/local',
      SOLO: '/solo',
    };
    const modeRoute = modeRoutes[configMode];
    if (modeRoute) { navigate(modeRoute); return; }
    navigate('/postgame');
  }, [navigate]);

  useGameSocketEvents({
    socket,
    loading,
    stateRef,
    localBootRef,
    winnerSentRef,
    onSetGameHeader: handleSetGameHeader,
    onHudSync: handleHudSync,
    onLoadingResolved: handleLoadingResolved,
    onBootstrapFallback: bootstrapLocalGame,
    onPointsUpdated: handlePointsUpdated,
    onZapReceived: handleZapReceived,
  });

  useGameRenderBridge({
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
    onHudTick: handleHudTick,
    onCaptureChanged: handleCaptureChanged,
  });

  useEffect(() => {
    if (loading || !stateRef.current) return;
    const stopFeed = startMempoolFeed({
      onInit: (details) => {
        setBitcoin((prev) => ({
          height: details.height || prev.height,
          timeAgo: details.timeAgo || prev.timeAgo,
          size: details.size || prev.size,
          txCount: details.txCount || prev.txCount,
          miner: details.miner || prev.miner,
          medianFee: details.medianFee || prev.medianFee,
        }));
      },
      onNewBlock: (block, details) => {
        setBitcoin(details);
        setCanvasHighlight(true);
        setFooterHighlight(true);
        window.setTimeout(() => setCanvasHighlight(false), 1000);
        window.setTimeout(() => setFooterHighlight(false), 2000);
        createNewCoinbase(stateRef.current!, block.extras?.medianFee ?? -1);
        audioRef.current?.playBlockFound();
      },
    });
    return () => stopFeed();
  }, [loading]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setZapMessages((prev) =>
        prev
          .map((zap) => ({
            ...zap,
            hidden: zap.top > 17.5 ? false : zap.hidden,
            top: zap.top - 0.04,
          }))
          .filter((zap) => zap.top > -1)
      );
    }, 16);
    return () => window.clearInterval(timer);
  }, []);

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
        <div>
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

          <div id="gameCanvas" className={canvasHighlight ? 'highlight' : ''}>
            <div id="gameCanvasHost" ref={hostRef} />
          </div>

          {isPowerupMode && (
            <div id="powerUpKey">
              {([
                {
                  type: 'SURGE', color: '#C8881A', label: 'SURGE', desc: 'Speed boost · immune to tail collision · 4s',
                  icon: <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="powerUpKeyIcon"><path d="M10 2L4 9h5l-3 5 8-7H9l1-5z" fill="currentColor"/></svg>,
                },
                {
                  type: 'FREEZE', color: '#2878A8', label: 'FREEZE', desc: 'Opponent slows to half speed · 4s',
                  icon: <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="powerUpKeyIcon"><path d="M8 1v14M1 8h14M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg>,
                },
                {
                  type: 'PHANTOM', color: '#9898B8', label: 'GHOST', desc: 'Loops through walls · phase through own tail · semi-invisible · 5s',
                  icon: <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="powerUpKeyIcon"><path d="M3 14V7a5 5 0 0110 0v7l-2-1.5-2 1.5-2-1.5L5 15l-2-1z" fill="currentColor" opacity="0.85"/><circle cx="6" cy="7" r="1.2" fill="#000" opacity="0.6"/><circle cx="10" cy="7" r="1.2" fill="#000" opacity="0.6"/></svg>,
                },
                {
                  type: 'ANCHOR', color: '#D0D0D0', label: 'ANCHOR', desc: 'Drops obstacle wall on next collision · 10s',
                  icon: <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="powerUpKeyIcon"><circle cx="8" cy="4" r="1.8" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5.8V14M4 8h8M4 14c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
                },
                {
                  type: 'AMPLIFIER', color: '#7AAA70', label: 'AMP', desc: 'Next 3 coinbases score double',
                  icon: <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="powerUpKeyIcon"><path d="M2 12L7 4l3 5 2-3 3 6H2z" fill="currentColor"/></svg>,
                },
                {
                  type: 'DECOY', color: '#ffffff', label: 'DECOY', desc: 'Fake coinbase · teleports opponent back to spawn',
                  icon: <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="powerUpKeyIcon"><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>,
                },
              ] as { type: string; color: string; label: string; desc: string; icon: React.ReactNode }[]).map(({ type, color, label, desc, icon }) => (
                <div key={type} className="powerUpKeyEntry">
                  <div className="powerUpKeyHeader">
                    <span className="powerUpKeyIconWrap" style={{ color }}>{icon}</span>
                    <span className="powerUpKeyName" style={{ color }}>{label}</span>
                  </div>
                  <span className="powerUpKeyDesc">{desc}</span>
                </div>
              ))}
            </div>
          )}

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
                  <span className="solo-zap-badge">⚡ ZAP SENT</span>
                  <h2 className="solo-zap-title">CHALLENGE COMPLETE</h2>
                  <p className="solo-zap-challenge">{soloEndData.name}</p>
                </div>

                <div className="solo-zap-amount">
                  <span className="solo-zap-sats">{soloEndData.bounty.toLocaleString()}</span>
                  <span className="solo-zap-unit">SATS</span>
                </div>

                <div className="solo-zap-receipt">
                  <div className="solo-zap-row">
                    <span className="solo-zap-label">TO</span>
                    <span className="solo-zap-value solo-zap-value--ln">
                      {soloEndData.lnAddress || '—'}
                    </span>
                  </div>
                  <div className="solo-zap-row">
                    <span className="solo-zap-label">PREIMAGE</span>
                    <span className="solo-zap-value solo-zap-value--hash">
                      {soloEndData.preimage}
                    </span>
                  </div>
                  <div className="solo-zap-row">
                    <span className="solo-zap-label">STATUS</span>
                    <span className="solo-zap-value solo-zap-value--ok">SETTLED ✓</span>
                  </div>
                </div>
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
