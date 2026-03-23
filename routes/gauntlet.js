/**
 * Gauntlet routes
 * - POST /gauntlet/replay   — store a gauntlet run replay (for bot detection)
 * - POST /gauntlet/complete — mark a level complete and verify SOVEREIGN rank
 * - GET  /gauntlet/rank     — check if a session has earned SOVEREIGN rank
 *
 * Bot detection: replays with consistent sub-80ms input intervals are flagged.
 */
const express = require('express');
const router = express.Router();

// In-memory store (replace with persistent DB in production)
const gauntletReplays = new Map(); // sessionID → [{levelId, inputs, completedAt}]
const sovereignRanks = new Set();  // sessionIDs that earned sovereign rank

const SUSPICIOUS_INPUT_THRESHOLD_MS = 80;
const LEVELS_REQUIRED_FOR_RANK = 7; // levels 1-7 needed for bounty access

/**
 * POST /gauntlet/replay
 * Body: { sessionId, levelId, inputs: [{t, dir}], completedAt, elapsedMs }
 */
router.post('/replay', (req, res) => {
  const { sessionId, levelId, inputs, completedAt, elapsedMs } = req.body;
  if (!sessionId || !levelId) {
    return res.status(400).json({ error: 'sessionId and levelId required' });
  }

  // Anomaly detection: flag if median input interval < threshold
  let flagged = false;
  if (Array.isArray(inputs) && inputs.length > 5) {
    const intervals = [];
    for (let i = 1; i < inputs.length; i++) {
      intervals.push(inputs[i].t - inputs[i - 1].t);
    }
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    if (median < SUSPICIOUS_INPUT_THRESHOLD_MS) {
      flagged = true;
      console.warn(`[Gauntlet] Suspicious replay from ${sessionId}: median input ${median}ms`);
    }
  }

  if (!gauntletReplays.has(sessionId)) {
    gauntletReplays.set(sessionId, []);
  }
  gauntletReplays.get(sessionId).push({ levelId, completedAt, elapsedMs, flagged });

  res.json({ ok: true, flagged });
});

/**
 * POST /gauntlet/complete
 * Body: { sessionId, levelId }
 * Grants SOVEREIGN rank when 7+ levels cleared without being flagged
 */
router.post('/complete', (req, res) => {
  const { sessionId, levelId } = req.body;
  if (!sessionId || !levelId) {
    return res.status(400).json({ error: 'sessionId and levelId required' });
  }

  const replays = gauntletReplays.get(sessionId) ?? [];
  const clearedLevels = replays
    .filter((r) => !r.flagged)
    .map((r) => r.levelId);

  const uniqueCleared = new Set(clearedLevels);
  const sovereignEligible = uniqueCleared.size >= LEVELS_REQUIRED_FOR_RANK;

  if (sovereignEligible) {
    sovereignRanks.add(sessionId);
  }

  res.json({
    ok: true,
    clearedCount: uniqueCleared.size,
    sovereignRank: sovereignRanks.has(sessionId),
  });
});

/**
 * GET /gauntlet/rank?sessionId=...
 */
router.get('/rank', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }
  res.json({ sovereignRank: sovereignRanks.has(sessionId) });
});

module.exports = router;
