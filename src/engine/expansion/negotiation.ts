/**
 * Exclusive negotiation window with exposed pending UFAs/RFAs.
 * Every player has hidden, seeded expectations; the response to an offer is a pure function of
 * (player, offer, negotiation history), so identical decisions always give identical results.
 */

import { maxSalary } from '../config';
import { cityById } from '../franchise';
import type { CityProfile, Contract, League, Mandate, Player } from '../model';
import { groupOf } from '../model';
import { rngFor } from '../rng';
import { marketValue } from '../value';
import { isPendingRfa, isPendingUfa } from './eligibility';

export type Role = 'top' | 'middle' | 'depth';
export const ROLE_RANK: Record<Role, number> = { depth: 0, middle: 1, top: 2 };
export const MAX_OFFERS = 4;
const START_MOOD = 100;

export function roleLabel(role: Role, p: Pick<Player, 'position'>): string {
  const g = groupOf(p.position);
  if (g === 'G') return role === 'top' ? 'Starting Goalie' : role === 'middle' ? '1B im Tandem' : 'Backup';
  if (g === 'D') return role === 'top' ? 'Top-4-Verteidiger' : role === 'middle' ? '2./3. Paar' : 'ErgÃ¤nzungsspieler';
  return role === 'top' ? 'Top-6-StÃ¼rmer' : role === 'middle' ? 'Middle-Six' : 'Bottom-Six';
}

export interface Offer {
  salary: number;
  years: number;
  role: Role;
}

export type OfferResponse = 'accept' | 'counter' | 'reject' | 'walk';

export interface OfferRecord {
  offer: Offer;
  response: OfferResponse;
  counter: Offer | null;
  message: string;
}

export interface Negotiation {
  playerId: string;
  teamId: string;
  offers: OfferRecord[];
  mood: number;
  status: 'open' | 'signed' | 'walked';
}

export interface Signing {
  playerId: string;
  teamId: string;
  contract: Contract;
  role: Role;
}

/** Hidden expectations of a player (never shown directly in the UI). */
export interface NegotiationProfile {
  ask: number;
  prefYears: number;
  desiredRole: Role;
  threshold: number;
}

/** What the agent tells you: vague ranges around the hidden values. */
export interface AgentHint {
  salary: [number, number];
  years: [number, number];
  role: Role;
  interest: 'hoch' | 'mittel' | 'gering';
}

const round25k = (v: number): number => Math.ceil(v / 25_000) * 25_000;

export const isNegotiable = (p: Player): boolean => isPendingUfa(p) || isPendingRfa(p);

export function negotiationProfile(league: League, p: Player): NegotiationProfile {
  const cfg = league.config;
  const rng = rngFor(league.seed, 'negotiation', p.id);
  const greed = rng.range(0.95, 1.18);
  const market = marketValue(p.ovr, p.age, p.position, cfg);
  const current = p.contract?.capHit ?? cfg.minSalary;
  const base = isPendingRfa(p) ? Math.max(current, market * 0.88) : market * greed;
  const ask = Math.min(maxSalary(cfg), Math.max(cfg.minSalary, round25k(base)));
  const prefYears =
    p.age <= 25 ? rng.int(3, 6) : p.age <= 29 ? rng.int(4, 6) : p.age <= 32 ? rng.int(2, 4) : rng.int(1, 2);
  const desiredRole: Role = p.ovr >= 76 ? 'top' : p.ovr >= 70 ? 'middle' : 'depth';
  const threshold = rng.range(0.97, 1.07) - (isPendingRfa(p) ? 0.04 : 0);
  return { ask, prefYears, desiredRole, threshold };
}

export interface CityFactor {
  label: string;
  value: number;
}

/** How attractive the new franchise is for this player (positive = bonus). */
export function cityFactors(city: CityProfile, mandate: Mandate, p: Player): CityFactor[] {
  const f: CityFactor[] = [
    { label: 'Steuervorteil', value: 0.015 * (city.taxAdvantage - 5) },
    { label: 'MarktgrÃ¶ÃŸe', value: 0.008 * (city.marketSize - 5) },
    { label: 'Hockey-Tradition', value: 0.006 * (city.tradition - 5) },
    { label: 'Reisebelastung', value: -0.006 * (city.travelLoad - 5) },
  ];
  if (mandate === 'patientBuild' && p.age <= 25) f.push({ label: 'Langfristige Perspektive', value: 0.02 });
  if (mandate === 'playoffsNow' && p.age >= 29) f.push({ label: 'Will sofort gewinnen', value: 0.02 });
  if (mandate === 'budget') f.push({ label: 'Budget-Ruf des Owners', value: -0.015 });
  return f;
}

function franchiseCity(league: League): { city: CityProfile; mandate: Mandate } {
  if (!league.franchise) throw new Error('No franchise founded yet');
  return { city: cityById(league.franchise.cityId), mandate: league.franchise.mandate };
}

