import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { createFranchise } from '../franchise';
import { generateLeague } from '../gen/league';
import { groupOf } from '../model';
import { startExpansionDraft } from '../expansion/draft';
import { mockDraft, validateSelection } from '../expansion/selection';
import { validateProtection } from '../expansion/protection';
import { playersOfTeam } from '../model';
import { generateSchedule } from '../sim/schedule';
import { exportLeagueData, importLeagueData, validateLeagueData } from './leagueData';

const cfg = defaultConfig();

describe('league data import/export', () => {
  const original = generateLeague('io-seed');
  const data = exportLeagueData(original);

  it('round-trips a generated league', () => {
    const json = JSON.parse(JSON.stringify(data));
    const res = importLeagueData(json, 'imported', cfg);
    expect(res.errors).toEqual([]);
    const lg = res.league!;
    expect(lg.teams).toHaveLength(32);
    expect(Object.keys(lg.players)).toHaveLength(Object.keys(original.players).length);
    const byName = (l: typeof lg) => Object.values(l.players).map((p) => `${p.firstName} ${p.lastName}|${p.position}|${p.ovr}|${p.contract?.capHit ?? 'x'}`).sort();
    expect(byName(lg)).toEqual(byName(original));
    expect(importLeagueData(json, 'imported', cfg)).toEqual(res);
  });

  it('imported leagues are fully playable: protections, mock draft, schedule', () => {
    const lg = importLeagueData(JSON.parse(JSON.stringify(data)), 'imported-2', cfg).league!;
    const founded = createFranchise(lg, {
      cityId: 'omaha',
      name: 'Import',
      abbrev: 'IMP',
      colors: { primary: '#111111', secondary: '#eeeeee', accent: '#888888' },
      logo: { shape: 'circle', icon: 'star', colors: { primary: '#111111', secondary: '#eeeeee', accent: '#888888' }, text: '' },
      mandate: 'budget',
    }).league;
    const s = startExpansionDraft(founded);
    for (const [teamId, list] of Object.entries(s.protections))
      expect(validateProtection(playersOfTeam(founded, teamId), list.protectedIds, list.schemeId, founded.config.rules)).toEqual([]);
    expect(validateSelection(founded, s.protections, mockDraft(founded, s.protections))).toEqual([]);
    expect(generateSchedule(founded, 'imp').games).toHaveLength((33 * 82) / 2);
  });

  it('fills in attributes when only OVR is given', () => {
    const slim = JSON.parse(JSON.stringify(data));
    for (const p of slim.players) delete p.attributes;
    const lg = importLeagueData(slim, 'slim', cfg).league!;
    for (const p of Object.values(lg.players)) {
      expect(groupOf(p.position) === 'G' ? p.goalie : p.skater).toBeDefined();
      expect(p.ovr).toBeGreaterThan(20);
    }
  });

  it('reports precise errors', () => {
    expect(validateLeagueData(null, cfg.rules)[0]).toMatch(/JSON-Objekt/);
    const bad = JSON.parse(JSON.stringify(data));
    bad.format = 'xyz';
    bad.teams[1].abbrev = bad.teams[0].abbrev;
    bad.players[0].position = 'X';
    bad.players[1].age = 80;
    bad.players[2].contract.yearsLeft = 12;
    const errs = validateLeagueData(bad, cfg.rules).join('\n');
    expect(errs).toMatch(/"format"/);
    expect(errs).toMatch(/teams\[1\]\.abbrev.*doppelt/);
    expect(errs).toMatch(/players\[0\]\.position/);
    expect(errs).toMatch(/players\[1\]\.age/);
    expect(errs).toMatch(/players\[2\]\.contract\.yearsLeft/);
    const few = { ...JSON.parse(JSON.stringify(data)), teams: data.teams.slice(0, 10) };
    expect(validateLeagueData(few, cfg.rules).join('\n')).toMatch(/28–32 Teams/);
  });
});
