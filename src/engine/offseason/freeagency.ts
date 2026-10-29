/**
 * Free agency: AI teams first re-sign some of their own pending FAs, the rest hit the market.
 * Over a few "days" the user and the AI teams make offers; each player picks the offer with the
 * best utility once it clears his (slowly falling) threshold.
 */

import type { Contract, League, Player, PositionGroup, Team } from '../model';
import { activePlayers, groupOf, playersOfTeam, teamPayroll, fullName } from '../model';
import { EXPANSION_TEAM_ID } from '../franchise';
import { maxSalary } from '../config';
import { rngFor } from '../rng';
import { formatMoney, marketValue } from '../value';
import type { Negotiation, Offer, Role } from '../expansion/negotiation';
import {
  ROLE_RANK,
  cityFit,
  contractFromOffer,
  negotiationProfile,
  newNegotiation,
  respondToOffer,
  roleTerm,
  yearsTerm,
} from '../expansion/negotiation';

export const FA_DAYS = 5;
const ACTIVE_TARGET: Record<PositionGroup, number> = { F: 13, D: 8, G: 2 };
const MAX_ACTIVE = 23;

export interface FaEvent {
  day: number;
  playerId: string;
  teamId: string | null;
  text: string;
}

export interface FreeAgencyState {
  day: number;
  done: boolean;
  pool: string[];
  /** Open offers of the user, per player. */
  userOffers: Record<string, Offer>;
  /** Re-sign talks with the expansion team's own pending RFAs. */
  ownRfas: Record<string, Negotiation>;
  log: FaEvent[];
}

const round25k = (v: number): number => Math.round(v / 25_000) * 25_000;

const isPending = (p: Player): boolean => !!p.contract && p.contract.yearsLeft === 0;

function signTo(league: League, p: Player, teamId: string, contract: Contract): Player {
  const full = activePlayers(league, teamId).length >= MAX_ACTIVE;
  return { ...p, teamId, contract, farm: full };
}

/** AI re-sign pass; everything else that expires becomes a free agent. */
export function startFreeAgency(league: League): { league: League; state: FreeAgencyState } {
  const cfg = league.config;
  const players = { ...league.players };
  const pool: string[] = [];
  const ownRfas: Record<string, Negotiation> = {};
  const log: FaEvent[] = [];
  for (const team of league.teams) {
    const pending = playersOfTeam(league, team.id).filter(isPending).sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id));
    if (team.isExpansion) {
      for (const p of pending) {
        if (p.contract?.expiryStatus === 'RFA') ownRfas[p.id] = newNegotiation(p, team.id);
        else {
          players[p.id] = { ...p, teamId: null, farm: false };
          pool.push(p.id);
        }
      }
      continue;
    }
    let payroll = teamPayroll(league, team.id);
    for (const p of pending) {
      const rng = rngFor(league.seed, 'resign', p.id);
      const wantKeep = p.contract?.expiryStatus === 'RFA' ? 0.88 : p.ovr >= 74 ? 0.45 : 0.25;
      const salary = round25k(Math.max(cfg.minSalary, marketValue(p.ovr, p.age, p.position, cfg) * rng.range(0.9, 1.08)));
      if (p.farm && p.ovr < 62) {
        // Farm depth simply re-ups on a cheap two-way deal.
        players[p.id] = { ...p, contract: { ...(p.contract as Contract), yearsLeft: rng.int(1, 2), twoWay: true, capHit: cfg.minSalary } };
        continue;
      }
      if (rng.chance(wantKeep) && payroll + salary <= cfg.salaryCap * 0.97) {
        const years = Math.max(1, Math.min(p.age >= 32 ? 2 : 5, rng.int(1, 5)));
        players[p.id] = { ...p, contract: { ...contractFromOffer(p, { salary, years, role: 'middle' }) } };
        payroll += salary;
        log.push({ day: 0, playerId: p.id, teamId: team.id, text: `${team.abbrev} verlängert mit ${fullName(p)} (${formatMoney(salary)} × ${years}).` });
      } else {
        players[p.id] = { ...p, teamId: null, farm: false };
        pool.push(p.id);
      }
    }
  }
  return {
    league: { ...league, players },
    state: { day: 1, done: false, pool: pool.sort(), userOffers: {}, ownRfas, log },
  };
}

