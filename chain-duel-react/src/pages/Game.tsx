import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sponsorship } from '@/components/ui/Sponsorship';
import {
  canContinueAfterGame,
  createGameState,
  createNewCoinbase,
  getHudState,
  getMetaFromDuel,
  setWantedDirection,
  startCountdown,
  stepGame,
} from '@/game/engine';
import type { GameState } from '@/game/engine/types';
import { STEP_SPEED_MS } from '@/game/engine/constants';
import { GameAudioSystem } from '@/game/audio/gameAudio';
import { PixiGameRenderer } from '@/game/render/pixiRenderer';
import { startMempoolFeed, type BitcoinDetails } from '@/game/io/mempool';
import { useGamepad } from '@/hooks/useGamepad';
import { useSocket } from '@/hooks/useSocket';
import { PlayerRole, type SerializedGameInfo } from '@/types/socket';
import { SocketValidators } from '@/lib/socketValidation';
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
  useGamepad(true);

  const stateRef = useRef<GameState | null>(null);
  const rendererRef = useRef<PixiGameRenderer | null>(null);
  const audioRef = useRef<GameAudioSystem | null>(null);
  if (!audioRef.current) {
    audioRef.current = new GameAudioSystem();
  }
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const winnerSentRef = useRef(false);
  const localBootRef = useRef(false);
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
  const [isTournament, setIsTournament] = useState(false);
  const [zapMessages, setZapMessages] = useState<ZapMessage[]>([]);

  const canShowP1Image = useMemo(() => player1Img.length > 0, [player1Img]);
  const canShowP2Image = useMemo(() => player2Img.length > 0, [player2Img]);

  const bootstrapLocalGame = () => {
    if (localBootRef.current) return;
    localBootRef.current = true;
    const state = createGameState({
      p1Name: 'Player 1',
      p2Name: 'BigToshi 🌊',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'Practice',
      practiceMode: true,
      isTournament: false,
    });
    stateRef.current = state;
    winnerSentRef.current = false;
    setPlayer1Name('Player 1');
    setPlayer2Name('BigToshi 🌊');
    setP1Points(1000);
    setP2Points(1000);
    setGameInfo('Practice');
    setIsTournament(false);

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
  };

  useEffect(() => {
    const previousImage = document.body.style.backgroundImage;
    const previousSize = document.body.style.backgroundSize;
    const previousPosition = document.body.style.backgroundPosition;

    document.body.style.backgroundImage =
      "linear-gradient(to top, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.8)), url('/images/chainduel_bg_no_sat.jpg')";
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';

    return () => {
      document.body.style.backgroundImage = previousImage;
      document.body.style.backgroundSize = previousSize;
      document.body.style.backgroundPosition = previousPosition;
    };
  }, []);

  useEffect(() => {
    if (!socket || !connected) {
      const noSocketTimer = window.setTimeout(() => {
        if (loading && !stateRef.current) {
          bootstrapLocalGame();
        }
      }, 1200);
      return () => window.clearTimeout(noSocketTimer);
    }
    socket.emit('getDuelInfos');
  }, [socket, connected, loading]);

  useEffect(() => {
    if (!socket) return;
    const onDuel = (payload: unknown) => {
      const validated = SocketValidators.resGetDuelInfos(payload);
      if (!validated.success) return;
      localBootRef.current = true;
      const data = validated.data;
      const info = resolveDuelInfo(data);
      setPlayer1Name(info.p1Name);
      setPlayer2Name(info.p2Name);
      setPlayer1Img(info.p1Picture);
      setPlayer2Img(info.p2Picture);
      setP1Points(info.p1Points);
      setP2Points(info.p2Points);
      setGameInfo(info.gameLabel);
      setIsTournament(info.isTournament);

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
    };
    const onUpdate = (payload: unknown) => {
      const validated = SocketValidators.updatePayments(payload);
      if (!validated.success) return;
      const data = validated.data;
      const p1 = data.players['Player 1'];
      const p2 = data.players['Player 2'];
      if (p1?.value != null) setP1Points(Math.floor(p1.value));
      if (p2?.value != null) setP2Points(Math.floor(p2.value));
    };
    const onZap = (payload: unknown) => {
      const data = parseZap(payload);
      if (!data) return;
      setZapMessages((prev) => [
        ...prev,
        {
          ...data,
          id: `zap-${Date.now()}-${prev.length}`,
          top: 18,
          hidden: true,
        },
      ]);
    };
    socket.on('resGetDuelInfos', onDuel);
    socket.on('updatePayments', onUpdate);
    socket.on('zapReceived', onZap);
    const duelTimeout = window.setTimeout(() => {
      if (loading && !stateRef.current) {
        bootstrapLocalGame();
      }
    }, 2000);
    return () => {
      window.clearTimeout(duelTimeout);
      socket.off('resGetDuelInfos', onDuel);
      socket.off('updatePayments', onUpdate);
      socket.off('zapReceived', onZap);
    };
  }, [socket, loading]);

  useEffect(() => {
    if (!hostRef.current || !stateRef.current || loading) return;
    let mounted = true;
    const audio = audioRef.current;
    const renderer = new PixiGameRenderer();
    rendererRef.current = renderer;
    void renderer.mount(hostRef.current).then(() => {
      if (!mounted) return;
      renderer.resize();
      const onResize = () => renderer.resize();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    });

    gameLoopRef.current = window.setInterval(() => {
      const state = stateRef.current;
      if (!state) return;
      const prevCountdown = state.countdownTicks;
      const prevP1Len = state.p1.body.length;
      const prevP2Len = state.p2.body.length;
      const prevP1Head = [...state.p1.head] as [number, number];
      const prevP2Head = [...state.p2.head] as [number, number];

      const result = stepGame(state);
      const hud = getHudState(state);
      setP1Points(hud.p1Points);
      setP2Points(hud.p2Points);
      if (hud.captureP1 !== captureP1Ref.current) {
        setCaptureP1Highlight(true);
        window.setTimeout(() => setCaptureP1Highlight(false), 100);
      }
      if (hud.captureP2 !== captureP2Ref.current) {
        setCaptureP2Highlight(true);
        window.setTimeout(() => setCaptureP2Highlight(false), 100);
      }
      setCaptureP1(hud.captureP1);
      setCaptureP2(hud.captureP2);
      captureP1Ref.current = hud.captureP1;
      captureP2Ref.current = hud.captureP2;
      setCurrentP1Width(hud.currentWidthP1);
      setCurrentP2Width(hud.currentWidthP2);

      if (state.countdownStart && state.countdownTicks !== prevCountdown) {
        audio?.playCountdownTick(state.countdownTicks);
      }
      if (state.p1.body.length > prevP1Len) {
        audio?.playCapture(state.p1.body.length);
      }
      if (state.p2.body.length > prevP2Len) {
        audio?.playCapture(state.p2.body.length);
      }
      if ((prevP1Head[0] !== 6 || prevP1Head[1] !== 12) && state.p1.head[0] === 6 && state.p1.head[1] === 12) {
        audio?.playReset('P1');
      }
      if ((prevP2Head[0] !== 44 || prevP2Head[1] !== 12) && state.p2.head[0] === 44 && state.p2.head[1] === 12) {
        audio?.playReset('P2');
      }
      if (result.winnerChanged && result.winnerPlayer && socket && !winnerSentRef.current) {
        socket.emit(
          'gameFinished',
          result.winnerPlayer === 'P1' ? PlayerRole.Player1 : PlayerRole.Player2
        );
        winnerSentRef.current = true;
      }
    }, STEP_SPEED_MS);

    const frame = () => {
      const state = stateRef.current;
      if (state && rendererRef.current) {
        rendererRef.current.render(state);
      }
      frameRef.current = window.requestAnimationFrame(frame);
    };
    frameRef.current = window.requestAnimationFrame(frame);

    return () => {
      mounted = false;
      if (gameLoopRef.current) window.clearInterval(gameLoopRef.current);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      renderer.destroy();
      audio?.stopAll();
    };
  }, [loading, socket]);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = stateRef.current;
      if (!state) return;
      const key = event.key.toUpperCase();
      const isStartKey =
        key === ' ' ||
        key === 'ENTER' ||
        key === 'SPACE' ||
        key === 'SPACEBAR' ||
        event.code === 'Space' ||
        event.code === 'Enter' ||
        event.code === 'NumpadEnter';

      if (!state.gameStarted && isStartKey) {
        event.preventDefault();
        startCountdown(state);
      }

      if (canContinueAfterGame(state, event.key)) {
        navigate(state.meta.isTournament ? '/tournbracket' : '/postgame');
        return;
      }

      switch (key) {
        case 'A':
          setWantedDirection(state, 'P1', 'Left');
          break;
        case 'D':
          setWantedDirection(state, 'P1', 'Right');
          break;
        case 'W':
          setWantedDirection(state, 'P1', 'Up');
          break;
        case 'S':
          setWantedDirection(state, 'P1', 'Down');
          break;
        case 'ARROWLEFT':
          if (!state.meta.practiceMode) setWantedDirection(state, 'P2', 'Left');
          break;
        case 'ARROWRIGHT':
          if (!state.meta.practiceMode) setWantedDirection(state, 'P2', 'Right');
          break;
        case 'ARROWUP':
          if (!state.meta.practiceMode) setWantedDirection(state, 'P2', 'Up');
          break;
        case 'ARROWDOWN':
          if (!state.meta.practiceMode) setWantedDirection(state, 'P2', 'Down');
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  return (
    <>
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

      <div className={`bracketDetails in-game ${isTournament ? '' : 'hide'}`}>
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
    </>
  );
}

