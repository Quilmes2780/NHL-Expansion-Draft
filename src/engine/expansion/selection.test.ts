import { describe, expect, it } from 'vitest';
import { RULE_SETS, cloneRules, defaultConfig } from '../config';
import { EXPANSION_TEAM_ID, createFranchise } from '../franchise';
import { generateLeague } from '../gen/league';
import type { League } from '../model';
import { groupOf } from '../model';
import { isPendingUfa } from './eligibility';
import { scoutPlayer, selectPlayer, startExpansionDraft, submitExpansionDraft } from './draft';
import { scoutView } from './scouting';
import type { Selection } from './selection';
import { gradeDraft, mockDraft, selectableCandidates, summarizeSelection, validateSelection } from './selection';

function withFranchise(seed: string, cfg = defaultConfig()): League {
  return createFranchise(generateLeague(seed, cfg), {
    cityId: 'quebec',
    name: 'Glaciers',
    abbrev: 'QCG',
    colors: { primary: '#0ea5e9', secondary: '#0f172a', accent: '#e2e8f0' },
    logo: { shape: 'shield', icon: 'star', colors: { primary: '#0ea5e9', secondary: '#0f172a', accent: '#e2e8f0' }, text: 'QCG' },
    mandate: 'patientBuild',
  }).league;
}

describe('mock draft', () => {
  it('always produces a valid expansion roster (30 seeds, all rule sets)', () => {
    for (let i = 0; i < 30; i++) {
      const rs = (['seattle2021', 'vegas2017', 'custom'] as const)[i % 3] ?? 'seattle2021';
      const league = withFranchise(`mock-${i}`, defaultConfig({ rules: cloneRules(RULE_SETS[rs]) }));
      const state = startExpansionDraft(league);
      const mock = mockDraft(league, state.protections);
      expect(validateSelection(league, state.protections, mock), `seed mock-${i}`).toEqual([]);
    }
  });

  it('is deterministic', () => {
    const league = withFranchise('mock-det');
    const s = startExpansionDraft(league);
    expect(mockDraft(league, s.protections)).toEqual(mockDraft(league, s.protections));
  });

  it('respects fixed picks', () => {
    const league = withFranchise('mock-fixed');
    const s = startExpansionDraft(league);
    const [teamId, list] = Object.entries(s.protections)[0]!;
    const forced = selectableCandidates(league, list).at(-1)!;
    const mock = mockDraft(league, s.protections, { [teamId]: forced.id });
    expect(mock[teamId]).toBe(forced.id);
  });
});

describe('validateSelection', () => {
  const league = withFranchise('validate');
  const s = startExpansionDraft(league);
  const mock = mockDraft(league, s.protections);
  const teamIds = Object.keys(s.protections);

  it('reports missing teams', () => {
    const partial: Selection = { ...mock };
    delete partial[teamIds[0]!];
    const v = validateSelection(league, s.protections, partial);
    expect(v.map((x) => x.code)).toContain('MISSING_TEAM');
    expect(v.find((x) => x.code === 'MISSING_TEAM')!.message).toContain('genau 1 Spieler pro Team');
  });

  it('reports protected players', () => {
    const t = teamIds[0]!;
    const sel = { ...mock, [t]: s.protections[t]!.protectedIds[0]! };
    expect(validateSelection(league, s.protections, sel).map((x) => x.code)).toContain('NOT_EXPOSED');
  });

  it('reports pending UFAs', () => {
    for (const t of teamIds) {
      const ufa = s.protections[t]!.exposedIds.find((id) => isPendingUfa(league.players[id]!));
      if (ufa) {
        expect(validateSelection(league, s.protections, { ...mock, [t]: ufa }).map((x) => x.code)).toContain('PENDING_UFA');
        return;
      }
    }
  });

  it('reports position minima and the cap corridor with the violated rule', () => {
    // Pick the cheapest forward wherever possible → too few D/G and too low cap.
    const sel: Selection = {};
    for (const t of teamIds) {
      const c = selectableCandidates(league, s.protections[t]!);
      const f = c.filter((p) => groupOf(p.position) === 'F').sort((a, b) => a.contract!.capHit - b.contract!.capHit)[0];
      sel[t] = (f ?? c[0]!).id;
    }
    const v = validateSelection(league, s.protections, sel);
    const codes = v.map((x) => x.code);
    expect(codes).toContain('MIN_D');
    expect(codes).toContain('MIN_G');
    expect(codes).toContain('CAP_MIN');
    expect(v.find((x) => x.code === 'MIN_D')!.message).toMatch(/mindestens 9 Verteidiger/);
  });

  it('reports cap overflow', () => {
    const sel: Selection = {};
    for (const t of teamIds) {
      const c = selectableCandidates(league, s.protections[t]!).sort((a, b) => b.contract!.capHit - a.contract!.capHit);
      sel[t] = c[0]!.id;
    }
    const v = validateSelection(league, s.protections, sel);
    const total = Object.values(sel).reduce((sum, id) => sum + league.players[id]!.contract!.capHit, 0);
    if (total > league.config.salaryCap) expect(v.map((x) => x.code)).toContain('CAP_MAX');
  });

  it('tracker turns everything green for a valid selection', () => {
    const sum = summarizeSelection(league, s.protections, mock);
    expect(sum.constraints.every((c) => c.status === 'ok')).toBe(true);
    expect(sum.picks).toBe(32);
  });
});

