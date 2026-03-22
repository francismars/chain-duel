/**
 * Bounty Hunt routes
 * - GET  /bounty/leaderboard  — top 10 weekly players by cumulative sats won
 * - POST /bounty/challenge     — post an open challenge (Lightning-staked)
 * - GET  /bounty/challenges    — list open challenges
 * - POST /bounty/accept        — accept an open challenge
 *
 * The bounty pool is funded by community contributions and dispenses
 * bonus sats every 100 Bitcoin blocks via the server's block event handler.
 */
const express = require('express');
const router = express.Router();

// In-memory stores (replace with persistent DB in production)
const weeklyStats = new Map(); // sessionId → { name, satsWon, wins, gamesPlayed }
const openChallenges = new Map(); // challengeId → { sessionId, name, buyin, createdAt }
const bountyPool = { sats: 0 };

/**
 * GET /bounty/leaderboard
 * Returns top 10 players by satsWon this week
 */
router.get('/leaderboard', (req, res) => {
  const entries = [...weeklyStats.values()]
    .sort((a, b) => b.satsWon - a.satsWon)
    .slice(0, 10)
    .map((e, i) => ({
      rank: i + 1,
      name: e.name,
      satsWon: e.satsWon,
      wins: e.wins,
      gamesPlayed: e.gamesPlayed,
      isChampion: i === 0,
    }));

  res.json({
    entries,
    bountyPool: bountyPool.sats,
    updatedAt: Date.now(),
  });
});

/**
 * POST /bounty/result
 * Called by game server after a bounty duel ends
 * Body: { winnerSessionId, winnerName, loserSessionId, satsWon, satsLost }
 */
router.post('/result', (req, res) => {
  const { winnerSessionId, winnerName, satsWon } = req.body;
  if (!winnerSessionId || !winnerName || typeof satsWon !== 'number') {
    return res.status(400).json({ error: 'winnerSessionId, winnerName, satsWon required' });
  }

  if (!weeklyStats.has(winnerSessionId)) {
    weeklyStats.set(winnerSessionId, { name: winnerName, satsWon: 0, wins: 0, gamesPlayed: 0 });
  }
  const stats = weeklyStats.get(winnerSessionId);
  stats.satsWon += satsWon;
  stats.wins += 1;
  stats.gamesPlayed += 1;

  res.json({ ok: true });
});

/**
 * POST /bounty/challenge
 * Body: { sessionId, name, buyin }
 * Returns { challengeId }
 */
router.post('/challenge', (req, res) => {
  const { sessionId, name, buyin } = req.body;
  if (!sessionId || !name || typeof buyin !== 'number') {
    return res.status(400).json({ error: 'sessionId, name, buyin required' });
  }

  const challengeId = `${sessionId}_${Date.now()}`;
  openChallenges.set(challengeId, {
    challengeId,
    sessionId,
    name,
    buyin,
    createdAt: Date.now(),
  });

  // Auto-expire challenges older than 10 minutes
  setTimeout(() => openChallenges.delete(challengeId), 10 * 60 * 1000);

  res.json({ ok: true, challengeId });
});

/**
 * GET /bounty/challenges
 */
router.get('/challenges', (req, res) => {
  const challenges = [...openChallenges.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);
  res.json({ challenges });
});

/**
 * POST /bounty/accept
 * Body: { challengeId, sessionId, name }
 */
router.post('/accept', (req, res) => {
  const { challengeId, sessionId } = req.body;
  if (!challengeId || !sessionId) {
    return res.status(400).json({ error: 'challengeId and sessionId required' });
  }

  const challenge = openChallenges.get(challengeId);
  if (!challenge) {
    return res.status(404).json({ error: 'Challenge not found or expired' });
  }
  if (challenge.sessionId === sessionId) {
    return res.status(400).json({ error: 'Cannot accept your own challenge' });
  }

  openChallenges.delete(challengeId);
  res.json({ ok: true, challenge });
});

/**
 * POST /bounty/pool/add
 * Called by block event handler to add sats to the pool
 * Body: { sats }
 */
router.post('/pool/add', (req, res) => {
  const { sats } = req.body;
  if (typeof sats === 'number' && sats > 0) {
    bountyPool.sats += sats;
  }
  res.json({ ok: true, poolTotal: bountyPool.sats });
});

/**
 * GET /bounty/pool
 */
router.get('/pool', (req, res) => {
  res.json({ sats: bountyPool.sats });
});

module.exports = router;
