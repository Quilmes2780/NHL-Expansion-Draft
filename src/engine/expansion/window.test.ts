import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { EXPANSION_TEAM_ID, createFranchise } from '../franchise';
import { generateLeague } from '../gen/league';
import type { League, Player } from '../model';
import {
  acceptDeal,
  autoFillSelection,
  blockedPlayers,
  declineDeal,
  effectiveLeague,
  makeOffer,
  selectPlayer,
  startExpansionDraft,
  submitExpansionDraft,
  teamLock,
  validateDraft,
} from './draft';
import type { ExpansionDraftState } from './draft';
import { isExempt, isPendingRfa, isPendingUfa } from './eligibility';
import type { Offer } from './negotiation';
import { MAX_OFFERS, negotiationProfile, offerUtility } from './negotiation';
import { generateSideDeals } from './sidedeals';
import { mockDraft, validateSelection } from './selection';

function setup(seed: string, cityId = 'houston'): { league: League; s: ExpansionDraftState } {
  const league = createFranchise(generateLeague(seed, defaultConfig()), {
    cityId,
    name: 'Test',
    abbrev: 'TST',
    colors: { primary: '#000000', secondary: '#ffffff', accent: '#888888' },
    logo: { shape: 'circle', icon: 'star', colors: { primary: '#000000', secondary: '#ffffff', accent: '#888888' }, text: '' },
    mandate: 'patientBuild',
  }).league;
  return { league, s: startExpansionDraft(league) };
}

function exposedFas(league: League, s: ExpansionDraftState, pred: (p: Player) => boolean): Player[] {
  return Object.values(s.protections)
    .flatMap((l) => l.exposedIds)
    .map((id) => league.players[id] as Player)
    .filter(pred);
}

const generous = (league: League, p: Player): Offer => {
  const prof = negotiationProfile(league, p);
  return { salary: Math.min(Math.round(prof.ask * 1.25 / 25_000) * 25_000, league.config.salaryCap * 0.2), years: prof.prefYears, role: prof.desiredRole };
};

