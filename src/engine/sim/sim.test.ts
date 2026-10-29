import { describe, expect, it } from 'vitest';
import { EXPANSION_TEAM_ID } from '../franchise';
import { activePlayers, playersOfTeam } from '../model';
import { autoLineup } from '../offseason/lineup';
import { simulateGame } from './game';
import { dayLabel, generateSchedule } from './schedule';
import { demoteWithWaivers, needsWaivers, repairLineup, simDay, simUntil, simWeek, startSeason } from './season';
import { standings, wildcardStandings } from './standings';
import { autoPreseason } from './testkit';

const pre = autoPreseason('sim-tests');

describe('schedule', () => {
  const sched = generateSchedule(pre.league, 'sched-seed');

  it('gives every team 82 games, 41 at home, and is deterministic', () => {
    expect(sched.games).toHaveLength((33 * 82) / 2);
    for (const t of pre.league.teams) {
      const mine = sched.games.filter((g) => g.home === t.id || g.away === t.id);
      expect(mine).toHaveLength(82);
      expect(mine.filter((g) => g.home === t.id)).toHaveLength(41);
    }
    expect(generateSchedule(pre.league, 'sched-seed')).toEqual(sched);
  });

  it('never has a team twice on a day or three games in three days', () => {
    for (const t of pre.league.teams) {
      const days = sched.games.filter((g) => g.home === t.id || g.away === t.id).map((g) => g.day).sort((a, b) => a - b);
      expect(new Set(days).size).toBe(days.length);
      for (let i = 2; i < days.length; i++) expect(days[i]! - days[i - 2]!).toBeGreaterThan(2);
    }
  });

  it('respects matchup structure and has back-to-backs', () => {
    const div = new Map(pre.league.teams.map((t) => [t.id, t.division]));
    const pairs = new Map<string, number>();
    for (const g of sched.games) {
      const k = [g.home, g.away].sort().join('|');
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    for (const a of pre.league.teams)
      for (const b of pre.league.teams) {
        if (a.id >= b.id) continue;
        const n = pairs.get(`${a.id}|${b.id}`) ?? 0;
        expect(n).toBeGreaterThanOrEqual(div.get(a.id) === div.get(b.id) ? 4 : 2);
      }
    const days = sched.games.filter((g) => g.home === EXPANSION_TEAM_ID || g.away === EXPANSION_TEAM_ID).map((g) => g.day).sort((a, b) => a - b);
    const b2b = days.filter((d, i) => i > 0 && d - days[i - 1]! === 1).length;
    expect(b2b).toBeGreaterThan(3);
    expect(b2b).toBeLessThan(25);
    expect(sched.deadlineDay).toBeGreaterThan(sched.days * 0.6);
  });

  it('labels dates correctly', () => {
    expect(dayLabel(0)).toBe('Fr 8. Okt 2027');
    expect(dayLabel(24)).toBe('Mo 1. Nov 2027');
    expect(dayLabel(85)).toBe('Sa 1. Jan 2028');
  });
});

describe('game simulation', () => {
  const lg = pre.league;
  const [a, b] = lg.teams.filter((t) => !t.isExpansion);
  const input = (teamId: string) => {
    const l = autoLineup(lg, teamId);
    return { teamId, lineup: l, goalieId: l.goalies[0]!, fatigue: 0, bonus: 0 };
  };

  it('is deterministic and internally consistent', () => {
    for (let i = 0; i < 50; i++) {
      const box = simulateGame(lg, `t${i}`, input(a!.id), input(b!.id), 'game-seed');
      expect(simulateGame(lg, `t${i}`, input(a!.id), input(b!.id), 'game-seed')).toEqual(box);
      const hg = box.teams[a!.id]!.goals;
      const ag = box.teams[b!.id]!.goals;
      expect(hg).not.toBe(ag);
      expect(box.winner).toBe(hg > ag ? a!.id : b!.id);
      if (box.decision !== 'REG') expect(Math.abs(hg - ag)).toBe(1);
      const scored = box.events.filter((e) => e.type === 'goal').length;
      expect(scored + (box.decision === 'SO' ? 1 : 0)).toBe(hg + ag);
      const decisions = Object.values(box.goalieLines).map((g) => g.decision).sort();
      expect(decisions).toEqual(box.decision === 'REG' ? ['L', 'W'] : ['OTL', 'W']);
      expect(box.teams[a!.id]!.shots).toBeGreaterThanOrEqual(hg - (box.decision === 'SO' && box.winner === a!.id ? 1 : 0));
    }
  });
});

describe('season', () => {
  it('same seed + same decisions = identical season', () => {
    const run = () => {
      const st = startSeason(pre.league, pre.lineup);
      const r = simUntil(st.league, st.state, (s) => s.day >= 40);
      return JSON.stringify({ results: r.state.results, stats: r.state.skaterStats, log: r.state.log });
    };
    expect(run()).toBe(run());
  });

  it('standings add up after a full season', () => {
    const st = startSeason(pre.league, pre.lineup);
    const r = simUntil(st.league, st.state, () => false);
    expect(r.state.done).toBe(true);
    const rows = standings(r.league, r.state);
    const games = r.state.games.length;
    const extra = Object.values(r.state.results).filter((g) => g.decision !== 'REG').length;
    expect(rows.reduce((s, x) => s + x.gp, 0)).toBe(games * 2);
    expect(rows.reduce((s, x) => s + x.w, 0)).toBe(games);
    expect(rows.reduce((s, x) => s + x.pts, 0)).toBe(games * 2 + extra);
    for (const x of rows) expect(x.gp).toBe(82);
    const wc = wildcardStandings(r.league, r.state);
    expect(wc).toHaveLength(2);
    for (const c of wc) expect(c.divisions.flatMap((d) => d.top).length + c.wildcards.length).toBe(8);
    // Rosters stay legal: healthy NHL rosters never exceed 23.
    for (const t of r.league.teams)
      expect(activePlayers(r.league, t.id).filter((p) => !p.injury).length).toBeLessThanOrEqual(23);
  });

  it('repairs lineups when players get hurt and records injuries', () => {
    const st = startSeason(pre.league, pre.lineup);
    const star = pre.lineup.forwards[0]![1]!;
    const hurt = { ...st.league, players: { ...st.league.players, [star]: { ...st.league.players[star]!, injury: { description: 'Knie', gamesRemaining: 5 } } } };
    const fixed = repairLineup(hurt, EXPANSION_TEAM_ID, pre.lineup);
    expect(fixed.forwards.flat()).not.toContain(star);
    expect(fixed.forwards.flat().every(Boolean)).toBe(true);
    const r = simWeek(hurt, st.state);
    expect(r.state.day).toBe(7);
  });

  it('runs waivers deterministically', () => {
    const st = startSeason(pre.league, pre.lineup);
    const cand = playersOfTeam(st.league, EXPANSION_TEAM_ID).find((p) => !p.farm && needsWaivers(p));
    if (!cand) return;
    const a = demoteWithWaivers(st.league, st.state, cand.id);
    const b = demoteWithWaivers(st.league, st.state, cand.id);
    expect(a.claimedBy).toBe(b.claimedBy);
    const p = a.league.players[cand.id]!;
    if (a.claimedBy) expect(p.teamId).toBe(a.claimedBy);
    else expect(p.farm).toBe(true);
  });

  it('a single day only plays the scheduled games', () => {
    const st = startSeason(pre.league, pre.lineup);
    const r = simDay(st.league, st.state);
    expect(Object.keys(r.state.results).length).toBe(st.state.games.filter((g) => g.day === 0).length);
  });
});
