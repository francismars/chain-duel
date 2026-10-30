/**
 * Shared layout for Practice and P2P game setup pages.
 * Template: top = header brand, middle = game setup (rules + buttons), bottom = bottom info (player/prize).
 */
import {
  createContext,
  RefObject,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { setButtonGlow } from '@/shared/utils/buttonGlow';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { RulesSection } from './RulesSection';
import '@/components/ui/Button.css';
import '@/components/ui/Sponsorship.css';
import './game-setup.css';
import { BrandHeader } from '@/components/layout/BrandHeader';

export interface GameSetupLayoutProps {
  /** Page title, e.g. "PRACTICE" or "P2P" */
  title: string;
  /** Class for the root (e.g. practice-page, gamemenu-page) for page-specific CSS */
  pageClass: string;
  /** Disable MAIN MENU when deposits are in */
  mainMenuDisabled: boolean;
  /** Label for the back / leave button (defaults to MAIN MENU) */
  mainMenuLabel?: string;
  /** Enable READY TO START */
  canStart: boolean;
  onMainMenu: () => void;
  onStart: () => void;
  loading: boolean;
  /** Keep the loading overlay up and offer a way out after the load times out */
  loadingTimedOut?: boolean;
  onLoadingTimeoutExit?: () => void;
  showCancelOverlay: boolean;
  /** Overlay copy when leaving the setup screen */
  cancelOverlayTitle?: string;
  cancelOverlayText?: string;
  onCancelAbort: () => void;
  onCancelConfirm: () => void;
  statusMessage?: string;
  /** Shown below READY TO START when the player tries to start before everyone has paid */
  startBlockedHint?: string | null;
  startShaking?: boolean;
  selectedButton?:
    | 'mainMenuButton'
    | 'startgame'
    | 'rules'
    | 'cancelGameAbort'
    | 'cancelGameConfirm'
    | null;
  mainMenuButtonRef?: RefObject<HTMLButtonElement>;
  startGameButtonRef?: RefObject<HTMLButtonElement>;
  cancelGameAbortRef?: RefObject<HTMLButtonElement>;
  cancelGameConfirmRef?: RefObject<HTMLButtonElement>;
  /** Bottom panel: player card(s), prize, etc. */
  children: ReactNode;
}

const PreviewRulesButtonContext = createContext<ReactNode>(null);

/** Preview menu places the Rules control under the ledger line. */
export function PreviewRulesButtonSlot() {
  return useContext(PreviewRulesButtonContext);
}

export function GameSetupLayout({
  title,
  pageClass,
  mainMenuDisabled,
  mainMenuLabel = 'MAIN MENU',
  canStart,
  onMainMenu,
  onStart,
  loading,
  loadingTimedOut = false,
  onLoadingTimeoutExit,
  showCancelOverlay,
  cancelOverlayTitle = 'Cancel Game?',
  cancelOverlayText = 'Are you sure you want to leave?',
  onCancelAbort,
  onCancelConfirm,
  statusMessage,
  startBlockedHint,
  startShaking = false,
  selectedButton,
  mainMenuButtonRef,
  startGameButtonRef,
  cancelGameAbortRef,
  cancelGameConfirmRef,
  children,
}: GameSetupLayoutProps) {
  const previewSwap = pageClass.includes('gamemenu-preview');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesTitle, setRulesTitle] = useState({
    kicker: 'Rule 1',
    title: 'Stake your sats',
    phase: 'idle' as 'idle' | 'hide' | 'show',
    dir: 'next' as 'next' | 'prev',
  });
  const internalMainRef = useRef<HTMLButtonElement>(null);
  const internalStartRef = useRef<HTMLButtonElement>(null);
  const internalAbortRef = useRef<HTMLButtonElement>(null);
  const internalConfirmRef = useRef<HTMLButtonElement>(null);
  const rulesButtonRef = useRef<HTMLButtonElement>(null);

  const refs = useMemo(
    () => ({
      mainMenuButton: mainMenuButtonRef ?? internalMainRef,
      startgame: startGameButtonRef ?? internalStartRef,
      cancelGameAbort: cancelGameAbortRef ?? internalAbortRef,
      cancelGameConfirm: cancelGameConfirmRef ?? internalConfirmRef,
    }),
    [
      mainMenuButtonRef,
      startGameButtonRef,
      cancelGameAbortRef,
      cancelGameConfirmRef,
    ]
  );

  useEffect(() => {
    (Object.keys(refs) as Array<keyof typeof refs>).forEach((key) => {
      setButtonGlow(refs[key].current, selectedButton === key);
    });
    setButtonGlow(rulesButtonRef.current, selectedButton === 'rules');
    if (!selectedButton) {
      const active = document.activeElement;
      const isGameButton = (
        Object.values(refs) as Array<RefObject<HTMLButtonElement | null>>
      ).some((ref) => ref.current === active);
      if (isGameButton && active instanceof HTMLElement) {
        active.blur();
      }
    }
  }, [refs, selectedButton]);

  const closeRules = useCallback(() => setRulesOpen(false), []);

  const overlays =
    typeof document !== 'undefined'
      ? createPortal(
          <>
            <div className={`overlay ${loading ? '' : 'hide'}`} id="loading">
              {loadingTimedOut ? (
                <div className="warning">
                  <div className="warning-inner">
                    <h2 className="warning-title condensed">
                      Still waiting for the game
                    </h2>
                    <div className="warning-text">
                      The game menu did not load. Return to the menu and try
                      again.
                    </div>
                  </div>
                  <div className="warning-actions">
                    <Button
                      className="button"
                      id="loadingTimeoutExit"
                      type="button"
                      onClick={onLoadingTimeoutExit}
                    >
                      Return to menu
                    </Button>
                  </div>
                </div>
              ) : (
                <img src="/images/loading.gif" alt="Loading" />
              )}
            </div>
            <div
              className={`overlay ${showCancelOverlay ? '' : 'hide'}`}
              id="cancelGame"
            >
              <div className="warning">
                <div className="warning-inner">
                  <h2 className="warning-title condensed">
                    {cancelOverlayTitle}
                  </h2>
                  <div className="warning-text">{cancelOverlayText}</div>
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
        <BrandHeader className="game-setup-header" />

        {/* Middle: game setup (rules, buttons) */}
        <div className="game-setup-middle">
          <div className="game-setup-main">
            <div>
              <Sponsorship id="sponsorshipGameMenu" />
              <h2 id="gameMenuTitle" className="hero-outline condensed">
                {title}
              </h2>
              {previewSwap ? null : <p id="titleslogan">Rules</p>}
            </div>

            {previewSwap ? (
              <div id="bottomInfo" className="game-setup-bottom">
                <PreviewRulesButtonContext.Provider
                  value={
                    <button
                      ref={rulesButtonRef}
                      id="gamemenu-rules"
                      type="button"
                      className="gamemenu-preview-rules-btn"
                      onClick={() => setRulesOpen(true)}
                    >
                      Rules
                    </button>
                  }
                >
                  {children}
                </PreviewRulesButtonContext.Provider>
              </div>
            ) : (
              <RulesSection />
            )}
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
                {mainMenuLabel}
              </Button>
              <div
                className={[
                  'game-setup-start-wrap',
                  startShaking ? 'game-setup-start-wrap--shake' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <Button
                  ref={refs.startgame}
                  id="startgame"
                  type="button"
                  className={canStart ? '' : 'not-ready'}
                  onClick={onStart}
                >
                  READY TO START
                </Button>
                {startBlockedHint ? (
                  <p className="game-setup-start-hint" role="status">
                    {startBlockedHint}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {previewSwap ? null : (
          <div id="bottomInfo" className="game-setup-bottom">
            {children}
          </div>
        )}
      </div>
      {rulesOpen ? (
        <Modal
          onClose={closeRules}
          labelledBy="rules-modal-title"
          className="rules-modal"
          backdropClassName="rules-modal-backdrop"
        >
          <div className="rules-modal__bar">
            <p
              id="rules-modal-title"
              key={`${rulesTitle.kicker}-${rulesTitle.phase}`}
              className={
                rulesTitle.phase === 'idle'
                  ? 'rules-modal__title'
                  : `rules-modal__title rules-modal__title--${rulesTitle.phase} rules-modal__title--${rulesTitle.dir}`
              }
            >
              <span className="rules-modal__kicker">{rulesTitle.kicker}</span>
              <span className="rules-modal__heading">{rulesTitle.title}</span>
            </p>
          </div>
          <RulesSection
            variant="clips"
            onTitleChange={setRulesTitle}
            onClose={closeRules}
          />
        </Modal>
      ) : null}
      {overlays}
    </>
  );
}
