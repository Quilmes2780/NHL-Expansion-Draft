/**
 * Expansion team selection: constraint tracking, full validation, the AI mock draft and grading.
 */

import type { ExpansionRules, LeagueConfig } from '../config';
import type { League, Player, PositionGroup } from '../model';
import { fullName, groupOf, teamName } from '../model';
import { contractSurplus, formatMoney, projectedOvr } from '../value';
import { hasContractNextSeason, isPendingRfa, isPendingUfa } from './eligibility';
import type { ProtectionList, Violation } from './protection';

/** teamId → playerId */
export type Selection = Record<string, string>;

export type Light = 'ok' | 'warn' | 'bad';

export interface ConstraintStatus {
  id: string;
  label: string;
  value: string;
  status: Light;
  hint: string;
}

export interface SelectionSummary {
  picks: number;
  totalTeams: number;
  counts: Record<PositionGroup, number>;
  underContract: number;
  capTotal: number;
  capMin: number;
  capMax: number;
  constraints: ConstraintStatus[];
}

export const capHitOf = (p: Player): number => p.contract?.capHit ?? 0;

/** Can the expansion team draft this player directly (pending UFAs need a signing instead)? */
export const isSelectable = (p: Player): boolean => !isPendingUfa(p);

export function selectableCandidates(league: League, list: ProtectionList): Player[] {
  return list.exposedIds.map((id) => league.players[id] as Player).filter((p) => p && isSelectable(p));
}

function capBounds(cfg: LeagueConfig, rules: ExpansionRules) {
  return { min: Math.round(cfg.salaryCap * rules.roster.capMinPct), max: Math.round(cfg.salaryCap * rules.roster.capMaxPct) };
}

function tally(players: Player[]) {
  const counts: Record<PositionGroup, number> = { F: 0, D: 0, G: 0 };
  let underContract = 0;
  let cap = 0;
  for (const p of players) {
    counts[groupOf(p.position)]++;
    if (hasContractNextSeason(p)) underContract++;
    cap += capHitOf(p);
  }
  return { counts, underContract, cap };
}

