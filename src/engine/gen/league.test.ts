import { describe, expect, it } from 'vitest';
import { capFloor, defaultConfig } from '../config';
import { exposureNeed, fitsScheme, isNmcLocked, qualifiesForExposure } from '../expansion/eligibility';
import { groupOf, playersOfTeam, teamPayroll } from '../model';
import { generateLeague, rosterCounts } from './league';

const SEEDS = Array.from({ length: 40 }, (_, i) => `league-${i}`);

describe('generateLeague', () => {
  it('is deterministic per seed', () => {
    const a = generateLeague('same-seed');
    const b = generateLeague('same-seed');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(generateLeague('other-seed'))).not.toBe(JSON.stringify(a));
  });

  it('creates 32 teams with ~23 active players and ~10 prospects', () => {
    const league = generateLeague('roster');
    expect(league.teams).toHaveLength(32);
    expect(league.divisions.reduce((s, d) => s + d.teamIds.length, 0)).toBe(32);
    for (const t of league.teams) {
      const c = rosterCounts(league, t.id);
      expect(c.active.F + c.active.D + c.active.G).toBe(23);
      expect(c.active.G).toBe(2);
      expect(c.total).toBe(33);
    }
  });

  it('keeps every committed payroll between floor and cap', () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const league = generateLeague(seed);
      for (const t of league.teams) {
        const pay = teamPayroll(league, t.id);
        expect(pay).toBeLessThanOrEqual(league.config.salaryCap);
        expect(pay).toBeGreaterThanOrEqual(capFloor(league.config) * 0.97);
      }
    }
  });

  it('produces plausible players and contracts', () => {
    const league = generateLeague('plausible');
    for (const p of Object.values(league.players)) {
      expect(p.ovr).toBeGreaterThanOrEqual(30);
      expect(p.ovr).toBeLessThanOrEqual(99);
      expect(p.potential).toBeGreaterThanOrEqual(p.ovr);
      expect(p.gpLastTwo).toBeGreaterThanOrEqual(p.gpLastSeason);
      if (p.contract) {
        expect(p.contract.capHit).toBeGreaterThanOrEqual(league.config.minSalary);
        expect(Number.isInteger(p.contract.capHit)).toBe(true);
        expect(p.contract.yearsLeft).toBeGreaterThanOrEqual(0);
        expect(p.contract.yearsLeft).toBeLessThanOrEqual(8);
        if (p.age >= 33) expect(p.contract.yearsLeft).toBeLessThanOrEqual(4);
      }
      if (p.position === 'G') expect(p.goalie).toBeDefined();
      else expect(p.skater).toBeDefined();
    }
  });

  it('guarantees exposure requirements are satisfiable for every team (many seeds)', () => {
    const cfg = defaultConfig();
    const need = exposureNeed(cfg.rules);
    for (const seed of SEEDS) {
      const league = generateLeague(seed, cfg);
      for (const t of league.teams) {
        const roster = playersOfTeam(league, t.id);
        const locked = roster.filter((p) => isNmcLocked(p, cfg.rules));
        expect(cfg.rules.schemes.some((s) => fitsScheme(locked, s))).toBe(true);
        for (const g of ['F', 'D', 'G'] as const) {
          const free = roster.filter((p) => groupOf(p.position) === g && qualifiesForExposure(p, cfg.rules) && !isNmcLocked(p, cfg.rules));
          expect(free.length, `${seed} ${t.id} ${g}`).toBeGreaterThanOrEqual(need[g]);
        }
      }
    }
  });

  it('generates three years of picks for every team', () => {
    const league = generateLeague('picks');
    expect(league.picks).toHaveLength(32 * 3 * 7);
  });
});
