import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { useGamepad } from '@/hooks/useGamepad';
import type { SerializedGameInfo } from '@/types/socket';
import '@/components/ui/Button.css';
import './postgame.css';

type MenuState = 1 | 2 | 3;
type ActiveButtonMenu1 = 0 | 1;
type ActiveButtonMenu3 = 0 | 1;

interface PostGameInfoResponse extends SerializedGameInfo {
  lnurlw?: string;
  numbeOfPlayers?: number;
}

const PLACEHOLDER_WITHDRAWAL_URL =
  'MARSURL1DP68GURN8GHJ7MRWVF5HGUEWV3HK5MEWWP6Z7AMFW35XGUNPWUHKZURF9AMRZTMVDE6HYMP0V438Y7NKXUE5S5TFG9X9GE2509N5VMN0G46S0WQJQ4';

export default function PostGame() {
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<MenuState>(1);
  const [activeButtonMenu1, setActiveButtonMenu1] = useState<ActiveButtonMenu1>(0);
  const [activeButtonMenu3, setActiveButtonMenu3] = useState<ActiveButtonMenu3>(0);
  const [winnerPlayer, setWinnerPlayer] = useState<'Player 1' | 'Player 2'>('Player 1');
  const [winnerName, setWinnerName] = useState('PLAYER 1');
  const [winnerPicture, setWinnerPicture] = useState<string>('');
  const [p1Name, setP1Name] = useState('Player 1');
  const [p2Name, setP2Name] = useState('Player 2');
  const [p1Deposit, setP1Deposit] = useState(0);
  const [p2Deposit, setP2Deposit] = useState(0);
  const [totalPrize, setTotalPrize] = useState(0);
  const [lnurlw, setLnurlw] = useState<string>('');
  const [qrValue, setQrValue] = useState<string>(PLACEHOLDER_WITHDRAWAL_URL);
  const [tournamentMode, setTournamentMode] = useState(false);
  const [gameMode, setGameMode] = useState<string>('');
  const [prizeClaimed, setPrizeClaimed] = useState(false);
  const [creatingWithdrawal, setCreatingWithdrawal] = useState(false);

  useGamepad(true);

  useEffect(() => {
    if (!socket) return;
    const requestPostGameInfo = () => {
      socket.emit('postGameInfoRequest');
    };
    // Request immediately and again on connect to avoid lifecycle race conditions.
    const emitTimer = window.setTimeout(requestPostGameInfo, 0);
    socket.on('connect', requestPostGameInfo);
    // Do not keep the page blocked forever when backend does not answer.
    const fallbackTimer = window.setTimeout(() => setLoading(false), 12000);
    return () => {
      window.clearTimeout(emitTimer);
      window.clearTimeout(fallbackTimer);
      socket.off('connect', requestPostGameInfo);
    };
  }, [socket]);

  const updateHighscores = useCallback(async () => {
    try {
      const response = await fetch('/files/highscores.json');
      if (!response.ok) return;
      const highscores = (await response.json()) as Array<Record<string, unknown>>;
      const ordered = [...highscores].sort((a, b) => Number(b.prize) - Number(a.prize));
      const last = ordered[ordered.length - 1];
      if (!last || Number(last.prize) >= totalPrize) return;

      const replacement = {
        ...last,
        tournament: tournamentMode,
        p1Name,
        p1sats: p1Deposit,
        p2Name,
        p2sats: p2Deposit,
        winner: winnerPlayer,
        prize: totalPrize,
      };
      ordered[ordered.length - 1] = replacement;

      await fetch('/savejson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ordered),
      });
    } catch {
      // Keep UX resilient even if highscore update fails.
    }
  }, [p1Deposit, p1Name, p2Deposit, p2Name, totalPrize, tournamentMode, winnerPlayer]);

  const onClaim = useCallback(() => {
    if (!socket) return;
    if (menu === 3) {
      navigate('/highscores');
      return;
    }
    if (menu === 2) {
      setCreatingWithdrawal(false);
      setMenu(1);
      return;
    }
    if (!lnurlw) {
      setCreatingWithdrawal(true);
      setQrValue('');
      setMenu(2);
      socket.emit('createWithdrawalPostGame');
    } else {
      setQrValue(lnurlw);
      setMenu(2);
    }
  }, [socket, menu, navigate, lnurlw]);

  const onDoubleOrNothing = useCallback(() => {
    if (!socket) return;
    if (menu !== 1 || tournamentMode || prizeClaimed || loading) return;
    console.log('[PostGame] emitting doubleornothing', {
      connected: socket.connected,
      id: socket.id,
      mode: gameMode,
    });
    socket.emit('doubleornothing');
    // Keep legacy full-page navigation, but allow one frame for websocket frame flush.
    window.setTimeout(() => {
      window.location.href = gameMode === 'PRACTICE' ? '/practicemenu' : '/gamemenu';
    }, 120);
  }, [socket, menu, tournamentMode, prizeClaimed, loading, gameMode]);

  useEffect(() => {
    if (!socket) return;

    const onPostGameInfo = (info: PostGameInfoResponse) => {
      const players = info.players ?? {};
      const p1 = players['Player 1'];
      const p2 = players['Player 2'];
      const winners = info.winners ?? [];
      const winnerP = (winners[winners.length - 1] ?? 'Player 1') as
        | 'Player 1'
        | 'Player 2';
      setWinnerPlayer(winnerP);

      if (info.mode === 'TOURNAMENT') {
        setTournamentMode(true);
      } else {
        setTournamentMode(false);
      }
      setGameMode(info.mode ?? '');

      const p1N = p1?.name?.trim() || 'Player 1';
      const p2N = p2?.name?.trim() || (info.mode === 'PRACTICE' ? 'BigToshi 🌊' : 'Player 2');
      setP1Name(p1N);
      setP2Name(p2N);

      const p1S = Number(p1?.value ?? 0);
      const p2S = Number(
        info.mode === 'PRACTICE' ? 0 : p2?.value ?? 0
      );
      setP1Deposit(p1S);
      setP2Deposit(p2S);

      const rawTotal = info.mode === 'PRACTICE' ? p1S : p1S + p2S;
      const prize = info.mode === 'TOURNAMENT' ? Math.floor(rawTotal * 0.95) : Math.floor(rawTotal);
      setTotalPrize(prize);

      const winnerN = winnerP === 'Player 1' ? p1N : p2N;
      setWinnerName(winnerN.toUpperCase());
      const winnerPic =
        winnerP === 'Player 1'
          ? p1?.picture || ''
          : p2?.picture || '';
      setWinnerPicture(winnerPic);

      if (info.lnurlw) {
        setLnurlw(info.lnurlw);
        setQrValue(info.lnurlw);
        setCreatingWithdrawal(false);
        setMenu(2);
      }

      setLoading(false);
    };

    const onPrizeWithdrawn = () => {
      sessionStorage.clear();
      setPrizeClaimed(true);
      setMenu(3);
      void updateHighscores();
    };

    const onCreateWithdrawal = (data: string) => {
      if (data === 'pass') {
        navigate('/');
      } else {
        setLnurlw(data);
        setQrValue(data);
        setCreatingWithdrawal(false);
        setMenu(2);
      }
    };

    socket.on('resPostGameInfoRequest', onPostGameInfo);
    socket.on('prizeWithdrawn', onPrizeWithdrawn);
    socket.on('resCreateWithdrawalPostGame', onCreateWithdrawal);

    return () => {
      socket.off('resPostGameInfoRequest', onPostGameInfo);
      socket.off('prizeWithdrawn', onPrizeWithdrawn);
      socket.off('resCreateWithdrawalPostGame', onCreateWithdrawal);
    };
  }, [socket, navigate, updateHighscores]);

  const developerFee = Math.floor((p1Deposit + p2Deposit) * 0.02);
  const designerFee = Math.floor((p1Deposit + p2Deposit) * 0.01);
  const hostFee = developerFee;
  const practiceMode = gameMode === 'PRACTICE';
  const canDoubleOrNothing = menu === 1 && !tournamentMode && !prizeClaimed && !loading;

  const claimButtonText = useMemo(() => {
    if (menu === 3) return 'HIGHSCORES';
    if (menu === 2) return creatingWithdrawal ? 'CREATING CODE...' : 'BLUR QR CODE';
    if (practiceMode) return 'END PRACTICE';
    if (tournamentMode) return 'CLAIM TOURNAMENT PRIZE';
    return 'SWEEP VIA LNURL';
  }, [menu, tournamentMode, practiceMode, creatingWithdrawal]);
  const qrHref = lnurlw ? `lightning:${lnurlw}` : undefined;

  const onMainMenu = () => {
    if (menu === 3) {
      navigate('/');
      return;
    }
    navigate('/');
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        if (menu === 3) setActiveButtonMenu3(0);
      }
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        if (menu === 3) setActiveButtonMenu3(1);
      }
      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        if (menu === 1) setActiveButtonMenu1(0);
      }
      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
        if (menu === 1 && !tournamentMode) setActiveButtonMenu1(1);
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (menu === 1) {
          if (activeButtonMenu1 === 0) onClaim();
          else onDoubleOrNothing();
        } else if (menu === 2) {
          onClaim();
        } else if (menu === 3) {
          if (activeButtonMenu3 === 0) navigate('/highscores');
          else navigate('/');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menu, activeButtonMenu1, activeButtonMenu3, tournamentMode, navigate, onClaim, onDoubleOrNothing]);

  return (
    <>
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div id="postGame" className={`flex full flex-center animateIn ${loading ? 'empty' : ''}`}>
        <div className="flex">
          <h2 id="gameOver">GAME OVER</h2>
          <div className="playerInfoGroup">
            <img
              className={`playerImg inline ${winnerPicture ? '' : 'hide'}`}
              id="playerImg"
              src={winnerPicture || '/images/loading.gif'}
              alt=""
            />
            <h1 id="winner" className="inline" style={{ display: practiceMode ? 'none' : undefined }}>
              {winnerName} WINS
            </h1>
          </div>
        </div>

        {tournamentMode || practiceMode ? null : (
          <div id="fees">
            <span id="split1">
              2% <span id="hostFee">({hostFee.toLocaleString()} sats)</span> to the Sponsor (@piratehash)
            </span>{' '}
            ·{' '}
            <span id="split2">
              2% <span id="developerFee">({developerFee.toLocaleString()} sats)</span> to the developer
              (@francismars)
            </span>{' '}
            ·{' '}
            <span id="split3">
              1% <span id="designerFee">({designerFee.toLocaleString()} sats)</span> to the designer
              (@bitcoinanatomy)
            </span>
          </div>
        )}

        <h1 id="prize">{totalPrize.toLocaleString()} SATS{prizeClaimed ? ' CLAIMED' : ''}</h1>
        <p id="claimText" style={{ display: menu === 3 || practiceMode ? 'none' : undefined }}>
          CLAIM YOUR WINNINGS
        </p>
        <a id="qrcodeLink" href={qrHref}>
          {menu === 3 ? null : qrValue ? (
            <QRCodeCanvas className={`qrcode ${menu === 1 ? 'blur' : ''}`} id="qrCode1" value={qrValue} size={800} />
          ) : (
            <img
              className={`qrcode ${menu === 1 ? 'blur' : ''}`}
              id="qrCode1"
              src="/images/loading.gif"
              alt=""
            />
          )}
        </a>
        <p id="claimReq1" style={{ display: menu === 3 ? 'none' : undefined }}>
          Requires compatible wallet.
        </p>
        <div
          id="buttonsDiv"
          style={{
            flexDirection: menu === 3 ? 'row' : 'column',
            justifyContent: menu === 3 ? 'center' : undefined,
            gap: menu === 3 ? '21px' : undefined,
            marginTop: menu === 3 ? '16cqw' : undefined,
          }}
        >
          <Button
            id="claimbutton"
            style={{ animationDuration: menu === 3 ? (activeButtonMenu3 === 0 ? '2s' : '0s') : (activeButtonMenu1 === 0 ? '2s' : '0s') }}
            onClick={onClaim}
          >
            {claimButtonText}
          </Button>
          {menu === 3 ? null : (
            <Button
              id="doubleornotthingbutton"
              className={canDoubleOrNothing ? '' : 'disabled'}
              disabled={!canDoubleOrNothing}
              style={{ animationDuration: activeButtonMenu1 === 1 ? '2s' : '0s' }}
              onClick={onDoubleOrNothing}
            >
              {practiceMode ? 'PRACTICE AGAIN' : 'DOUBLE OR NOTHING'}
            </Button>
          )}
          {menu === 3 ? (
            <Button
              id="startnewbutton"
              style={{ display: 'block', animationDuration: activeButtonMenu3 === 1 ? '2s' : '0s' }}
              onClick={onMainMenu}
            >
              RETURN TO MAIN MENU
            </Button>
          ) : (
            <Button id="startnewbutton" style={{ display: 'none' }} onClick={onMainMenu}>
              RETURN TO MAIN MENU
            </Button>
          )}
        </div>
        <div id="socialFollow">
          Follow <img className="social-icon" src="/images/social/Nostr.png" /> chainduel@nostrplebs.com{' '}
          <img className="social-icon" src="/images/social/Twitter.png" /> @chainduel
        </div>
      </div>

      <div className={`overlay ${loading ? '' : 'hide'}`} id="loading">
        <img src="/images/loading.gif" alt="Loading" />
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </>
  );
}
