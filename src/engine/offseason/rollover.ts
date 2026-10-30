/**
 * Season rollover: after the playoffs the league moves on one year. Last season's numbers are kept,
 * older players may retire (the older, the likelier – above all when their contract runs out),
 * everyone ages and develops (young players grow towards their potential, veterans decline),
 * contracts lose a year, unsigned draft picks turn pro at 20 and the pick inventory rolls forward.
 * The expansion draft does not come back; the next offseason starts with the entry draft.
 */

import { EXPANSION_TEAM_ID } from '../franchise';
import type { Contract, DraftPick, League, Player, SeasonStats } from '../model';
import { GOALIE_ATTRS, SKATER_ATTRS, contractCount, fullName, playersOfTeam } from '../model';
import { rngFor } from '../rng';
import { goalieOvr, skaterOvr } from '../value';
import type { PlayoffState } from '../sim/playoffs';
import type { SeasonState } from '../sim/season';
import { standings } from '../sim/standings';

export interface Retirement {
  playerId: string;
  name: string;
  teamId: string | null;
  position: Player['position'];
  age: number;
  ovr: number;
  /** Retired although his contract still had years left. */
  underContract: boolean;
}

export interface Development {
  playerId: string;
  name: string;
  age: number;
  from: number;
  to: number;
}