/** How much a player likes an offer from a given team (≥ his threshold = he signs). */
export function faUtility(league: League, p: Player, teamId: string, offer: Offer): number {
  const prof = negotiationProfile(league, p);
  let team = 0;
  if (teamId === EXPANSION_TEAM_ID) team = cityFit(league, p);
  else {
    const t = league.teams.find((x) => x.id === teamId) as Team;
    team = (t.personality === 'contender' ? 0.04 : t.personality === 'rebuild' ? -0.02 : 0) + rngFor(league.seed, 'fafit', p.id, teamId).normal(0, 0.02);
  }
  return Math.min(1.3, offer.salary / prof.ask) + yearsTerm(offer.years, prof.prefYears) + roleTerm(offer.role, prof.desiredRole) + team;
}

export function userCapSpace(league: League, fa: FreeAgencyState, exceptPlayer?: string): number {
  const pending = Object.entries(fa.userOffers)
    .filter(([id]) => id !== exceptPlayer)
    .reduce((s, [, o]) => s + o.salary, 0);
  return league.config.salaryCap - teamPayroll(league, EXPANSION_TEAM_ID) - pending;
}

export function placeUserOffer(league: League, fa: FreeAgencyState, playerId: string, offer: Offer): { state: FreeAgencyState; error: string | null } {
  if (fa.done) return { state: fa, error: 'Die Free Agency ist beendet.' };
  if (!fa.pool.includes(playerId)) return { state: fa, error: 'Dieser Spieler ist nicht (mehr) auf dem Markt.' };
  if (offer.salary < league.config.minSalary || offer.salary > maxSalary(league.config) || offer.years < 1 || offer.years > 8)
    return { state: fa, error: 'Ungültiges Angebot.' };
  if (offer.salary > userCapSpace(league, fa, playerId))
    return { state: fa, error: `Nicht genug Cap Space: verfügbar ${formatMoney(Math.max(0, userCapSpace(league, fa, playerId)))} (offene Angebote eingerechnet).` };
  return { state: { ...fa, userOffers: { ...fa.userOffers, [playerId]: offer } }, error: null };
}

export function withdrawUserOffer(fa: FreeAgencyState, playerId: string): FreeAgencyState {
  const userOffers = { ...fa.userOffers };
  delete userOffers[playerId];
  return { ...fa, userOffers };
}

/** Re-sign talks with own pending RFAs (exclusive, reuses the negotiation mini-game). */
export function offerOwnRfa(league: League, fa: FreeAgencyState, playerId: string, offer: Offer): { league: League; state: FreeAgencyState } {
  const neg = fa.ownRfas[playerId];
  const p = league.players[playerId];
  if (!neg || !p || fa.done) return { league, state: fa };
  if (neg.status === 'open' && offer.salary > userCapSpace(league, fa)) return { league, state: fa };
  const next = respondToOffer(league, p, neg, offer);
  let lg = league;
  if (next.status === 'signed') lg = { ...league, players: { ...league.players, [p.id]: { ...p, contract: contractFromOffer(p, offer) } } };
  return { league: lg, state: { ...fa, ownRfas: { ...fa.ownRfas, [playerId]: next } } };
}

interface AiOffer {
  teamId: string;
  offer: Offer;
}

