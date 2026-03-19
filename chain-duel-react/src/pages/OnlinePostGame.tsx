import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { useSocket } from '@/hooks/useSocket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import '@/styles/pages/onlinePostGame.css';

interface OnlinePostGameInfo {
  roomId: string;
  phase: 'finished';
  p1Name: string;
  p2Name: string;
  p1Picture?: string;
  p2Picture?: string;
  p1Points: number;
  p2Points: number;
  winnerRole?: 'Player 1' | 'Player 2';
  winnerSessionID?: string;
  winnerName: string;
  winnerPicture?: string;
  winnerPoints: number;
  totalPrize: number;
  lnurlw?: string;
  doubleOrNothingVotes: number;
}

const PLACEHOLDER_LNURL =
  'MARSURL1DP68GURN8GHJ7MRWVF5HGUEWV3HK5MEWWP6Z7AMFW35XGUNPWUHKZURF9AMRZTMVDE6HYMP0V438Y7NKXUE5S5TFG9X9GE2509N5VMN0G46S0WQJQ4';

export default function OnlinePostGame() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket } = useSocket({ autoConnect: true });
  const roomId = searchParams.get('roomId') ?? '';
  const sessionID = sessionStorage.getItem('sessionID') ?? '';
  const [info, setInfo] = useState<OnlinePostGameInfo | null>(null);
  const [votes, setVotes] = useState(0);
  const [requiredVotes, setRequiredVotes] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatingWithdrawal, setCreatingWithdrawal] = useState(false);
  const [lnurlw, setLnurlw] = useState('');

  const isWinner = Boolean(info?.winnerSessionID && info.winnerSessionID === sessionID);

  useEffect(() => {
    if (!roomId) {
      navigate('/online');
    }
  }, [navigate, roomId]);

  useEffect(() => {
    if (!socket || !roomId) {
      return;
    }

    const requestInfo = () => socket.emit('getOnlinePostGame', { roomId });
    requestInfo();
    socket.on('connect', requestInfo);

    const onInfo = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlinePostGameInfo(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      setInfo(parsed);
      setVotes(parsed.doubleOrNothingVotes);
      if (parsed.lnurlw) {
        setLnurlw(parsed.lnurlw);
      }
      setLoading(false);
    };

    const onWithdrawal = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.createOnlineWithdrawal(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      setCreatingWithdrawal(false);
      if (parsed.lnurlw !== 'pass') {
        setLnurlw(parsed.lnurlw);
      }
    };

    const onDonUpdate = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlineDoubleOrNothingUpdate(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      setVotes(parsed.votes);
      setRequiredVotes(parsed.required);
      if (parsed.agreed) {
        navigate(`/online/lobby?roomId=${encodeURIComponent(roomId)}`);
      }
    };

    const onRoomUpdated = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlineRoomUpdated(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      if (parsed.phase === 'lobby') {
        navigate(`/online/lobby?roomId=${encodeURIComponent(roomId)}`);
      }
    };

    const onInvalid = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.onlinePinInvalid(payload);
      if (!parsed) {
        return;
      }
      setCreatingWithdrawal(false);
      setError(parsed.reason);
      setLoading(false);
    };

    socket.on('resOnlinePostGameInfo', onInfo);
    socket.on('resCreateOnlineWithdrawal', onWithdrawal);
    socket.on('onlineDoubleOrNothingUpdate', onDonUpdate);
    socket.on('onlineRoomUpdated', onRoomUpdated);
    socket.on('onlinePinInvalid', onInvalid);
    return () => {
      socket.off('connect', requestInfo);
      socket.off('resOnlinePostGameInfo', onInfo);
      socket.off('resCreateOnlineWithdrawal', onWithdrawal);
      socket.off('onlineDoubleOrNothingUpdate', onDonUpdate);
      socket.off('onlineRoomUpdated', onRoomUpdated);
      socket.off('onlinePinInvalid', onInvalid);
    };
  }, [navigate, roomId, socket]);

  const withdrawalValue = useMemo(() => {
    if (lnurlw) {
      return lnurlw;
    }
    if (creatingWithdrawal) {
      return '';
    }
    return PLACEHOLDER_LNURL;
  }, [creatingWithdrawal, lnurlw]);

  return (
    <div className="online-postgame-page">
      <Sponsorship id="sponsorship-online-postgame" />
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div className="online-postgame-card">
        <div className="online-postgame-headline">
          <p className="online-postgame-kicker">ONLINE MATCH COMPLETE</p>
          <h1 className="online-postgame-title">VICTORY SCREEN</h1>
        </div>

        <div className="online-postgame-winner-panel">
          <div className="online-postgame-winner">
            <img
              className={`online-postgame-avatar ${info?.winnerPicture ? '' : 'hide'}`}
              src={info?.winnerPicture || '/images/loading.gif'}
              alt={info?.winnerName || 'Winner'}
            />
            <h2>{(info?.winnerName || 'WINNER').toUpperCase()} WINS</h2>
          </div>
          <p className="online-postgame-prize">
            {Math.floor(info?.winnerPoints ?? 0).toLocaleString()} SATS
          </p>
          <p className="online-postgame-sub">
            Total pot: {Math.floor(info?.totalPrize ?? 0).toLocaleString()} sats
          </p>
        </div>

        <div className="online-postgame-scores">
          <div className="online-postgame-score-chip">
            <span className="online-postgame-score-label">{info?.p1Name ?? 'Player 1'}</span>
            <span className="online-postgame-score-value">{Math.floor(info?.p1Points ?? 0).toLocaleString()} sats</span>
          </div>
          <div className="online-postgame-score-chip">
            <span className="online-postgame-score-label">{info?.p2Name ?? 'Player 2'}</span>
            <span className="online-postgame-score-value">{Math.floor(info?.p2Points ?? 0).toLocaleString()} sats</span>
          </div>
        </div>

        <div className="online-postgame-grid">
          <div className="online-postgame-actions">
            <Button
              className={`${isWinner ? '' : 'disabled'} online-postgame-btn online-postgame-btn-withdraw`}
              disabled={!isWinner || creatingWithdrawal}
              onClick={() => {
                if (!socket || !roomId || !isWinner) {
                  return;
                }
                setError('');
                setCreatingWithdrawal(true);
                socket.emit('createOnlineWithdrawal', { roomId });
              }}
            >
              {isWinner ? (creatingWithdrawal ? 'CREATING WITHDRAW QR...' : 'WITHDRAW PRIZE') : 'WINNER CAN WITHDRAW'}
            </Button>
            <Button
              className="online-postgame-btn online-postgame-btn-don"
              onClick={() => {
                if (!socket || !roomId) {
                  return;
                }
                setError('');
                socket.emit('onlineDoubleOrNothing', { roomId });
              }}
            >
              DOUBLE OR NOTHING ({votes}/{requiredVotes})
            </Button>
            <Button
              className="online-postgame-btn online-postgame-btn-back"
              onClick={() => navigate(`/online/lobby?roomId=${encodeURIComponent(roomId)}`)}
            >
              BACK TO LOBBY
            </Button>
          </div>

          <div className="online-postgame-qr-wrap">
            <p className="online-postgame-qr-title">WITHDRAWAL QR</p>
            {withdrawalValue ? (
              <QRCodeSVG value={withdrawalValue} size={220} includeMargin className={lnurlw ? '' : 'online-postgame-qr-blur'} />
            ) : (
              <img src="/images/loading.gif" alt="Creating withdrawal" />
            )}
            <p className="online-postgame-qr-note">
              {lnurlw ? 'Scan with a compatible wallet.' : 'Winner can reveal QR by creating withdrawal.'}
            </p>
          </div>
        </div>

        {error ? <p className="online-postgame-error">Error: {error}</p> : null}
      </div>

      <div className={`overlay ${loading ? '' : 'hide'}`} id="loading">
        <img src="/images/loading.gif" alt="Loading" />
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
