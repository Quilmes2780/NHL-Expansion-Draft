/** Headless helpers: run the whole pipeline (draft → offseason) with automatic decisions. */

import { defaultConfig } from '../config';
import { EXPANSION_TEAM_ID, createFranchise } from '../franchise';
import { generateLeague } from '../gen/league';
import type { League } from '../model';
import { pickActiveRoster, playersOfTeam } from '../model';
import { negotiationProfile } from '../expansion/negotiation';
import { offerOwnRfa } from '../offseason/freeagency';
import { selectPlayer, startExpansionDraft, submitExpansionDraft } from '../expansion/draft';
import { mockDraft } from '../expansion/selection';
import { simEntryDraft } from '../offseason/entrydraft';
import { FA_DAYS, advanceFaDay } from '../offseason/freeagency';
import { autoLineup } from '../offseason/lineup';
import type { Lineup } from '../offseason/lineup';
import { finishEntryDraft, startOffseason } from '../offseason/offseason';

/** A league right before opening night, with every decision made automatically. */
export function autoPreseason(seed: string): { league: League; lineup: Lineup } {
  const founded = createFranchise(generateLeague(seed, defaultConfig()), {
    cityId: 'kansascity',
    name: 'Auto',
    abbrev: 'AUT',
    colors: { primary: '#123456', secondary: '#abcdef', accent: '#ffffff' },
    logo: { shape: 'circle', icon: 'star', colors: { primary: '#123456', secondary: '#abcdef', accent: '#ffffff' }, text: '' },
    mandate: 'patientBuild',
  }).league;
  let s = startExpansionDraft(founded);
  for (const [t, id] of Object.entries(mockDraft(founded, s.protections))) s = selectPlayer(founded, s, t, id);
  const res = submitExpansionDraft(founded, s);
  if (!res.ok) throw new Error('auto draft failed');
  const off = startOffseason(res.league);
  const d = simEntryDraft(off.league, off.state.draft);
  const fa = finishEntryDraft(d.league, { ...off.state, draft: d.state });
  let lg = fa.league;
  let st = fa.state.fa!;
  // Re-sign own RFAs generously, like a sensible GM would.
  for (const pid of Object.keys(st.ownRfas)) {
    const p = lg.players[pid]!;
    const prof = negotiationProfile(lg, p);
    ({ league: lg, state: st } = offerOwnRfa(lg, st, pid, { salary: Math.round((prof.ask * 1.2) / 25_000) * 25_000, years: prof.prefYears, role: prof.desiredRole }));
  }
  for (let i = 0; i < FA_DAYS; i++) ({ league: lg, state: st } = advanceFaDay(lg, st));
  // Best balanced NHL roster from everyone under contract.
  const signed = playersOfTeam(lg, EXPANSION_TEAM_ID).filter((p) => p.contract && p.contract.yearsLeft >= 1);
  const active = pickActiveRoster(signed);
  const players = { ...lg.players };
  for (const p of playersOfTeam(lg, EXPANSION_TEAM_ID)) players[p.id] = { ...p, farm: !active.has(p.id) };
  lg = { ...lg, players };
  return { league: lg, lineup: autoLineup(lg, EXPANSION_TEAM_ID) };
}
