import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { useGamepad } from '@/hooks/useGamepad';
import { asSocketBoundary } from '@/shared/socket/socketBoundary';
import {
  TOURNAMENT_DEFAULT_BUY_IN_SATS,
  TOURNAMENT_MIN_PLAYERS,
} from '@/shared/constants/payment';
import { computeFinalPrize } from '@/features/tournament/bracketModel';
import '@/components/ui/Button.css';
import './tournlobby.css';

type SelectState = 'backButton' | 'proceedButton' | 'none';

interface TournamentPayLink {
  id: string;
  lnurl?: string;
  lnurlp?: string;
  description?: string;
}

export default function TournamentLobby() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { socket, connected } = useSocket();
  const [playersPaid, setPlayersPaid] = useState<Record<string, string>>({});
  const [payLink, setPayLink] = useState<TournamentPayLink | null>(null);
  const [buttonSelected, setButtonSelected] = useState<SelectState>('backButton');

  const proceedRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  const numberOfPlayers = Math.max(
    TOURNAMENT_MIN_PLAYERS,
    parseInt(params.get('players') || String(TOURNAMENT_MIN_PLAYERS), 10) || TOURNAMENT_MIN_PLAYERS
  );
  const deposit = Math.max(
    TOURNAMENT_DEFAULT_BUY_IN_SATS,
    parseInt(params.get('deposit') || String(TOURNAMENT_DEFAULT_BUY_IN_SATS), 10) ||
      TOURNAMENT_DEFAULT_BUY_IN_SATS
  );
  const finalPrize = computeFinalPrize(numberOfPlayers, deposit);
  const paidCount = Object.keys(playersPaid).length;

  useGamepad(true);

  useEffect(() => {
    if (backRef.current) {
      backRef.current.style.animationDuration =
        buttonSelected === 'backButton' ? '2s' : '0s';
    }
    if (proceedRef.current) {
      proceedRef.current.style.animationDuration =
        buttonSelected === 'proceedButton' ? '2s' : '0s';
    }
  }, [buttonSelected]);

  useEffect(() => {
    if (!socket || !connected) return;
    const anySocket = asSocketBoundary(socket);
    if (!anySocket) return;

    const onPaylink = (body: unknown) => {
      const data = body as TournamentPayLink;
      setPayLink(data);
    };

    const onInvoicePaid = (body: unknown) => {
      const data = body as { comment?: unknown };
      setPlayersPaid((prev) => {
        const currentCount = Object.keys(prev).length;
        if (currentCount >= numberOfPlayers) return prev;
        const nextIndex = currentCount + 1;
        const comment = normalizeInvoiceComment(data.comment);
        const name = comment !== '' ? comment : `Player ${nextIndex}`;
        const next = { ...prev, [`player${nextIndex}`]: name };
        if (Object.keys(next).length === numberOfPlayers) {
          setButtonSelected('proceedButton');
        } else if (Object.keys(next).length > 0) {
          setButtonSelected('none');
        }
        return next;
      });
    };

    anySocket.on('rescreatePaylink', onPaylink);
    anySocket.on('invoicePaid', onInvoicePaid);
    anySocket.emit('createPaylink', { description: 'tournament', buyIn: deposit });

    return () => {
      anySocket.off('rescreatePaylink', onPaylink);
      anySocket.off('invoicePaid', onInvoicePaid);
    };
  }, [socket, connected, deposit, numberOfPlayers]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (buttonSelected === 'backButton') {
          navigate('/p2p');
        } else if (buttonSelected === 'proceedButton') {
          sessionStorage.setItem('Players', JSON.stringify(playersPaid));
          navigate(`/tournbracket?players=${numberOfPlayers}&deposit=${deposit}`);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [buttonSelected, playersPaid, numberOfPlayers, deposit, navigate]);

  const qrValue = payLink?.lnurl || payLink?.lnurlp || '';
  const canProceed = paidCount >= numberOfPlayers;

  return (
    <div className="tournlobby-page">
      <header id="brand" className="tournlobby-header">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div className="tournlobby-middle">
        <div className="tournlobby-modal">
          <div className="tournlobby-header-title">
            <div className="label">Tournament Lobby</div>
            <h1 className="hero-outline">The Merkle Tree</h1>
          </div>

          <div className="tournlobby-deposit-card">
            <div className="tournlobby-deposit-header">
              <span className="tournlobby-deposit-label">Buy In (per player)</span>
              <span className="tournlobby-deposit-amount">
                {deposit.toLocaleString()} <span className="sats-label">sats</span>
              </span>
            </div>
            <p className="tournlobby-deposit-note">Set player name on the payment note</p>

            <div className="tournlobby-qr-wrap" id="qrCodeDiv">
              {qrValue ? (
                <QRCodeSVG
                  id="qrTournament"
                  value={qrValue}
                  size={220}
                  level="M"
                  includeMargin={false}
                  className="tournlobby-qr"
                />
              ) : (
                <div id="qrTournament" className="tournlobby-qr-placeholder" />
              )}
            </div>

            <div className="tournlobby-deposit-status">
              {paidCount > 0
                ? `${paidCount} / ${numberOfPlayers} players paid`
                : '0 sats deposited'}
            </div>

            <div className="tournlobby-buttons">
              <Button
                ref={backRef}
                className={paidCount > 0 ? 'disabled' : ''}
                id="backButton"
                type="button"
                onClick={() => navigate('/p2p')}
              >
                Cancel
              </Button>
              <Button
                ref={proceedRef}
                className={canProceed ? '' : 'disabled'}
                id="proceedButton"
                type="button"
                onClick={() => {
                  if (!canProceed) return;
                  sessionStorage.setItem('Players', JSON.stringify(playersPaid));
                  navigate(`/tournbracket?players=${numberOfPlayers}&deposit=${deposit}`);
                }}
              >
                Start
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="tournlobby-bottom">
        <div className="tournlobby-details" id="bracketDetails">
          <div className="tournlobby-detail">
            <div className="label">Players</div>
            <div className="value">
              <span id="numberOfPlayers">{numberOfPlayers}</span>
            </div>
          </div>
          <div className="tournlobby-detail">
            <div className="label">Final Prize</div>
            <div className="value">
              <span id="finalPrize">{finalPrize.toLocaleString()}</span> <span>sats</span>
            </div>
          </div>
          <div className="tournlobby-detail">
            <div className="label">Buy In</div>
            <div className="value">
              <span id="buyIn">{deposit.toLocaleString()}</span> <span>sats</span>
            </div>
          </div>
        </div>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}

function normalizeInvoiceComment(comment: unknown): string {
  if (Array.isArray(comment)) {
    if (comment.length === 1) {
      return String(comment[0] ?? '').trim();
    }
    // Some backends emit comment as char array; join to recover full name.
    const joined = comment.map((part) => String(part ?? '')).join('').trim();
    return joined;
  }
  return String(comment ?? '').trim();
}
