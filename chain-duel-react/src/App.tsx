import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AudioProvider } from './contexts/AudioContext';
import { CornerControls } from './components/ui/CornerControls';
import { PageRevealOutlet } from './components/layout/PageRevealOutlet';
import Index from './pages/Index';
import GameMenu from './pages/GameMenu';
import PracticeHub from './pages/PracticeHub';
import { LegacyPracticeRedirect } from './pages/LegacyPracticeRedirect';
import P2pEntry from './pages/P2pEntry';
import TournamentLobby from './pages/TournamentLobby';
import TournamentBracket from './pages/TournamentBracket';
import Game from './pages/Game';
import PostGame from './pages/PostGame';
import Highscores from './pages/Highscores';
import About from './pages/About';
import Config from './pages/Config';
import OnlineRooms from './pages/OnlineRooms';
import OnlineRoomLobby from './pages/OnlineRoomLobby';
import OnlineGame from './pages/OnlineGame';
import OnlinePostGame from './pages/OnlinePostGame';
import './styles/index.css';

function LegacyNetworkRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={`${pathname.replace(/^\/network/, '/online')}${search}`} replace />;
}

function App() {
  return (
    <AudioProvider>
      <BrowserRouter>
        <CornerControls />
        <Routes>
          <Route element={<PageRevealOutlet />}>
            {/* Home & game flow */}
            <Route path="/" element={<Index />} />
            <Route path="/gamemenu" element={<GameMenu />} />
            <Route path="/game" element={<Game />} />
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
            <Route path="/online/lobby" element={<OnlineRoomLobby />} />
            <Route path="/online/game" element={<OnlineGame />} />
            <Route path="/online/postgame" element={<OnlinePostGame />} />
            <Route path="/network/*" element={<LegacyNetworkRedirect />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AudioProvider>
  );
}

export default App;