function resolveDuelInfo(data: SerializedGameInfo): {
  p1Name: string;
  p2Name: string;
  p1Points: number;
  p2Points: number;
  gameLabel: string;
  isTournament: boolean;
  practiceMode: boolean;
  p1Picture: string;
  p2Picture: string;
} {
  const p1 = data.players['Player 1'];
  const p2 = data.players['Player 2'];
  const mode = data.mode?.toUpperCase();
  if (mode === 'TOURNAMENT') {
    const assignedPlayers = data.players ?? {};
    const numberOfPlayers = Object.keys(assignedPlayers).length;
    const playersList = Array(Math.max(2, numberOfPlayers)).fill('');
    for (const key of Object.keys(assignedPlayers)) {
      const idx = Number.parseInt(key.replace('Player ', ''), 10) - 1;
      if (idx >= 0 && idx < playersList.length) {
        playersList[idx] = assignedPlayers[key]?.name ?? '';
      }
    }
    const winners = data.winners ?? [];
    let tournamentP1 = p1?.name || 'Player 1';
    let tournamentP2 = p2?.name || 'Player 2';
    if (winners.length + 1 < numberOfPlayers) {
      if (winners.length < numberOfPlayers / 2) {
        tournamentP1 = playersList[2 * winners.length] || tournamentP1;
        tournamentP2 = playersList[2 * winners.length + 1] || tournamentP2;
      } else {
        const winnerNames = buildWinnerNamesList(playersList, winners);
        tournamentP1 = winnerNames[2 * winners.length] || tournamentP1;
        tournamentP2 = winnerNames[2 * winners.length + 1] || tournamentP2;
      }
    }
    const startSats = Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10));
    return {
      p1Name: tournamentP1,
      p2Name: tournamentP2,
      p1Points: startSats,
      p2Points: startSats,
      gameLabel: `GAME ${winners.length + 1} of ${Math.max(1, numberOfPlayers - 1)}`,
      isTournament: true,
      practiceMode: false,
      p1Picture: p1?.picture ?? '',
      p2Picture: p2?.picture ?? '',
    };
  }
  if (!p2) {
    return {
      p1Name: p1?.name || 'Player 1',
      p2Name: 'BigToshi 🌊',
      p1Points: Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10)),
      p2Points: Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10)),
      gameLabel: 'Practice',
      isTournament: false,
      practiceMode: true,
      p1Picture: p1?.picture ?? '',
      p2Picture: '',
    };
  }
  const baseLabel = data.mode || 'P2P';
  const donRound = data.winners?.length ?? 0;
  const donText = donRound > 0 ? `*${2 ** donRound}` : '';
  return {
    p1Name: p1?.name || 'Player 1',
    p2Name: p2?.name || 'Player 2',
    p1Points: Math.floor(Number.parseInt(String(p1?.value ?? 1000), 10)),
    p2Points: Math.floor(Number.parseInt(String(p2?.value ?? 1000), 10)),
    gameLabel: `${baseLabel}${donText}`,
    isTournament: false,
    practiceMode: false,
    p1Picture: p1?.picture ?? '',
    p2Picture: p2?.picture ?? '',
  };
}

function buildWinnerNamesList(playersList: string[], winnersList: string[]): string[] {
  const playersListCopy = [...playersList];
  for (let i = 0; i < winnersList.length; i += 1) {
    const winner = winnersList[i];
    if (winner === 'Player 1') {
      playersListCopy.push(playersListCopy[2 * i] ?? '');
    } else {
      playersListCopy.push(playersListCopy[2 * i + 1] ?? '');
    }
  }
  return playersListCopy;
}

function parseZap(payload: unknown): Omit<ZapMessage, 'id' | 'top' | 'hidden'> | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const amount = Number.parseInt(String(source.amount ?? 0), 10);
  const scale =
    amount > 9999 ? 2 : amount >= 5000 ? 1.6 : amount >= 2000 ? 1.4 : amount >= 500 ? 1.2 : 1;
  return {
    username: String(source.username ?? 'zapper'),
    content: String(source.content ?? ''),
    amount: Number.isFinite(amount) ? amount : 0,
    profile: String(source.profile ?? '/images/loading.gif'),
    scale,
  };
}
