/**
 * Shared layout for Practice and P2P game setup pages.
 * Renders: header, rules section, MAIN MENU / READY TO START, bottom slot, loading + cancel overlays.
 */
import { RefObject, ReactNode } from 'react';
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
  mainMenuButtonRef: RefObject<HTMLButtonElement>;
  startGameButtonRef: RefObject<HTMLButtonElement>;
  cancelGameAbortRef: RefObject<HTMLButtonElement>;
  cancelGameConfirmRef: RefObject<HTMLButtonElement>;
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
  mainMenuButtonRef,
  startGameButtonRef,
  cancelGameAbortRef,
  cancelGameConfirmRef,
  children,
}: GameSetupLayoutProps) {
  return (
    <div className={`game-setup-page ${pageClass}`}>
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div className="flex full">
        <div className="flex-spacer" aria-hidden />
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
              ref={mainMenuButtonRef}
              id="mainmenubutton"
              type="button"
              className={mainMenuDisabled ? 'disabled' : ''}
              onClick={onMainMenu}
            >
              MAIN MENU
            </Button>
            <Button
              ref={startGameButtonRef}
              id="startgame"
              type="button"
              className={canStart ? '' : 'disabled'}
              onClick={() => canStart && onStart()}
            >
              READY TO START
            </Button>
          </div>
        </div>

        <div id="bottomInfo">{children}</div>
      </div>

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
            <div className="warning-text">Are you sure you want to leave?</div>
          </div>
          <div className="warning-actions">
            <Button
              ref={cancelGameAbortRef}
              className="button half"
              id="cancelGameAbort"
              type="button"
              onClick={onCancelAbort}
            >
              No
            </Button>
            <Button
              ref={cancelGameConfirmRef}
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
    </div>
  );
}
