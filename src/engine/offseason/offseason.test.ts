import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { EXPANSION_TEAM_ID, createFranchise } from '../franchise';
import { generateLeague } from '../gen/league';
import type { League, Player } from '../model';
import { activePlayers, playersOfTeam, teamPayroll } from '../model';
import { selectPlayer, startExpansionDraft, submitExpansionDraft } from '../expansion/draft';
import { mockDraft } from '../expansion/selection';
import { availableProspects, currentSlot, isDraftDone, runLottery, simEntryDraft, userDraftPick } from './entrydraft';
import { FA_DAYS, advanceFaDay, placeUserOffer } from './freeagency';
import { autoLineup, seasonReadiness, setFarm, validateLineup } from './lineup';
import { finishEntryDraft, startOffseason } from './offseason';
import { evaluateTrade, executeTrade, packageValue, playerTradeValue } from './trade';
import { negotiationProfile } from '../expansion/negotiation';

function postDraft(seed: string): League {
  const league = createFranchise(generateLeague(seed, defaultConfig()), {
    cityId: 'hartford',
    name: 'Test',
    abbrev: 'HFD',
    colors: { primary: '#000000', secondary: '#ffffff', accent: '#888888' },
    logo: { shape: 'circle', icon: 'star', colors: { primary: '#000000', secondary: '#ffffff', accent: '#888888' }, text: '' },
    mandate: 'patientBuild',
  }).league;
  let s = startExpansionDraft(league);
  for (const [t, id] of Object.entries(mockDraft(league, s.protections))) s = selectPlayer(league, s, t, id);
  const res = submitExpansionDraft(league, s);
  if (!res.ok) throw new Error('draft failed');
  return res.league;
}

describe('draft lottery', () => {
  it('gives the expansion team the third-worst odds and is deterministic', () => {
    const lg = postDraft('lottery');
    const a = runLottery(lg);
    expect(a).toEqual(runLottery(lg));
    expect(a.standing[2]).toBe(EXPANSION_TEAM_ID);
    expect(a.standing).toHaveLength(33);
    const sum = Object.values(a.odds).reduce((x, y) => x + y, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(a.odds[EXPANSION_TEAM_ID]).toBeCloseTo(a.odds[a.standing[3]!]!, 6);
    expect(a.round1.slice(0, 2)).toEqual(a.winners);
    expect(new Set(a.round1).size).toBe(33);
  });

  it('lets the lottery winners come from the eligible range only', () => {
    for (let i = 0; i < 20; i++) {
      const r = runLottery(postDraft(`lot-${i}`));
      expect(r.standing.indexOf(r.winners[0])).toBeLessThanOrEqual(10);
      expect(r.standing.indexOf(r.winners[1])).toBeLessThanOrEqual(11);
    }
  });
});

describe('entry draft', () => {
  it('fills every slot exactly once, respects pick ownership and starts on the user pick', () => {
    const { league, state } = startOffseason(postDraft('edraft'));
    expect(currentSlot(state.draft)?.ownerTeamId).toBe(EXPANSION_TEAM_ID);
    const pick = availableProspects(state.draft)[0]!;
    const after = userDraftPick(league, state.draft, pick.id);
    expect(after.league.players[pick.id]!.teamId).toBe(EXPANSION_TEAM_ID);
    const done = simEntryDraft(after.league, after.state);
    expect(isDraftDone(done.state)).toBe(true);
    const ids = done.state.slots.map((s) => s.playerId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of done.state.slots) expect(done.league.players[s.playerId!]!.teamId).toBe(s.ownerTeamId);
    expect(done.state.slots.length).toBe(33 * 7);
  });
});

describe('free agency', () => {
  function faSetup(seed: string) {
    const off = startOffseason(postDraft(seed));
    const d = simEntryDraft(off.league, off.state.draft);
    return finishEntryDraft(d.league, { ...off.state, draft: d.state });
  }

  it('respects the cap for user offers and resolves deterministically', () => {
    const run = () => {
      const { league, state } = faSetup('fa-1');
      const fa = state.fa!;
      const target = fa.pool.map((id) => league.players[id]!).sort((a, b) => b.ovr - a.ovr)[0]!;
      const huge = placeUserOffer(league, fa, target.id, { salary: league.config.salaryCap * 0.2, years: 3, role: 'top' });
      const prof = negotiationProfile(league, target);
      const ok = placeUserOffer(league, fa, target.id, { salary: Math.min(prof.ask, 3_000_000), years: prof.prefYears, role: prof.desiredRole });
      let lg = league;
      let st = ok.state;
      for (let d = 0; d < FA_DAYS; d++) ({ league: lg, state: st } = advanceFaDay(lg, st));
      return { huge: huge.error, lg, st };
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a.st)).toBe(JSON.stringify(b.st));
    expect(a.st.done).toBe(true);
    for (const t of a.lg.teams) expect(teamPayroll(a.lg, t.id)).toBeLessThanOrEqual(a.lg.config.salaryCap);
    expect(a.st.log.length).toBeGreaterThan(10);
  });

  it('AI teams fill their holes', () => {
    const { league, state } = faSetup('fa-2');
    let lg = league;
    let st = state.fa!;
    for (let d = 0; d < FA_DAYS; d++) ({ league: lg, state: st } = advanceFaDay(lg, st));
    const short = lg.teams.filter((t) => !t.isExpansion && activePlayers(lg, t.id).length < 18);
    expect(short.length).toBeLessThan(4);
  });
});

