/** Expansion draft state and its pure transitions. */

import { EXPANSION_TEAM_ID } from '../franchise';
import type { League, Player } from '../model';
import { pickActiveRoster } from '../model';
import type { AnalystComment } from './analyst';
import { revealComments } from './analyst';
import type { Negotiation, Offer, Signing } from './negotiation';
import { contractFromOffer, isNegotiable, newNegotiation, respondToOffer } from './negotiation';
import type { ProtectionList, Violation } from './protection';
import { aiProtectAll } from './protection';
import { MAX_SCOUT_LEVEL, SCOUT_COST, rangeMid, scoutView } from './scouting';
import type { DraftGrades, Selection } from './selection';
import { expansionValue, gradeDraft, isSelectable, mockDraft, validateSelection } from './selection';
import type { DealAsset, SideDeal } from './sidedeals';
import { assetLabel, assetValue, generateSideDeals } from './sidedeals';

export interface ExpansionDraftState {
  protections: Record<string, ProtectionList>;
  comments: AnalystComment[];
  scouting: Record<string, number>;
  scoutingBudget: number;
  scoutingSpent: number;
  selection: Selection;
  wishlist: string[];
  negotiations: Record<string, Negotiation>;
  /** Signed pending FAs (player id → signing). A signing counts as the pick from that team. */
  signings: Record<string, Signing>;
  deals: SideDeal[];
  /** Set once the draft has been submitted successfully. */
  grades: DraftGrades | null;
  /** Player id → original team id, for the draft review. */
  origins: Record<string, string>;
  /** Assets received from side deals (after the draft). */
  acquired: DealAsset[];
}

export function startExpansionDraft(league: League): ExpansionDraftState {
  const protections = aiProtectAll(league);
  return {
    protections,
    comments: revealComments(league, protections),
    scouting: {},
    scoutingBudget: league.config.scoutingBudget[league.config.difficulty],
    scoutingSpent: 0,
    selection: {},
    wishlist: [],
    negotiations: {},
    signings: {},
    deals: generateSideDeals(league, protections),
    grades: null,
    origins: {},
    acquired: [],
  };
}

export const scoutLevel = (s: ExpansionDraftState, playerId: string): number => s.scouting[playerId] ?? 0;

export function canScout(s: ExpansionDraftState, playerId: string): boolean {
  return !s.grades && scoutLevel(s, playerId) < MAX_SCOUT_LEVEL && s.scoutingSpent + SCOUT_COST <= s.scoutingBudget;
}

export function scoutPlayer(s: ExpansionDraftState, playerId: string): ExpansionDraftState {
  if (!canScout(s, playerId)) return s;
  return {
    ...s,
    scouting: { ...s.scouting, [playerId]: scoutLevel(s, playerId) + 1 },
    scoutingSpent: s.scoutingSpent + SCOUT_COST,
  };
}

/** The league as seen with the contracts signed in the negotiation window applied. */
export function effectiveLeague(league: League, s: ExpansionDraftState): League {
  const signings = Object.values(s.signings);
  if (!signings.length) return league;
  const players = { ...league.players };
  for (const sg of signings) {
    const p = players[sg.playerId];
    if (p) players[sg.playerId] = { ...p, contract: sg.contract };
  }
  return { ...league, players };
}

export function teamOfExposed(s: ExpansionDraftState, playerId: string): string | null {
  for (const [teamId, list] of Object.entries(s.protections)) if (list.exposedIds.includes(playerId)) return teamId;
  return null;
}

export type LockReason = 'signing' | 'deal';

/** Teams whose pick is fixed by a signing or an accepted "take" deal. */
export function teamLock(s: ExpansionDraftState, teamId: string): LockReason | null {
  if (Object.values(s.signings).some((sg) => sg.teamId === teamId)) return 'signing';
  if (s.deals.some((d) => d.teamId === teamId && d.type === 'take' && d.status === 'accepted')) return 'deal';
  return null;
}

/** Players you promised not to take (accepted "avoid" deals). */
export function blockedPlayers(s: ExpansionDraftState): Set<string> {
  return new Set(s.deals.filter((d) => d.type === 'avoid' && d.status === 'accepted').map((d) => d.playerId));
}

export function selectPlayer(league: League, s: ExpansionDraftState, teamId: string, playerId: string | null): ExpansionDraftState {
  if (s.grades || teamLock(s, teamId)) return s;
  const selection = { ...s.selection };
  if (playerId === null) delete selection[teamId];
  else {
    const list = s.protections[teamId];
    const p = effectiveLeague(league, s).players[playerId];
    if (!list || !p || !list.exposedIds.includes(playerId) || !isSelectable(p) || blockedPlayers(s).has(playerId)) return s;
    selection[teamId] = playerId;
  }
  return { ...s, selection };
}

