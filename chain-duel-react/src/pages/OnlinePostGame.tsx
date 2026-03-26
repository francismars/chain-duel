import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { useSocket } from '@/hooks/useSocket';
import { useGamepad } from '@/hooks/useGamepad';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';
import '@/styles/pages/onlinePostGame.css';

type PostGameNav =
  | { type: 'replay'; index: number }   // round replay buttons
  | { type: 'don' }                      // double-or-nothing vote
  | { type: 'payout'; slot: 'withdraw' | 'nostr' }  // payout row
  | { type: 'exit' };                    // EXIT ROOM

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
  matchRounds?: Array<{
    matchRound: number;
    finishedAt: number;
    winnerName: string;
    p1Name: string;
    p2Name: string;
    p1Score: number;
    p2Score: number;
    netPrize: number;
    winnerRole?: 'Player 1' | 'Player 2';
  }>;
}

const PLACEHOLDER_LNURL =
  'MARSURL1DP68GURN8GHJ7MRWVF5HGUEWV3HK5MEWWP6Z7AMFW35XGUNPWUHKZURF9AMRZTMVDE6HYMP0V438Y7NKXUE5S5TFG9X9GE2509N5VMN0G46S0WQJQ4';
const ONLINE_FEE_MULTIPLIER = 0.95;

