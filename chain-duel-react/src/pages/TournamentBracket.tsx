import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import '@/components/ui/Button.css';
import '@/components/ui/Sponsorship.css';
import './tournbracket.css';

export default function TournamentBracket() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const numberOfPlayers = Math.max(4, parseInt(params.get('players') || '4', 10) || 4);
  const deposit = Math.max(10000, parseInt(params.get('deposit') || '10000', 10) || 10000);
  const finalPrize = Math.floor(numberOfPlayers * deposit * 0.95);

  const bracketSvg = useMemo(() => {
    if (numberOfPlayers === 8) return '/images/tournament/svg/8_player.svg';
    if (numberOfPlayers === 16) return '/images/tournament/svg/16_player.svg';
    if (numberOfPlayers === 32) return '/images/tournament/svg/32_player.svg';
    return '/images/tournament/svg/4_player.svg';
  }, [numberOfPlayers]);

  return (
    <div className="flex full flex-center tournbracket-page">
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div id="bracket">
        <div className="pages">
          <div id="page-1" className="page">
            <div className="page-inner" id="pageinner">
              <div className="tournament-header">
                <div className="label">Tournament Lobby</div>
                <h1 id="tournament-name" className="hero-outline">
                  The Merkle Tree
                </h1>
                <Sponsorship id="sponsorshipBraket" />
              </div>
              <img src={bracketSvg} alt="Tournament bracket" className="tournbracketSVG" />
            </div>
          </div>
        </div>
      </div>

      <div className="bracketDetails" id="bracketDetails">
        <div className="bracketDetail" id="bracketDetailPlayers">
          <div className="label">Players</div>
          <div className="value players">
            <h3 id="numberOfPlayers">{numberOfPlayers}</h3>
          </div>
        </div>
        <div className="bracketDetail" id="bracketDetailFinalPrize">
          <div className="label">Final Prize</div>
          <div className="value">
            <h3 id="bracketFinalPrize">{finalPrize.toLocaleString()}</h3> <span>sats</span>
          </div>
        </div>
        <div className="bracketDetail" id="bracketDetailBuyIn">
          <div className="label">Buy In</div>
          <div className="value">
            <h3 id="buyinvalue2">{deposit.toLocaleString()}</h3> <span>sats</span>
          </div>
        </div>
      </div>

      <div className="buttonsDiv">
        <Button id="backButton" onClick={() => navigate('/tournprefs')}>
          Cancel
        </Button>
        <Button id="proceedButton" className="disabled">
          Start
        </Button>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
