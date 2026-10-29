/** Protection lists: validation and the AI that builds them for the 32 existing teams. */

import type { ExpansionRules, LeagueConfig, ProtectionScheme } from '../config';
import type { League, Personality, Player, PositionGroup, Team } from '../model';
import { fullName, groupOf, playersOfTeam } from '../model';
import { rngFor } from '../rng';
import { contractSurplus, projectedOvr } from '../value';
import { countGroups, exposureNeed, isExempt, isNmcLocked, isPendingRfa, isPendingUfa, qualifiesForExposure } from './eligibility';

export interface Violation {
  code: string;
  message: string;
}

export interface ProtectionList {
  teamId: string;
  schemeId: string;
  protectedIds: string[];
  exposedIds: string[];
  exemptIds: string[];
  /** Short German explanations of the AI's reasoning. */
  notes: string[];
}

const GROUP_LABEL: Record<PositionGroup, string> = { F: 'Stürmer', D: 'Verteidiger', G: 'Goalie' };

export function validateProtection(
  teamPlayers: Player[],
  protectedIds: string[],
  schemeId: string,
  rules: ExpansionRules,
): Violation[] {
  const v: Violation[] = [];
  const scheme = rules.schemes.find((s) => s.id === schemeId);
  if (!scheme) return [{ code: 'SCHEME', message: `Unbekanntes Schutzschema "${schemeId}".` }];
  const byId = new Map(teamPlayers.map((p) => [p.id, p]));
  const prot: Player[] = [];
  for (const id of new Set(protectedIds)) {
    const p = byId.get(id);
    if (!p) v.push({ code: 'FOREIGN', message: `Spieler ${id} gehört nicht zum Team.` });
    else if (isExempt(p, rules)) v.push({ code: 'EXEMPT_PROTECTED', message: `${fullName(p)} ist ausgenommen und muss nicht geschützt werden.` });
    else prot.push(p);
  }
  const c = countGroups(prot);
  if (c.G > scheme.goalies) v.push({ code: 'TOO_MANY_G', message: `Zu viele Goalies geschützt (${c.G}/${scheme.goalies}).` });
  if (scheme.skaters !== null) {
    if (c.F + c.D > scheme.skaters)
      v.push({ code: 'TOO_MANY_SKATERS', message: `Zu viele Feldspieler geschützt (${c.F + c.D}/${scheme.skaters}).` });
  } else {
    if (c.F > (scheme.forwards ?? 0)) v.push({ code: 'TOO_MANY_F', message: `Zu viele Stürmer geschützt (${c.F}/${scheme.forwards}).` });
    if (c.D > (scheme.defense ?? 0)) v.push({ code: 'TOO_MANY_D', message: `Zu viele Verteidiger geschützt (${c.D}/${scheme.defense}).` });
  }
  const protSet = new Set(prot.map((p) => p.id));
  for (const p of teamPlayers) {
    if (isNmcLocked(p, rules) && !protSet.has(p.id))
      v.push({ code: 'NMC_UNPROTECTED', message: `${fullName(p)} hat eine No-Movement-Clause und muss geschützt werden.` });
  }
  const exposed = teamPlayers.filter((p) => !isExempt(p, rules) && !protSet.has(p.id));
  const need = exposureNeed(rules);
  for (const g of ['F', 'D', 'G'] as const) {
    const have = exposed.filter((p) => groupOf(p.position) === g && qualifiesForExposure(p, rules)).length;
    if (have < need[g])
      v.push({
        code: `EXPOSURE_${g}`,
        message: `Mindest-Exposure verletzt: ${have}/${need[g]} qualifizierte ${GROUP_LABEL[g]} ungeschützt.`,
      });
  }
  return v;
}

const WEIGHTS: Record<Personality, { now: number; fut: number; cap: number }> = {
  contender: { now: 0.75, fut: 0.25, cap: 0.35 },
  rebuild: { now: 0.35, fut: 0.65, cap: 0.55 },
  capStrapped: { now: 0.55, fut: 0.45, cap: 1.0 },
};

