import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AudioProvider } from './contexts/AudioContext';
import { CornerControls } from './components/ui/CornerControls';
import { PageRevealOutlet } from './components/layout/PageRevealOutlet';
import Index from './pages/Index';
import GameMenu from './pages/GameMenu';
import TestnetHub from './pages/TestnetHub';
import TestnetEntry from './pages/TestnetEntry';
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

            {/* Regtest hub: canonical /regtest; /testnet and /solo are legacy aliases */}
            <Route path="/regtest" element={<TestnetHub />} />
            <Route path="/testnet" element={<Navigate to="/regtest" replace />} />
            <Route path="/solo" element={<Navigate to="/regtest" replace />} />

            {/* Testnet tournament (paid entry + lobby + bracket) */}
            <Route path="/testnet-entry" element={<TestnetEntry />} />
            <Route path="/tournlobby" element={<TournamentLobby />} />
            <Route path="/tournbracket" element={<TournamentBracket />} />

            {/* Meta */}
            <Route path="/highscores" element={<Highscores />} />
            <Route path="/about" element={<About />} />
            <Route path="/config" element={<Config />} />

            {/* Online */}
            <Route path="/online" element={<OnlineRooms />} />
            <Route path="/online/lobby" element={<OnlineRoomLobby />} />
            <Route path="/online/game" element={<OnlineGame />} />
            <Route path="/online/postgame" element={<OnlinePostGame />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AudioProvider>
  );
}

export default App;
