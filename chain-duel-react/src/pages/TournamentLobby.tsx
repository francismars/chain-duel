import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import { useGamepad } from '@/hooks/useGamepad';
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

  const numberOfPlayers = Math.max(2, parseInt(params.get('players') || '4', 10) || 4);
  const deposit = Math.max(10000, parseInt(params.get('deposit') || '10000', 10) || 10000);

  useGamepad(true);

  const playerRows = useMemo(
    () =>
      Array.from({ length: numberOfPlayers }, (_, i) => ({
        key: `player${i + 1}`,
        label: `Player${i + 1}:`,
      })),
    [numberOfPlayers]
  );

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
    const anySocket = socket as unknown as {
      emit: (event: string, payload?: unknown) => void;
      on: (event: string, cb: (data: unknown) => void) => void;
      off: (event: string, cb: (data: unknown) => void) => void;
    };

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
        const comment = Array.isArray(data.comment)
          ? String(data.comment[0] ?? '').trim()
          : String(data.comment ?? '').trim();
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
          navigate('/tournprefs');
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
  const canProceed = Object.keys(playersPaid).length >= numberOfPlayers;

  return (
    <div className="flex full flex-center tournlobby-page">
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div id="about">
        <div className="pages">
          <div id="page-1" className="page">
            <h1>Tournament Lobby</h1>
            <h3>
              Players: <span id="numberOfPlayers">{numberOfPlayers}</span> · Buy In:{' '}
              <span id="buyIn">{deposit.toLocaleString()}</span> sats
            </h3>
            <div className="page-inner" id="pageinner">
              <div className="qrCodeDiv" id="qrCodeDiv">
                {qrValue ? (
                  <QRCodeSVG id="qrTournament" value={qrValue} size={120} />
                ) : (
                  <div id="qrTournament" className="qr-placeholder" />
                )}
              </div>
              <div className="playersListDiv" id="playersListDiv">
                {playerRows.map((row) => (
                  <div key={row.key}>
                    <p>{row.label}</p>
                    <p id={`namePlayer${row.key.replace('player', '')}`}>
                      {playersPaid[row.key] || ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

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
          Proceed
        </Button>
        <Button
          ref={backRef}
          className={Object.keys(playersPaid).length > 0 ? 'disabled' : ''}
          id="backButton"
          type="button"
          onClick={() => navigate('/tournprefs')}
        >
          Back
        </Button>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
