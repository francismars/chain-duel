import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AudioProvider } from './contexts/AudioContext';
import Index from './pages/Index';
import GameMenu from './pages/GameMenu';
import PracticeMenu from './pages/PracticeMenu';
import TournamentPrefs from './pages/TournamentPrefs';
import TournamentLobby from './pages/TournamentLobby';
import TournamentBracket from './pages/TournamentBracket';
import Game from './pages/Game';
import PostGame from './pages/PostGame';
import Highscores from './pages/Highscores';
import About from './pages/About';
import Config from './pages/Config';
import './styles/index.css';

function App() {
  return (
    <AudioProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/gamemenu" element={<GameMenu />} />
          <Route path="/practicemenu" element={<PracticeMenu />} />
          <Route path="/tournprefs" element={<TournamentPrefs />} />
          <Route path="/tournlobby" element={<TournamentLobby />} />
          <Route path="/tournbracket" element={<TournamentBracket />} />
          <Route path="/game" element={<Game />} />
          <Route path="/postgame" element={<PostGame />} />
          <Route path="/highscores" element={<Highscores />} />
          <Route path="/about" element={<About />} />
          <Route path="/config" element={<Config />} />
        </Routes>
      </BrowserRouter>
    </AudioProvider>
  );
}

export default App;
