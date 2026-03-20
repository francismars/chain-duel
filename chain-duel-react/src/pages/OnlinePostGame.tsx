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
  phase: 'postgame' | 'finished';
  p1Name: string;
  p2Name: string;
  p1Picture?: string;
  p2Picture?: string;
  p1SessionID?: string;
  p2SessionID?: string;
  p1Points: number;
  p2Points: number;
  winnerRole?: 'Player 1' | 'Player 2';
  winnerSessionID?: string;
  winnerName: string;
  winnerPicture?: string;
  winnerPoints: number;
  totalPrize: number;
  lnurlw?: string;
  payoutMethod?: 'withdraw_qr' | 'nostr_zap';
  payoutTarget?: string;
  winnerLnAddress?: string;
  rematchRequested?: boolean;
  rematchRequiredAmount?: number;
  rematchNote1?: string;
  rematchWaitingForSessionID?: string;
  doubleOrNothingVotes: number;
}

const PLACEHOLDER_LNURL =
  'MARSURL1DP68GURN8GHJ7MRWVF5HGUEWV3HK5MEWWP6Z7AMFW35XGUNPWUHKZURF9AMRZTMVDE6HYMP0V438Y7NKXUE5S5TFG9X9GE2509N5VMN0G46S0WQJQ4';
const ONLINE_FEE_MULTIPLIER = 0.95;

