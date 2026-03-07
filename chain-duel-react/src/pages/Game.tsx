import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useSocket } from '@/hooks/useSocket';
import type { SerializedGameInfo } from '@/types/socket';
import '@/components/ui/Button.css';
import './game.css';

export default function Game() {
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const [loading, setLoading] = useState(true);
  const [player1Name, setPlayer1Name] = useState('Player 1');
  const [player2Name, setPlayer2Name] = useState('Player 2');
  const [p1Points, setP1Points] = useState(0);
  const [p2Points, setP2Points] = useState(0);
  const [gameInfo, setGameInfo] = useState('');

  useEffect(() => {
    if (!socket || !connected) return;
    socket.emit('getDuelInfos');
  }, [socket, connected]);

  useEffect(() => {
    if (!socket) return;
    const onDuel = (data: SerializedGameInfo) => {
      const p1 = data.players['Player 1'];
      const p2 = data.players['Player 2'];
      if (p1?.name) setPlayer1Name(p1.name);
      if (p2?.name) setPlayer2Name(p2.name);
      if (p1?.value != null) setP1Points(p1.value);
      if (p2?.value != null) setP2Points(p2.value);
      setGameInfo(data.mode || 'P2P');
      setLoading(false);
    };
    const onUpdate = (data: SerializedGameInfo) => {
      const p1 = data.players['Player 1'];
      const p2 = data.players['Player 2'];
      if (p1?.value != null) setP1Points(p1.value);
      if (p2?.value != null) setP2Points(p2.value);
    };
    socket.on('resGetDuelInfos', onDuel);
    socket.on('updatePayments', onUpdate);
    return () => {
      socket.off('resGetDuelInfos', onDuel);
      socket.off('updatePayments', onUpdate);
    };
  }, [socket]);

  return (
    <>
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div id="gameContainer" className={`flex full game ${loading ? 'hide' : ''}`}>
        <div>
          <div className="flex players">
            <div id="player1info" className="condensed">
              <div className="inline playerSquare white" />
              <div className="inline" id="player1name">
                {player1Name}
              </div>
            </div>
            <div id="gameInfo" className="outline condensed">
              {gameInfo}
            </div>
            <div id="player2info" className="condensed">
              <div className="inline" id="player2name">
                {player2Name}
              </div>
              <div className="inline playerSquare black" />
            </div>
          </div>

          <div className="flex points">
            <div className="player-sats player-sats-p1">
              <span id="p1Points" className="condensed">
                {p1Points.toLocaleString()}
              </span>{' '}
              <span className="grey">sats</span>
            </div>
            <div className="player-sats player-sats-p2">
              <span className="grey">sats</span>{' '}
              <span id="p2Points" className="condensed">
                {p2Points.toLocaleString()}
              </span>
            </div>
          </div>

          <canvas id="gameCanvas" />

          <div className="game-shell-note">
            Core rendering parity is in progress. This shell keeps the legacy game HUD layout
            and live points while final engine migration is completed.
          </div>

          <Button id="mainmenubutton" onClick={() => navigate('/')}>
            MAIN MENU
          </Button>
        </div>
      </div>

      <div className={`overlay ${loading ? '' : 'hide'}`} id="loading">
        <img src="/images/loading.gif" alt="Loading" />
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_game.m4a" autoplay />
    </>
  );
}
