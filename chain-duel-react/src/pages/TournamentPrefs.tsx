import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useGamepad } from '@/hooks/useGamepad';
import '@/components/ui/Button.css';
import '@/components/ui/Sponsorship.css';
import './tournprefs.css';

type SelectedButton =
  | 'mainMenuButton'
  | 'continueButton'
  | 'decreasePlayersButton'
  | 'increasePlayersButton'
  | 'decreaseDepositButton'
  | 'increaseDepositButton';

export default function TournamentPrefs() {
  const navigate = useNavigate();
  const [playersNumber, setPlayersNumber] = useState(4);
  const [deposit, setDeposit] = useState(10000);
  const [buttonSelected, setButtonSelected] =
    useState<SelectedButton>('continueButton');

  const mainMenuRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const decreasePlayersRef = useRef<HTMLButtonElement>(null);
  const increasePlayersRef = useRef<HTMLButtonElement>(null);
  const decreaseDepositRef = useRef<HTMLButtonElement>(null);
  const increaseDepositRef = useRef<HTMLButtonElement>(null);

  useGamepad(true);

  const increasePlayers = () =>
    setPlayersNumber((prev) => (prev < 16 ? prev * 2 : prev));
  const decreasePlayers = () =>
    setPlayersNumber((prev) => (prev > 4 ? prev / 2 : prev));
  const increaseDeposit = () =>
    setDeposit((prev) => (prev < 100000 ? prev + 10000 : prev));
  const decreaseDeposit = () =>
    setDeposit((prev) => (prev > 10000 ? prev - 10000 : prev));

  useEffect(() => {
    if (mainMenuRef.current) {
      mainMenuRef.current.style.animationDuration =
        buttonSelected === 'mainMenuButton' ? '2s' : '0s';
    }
    if (continueRef.current) {
      continueRef.current.style.animationDuration =
        buttonSelected === 'continueButton' ? '2s' : '0s';
    }
    if (decreasePlayersRef.current) {
      decreasePlayersRef.current.style.animationDuration =
        buttonSelected === 'decreasePlayersButton' ? '2s' : '0s';
    }
    if (increasePlayersRef.current) {
      increasePlayersRef.current.style.animationDuration =
        buttonSelected === 'increasePlayersButton' ? '2s' : '0s';
    }
    if (decreaseDepositRef.current) {
      decreaseDepositRef.current.style.animationDuration =
        buttonSelected === 'decreaseDepositButton' ? '2s' : '0s';
    }
    if (increaseDepositRef.current) {
      increaseDepositRef.current.style.animationDuration =
        buttonSelected === 'increaseDepositButton' ? '2s' : '0s';
    }
  }, [buttonSelected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (buttonSelected === 'mainMenuButton') {
          navigate('/');
        } else if (buttonSelected === 'continueButton') {
          navigate(`/tournbracket?players=${playersNumber}&deposit=${deposit}`);
        } else if (buttonSelected === 'decreasePlayersButton' && playersNumber > 4) {
          decreasePlayers();
        } else if (buttonSelected === 'increasePlayersButton' && playersNumber < 16) {
          increasePlayers();
        } else if (buttonSelected === 'decreaseDepositButton' && deposit > 10000) {
          decreaseDeposit();
        } else if (buttonSelected === 'increaseDepositButton' && deposit < 100000) {
          increaseDeposit();
        }
      }

      /* Grid: left col [ - players, - deposit, MAIN MENU ], right col [ + players, + deposit, Continue ] */
      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        if (buttonSelected === 'mainMenuButton') {
          setButtonSelected('decreaseDepositButton');
        } else if (buttonSelected === 'continueButton') {
          setButtonSelected('increaseDepositButton');
        } else if (buttonSelected === 'decreaseDepositButton') {
          setButtonSelected('decreasePlayersButton');
        } else if (buttonSelected === 'increaseDepositButton') {
          setButtonSelected('increasePlayersButton');
        } else if (buttonSelected === 'decreasePlayersButton') {
          setButtonSelected('mainMenuButton');
        } else if (buttonSelected === 'increasePlayersButton') {
          setButtonSelected('continueButton');
        }
      }
      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
        if (buttonSelected === 'decreasePlayersButton') {
          setButtonSelected('decreaseDepositButton');
        } else if (buttonSelected === 'increasePlayersButton') {
          setButtonSelected('increaseDepositButton');
        } else if (buttonSelected === 'decreaseDepositButton') {
          setButtonSelected('mainMenuButton');
        } else if (buttonSelected === 'increaseDepositButton') {
          setButtonSelected('continueButton');
        } else if (buttonSelected === 'mainMenuButton') {
          setButtonSelected('decreasePlayersButton');
        } else if (buttonSelected === 'continueButton') {
          setButtonSelected('increasePlayersButton');
        }
      }
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        if (buttonSelected === 'increasePlayersButton') {
          setButtonSelected('decreasePlayersButton');
        } else if (buttonSelected === 'increaseDepositButton') {
          setButtonSelected('decreaseDepositButton');
        } else if (buttonSelected === 'continueButton') {
          setButtonSelected('mainMenuButton');
        }
      }
      if (
        event.key === 'ArrowRight' ||
        event.key === 'd' ||
        event.key === 'D'
      ) {
        if (buttonSelected === 'decreasePlayersButton') {
          setButtonSelected('increasePlayersButton');
        } else if (buttonSelected === 'decreaseDepositButton') {
          setButtonSelected('increaseDepositButton');
        } else if (buttonSelected === 'mainMenuButton') {
          setButtonSelected('continueButton');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [buttonSelected, playersNumber, deposit, navigate]);

  return (
    <div className="tournprefs-page">
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div id="tournprefs">
        <h2 className="hero-outline condensed">Start Tournament</h2>

        <Sponsorship id="sponsorship-prefs" />

        <div className="mb-30">
          <div className="choice">
            <div className="label mb-10">Number of Players</div>
            <div className="amount-preference">
              <Button
                ref={decreasePlayersRef}
                className={`increment ${playersNumber <= 4 ? 'disabled' : ''}`}
                id="decreasePlayersButton"
                type="button"
                onClick={decreasePlayers}
                aria-label="Decrease number of players"
                disabled={playersNumber <= 4}
              >
                <svg className="increment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </Button>
              <div className="value-display">
                <h1 id="numberOfPlayers">{playersNumber}</h1>
              </div>
              <Button
                ref={increasePlayersRef}
                className={`increment ${playersNumber >= 16 ? 'disabled' : ''}`}
                id="increasePlayersButton"
                type="button"
                onClick={increasePlayers}
                aria-label="Increase number of players"
                disabled={playersNumber >= 16}
              >
                <svg className="increment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </Button>
            </div>
          </div>
          <div className="choice">
            <div className="label mb-10">Buy in (sats)</div>
            <div className="amount-preference">
              <Button
                ref={decreaseDepositRef}
                className={`increment ${deposit <= 10000 ? 'disabled' : ''}`}
                id="decreaseDepositButton"
                type="button"
                onClick={decreaseDeposit}
                aria-label="Decrease buy in"
                disabled={deposit <= 10000}
              >
                <svg className="increment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </Button>
              <div className="value-display">
                <h1 id="depositValue">{deposit.toLocaleString()}</h1>
              </div>
              <Button
                ref={increaseDepositRef}
                className={`increment ${deposit >= 100000 ? 'disabled' : ''}`}
                id="increaseDepositButton"
                type="button"
                onClick={increaseDeposit}
                aria-label="Increase buy in"
                disabled={deposit >= 100000}
              >
                <svg className="increment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </Button>
            </div>
          </div>
        </div>

        <div className="double-button">
          <Button
            ref={mainMenuRef}
            id="mainmenubutton"
            type="button"
            onClick={() => navigate('/')}
          >
            MAIN MENU
          </Button>
          <Button
            ref={continueRef}
            id="continueButton"
            type="button"
            onClick={() =>
              navigate(`/tournbracket?players=${playersNumber}&deposit=${deposit}`)
            }
          >
            Continue
          </Button>
        </div>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