describe('draft flow', () => {
  it('submits, moves players and grades; same inputs → same result', () => {
    const run = () => {
      const league = withFranchise('flow');
      let s = startExpansionDraft(league);
      const mock = mockDraft(league, s.protections);
      for (const [t, id] of Object.entries(mock)) s = selectPlayer(league, s, t, id);
      const res = submitExpansionDraft(league, s);
      if (!res.ok) throw new Error(res.violations.map((v) => v.message).join('\n'));
      return res;
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    if (!a.ok) return;
    const roster = Object.values(a.league.players).filter((p) => p.teamId === EXPANSION_TEAM_ID);
    expect(roster).toHaveLength(32);
    expect(roster.filter((p) => !p.farm)).toHaveLength(23);
    expect(a.state.grades!.overall).toBe('A');
  });

  it('refuses invalid submissions', () => {
    const league = withFranchise('flow-invalid');
    const s = startExpansionDraft(league);
    const res = submitExpansionDraft(league, s);
    expect(res.ok).toBe(false);
  });

  it('grades a weak draft lower than the mock', () => {
    const league = withFranchise('grades');
    const s = startExpansionDraft(league);
    const mock = mockDraft(league, s.protections);
    const g = gradeDraft(league, s.protections, mock, mock);
    expect(g.overall).toBe('A');
    expect(g.picks.every((p) => ['A', 'B', 'C', 'D', 'F'].includes(p.grade))).toBe(true);
  });
});

describe('scouting', () => {
  it('ranges contain the truth and narrow with each level', () => {
    const league = withFranchise('scout');
    for (const p of Object.values(league.players).slice(0, 200)) {
      let prev = scoutView(league.seed, p, 0);
      for (let l = 0; l <= 3; l++) {
        const v = scoutView(league.seed, p, l);
        expect(v.ovr[0]).toBeLessThanOrEqual(p.ovr);
        expect(v.ovr[1]).toBeGreaterThanOrEqual(p.ovr);
        expect(v.ovr[1] - v.ovr[0]).toBeLessThanOrEqual(prev.ovr[1] - prev.ovr[0]);
        expect(v.ovr[0]).toBeGreaterThanOrEqual(prev.ovr[0] - 1);
        expect(v.ovr[1]).toBeLessThanOrEqual(prev.ovr[1] + 1);
        prev = v;
      }
    }
  });

  it('spends budget and stops at the limit', () => {
    const league = withFranchise('budget');
    let s = startExpansionDraft(league);
    const ids = Object.values(s.protections).flatMap((l) => l.exposedIds);
    for (const id of ids) for (let k = 0; k < 3; k++) s = scoutPlayer(s, id);
    expect(s.scoutingSpent).toBe(s.scoutingBudget);
  });
});
