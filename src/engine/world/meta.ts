/**
 * Franchise meta: fan mood, attendance, owner satisfaction (measured against the mandate) and
 * role promises from contract talks, which affect player morale.
 */

import { capFloor } from '../config';
import { EXPANSION_TEAM_ID, cityById } from '../franchise';
import type { League, Player } from '../model';
import { fullName, groupOf, teamPayroll } from '../model';
import type { Role } from '../expansion/negotiation';
import type { Lineup } from '../offseason/lineup';

export interface MetaPoint {
  day: number;
  fans: number;
  owner: number;
}

export interface FranchiseMeta {
  fanMood: number;
  ownerSatisfaction: number;
  /** Spectators per home game. */
  attendance: Record<string, number>;
  /** Promised roles (player id → role) from the negotiation window and free agency. */
  promises: Record<string, Role>;
  /** Day of the last morale complaint per player, to avoid spamming. */
  complaints: Record<string, number>;
  history: MetaPoint[];
}

const HONEYMOON = 12;

export function fanBaseline(league: League): number {
  const city = league.franchise ? cityById(league.franchise.cityId) : null;
  return 50 + (city ? (city.tradition - 5) * 2.5 + (city.marketSize - 5) * 0.8 : 0);
}

export function initMeta(league: League, promises: Record<string, Role>): FranchiseMeta {
  const fans = Math.round(Math.min(95, fanBaseline(league) + HONEYMOON));
  return { fanMood: fans, ownerSatisfaction: 60, attendance: {}, promises, complaints: {}, history: [{ day: 0, fans, owner: 60 }] };
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** Fans react to every game; home games draw a crowd depending on mood, tradition and market. */
export function afterUserGame(
  league: League,
  meta: FranchiseMeta,
  gameId: string,
  home: boolean,
  won: boolean,
  decision: 'REG' | 'OT' | 'SO',
  goalDiff: number,
  playoff: boolean,
): FranchiseMeta {
  let fan = meta.fanMood;
  const weight = playoff ? 2 : 1;
  if (won) fan += (1.3 + (home ? 0.4 : 0) + Math.min(2, goalDiff) * 0.2) * weight;
  else if (decision !== 'REG') fan -= 0.2 * weight;
  else fan -= (1 + Math.min(3, Math.abs(goalDiff)) * 0.15) * weight;
  fan += (fanBaseline(league) - fan) * 0.015;
  const attendance = { ...meta.attendance };
  if (home && league.franchise) {
    const city = cityById(league.franchise.cityId);
    const share = clamp(0.48 + fan / 190 + (city.tradition - 5) * 0.02 + (city.marketSize - 5) * 0.01 + (playoff ? 0.15 : 0), 0.4, 1);
    attendance[gameId] = Math.round(city.arenaCapacity * share);
  }
  return { ...meta, fanMood: clamp(fan), attendance };
}

/** Instantaneous owner verdict (0–100) for the current state of the season. */
export function ownerScore(league: League, meta: FranchiseMeta, pts: number, gp: number, inPlayoffSpot: boolean): number {
  const mandate = league.franchise?.mandate ?? 'patientBuild';
  const pace = gp ? (pts / gp) * 82 : 75;
  const capRoom = (league.config.salaryCap - teamPayroll(league, EXPANSION_TEAM_ID)) / 1_000_000;
  const homeGames = Object.values(meta.attendance);
  const city = league.franchise ? cityById(league.franchise.cityId) : null;
  const fill = homeGames.length && city ? homeGames.reduce((a, b) => a + b, 0) / homeGames.length / city.arenaCapacity : 0.85;
  if (mandate === 'playoffsNow') return clamp(50 + (pace - 92) * 2 + (inPlayoffSpot ? 12 : -6) + (meta.fanMood - 50) * 0.1);
  if (mandate === 'budget') {
    const lean = teamPayroll(league, EXPANSION_TEAM_ID) <= capFloor(league.config) * 1.08 ? 6 : 0;
    return clamp(48 + (pace - 72) * 0.8 + Math.min(20, capRoom * 1.2) + (fill - 0.85) * 60 + lean);
  }
  return clamp(55 + (pace - 72) * 1.1 + (meta.fanMood - 50) * 0.15 + (inPlayoffSpot ? 6 : 0));
}

export function weeklyOwnerUpdate(league: League, meta: FranchiseMeta, day: number, pts: number, gp: number, inPlayoffSpot: boolean): FranchiseMeta {
  const score = ownerScore(league, meta, pts, gp, inPlayoffSpot);
  const owner = Math.round((meta.ownerSatisfaction * 0.75 + score * 0.25) * 10) / 10;
  return { ...meta, ownerSatisfaction: owner, history: [...meta.history, { day, fans: Math.round(meta.fanMood), owner: Math.round(owner) }] };
}

/** Does the lineup honour the promised role? */
export function roleMet(l: Lineup, p: Player, role: Role): boolean {
  if (role === 'depth') return true;
  const g = groupOf(p.position);
  if (g === 'G') return role === 'top' ? l.goalies[0] === p.id : l.goalies.includes(p.id);
  if (g === 'D') {
    const pairs = role === 'top' ? l.defense.slice(0, 2) : l.defense;
    return pairs.some((x) => x.includes(p.id));
  }
  const lines = role === 'top' ? l.forwards.slice(0, 2) : l.forwards.slice(0, 3);
  return lines.some((x) => x.includes(p.id));
}

export interface MoraleResult {
  players: Record<string, Player>;
  meta: FranchiseMeta;
  messages: string[];
}

/** Weekly morale check of promised roles; unhappy players lose form too. */
export function weeklyMorale(league: League, meta: FranchiseMeta, lineup: Lineup, day: number): MoraleResult {
  const players = { ...league.players };
  const complaints = { ...meta.complaints };
  const messages: string[] = [];
  for (const [pid, role] of Object.entries(meta.promises)) {
    const p = players[pid];
    if (!p || p.teamId !== EXPANSION_TEAM_ID || p.injury) continue;
    const ok = roleMet(lineup, p, role);
    const morale = clamp(p.morale + (ok ? 1 : -4));
    const form = ok ? p.form : Math.max(-10, p.form - 0.5);
    players[pid] = { ...p, morale, form };
    if (!ok && morale < 55 && day - (complaints[pid] ?? -99) >= 21) {
      complaints[pid] = day;
      messages.push(`${fullName(p)} ist unzufrieden: Ihm wurde eine größere Rolle versprochen.`);
    }
  }
  return { players, meta: { ...meta, complaints }, messages };
}

export function averageAttendance(league: League, meta: FranchiseMeta): { avg: number; fill: number } {
  const xs = Object.values(meta.attendance);
  const cap = league.franchise ? cityById(league.franchise.cityId).arenaCapacity : 18000;
  const avg = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  return { avg: Math.round(avg), fill: xs.length ? avg / cap : 0 };
}