describe('negotiation window', () => {
  it('generous offers get signed, the signing becomes the locked pick and fixes the UFA rule', () => {
    const { league, s } = setup('neg-1');
    const ufa = exposedFas(league, s, isPendingUfa)[0]!;
    const after = makeOffer(league, s, ufa.id, generous(league, ufa));
    expect(after.negotiations[ufa.id]!.status).toBe('signed');
    const teamId = after.negotiations[ufa.id]!.teamId;
    expect(after.selection[teamId]).toBe(ufa.id);
    expect(teamLock(after, teamId)).toBe('signing');
    // The pick cannot be changed afterwards.
    expect(selectPlayer(league, after, teamId, null)).toBe(after);
    const eff = effectiveLeague(league, after);
    expect(eff.players[ufa.id]!.contract!.yearsLeft).toBeGreaterThanOrEqual(1);
    expect(validateDraft(league, after).map((v) => v.code)).not.toContain('PENDING_UFA');
  });

  it('lowball offers are rejected and the player eventually walks away', () => {
    const { league, s } = setup('neg-2');
    const ufa = exposedFas(league, s, (p) => isPendingUfa(p) && p.ovr >= 68)[0]!;
    let st = s;
    for (let i = 0; i < MAX_OFFERS + 2; i++) st = makeOffer(league, st, ufa.id, { salary: league.config.minSalary, years: 1, role: 'depth' });
    const neg = st.negotiations[ufa.id]!;
    expect(neg.status).toBe('walked');
    expect(neg.offers.length).toBeLessThanOrEqual(MAX_OFFERS);
    expect(neg.offers.every((o) => o.response !== 'accept')).toBe(true);
    // No more offers after walking away.
    expect(makeOffer(league, st, ufa.id, generous(league, ufa))).toBe(st);
  });

  it('accepting the counter offer always closes the deal', () => {
    let tested = 0;
    for (let i = 0; i < 6 && tested < 5; i++) {
      const { league, s } = setup(`neg-counter-${i}`);
      for (const p of exposedFas(league, s, (x) => isPendingUfa(x) || isPendingRfa(x)).slice(0, 4)) {
        const prof = negotiationProfile(league, p);
        const salary = Math.max(league.config.minSalary, Math.round((prof.ask * 0.9) / 25_000) * 25_000);
        const first = makeOffer(league, s, p.id, { salary, years: prof.prefYears, role: prof.desiredRole });
        const rec = first.negotiations[p.id]!.offers[0]!;
        if (rec.response !== 'counter' || !rec.counter) continue;
        const second = makeOffer(league, first, p.id, rec.counter);
        expect(second.negotiations[p.id]!.status).toBe('signed');
        tested++;
      }
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('city factors matter: a tax haven beats a high-tax market for the same offer', () => {
    const a = setup('neg-city', 'houston');
    const b = setup('neg-city', 'quebec');
    const p = exposedFas(a.league, a.s, isPendingUfa)[0]!;
    const offer: Offer = { salary: 3_000_000, years: 3, role: 'middle' };
    expect(offerUtility(a.league, p, offer)).toBeGreaterThan(offerUtility(b.league, p, offer));
  });

  it('is deterministic', () => {
    const run = () => {
      const { league, s } = setup('neg-det');
      const p = exposedFas(league, s, isPendingUfa)[0]!;
      let st = makeOffer(league, s, p.id, { salary: 1_500_000, years: 2, role: 'middle' });
      st = makeOffer(league, st, p.id, { salary: 2_500_000, years: 3, role: 'middle' });
      return JSON.stringify(st.negotiations);
    };
    expect(run()).toBe(run());
  });
});

describe('side deals', () => {
  it('are generated deterministically with assets the offering team owns', () => {
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const { league, s } = setup(`deals-${i}`);
      expect(generateSideDeals(league, s.protections)).toEqual(s.deals);
      for (const d of s.deals) {
        total++;
        expect(s.protections[d.teamId]!.exposedIds).toContain(d.playerId);
        if (d.asset.kind === 'pick') {
          const pickId = d.asset.pickId;
          expect(league.picks.find((p) => p.id === pickId)!.ownerTeamId).toBe(d.teamId);
        } else {
          const pr = league.players[d.asset.playerId]!;
          expect(pr.teamId).toBe(d.teamId);
          expect(isExempt(pr, league.config.rules)).toBe(true);
        }
      }
      const assets = s.deals.map((d) => JSON.stringify(d.asset));
      expect(new Set(assets).size).toBe(assets.length);
    }
    expect(total).toBeGreaterThan(10);
  });

  it('take deals fix the pick, avoid deals block the player, and both are validated', () => {
    for (let i = 0; i < 15; i++) {
      const { league, s } = setup(`deals-flow-${i}`);
      const take = s.deals.find((d) => d.type === 'take');
      const avoid = s.deals.find((d) => d.type === 'avoid' && d.teamId !== take?.teamId);
      if (!take || !avoid) continue;
      let st = acceptDeal(s, take.id).state;
      expect(st.selection[take.teamId]).toBe(take.playerId);
      expect(teamLock(st, take.teamId)).toBe('deal');
      st = acceptDeal(st, avoid.id).state;
      expect(blockedPlayers(st).has(avoid.playerId)).toBe(true);
      expect(selectPlayer(league, st, avoid.teamId, avoid.playerId)).toBe(st);

      // Manually broken states are caught by the validator.
      const broken = { ...st, selection: { ...st.selection, [take.teamId]: 'nope', [avoid.teamId]: avoid.playerId } };
      const codes = validateDraft(league, broken).map((v) => v.code);
      expect(codes).toContain('DEAL_TAKE');
      expect(codes).toContain('DEAL_AVOID');

      // Auto-fill respects both deals and yields a valid list; submitting moves the assets.
      const filled = autoFillSelection(league, st);
      expect(filled.selection[take.teamId]).toBe(take.playerId);
      expect(filled.selection[avoid.teamId]).not.toBe(avoid.playerId);
      expect(validateDraft(league, filled)).toEqual([]);
      const res = submitExpansionDraft(league, filled);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      for (const d of [take, avoid]) {
        if (d.asset.kind === 'pick') {
          const pickId = d.asset.pickId;
          expect(res.league.picks.find((p) => p.id === pickId)!.ownerTeamId).toBe(EXPANSION_TEAM_ID);
        } else expect(res.league.players[d.asset.playerId]!.teamId).toBe(EXPANSION_TEAM_ID);
      }
      expect(res.state.acquired).toHaveLength(2);
      return;
    }
    throw new Error('no seed with both deal types found');
  });

  it('detects conflicts with signings and declined deals stay declined', () => {
    for (let i = 0; i < 20; i++) {
      const { league, s } = setup(`deals-conflict-${i}`);
      const take = s.deals.find((d) => d.type === 'take');
      if (!take) continue;
      const fa = exposedFas(league, s, isPendingUfa).find((p) => s.protections[take.teamId]!.exposedIds.includes(p.id));
      if (!fa) continue;
      const signed = makeOffer(league, s, fa.id, generous(league, fa));
      if (signed.negotiations[fa.id]?.status !== 'signed') continue;
      const res = acceptDeal(signed, take.id);
      expect(res.error).toMatch(/bereits einen Spieler/);
      const declined = declineDeal(s, take.id);
      expect(acceptDeal(declined, take.id).error).toBeTruthy();
      return;
    }
    throw new Error('no conflict scenario found');
  });

  it('grades against the plain AI mock draft (no deals, no signings)', () => {
    const { league, s } = setup('deals-value');
    let st = s;
    for (const d of s.deals.filter((x) => x.type === 'avoid')) st = acceptDeal(st, d.id).state;
    st = autoFillSelection(league, st);
    const res = submitExpansionDraft(league, st);
    if (!res.ok) throw new Error(res.violations.map((v) => v.message).join('\n'));
    expect(validateSelection(effectiveLeague(league, st), st.protections, st.selection)).toEqual([]);
    expect(res.state.grades!.mock).toEqual(mockDraft(league, s.protections));
  });
});
