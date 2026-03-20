/**
 * Shared layout for Practice and P2P game setup pages.
 * Template: top = header brand, middle = game setup (rules + buttons), bottom = bottom info (player/prize).
 */
import { RefObject, ReactNode, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { RulesSection } from './RulesSection';
import '@/components/ui/Button.css';
import '@/components/ui/Sponsorship.css';
import './game-setup.css';

export interface GameSetupLayoutProps {
  /** Page title, e.g. "PRACTICE" or "P2P" */
  title: string;
  /** Class for the root (e.g. practice-page, gamemenu-page) for page-specific CSS */
  pageClass: string;
  /** Disable MAIN MENU when deposits are in */
  mainMenuDisabled: boolean;
  /** Enable READY TO START */
  canStart: boolean;
  onMainMenu: () => void;
  onStart: () => void;
  loading: boolean;
  showCancelOverlay: boolean;
  onCancelAbort: () => void;
  onCancelConfirm: () => void;
  statusMessage?: string;
  selectedButton?: 'mainMenuButton' | 'startgame' | 'cancelGameAbort' | 'cancelGameConfirm';
  mainMenuButtonRef?: RefObject<HTMLButtonElement>;
  startGameButtonRef?: RefObject<HTMLButtonElement>;
  cancelGameAbortRef?: RefObject<HTMLButtonElement>;
  cancelGameConfirmRef?: RefObject<HTMLButtonElement>;
  /** Bottom panel: player card(s), prize, etc. */
  children: ReactNode;
}

export function GameSetupLayout({
  title,
  pageClass,
  mainMenuDisabled,
  canStart,
  onMainMenu,
  onStart,
  loading,
  showCancelOverlay,
  onCancelAbort,
  onCancelConfirm,
  statusMessage,
  selectedButton,
  mainMenuButtonRef,
  startGameButtonRef,
  cancelGameAbortRef,
  cancelGameConfirmRef,
  children,
}: GameSetupLayoutProps) {
  const internalMainRef = useRef<HTMLButtonElement>(null);
  const internalStartRef = useRef<HTMLButtonElement>(null);
  const internalAbortRef = useRef<HTMLButtonElement>(null);
  const internalConfirmRef = useRef<HTMLButtonElement>(null);

  const refs = useMemo(
    () => ({
      mainMenuButton: mainMenuButtonRef ?? internalMainRef,
      startgame: startGameButtonRef ?? internalStartRef,
      cancelGameAbort: cancelGameAbortRef ?? internalAbortRef,
      cancelGameConfirm: cancelGameConfirmRef ?? internalConfirmRef,
    }),
    [mainMenuButtonRef, startGameButtonRef, cancelGameAbortRef, cancelGameConfirmRef]
  );

  useEffect(() => {
    if (!selectedButton) return;
    const durations: Record<string, string> = {
      mainMenuButton: selectedButton === 'mainMenuButton' ? '2s' : '0s',
      startgame: selectedButton === 'startgame' ? '2s' : '0s',
      cancelGameAbort: selectedButton === 'cancelGameAbort' ? '2s' : '0s',
      cancelGameConfirm: selectedButton === 'cancelGameConfirm' ? '2s' : '0s',
    };
    (Object.keys(refs) as Array<keyof typeof refs>).forEach((key) => {
      const node = refs[key].current;
      if (!node) return;
      node.style.animationDuration = durations[key];
    });
  }, [refs, selectedButton]);

  const overlays =
    typeof document !== 'undefined'
      ? createPortal(
          <>
            <div className={`overlay ${loading ? '' : 'hide'}`} id="loading">
              <img src="/images/loading.gif" alt="Loading" />
            </div>
            <div
              className={`overlay ${showCancelOverlay ? '' : 'hide'}`}
              id="cancelGame"
            >
              <div className="warning">
                <div className="warning-inner">
                  <h2 className="warning-title condensed">Cancel Game?</h2>
                  <div className="warning-text">
                    Are you sure you want to leave?
                  </div>
                </div>
                <div className="warning-actions">
                  <Button
                    ref={refs.cancelGameAbort}
                    className="button half"
                    id="cancelGameAbort"
                    type="button"
                    onClick={onCancelAbort}
                  >
                    No
                  </Button>
                  <Button
                    ref={refs.cancelGameConfirm}
                    className="button half"
                    id="cancelGameConfirm"
                    type="button"
                    onClick={onCancelConfirm}
                  >
                    Yes
                  </Button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <div className={`game-setup-page ${pageClass}`}>
        {/* Top: header brand */}
        <header id="brand" className="game-setup-header">
          <h2 id="chain">CHAIN</h2>
          <h2 id="duel">DUEL</h2>
        </header>

        {/* Middle: game setup (rules, buttons) */}
        <div className="game-setup-middle">
          <div className="game-setup-main">
            <div>
              <Sponsorship id="sponsorshipGameMenu" />
              <h2 id="gameMenuTitle" className="hero-outline condensed">
                {title}
              </h2>
              <p id="titleslogan">Rules</p>
            </div>

            <RulesSection />
            {statusMessage ? (
              <p className="game-setup-status grey">{statusMessage}</p>
            ) : null}

            <div id="gameButtons">
              <Button
                ref={refs.mainMenuButton}
                id="mainmenubutton"
                type="button"
                className={mainMenuDisabled ? 'disabled' : ''}
                onClick={onMainMenu}
              >
                MAIN MENU
              </Button>
              <Button
                ref={refs.startgame}
                id="startgame"
                type="button"
                className={canStart ? '' : 'disabled'}
                onClick={() => canStart && onStart()}
              >
                READY TO START
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom: bottom info (player card(s), prize, etc.) */}
        <div id="bottomInfo" className="game-setup-bottom">
          {children}
        </div>
      </div>
      {overlays}
    </>
  );
}