/** Remove all picks that are not fixed by signings or deals. */
export function clearSelection(s: ExpansionDraftState): ExpansionDraftState {
  if (s.grades) return s;
  const selection: Selection = {};
  for (const [t, id] of Object.entries(s.selection)) if (teamLock(s, t)) selection[t] = id;
  return { ...s, selection };
}

export function toggleWishlist(s: ExpansionDraftState, playerId: string): ExpansionDraftState {
  const has = s.wishlist.includes(playerId);
  return { ...s, wishlist: has ? s.wishlist.filter((x) => x !== playerId) : [...s.wishlist, playerId] };
}

// ---------------------------------------------------------------- negotiation window

/** Why negotiating with this player is not possible right now (null = possible). */
export function negotiationBlocker(league: League, s: ExpansionDraftState, playerId: string): string | null {
  if (s.grades) return 'Der Draft ist abgeschlossen.';
  const p = league.players[playerId];
  const teamId = teamOfExposed(s, playerId);
  if (!p || !teamId) return 'Nur exponierte Spieler können verhandelt werden.';
  if (!isNegotiable(p)) return 'Nur pending UFAs und RFAs haben ein Verhandlungsfenster.';
  if (s.signings[playerId]) return null;
  const lock = teamLock(s, teamId);
  if (lock === 'signing') return 'Von diesem Team hast du bereits einen Spieler unter Vertrag genommen.';
  if (lock === 'deal') return 'Ein Side Deal legt deinen Pick von diesem Team bereits fest.';
  if (blockedPlayers(s).has(playerId)) return 'Du hast per Side Deal zugesagt, diesen Spieler nicht zu nehmen.';
  return null;
}

export function makeOffer(league: League, s: ExpansionDraftState, playerId: string, offer: Offer): ExpansionDraftState {
  if (negotiationBlocker(league, s, playerId)) return s;
  const p = league.players[playerId] as Player;
  const teamId = teamOfExposed(s, playerId) as string;
  const neg = s.negotiations[playerId] ?? newNegotiation(p, teamId);
  const next = respondToOffer(league, p, neg, offer);
  if (next === neg) return s;
  const state: ExpansionDraftState = { ...s, negotiations: { ...s.negotiations, [playerId]: next } };
  if (next.status === 'signed') {
    state.signings = { ...s.signings, [playerId]: { playerId, teamId, contract: contractFromOffer(p, offer), role: offer.role } };
    state.selection = { ...s.selection, [teamId]: playerId };
  }
  return state;
}

// ---------------------------------------------------------------- side deals

export function dealConflict(s: ExpansionDraftState, deal: SideDeal): string | null {
  if (deal.status !== 'open') return 'Dieses Angebot ist nicht mehr offen.';
  if (s.grades) return 'Der Draft ist abgeschlossen.';
  const signing = Object.values(s.signings).find((sg) => sg.teamId === deal.teamId);
  const otherTake = s.deals.find((d) => d.teamId === deal.teamId && d.type === 'take' && d.status === 'accepted');
  if (deal.type === 'take') {
    if (signing) return 'Du hast von diesem Team bereits einen Spieler unter Vertrag genommen – ein zweiter Pick ist nicht möglich.';
    if (otherTake) return 'Ein anderer Side Deal legt deinen Pick von diesem Team bereits fest.';
    if (blockedPlayers(s).has(deal.playerId)) return 'Du hast zugesagt, diesen Spieler nicht zu nehmen.';
  } else {
    if (signing?.playerId === deal.playerId) return 'Du hast diesen Spieler bereits unter Vertrag genommen.';
    if (otherTake?.playerId === deal.playerId) return 'Ein anderer Side Deal verpflichtet dich, genau diesen Spieler zu nehmen.';
  }
  return null;
}

export function acceptDeal(s: ExpansionDraftState, dealId: string): { state: ExpansionDraftState; error: string | null } {
  const deal = s.deals.find((d) => d.id === dealId);
  if (!deal) return { state: s, error: 'Unbekanntes Angebot.' };
  const conflict = dealConflict(s, deal);
  if (conflict) return { state: s, error: conflict };
  const deals = s.deals.map((d) => (d.id === dealId ? { ...d, status: 'accepted' as const } : d));
  const selection = { ...s.selection };
  if (deal.type === 'take') selection[deal.teamId] = deal.playerId;
  else if (selection[deal.teamId] === deal.playerId) delete selection[deal.teamId];
  return { state: { ...s, deals, selection }, error: null };
}

export function declineDeal(s: ExpansionDraftState, dealId: string): ExpansionDraftState {
  if (s.grades) return s;
  return { ...s, deals: s.deals.map((d) => (d.id === dealId && d.status === 'open' ? { ...d, status: 'declined' as const } : d)) };
}

