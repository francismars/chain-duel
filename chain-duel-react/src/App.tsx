import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AudioProvider } from './contexts/AudioContext';
import { CornerControls } from './components/ui/CornerControls';
import { PageRevealOutlet } from './components/layout/PageRevealOutlet';
import Index from './pages/Index';
import GameMenu from './pages/GameMenu';
import PracticeMenu from './pages/PracticeMenu';
import SovereignMenu from './pages/SovereignMenu';
import SoloHub from './pages/SoloHub';
import LabyrinthSetup from './pages/LabyrinthSetup';
import ConvergenceSetup from './pages/ConvergenceSetup';
import OverclockSetup from './pages/OverclockSetup';
import GauntletMenu from './pages/GauntletMenu';
import StrategySetup from './pages/StrategySetup';
import PowerupSetup from './pages/PowerupSetup';
import BountyLeaderboard from './pages/BountyLeaderboard';
import TournamentPrefs from './pages/TournamentPrefs';
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
            <Route path="/" element={<Index />} />
            <Route path="/gamemenu" element={<GameMenu />} />
            <Route path="/practicemenu" element={<PracticeMenu />} />
            <Route path="/solo" element={<SoloHub />} />
            <Route path="/labyrinth" element={<LabyrinthSetup />} />
            <Route path="/convergence" element={<ConvergenceSetup />} />
            <Route path="/overclock" element={<OverclockSetup />} />
            <Route path="/sovereign" element={<SovereignMenu />} />
            <Route path="/gauntlet" element={<GauntletMenu />} />
            <Route path="/strategy" element={<StrategySetup />} />
            <Route path="/powerup" element={<PowerupSetup />} />
            <Route path="/bounty" element={<BountyLeaderboard />} />
            <Route path="/tournprefs" element={<TournamentPrefs />} />
            <Route path="/tournlobby" element={<TournamentLobby />} />
            <Route path="/tournbracket" element={<TournamentBracket />} />
            <Route path="/game" element={<Game />} />
            <Route path="/postgame" element={<PostGame />} />
            <Route path="/highscores" element={<Highscores />} />
            <Route path="/about" element={<About />} />
            <Route path="/config" element={<Config />} />
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