function roundWinningSide(
  round: NonNullable<OnlinePostGameInfo['matchRounds']>[number]
): 'p1' | 'p2' | null {
  if (round.winnerRole === 'Player 1') {
    return 'p1';
  }
  if (round.winnerRole === 'Player 2') {
    return 'p2';
  }
  const w = round.winnerName.trim().toLowerCase();
  if (w && w === round.p1Name.trim().toLowerCase()) {
    return 'p1';
  }
  if (w && w === round.p2Name.trim().toLowerCase()) {
    return 'p2';
  }
  return null;
}

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
  const [myVoted, setMyVoted] = useState(false);
  const [navFocus, setNavFocus] = useState<PostGameNav>({ type: 'exit' });
  const keyRepeatRef = useRef<Record<string, number>>({});

  useGamepad(true);

  const isWinner = Boolean(
    info?.winnerSessionID && info.winnerSessionID === currentSessionID
  );
  const donLocked = Boolean(lnurlw || info?.payoutMethod === 'nostr_zap' || info?.rematchRequested);
  const effectiveVotes = myVoted ? Math.max(votes, 1) : votes;
  const winnerHasNostrLn = Boolean(info?.winnerLnAddress);
  const payoutChosen = info?.payoutMethod === 'withdraw_qr' || info?.payoutMethod === 'nostr_zap';
  const payoutStatusText =
    info?.payoutMethod === 'withdraw_qr'
      ? 'Winner chose Withdraw via QR. Round closed.'
      : info?.payoutMethod === 'nostr_zap'
        ? 'Winner chose Pay to LN address. Round closed.'
        : '';
  /** Settled sessions (e.g. from finished list): no payout UI or QR. */
  const sessionFinished = info?.phase === 'finished';
  const showPayoutUi = Boolean(info && !sessionFinished);

  const openSessionRoundReplay = (matchRound: number) => {
    navigate(
      `/network/game?roomId=${encodeURIComponent(roomId)}&replay=1&round=${encodeURIComponent(String(matchRound))}`
    );
  };

  // ── Keyboard / gamepad navigation ──────────────────────────────────
  useEffect(() => {
    const rounds = info?.matchRounds ?? [];
    const roundCount = rounds.length;

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const isEnter = key === 'Enter' || key === ' ';
      const isUp    = key === 'ArrowUp'    || key === 'w' || key === 'W';
      const isDown  = key === 'ArrowDown'  || key === 's' || key === 'S';
      const isLeft  = key === 'ArrowLeft'  || key === 'a' || key === 'A';
      const isRight = key === 'ArrowRight' || key === 'd' || key === 'D';
      if (!isEnter && !isUp && !isDown && !isLeft && !isRight) return;
      event.preventDefault();

      if (isLeft || isRight) {
        setNavFocus(prev =>
          prev.type === 'payout'
            ? { type: 'payout', slot: prev.slot === 'withdraw' ? 'nostr' : 'withdraw' }
            : prev
        );
        return;
      }

      if (isUp) {
        setNavFocus(prev => {
          if (prev.type === 'exit') {
            if (showPayoutUi) return { type: 'payout', slot: 'withdraw' };
            if (roundCount > 0) return { type: 'replay', index: roundCount - 1 };
            return prev;
          }
          if (prev.type === 'payout') {
            if (showPayoutUi) return { type: 'don' };
            if (roundCount > 0) return { type: 'replay', index: roundCount - 1 };
            return { type: 'exit' };
          }
          if (prev.type === 'don') {
            if (roundCount > 0) return { type: 'replay', index: roundCount - 1 };
            return { type: 'exit' };
          }
          if (prev.type === 'replay') {
            if (prev.index > 0) return { type: 'replay', index: prev.index - 1 };
            return prev;
          }
          return prev;
        });
        return;
      }

      if (isDown) {
        setNavFocus(prev => {
          if (prev.type === 'replay') {
            if (prev.index < roundCount - 1) return { type: 'replay', index: prev.index + 1 };
            if (showPayoutUi) return { type: 'don' };
            return { type: 'exit' };
          }
          if (prev.type === 'don') {
            if (showPayoutUi) return { type: 'payout', slot: 'withdraw' };
            return { type: 'exit' };
          }
          if (prev.type === 'payout') return { type: 'exit' };
          return prev;
        });
        return;
      }

      if (isEnter) {
        if (navFocus.type === 'replay') {
          const round = rounds[navFocus.index];
          if (round) openSessionRoundReplay(round.matchRound);
          return;
        }
        if (navFocus.type === 'don') {
          if (!socket || !roomId || donLocked || myVoted) return;
          setError('');
          setMyVoted(true);
          socket.emit('onlineDoubleOrNothing', { roomId });
          return;
        }
        if (navFocus.type === 'payout') {
          if (navFocus.slot === 'withdraw') {
            if (!socket || !roomId || !isWinner || donLocked) return;
            setError('');
            setCreatingWithdrawal(true);
            socket.emit('createOnlineWithdrawal', { roomId });
          } else {
            if (!socket || !roomId || !isWinner || !winnerHasNostrLn || donLocked) return;
            setError('');
            setCreatingNostrPayout(true);
            socket.emit('createOnlineNostrPayout', { roomId });
          }
          return;
        }
        if (navFocus.type === 'exit') {
          if (socket && roomId) socket.emit('leaveOnlineRoom', { roomId });
          navigate('/network');
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => { keyRepeatRef.current[event.key] = 0; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [donLocked, info, isWinner, myVoted, navFocus, navigate,
      openSessionRoundReplay, roomId, showPayoutUi, socket, winnerHasNostrLn]);

  useEffect(() => {
    if (!roomId) {
      navigate('/network');
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
        navigate(`/network/lobby?roomId=${encodeURIComponent(roomId)}`);
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
        navigate(`/network/lobby?roomId=${encodeURIComponent(roomId)}`);
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

  return (
    <div className="online-postgame-page">
      <Sponsorship id="sponsorship-online-postgame" />
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div className="online-postgame-card">
        <div className="online-postgame-headline">
          <p className="online-postgame-kicker">NETWORK · VICTORY SCREEN</p>
        </div>

        {info && (info.matchRounds?.length ?? 0) > 0 ? (
          <section className="online-postgame-round-history" aria-label="Session game history">
            <ul className="online-postgame-round-list">
              {(info.matchRounds ?? []).map((round, index) => {
                const isDon = round.matchRound > 1;
                const finishedIso = new Date(round.finishedAt).toISOString();
                const won = roundWinningSide(round);
                return (
                  <li
                    key={round.matchRound}
                    className={[
                      'online-postgame-round-row',
                      isDon ? 'online-postgame-round-row--don' : 'online-postgame-round-row--first',
                    ].join(' ')}
                  >
                    <div className="online-postgame-round-row-inner">
                      <div className="online-postgame-round-badge-col">
                        <span className="online-postgame-round-index">#{round.matchRound}</span>
                        {isDon ? (
                          <span className="online-postgame-round-chip">Double or nothing</span>
                        ) : (
                          <span className="online-postgame-round-chip online-postgame-round-chip--open">
                            Opening game
                          </span>
                        )}
                        <time className="online-postgame-round-time" dateTime={finishedIso}>
                          {new Date(round.finishedAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>

                      <div className="online-postgame-round-main">
                        <div className="online-postgame-round-matchup" role="group" aria-label="Score">
                          <div
                            className={[
                              'online-postgame-player',
                              'online-postgame-player--p1',
                              won === 'p1' ? 'online-postgame-player--round-winner' : '',
                              won === 'p2' ? 'online-postgame-player--round-loser' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <div className="online-postgame-player-identity">
                              {info.p1Picture ? (
                                <img
                                  className="online-postgame-round-avatar"
                                  src={info.p1Picture}
                                  alt={round.p1Name}
                                />
                              ) : null}
                              <span className="online-postgame-player-name">{round.p1Name}</span>
                            </div>
                            <span className="online-postgame-player-pts">
                              {round.p1Score}
                              <span className="online-postgame-player-denom">sats</span>
                            </span>
                          </div>
                          <div className="online-postgame-round-vs-pillar" aria-hidden="true">
                            <span className="online-postgame-round-vs-label">vs</span>
                          </div>
                          <div
                            className={[
                              'online-postgame-player',
                              'online-postgame-player--p2',
                              won === 'p2' ? 'online-postgame-player--round-winner' : '',
                              won === 'p1' ? 'online-postgame-player--round-loser' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <div className="online-postgame-player-identity">
                              {info.p2Picture ? (
                                <img
                                  className="online-postgame-round-avatar"
                                  src={info.p2Picture}
                                  alt={round.p2Name}
                                />
                              ) : null}
                              <span className="online-postgame-player-name">{round.p2Name}</span>
                            </div>
                            <span className="online-postgame-player-pts">
                              {round.p2Score}
                              <span className="online-postgame-player-denom">sats</span>
                            </span>
                          </div>
                        </div>
                        <p className="online-postgame-round-winner">
                          <span className="online-postgame-round-winner-crown" aria-hidden="true">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.25"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              className="online-postgame-crown-svg"
                            >
                              {/* crown body — closed silhouette */}
                              <path d="M1 15h18V9L15 12L10 2L5 12L1 9Z" />
                              {/* orbs at each peak tip */}
                              <circle cx="10" cy="2" r="1.1" fill="currentColor" stroke="none" />
                              <circle cx="1" cy="9" r="0.9" fill="currentColor" stroke="none" />
                              <circle cx="19" cy="9" r="0.9" fill="currentColor" stroke="none" />
                            </svg>
                          </span>
                          <span className="online-postgame-round-winner-body">
                            <span className="online-postgame-round-winner-kicker">Winner</span>
                            <span className="online-postgame-round-winner-text">
                              <strong>{round.winnerName}</strong>
                              <span className="online-postgame-round-winner-sep"> · </span>
                              <span className="online-postgame-round-winner-prize">
                                {round.netPrize.toLocaleString()} sats net
                              </span>
                            </span>
                          </span>
                        </p>
                      </div>

                      <div className="online-postgame-round-action-col">
                        <Button
                          type="button"
                          className={`online-postgame-round-replay-btn${navFocus.type === 'replay' && navFocus.index === index ? ' online-selected' : ''}`}
                          onClick={() => openSessionRoundReplay(round.matchRound)}
                          aria-label={`Replay game ${round.matchRound}`}
                        >
                          <span className="online-postgame-round-replay-icon" aria-hidden="true" />
                          <span className="online-postgame-round-replay-label">Replay</span>
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="online-postgame-result">
          <div className="online-postgame-winner">
            <img
              className={`online-postgame-avatar ${info?.winnerPicture ? '' : 'hide'}`}
              src={info?.winnerPicture || '/images/loading.gif'}
              alt={info?.winnerName || 'Winner'}
            />
            <div className="online-postgame-winner-text">
              <p className="online-postgame-winner-label">WINNER</p>
              <h2 className="online-postgame-winner-name">
                {(info?.winnerName || 'WINNER').toUpperCase()}
              </h2>
            </div>
          </div>

          <div className="online-postgame-prize-block">
            <p className="online-postgame-prize">{netPayoutAmount.toLocaleString()} SATS</p>
            <p className="online-postgame-sub">
              Net · gross {grossWinnerAmount.toLocaleString()} · fee {feeAmount.toLocaleString()} sats
            </p>
          </div>
        </div>


        {showPayoutUi ? (
          <div
            className={[
              'online-postgame-don-panel',
              donLocked ? 'online-postgame-don-panel--locked' : '',
              effectiveVotes > 0 && !donLocked ? 'online-postgame-don-panel--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="online-postgame-don-info">
              <p className="online-postgame-don-title">DOUBLE OR NOTHING</p>
              <p className="online-postgame-don-desc">
                {donLocked
                  ? 'Locked — a payout has been initiated.'
                  : 'Both players must agree to double the stakes and play another round.'}
              </p>
            </div>

            <div className="online-postgame-don-controls">
              <div
                className="online-postgame-don-vote-row"
                aria-label={`${effectiveVotes} of ${requiredVotes} players agreed`}
              >
                <div className="online-postgame-don-pips">
                  {Array.from({ length: requiredVotes }).map((_, i) => (
                    <div
                      key={i}
                      className={[
                        'online-postgame-don-pip',
                        i < effectiveVotes ? 'online-postgame-don-pip--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    />
                  ))}
                </div>
                <span className="online-postgame-don-vote-label">
                  {effectiveVotes}/{requiredVotes} agreed
                </span>
                {myVoted && !donLocked ? (
                  <span className="online-postgame-don-my-vote-tag">Your vote cast</span>
                ) : null}
              </div>

              <Button
                type="button"
                className={[
                  'online-postgame-btn',
                  'online-postgame-btn-don',
                  donLocked || myVoted ? 'disabled' : '',
                  navFocus.type === 'don' ? 'online-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={donLocked || myVoted}
                onClick={() => {
                  if (!socket || !roomId || donLocked || myVoted) {
                    return;
                  }
                  setError('');
                  setMyVoted(true);
                  socket.emit('onlineDoubleOrNothing', { roomId });
                }}
              >
                {donLocked
                  ? 'LOCKED'
                  : myVoted
                    ? `VOTED — WAITING (${effectiveVotes}/${requiredVotes})`
                    : 'DOUBLE OR NOTHING'}
              </Button>
            </div>
          </div>
        ) : null}

        <div
          className={[
            'online-postgame-grid',
            sessionFinished ? 'online-postgame-grid--finished' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="online-postgame-actions">
            {showPayoutUi ? (
              <>
                <div className="online-postgame-payout-choice">
                  <p className="online-postgame-payout-title">Choose payout method</p>
                  <p className="online-postgame-payout-note">
                    Pick one. Once selected, the other method and Double or Nothing are locked.
                  </p>
                </div>
                <div className="online-postgame-payout-row">
                  <Button
                    type="button"
                    className={[
                      isWinner ? '' : 'disabled',
                      'online-postgame-btn online-postgame-btn-withdraw',
                      navFocus.type === 'payout' && navFocus.slot === 'withdraw' ? 'online-selected' : '',
                    ].filter(Boolean).join(' ')}
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
                    type="button"
                    className={[
                      isWinner && winnerHasNostrLn && !donLocked ? '' : 'disabled',
                      'online-postgame-btn online-postgame-btn-nostr',
                      navFocus.type === 'payout' && navFocus.slot === 'nostr' ? 'online-selected' : '',
                    ].filter(Boolean).join(' ')}
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
              </>
            ) : null}
            <Button
              type="button"
              className={`online-postgame-btn online-postgame-btn-back${navFocus.type === 'exit' ? ' online-selected' : ''}`}
              onClick={() => {
                if (socket && roomId) {
                  socket.emit('leaveOnlineRoom', { roomId });
                }
                navigate('/network');
              }}
            >
              EXIT ROOM
            </Button>
          </div>

          {showPayoutUi ? (
            <div className="online-postgame-qr-wrap">
              <p className="online-postgame-qr-title">WITHDRAWAL QR</p>
              {withdrawalValue ? (
                lnurlw ? (
                  <a
                    className="online-postgame-qr-lnurl-anchor"
                    href={`lightning:${lnurlw.replace(/^lightning:/i, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open withdrawal LNURL in a Lightning wallet"
                  >
                    <QRCodeSVG value={withdrawalValue} size={220} includeMargin />
                  </a>
                ) : (
                  <QRCodeSVG
                    value={withdrawalValue}
                    size={220}
                    includeMargin
                    className="online-postgame-qr-blur"
                  />
                )
              ) : (
                <img src="/images/loading.gif" alt="Creating withdrawal" />
              )}
              {lnurlw ? (
                <a
                  className="online-postgame-qr-lnurl-link"
                  href={`lightning:${lnurlw.replace(/^lightning:/i, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open LNURL in wallet
                </a>
              ) : null}
              <p className="online-postgame-qr-note">
                {lnurlw ? 'Scan with a compatible wallet, or use the link above.' : 'Winner can reveal QR by creating withdrawal.'}
              </p>
            </div>
          ) : null}
        </div>

        {showPayoutUi && payoutChosen ? (
          <p className="online-postgame-error">{payoutStatusText}</p>
        ) : null}
        {showPayoutUi && error ? <p className="online-postgame-error">Error: {error}</p> : null}
        {showPayoutUi && info?.payoutMethod === 'nostr_zap' && info.payoutTarget ? (
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
