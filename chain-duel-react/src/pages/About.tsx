import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useGamepad } from '@/hooks/useGamepad';
import './about.css';

type ButtonSelected = 'mainMenuButton' | 'nextButton' | 'prevButton';

export default function About() {
  const navigate = useNavigate();
  const [pageSelected, setPageSelected] = useState<number>(1);
  const [buttonSelected, setButtonSelected] = useState<ButtonSelected>('mainMenuButton');
  const prevButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const mainMenuButtonRef = useRef<HTMLButtonElement>(null);

  // Enable gamepad support
  useGamepad(true);

  // Display page based on pageSelected
  useEffect(() => {
    // All pages are rendered, we just control visibility via CSS
    // The CSS handles display: none/block for pages
  }, [pageSelected]);

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
        event.preventDefault();
        if (buttonSelected === 'mainMenuButton') {
          navigate('/');
        }
        if (buttonSelected === 'nextButton') {
          setPageSelected((prev) => {
            const next = prev + 1;
            return next === 6 ? 1 : next;
          });
        }
        if (buttonSelected === 'prevButton') {
          setPageSelected((prev) => {
            const prevPage = prev - 1;
            return prevPage === 0 ? 5 : prevPage;
          });
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
  }, [buttonSelected, navigate]);

  const handlePrev = () => {
    setPageSelected((prev) => {
      const prevPage = prev - 1;
      return prevPage === 0 ? 5 : prevPage;
    });
  };

  const handleNext = () => {
    setPageSelected((prev) => {
      const next = prev + 1;
      return next === 6 ? 1 : next;
    });
  };

  return (
    <>
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div className="flex full flex-center">
        <div id="about">
        <div className="pages">
          {/* Page 1 */}
          <div
            id="page-1"
            className="page"
            style={{ display: pageSelected === 1 ? 'block' : 'none' }}
          >
            <div className="page-inner">
              <h1>About</h1>
              <p className="text-upscale">
                Chain Duel is a Lightning-native game that combines the timeless appeal of the
                classic Snake game with the world of competitive gaming and Bitcoin.
              </p>
              <p>
                In Chain Duel, two players engage in a head-to-head showdown where Lightning
                payments are placed as bets before the game begins and attempt to be the Chain
                with the most Proof of Work by capturing the upcoming coinbases. The winner takes
                home the combined deposits, minus a small fee.
              </p>
            </div>
            <div className="pager">1/5</div>
          </div>

          {/* Page 2 */}
          <div
            id="page-2"
            className="page"
            style={{ display: pageSelected === 2 ? 'block' : 'none' }}
          >
            <div className="page-inner">
              <div className="mb-30">
                <h2 className="label">Past Sponsors</h2>
                <p>Thank you for the support.</p>
                <img className="inline-logo" src="/images/sponsors/bitcoin_magazine.svg" alt="Bitcoin Magazine" />
                <img className="inline-logo" src="/images/sponsors/piratehash.png" alt="PirateHash" />
                <img className="inline-logo" src="/images/sponsors/bitbox.png" alt="BitBox" />
                <img className="inline-logo" src="/images/sponsors/relai_bg.svg" alt="Relai" />
              </div>

              <div>
                <h2 className="label">INFRASTRUCTURE</h2>
                <p>
                  The architecture integrates multiple open-source projects and encourages the
                  adoption of Bitcoin as a payment system.
                </p>
                <img className="inline-logo" src="/images/about/bitcoin_core.png" alt="Bitcoin Core" />
                <img className="inline-logo" src="/images/about/lnd.png" alt="LND" />
                <img className="inline-logo" src="/images/about/rtl.png" alt="RTL" />
                <img className="inline-logo" src="/images/about/lnbits.png" alt="LNbits" />
              </div>
            </div>
            <div className="pager">2/5</div>
          </div>

          {/* Page 3 */}
          <div
            id="page-3"
            className="page"
            style={{ display: pageSelected === 3 ? 'block' : 'none' }}
          >
            <div className="page-inner">
              <div>
                <h2 className="label">Value-for-value</h2>
                <p>
                  A fraction of the wagered sats is distributed on Lightning to the contributors
                  of the project.
                </p>
                <img className="value" src="/images/about/value-for-value.png" alt="Value for Value" />
              </div>
            </div>
            <div className="pager">3/5</div>
          </div>

          {/* Page 4 */}
          <div
            id="page-4"
            className="page center"
            style={{ display: pageSelected === 4 ? 'block' : 'none' }}
          >
            <div className="page-inner">
              <div className="social-handles">
                <div className="qr">
                  <h2 className="label">Contribute</h2>
                  <img
                    src="/images/ChainDuel_LNURL.svg"
                    style={{ width: '15vw', marginBottom: '1vw' }}
                    alt="LNURL"
                  />
                </div>
                <div className="handles">
                  <p>
                    <img src="/images/github.png" style={{ width: '1vw' }} alt="GitHub" />
                    francismars/chain-duel
                  </p>
                </div>
                <div className="handles">
                  <p>
                    <img src="/images/telegram_logo.webp" style={{ width: '1vw' }} alt="Telegram" />
                    t.me/chainduel
                  </p>
                </div>
                <div className="handles">
                  <p>
                    <img src="/images/geyserfund.svg" style={{ width: '1vw' }} alt="Geyser" />
                    chainduel
                  </p>
                </div>
                <div className="handles">
                  <p>
                    <img src="/images/social/Nostr.png" style={{ width: '1vw' }} alt="Nostr" />
                    primal.net/ChainDuel
                  </p>
                </div>
                <div className="handles">
                  <p>
                    <img src="/images/twitter.webp" style={{ width: '1vw' }} alt="Twitter" />
                    @chainduel
                  </p>
                </div>
              </div>
            </div>
            <div className="pager">4/5</div>
          </div>

          {/* Page 5 */}
          <div
            id="page-5"
            className="page center"
            style={{ display: pageSelected === 5 ? 'block' : 'none' }}
          >
            <div className="page-inner">
              <div className="credits">
                <div className="credit span-all">
                  <p className="label">DEVELOPED BY</p>
                  <p className="condensed credit-name">Francis Mars</p>
                </div>
                <div className="credit">
                  <p className="label">VISUALS BY</p>
                  <p className="condensed credit-name">Anatomy of Bitcoin</p>
                </div>
                <div className="credit">
                  <p className="label">MUSIC BY</p>
                  <p className="condensed credit-name">kikithespace</p>
                </div>
              </div>
            </div>
            <div className="pager">5/5</div>
          </div>
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

        <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
      </div>
    </>
  );
}
