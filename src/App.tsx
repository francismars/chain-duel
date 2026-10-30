import { lazy, useEffect, type ComponentType } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router';
import { AudioProvider } from './contexts/AudioContext';
import { NostrSessionProvider } from './contexts/NostrSessionContext';
import { SocketProvider } from './contexts/SocketContext';
import { CornerControls } from './components/ui/CornerControls';
import { TouchMatchFrame } from './features/game/TouchMatchFrame';
import { PageRevealOutlet } from './components/layout/PageRevealOutlet';
import { useClientTelemetry } from './hooks/useClientTelemetry';
import { useKeyboardLayoutAutodetect } from './hooks/useKeyboardLayoutAutodetect';
import Index from './pages/Index';
import { LegacyPracticeRedirect } from './pages/LegacyPracticeRedirect';
import './styles/index.css';

const loadPracticeHub = () => import('./pages/PracticeHub');
const loadP2pEntry = () => import('./pages/P2pEntry');
const loadOnlineRooms = () => import('./pages/OnlineRooms');

const GameMenu = lazy(() => import('./pages/GameMenu'));
const PracticeHub = lazy(loadPracticeHub);
const P2pEntry = lazy(loadP2pEntry);
const TournamentLobby = lazy(() => import('./pages/TournamentLobby'));
const TournamentBracket = lazy(() => import('./pages/TournamentBracket'));
const Game = lazy(() => import('./pages/Game'));
const PostGame = lazy(() => import('./pages/PostGame'));
const Highscores = lazy(() => import('./pages/Highscores'));
const About = lazy(() => import('./pages/About'));
const Config = lazy(() => import('./pages/Config'));
const OnlineRoom = lazy(() => import('./pages/OnlineRoom'));
const OnlineRooms = lazy(loadOnlineRooms);

/**
 * UI labs (`/preview` and the debug menu). On for `npm run dev`.
 * A production build includes them only when VITE_ENABLE_PREVIEW=true,
 * so the lab chunks are left out of the deployed bundle otherwise.
 */
const previewLabsEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_PREVIEW === 'true';

function lazyNamed<Module extends Record<string, ComponentType>>(
  load: () => Promise<Module>,
  name: keyof Module & string
) {
  return lazy(() => load().then((mod) => ({ default: mod[name] })));
}

const UiDebugIndex = previewLabsEnabled
  ? lazy(() => import('./pages/UiDebugIndex'))
  : null;
const MatchTriggerLab = previewLabsEnabled
  ? lazy(() => import('./pages/MatchTriggerLab'))
  : null;
const OnlineFinishPreview = previewLabsEnabled
  ? lazy(() => import('./pages/OnlineFinishPreview'))
  : null;
const OnlineSeatPreview = previewLabsEnabled
  ? lazy(() => import('./pages/OnlineSeatPreview'))
  : null;
const OnlinePostGame = previewLabsEnabled
  ? lazy(() => import('./pages/OnlinePostGame'))
  : null;
const P2pSettingsPreviewB = previewLabsEnabled
  ? lazyNamed(() => import('./pages/uiDebugLayouts'), 'P2pSettingsPreviewB')
  : null;
const FreePlaySettingsPreviewB = previewLabsEnabled
  ? lazyNamed(
      () => import('./pages/uiDebugLayouts'),
      'FreePlaySettingsPreviewB'
    )
  : null;
const P2pPaymentPreviewB = previewLabsEnabled
  ? lazyNamed(() => import('./pages/uiDebugLayouts'), 'P2pPaymentPreviewB')
  : null;

function LegacyNetworkRedirect() {
  const { pathname, search } = useLocation();
  return (
    <Navigate
      to={`${pathname.replace(/^\/network/, '/online')}${search}`}
      replace
    />
  );
}

/** Home's three primary buttons. Same loaders as the routes, so idle prefetch hits those chunks. */
function usePrefetchHomeRoutes() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname !== '/') return;
    const run = () => {
      void loadPracticeHub();
      void loadP2pEntry();
      void loadOnlineRooms();
    };
    if (typeof window.requestIdleCallback !== 'function') {
      const timeoutId = window.setTimeout(run, 1);
      return () => window.clearTimeout(timeoutId);
    }
    const idleId = window.requestIdleCallback(run, { timeout: 2000 });
    return () => window.cancelIdleCallback(idleId);
  }, [pathname]);
}

function AppRoutes() {
  useClientTelemetry();
  useKeyboardLayoutAutodetect();
  usePrefetchHomeRoutes();
  return (
    <Routes>
      <Route element={<PageRevealOutlet />}>
        {/* Home & game flow */}
        <Route path="/" element={<Index />} />
        <Route path="/gamemenu" element={<GameMenu />} />
        <Route
          path="/game"
          element={
            <TouchMatchFrame>
              <Game />
            </TouchMatchFrame>
          }
        />
        <Route path="/postgame" element={<PostGame />} />

        {/* Practice hub: canonical /practice; legacy aliases */}
        <Route path="/practice" element={<PracticeHub />} />
        <Route path="/local" element={<LegacyPracticeRedirect />} />
        <Route path="/regtest" element={<LegacyPracticeRedirect />} />
        <Route path="/testnet" element={<LegacyPracticeRedirect />} />
        <Route
          path="/solo"
          element={<Navigate to="/practice?play=challenges" replace />}
        />

        {/* P2P tournament (paid entry + lobby + bracket) */}
        <Route path="/p2p" element={<P2pEntry />} />
        <Route path="/testnet-entry" element={<Navigate to="/p2p" replace />} />
        <Route path="/tournlobby" element={<TournamentLobby />} />
        <Route path="/tournbracket" element={<TournamentBracket />} />

        {/* Meta */}
        <Route path="/highscores" element={<Highscores />} />
        <Route path="/about" element={<About />} />
        <Route path="/config" element={<Config />} />

        {/* Online (legacy /network/* redirects preserve query strings) */}
        <Route path="/online" element={<OnlineRooms />} />
        <Route path="/online/r/:roomCode" element={<OnlineRoom />} />
        {UiDebugIndex &&
        MatchTriggerLab &&
        P2pSettingsPreviewB &&
        FreePlaySettingsPreviewB &&
        P2pPaymentPreviewB &&
        OnlineFinishPreview &&
        OnlineSeatPreview &&
        OnlinePostGame ? (
          <>
            <Route path="/preview" element={<UiDebugIndex />} />
            <Route
              path="/preview/match-triggers"
              element={<MatchTriggerLab />}
            />
            <Route
              path="/preview/p2p-settings-b"
              element={<P2pSettingsPreviewB />}
            />
            <Route
              path="/preview/freeplay-settings-b"
              element={<FreePlaySettingsPreviewB />}
            />
            <Route
              path="/preview/p2p-payment-b"
              element={<P2pPaymentPreviewB />}
            />
            <Route
              path="/preview/online-finish"
              element={<OnlineFinishPreview />}
            />
            <Route
              path="/preview/online-seat"
              element={<OnlineSeatPreview />}
            />
            <Route
              path="/preview/online-results"
              element={<OnlinePostGame />}
            />
            <Route path="/preview/online-don" element={<OnlinePostGame />} />
          </>
        ) : null}
        <Route path="/network/*" element={<LegacyNetworkRedirect />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AudioProvider>
      <SocketProvider>
        <NostrSessionProvider>
          <BrowserRouter>
            <CornerControls />
            <AppRoutes />
          </BrowserRouter>
        </NostrSessionProvider>
      </SocketProvider>
    </AudioProvider>
  );
}

export default App;