// ---------------------------------------------------------------- auto fill, validation, submit

/** Value as the player's scouts see it: ratings replaced by the midpoints of the scouted ranges. */
export function perceivedValue(league: League, s: ExpansionDraftState, p: Player): number {
  const view = scoutView(league.seed, p, scoutLevel(s, p.id));
  return expansionValue({ ...p, ovr: rangeMid(view.ovr), potential: rangeMid(view.potential) }, league.config);
}

/** Fill the teams without a pick using only the information the player has (no true ratings). */
export function autoFillSelection(league: League, s: ExpansionDraftState): ExpansionDraftState {
  if (s.grades) return s;
  const eff = effectiveLeague(league, s);
  const selection = mockDraft(eff, s.protections, s.selection, (p) => perceivedValue(eff, s, p), blockedPlayers(s));
  return { ...s, selection };
}

/** Full validation: roster rules plus binding side deals and signings. */
export function validateDraft(league: League, s: ExpansionDraftState): Violation[] {
  const v = validateSelection(effectiveLeague(league, s), s.protections, s.selection);
  const name = (id: string) => {
    const p = league.players[id];
    return p ? `${p.firstName} ${p.lastName}` : id;
  };
  const abbrev = (id: string) => league.teams.find((t) => t.id === id)?.abbrev ?? id;
  for (const d of s.deals) {
    if (d.status !== 'accepted') continue;
    if (d.type === 'take' && s.selection[d.teamId] !== d.playerId)
      v.push({ code: 'DEAL_TAKE', message: `Side Deal mit ${abbrev(d.teamId)}: Du hast zugesagt, ${name(d.playerId)} zu wählen.` });
    if (d.type === 'avoid' && s.selection[d.teamId] === d.playerId)
      v.push({ code: 'DEAL_AVOID', message: `Side Deal mit ${abbrev(d.teamId)}: Du hast zugesagt, ${name(d.playerId)} nicht zu wählen.` });
  }
  for (const sg of Object.values(s.signings)) {
    if (s.selection[sg.teamId] !== sg.playerId)
      v.push({ code: 'SIGNING', message: `Die Unterschrift von ${name(sg.playerId)} zählt als Pick von ${abbrev(sg.teamId)}.` });
  }
  return v;
}

export type SubmitResult =
  | { ok: false; violations: Violation[] }
  | { ok: true; league: League; state: ExpansionDraftState };

/** Validate and execute the draft: players and deal assets move to the expansion team, grades are computed. */
export function submitExpansionDraft(league: League, s: ExpansionDraftState): SubmitResult {
  const violations = validateDraft(league, s);
  if (violations.length) return { ok: false, violations };
  const eff = effectiveLeague(league, s);
  // "What the AI would have done": same lists, no signings and no deals.
  const mock = mockDraft(league, s.protections);
  const mockValue = Object.values(mock).reduce((sum, id) => sum + expansionValue(league.players[id] as Player, league.config), 0);
  const accepted = s.deals.filter((d) => d.status === 'accepted');
  const bonus: Record<string, { value: number; note: string }> = {};
  for (const d of accepted) {
    const prev = bonus[d.teamId];
    bonus[d.teamId] = {
      value: (prev?.value ?? 0) + assetValue(d.asset, league),
      note: `${prev ? prev.note + ' ' : ''}Side Deal: +${assetLabel(d.asset, league)}.`,
    };
  }
  const grades = gradeDraft(eff, s.protections, s.selection, mock, { bonus, mockValue });

  const players = { ...eff.players };
  const picked = Object.values(s.selection).map((id) => eff.players[id] as Player);
  const origins: Record<string, string> = {};
  for (const [teamId, id] of Object.entries(s.selection)) origins[id] = teamId;
  // A balanced NHL roster of 23, the rest start in the farm team.
  const active = pickActiveRoster(picked, league.config.activeRosterSize);
  for (const p of picked) players[p.id] = { ...p, teamId: EXPANSION_TEAM_ID, farm: !active.has(p.id) };
  let picks = eff.picks;
  for (const d of accepted) {
    if (d.asset.kind === 'pick') {
      const pickId = d.asset.pickId;
      picks = picks.map((pk) => (pk.id === pickId ? { ...pk, ownerTeamId: EXPANSION_TEAM_ID } : pk));
    } else {
      const pr = players[d.asset.playerId];
      if (pr) players[pr.id] = { ...pr, teamId: EXPANSION_TEAM_ID, farm: true };
    }
  }
  return {
    ok: true,
    league: { ...eff, players, picks },
    state: { ...s, grades, origins, acquired: accepted.map((d) => d.asset) },
  };
}
