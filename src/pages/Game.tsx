import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { SoloZapRadiatingLines } from '@/features/game/SoloZapRadiatingLines';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { Button } from '@/components/ui/Button';
import { useNoteContentDisplay } from '@/lib/nostr/formatNoteContentForDisplay';
import { signChallengeBountyNote } from '@/lib/nostr/signChallengeBountyNote';
import { createFlowTrace } from '@/lib/nostr/nip46Trace';
import { resolveSignerMode } from '@/lib/nostr/signerSession';
import {
  claimChallengeBounty,
  formatChallengeValidationError,
  isRetryableChallengeWinError,
  retryChallengeZap,
  submitChallengeWin,
} from '@/lib/challengeBounty';
import {
  clearPendingChallengeClaim,
  loadPendingChallengeClaim,
  savePendingChallengeClaim,
} from '@/lib/pendingChallengeClaim';
import { saveChallengeMenuFocus } from '@/lib/challengeMenuFocus';
import { useNostrSession } from '@/contexts/NostrSessionContext';
import {
  applyTerminalGameOutcome,
  createGameState,
  getHudState,
  isEliminationMode,
} from '@/game/engine';
import { initRunRng, clearRunRng } from '@/game/engine/runRng';
import type { GameState } from '@/game/engine/types';
import { normalizeAiTier } from '@/game/engine/types';
import { GameAudioSystem } from '@/game/audio/gameAudio';
import { PixiGameRenderer } from '@/game/render/pixiRenderer';
import { endOverlayActionsDelayMs } from '@/game/render/endGameOverlay';
import { useMempoolFeed } from '@/features/game/hooks/useMempoolFeed';
import { MatchEndCard } from '@/features/game/MatchEndCard';
import { MatchStartPrompt } from '@/features/game/MatchStartPrompt';
import { MempoolFooter } from '@/features/game/MempoolFooter';
import { createNewCoinbase } from '@/game/engine';
import type { BlockInfo } from '@/game/io/mempool';
import {
  isGamepadFaceHeld,
  isGamepadSyntheticKey,
  useGamepad,
} from '@/hooks/useGamepad';
import { useSocket } from '@/hooks/useSocket';
import { useAudio } from '@/contexts/AudioContext';
import { PlayerRole } from '@/types/socket';
import { formatHudPlayerName } from '@/features/game/gameSession';
import { useGameSocketEvents } from '@/features/game/hooks/useGameSocketEvents';
import { useGameRenderBridge } from '@/features/game/hooks/useGameRenderBridge';
import { useHudCaptureFeedback } from '@/features/game/hooks/useHudCaptureFeedback';
import {
  CAPTURE_POP_MS,
  captureFeedbackStyleFromCtx,
  captureHitStyleVars,
  distributionTrackFeedbackStyle,
} from '@/features/game/hudCaptureFeedback';
import { useGameInputBindings } from '@/features/game/hooks/useGameInputBindings';
import { createEmptyHeldInputState } from '@/lib/controls/heldDirectionSteering';
import { PowerUpLegend } from '@/features/game/PowerUpLegend';
import {
  challengeThemeStyle,
  getChallengeTheme,
} from '@/lib/challenges/challengeTheme';
import { FfaHud } from '@/features/game/FfaGameHud';
import {
  localStartPromptWords,
  type CanvasObjectivesOpts,
} from '@/game/render/matchObjectives';
import {
  humanControlSlotsFromConfig,
  humanControlSlotsFromState,
  type PlayerControlSlot,
} from '@/lib/controls/playerControls';
import {
  canSwapSoloHumanSeat,
  soloSeatSwitchHint,
  type SoloSeatSwapResult,
} from '@/game/soloSeatSwitch';
import {
  GameInfoLabel,
  readChallengeHudFromConfig,
} from '@/features/game/GameInfoLabel';
import type { FfaHudPlayer } from '@/game/engine/types';
import { GAME_BOOTSTRAP_TIMEOUT_MS } from '@/shared/constants/timeouts';
import { navigateToPostGame } from '@/shared/constants/menuNavigation';
import {
  challengeStartSatsPerPlayer,
  isExplicitPracticeSession,
  isPracticeChallengeConfig,
  isPracticeFreePlayConfig,
  isPracticeHubGameMode,
  isSocketDuelSession,
  practiceHubExitPath,
  readSessionGameConfig,
  sessionUsesPracticeHubConfig,
} from '@/pages/practiceHubModes';
import { reportClientEvent } from '@/lib/telemetry/reportClientEvent';
import './game.css';
import '@/styles/components/matchResults.css';

interface ZapMessage {
  id: string;
  username: string;
  content: string;
  amount: number;
  profile: string;
  scale: number;
}

type SoloEndData = {
  won: boolean;
  name: string;
  bounty: number;
  claimToken?: string;
  noteContent?: string;
  noteTags?: string[][];
  challengeId?: string;
  validating?: boolean;
  validationError?: string;
  zapPaid?: boolean;
  zapReason?: string;
};

type FreePlayEndFocus = 'again' | 'menu';

type SoloZapFocusId =
  'openPrimal' | 'retryZap' | 'retryValidation' | 'signIn' | 'claim' | 'menu';

const SOLO_ZAP_FOCUS_PRIORITY: SoloZapFocusId[] = [
  'claim',
  'signIn',
  'retryValidation',
  'retryZap',
  'openPrimal',
  'menu',
];

function soloZapNavDirection(
  event: Pick<KeyboardEvent, 'key' | 'code'>
): 'up' | 'down' | 'activate' | null {
  const key = event.key;
  const code = event.code;
  if (key === 'Enter' || key === ' ' || code === 'Enter' || code === 'Space') {
    return 'activate';
  }
  if (
    key === 'ArrowUp' ||
    key === 'w' ||
    key === 'W' ||
    key === 'ArrowLeft' ||
    key === 'a' ||
    key === 'A' ||
    code === 'ArrowUp' ||
    code === 'ArrowLeft'
  ) {
    return 'up';
  }
  if (
    key === 'ArrowDown' ||
    key === 's' ||
    key === 'S' ||
    key === 'ArrowRight' ||
    key === 'd' ||
    key === 'D' ||
    code === 'ArrowDown' ||
    code === 'ArrowRight'
  ) {
    return 'down';
  }
  return null;
}