export function summarizeSelection(
  league: League,
  protections: Record<string, ProtectionList>,
  selection: Selection,
): SelectionSummary {
  const cfg = league.config;
  const rules = cfg.rules;
  const teamIds = Object.keys(protections);
  const chosen = teamIds.map((t) => selection[t]).filter((id): id is string => !!id).map((id) => league.players[id] as Player);
  const { counts, underContract, cap } = tally(chosen);
  const remaining = teamIds.filter((t) => !selection[t]);
  const bounds = capBounds(cfg, rules);

  const remainingWith = (pred: (p: Player) => boolean) =>
    remaining.filter((t) => selectableCandidates(league, protections[t] as ProtectionList).some(pred)).length;

  const minLight = (have: number, min: number, reachable: number): Light =>
    have >= min ? 'ok' : have + reachable >= min ? 'warn' : 'bad';

  const r = rules.roster;
  const missingTotal =
    Math.max(0, r.minForwards - counts.F) + Math.max(0, r.minDefense - counts.D) + Math.max(0, r.minGoalies - counts.G);
  const constraints: ConstraintStatus[] = [
    {
      id: 'picks',
      label: 'Picks (1 pro Team)',
      value: `${chosen.length}/${teamIds.length}`,
      status: chosen.length === teamIds.length ? 'ok' : 'warn',
      hint: 'Von jedem bestehenden Team muss genau ein ungeschützter Spieler gewählt werden.',
    },
    {
      id: 'F',
      label: `Stürmer (min. ${r.minForwards})`,
      value: `${counts.F}`,
      status: minLight(counts.F, r.minForwards, remainingWith((p) => groupOf(p.position) === 'F')),
      hint: 'Mindestens 14 Stürmer (C/LW/RW) müssen im Expansionskader stehen.',
    },
    {
      id: 'D',
      label: `Verteidiger (min. ${r.minDefense})`,
      value: `${counts.D}`,
      status: minLight(counts.D, r.minDefense, remainingWith((p) => groupOf(p.position) === 'D')),
      hint: 'Mindestens 9 Verteidiger müssen gewählt werden.',
    },
    {
      id: 'G',
      label: `Goalies (min. ${r.minGoalies})`,
      value: `${counts.G}`,
      status: minLight(counts.G, r.minGoalies, remainingWith((p) => groupOf(p.position) === 'G')),
      hint: 'Mindestens 3 Goalies müssen gewählt werden.',
    },
    {
      id: 'contracts',
      label: `Verträge 2027-28 (min. ${r.minUnderContract})`,
      value: `${underContract}`,
      status: minLight(underContract, r.minUnderContract, remainingWith(hasContractNextSeason)),
      hint: 'Mindestens 20 gewählte Spieler müssen für die kommende Saison unter Vertrag stehen (pending RFAs zählen nicht).',
    },
  ];
  if (missingTotal > remaining.length) {
    for (const c of constraints) if (c.status === 'warn' && ['F', 'D', 'G'].includes(c.id)) c.status = 'bad';
  }
  let maxAdd = 0;
  let minAdd = 0;
  for (const t of remaining) {
    const caps = selectableCandidates(league, protections[t] as ProtectionList).map(capHitOf);
    if (caps.length) {
      maxAdd += Math.max(...caps);
      minAdd += Math.min(...caps);
    }
  }
  const capStatus: Light =
    cap > bounds.max || cap + maxAdd < bounds.min || cap + minAdd > bounds.max
      ? 'bad'
      : cap >= bounds.min
        ? 'ok'
        : 'warn';
  constraints.push({
    id: 'cap',
    label: `Cap-Korridor (${Math.round(rules.roster.capMinPct * 100)}–${Math.round(rules.roster.capMaxPct * 100)} %)`,
    value: formatMoney(cap),
    status: capStatus,
    hint: `Die Summe der Cap Hits muss zwischen ${formatMoney(bounds.min)} und ${formatMoney(bounds.max)} liegen.`,
  });

  return {
    picks: chosen.length,
    totalTeams: teamIds.length,
    counts,
    underContract,
    capTotal: cap,
    capMin: bounds.min,
    capMax: bounds.max,
    constraints,
  };
}

/** Full validation before submitting. Every message names the violated rule. */
export function validateSelection(
  league: League,
  protections: Record<string, ProtectionList>,
  selection: Selection,
): Violation[] {
  const v: Violation[] = [];
  const cfg = league.config;
  const rules = cfg.rules;
  const teamIds = Object.keys(protections);
  const missing = teamIds.filter((t) => !selection[t]);
  if (missing.length) {
    const names = missing.map((t) => league.teams.find((x) => x.id === t)?.abbrev ?? t).join(', ');
    v.push({
      code: 'MISSING_TEAM',
      message: `Regel „genau 1 Spieler pro Team“: Von ${missing.length} Team(s) fehlt noch ein Pick (${names}).`,
    });
  }
  for (const [teamId, playerId] of Object.entries(selection)) {
    const list = protections[teamId];
    const p = league.players[playerId];
    const team = league.teams.find((t) => t.id === teamId);
    if (!list || !team) {
      v.push({ code: 'UNKNOWN_TEAM', message: `Unbekanntes Team ${teamId}.` });
      continue;
    }
    if (!p || !list.exposedIds.includes(playerId)) {
      v.push({ code: 'NOT_EXPOSED', message: `Regel „nur ungeschützte Spieler“: ${p ? fullName(p) : playerId} ist bei ${teamName(team)} nicht verfügbar.` });
      continue;
    }
    if (isPendingUfa(p))
      v.push({
        code: 'PENDING_UFA',
        message: `Regel „pending UFA“: ${fullName(p)} (${team.abbrev}) hat keinen Vertrag für 2027-28 und kann nur im exklusiven Verhandlungsfenster verpflichtet werden.`,
      });
  }
  const chosen = teamIds.map((t) => selection[t]).filter((id): id is string => !!id).map((id) => league.players[id]).filter((p): p is Player => !!p);
  const { counts, underContract, cap } = tally(chosen);
  const r = rules.roster;
  const minRule = (code: string, label: string, have: number, min: number) => {
    if (have < min)
      v.push({ code, message: `Regel „mindestens ${min} ${label}“: aktuell ${have} gewählt – es fehlen ${min - have}.` });
  };
  minRule('MIN_F', 'Stürmer', counts.F, r.minForwards);
  minRule('MIN_D', 'Verteidiger', counts.D, r.minDefense);
  minRule('MIN_G', 'Goalies', counts.G, r.minGoalies);
  minRule('MIN_CONTRACTS', 'Spieler mit Vertrag für 2027-28', underContract, r.minUnderContract);
  const b = capBounds(cfg, rules);
  if (cap < b.min)
    v.push({ code: 'CAP_MIN', message: `Regel „Cap Hits ≥ ${Math.round(r.capMinPct * 100)} % des Caps“: Summe ${formatMoney(cap)} liegt ${formatMoney(b.min - cap)} unter dem Minimum von ${formatMoney(b.min)}.` });
  if (cap > b.max)
    v.push({ code: 'CAP_MAX', message: `Regel „Cap Hits ≤ ${Math.round(r.capMaxPct * 100)} % des Caps“: Summe ${formatMoney(cap)} liegt ${formatMoney(cap - b.max)} über dem Maximum von ${formatMoney(b.max)}.` });
  return v;
}

