import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { Button } from '@/components/ui/Button';
import { useAudio, SFX } from '@/contexts/AudioContext';
import '@/components/ui/Button.css';
import './bountyLeaderboard.css';

interface BountyEntry {
  rank: number;
  name: string;
  satsWon: number;
  wins: number;
  gamesPlayed: number;
  isChampion: boolean;
}

// Placeholder leaderboard data — real data will come from backend API
const PLACEHOLDER_ENTRIES: BountyEntry[] = [
  { rank: 1, name: 'SATOSHI_X', satsWon: 2_180_000, wins: 47, gamesPlayed: 54, isChampion: true },
  { rank: 2, name: 'BigToshi 🌊', satsWon: 1_540_000, wins: 38, gamesPlayed: 49, isChampion: false },
  { rank: 3, name: 'chain_lord', satsWon: 1_120_000, wins: 29, gamesPlayed: 38, isChampion: false },
  { rank: 4, name: 'btc_phantom', satsWon: 890_000, wins: 24, gamesPlayed: 33, isChampion: false },
  { rank: 5, name: 'zero_conf', satsWon: 760_000, wins: 21, gamesPlayed: 31, isChampion: false },
  { rank: 6, name: 'mempool_max', satsWon: 620_000, wins: 18, gamesPlayed: 29, isChampion: false },
  { rank: 7, name: 'node_runner', satsWon: 510_000, wins: 15, gamesPlayed: 26, isChampion: false },
  { rank: 8, name: 'fiat_slayer', satsWon: 430_000, wins: 13, gamesPlayed: 22, isChampion: false },
  { rank: 9, name: 'hash_rate_hero', satsWon: 380_000, wins: 11, gamesPlayed: 20, isChampion: false },
  { rank: 10, name: 'cold_storage', satsWon: 300_000, wins: 9, gamesPlayed: 18, isChampion: false },
];

export default function BountyLeaderboard() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const [entries] = useState<BountyEntry[]>(PLACEHOLDER_ENTRIES);
  const [loading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        playSfx(SFX.MENU_SELECT);
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, playSfx]);

  return (
    <div className="bounty-board flex full flex-center">
      <header className="bounty-header">
        <div className="bounty-wanted-label">MOST WANTED</div>
        <h1 className="bounty-title condensed">BOUNTY HUNT</h1>
        <p className="bounty-subtitle">WEEKLY LEADERBOARD · TOP PLAYERS BY CUMULATIVE SATS</p>
      </header>

      <div className="bounty-content">
        {loading ? (
          <div className="bounty-loading">
            <img src="/images/loading.gif" alt="Loading" />
          </div>
        ) : (
          <table className="bounty-table">
            <thead>
              <tr className="bounty-table-head">
                <th className="col-rank">#</th>
                <th className="col-name">PLAYER</th>
                <th className="col-sats">SATS WON</th>
                <th className="col-record">W / GP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.rank}
                  className={`bounty-row ${entry.rank === 1 ? 'champion' : ''}`}
                >
                  <td className="col-rank condensed">
                    {entry.rank === 1 ? (
                      <span className="champion-crown">◈</span>
                    ) : (
                      <span className="rank-number">{entry.rank}</span>
                    )}
                  </td>
                  <td className="col-name condensed">
                    {entry.name}
                    {entry.isChampion && (
                      <span className="champion-label"> CHAMPION</span>
                    )}
                  </td>
                  <td className="col-sats condensed">
                    {entry.satsWon.toLocaleString()}
                    <span className="sats-unit"> sats</span>
                  </td>
                  <td className="col-record">
                    {entry.wins} / {entry.gamesPlayed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="bounty-nostr-promo">
          <div className="nostr-promo-icon">⚡</div>
          <div className="nostr-promo-body">
            <div className="nostr-promo-label">BOOST YOUR EARNINGS</div>
            <p className="nostr-promo-text">
              Play with <strong>Nostr mode</strong> and pay with zaps to unlock <strong>2× bounty multipliers</strong>.
              Share your wins on Nostr — every zapped post increases your pool weight for the next payout.
            </p>
          </div>
          <div className="nostr-promo-badge">2X</div>
        </div>

        <div className="bounty-info">
          <div className="bounty-info-item">
            <div className="info-label">HOW IT WORKS</div>
            <p className="info-text">
              Complete GAUNTLET levels 1–7 to unlock Bounty Hunt access.
              Lightning-staked duels with open challenges. Every 100 Bitcoin blocks,
              a special bounty coinbase spawns worth bonus sats from the community pool.
            </p>
          </div>
          <div className="bounty-info-item">
            <div className="info-label">BOT FILTER</div>
            <p className="info-text">
              Only players who complete the Gauntlet can enter ranked play.
              Replays are stored and analyzed — superhuman reaction patterns are flagged.
            </p>
          </div>
        </div>
      </div>

      <div className="bounty-footer">
        <Button
          onClick={() => {
            playSfx(SFX.MENU_CONFIRM);
            navigate('/');
          }}
        >
          MAIN MENU
        </Button>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