/** How much the owning team wants to keep this player (higher = more valuable to them). */
export function retentionScore(p: Player, team: Team, cfg: LeagueConfig, seed: string): number {
  const w = WEIGHTS[team.personality];
  let s = w.now * p.ovr + w.fut * projectedOvr(p, 3) + w.cap * Math.max(-12, Math.min(12, contractSurplus(p, cfg)));
  if (isPendingUfa(p)) s -= 8;
  else if (isPendingRfa(p)) s -= 1;
  if (p.injury && p.injury.gamesRemaining > 20) s -= 2;
  return s + rngFor(seed, 'protect', team.id, p.id).normal(0, 1.2);
}

interface SchemeEval {
  scheme: ProtectionScheme;
  protectedIds: string[];
  maxExposed: number;
  protectedSum: number;
}

function buildForScheme(
  eligible: Player[],
  score: Map<string, number>,
  scheme: ProtectionScheme,
  rules: ExpansionRules,
): SchemeEval {
  const sc = (p: Player) => score.get(p.id) ?? 0;
  const locked = eligible.filter((p) => isNmcLocked(p, rules));
  const reserved = new Set<string>();
  const need = exposureNeed(rules);
  for (const g of ['F', 'D', 'G'] as const) {
    eligible
      .filter((p) => groupOf(p.position) === g && qualifiesForExposure(p, rules) && !isNmcLocked(p, rules))
      .sort((a, b) => sc(a) - sc(b))
      .slice(0, need[g])
      .forEach((p) => reserved.add(p.id));
  }
  const prot: Player[] = [...locked];
  const cap = { F: scheme.forwards ?? Infinity, D: scheme.defense ?? Infinity, G: scheme.goalies };
  const skaterCap = scheme.skaters ?? Infinity;
  const pool = eligible
    .filter((p) => !reserved.has(p.id) && !locked.includes(p))
    .sort((a, b) => sc(b) - sc(a));
  for (const p of pool) {
    const c = countGroups(prot);
    const g = groupOf(p.position);
    if (c[g] >= cap[g]) continue;
    if (g !== 'G' && c.F + c.D >= skaterCap) continue;
    prot.push(p);
  }
  const protSet = new Set(prot.map((p) => p.id));
  const exposed = eligible.filter((p) => !protSet.has(p.id));
  return {
    scheme,
    protectedIds: prot.map((p) => p.id),
    maxExposed: Math.max(0, ...exposed.map(sc)),
    protectedSum: prot.reduce((s, p) => s + sc(p), 0),
  };
}

export function aiProtectTeam(league: League, team: Team): ProtectionList {
  const rules = league.config.rules;
  const all = playersOfTeam(league, team.id);
  const eligible = all.filter((p) => !isExempt(p, rules));
  const score = new Map(eligible.map((p) => [p.id, retentionScore(p, team, league.config, league.seed)]));

  const evals = rules.schemes.map((s) => buildForScheme(eligible, score, s, rules));
  const valid = evals.filter((e) => validateProtection(all, e.protectedIds, e.scheme.id, rules).length === 0);
  const ranked = (valid.length ? valid : evals).sort(
    (a, b) => a.maxExposed - b.maxExposed || b.protectedSum - a.protectedSum,
  );
  const best = ranked[0] as SchemeEval;
  const protSet = new Set(best.protectedIds);
  const exposed = eligible.filter((p) => !protSet.has(p.id));
  const notes: string[] = [];
  if (best.scheme.id !== rules.schemes[0]?.id) notes.push(`Wählt das Schema ${best.scheme.id}.`);
  const nmc = all.filter((p) => isNmcLocked(p, rules));
  if (nmc.length) notes.push(`${nmc.length} NMC-Spieler mussten geschützt werden.`);
  return {
    teamId: team.id,
    schemeId: best.scheme.id,
    protectedIds: best.protectedIds,
    exposedIds: exposed.map((p) => p.id),
    exemptIds: all.filter((p) => isExempt(p, rules)).map((p) => p.id),
    notes,
  };
}

export function aiProtectAll(league: League): Record<string, ProtectionList> {
  const out: Record<string, ProtectionList> = {};
  for (const t of league.teams) if (!t.isExpansion) out[t.id] = aiProtectTeam(league, t);
  return out;
}
