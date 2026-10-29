import { describe, expect, it } from 'vitest';
import { EXPANSION_TEAM_ID } from '../franchise';
import { computeAwards, evaluateAchievements, seasonVerdict } from '../world/summary';
import { simPlayoffsUntil, startPlayoffs } from './playoffs';
import { simUntil, startSeason } from './season';
import { standings } from './standings';
import { autoPreseason } from './testkit';

/** Founding → draft → offseason → 82 games → playoffs → summary, headless and with automatic decisions. */
function fullRun(seed: string) {
  const pre = autoPreseason(seed);
  const st = startSeason(pre.league, pre.lineup);
  const reg = simUntil(st.league, st.state, () => false);
  const po = simPlayoffsUntil(reg.league, startPlayoffs(reg.league, reg.state), () => false);
  return {
    standings: standings(reg.league, reg.state),
    champion: po.po.champion,
    verdict: seasonVerdict(po.league, reg.state, po.po),
    awards: computeAwards(po.league, reg.state),
    achievements: evaluateAchievements({ league: po.league, draft: null, off: null, regular: reg.state, po: po.po }),
    news: po.po.season.news.length + reg.state.news.length,
  };
}

describe('end-to-end', () => {
  it('a complete run is deterministic: same seed + same decisions = identical result', { timeout: 120_000 }, () => {
    const a = fullRun('e2e-seed');
    const b = fullRun('e2e-seed');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.champion).toBeTruthy();
    expect(a.standings.find((r) => r.teamId === EXPANSION_TEAM_ID)?.gp).toBe(82);
    expect(a.news).toBeGreaterThan(5);
  });

  it('a different seed gives a different league', { timeout: 120_000 }, () => {
    expect(JSON.stringify(fullRun('e2e-other').standings)).not.toBe(JSON.stringify(fullRun('e2e-seed').standings));
  });
});
