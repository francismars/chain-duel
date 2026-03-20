import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useGamepad } from '@/hooks/useGamepad';
import './highscores.css';
import {
  CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM,
  clearMenuNavigationState,
  type MenuNavigationState,
} from '@/shared/constants/menuNavigation';

type ButtonSelected = 'mainMenuButton' | 'nextButton' | 'prevButton';

interface Highscore {
  p1Name: string;
  p1sats: number;
  p2Name: string;
  p2sats: number;
  winner: 'Player1' | 'Player2';
  prize: number;
  tournament?: boolean;
  tournamentPlayers?: number;
  tournamentName?: string;
  tournamentSponsor?: string;
}

export default function Highscores() {
  const navigate = useNavigate();
  const location = useLocation();
  const suppressNextMenuConfirmRef = useRef(
    Boolean(
      (location.state as MenuNavigationState | null)?.[
        CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM
      ]
    )
  );
  const [pageHS, setPageHS] = useState<number>(0);
  const [highscores, setHighscores] = useState<Highscore[]>([]);
  const [buttonSelected, setButtonSelected] = useState<ButtonSelected>('mainMenuButton');
  const prevButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const mainMenuButtonRef = useRef<HTMLButtonElement>(null);

  // Enable gamepad support
  useGamepad(true);

  // Load highscores JSON
  useEffect(() => {
    const loadJson = async () => {
      try {
        const response = await fetch('/files/highscores.json');
        const data = await response.json();
        // Sort by prize (descending)
        const sorted = data.sort((a: Highscore, b: Highscore) => {
          if (a.prize > b.prize) {
            return -1;
          }
          return 0;
        });
        setHighscores(sorted);
      } catch (error) {
        console.error('Failed to load highscores:', error);
      }
    };

    loadJson();
  }, []);

  // Update button animations based on buttonSelected
  useEffect(() => {
    if (prevButtonRef.current) {
      prevButtonRef.current.style.animationDuration =
        buttonSelected === 'prevButton' ? '2s' : '0s';
    }
    if (nextButtonRef.current) {
      nextButtonRef.current.style.animationDuration =
        buttonSelected === 'nextButton' ? '2s' : '0s';
    }
    if (mainMenuButtonRef.current) {
      mainMenuButtonRef.current.style.animationDuration =
        buttonSelected === 'mainMenuButton' ? '2s' : '0s';
    }
  }, [buttonSelected]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (event.repeat) {
          return;
        }
        if (suppressNextMenuConfirmRef.current) {
          suppressNextMenuConfirmRef.current = false;
          event.preventDefault();
          clearMenuNavigationState(navigate, location);
          return;
        }
        event.preventDefault();
        if (buttonSelected === 'mainMenuButton') {
          navigate('/');
        }
        if (buttonSelected === 'nextButton') {
          setPageHS((prev) => (prev + 1) % 3);
        }
        if (buttonSelected === 'prevButton') {
          setPageHS((prev) => (prev + 3 - 1) % 3);
        }
      }

      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        event.preventDefault();
        if (buttonSelected === 'mainMenuButton') {
          setButtonSelected('nextButton');
        }
      }

      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
        event.preventDefault();
        if (buttonSelected === 'nextButton' || buttonSelected === 'prevButton') {
          setButtonSelected('mainMenuButton');
        }
      }

      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        if (buttonSelected === 'nextButton') {
          setButtonSelected('prevButton');
        }
      }

      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        if (buttonSelected === 'prevButton') {
          setButtonSelected('nextButton');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [buttonSelected, navigate, location]);

  const handlePrev = () => {
    setPageHS((prev) => (prev + 3 - 1) % 3);
  };

  const handleNext = () => {
    setPageHS((prev) => (prev + 1) % 3);
  };

  // Get current page items (7 per page)
  const getCurrentPageItems = () => {
    const start = pageHS * 7;
    const end = start + 7;
    return highscores.slice(start, end);
  };

  const currentItems = getCurrentPageItems();

  return (
    <>
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div className="flex full flex-center">
        <div>
          <h1 id="page-title" className="outline">
            The Ledger
          </h1>
          <div id="highscoresList" className="center max-1200 text-center">
            {currentItems.map((highscore, index) => {
              const rank = pageHS * 7 + index + 1;
              const isTournament = highscore.tournament === true;
              const winnerName =
                highscore.winner === 'Player1' ? highscore.p1Name : highscore.p2Name;
              const winnerSats =
                highscore.winner === 'Player1' ? highscore.p1sats : highscore.p2sats;
              const loserName =
                highscore.winner === 'Player1' ? highscore.p2Name : highscore.p1Name;
              const loserSats =
                highscore.winner === 'Player1' ? highscore.p2sats : highscore.p1sats;
              const isLast = index === currentItems.length - 1;

              return (
                <div key={rank} className={`score-row ${isLast ? 'score-row-last' : ''}`}>
                  <h2 className="rankStyle">{rank}</h2>
                  <h2 className="tournStyle">{isTournament ? '🏆' : '👥'}</h2>

                  <div className="winnerInfo">
                    <h2 className="winnerNameStyle">{winnerName}</h2>
                    <h2 className="winnerSatsStyle">
                      {winnerSats.toLocaleString()}
                      <span className="satsWinnerLabelStyle">sats</span>
                    </h2>
                  </div>

                  <h2 className="VSLabelStyle">VS</h2>

                  <div className="loserinfo">
                    <h2 className="loserNameStyle">
                      {isTournament
                        ? `${highscore.tournamentPlayers! - 1} Players`
                        : loserName}
                    </h2>
                    <h2
                      className={
                        isTournament ? 'tournNameStyle' : 'loserSatsStyle'
                      }
                    >
                      {isTournament
                        ? highscore.tournamentName
                        : `${loserSats.toLocaleString()}`}
                      {!isTournament && (
                        <span className="satsLoserLabelStyle">sats</span>
                      )}
                    </h2>
                  </div>

                  <div className="sponsor">
                    {isTournament &&
                      highscore.tournamentSponsor != null &&
                      highscore.tournamentSponsor !== '' && (
                        <>
                          <span>sponsored by</span>
                          <img src={highscore.tournamentSponsor} alt="Sponsor" />
                        </>
                      )}
                  </div>

                  <div className="prizeinfo">
                    <h2 className="prizeSatsStyle">{highscore.prize.toLocaleString()}</h2>
                    <span className="satsLabelStyle">sats</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="double-button">
            <Button ref={prevButtonRef} id="prevButton" onClick={handlePrev}>
              Prev
            </Button>
            <Button ref={nextButtonRef} id="nextButton" onClick={handleNext}>
              Next
            </Button>
          </div>
          <Button ref={mainMenuButtonRef} id="mainmenubutton" onClick={() => navigate('/')}>
            MAIN MENU
          </Button>
        </div>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </>
  );
}