export default function Game() {
  const location = useLocation();
  const endPreview = new URLSearchParams(location.search).get('preview');
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const nostrSession = useNostrSession();
  const { stop, isMuted, isMusicMuted } = useAudio();

  const stateRef = useRef<GameState | null>(null);
  const rendererRef = useRef<PixiGameRenderer | null>(null);
  const audioRef = useRef<GameAudioSystem | null>(null);
  if (!audioRef.current) {
    audioRef.current = new GameAudioSystem();
  }
  const hostRef = useRef<HTMLDivElement | null>(null);
  const winnerSentRef = useRef(false);
  const quickMatchStartedAtRef = useRef<number | null>(null);
  const quickMatchCompletedRef = useRef(false);
  const challengeCompletedReportedRef = useRef(false);
  const localBootRef = useRef(false);
  const readyToStartRef = useRef(false);
  const captureP1Ref = useRef('2%');
  const captureP2Ref = useRef('2%');
  const simStepRef = useRef(0);
  const challengeInputLogRef = useRef<Array<{ tick: number; dir: string }>>([]);
  const challengeWinSubmittedRef = useRef(false);
  const soloZapSkipOverlayDelayRef = useRef(false);
  const blockChallengeContinueRef = useRef(false);
  const challengeContinueLabelRef = useRef<string | null>(null);
  const canvasObjectivesRef = useRef<CanvasObjectivesOpts>({
    controlSlots: [],
  });
  const heldInputRef = useRef(createEmptyHeldInputState());

  const [loading, setLoading] = useState(true);
  const [player1Name, setPlayer1Name] = useState('Player 1');
  const [player2Name, setPlayer2Name] = useState('Player 2');
  const [player1Img, setPlayer1Img] = useState('');
  const [player2Img, setPlayer2Img] = useState('');
  const [p1Points, setP1Points] = useState(0);
  const [p2Points, setP2Points] = useState(0);
  const [gameInfo, setGameInfo] = useState('');
  const [captureP1, setCaptureP1] = useState('2%');
  const [captureP2, setCaptureP2] = useState('2%');
  const {
    captureP1Highlight,
    captureP2Highlight,
    captureRowFlash,
    satsSurge,
    barCaptureHit,
    ffaBarCaptureHit,
    ffaSatsSurge,
    handleCaptureTierChanged,
    handleSatsCaptured,
    handleFfaSatsCaptured,
  } = useHudCaptureFeedback();
  const [currentP1Width, setCurrentP1Width] = useState(50);
  const [currentP2Width, setCurrentP2Width] = useState(50);
  const [isFfa, setIsFfa] = useState(false);
  const [is2v1, setIs2v1] = useState(false);
  const [ffaPlayers, setFfaPlayers] = useState<FfaHudPlayer[]>([]);
  const [ffaCaptureHighlights, setFfaCaptureHighlights] = useState([
    false,
    false,
    false,
    false,
  ]);
  const ffaCapturePrevRef = useRef(['2%', '2%', '2%', '2%']);
  const ffaScorePrevRef = useRef([0, 0, 0, 0]);
  const [canvasHighlight, setCanvasHighlight] = useState(false);
  const [zapMessages, setZapMessages] = useState<ZapMessage[]>([]);
  const [soloEndData, setSoloEndData] = useState<SoloEndData | null>(null);
  const [freePlayEnd, setFreePlayEnd] = useState(false);
  const soloResultNav =
    Boolean(soloEndData && !soloEndData.validating) || freePlayEnd;
  useGamepad(true, { inputMode: soloResultNav ? 'menu' : 'game' });

  const [freePlayEndFocus, setFreePlayEndFocus] =
    useState<FreePlayEndFocus>('again');
  const freePlayEndPendingRef = useRef(false);
  const freePlayEndVisibleRef = useRef(false);
  const freePlayEndTimerRef = useRef(0);
  /** Confirm that opened the choices is ignored until that button is released. */
  const freePlaySkipLatchRef = useRef(false);
  const freePlaySkipFromPadRef = useRef(false);
  const endCardInstantRef = useRef(false);
  const suppressVictoryOverlayRef = useRef(false);
  freePlayEndVisibleRef.current = freePlayEnd;
  const [soloZapOverlayVisible, setSoloZapOverlayVisible] = useState(false);
  const [showExitOverlay, setShowExitOverlay] = useState(false);
  const [exitOverlayFocus, setExitOverlayFocus] = useState<'abort' | 'confirm'>(
    'abort'
  );
  const practiceSession = useMemo(() => {
    const cfg = readSessionGameConfig();
    return {
      active: sessionUsesPracticeHubConfig(),
      isChallenge: isPracticeChallengeConfig(cfg),
    };
  }, []);
  const handleMempoolNewBlock = useCallback(
    (block: BlockInfo) => {
      setCanvasHighlight(true);
      window.setTimeout(() => setCanvasHighlight(false), 1000);
      if (!practiceSession.isChallenge) {
        createNewCoinbase(stateRef.current!, block.extras?.medianFee ?? -1);
        audioRef.current?.playBlockFound();
      }
    },
    [practiceSession.isChallenge]
  );
  const { bitcoin, footerHighlight } = useMempoolFeed({
    onNewBlock: handleMempoolNewBlock,
  });
  const [noteState, setNoteState] = useState<
    'idle' | 'posting' | 'posted' | 'error' | 'zapping'
  >('idle');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteAuthorName, setNoteAuthorName] = useState<string>('Nostr user');
  const [noteAuthorAvatar, setNoteAuthorAvatar] = useState<string | null>(null);
  const [noteAuthorAvatarBroken, setNoteAuthorAvatarBroken] = useState(false);
  const [soloZapFocus, setSoloZapFocus] = useState<SoloZapFocusId | null>(null);
  const soloZapOpenPrimalRef = useRef<HTMLButtonElement>(null);
  const soloZapRetryRef = useRef<HTMLButtonElement>(null);
  const soloZapRetryValidationRef = useRef<HTMLButtonElement>(null);
  const soloZapSignInRef = useRef<HTMLButtonElement>(null);
  const soloZapClaimRef = useRef<HTMLButtonElement>(null);
  const soloZapMenuRef = useRef<HTMLButtonElement>(null);
  const noteContentDisplay = useNoteContentDisplay(soloEndData?.noteContent);

  const postBountyNote = useCallback(async () => {
    if (
      !soloEndData?.claimToken ||
      !soloEndData.noteContent ||
      !soloEndData.noteTags ||
      soloEndData.challengeId === 'preview'
    )
      return;
    const trace = createFlowTrace('challenge', 'post-and-claim');
    setNoteState('posting');
    setNoteError(null);
    try {
      if (!socket) throw new Error('Not connected to server.');
      trace.step(
        'begin',
        `bounty=${soloEndData.bounty} sats challenge=${soloEndData.challengeId}`
      );
      const unsigned = {
        kind: 1 as const,
        created_at: Math.floor(Date.now() / 1000),
        tags: soloEndData.noteTags,
        content: soloEndData.noteContent,
      };
      trace.step(
        'signing bounty note',
        'see [challenge] sign-bounty-note + [relay] bounty-note/kind-1'
      );
      const signed = await signChallengeBountyNote(unsigned);
      trace.step('sign complete', `event id=${signed.id?.slice(0, 12)}…`);
      setNoteState('zapping');
      trace.step('claiming on server', 'see [marspay] claim-bounty');
      const result = await claimChallengeBounty(socket, {
        claimToken: soloEndData.claimToken,
        event: signed,
      });
      if (!result.ok) throw new Error(result.reason);
      setSoloEndData((prev) =>
        prev
          ? { ...prev, zapPaid: result.zapPaid, zapReason: result.zapReason }
          : prev
      );
      clearPendingChallengeClaim();
      setNoteState('posted');
      trace.done(
        result.zapPaid
          ? 'posted and zapped'
          : `posted (zap: ${result.zapReason ?? 'skipped'})`
      );
    } catch (err) {
      trace.fail('post-and-claim', err);
      setNoteState('error');
      setNoteError(
        err instanceof Error ? err.message : 'Failed to claim bounty.'
      );
    }
  }, [soloEndData, socket]);

  const retryZap = useCallback(async () => {
    if (!soloEndData?.challengeId || !socket) return;
    setNoteError(null);
    try {
      const result = await retryChallengeZap(socket, soloEndData.challengeId);
      if (!result.ok) throw new Error(result.reason ?? 'Zap retry failed');
      setSoloEndData((prev) =>
        prev ? { ...prev, zapPaid: true, zapReason: undefined } : prev
      );
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'Zap retry failed.');
    }
  }, [soloEndData, socket]);

  const applyChallengeWinValidation = useCallback(
    async (base: {
      name: string;
      bounty: number;
      challengeId: string;
      runId: string;
    }) => {
      if (!socket || !base.runId) {
        setSoloEndData({
          won: true,
          ...base,
          validating: false,
          validationError: !base.runId ? 'missing_run' : 'no_socket',
        });
        return;
      }

      setSoloEndData({
        won: true,
        ...base,
        validating: true,
        validationError: undefined,
      });

      try {
        const result = await submitChallengeWin(socket, {
          runId: base.runId,
          inputLog: [...challengeInputLogRef.current],
        });
        if (!result.ok) {
          setSoloEndData({
            won: true,
            ...base,
            validating: false,
            validationError: result.reason,
          });
          return;
        }
        setSoloEndData({
          won: true,
          bounty: result.bountySats,
          challengeId: base.challengeId,
          name: base.name,
          claimToken: result.claimToken,
          noteContent: result.noteContent,
          noteTags: result.noteTags,
          validating: false,
        });
      } catch (err) {
        setSoloEndData({
          won: true,
          ...base,
          validating: false,
          validationError:
            err instanceof Error ? err.message : 'validation_failed',
        });
      }
    },
    [socket]
  );

  const retryValidation = useCallback(() => {
    if (!soloEndData?.won || soloEndData.validating) return;
    const cfg = readSessionGameConfig();
    if (!isPracticeChallengeConfig(cfg)) return;
    const runId = String(cfg.challengeRunId ?? '');
    void applyChallengeWinValidation({
      name: soloEndData.name,
      bounty: soloEndData.bounty,
      challengeId: String(soloEndData.challengeId ?? cfg.challengeId ?? ''),
      runId,
    });
  }, [applyChallengeWinValidation, soloEndData]);

  const exitSoloEndOverlay = useCallback(() => {
    if (!soloEndData || soloEndData.validating) return;
    if (soloEndData.challengeId) {
      saveChallengeMenuFocus(soloEndData.challengeId, soloEndData.won);
    }
    navigate(practiceHubExitPath(readSessionGameConfig()));
    setSoloEndData(null);
  }, [soloEndData, navigate]);

  const forfeitClaimAndExit = useCallback(() => {
    if (!soloEndData || soloEndData.validating) return;
    clearPendingChallengeClaim();
    if (soloEndData.challengeId) {
      saveChallengeMenuFocus(soloEndData.challengeId, true);
    }
    navigate(practiceHubExitPath(readSessionGameConfig()));
    setSoloEndData(null);
  }, [soloEndData, navigate]);

  const canForfeitUnclaimedPrize =
    Boolean(soloEndData?.won) &&
    Boolean(soloEndData?.claimToken) &&
    noteState !== 'posted';

  const soloZapMenuLabel = useMemo(() => {
    if (canForfeitUnclaimedPrize) {
      return 'LEAVE WITHOUT CLAIMING ZAP';
    }
    return 'RETURN TO CHALLENGES';
  }, [canForfeitUnclaimedPrize]);

  const validationError = soloEndData?.validationError;
  const soloZapRetryValidationVisible =
    Boolean(soloEndData?.won) &&
    !soloEndData?.validating &&
    validationError != null &&
    isRetryableChallengeWinError(validationError);

  const soloZapOpenPrimalVisible =
    Boolean(soloEndData?.won) &&
    !soloEndData?.validating &&
    !soloEndData?.validationError &&
    resolveSignerMode() === 'nip46' &&
    Boolean(nostrSession.pendingNip46AuthUrl) &&
    (noteState === 'posting' || noteState === 'zapping');

  const soloZapRetryVisible =
    Boolean(soloEndData?.won) &&
    !soloEndData?.validating &&
    noteState === 'posted' &&
    !soloEndData?.zapPaid;

  const soloZapSignInVisible =
    Boolean(soloEndData?.won) &&
    !soloEndData?.validating &&
    !soloEndData?.validationError &&
    Boolean(soloEndData?.claimToken) &&
    noteState !== 'posted' &&
    soloEndData?.challengeId !== 'preview' &&
    !nostrSession.signedIn;

  const soloZapClaimVisible =
    Boolean(soloEndData?.won) &&
    !soloEndData?.validating &&
    !soloEndData?.validationError &&
    Boolean(soloEndData?.claimToken) &&
    noteState !== 'posted' &&
    (nostrSession.signedIn || soloEndData?.challengeId === 'preview');

  const soloZapMenuVisible = Boolean(soloEndData) && !soloEndData?.validating;

  const soloChallengeTheme = useMemo(
    () => getChallengeTheme(soloEndData?.challengeId),
    [soloEndData?.challengeId]
  );

  const soloZapThemeVars = useMemo(
    () => challengeThemeStyle(soloChallengeTheme),
    [soloChallengeTheme]
  );

  const soloZapFocusOrder = useMemo(() => {
    const ids: SoloZapFocusId[] = [];
    if (soloZapOpenPrimalVisible) ids.push('openPrimal');
    if (soloZapRetryVisible) ids.push('retryZap');
    if (soloZapRetryValidationVisible) ids.push('retryValidation');
    if (soloZapSignInVisible) ids.push('signIn');
    if (soloZapClaimVisible) ids.push('claim');
    if (soloZapMenuVisible) ids.push('menu');
    return ids;
  }, [
    soloZapOpenPrimalVisible,
    soloZapRetryVisible,
    soloZapRetryValidationVisible,
    soloZapSignInVisible,
    soloZapClaimVisible,
    soloZapMenuVisible,
  ]);

  const soloZapButtonRefs = useMemo(
    () =>
      ({
        openPrimal: soloZapOpenPrimalRef,
        retryZap: soloZapRetryRef,
        retryValidation: soloZapRetryValidationRef,
        signIn: soloZapSignInRef,
        claim: soloZapClaimRef,
        menu: soloZapMenuRef,
      }) as const,
    []
  );

  const focusSoloZapButton = useCallback(
    (id: SoloZapFocusId) => {
      setSoloZapFocus(id);
      soloZapButtonRefs[id].current?.focus();
    },
    [soloZapButtonRefs]
  );

  const moveSoloZapFocus = useCallback(
    (direction: 'up' | 'down' | 'activate') => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          '.solo-zap-overlay button[data-solo-zap-nav]:not(:disabled)'
        )
      );
      if (buttons.length === 0) return;
      const currentIdx = Math.max(
        0,
        buttons.findIndex((button) =>
          button.classList.contains('practice-start--focused')
        )
      );
      if (direction === 'activate') {
        buttons[currentIdx]?.click();
        return;
      }
      const delta = direction === 'up' ? -1 : 1;
      const next =
        buttons[(currentIdx + delta + buttons.length) % buttons.length];
      const id = next?.dataset.soloZapNav as SoloZapFocusId | undefined;
      if (id) focusSoloZapButton(id);
    },
    [focusSoloZapButton]
  );

  const soloZapButtonClass = useCallback(
    (id: SoloZapFocusId, base: string) =>
      [base, soloZapFocus === id ? 'practice-start--focused' : '']
        .filter(Boolean)
        .join(' '),
    [soloZapFocus]
  );

  useEffect(() => {
    if (
      !soloEndData ||
      soloEndData.validating ||
      soloZapFocusOrder.length === 0
    ) {
      setSoloZapFocus(null);
      return;
    }
    setSoloZapFocus((current) => {
      if (current && soloZapFocusOrder.includes(current)) return current;
      return (
        SOLO_ZAP_FOCUS_PRIORITY.find((id) => soloZapFocusOrder.includes(id)) ??
        soloZapFocusOrder[0]
      );
    });
  }, [soloEndData, soloZapFocusOrder]);

  useEffect(() => {
    if (!soloZapFocus) return;
    const node = soloZapButtonRefs[soloZapFocus].current;
    if (!node) return;
    node.focus();
  }, [soloZapFocus, soloZapButtonRefs, soloZapFocusOrder]);

  useEffect(() => {
    if (
      !soloEndData ||
      soloEndData.validating ||
      showExitOverlay ||
      soloZapFocusOrder.length === 0
    ) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = soloZapNavDirection(event);
      if (!direction) return;
      if (direction === 'activate' && event.repeat) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      moveSoloZapFocus(direction);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    moveSoloZapFocus,
    showExitOverlay,
    soloEndData,
    soloZapButtonRefs,
    soloZapFocus,
    soloZapFocusOrder,
  ]);

  useEffect(() => {
    setNoteAuthorAvatarBroken(false);
    if (!nostrSession.signedIn || !nostrSession.pubkey) {
      setNoteAuthorName('Nostr user');
      setNoteAuthorAvatar(null);
      return;
    }
    setNoteAuthorName(nostrSession.displayName ?? 'Nostr user');
    setNoteAuthorAvatar(nostrSession.picture?.trim() || null);
  }, [
    nostrSession.signedIn,
    nostrSession.pubkey,
    nostrSession.displayName,
    nostrSession.picture,
  ]);

  useEffect(() => {
    const pending = loadPendingChallengeClaim();
    if (!pending) return;
    soloZapSkipOverlayDelayRef.current = true;
    setSoloEndData({
      won: true,
      name: pending.name,
      bounty: pending.bounty,
      challengeId: pending.challengeId,
      claimToken: pending.claimToken,
      noteContent: pending.noteContent,
      noteTags: pending.noteTags,
      validating: false,
    });
  }, []);

  useEffect(() => {
    if (!nostrSession.signedIn) return;
    const pending = loadPendingChallengeClaim();
    if (!pending) return;
    soloZapSkipOverlayDelayRef.current = true;
    setSoloEndData((prev) => {
      if (prev?.claimToken) return prev;
      return {
        won: true,
        name: pending.name,
        bounty: pending.bounty,
        challengeId: pending.challengeId,
        claimToken: pending.claimToken,
        noteContent: pending.noteContent,
        noteTags: pending.noteTags,
        validating: false,
      };
    });
  }, [nostrSession.signedIn]);

  useEffect(() => {
    if (
      !soloEndData?.won ||
      !soloEndData.claimToken ||
      !soloEndData.noteContent ||
      !soloEndData.noteTags ||
      !soloEndData.challengeId ||
      soloEndData.challengeId === 'preview'
    ) {
      return;
    }
    if (soloEndData.zapPaid) {
      clearPendingChallengeClaim();
      return;
    }
    savePendingChallengeClaim({
      name: soloEndData.name,
      bounty: soloEndData.bounty,
      challengeId: soloEndData.challengeId,
      claimToken: soloEndData.claimToken,
      noteContent: soloEndData.noteContent,
      noteTags: soloEndData.noteTags,
    });
  }, [soloEndData]);

  useEffect(() => {
    if (!soloEndData) {
      setSoloZapOverlayVisible(false);
      return;
    }

    const delayMs = soloZapSkipOverlayDelayRef.current ? 0 : 1000;
    soloZapSkipOverlayDelayRef.current = false;

    const timer = window.setTimeout(() => {
      setSoloZapOverlayVisible(true);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [soloEndData]);

  const canShowP1Image = useMemo(() => player1Img.length > 0, [player1Img]);
  const canShowP2Image = useMemo(() => player2Img.length > 0, [player2Img]);
  const showFfaUi = isFfa && !is2v1 && ffaPlayers.length === 4;
  const show2v1Ui = is2v1 && ffaPlayers.length >= 3;
  const aiHud1 = show2v1Ui ? ffaPlayers[1] : undefined;
  const aiHud2 = show2v1Ui ? ffaPlayers[2] : undefined;

  const isPowerupMode = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('gameConfig');
      if (!raw) return false;
      const cfg = JSON.parse(raw) as Record<string, unknown>;
      const m = String(cfg.mode ?? '').toUpperCase();
      if (
        m === 'PRACTICE' ||
        m === 'LOCAL' ||
        m === 'TESTNET' ||
        m === 'SOLO'
      ) {
        return Boolean(cfg.powerupMode);
      }
      return m === 'POWERUP' || m === 'POWER-UP ARENA';
    } catch {
      return false;
    }
  }, []);

  const ignoreSocketSessionUpdates = useMemo(
    () => sessionUsesPracticeHubConfig(),
    []
  );

  const isChallengeSession = useMemo(
    () => isPracticeChallengeConfig(readSessionGameConfig()),
    []
  );

  const challengeHud = useMemo(
    () => readChallengeHudFromConfig(readSessionGameConfig()),
    []
  );

  const configHumanControlSlots = useMemo(
    () => humanControlSlotsFromConfig(readSessionGameConfig()),
    []
  );

  const liveState = stateRef.current;
  const humanControlSlots: PlayerControlSlot[] = liveState
    ? humanControlSlotsFromState(liveState)
    : configHumanControlSlots;

  const showP1Controls = humanControlSlots.includes('p1');
  const showP2Controls =
    humanControlSlots.includes('p2') && !show2v1Ui && !showFfaUi;

  const filteredControlSlots = showFfaUi
    ? [...humanControlSlots]
    : humanControlSlots.filter((slot) => {
        if (slot === 'p1') return showP1Controls;
        if (slot === 'p2') return showP2Controls;
        return false;
      });

  const soloSeatHint =
    liveState && canSwapSoloHumanSeat(liveState)
      ? soloSeatSwitchHint(liveState)
      : undefined;

  const startPrompt = liveState
    ? localStartPromptWords(liveState.meta.p1Human, liveState.meta.p2Human)
    : { words: undefined, altWords: undefined };

  canvasObjectivesRef.current = {
    controlSlots: filteredControlSlots,
    ...(startPrompt.words ? { startPromptWords: startPrompt.words } : {}),
    ...(startPrompt.altWords
      ? { startPromptAltWords: startPrompt.altWords }
      : {}),
    ...(soloSeatHint ? { startPromptSubtext: soloSeatHint } : {}),
  };

  const bootstrapLocalGame = useCallback(() => {
    const endPreviewNow = new URLSearchParams(window.location.search).get(
      'preview'
    );
    if (
      endPreviewNow === 'local' ||
      endPreviewNow === 'freeplay' ||
      endPreviewNow === 'h2h' ||
      endPreviewNow === 'p2p'
    ) {
      setLoading(false);
      return;
    }
    // sessionStorage from practice hub (/practice); legacy POWERUP sessions may remain
    const gameConfig = readSessionGameConfig();

    const configMode = String(gameConfig.mode ?? '').toUpperCase();
    const isPracticeHub = isPracticeHubGameMode(configMode);
    const isLegacyPowerup =
      configMode === 'POWERUP' || configMode === 'POWER-UP ARENA';
    const isConvergence = isPracticeHub && Boolean(gameConfig.convergenceMode);
    const isPowerup =
      isLegacyPowerup || (isPracticeHub && Boolean(gameConfig.powerupMode));
    const isPracticeMode = Boolean(gameConfig.practiceMode);
    const aiTier = normalizeAiTier(
      (gameConfig.aiTier as string | undefined) ?? undefined
    );
    const optCfgStr = (v: unknown): string | undefined => {
      if (v == null) return undefined;
      const s = String(v).trim();
      return s === '' ? undefined : s;
    };
    const p1Name = formatHudPlayerName(
      {
        name: optCfgStr(gameConfig.p1Name),
        fallbackLabel: optCfgStr(gameConfig.p1FallbackLabel),
        nostrPubkey: optCfgStr(gameConfig.p1NostrPubkey ?? gameConfig.p1Npub),
      },
      'Player 1'
    );
    const rawP2Name = String(
      gameConfig.p2Name ?? (isPracticeMode ? 'BigToshi 🌊' : 'Player 2')
    );

    let p1Human = true;
    let p2Human = !isPracticeMode;
    if (typeof gameConfig.p1Human === 'boolean') p1Human = gameConfig.p1Human;
    if (typeof gameConfig.p2Human === 'boolean') p2Human = gameConfig.p2Human;
    const p3Human = gameConfig.p3Human === true;
    const p4Human = gameConfig.p4Human === true;

    const hudFromConfig =
      gameConfig.practiceHudLabel ??
      gameConfig.localHudLabel ??
      gameConfig.testnetHudLabel;
    const modeLabel =
      isPracticeHub && typeof hudFromConfig === 'string'
        ? String(hudFromConfig)
        : isLegacyPowerup
          ? 'POWER-UP ARENA'
          : 'PRACTICE';
    const displayP2Name = isPracticeHub
      ? formatHudPlayerName(
          {
            name: optCfgStr(gameConfig.p2Name),
            fallbackLabel: optCfgStr(gameConfig.p2FallbackLabel),
            nostrPubkey: optCfgStr(
              gameConfig.p2NostrPubkey ?? gameConfig.p2Npub
            ),
          },
          'Player 2'
        )
      : isPracticeMode
        ? rawP2Name
        : 'Player 2';

    const rawTeamMode = (gameConfig.teamMode as string | undefined) ?? 'solo';
    const teamMode =
      rawTeamMode === 'ffa' ? 'ffa' : rawTeamMode === '2v1' ? '2v1' : 'solo';

    const convergenceShrinkInterval =
      gameConfig.convergenceShrinkInterval != null
        ? Number(gameConfig.convergenceShrinkInterval)
        : undefined;
    const convergenceMinCols =
      gameConfig.convergenceMinCols != null
        ? Number(gameConfig.convergenceMinCols)
        : undefined;
    const convergenceMinRows =
      gameConfig.convergenceMinRows != null
        ? Number(gameConfig.convergenceMinRows)
        : undefined;
    const convergenceStepMs =
      gameConfig.convergenceStepMs != null
        ? Number(gameConfig.convergenceStepMs)
        : undefined;

    const challengeStake = challengeStartSatsPerPlayer(gameConfig);
    const defaultStake = challengeStake ?? 1000;
    const p1Points = Math.max(
      1,
      Math.floor(
        Number(gameConfig.p1Points ?? gameConfig.p1Sats ?? defaultStake)
      )
    );
    const p2Points = Math.max(
      1,
      Math.floor(
        Number(gameConfig.p2Points ?? gameConfig.p2Sats ?? defaultStake)
      )
    );

    if (!localBootRef.current) {
      localBootRef.current = true;
      simStepRef.current = 0;
      challengeInputLogRef.current = [];
      challengeWinSubmittedRef.current = false;

      const challengeSeed =
        typeof gameConfig.challengeRunSeed === 'string'
          ? gameConfig.challengeRunSeed
          : '';
      if (isPracticeChallengeConfig(gameConfig) && challengeSeed) {
        initRunRng(challengeSeed);
      } else {
        clearRunRng();
      }

      const state = createGameState({
        p1Name,
        p2Name: displayP2Name,
        p1Points,
        p2Points,
        modeLabel,
        practiceMode: isPracticeMode,
        p1Human,
        p2Human,
        p3Human,
        p4Human,
        isTournament: false,
        aiTier,
        ffaAiTier: gameConfig.ffaAiTier
          ? normalizeAiTier(gameConfig.ffaAiTier as string)
          : undefined,
        convergenceMode: isConvergence,
        convergenceShrinkInterval,
        convergenceMinCols,
        convergenceMinRows,
        convergenceStepMs,
        powerupMode: isPowerup,
        teamMode,
        allowSoloSeatSwitch:
          !isPracticeChallengeConfig(gameConfig) &&
          teamMode === 'solo' &&
          p1Human !== p2Human &&
          !p3Human &&
          !p4Human,
      });
      stateRef.current = state;
      const endPreview = new URLSearchParams(window.location.search).get(
        'preview'
      );
      if (endPreview === 'local' || endPreview === 'freeplay') {
        state.gameStarted = true;
        state.gameEnded = true;
        state.winnerPlayer = 'P1';
        state.winnerName = state.p1Name || 'PLAYER 1';
      }
      winnerSentRef.current = false;
      if (isPracticeFreePlayConfig(gameConfig)) {
        quickMatchStartedAtRef.current = Date.now();
        quickMatchCompletedRef.current = false;
        freePlayEndPendingRef.current = false;
        freePlaySkipLatchRef.current = false;
        freePlaySkipFromPadRef.current = false;
        endCardInstantRef.current = false;
        suppressVictoryOverlayRef.current = false;
        setFreePlayEnd(false);
        setFreePlayEndFocus('again');
      }

      const hud = getHudState(state);
      setCaptureP1(hud.captureP1);
      setCaptureP2(hud.captureP2);
      captureP1Ref.current = hud.captureP1;
      captureP2Ref.current = hud.captureP2;
      setCurrentP1Width(hud.currentWidthP1);
      setCurrentP2Width(hud.currentWidthP2);
      setIsFfa(teamMode === 'ffa' || teamMode === '2v1');
      setIs2v1(teamMode === '2v1');
      if (hud.ffa?.players) {
        setFfaPlayers(hud.ffa.players);
        ffaCapturePrevRef.current = hud.ffa.players.map((p) => p.capture);
        ffaScorePrevRef.current = hud.ffa.players.map((p) => p.score);
      }
    }

    // Always sync React HUD (Strict Mode re-runs must not skip this).
    setPlayer1Name(p1Name);
    setPlayer2Name(displayP2Name);
    setPlayer1Img(optCfgStr(gameConfig.p1Picture) ?? '');
    setPlayer2Img(optCfgStr(gameConfig.p2Picture) ?? '');
    setP1Points(p1Points);
    setP2Points(p2Points);
    setGameInfo(modeLabel);
    setLoading(false);
    audioRef.current?.startMusic();
  }, []);

  useEffect(() => {
    return () => {
      localBootRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Ensure menu background music is stopped when entering gameplay.
    stop();
  }, [stop]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const endPreview = params.get('preview');
    if (endPreview === 'freeplay') {
      setFreePlayEndFocus('again');
      setFreePlayEnd(true);
    }
    if (endPreview === 'solo') {
      const lost = params.get('side') === 'loser';
      setLoading(false);
      setSoloEndData({
        won: !lost,
        name: 'NORMIE DUEL',
        bounty: 21,
        challengeId: 'preview',
        ...(lost
          ? {}
          : {
              claimToken: 'preview',
              noteTags: [],
              noteContent: [
                'I just beat the NORMIE DUEL challenge on',
                '@chainduel and got 21 sats ⚡',
                '',
                'Can you beat it?',
                'https://game.chainduel.net/',
                '',
                'Sign in with Nostr → pick a challenge → beat the',
                'bot → collect sats.',
              ].join('\n'),
            }),
      });
      setSoloZapOverlayVisible(true);
    }
  }, [location.search]);

  // Gate start-key input until the reveal animations have settled (~1.2 s after load).
  useEffect(() => {
    if (loading) {
      readyToStartRef.current = false;
      return;
    }
    readyToStartRef.current = false;
    const timer = window.setTimeout(() => {
      readyToStartRef.current = true;
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [loading]);

  // Challenge win: submit replay to server for validation + claim token.
  useEffect(() => {
    if (loading) return;
    let cfg: Record<string, unknown> = {};
    try {
      const r = sessionStorage.getItem('gameConfig');
      if (r) cfg = JSON.parse(r);
    } catch {
      /* ignore */
    }
    if (!isPracticeChallengeConfig(cfg)) return;

    const poll = window.setInterval(() => {
      const state = stateRef.current;
      if (!state?.gameEnded) return;
      const hasWinner =
        state.winnerPlayer !== null ||
        (isEliminationMode(state) && state.winnerName.length > 0);
      if (!hasWinner) return;
      window.clearInterval(poll);

      const won =
        state.winnerPlayer === 'P1' ||
        (state.winnerName.length > 0 && state.winnerName === state.p1Name);
      const name = String(cfg.soloChallengeName ?? 'CHALLENGE');
      const bounty = Number(cfg.soloBounty ?? 0);
      const runId = String(cfg.challengeRunId ?? '');
      const challengeId = String(cfg.challengeId ?? '');
      const base = { name, bounty, challengeId };

      if (!won) {
        setSoloEndData({ won: false, ...base });
        return;
      }

      if (challengeWinSubmittedRef.current) return;
      challengeWinSubmittedRef.current = true;
      void applyChallengeWinValidation({
        name,
        bounty,
        challengeId,
        runId,
      });
    }, 150);

    return () => window.clearInterval(poll);
  }, [applyChallengeWinValidation, loading, stateRef, socket]);

  useEffect(() => {
    if (!soloEndData || challengeCompletedReportedRef.current) return;
    challengeCompletedReportedRef.current = true;
    reportClientEvent(socket, 'client.challenge.completed', {
      challengeId: String(soloEndData.challengeId ?? ''),
      outcome: soloEndData.won ? 'win' : 'loss',
    });
  }, [soloEndData, socket]);

  useEffect(() => {
    const cfg = readSessionGameConfig();
    if (!isPracticeFreePlayConfig(cfg) || loading) return;

    let endTimer = 0;
    const poll = window.setInterval(() => {
      const state = stateRef.current;
      if (!state?.gameEnded || quickMatchCompletedRef.current) return;
      const hasWinner =
        state.winnerPlayer !== null ||
        (isEliminationMode(state) && state.winnerName.length > 0);
      if (!hasWinner) return;
      quickMatchCompletedRef.current = true;
      window.clearInterval(poll);

      freePlayEndPendingRef.current = true;
      blockChallengeContinueRef.current = true;
      suppressVictoryOverlayRef.current = false;
      endTimer = window.setTimeout(() => {
        freePlayEndTimerRef.current = 0;
        setFreePlayEndFocus('again');
        setFreePlayEnd(true);
      }, endOverlayActionsDelayMs(state.convergenceWallClosed));
      freePlayEndTimerRef.current = endTimer;

      const won =
        state.winnerPlayer === 'P1' ||
        (state.winnerName.length > 0 && state.winnerName === state.p1Name);
      const startedAt = quickMatchStartedAtRef.current ?? Date.now();
      reportClientEvent(socket, 'client.quickmatch.completed', {
        outcome: won ? 'win' : 'loss',
        durationMs: Date.now() - startedAt,
        mode: String(cfg.teamMode ?? 'solo'),
        opponentType: String(cfg.aiTier ?? 'unknown'),
      });
    }, 150);

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(endTimer);
      freePlayEndTimerRef.current = 0;
    };
  }, [loading, socket, stateRef]);

  blockChallengeContinueRef.current =
    Boolean(soloEndData?.validating) ||
    freePlayEndPendingRef.current ||
    freePlayEnd;
  challengeContinueLabelRef.current = soloEndData?.validating
    ? 'VALIDATING WIN ON SERVER…'
    : practiceSession.active && !practiceSession.isChallenge
      ? ''
      : null;

  useEffect(() => {
    audioRef.current?.applyAppMuteState(isMuted, isMusicMuted);
  }, [isMuted, isMusicMuted, loading]);

  useEffect(() => {
    const gameConfig = readSessionGameConfig();
    if (isExplicitPracticeSession(gameConfig)) {
      bootstrapLocalGame();
      return;
    }

    if (!socket || !connected) {
      const noSocketTimer = window.setTimeout(() => {
        if (loading && !stateRef.current) {
          bootstrapLocalGame();
        }
      }, GAME_BOOTSTRAP_TIMEOUT_MS);
      return () => window.clearTimeout(noSocketTimer);
    }
    if (!isSocketDuelSession()) {
      return;
    }
    socket.emit('getDuelInfos');
  }, [socket, connected, loading, bootstrapLocalGame]);

  const emitWinner = useCallback(
    (winner: 'P1' | 'P2') => {
      if (!socket) return;
      socket.emit(
        'gameFinished',
        winner === 'P1' ? PlayerRole.Player1 : PlayerRole.Player2
      );
    },
    [socket]
  );

  const handleSetGameHeader = useCallback(
    (info: {
      p1Name: string;
      p2Name: string;
      p1Picture: string;
      p2Picture: string;
      p1Points: number;
      p2Points: number;
      gameLabel: string;
      isTournament: boolean;
    }) => {
      setPlayer1Name(info.p1Name);
      setPlayer2Name(info.p2Name);
      setPlayer1Img(info.p1Picture);
      setPlayer2Img(info.p2Picture);
      setP1Points(info.p1Points);
      setP2Points(info.p2Points);
      setGameInfo(info.gameLabel);
    },
    []
  );

  const handleHudSync = useCallback(
    (hud: {
      captureP1: string;
      captureP2: string;
      initialWidthP1: number;
      initialWidthP2: number;
      currentWidthP1: number;
      currentWidthP2: number;
    }) => {
      setCaptureP1(hud.captureP1);
      setCaptureP2(hud.captureP2);
      captureP1Ref.current = hud.captureP1;
      captureP2Ref.current = hud.captureP2;
      setCurrentP1Width(hud.currentWidthP1);
      setCurrentP2Width(hud.currentWidthP2);
    },
    []
  );

  const handleLoadingResolved = useCallback(() => {
    setLoading(false);
    audioRef.current?.startMusic();
  }, []);

  const handlePointsUpdated = useCallback(
    (data: {
      players: Record<
        string,
        {
          value?: number;
          name?: string;
          picture?: string;
          nostrPubkey?: string;
          fallbackLabel?: string;
        }
      >;
    }) => {
      const p1 = data.players['Player 1'];
      const p2 = data.players['Player 2'];
      if (p1?.value != null) setP1Points(Math.floor(p1.value));
      if (p2?.value != null) setP2Points(Math.floor(p2.value));
      if (p1?.name?.trim()) {
        setPlayer1Name(formatHudPlayerName(p1, 'Player 1'));
      }
      if (p2?.name?.trim()) {
        setPlayer2Name(formatHudPlayerName(p2, 'Player 2'));
      }
      if (p1?.picture?.trim()) setPlayer1Img(String(p1.picture));
      if (p2?.picture?.trim()) setPlayer2Img(String(p2.picture));

      const state = stateRef.current;
      if (!state) return;
      if (p1?.value != null) state.score[0] = Math.floor(p1.value);
      if (p2?.value != null) state.score[1] = Math.floor(p2.value);
      if (applyTerminalGameOutcome(state)) {
        handleHudSync(getHudState(state));
      }
    },
    [handleHudSync]
  );

  const handleZapReceived = useCallback(
    (data: {
      username: string;
      content: string;
      amount: number;
      profile: string;
      scale: number;
    }) => {
      setZapMessages((prev) => [
        ...prev,
        {
          ...data,
          id: `zap-${Date.now()}-${prev.length}`,
        },
      ]);
    },
    []
  );

  const dismissZapMessage = useCallback((id: string) => {
    setZapMessages((prev) => prev.filter((zap) => zap.id !== id));
  }, []);

  const createRenderer = useCallback(() => new PixiGameRenderer(), []);

  const handleHudTick = useCallback(
    (hud: {
      p1Points: number;
      p2Points: number;
      captureP1: string;
      captureP2: string;
      currentWidthP1: number;
      currentWidthP2: number;
      ffa?: { players: FfaHudPlayer[] };
    }) => {
      setP1Points(hud.p1Points);
      setP2Points(hud.p2Points);
      setCaptureP1(hud.captureP1);
      setCaptureP2(hud.captureP2);
      setCurrentP1Width(hud.currentWidthP1);
      setCurrentP2Width(hud.currentWidthP2);
      if (hud.ffa?.players) {
        setFfaPlayers(hud.ffa.players);
        if (!is2v1) {
          const prev = ffaCapturePrevRef.current;
          const flashes = hud.ffa.players.map((p, i) => p.capture !== prev[i]);
          if (flashes.some(Boolean)) {
            setFfaCaptureHighlights(flashes);
            window.setTimeout(
              () => setFfaCaptureHighlights([false, false, false, false]),
              CAPTURE_POP_MS
            );
          }
          ffaCapturePrevRef.current = hud.ffa.players.map((p) => p.capture);

          const prevScores = ffaScorePrevRef.current;
          hud.ffa.players.forEach((p, i) => {
            if (p.score > (prevScores[i] ?? 0)) {
              handleFfaSatsCaptured(p.index, p.capture, p.color);
            }
          });
          ffaScorePrevRef.current = hud.ffa.players.map((p) => p.score);
        }
      }
    },
    [is2v1, handleFfaSatsCaptured]
  );

  const handleNavigateAfterFinish = useCallback(
    (isTourn: boolean) => {
      if (isTourn) {
        const mode = sessionStorage.getItem('tournamentMode');
        navigate(
          mode === 'tournamentnostr'
            ? '/tournbracket?mode=tournamentnostr'
            : '/tournbracket'
        );
        return;
      }
      // Return to relevant menu for local-only modes
      let gameConfig: Record<string, unknown> = {};
      try {
        const raw = sessionStorage.getItem('gameConfig');
        if (raw) gameConfig = JSON.parse(raw);
      } catch {
        // ignore
      }
      const configMode = String(gameConfig.mode ?? '').toUpperCase();
      if (isPracticeChallengeConfig(gameConfig)) {
        if (soloEndData?.validating) return;
        const challengeId =
          soloEndData?.challengeId ?? String(gameConfig.challengeId ?? '');
        const challengeWon = soloEndData?.won ?? false;
        if (challengeId) {
          saveChallengeMenuFocus(challengeId, challengeWon);
        }
        navigate(practiceHubExitPath(gameConfig));
        return;
      }
      if (isPracticeHubGameMode(configMode)) {
        navigate(practiceHubExitPath(gameConfig));
        return;
      }
      navigateToPostGame(navigate);
    },
    [navigate, soloEndData]
  );

  const confirmExitToMenu = useCallback(() => {
    navigate(practiceHubExitPath(readSessionGameConfig()));
  }, [navigate]);

  const revealFreePlayChoices = useCallback(() => {
    window.clearTimeout(freePlayEndTimerRef.current);
    freePlayEndTimerRef.current = 0;
    endCardInstantRef.current = true;
    setFreePlayEndFocus('again');
    setFreePlayEnd(true);
  }, []);

  const replayFreePlay = useCallback(() => {
    freePlayEndPendingRef.current = false;
    freePlaySkipLatchRef.current = false;
    freePlaySkipFromPadRef.current = false;
    endCardInstantRef.current = false;
    suppressVictoryOverlayRef.current = false;
    blockChallengeContinueRef.current = false;
    setFreePlayEnd(false);
    localBootRef.current = false;
    bootstrapLocalGame();
  }, [bootstrapLocalGame]);

  useEffect(() => {
    const isConfirm = (event: KeyboardEvent) =>
      event.key === 'Enter' || event.key === ' ';

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isConfirm(event)) return;
      if (freePlaySkipLatchRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        !freePlayEndPendingRef.current ||
        freePlayEndVisibleRef.current ||
        event.repeat
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      freePlaySkipLatchRef.current = true;
      freePlaySkipFromPadRef.current = isGamepadSyntheticKey(event);
      revealFreePlayChoices();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!isConfirm(event) || freePlaySkipFromPadRef.current) return;
      freePlaySkipLatchRef.current = false;
    };

    let frame = 0;
    const watchPadRelease = () => {
      if (
        freePlaySkipLatchRef.current &&
        freePlaySkipFromPadRef.current &&
        !isGamepadFaceHeld()
      ) {
        freePlaySkipLatchRef.current = false;
        freePlaySkipFromPadRef.current = false;
      }
      frame = window.requestAnimationFrame(watchPadRelease);
    };
    frame = window.requestAnimationFrame(watchPadRelease);

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [revealFreePlayChoices]);

  useEffect(() => {
    if (!freePlayEnd) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowUp' ||
        event.key === 'a' ||
        event.key === 'A'
      ) {
        event.preventDefault();
        setFreePlayEndFocus('again');
        return;
      }
      if (
        event.key === 'ArrowRight' ||
        event.key === 'ArrowDown' ||
        event.key === 'd' ||
        event.key === 'D'
      ) {
        event.preventDefault();
        setFreePlayEndFocus('menu');
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        if (freePlaySkipLatchRef.current) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (freePlayEndFocus === 'menu') confirmExitToMenu();
        else replayFreePlay();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [confirmExitToMenu, freePlayEnd, freePlayEndFocus, replayFreePlay]);

  useEffect(() => {
    if (!practiceSession.active || loading || soloEndData) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setShowExitOverlay((open) => {
          if (!open) setExitOverlayFocus('abort');
          return !open;
        });
        return;
      }

      if (!showExitOverlay) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.key === 'Enter' || event.key === ' ') {
        if (exitOverlayFocus === 'confirm') {
          confirmExitToMenu();
        } else {
          setShowExitOverlay(false);
        }
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        setExitOverlayFocus('abort');
        return;
      }

      if (
        event.key === 'ArrowRight' ||
        event.key === 'd' ||
        event.key === 'D'
      ) {
        setExitOverlayFocus('confirm');
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    confirmExitToMenu,
    exitOverlayFocus,
    practiceSession.active,
    loading,
    showExitOverlay,
    soloEndData,
  ]);

  useGameSocketEvents({
    socket,
    loading,
    ignoreSocketSessionUpdates,
    stateRef,
    localBootRef,
    winnerSentRef,
    onSetGameHeader: handleSetGameHeader,
    onHudSync: handleHudSync,
    onLoadingResolved: handleLoadingResolved,
    onBootstrapFallback: bootstrapLocalGame,
    onRedirectToPostGame: () => navigateToPostGame(navigate, { replace: true }),
    onPointsUpdated: handlePointsUpdated,
    onZapReceived: handleZapReceived,
  });

  useGameRenderBridge({
    loading,
    stateRef,
    rendererRef,
    audioRef,
    hostRef,
    winnerSentRef,
    captureP1Ref,
    captureP2Ref,
    createRenderer,
    emitWinner,
    onHudTick: handleHudTick,
    onCaptureChanged: handleCaptureTierChanged,
    onSatsCaptured: handleSatsCaptured,
    simStepRef: isChallengeSession ? simStepRef : undefined,
    challengeInputLogRef: isChallengeSession ? challengeInputLogRef : undefined,
    challengeContinueLabelRef:
      isChallengeSession ||
      (practiceSession.active && !practiceSession.isChallenge)
        ? challengeContinueLabelRef
        : undefined,
    suppressVictoryOverlayRef,
    canvasObjectivesRef,
    heldInputRef,
  });

  const handleSoloSeatSwapped = useCallback((result: SoloSeatSwapResult) => {
    setPlayer1Name(result.p1Name);
    setPlayer2Name(result.p2Name);
    const state = stateRef.current;
    if (!state) return;
    const humanSlot = state.meta.p1Human ? 'p1' : 'p2';
    const hint = soloSeatSwitchHint(state);
    const startPrompt = localStartPromptWords(
      state.meta.p1Human,
      state.meta.p2Human
    );
    canvasObjectivesRef.current = {
      controlSlots: [humanSlot],
      startPromptWords: startPrompt.words,
      ...(startPrompt.altWords
        ? { startPromptAltWords: startPrompt.altWords }
        : {}),
      ...(hint ? { startPromptSubtext: hint } : {}),
    };
  }, []);

  useGameInputBindings({
    stateRef,
    winnerSentRef,
    onEmitWinner: emitWinner,
    onNavigateAfterFinish: handleNavigateAfterFinish,
    readyToStartRef,
    blockContinueAfterGameRef:
      isChallengeSession || practiceSession.active
        ? blockChallengeContinueRef
        : undefined,
    heldInputRef,
    onSoloSeatSwapped: handleSoloSeatSwapped,
  });

  if (
    endPreview === 'local' ||
    endPreview === 'freeplay' ||
    endPreview === 'h2h' ||
    endPreview === 'p2p'
  ) {
    const h2h = endPreview === 'h2h';
    const p2p = endPreview === 'p2p';
    const previewParams = new URLSearchParams(window.location.search);
    const previewLoser = previewParams.get('side') === 'loser';
    const p2pNostr =
      previewParams.get('nostr') === '1' ||
      previewParams.get('nostr') === 'true';
    const p2pDon = previewParams.get('don');
    const p2pDonMark =
      p2pDon === '4' ? '*4' : p2pDon === '2' || p2pDon === '1' ? '*2' : '';
    const p2pSats =
      p2pDonMark === '*4'
        ? '200,000 SATS'
        : p2pDonMark === '*2'
          ? '100,000 SATS'
          : '50,000 SATS';
    return (
      <div className="match-end-layer">
        {previewLoser ? null : (
          <SoloZapRadiatingLines className="end-screen-rays match-end-layer__rays" />
        )}
        <header id="brand">
          <h2 id="chain">CHAIN</h2>
          <h2 id="duel">DUEL</h2>
        </header>
        <div className="match-end-card">
          <Sponsorship id="sponsorship-match-end" />
          <p className="match-end-card__kicker">
            {p2p
              ? `${p2pNostr ? 'P2PNOSTR' : 'P2P'}${p2pDonMark} / MATCH COMPLETE`
              : h2h
                ? 'HUMAN VS HUMAN / MATCH COMPLETE'
                : 'PRACTICE · 1v1 · CVG / MATCH COMPLETE'}
          </p>
          <p className="match-end-card__name">
            {p2p
              ? previewLoser
                ? 'HAL'
                : 'SATOSHI'
              : previewLoser
                ? 'PLAYER 2'
                : 'PLAYER 1'}
          </p>
          <p className="match-end-card__wins">WINS</p>
          {endPreview === 'freeplay' ? (
            <div className="match-end-card__free">
              <p className="match-end-card__sats">FREE GAME</p>
              <p className="match-end-card__note">NO SATS WON</p>
            </div>
          ) : (
            <p className="match-end-card__sats">
              {p2p ? p2pSats : h2h ? '200,000 SATS' : '2,000 SATS'}
            </p>
          )}
          {endPreview !== 'freeplay' ? (
            <p className="match-end-card__prompt">
              PRESS ANY BUTTON TO CONTINUE
            </p>
          ) : null}
        </div>
        {endPreview === 'freeplay' ? (
          <div className="match-end-preview__actions">
            <Button type="button" className="button" glowing>
              Play again
            </Button>
            <Button
              type="button"
              className="button"
              onClick={() => navigate('/practice')}
            >
              Freeplay menu
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div id="game-bg-overlay" aria-hidden="true" />
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <h1 id="tournament-name" className="hero-outline in-game hide">
        The Merkle Tree
      </h1>

      <div
        id="gameContainer"
        className={`flex full game ${loading ? 'hide' : ''}`}
      >
        <div
          className={
            showFfaUi
              ? 'game-hud-ffa-wrap'
              : show2v1Ui
                ? 'game-hud-2v1-wrap'
                : undefined
          }
        >
          {showFfaUi ? (
            <>
              <FfaHud
                players={ffaPlayers}
                gameInfo={gameInfo}
                challengeHud={challengeHud}
                captureHighlights={ffaCaptureHighlights}
                barCaptureHit={ffaBarCaptureHit}
                satsSurge={ffaSatsSurge}
              />
              <div id="zapMessages">
                {zapMessages.map((zap) => (
                  <div
                    key={zap.id}
                    className="zapMessage"
                    style={
                      {
                        '--zap-scale': zap.scale,
                      } as CSSProperties
                    }
                    onAnimationEnd={() => dismissZapMessage(zap.id)}
                  >
                    <div className="zapMessageInner">
                      <img src={zap.profile} alt="" />
                      <div className="zapText">
                        <div className="zapUser">{zap.username}</div>
                        <div className="zapContent condensed">
                          {zap.content}
                        </div>
                        <div className="zapAmount">
                          {zap.amount.toLocaleString()} sats
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex players">
                <div id="player1info" className="condensed">
                  <div className="inline playerSquare white" />
                  <img
                    className={`inline playerImg ${canShowP1Image ? '' : 'hide'}`}
                    id="player1Img"
                    src={player1Img || '/images/loading.gif'}
                  />
                  <div className="inline" id="player1name">
                    {player1Name}
                  </div>
                </div>
                <GameInfoLabel
                  id="gameInfo"
                  gameInfo={gameInfo}
                  challenge={challengeHud}
                />
                <div
                  id="player2info"
                  className={`condensed${show2v1Ui ? ' game-2v1-ai-info' : ''}`}
                >
                  {show2v1Ui ? (
                    <div className="game-2v1-ai-team">
                      {[aiHud1, aiHud2].map(
                        (ai) =>
                          ai && (
                            <div key={ai.index} className="game-2v1-ai-slot">
                              <div className="game-2v1-ai-name-row">
                                <span className="game-2v1-ai-name">
                                  {ai.name}
                                </span>
                                <span
                                  className="game-2v1-ai-swatch"
                                  style={{ background: ai.color }}
                                  aria-hidden
                                />
                              </div>
                              <div className="game-2v1-capture-row">
                                capture{' '}
                                <span className="capturingAmount">
                                  {ai.capture}
                                </span>
                              </div>
                            </div>
                          )
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="inline" id="player2name">
                        {player2Name}
                      </div>
                      <img
                        className={`inline playerImg ${canShowP2Image ? '' : 'hide'}`}
                        id="player2Img"
                        src={player2Img || '/images/loading.gif'}
                      />
                      <div className="inline playerSquare black" />
                    </>
                  )}
                </div>

                <div id="zapMessages">
                  {zapMessages.map((zap) => (
                    <div
                      key={zap.id}
                      className="zapMessage"
                      style={
                        {
                          '--zap-scale': zap.scale,
                        } as CSSProperties
                      }
                      onAnimationEnd={() => dismissZapMessage(zap.id)}
                    >
                      <div className="zapMessageInner">
                        <img src={zap.profile} alt="" />
                        <div className="zapText">
                          <div className="zapUser">{zap.username}</div>
                          <div className="zapContent condensed">
                            {zap.content}
                          </div>
                          <div className="zapAmount">
                            {zap.amount.toLocaleString()} sats
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="game-hud-stakes"
                style={captureFeedbackStyleFromCtx({ captureP1, captureP2 })}
              >
                <div className="gameState">
                  <div id="capturing">
                    <div
                      id="capturingP1"
                      className={
                        captureRowFlash === 'P1'
                          ? 'capture-row--flash'
                          : undefined
                      }
                    >
                      <span
                        id="capturingP1Amount"
                        className={`capturingAmount ${captureP1Highlight ? 'highlight' : ''}`}
                      >
                        {captureP1}
                      </span>{' '}
                      capture
                    </div>
                    <div
                      id="capturingP2"
                      className={
                        captureRowFlash === 'P2'
                          ? 'capture-row--flash'
                          : show2v1Ui
                            ? 'game-2v1-captures'
                            : undefined
                      }
                    >
                      capture{' '}
                      <span
                        id="capturingP2Amount"
                        className={`capturingAmount ${captureP2Highlight ? 'highlight' : ''}`}
                      >
                        {captureP2}
                      </span>
                    </div>
                  </div>

                  <div id="distributions">
                    <div
                      id="currentDistribution"
                      className={`distributionBarOutter${
                        barCaptureHit?.side === 'P1'
                          ? ' distribution-track--p1-outer-glow'
                          : ''
                      }`}
                      style={distributionTrackFeedbackStyle(
                        { captureP1, captureP2 },
                        currentP1Width
                      )}
                    >
                      <div
                        id="currentDistributionP1"
                        className={`distributionBar${
                          barCaptureHit?.side === 'P1'
                            ? ' distribution-bar--capture-hit'
                            : ''
                        }`}
                        style={{
                          width: `${currentP1Width}%`,
                          ...(barCaptureHit?.side === 'P1'
                            ? captureHitStyleVars(barCaptureHit.intensity)
                            : {}),
                        }}
                      />
                      <div
                        id="currentDistributionP2"
                        className={`distributionBar${
                          barCaptureHit?.side === 'P2'
                            ? ' distribution-bar--capture-hit'
                            : ''
                        }`}
                        style={{
                          width: `${currentP2Width}%`,
                          ...(barCaptureHit?.side === 'P2'
                            ? captureHitStyleVars(barCaptureHit.intensity)
                            : {}),
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex points">
                  <div
                    className={`player-sats player-sats-p1${
                      satsSurge === 'P1' ? ' player-sats--surge' : ''
                    }`}
                  >
                    <span id="p1Points" className="condensed">
                      {p1Points.toLocaleString()}
                    </span>{' '}
                    <span className="grey">sats</span>
                  </div>
                  <Sponsorship id="sponsorshipGame" showLabel={false} />
                  <div
                    className={`player-sats player-sats-p2${
                      satsSurge === 'P2' ? ' player-sats--surge' : ''
                    }`}
                  >
                    <span className="grey">sats</span>{' '}
                    <span id="p2Points" className="condensed">
                      {p2Points.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          <div id="gameCanvas" className={canvasHighlight ? 'highlight' : ''}>
            <div id="gameCanvasHost" ref={hostRef} />
            <MatchStartPrompt
              getState={() => stateRef.current}
              optsRef={canvasObjectivesRef}
            />
            <MatchEndCard
              getState={() => stateRef.current}
              suppressedRef={suppressVictoryOverlayRef}
              continueLabelRef={challengeContinueLabelRef}
              instantRef={endCardInstantRef}
              hidden={soloZapOverlayVisible}
            />
          </div>

          {isPowerupMode && <PowerUpLegend />}

          <MempoolFooter
            bitcoin={bitcoin}
            highlight={footerHighlight}
            withGameElementIds
          />
        </div>
      </div>

      <div className="bracketDetails in-game hide">
        <div className="bracketDetail" id="bracketDetailPlayers">
          <div className="label">Players</div>
          <div className="value players">
            <h3 id="numberOfPlayers">4</h3>
          </div>
        </div>

        <div className="bracketDetail" id="bracketDetailFinalPrize">
          <div className="label">Final Prize</div>
          <div className="value">
            <h3 id="bracketFinalPrize">400,000</h3> <span>sats</span>
          </div>
        </div>

        <div className="bracketDetail" id="bracketDetailBuyIn">
          <div className="label">Buy In</div>
          <div className="value">
            <h3 id="buyinvalue2">100,000</h3> <span>sats</span>
          </div>
        </div>
      </div>

      <div className={`overlay ${loading ? '' : 'hide'}`} id="loading">
        <img src="/images/loading.gif" alt="Loading" />
      </div>

      {practiceSession.active && showExitOverlay ? (
        <div
          className="overlay"
          id="practiceExit"
          role="dialog"
          aria-modal="true"
          aria-label="Leave practice game"
        >
          <div className="warning">
            <div className="warning-inner">
              <h2 className="warning-title condensed">Leave game?</h2>
              <div className="warning-text">
                {practiceSession.isChallenge
                  ? 'Return to the challenges list?'
                  : 'Return to the practice menu?'}
              </div>
            </div>
            <div className="warning-actions">
              <Button
                className="button half"
                type="button"
                glowing={exitOverlayFocus === 'abort'}
                onClick={() => setShowExitOverlay(false)}
              >
                No
              </Button>
              <Button
                className="button half"
                type="button"
                glowing={exitOverlayFocus === 'confirm'}
                onClick={confirmExitToMenu}
              >
                Yes
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {freePlayEnd ? (
        <div
          className="overlay free-play-end free-play-end--actions"
          role="dialog"
          aria-modal="true"
          aria-label="Free play complete"
        >
          <div className="free-play-end__actions">
            <Button
              type="button"
              className="button"
              glowing={freePlayEndFocus === 'again'}
              onClick={replayFreePlay}
            >
              Play again
            </Button>
            <Button
              type="button"
              className="button"
              glowing={freePlayEndFocus === 'menu'}
              onClick={confirmExitToMenu}
            >
              Freeplay menu
            </Button>
          </div>
        </div>
      ) : null}

      {soloEndData?.won && soloZapOverlayVisible
        ? createPortal(
            <SoloZapRadiatingLines className="solo-zap-overlay__radiating-lines solo-zap-overlay__radiating-lines--back" />,
            document.querySelector('.page-reveal-scope--gameplay') ??
              document.body
          )
        : null}

      {soloEndData && soloZapOverlayVisible && (
        <div
          className={`solo-zap-overlay${
            soloEndData.won
              ? ' solo-zap-overlay--win'
              : ' solo-zap-overlay--lose'
          }`}
          data-challenge={soloEndData.challengeId}
          data-rank={soloChallengeTheme.rank}
          style={soloZapThemeVars}
          role="dialog"
          aria-modal="true"
          aria-label={soloEndData.won ? 'Challenge complete' : 'Game over'}
        >
          <div
            className="solo-zap-card"
            data-challenge={soloEndData.challengeId}
            data-rank={soloChallengeTheme.rank}
            style={soloZapThemeVars}
          >
            <div className="solo-zap-card__content">
              <p className="match-end-card__kicker">{soloEndData.name}</p>
              {soloEndData.won ? (
                <>
                  <div className="solo-zap-profile solo-zap-profile--winner">
                    <div className="solo-zap-profile__identity">
                      <img
                        className="solo-zap-profile__avatar"
                        src={
                          nostrSession.signedIn &&
                          !noteAuthorAvatarBroken &&
                          noteAuthorAvatar
                            ? noteAuthorAvatar
                            : '/images/social/Nostr.png'
                        }
                        alt=""
                        width={56}
                        height={56}
                        onError={() => setNoteAuthorAvatarBroken(true)}
                      />
                      <h2 className="match-end-card__name">
                        {nostrSession.signedIn
                          ? noteAuthorName
                          : soloEndData.challengeId === 'preview'
                            ? 'SATOSHI'
                            : 'YOU'}
                      </h2>
                    </div>
                    <p className="match-end-card__wins">
                      <span className="match-end-card__wins-word">
                        {nostrSession.signedIn ||
                        soloEndData.challengeId === 'preview'
                          ? 'WINS'
                          : 'WIN'}
                      </span>{' '}
                      {soloEndData.bounty.toLocaleString()} SATS
                    </p>
                  </div>

                  {soloEndData.validating ? (
                    <p className="solo-zap-note-label solo-zap-note-label--validating">
                      CHECKING YOUR WIN ON THE SERVER…
                    </p>
                  ) : soloEndData.validationError ? (
                    <>
                      <p className="solo-zap-note-err">
                        {formatChallengeValidationError(
                          soloEndData.validationError
                        )}
                      </p>
                      {soloZapRetryValidationVisible ? (
                        <Button
                          ref={soloZapRetryValidationRef}
                          data-solo-zap-nav="retryValidation"
                          type="button"
                          tabIndex={soloZapFocus === 'retryValidation' ? 0 : -1}
                          className={soloZapButtonClass(
                            'retryValidation',
                            'practice-start solo-zap-post-btn'
                          )}
                          onFocus={() => setSoloZapFocus('retryValidation')}
                          onClick={() => {
                            retryValidation();
                          }}
                        >
                          RETRY VERIFICATION
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <div className="solo-zap-note-section">
                      <p
                        className={`solo-zap-note-label${
                          canForfeitUnclaimedPrize
                            ? ' solo-zap-note-label--pulse'
                            : ''
                        }`}
                      >
                        POST THIS NOTE TO CLAIM YOUR ZAP
                      </p>
                      {resolveSignerMode() === 'nip46' &&
                      (noteState === 'posting' || noteState === 'zapping') ? (
                        <p className="solo-zap-note-label">
                          Approve in your Nostr app (Primal / Amber)…
                        </p>
                      ) : null}
                      {nostrSession.pendingNip46AuthUrl &&
                      (noteState === 'posting' || noteState === 'zapping') ? (
                        <Button
                          ref={soloZapOpenPrimalRef}
                          data-solo-zap-nav="openPrimal"
                          type="button"
                          tabIndex={soloZapFocus === 'openPrimal' ? 0 : -1}
                          className={soloZapButtonClass(
                            'openPrimal',
                            'practice-start solo-zap-post-btn'
                          )}
                          onFocus={() => setSoloZapFocus('openPrimal')}
                          onClick={() => {
                            window.open(
                              nostrSession.pendingNip46AuthUrl!,
                              '_blank',
                              'noopener,noreferrer'
                            );
                            nostrSession.clearPendingNip46AuthUrl();
                          }}
                        >
                          OPEN PRIMAL TO APPROVE
                        </Button>
                      ) : null}
                      <div className="solo-zap-note-preview">
                        <p className="solo-zap-note-text">
                          {noteContentDisplay}
                        </p>
                        {soloEndData.claimToken &&
                        (nostrSession.signedIn ||
                          soloEndData.challengeId === 'preview') ? (
                          <div className="solo-zap-note-preview__actions">
                            {noteState === 'posted' && soloEndData.zapPaid ? (
                              <p className="solo-zap-note-ok solo-zap-note-ok--in-note">
                                ✓ Note posted — zap sent ⚡
                              </p>
                            ) : noteState === 'posted' ? (
                              <>
                                <p className="solo-zap-note-ok solo-zap-note-ok--in-note">
                                  ✓ Note posted
                                </p>
                                <p className="solo-zap-note-err solo-zap-note-err--in-note">
                                  Zap pending
                                  {soloEndData.zapReason
                                    ? `: ${soloEndData.zapReason}`
                                    : ''}
                                </p>
                                <Button
                                  ref={soloZapRetryRef}
                                  data-solo-zap-nav="retryZap"
                                  type="button"
                                  tabIndex={
                                    soloZapFocus === 'retryZap' ? 0 : -1
                                  }
                                  className={soloZapButtonClass(
                                    'retryZap',
                                    'practice-start solo-zap-post-btn'
                                  )}
                                  onFocus={() => setSoloZapFocus('retryZap')}
                                  onClick={() => {
                                    void retryZap();
                                  }}
                                >
                                  RETRY ZAP
                                </Button>
                              </>
                            ) : (
                              <Button
                                ref={soloZapClaimRef}
                                data-solo-zap-nav="claim"
                                type="button"
                                tabIndex={soloZapFocus === 'claim' ? 0 : -1}
                                className={soloZapButtonClass(
                                  'claim',
                                  'practice-start solo-zap-post-btn'
                                )}
                                onFocus={() => setSoloZapFocus('claim')}
                                disabled={
                                  noteState === 'posting' ||
                                  noteState === 'zapping'
                                }
                                onClick={() => {
                                  void postBountyNote();
                                }}
                              >
                                {noteState === 'posting' ||
                                noteState === 'zapping' ? (
                                  <>
                                    <svg
                                      className="solo-zap-post-spinner"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      aria-hidden
                                    >
                                      <circle
                                        cx="12"
                                        cy="12"
                                        r="9"
                                        strokeOpacity="0.15"
                                      />
                                      <path d="M12 3a9 9 0 0 1 9 9" />
                                    </svg>
                                    {resolveSignerMode() === 'nip46'
                                      ? 'WAITING FOR APPROVAL…'
                                      : noteState === 'zapping'
                                        ? 'ZAPPING…'
                                        : 'SIGNING…'}
                                  </>
                                ) : (
                                  'POST ON NOSTR AND CLAIM PRIZE'
                                )}
                              </Button>
                            )}
                          </div>
                        ) : null}
                      </div>

                      {soloEndData.claimToken &&
                      soloEndData.challengeId !== 'preview' ? (
                        !nostrSession.signedIn ? (
                          <>
                            <p className="solo-zap-note-label">
                              SIGN IN WITH NOSTR TO CLAIM YOUR ZAP
                            </p>
                            <Button
                              ref={soloZapSignInRef}
                              data-solo-zap-nav="signIn"
                              type="button"
                              tabIndex={soloZapFocus === 'signIn' ? 0 : -1}
                              className={soloZapButtonClass(
                                'signIn',
                                'practice-start solo-zap-post-btn'
                              )}
                              onFocus={() => setSoloZapFocus('signIn')}
                              onClick={() => {
                                navigate('/config', {
                                  state: { returnTo: '/game' },
                                });
                              }}
                            >
                              SIGN IN WITH NOSTR
                            </Button>
                          </>
                        ) : null
                      ) : null}
                      {noteState === 'error' && noteError ? (
                        <p className="solo-zap-note-err">{noteError}</p>
                      ) : null}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="solo-zap-profile solo-zap-profile--winner">
                    <div className="solo-zap-profile__identity">
                      <img
                        className="solo-zap-profile__avatar"
                        src={
                          nostrSession.signedIn &&
                          !noteAuthorAvatarBroken &&
                          noteAuthorAvatar
                            ? noteAuthorAvatar
                            : '/images/social/Nostr.png'
                        }
                        alt=""
                        width={56}
                        height={56}
                        onError={() => setNoteAuthorAvatarBroken(true)}
                      />
                      <h2 className="match-end-card__name">
                        {nostrSession.signedIn
                          ? noteAuthorName
                          : soloEndData.challengeId === 'preview'
                            ? 'SATOSHI'
                            : 'YOU'}
                      </h2>
                    </div>
                    <p className="match-end-card__wins">
                      <span className="match-end-card__wins-word">LOST</span>
                    </p>
                  </div>
                  <div className="match-end-card__free">
                    <p className="match-end-card__sats">0 SATS</p>
                    <p className="match-end-card__note">
                      MISSED {soloEndData.bounty.toLocaleString()} SATS
                    </p>
                  </div>

                  <div className="solo-zap-receipt">
                    <div className="solo-zap-row">
                      <span className="solo-zap-value solo-zap-value--tip">
                        Study the AI pattern and try again
                      </span>
                    </div>
                  </div>
                </>
              )}

              {!soloEndData.validating && (
                <div className="solo-zap-footer">
                  <Button
                    ref={soloZapMenuRef}
                    data-solo-zap-nav="menu"
                    type="button"
                    tabIndex={soloZapFocus === 'menu' ? 0 : -1}
                    className={soloZapButtonClass(
                      'menu',
                      `solo-zap-footer-btn${
                        canForfeitUnclaimedPrize
                          ? ' solo-zap-footer-btn--subtle practice-back'
                          : ' practice-start'
                      }`
                    )}
                    onFocus={() => setSoloZapFocus('menu')}
                    onClick={() => {
                      if (canForfeitUnclaimedPrize) {
                        forfeitClaimAndExit();
                      } else {
                        exitSoloEndOverlay();
                      }
                    }}
                  >
                    {soloZapMenuLabel}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
