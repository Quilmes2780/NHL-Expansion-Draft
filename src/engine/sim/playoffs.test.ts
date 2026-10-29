import { describe, expect, it } from 'vitest';
import { EXPANSION_TEAM_ID, cityById } from '../franchise';
import { ACHIEVEMENTS, computeAwards, evaluateAchievements, seasonVerdict } from '../world/summary';
import { playoffSeeding, simPlayoffsUntil, startPlayoffs } from './playoffs';
import { simUntil, startSeason } from './season';
import { autoPreseason } from './testkit';

const pre = autoPreseason('playoff-tests');
const st = startSeason(pre.league, pre.lineup);
const regular = simUntil(st.league, st.state, () => false);
const run = () => simPlayoffsUntil(regular.league, startPlayoffs(regular.league, regular.state), () => false);
const done = run();

describe('playoffs', () => {
  it('seeds 16 teams: top 3 per division + 2 wildcards per conference', () => {
    const { round1, seeds } = playoffSeeding(regular.league, regular.state);
    expect(round1).toHaveLength(8);
    const teams = round1.flatMap((s) => [s.a, s.b]);
    expect(new Set(teams).size).toBe(16);
    expect(Object.values(seeds).filter((x) => x.startsWith('WC'))).toHaveLength(4);
    for (const s of round1) {
      const conf = (id: string) => regular.league.teams.find((t) => t.id === id)?.conference;
      expect(conf(s.a)).toBe(conf(s.b));
    }
  });

  it('plays four best-of-7 rounds to a champion, deterministically', () => {
    expect(done.po.champion).toBeTruthy();
    expect(done.po.rounds.map((r) => r.length)).toEqual([8, 4, 2, 1]);
    for (const round of done.po.rounds)
      for (const s of round) {
        expect(Math.max(s.winsA, s.winsB)).toBe(4);
        expect(Math.min(s.winsA, s.winsB)).toBeLessThan(4);
        expect(s.games.length).toBe(s.winsA + s.winsB);
      }
    expect(done.po.rounds[3]![0]!.winner).toBe(done.po.champion);
    expect(JSON.stringify(run().po)).toBe(JSON.stringify(done.po));
  });

  it('has no shootouts and gives the better team home ice in games 1, 2, 5, 7', () => {
    const results = Object.values(done.po.season.results);
    expect(results.some((r) => r.decision === 'SO')).toBe(false);
    for (const round of done.po.rounds)
      for (const s of round) {
        s.games.forEach((gid, i) => {
          const r = done.po.season.results[gid]!;
          expect(r.home === s.homeIce).toBe([0, 1, 4, 6].includes(i));
        });
      }
  });

  it('keeps regular season standings untouched and records playoff news', () => {
    expect(Object.keys(regular.state.results)).toHaveLength(regular.state.games.length);
    expect(done.po.season.news.length).toBeGreaterThan(1);
  });
});

describe('fans, owner and wrap-up', () => {
  it('keeps meta values in range and attendance within arena capacity', () => {
    const meta = regular.state.meta;
    expect(meta.fanMood).toBeGreaterThanOrEqual(0);
    expect(meta.fanMood).toBeLessThanOrEqual(100);
    expect(meta.ownerSatisfaction).toBeGreaterThanOrEqual(0);
    expect(meta.ownerSatisfaction).toBeLessThanOrEqual(100);
    const cap = cityById(regular.league.franchise!.cityId).arenaCapacity;
    const games = Object.values(meta.attendance);
    expect(games).toHaveLength(41);
    for (const a of games) expect(a).toBeLessThanOrEqual(cap);
    expect(meta.history.length).toBeGreaterThan(20);
    expect(regular.state.news.length).toBeGreaterThan(3);
  });

  it('computes awards, verdict and achievements', () => {
    const awards = computeAwards(regular.league, regular.state);
    expect(awards.map((a) => a.id)).toEqual(expect.arrayContaining(['mvp', 'points', 'goals', 'goalie', 'defense']));
    const v = seasonVerdict(done.league, regular.state, done.po);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(v.grade);
    expect(v.record).toMatch(/^\d+-\d+-\d+$/);
    const ids = evaluateAchievements({ league: done.league, draft: null, off: null, regular: regular.state, po: done.po });
    const known = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const id of ids) expect(known.has(id)).toBe(true);
    expect(ids).toContain('first-win');
    if (done.po.champion === EXPANSION_TEAM_ID) expect(ids).toContain('champion');
  });
});