describe('trades', () => {
  const lg = postDraft('trades');
  const mine = playersOfTeam(lg, EXPANSION_TEAM_ID).filter((p) => !p.contract?.ntc && !p.contract?.nmc);
  const partner = lg.teams.find((t) => !t.isExpansion && t.personality === 'contender') ?? lg.teams[0]!;
  const theirs = playersOfTeam(lg, partner.id).filter((p) => !p.contract?.ntc && !p.contract?.nmc && p.contract && p.contract.yearsLeft >= 1);
  const star = [...theirs].sort((a, b) => b.ovr - a.ovr)[0]!;

  it('values stars exponentially higher than depth', () => {
    const depth = [...theirs].sort((a, b) => a.ovr - b.ovr)[0]!;
    expect(playerTradeValue(star, partner, lg)).toBeGreaterThan(playerTradeValue(depth, partner, lg) * 4);
    expect(packageValue([1, 1, 1, 1])).toBeLessThan(4 * 0.6);
  });

  it('rejects quantity-for-quality packages', () => {
    const depth = [...mine].sort((a, b) => a.ovr - b.ovr).slice(0, 5).map((p) => p.id);
    const ev = evaluateTrade(lg, { partnerId: partner.id, give: { players: depth, picks: [] }, get: { players: [star.id], picks: [] } });
    expect(ev.accepted).toBe(false);
  });

  it('rejects a star for one late pick and requires a margin', () => {
    const late = lg.picks.find((p) => p.ownerTeamId === EXPANSION_TEAM_ID && p.round >= 4);
    if (!late) return;
    const ev = evaluateTrade(lg, { partnerId: partner.id, give: { players: [], picks: [late.id] }, get: { players: [star.id], picks: [] } });
    expect(ev.accepted).toBe(false);
  });

  it('never lets the AI accept a trade that loses value for it, and round trips fail', () => {
    let accepted = 0;
    for (const t of lg.teams.filter((x) => !x.isExpansion).slice(0, 12)) {
      const their = playersOfTeam(lg, t.id).filter((p) => !p.contract?.ntc && !p.contract?.nmc && p.contract && p.contract.yearsLeft >= 1);
      for (const a of mine.slice(0, 8)) {
        for (const b of their.slice(0, 8)) {
          const prop = { partnerId: t.id, give: { players: [a.id], picks: [] }, get: { players: [b.id], picks: [] } };
          const ev = evaluateTrade(lg, prop);
          if (!ev.accepted) continue;
          accepted++;
          expect(ev.valueIn).toBeGreaterThan(ev.valueOut);
          const after = executeTrade(lg, prop);
          const back = evaluateTrade(after, { partnerId: t.id, give: { players: [b.id], picks: [] }, get: { players: [a.id], picks: [] } });
          expect(back.accepted).toBe(false);
        }
      }
    }
    expect(accepted).toBeGreaterThan(0);
  });

  it('checks ownership and moves assets on execution', () => {
    const bad = evaluateTrade(lg, { partnerId: partner.id, give: { players: [star.id], picks: [] }, get: { players: [], picks: [] } });
    expect(bad.accepted).toBe(false);
    const a = mine[0]!;
    const b = theirs[theirs.length - 1]!;
    const after = executeTrade(lg, { partnerId: partner.id, give: { players: [a.id], picks: [] }, get: { players: [b.id], picks: [] } });
    expect(after.players[a.id]!.teamId).toBe(partner.id);
    expect(after.players[b.id]!.teamId).toBe(EXPANSION_TEAM_ID);
  });
});

describe('lineup and roster', () => {
  // A healthy, fully signed roster (as it would be after a normal offseason).
  const raw = postDraft('lineup');
  const players = { ...raw.players };
  for (const p of playersOfTeam(raw, EXPANSION_TEAM_ID))
    players[p.id] = { ...p, injury: null, contract: p.contract ? { ...p.contract, yearsLeft: Math.max(1, p.contract.yearsLeft) } : null };
  const lg: League = { ...raw, players };

  it('auto lineup is valid and uses no player twice at even strength', () => {
    const l = autoLineup(lg, EXPANSION_TEAM_ID);
    expect(validateLineup(lg, EXPANSION_TEAM_ID, l).filter((i) => i.level === 'error')).toEqual([]);
    const es = [...l.forwards.flat(), ...l.defense.flat(), ...l.goalies];
    expect(new Set(es).size).toBe(es.length);
    expect(lg.players[l.goalies[0]!]!.position).toBe('G');
  });

  it('validation catches wrong goalies and duplicates', () => {
    const l = autoLineup(lg, EXPANSION_TEAM_ID);
    const broken = { ...l, goalies: [l.forwards[0]![1], l.goalies[1]] as typeof l.goalies };
    const msgs = validateLineup(lg, EXPANSION_TEAM_ID, broken).map((i) => i.message).join('\n');
    expect(msgs).toMatch(/kein Goalie/);
    expect(msgs).toMatch(/mehrfach/);
  });

  it('enforces the 23-man roster and readiness rules', () => {
    const farm = playersOfTeam(lg, EXPANSION_TEAM_ID).find((p) => p.farm && p.contract && p.contract.yearsLeft >= 1) as Player | undefined;
    if (farm) expect(setFarm(lg, farm.id, false).error).toMatch(/voll/);
    expect(seasonReadiness(lg, EXPANSION_TEAM_ID, autoLineup(lg, EXPANSION_TEAM_ID))).toEqual([]);
    expect(seasonReadiness(lg, EXPANSION_TEAM_ID, null).length).toBeGreaterThan(0);
  });
});
