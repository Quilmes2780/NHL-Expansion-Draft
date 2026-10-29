import { describe, expect, it } from 'vitest';
import { simUntil, startSeason } from './season';
import { standings } from './standings';
import { autoPreseason } from './testkit';

/**
 * Plausibility: 100 full seasons headless (4 leagues × 25 season seeds) must produce realistic
 * distributions. Split into batches so the test worker stays responsive (~1–2 minutes in total).
 */
interface SeasonFigures {
  goals: number;
  sv: number;
  pp: number;
  ot: number;
  home: number;
  ptsMin: number;
  ptsMax: number;
  ptsSd: number;
}

describe('simulation calibration (100 seasons)', () => {
  const leagues = ['cal-a', 'cal-b', 'cal-c', 'cal-d'].map((s) => autoPreseason(s));
  const perSeason: SeasonFigures[] = [];

  for (let batch = 0; batch < 10; batch++) {
    it(`seasons ${batch * 10 + 1}–${batch * 10 + 10} stay within sane bounds`, { timeout: 120_000 }, async () => {
      for (let i = batch * 10; i < batch * 10 + 10; i++) {
        // Yield a macrotask so the test worker can answer the runner's RPC calls in between.
        await new Promise((r) => setTimeout(r, 0));
        const pre = leagues[i % leagues.length]!;
        const st = startSeason(pre.league, pre.lineup, {}, `cal-season-${i}`);
        const r = simUntil(st.league, st.state, () => false);
        const res = Object.values(r.state.results);
        const goals = res.reduce((a, g) => a + g.homeGoals + g.awayGoals, 0);
        const ts = Object.values(r.state.teamStats);
        const shots = ts.reduce((a, t) => a + t.shotsFor, 0);
        const pts = standings(r.league, r.state).map((x) => x.pts);
        const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
        const s: SeasonFigures = {
          goals: goals / (res.length * 2),
          sv: 1 - goals / shots,
          pp: ts.reduce((a, t) => a + t.ppGoals, 0) / ts.reduce((a, t) => a + t.ppOpp, 0),
          ot: res.filter((g) => g.decision !== 'REG').length / res.length,
          home: res.filter((g) => g.homeGoals > g.awayGoals).length / res.length,
          ptsMin: Math.min(...pts),
          ptsMax: Math.max(...pts),
          ptsSd: Math.sqrt(pts.reduce((a, p) => a + (p - mean) ** 2, 0) / pts.length),
        };
        expect(s.goals).toBeGreaterThan(2.6);
        expect(s.goals).toBeLessThan(3.4);
        expect(s.ptsMin).toBeGreaterThan(35);
        // A record season (NHL record: 135) can happen in a single draw; the averages below stay strict.
        expect(s.ptsMax).toBeLessThan(150);
        perSeason.push(s);
      }
    });
  }

  it('averages over all 100 seasons are NHL-like', () => {
    expect(perSeason).toHaveLength(100);
    const avg = (k: keyof SeasonFigures) => perSeason.reduce((a, s) => a + s[k], 0) / perSeason.length;
    expect(avg('goals')).toBeGreaterThan(2.85);
    expect(avg('goals')).toBeLessThan(3.2);
    expect(avg('sv')).toBeGreaterThan(0.9);
    expect(avg('sv')).toBeLessThan(0.91);
    expect(avg('pp')).toBeGreaterThan(0.17);
    expect(avg('pp')).toBeLessThan(0.24);
    expect(avg('ot')).toBeGreaterThan(0.13);
    expect(avg('ot')).toBeLessThan(0.27);
    expect(avg('home')).toBeGreaterThan(0.5);
    expect(avg('home')).toBeLessThan(0.58);
    expect(avg('ptsSd')).toBeGreaterThan(8);
    expect(avg('ptsSd')).toBeLessThan(20);
  });
});