export default function OnlinePostGame() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket } = useSocket({ autoConnect: true });
  const roomId = searchParams.get('roomId') ?? '';
  const [currentSessionID, setCurrentSessionID] = useState(
    () => sessionStorage.getItem('sessionID') ?? ''
  );
  const [info, setInfo] = useState<OnlinePostGameInfo | null>(null);
  const [votes, setVotes] = useState(0);
  const [requiredVotes, setRequiredVotes] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatingWithdrawal, setCreatingWithdrawal] = useState(false);
  const [creatingNostrPayout, setCreatingNostrPayout] = useState(false);
  const [lnurlw, setLnurlw] = useState('');

  const isWinner = Boolean(
    info?.winnerSessionID && info.winnerSessionID === currentSessionID
  );
  const donLocked = Boolean(lnurlw || info?.payoutMethod === 'nostr_zap' || info?.rematchRequested);
  const winnerHasNostrLn = Boolean(info?.winnerLnAddress);
  const payoutChosen = info?.payoutMethod === 'withdraw_qr' || info?.payoutMethod === 'nostr_zap';
  const payoutStatusText =
    info?.payoutMethod === 'withdraw_qr'
      ? 'Winner chose Withdraw via QR. Round closed.'
      : info?.payoutMethod === 'nostr_zap'
        ? 'Winner chose Pay to LN address. Round closed.'
        : '';

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
    const onSession = (payload: { sessionID: string }) => {
      if (!payload?.sessionID) {
        return;
      }
      setCurrentSessionID(payload.sessionID);
      sessionStorage.setItem('sessionID', payload.sessionID);
    };
    requestInfo();
    socket.on('connect', requestInfo);
    socket.on('session', onSession);

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

    const onNostrPayout = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.createOnlineNostrPayout(payload);
      if (!parsed || parsed.roomId !== roomId) {
        return;
      }
      setCreatingNostrPayout(false);
      setError('');
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              payoutMethod: 'nostr_zap',
              payoutTarget: parsed.lnAddress,
            }
          : prev
      );
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
      if (parsed.postGame) {
        const pg = parsed.postGame;
        setInfo((prev) =>
          prev
            ? {
                ...prev,
                payoutMethod: pg.payoutMethod,
                payoutTarget: pg.payoutTarget,
                rematchRequested: pg.rematchRequested,
                rematchRequiredAmount: pg.rematchRequiredAmount,
                rematchNote1: pg.rematchNote1,
                rematchWaitingForSessionID: pg.rematchWaitingForSessionID,
              }
            : prev
        );
        if (pg.lnurlw) {
          setLnurlw(pg.lnurlw);
        }
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
      setCreatingNostrPayout(false);
      setError(parsed.reason);
      setLoading(false);
    };

    socket.on('resOnlinePostGameInfo', onInfo);
    socket.on('resCreateOnlineWithdrawal', onWithdrawal);
    socket.on('onlineDoubleOrNothingUpdate', onDonUpdate);
    socket.on('onlineRoomUpdated', onRoomUpdated);
    socket.on('resCreateOnlineNostrPayout', onNostrPayout);
    socket.on('onlinePinInvalid', onInvalid);
    return () => {
      socket.off('connect', requestInfo);
      socket.off('session', onSession);
      socket.off('resOnlinePostGameInfo', onInfo);
      socket.off('resCreateOnlineWithdrawal', onWithdrawal);
      socket.off('onlineDoubleOrNothingUpdate', onDonUpdate);
      socket.off('onlineRoomUpdated', onRoomUpdated);
      socket.off('resCreateOnlineNostrPayout', onNostrPayout);
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
  const grossWinnerAmount = Math.floor(info?.winnerPoints ?? 0);
  const netPayoutAmount = Math.floor(grossWinnerAmount * ONLINE_FEE_MULTIPLIER);
  const feeAmount = Math.max(0, grossWinnerAmount - netPayoutAmount);
  const p1Gross = Math.floor(info?.p1Points ?? 0);
  const p2Gross = Math.floor(info?.p2Points ?? 0);
  const p1DisplayAmount =
    info?.winnerRole === 'Player 1'
      ? Math.floor(p1Gross * ONLINE_FEE_MULTIPLIER)
      : p1Gross;
  const p2DisplayAmount =
    info?.winnerRole === 'Player 2'
      ? Math.floor(p2Gross * ONLINE_FEE_MULTIPLIER)
      : p2Gross;

  const effectiveSessionID =
    currentSessionID || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sessionID') : '') || '';

  const { isMyP1, isMyP2 } = useMemo(() => {
    if (!info || !effectiveSessionID) {
      return { isMyP1: false, isMyP2: false };
    }
    const winnerIsMe =
      Boolean(info.winnerSessionID && info.winnerSessionID === effectiveSessionID);
    return {
      isMyP1: info.p1SessionID
        ? info.p1SessionID === effectiveSessionID
        : winnerIsMe && info.winnerRole === 'Player 1',
      isMyP2: info.p2SessionID
        ? info.p2SessionID === effectiveSessionID
        : winnerIsMe && info.winnerRole === 'Player 2',
    };
  }, [info, effectiveSessionID]);

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
            {netPayoutAmount.toLocaleString()} SATS
          </p>
          <p className="online-postgame-sub">
            Net payout after 5% fee
          </p>
          <p className="online-postgame-sub">
            Gross winner amount: {grossWinnerAmount.toLocaleString()} sats · Fee: {feeAmount.toLocaleString()} sats
          </p>
        </div>

        <div className="online-postgame-scores">
          <div className="online-postgame-score-chip">
            <span className="online-postgame-score-label">
              {info?.p1Name ?? 'Player 1'}
              {isMyP1 ? <span className="online-postgame-you-tag">YOU</span> : null}
            </span>
            <span className="online-postgame-score-value">{p1DisplayAmount.toLocaleString()} sats</span>
          </div>
          <div className="online-postgame-score-chip">
            <span className="online-postgame-score-label">
              {info?.p2Name ?? 'Player 2'}
              {isMyP2 ? <span className="online-postgame-you-tag">YOU</span> : null}
            </span>
            <span className="online-postgame-score-value">{p2DisplayAmount.toLocaleString()} sats</span>
          </div>
        </div>

        <div className="online-postgame-grid">
          <div className="online-postgame-actions">
            <div className="online-postgame-payout-choice">
              <p className="online-postgame-payout-title">Choose payout method</p>
              <p className="online-postgame-payout-note">
                Pick one. Once selected, the other method and Double or Nothing are locked.
              </p>
            </div>
            <div className="online-postgame-payout-row">
              <Button
                className={`${isWinner ? '' : 'disabled'} online-postgame-btn online-postgame-btn-withdraw`}
                disabled={!isWinner || creatingWithdrawal || donLocked}
                onClick={() => {
                  if (!socket || !roomId || !isWinner || donLocked) {
                    return;
                  }
                  setError('');
                  setCreatingWithdrawal(true);
                  socket.emit('createOnlineWithdrawal', { roomId });
                }}
              >
                {isWinner
                  ? creatingWithdrawal
                    ? 'Preparing QR...'
                    : donLocked
                      ? 'QR payout locked'
                      : 'Withdraw via QR'
                  : 'Winner only'}
              </Button>
              <Button
                className={`${isWinner && winnerHasNostrLn && !donLocked ? '' : 'disabled'} online-postgame-btn online-postgame-btn-nostr`}
                disabled={!isWinner || !winnerHasNostrLn || donLocked || creatingNostrPayout}
                onClick={() => {
                  if (!socket || !roomId || !isWinner || !winnerHasNostrLn || donLocked) {
                    return;
                  }
                  setError('');
                  setCreatingNostrPayout(true);
                  socket.emit('createOnlineNostrPayout', { roomId });
                }}
              >
                {creatingNostrPayout ? 'Sending to LN address...' : 'Pay to LN address'}
              </Button>
            </div>
            <Button
              className={`online-postgame-btn online-postgame-btn-don ${donLocked ? 'disabled' : ''}`}
              disabled={donLocked}
              onClick={() => {
                if (!socket || !roomId || donLocked) {
                  return;
                }
                setError('');
                socket.emit('onlineDoubleOrNothing', { roomId });
              }}
            >
              {donLocked
                ? 'DOUBLE OR NOTHING LOCKED (PAYOUT STARTED)'
                : `DOUBLE OR NOTHING (${votes}/${requiredVotes})`}
            </Button>
            <Button
              className="online-postgame-btn online-postgame-btn-back"
              onClick={() => {
                if (socket && roomId) {
                  socket.emit('leaveOnlineRoom', { roomId });
                }
                navigate('/online');
              }}
            >
              EXIT ROOM
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

        {payoutChosen ? (
          <p className="online-postgame-error">{payoutStatusText}</p>
        ) : null}
        {error ? <p className="online-postgame-error">Error: {error}</p> : null}
        {info?.payoutMethod === 'nostr_zap' && info.payoutTarget ? (
          <p className="online-postgame-error">
            Payout sent to Nostr lightning address: {info.payoutTarget}
          </p>
        ) : null}
      </div>

      <div className={`overlay ${loading ? '' : 'hide'}`} id="loading">
        <img src="/images/loading.gif" alt="Loading" />
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