/** How valuable a player is for the expansion team (true values). */
export function expansionValue(p: Player, cfg: LeagueConfig): number {
  let v = 0.45 * p.ovr + 0.55 * projectedOvr(p, 3) + 0.45 * Math.max(-10, Math.min(10, contractSurplus(p, cfg)));
  if (isPendingRfa(p)) v -= 0.5;
  return v;
}

function penalty(league: League, chosen: Player[]): number {
  const cfg = league.config;
  const r = cfg.rules.roster;
  const { counts, underContract, cap } = tally(chosen);
  const b = capBounds(cfg, cfg.rules);
  return (
    50 * Math.max(0, r.minForwards - counts.F) +
    50 * Math.max(0, r.minDefense - counts.D) +
    50 * Math.max(0, r.minGoalies - counts.G) +
    50 * Math.max(0, r.minUnderContract - underContract) +
    8 * (Math.max(0, b.min - cap) / 1_000_000 + Math.max(0, cap - b.max) / 1_000_000) +
    (cap < b.min || cap > b.max ? 5 : 0)
  );
}

/**
 * The AI's own draft: best value per team, then greedy single swaps on value − penalty
 * until no swap improves. Optionally starts from fixed picks (e.g. binding side deals).
 */
export function mockDraft(
  league: League,
  protections: Record<string, ProtectionList>,
  fixed: Selection = {},
  valueOf: (p: Player) => number = (p) => expansionValue(p, league.config),
  exclude: ReadonlySet<string> = new Set(),
): Selection {
  const teamIds = Object.keys(protections).sort();
  const cands = new Map<string, Player[]>();
  const val = new Map<string, number>();
  for (const t of teamIds) {
    const list = fixed[t]
      ? [league.players[fixed[t] as string] as Player]
      : selectableCandidates(league, protections[t] as ProtectionList).filter((p) => !exclude.has(p.id));
    for (const p of list) val.set(p.id, valueOf(p));
    cands.set(t, list.sort((a, b) => (val.get(b.id) ?? 0) - (val.get(a.id) ?? 0) || a.id.localeCompare(b.id)));
  }
  const pick = new Map<string, Player>();
  for (const t of teamIds) {
    const first = cands.get(t)?.[0];
    if (first) pick.set(t, first);
  }
  const objective = () => {
    const chosen = [...pick.values()];
    return chosen.reduce((s, p) => s + (val.get(p.id) ?? 0), 0) - penalty(league, chosen);
  };
  let current = objective();
  for (let iter = 0; iter < 400; iter++) {
    let best: { t: string; p: Player; obj: number } | null = null;
    for (const t of teamIds) {
      const prev = pick.get(t);
      for (const p of cands.get(t) ?? []) {
        if (p === prev) continue;
        pick.set(t, p);
        const obj = objective();
        if (obj > current + 1e-9 && (!best || obj > best.obj)) best = { t, p, obj };
      }
      if (prev) pick.set(t, prev);
    }
    if (!best) break;
    pick.set(best.t, best.p);
    current = best.obj;
  }
  const out: Selection = {};
  for (const [t, p] of pick) out[t] = p.id;
  return out;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface GradedPick {
  teamId: string;
  playerId: string;
  grade: Grade;
  value: number;
  bestPlayerId: string;
  bestValue: number;
  aiPlayerId: string | null;
  comment: string;
}

export interface DraftGrades {
  picks: GradedPick[];
  overall: Grade;
  userValue: number;
  mockValue: number;
  mock: Selection;
}

const pickGrade = (diff: number): Grade => (diff <= 0.5 ? 'A' : diff <= 2 ? 'B' : diff <= 4.5 ? 'C' : diff <= 8 ? 'D' : 'F');
const overallGrade = (ratio: number): Grade =>
  ratio >= 0.995 ? 'A' : ratio >= 0.975 ? 'B' : ratio >= 0.95 ? 'C' : ratio >= 0.92 ? 'D' : 'F';

export const GRADE_POINTS: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

export interface GradeOptions {
  /** Extra value per team from side deals (picks/prospects received), with a short note. */
  bonus?: Record<string, { value: number; note: string }>;
  /** Value of the mock draft if it was evaluated on a different league state (e.g. before signings). */
  mockValue?: number;
}

export function gradeDraft(
  league: League,
  protections: Record<string, ProtectionList>,
  selection: Selection,
  mock: Selection = mockDraft(league, protections),
  opts: GradeOptions = {},
): DraftGrades {
  const cfg = league.config;
  const picks: GradedPick[] = [];
  let userValue = 0;
  let mockValue = 0;
  for (const teamId of Object.keys(protections).sort()) {
    const playerId = selection[teamId];
    if (!playerId) continue;
    const p = league.players[playerId] as Player;
    const bonus = opts.bonus?.[teamId];
    const value = expansionValue(p, cfg) + (bonus?.value ?? 0);
    const cands = selectableCandidates(league, protections[teamId] as ProtectionList);
    let best = p;
    let bestValue = value;
    for (const c of cands) {
      const cv = expansionValue(c, cfg);
      if (cv > bestValue) {
        best = c;
        bestValue = cv;
      }
    }
    const grade = pickGrade(bestValue - value);
    const aiId = mock[teamId] ?? null;
    const base =
      grade === 'A'
        ? aiId === playerId
          ? 'Lehrbuch-Pick – genau so hätte es auch die KI gemacht.'
          : 'Maximaler Wert aus dieser Liste herausgeholt.'
        : grade === 'B'
          ? 'Solider Pick, knapp unter dem besten verfügbaren Spieler.'
          : grade === 'C'
            ? `Vertretbar, aber ${fullName(best)} hätte mehr Wert gebracht.`
            : grade === 'D'
              ? `Fragwürdig – ${fullName(best)} war die deutlich bessere Option.`
              : `Reach! ${fullName(best)} lag klar vorn.`;
    const comment = bonus ? `${base} ${bonus.note}` : base;
    picks.push({ teamId, playerId, grade, value, bestPlayerId: best.id, bestValue, aiPlayerId: aiId, comment });
    userValue += value;
  }
  if (opts.mockValue !== undefined) mockValue = opts.mockValue;
  else for (const id of Object.values(mock)) mockValue += expansionValue(league.players[id] as Player, cfg);
  return { picks, overall: overallGrade(mockValue > 0 ? userValue / mockValue : 0), userValue, mockValue, mock };
}
