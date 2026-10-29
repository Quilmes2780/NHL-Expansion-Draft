import { describe, expect, it } from 'vitest';
import type { RuleSetId } from '../config';
import { RULE_SETS, cloneRules, defaultConfig } from '../config';
import { generateLeague } from '../gen/league';
import { groupOf, playersOfTeam } from '../model';
import { isExempt, isNmcLocked, qualifiesForExposure } from './eligibility';
import { aiProtectAll, validateProtection } from './protection';

const RULESETS: RuleSetId[] = ['seattle2021', 'vegas2017', 'custom'];

describe('AI protection lists', () => {
  for (const rs of RULESETS) {
    it(`always satisfy every rule (${rs}, 25 seeds)`, () => {
      for (let i = 0; i < 25; i++) {
        const league = generateLeague(`prot-${rs}-${i}`, defaultConfig({ rules: cloneRules(RULE_SETS[rs]) }));
        const lists = aiProtectAll(league);
        expect(Object.keys(lists)).toHaveLength(32);
        for (const [teamId, list] of Object.entries(lists)) {
          const roster = playersOfTeam(league, teamId);
          expect(validateProtection(roster, list.protectedIds, list.schemeId, league.config.rules)).toEqual([]);
          // Partition: every player is exactly one of protected / exposed / exempt.
          const all = new Set([...list.protectedIds, ...list.exposedIds, ...list.exemptIds]);
          expect(all.size).toBe(roster.length);
        }
      }
    });
  }

  it('respects a stricter custom rule set', () => {
    const rules = cloneRules(RULE_SETS.custom);
    rules.exposure.forwards = 3;
    rules.exposure.defense = 2;
    const league = generateLeague('custom-strict', defaultConfig({ rules }));
    for (const [teamId, list] of Object.entries(aiProtectAll(league))) {
      expect(validateProtection(playersOfTeam(league, teamId), list.protectedIds, list.schemeId, rules)).toEqual([]);
    }
  });

  it('protects good players and fills the scheme', () => {
    const league = generateLeague('quality');
    const lists = aiProtectAll(league);
    for (const [teamId, list] of Object.entries(lists)) {
      const roster = playersOfTeam(league, teamId);
      const prot = roster.filter((p) => list.protectedIds.includes(p.id));
      const exposed = roster.filter((p) => list.exposedIds.includes(p.id));
      expect(prot.filter((p) => p.position === 'G')).toHaveLength(1);
      expect(prot.filter((p) => p.position !== 'G').length).toBeGreaterThanOrEqual(8);
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      expect(avg(prot.map((p) => p.ovr))).toBeGreaterThan(avg(exposed.map((p) => p.ovr)));
    }
  });

  it('is deterministic', () => {
    const a = aiProtectAll(generateLeague('det'));
    const b = aiProtectAll(generateLeague('det'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('validateProtection', () => {
  const league = generateLeague('validator');
  const team = league.teams[0]!;
  const roster = playersOfTeam(league, team.id);
  const rules = league.config.rules;
  const eligible = roster.filter((p) => !isExempt(p, rules));

  it('flags too many forwards', () => {
    const f = eligible.filter((p) => groupOf(p.position) === 'F').slice(0, 8).map((p) => p.id);
    const codes = validateProtection(roster, f, '7-3-1', rules).map((v) => v.code);
    expect(codes).toContain('TOO_MANY_F');
  });

  it('flags too many skaters in 8-1', () => {
    const s = eligible.filter((p) => groupOf(p.position) !== 'G').slice(0, 9).map((p) => p.id);
    expect(validateProtection(roster, s, '8-1', rules).map((v) => v.code)).toContain('TOO_MANY_SKATERS');
  });

  it('flags protecting exempt players', () => {
    const ex = roster.find((p) => isExempt(p, rules))!;
    expect(validateProtection(roster, [ex.id], '7-3-1', rules).map((v) => v.code)).toContain('EXEMPT_PROTECTED');
  });

  it('flags unprotected NMC players', () => {
    for (let i = 0; i < 30; i++) {
      const lg = generateLeague(`nmc-${i}`);
      for (const t of lg.teams) {
        const r = playersOfTeam(lg, t.id);
        const nmc = r.find((p) => isNmcLocked(p, lg.config.rules));
        if (nmc) {
          expect(validateProtection(r, [], '7-3-1', lg.config.rules).map((v) => v.code)).toContain('NMC_UNPROTECTED');
          return;
        }
      }
    }
    throw new Error('no NMC player found in 30 leagues');
  });

  it('flags exposure violations when every qualifying defenseman is protected', () => {
    const qd = eligible.filter((p) => p.position === 'D' && qualifiesForExposure(p, rules)).map((p) => p.id);
    const codes = validateProtection(roster, qd, '8-1', rules).map((v) => v.code);
    expect(codes).toContain('EXPOSURE_D');
  });
});