export function cityFit(league: League, p: Player): number {
  const { city, mandate } = franchiseCity(league);
  return cityFactors(city, mandate, p).reduce((s, x) => s + x.value, 0);
}

export function agentHint(league: League, p: Player): AgentHint {
  const prof = negotiationProfile(league, p);
  const rng = rngFor(league.seed, 'agent', p.id);
  const lo = round25k(prof.ask * rng.range(0.86, 0.98));
  const hi = round25k(prof.ask * rng.range(1.04, 1.16));
  const fit = cityFit(league, p);
  const yLo = Math.max(1, prof.prefYears - rng.int(0, 1));
  return {
    salary: [lo, Math.min(maxSalary(league.config), hi)],
    years: [yLo, Math.min(8, yLo + 1 + rng.int(0, 1))],
    role: prof.desiredRole,
    interest: fit > 0.03 ? 'hoch' : fit > -0.02 ? 'mittel' : 'gering',
  };
}

export function yearsTerm(years: number, pref: number): number {
  return -0.06 * Math.abs(years - pref);
}

export function roleTerm(role: Role, desired: Role): number {
  const d = ROLE_RANK[role] - ROLE_RANK[desired];
  return d > 0 ? 0.03 : d < 0 ? -0.12 * -d : 0;
}

/** Utility of an offer for the player, relative to his ask (1.0 â‰ˆ exactly what he wants). */
export function offerUtility(league: League, p: Player, offer: Offer): number {
  const prof = negotiationProfile(league, p);
  return (
    Math.min(1.3, offer.salary / prof.ask) +
    yearsTerm(offer.years, prof.prefYears) +
    roleTerm(offer.role, prof.desiredRole) +
    cityFit(league, p)
  );
}

export function newNegotiation(p: Player, teamId: string): Negotiation {
  return { playerId: p.id, teamId, offers: [], mood: START_MOOD, status: 'open' };
}

function validOffer(league: League, offer: Offer): boolean {
  const cfg = league.config;
  return (
    Number.isFinite(offer.salary) &&
    offer.salary >= cfg.minSalary &&
    offer.salary <= maxSalary(cfg) &&
    Number.isInteger(offer.years) &&
    offer.years >= 1 &&
    offer.years <= 8
  );
}

/** Evaluate an offer and return the updated negotiation. */
export function respondToOffer(league: League, p: Player, neg: Negotiation, offer: Offer): Negotiation {
  if (neg.status !== 'open' || !validOffer(league, offer)) return neg;
  const prof = negotiationProfile(league, p);
  const u = offerUtility(league, p, offer);
  const round = neg.offers.length + 1;
  // Patience shrinks with every round: later offers need to be a little better.
  const need = prof.threshold + 0.01 * (round - 1);
  let record: OfferRecord;
  let mood = neg.mood;
  let status: Negotiation['status'] = 'open';
  if (u >= need - 1e-9) {
    record = { offer, response: 'accept', counter: null, message: `${p.lastName} unterschreibt! Der Agent bestÃ¤tigt die Einigung.` };
    status = 'signed';
  } else {
    const gap = need - u;
    mood -= gap > 0.18 ? 35 : 20;
    if (mood <= 0 || round >= MAX_OFFERS) {
      record = {
        offer,
        response: 'walk',
        counter: null,
        message: `Der Agent bricht die GesprÃ¤che ab. ${p.lastName} testet lieber den freien Markt.`,
      };
      status = 'walked';
    } else if (gap <= 0.18) {
      const years = Math.abs(offer.years - prof.prefYears) <= 1 ? offer.years : prof.prefYears;
      const role: Role = ROLE_RANK[offer.role] >= ROLE_RANK[prof.desiredRole] ? offer.role : prof.desiredRole;
      const needNext = prof.threshold + 0.01 * round;
      const salary = round25k(
        prof.ask * (needNext - yearsTerm(years, prof.prefYears) - roleTerm(role, prof.desiredRole) - cityFit(league, p)),
      );
      const counter: Offer = {
        salary: Math.min(maxSalary(league.config), Math.max(offer.salary + 25_000, salary)),
        years,
        role,
      };
      record = { offer, response: 'counter', counter, message: 'Nah dran. Der Agent legt ein Gegenangebot vor.' };
    } else {
      record = {
        offer,
        response: 'reject',
        counter: null,
        message: 'Das Angebot wird als respektlos empfunden. Die Stimmung kÃ¼hlt deutlich ab.',
      };
    }
  }
  return { ...neg, offers: [...neg.offers, record], mood: Math.max(0, mood), status };
}

export function contractFromOffer(p: Player, offer: Offer): Contract {
  return {
    capHit: offer.salary,
    yearsLeft: offer.years,
    expiryStatus: p.age + offer.years <= 26 ? 'RFA' : 'UFA',
    nmc: false,
    ntc: false,
    nmcWaived: false,
    elc: false,
    twoWay: false,
  };
}
