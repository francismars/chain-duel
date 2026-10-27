/**
 * Headless baseline win-rate report for all 6 challenge presets.
 * Usage: npx tsx scripts/challengeBaseline.ts
 */
import {
  CHALLENGE_SIM_PRESETS,
  measureWinRate,
} from '../src/game/sim/challengeSim';

const RUNS = Number(process.env.CHALLENGE_SIM_RUNS ?? '8');

console.log(`Challenge baseline (${RUNS} runs per preset, greedy_food strategy)\n`);

for (const preset of CHALLENGE_SIM_PRESETS) {
  const stats = measureWinRate({
    config: preset.config,
    runs: RUNS,
    seedPrefix: preset.id,
    strategy: preset.id === 'ffa' || preset.id === 'sovereign-stack' ? 'passive_ffa' : 'greedy_food',
  });
  const pct = (stats.winRate * 100).toFixed(1);
  console.log(
    `${preset.id.padEnd(18)} winRate=${pct.padStart(5)}%  avgSteps=${Math.round(stats.avgSteps)}`
  );
}