export interface RolloverReport {
  /** The season that just ended, e.g. "2027-28". */
  finished: string;
  /** The coming season. */
  next: string;
  champion: string | null;
  retirements: Retirement[];
  /** Development of the expansion team's players (largest changes first). */
  development: Development[];
  /** Draft picks of the expansion team that signed their entry-level contract. */
  signedPicks: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round25k = (v: number): number => Math.round(v / 25_000) * 25_000;
export const seasonLabelFor = (year: number): string => `${year}-${String((year + 1) % 100).padStart(2, '0')}`;

/** Base chance to retire with an expiring contract, by (goalie-adjusted) age. */
const RETIRE_BY_AGE: Record<number, number> = { 31: 0.02, 32: 0.04, 33: 0.07, 34: 0.12, 35: 0.2, 36: 0.32, 37: 0.45, 38: 0.6, 39: 0.75 };

/**
 * Chance to retire this summer. Goalies age two years slower. Expiring deals are the usual moment;
 * under contract only veterans from 36 on call it a career now and then. Unsigned free agents from
 * 28 on with a modest rating often end their career (or leave the league) as well.
 * Good players hang on longer, fringe players are pushed out sooner.
 */
export function retirementChance(p: Player): number {
  if (p.retired || !p.contract) return 0;
  const age = p.position === 'G' ? p.age - 2 : p.age;
  const base = age >= 40 ? 0.9 : (RETIRE_BY_AGE[age] ?? 0);
  const expiring = p.contract.yearsLeft <= 1;
  let chance = expiring ? base : age >= 36 ? base * 0.25 : 0;
  if (!p.teamId) chance = Math.max(chance * 1.5, age >= 28 && p.ovr < 70 ? 0.15 + 0.07 * (age - 28) : 0);
  if (p.ovr >= 80) chance *= 0.6;
  else if (p.ovr < 65) chance *= 1.4;
  return clamp(chance, 0, 0.97);
}

/** Expected OVR change over one summer (before random noise). */
function developDelta(p: Player, rng: ReturnType<typeof rngFor>): number {
  const age = p.position === 'G' ? p.age - 2 : p.age;
  const gap = Math.max(0, p.potential - p.ovr);
  if (age <= 20) return gap * rng.range(0.25, 0.45) + rng.normal(0, 1);
  if (age <= 23) return gap * rng.range(0.2, 0.4) + rng.normal(0, 1);
  if (age <= 26) return gap * rng.range(0.15, 0.35) + rng.normal(0, 1);
  if (age <= 29) return rng.normal(0, 1);
  if (age <= 31) return rng.normal(-1, 1.2);
  if (age <= 33) return rng.normal(-2, 1.5);
  return rng.normal(-3.5, 1.5);
}

/** Shift the attributes so the OVR moves by about `delta`, then recompute it. */
function applyDevelopment(p: Player, delta: number, rng: ReturnType<typeof rngFor>): Player {
  const ceiling = Math.max(p.potential, p.ovr) + 1;
  const target = clamp(Math.round(p.ovr + delta), 30, Math.min(97, delta > 0 ? ceiling : 97));
  const shift = target - p.ovr;
  const move = (v: number) => clamp(Math.round(v + shift + rng.normal(0, 0.6)), 20, 99);
  let next: Player;
  if (p.goalie) {
    const goalie = { ...p.goalie };
    for (const k of GOALIE_ATTRS) goalie[k] = move(goalie[k]);
    next = { ...p, goalie, ovr: goalieOvr(goalie) };
  } else if (p.skater) {
    const skater = { ...p.skater };
    for (const k of SKATER_ATTRS) skater[k] = move(skater[k]);
    next = { ...p, skater, ovr: skaterOvr(p.position, skater) };
  } else next = { ...p, ovr: target };
  return next;
}

function statsOf(s: SeasonState, p: Player): SeasonStats {
  if (p.position === 'G') {
    const g = s.goalieStats[p.id];
    if (!g) return { gp: 0, goals: 0, assists: 0, plusMinus: 0, pim: 0, wins: 0, shutouts: 0 };
    const sv = g.sa ? (g.sa - g.ga) / g.sa : 0;
    return { gp: g.gp, goals: 0, assists: 0, plusMinus: 0, pim: 0, wins: g.w, savePct: Math.round(sv * 1000) / 1000, gaa: g.gp ? Math.round((g.ga / g.gp) * 100) / 100 : 0, shutouts: g.so };
  }
  const k = s.skaterStats[p.id];
  return k ? { gp: k.gp, goals: k.g, assists: k.a, plusMinus: k.pm, pim: k.pim } : { gp: 0, goals: 0, assists: 0, plusMinus: 0, pim: 0 };
}

/** Entry-level contract for a draft pick turning pro. */
export function entryLevelContract(league: League, p: Player): Contract {
  const cfg = league.config;
  return {
    capHit: round25k(clamp(cfg.minSalary + (p.potential - 60) * 40_000, cfg.minSalary, cfg.elcMaxCapHit)),
    yearsLeft: 3,
    expiryStatus: 'RFA',
    nmc: false,
    ntc: false,
    nmcWaived: false,
    elc: true,
    twoWay: true,
  };
}

const MAX_CONTRACTS = 50;

/** Draft picks of a team that have not signed a contract yet (they turn pro automatically at 20). */
export const unsignedPicks = (league: League, teamId: string): Player[] =>
  playersOfTeam(league, teamId)
    .filter((p) => !p.contract && !p.retired)
    .sort((a, b) => b.potential - a.potential || a.id.localeCompare(b.id));

/** Sign an own draft pick to his entry-level contract now (he starts in the farm team). */
export function signDraftPick(league: League, teamId: string, playerId: string): { league: League; error: string | null } {
  const p = league.players[playerId];
  if (!p || p.teamId !== teamId || p.contract || p.retired) return { league, error: 'Kein ungesignter Draft Pick deines Teams.' };
  if (contractCount(league, teamId) >= MAX_CONTRACTS) return { league, error: `Maximal ${MAX_CONTRACTS} Verträge – für ${fullName(p)} ist kein Platz.` };
  return { league: { ...league, players: { ...league.players, [p.id]: { ...p, contract: entryLevelContract(league, p), farm: true } } }, error: null };
}

/** Move the league from the season that just ended to the next one. */
export function advanceSeason(league: League, regular: SeasonState, po: PlayoffState | null): { league: League; report: RolloverReport } {
  const cfg = league.config;
  const year = cfg.seasonStartYear;
  const nextYear = year + 1;
  const table = standings(league, regular);
  const points = new Map(table.map((r) => [r.teamId, r.pts]));
  const name = (p: Player) => `${p.firstName} ${p.lastName}`;

  const players: Record<string, Player> = {};
  const retirements: Retirement[] = [];
  const development: Development[] = [];
  const signedPicks: string[] = [];
  for (const p0 of Object.values(league.players)) {
    if (p0.retired) {
      players[p0.id] = p0;
      continue;
    }
    const rng = rngFor(league.seed, 'rollover', year, p0.id);
    const last = statsOf(regular, p0);
    let p: Player = {
      ...p0,
      lastSeason: last,
      gpLastTwo: p0.gpLastSeason + last.gp,
      gpLastSeason: last.gp,
      seasonStats: { gp: 0, goals: 0, assists: 0, plusMinus: 0, pim: 0 },
      injury: null,
      form: 0,
    };
    // Career end: decided on the age reached during the season that just ended.
    if (rng.chance(retirementChance(p))) {
      retirements.push({ playerId: p.id, name: name(p), teamId: p.teamId, position: p.position, age: p.age, ovr: p.ovr, underContract: !!p.contract && p.contract.yearsLeft > 1 });
      players[p.id] = { ...p, retired: true, teamId: null, farm: false, contract: null };
      continue;
    }
    const before = p.ovr;
    p = applyDevelopment(p, developDelta(p, rng), rng);
    const age = p.age + 1;
    p = { ...p, age, potential: age >= 28 ? p.ovr : Math.max(p.potential, p.ovr) };
    if (p.contract) {
      p = { ...p, proYears: p.proYears + 1, contract: { ...p.contract, yearsLeft: Math.max(0, p.contract.yearsLeft - 1), nmcWaived: false } };
    } else if (p.teamId && age >= 20) {
      // Unsigned draft picks turn pro at 20.
      p = { ...p, contract: entryLevelContract(league, p), farm: true };
      if (p.teamId === EXPANSION_TEAM_ID) signedPicks.push(p.id);
    }
    if (p.teamId === EXPANSION_TEAM_ID && p.ovr !== before) development.push({ playerId: p.id, name: name(p), age: p.age, from: before, to: p.ovr });
    players[p.id] = p;
  }

  // Draft picks: the used year disappears, a new year is added at the end.
  const lastYear = nextYear + cfg.pickYearsAhead - 1;
  const picks: DraftPick[] = league.picks.filter((pk) => pk.year >= nextYear);
  for (const t of league.teams) {
    const code = t.isExpansion ? 'EXP' : t.abbrev;
    for (let r = 1; r <= cfg.draftRounds; r++) {
      if (picks.some((pk) => pk.year === lastYear && pk.round === r && pk.originalTeamId === t.id)) continue;
      picks.push({ id: `${lastYear}-R${r}-${code}`, year: lastYear, round: r, originalTeamId: t.id, ownerTeamId: t.id });
    }
  }

  const teams = league.teams.map((t) => ({ ...t, lastSeasonPoints: points.get(t.id) ?? t.lastSeasonPoints }));
  const franchise = league.franchise ? { ...league.franchise, foundedYear: league.franchise.foundedYear ?? year } : null;
  const next: League = {
    ...league,
    config: { ...cfg, seasonStartYear: nextYear, seasonLabel: seasonLabelFor(nextYear) },
    teams,
    players,
    picks,
    franchise,
  };
  retirements.sort((a, b) => b.ovr - a.ovr || a.playerId.localeCompare(b.playerId));
  development.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from) || a.playerId.localeCompare(b.playerId));
  return {
    league: next,
    report: { finished: cfg.seasonLabel, next: seasonLabelFor(nextYear), champion: po?.champion ?? null, retirements, development, signedPicks },
  };
}
