import { describe, expect, it } from 'vitest';
import { EXPANSION_TEAM_ID } from '../franchise';
import type { Player } from '../model';
import { isInauguralSeason, playersOfTeam } from '../model';
import { simPlayoffsUntil, startPlayoffs } from '../sim/playoffs';
import { simUntil, startSeason } from '../sim/season';
import { standings } from '../sim/standings';
import { autoOffseason, autoPreseason } from '../sim/testkit';
import { runLottery, simEntryDraft } from './entrydraft';
import { advanceFaDay, autoFillRoster } from './freeagency';
import { autoLineup, bestActiveRoster, seasonReadiness } from './lineup';
import { finishEntryDraft, startOffseason } from './offseason';
import { advanceSeason, retirementChance } from './rollover';

/** One complete season (regular season + playoffs) from a ready roster. */
function playSeason(pre: { league: ReturnType<typeof autoPreseason>['league']; lineup: ReturnType<typeof autoPreseason>['lineup'] }, previousMeta: Parameters<typeof startSeason>[5] = null) {
  const st = startSeason(pre.league, pre.lineup, {}, undefined, {}, previousMeta);
  const reg = simUntil(st.league, st.state, () => false);
  const po = simPlayoffsUntil(reg.league, startPlayoffs(reg.league, reg.state), () => false);
  return { league: po.league, regular: reg.state, po: po.po };
}

describe('season rollover', () => {
  const pre = autoPreseason('rollover-seed');
  const first = playSeason(pre);
  const roll = advanceSeason(first.league, first.regular, first.po);
  const before = first.league;
  const after = roll.league;

  it('moves the league one year on', () => {
    expect(after.config.seasonStartYear).toBe(before.config.seasonStartYear + 1);
    expect(after.config.seasonLabel).toBe('2028-29');
    expect(roll.report.finished).toBe('2027-28');
    expect(isInauguralSeason(before)).toBe(true);
    expect(isInauguralSeason(after)).toBe(false);
    // Last season's points drive the lottery.
    const table = standings(before, first.regular);
    for (const r of table) expect(after.teams.find((t) => t.id === r.teamId)?.lastSeasonPoints).toBe(r.pts);
  });

  it('ages players, keeps their stats and ticks contracts down', () => {
    for (const p of Object.values(after.players)) {
      const old = before.players[p.id] as Player;
      if (p.retired) continue;
      expect(p.age).toBe(old.age + 1);
      if (old.contract) expect(p.contract?.yearsLeft).toBe(Math.max(0, old.contract.yearsLeft - 1));
      expect(p.injury).toBeNull();
      expect(p.gpLastSeason).toBe(old.position === 'G' ? (first.regular.goalieStats[p.id]?.gp ?? 0) : (first.regular.skaterStats[p.id]?.gp ?? 0));
    }
  });

  it('lets veterans retire – the older, the likelier – and nobody young', () => {
    const retired = roll.report.retirements;
    expect(retired.length).toBeGreaterThan(5);
    for (const r of retired) {
      // Unsigned free agents may leave from 28 on, everybody else from 31.
      expect(r.position === 'G' ? r.age - 2 : r.age).toBeGreaterThanOrEqual(r.teamId ? 31 : 28);
      const p = after.players[r.playerId]!;
      expect(p.retired).toBe(true);
      expect(p.teamId).toBeNull();
      expect(p.contract).toBeNull();
    }
    const vet = (age: number, yearsLeft: number, ovr = 72) =>
      ({ ...before.players[Object.keys(before.players)[0]!]!, position: 'C', age, ovr, teamId: 't', contract: { capHit: 1, yearsLeft, expiryStatus: 'UFA', nmc: false, ntc: false, nmcWaived: false, elc: false, twoWay: false } }) as Player;
    expect(retirementChance(vet(30, 1))).toBe(0);
    expect(retirementChance(vet(34, 1))).toBeLessThan(retirementChance(vet(36, 1)));
    expect(retirementChance(vet(36, 1))).toBeLessThan(retirementChance(vet(39, 1)));
    // Under contract only rarely, and stars last longer than fringe players.
    expect(retirementChance(vet(37, 3))).toBeLessThan(retirementChance(vet(37, 1)));
    expect(retirementChance(vet(36, 1, 84))).toBeLessThan(retirementChance(vet(36, 1, 62)));
  });

  it('develops young players and lets veterans decline', () => {
    const change = (lo: number, hi: number) => {
      const ps = Object.values(after.players).filter((p) => !p.retired && p.position !== 'G' && p.age - 1 >= lo && p.age - 1 <= hi);
      return ps.reduce((s, p) => s + p.ovr - (before.players[p.id] as Player).ovr, 0) / ps.length;
    };
    expect(change(18, 22)).toBeGreaterThan(1.5);
    expect(change(33, 45)).toBeLessThan(-1);
  });

  it('rolls the draft picks forward', () => {
    const y = after.config.seasonStartYear;
    expect(after.picks.every((pk) => pk.year >= y)).toBe(true);
    for (const t of after.teams)
      for (let yy = y; yy < y + after.config.pickYearsAhead; yy++)
        expect(after.picks.filter((pk) => pk.originalTeamId === t.id && pk.year === yy)).toHaveLength(after.config.draftRounds);
  });

  it('puts the expansion team into the lottery by its own record from now on', () => {
    const lot = runLottery(after);
    const worst = [...after.teams].sort((a, b) => a.lastSeasonPoints - b.lastSeasonPoints || a.id.localeCompare(b.id)).map((t) => t.id);
    expect(lot.standing).toEqual(worst);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(advanceSeason(first.league, first.regular, first.po))).toBe(JSON.stringify(roll));
  });

  it('auto-fill + best roster get a passive GM ready for opening night, season after season', { timeout: 180_000 }, () => {
    let league = roll.league;
    for (let n = 0; n < 2; n++) {
      const off = startOffseason(league);
      const d = simEntryDraft(off.league, off.state.draft);
      const f = finishEntryDraft(d.league, { ...off.state, draft: d.state });
      let lg = f.league;
      let fa = f.state.fa!;
      while (!fa.done) {
        ({ league: lg, state: fa } = autoFillRoster(lg, fa));
        ({ league: lg, state: fa } = advanceFaDay(lg, fa));
      }
      lg = bestActiveRoster(lg, EXPANSION_TEAM_ID);
      const lineup = autoLineup(lg, EXPANSION_TEAM_ID);
      expect(seasonReadiness(lg, EXPANSION_TEAM_ID, lineup).map((i) => i.message)).toEqual([]);
      const season = playSeason({ league: lg, lineup });
      league = advanceSeason(season.league, season.regular, season.po).league;
    }
  });

  it('plays two more full seasons after the inaugural one', { timeout: 180_000 }, () => {
    let league = roll.league;
    let meta = first.po.season.meta;
    for (let n = 0; n < 2; n++) {
      const ready = autoOffseason(league);
      expect(playersOfTeam(ready.league, EXPANSION_TEAM_ID).filter((p) => !p.farm).length).toBeGreaterThanOrEqual(20);
      const season = playSeason(ready, meta);
      expect(season.po.champion).toBeTruthy();
      expect(season.regular.options.misfitsBonus).toBe(false);
      expect(standings(season.league, season.regular).find((r) => r.teamId === EXPANSION_TEAM_ID)?.gp).toBe(82);
      meta = season.po.season.meta;
      league = advanceSeason(season.league, season.regular, season.po).league;
    }
    expect(league.config.seasonLabel).toBe('2030-31');
  });
});