function aiOffers(league: League, fa: FreeAgencyState): Map<string, AiOffer[]> {
  const out = new Map<string, AiOffer[]>();
  const cfg = league.config;
  const pool = fa.pool.map((id) => league.players[id] as Player).sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id));
  for (const team of league.teams) {
    if (team.isExpansion) continue;
    const rng = rngFor(league.seed, 'fa-ai', team.id, fa.day);
    const active = activePlayers(league, team.id);
    const counts: Record<PositionGroup, number> = { F: 0, D: 0, G: 0 };
    for (const p of active) counts[groupOf(p.position)]++;
    let space = cfg.salaryCap - teamPayroll(league, team.id);
    let made = 0;
    for (const p of pool) {
      if (made >= 2) break;
      const g = groupOf(p.position);
      const need = counts[g] < ACTIVE_TARGET[g];
      const upgrade = active.filter((x) => groupOf(x.position) === g).some((x) => x.ovr + 3 < p.ovr) && rng.chance(0.25);
      if (!need && !upgrade) continue;
      const prof = negotiationProfile(league, p);
      const salary = round25k(prof.ask * rng.range(0.88, 1.06));
      if (salary > space * 0.9) continue;
      const years = Math.max(1, Math.min(8, prof.prefYears + rng.int(-1, 1)));
      const role: Role = p.ovr >= 76 ? 'top' : p.ovr >= 70 ? 'middle' : 'depth';
      const list = out.get(p.id) ?? [];
      list.push({ teamId: team.id, offer: { salary, years, role } });
      out.set(p.id, list);
      space -= salary;
      counts[g]++;
      made++;
    }
  }
  return out;
}

/** Resolve one free agency day. */
export function advanceFaDay(league: League, fa: FreeAgencyState): { league: League; state: FreeAgencyState } {
  if (fa.done) return { league, state: fa };
  const last = fa.day >= FA_DAYS;
  const offers = aiOffers(league, fa);
  for (const [pid, o] of Object.entries(fa.userOffers)) {
    const list = offers.get(pid) ?? [];
    list.push({ teamId: EXPANSION_TEAM_ID, offer: o });
    offers.set(pid, list);
  }
  let lg = league;
  const players = { ...league.players };
  const pool = new Set(fa.pool);
  const userOffers = { ...fa.userOffers };
  const log = [...fa.log];
  for (const pid of [...fa.pool].sort()) {
    const list = offers.get(pid);
    if (!list?.length) continue;
    const p = players[pid] as Player;
    const prof = negotiationProfile(league, p);
    const scored = list
      .map((x) => ({ ...x, u: faUtility(league, p, x.teamId, x.offer) }))
      .sort((a, b) => b.u - a.u || ROLE_RANK[b.offer.role] - ROLE_RANK[a.offer.role] || a.teamId.localeCompare(b.teamId));
    const best = scored[0]!;
    const need = last ? 0.85 : prof.threshold - 0.03 * (fa.day - 1);
    if (best.u < need) continue;
    // Teams can lose cap room during the day; re-check before signing.
    lg = { ...lg, players };
    if (teamPayroll(lg, best.teamId) + best.offer.salary > league.config.salaryCap) continue;
    players[pid] = signTo(lg, p, best.teamId, contractFromOffer(p, best.offer));
    pool.delete(pid);
    const t = league.teams.find((x) => x.id === best.teamId);
    const mine = best.teamId === EXPANSION_TEAM_ID;
    log.push({
      day: fa.day,
      playerId: pid,
      teamId: best.teamId,
      text: `${fullName(p)} unterschreibt bei ${mine ? 'DIR' : t?.abbrev} (${formatMoney(best.offer.salary)} × ${best.offer.years}).`,
    });
    if (userOffers[pid] && !mine) log.push({ day: fa.day, playerId: pid, teamId: null, text: `Dein Angebot an ${fullName(p)} wurde ausgeschlagen.` });
    delete userOffers[pid];
  }
  if (last) {
    for (const pid of Object.keys(userOffers)) delete userOffers[pid];
    // Own RFAs that were not re-signed become unrestricted.
    for (const [pid, n] of Object.entries(fa.ownRfas)) {
      if (n.status === 'signed') continue;
      const p = players[pid];
      if (p) players[pid] = { ...p, teamId: null, farm: false };
    }
  }
  return {
    league: { ...league, players },
    state: { ...fa, day: last ? fa.day : fa.day + 1, done: last, pool: [...pool].sort(), userOffers, log },
  };
}
