/** League generator: 32 existing teams with active rosters, prospects, contracts, picks. */

import type { LeagueConfig } from '../config';
import { capFloor, defaultConfig, maxSalary } from '../config';
import { DIVISIONS, EXISTING_TEAMS, LOGO_ICONS, LOGO_SHAPES } from '../data/cities';
import { GM_FIRST, GM_LAST } from '../data/names';
import {
  countGroups,
  exposureNeed,
  fitsScheme,
  isExempt,
  isNmcLocked,
  qualifiesForExposure,
} from '../expansion/eligibility';
import type { Contract, DraftPick, League, Personality, Player, Position, Team } from '../model';
import { groupOf } from '../model';
import type { Rng } from '../rng';
import { rngFor } from '../rng';
import { marketValue } from '../value';
import { genLastSeasonStats, genPlayer } from './player';

const round25k = (v: number): number => Math.round(v / 25_000) * 25_000;

const FORWARD_SLOTS = [85, 82, 80, 78, 76, 75, 72, 71, 70, 67, 66, 65, 63];
const DEFENSE_SLOTS = [82, 79, 76, 73, 70, 68, 65, 63];
const GOALIE_SLOTS = [80, 71];

const INJURIES = ['Oberkörperverletzung', 'Unterkörperverletzung', 'Knöchel', 'Schulter', 'Gehirnerschütterung', 'Leiste'];

interface ProspectDef {
  pos: Position;
  age: [number, number];
  kind: 'draftee' | 'elc' | 'ahl';
}

const PROSPECTS: ProspectDef[] = [
  { pos: 'C', age: [18, 19], kind: 'draftee' },
  { pos: 'RW', age: [18, 20], kind: 'draftee' },
  { pos: 'D', age: [18, 19], kind: 'draftee' },
  { pos: 'G', age: [18, 20], kind: 'draftee' },
  { pos: 'LW', age: [19, 21], kind: 'elc' },
  { pos: 'D', age: [20, 22], kind: 'elc' },
  { pos: 'C', age: [20, 22], kind: 'elc' },
  { pos: 'RW', age: [24, 28], kind: 'ahl' },
  { pos: 'D', age: [24, 28], kind: 'ahl' },
  { pos: 'G', age: [25, 30], kind: 'ahl' },
];

function pickPersonality(rng: Rng, quality: number): Personality {
  if (quality > 1.8) return rng.chance(0.3) ? 'capStrapped' : 'contender';
  if (quality < -1.8) return rng.chance(0.15) ? 'capStrapped' : 'rebuild';
  return rng.weighted<Personality>(['contender', 'rebuild', 'capStrapped'], (p) =>
    p === 'contender' ? 0.35 : p === 'rebuild' ? 0.35 : 0.3,
  );
}

function pickYearsLeft(rng: Rng, ovr: number, age: number): number {
  const star = ovr >= 80;
  const weights = star ? [8, 10, 14, 16, 16, 14, 12, 8, 2] : [20, 22, 19, 15, 10, 7, 4, 2, 1];
  // Veterans rarely get long terms: a 33-year-old signs for 4 years at most.
  const maxYears = Math.max(1, Math.min(8, 37 - age));
  return Math.min(maxYears, rng.weighted([0, 1, 2, 3, 4, 5, 6, 7, 8], (y) => weights[y] ?? 0));
}

function makeContract(rng: Rng, p: Player, cfg: LeagueConfig, forceElc: boolean): Contract {
  if (forceElc) {
    const yearsLeft = Math.max(0, 3 - p.proYears);
    return {
      capHit: round25k(rng.range(cfg.minSalary, cfg.elcMaxCapHit)),
      yearsLeft,
      expiryStatus: 'RFA',
      nmc: false,
      ntc: false,
      nmcWaived: false,
      elc: true,
      twoWay: true,
    };
  }
  const yearsLeft = pickYearsLeft(rng, p.ovr, p.age);
  const value = marketValue(p.ovr, p.age, p.position, cfg) * Math.exp(rng.normal(0, 0.22));
  return {
    capHit: Math.min(maxSalary(cfg), Math.max(cfg.minSalary, round25k(value))),
    yearsLeft,
    expiryStatus: p.age + yearsLeft <= 26 ? 'RFA' : 'UFA',
    nmc: false,
    ntc: false,
    nmcWaived: false,
    elc: false,
    twoWay: false,
  };
}

/** Scale committed (next-season) non-ELC contracts so the payroll hits `target`. */
function fitPayroll(players: Player[], target: number, cfg: LeagueConfig, ceilingFactor = 2): void {
  for (let iter = 0; iter < 4; iter++) {
    let fixed = 0;
    let scalable = 0;
    for (const p of players) {
      if (p.farm || !p.contract || p.contract.yearsLeft < 1) continue;
      if (p.contract.elc || p.contract.capHit <= cfg.minSalary) fixed += p.contract.capHit;
      else scalable += p.contract.capHit;
    }
    if (scalable <= 0) return;
    const factor = (target - fixed) / scalable;
    if (Math.abs(factor - 1) < 0.005) return;
    for (const p of players) {
      if (p.farm || !p.contract || p.contract.yearsLeft < 1 || p.contract.elc) continue;
      if (p.contract.capHit <= cfg.minSalary && factor < 1) continue;
      // Even overpaid players stay within a plausible distance of their market value.
      const ceiling = Math.min(maxSalary(cfg), Math.max(cfg.minSalary * 2, marketValue(p.ovr, p.age, p.position, cfg) * ceilingFactor));
      p.contract.capHit = Math.min(ceiling, Math.max(cfg.minSalary, round25k(p.contract.capHit * factor)));
    }
  }
}

function assignGames(rng: Rng, p: Player, rank: number): void {
  let last: number;
  let prev: number;
  if (p.position === 'G') {
    last = rank === 0 ? rng.int(44, 64) : rng.int(16, 36);
    prev = p.proYears >= 2 ? (rank === 0 ? rng.int(38, 62) : rng.int(10, 38)) : 0;
  } else {
    const base = 80 - rank * 1.4;
    const draw = () => Math.max(28, Math.min(82, Math.round(rng.normal(base - 5, 8))));
    last = rng.chance(0.12) ? rng.int(8, 44) : draw();
    prev = p.proYears >= 2 ? (rng.chance(0.12) ? rng.int(5, 44) : draw()) : 0;
    if (p.proYears === 1) last = rng.int(20, 82);
  }
  p.gpLastSeason = last;
  p.gpLastTwo = last + prev;
}

function genTeamPlayers(rng: Rng, team: Team, teamIdx: number, quality: number, cfg: LeagueConfig): Player[] {
  const players: Player[] = [];
  let n = 0;
  const nextId = () => `p${teamIdx}-${n++}`;
  const ageMean = team.personality === 'rebuild' ? 25.6 : team.personality === 'contender' ? 28.4 : 27.4;

  const addActive = (pos: Position, base: number, rank: number) => {
    const age = Math.max(19, Math.min(38, Math.round(rng.normal(ageMean, 3.8))));
    const ovr = base + quality + rng.normal(0, 2.5) - (age <= 21 ? 3 : 0);
    const p = genPlayer(rng, { id: nextId(), position: pos, age, ovr, teamId: team.id, farm: false, draftYear: null });
    const entryAge = rng.int(19, 21);
    p.proYears = Math.max(1, age - entryAge);
    p.draftYear = cfg.seasonStartYear - p.proYears - 1;
    const elc = p.proYears <= 2 && age <= 23 && rng.chance(0.9);
    p.contract = makeContract(rng, p, cfg, elc);
    assignGames(rng, p, rank);
    players.push(p);
  };

  const fPositions: Position[] = ['C', 'LW', 'RW', 'C', 'LW', 'RW', 'C', 'LW', 'RW', 'C', 'LW', 'RW', rng.pick<Position>(['C', 'LW', 'RW'])];
  FORWARD_SLOTS.forEach((base, i) => addActive(fPositions[i] as Position, base, i));
  DEFENSE_SLOTS.forEach((base, i) => addActive('D', base, i));
  GOALIE_SLOTS.forEach((base, i) => addActive('G', base, i));

  for (const def of PROSPECTS) {
    const age = rng.int(def.age[0], def.age[1]);
    const ovr = def.kind === 'draftee' ? rng.range(44, 58) : def.kind === 'elc' ? rng.range(55, 66) : rng.range(58, 67);
    const p = genPlayer(rng, { id: nextId(), position: def.pos, age, ovr, teamId: team.id, farm: true, draftYear: null });
    if (def.kind === 'draftee') {
      p.draftYear = cfg.seasonStartYear - 1 - rng.int(0, Math.max(0, age - 18));
      p.contract = null;
    } else if (def.kind === 'elc') {
      p.proYears = rng.int(0, 2);
      p.draftYear = cfg.seasonStartYear - 1 - p.proYears - rng.int(0, 1);
      p.contract = makeContract(rng, p, cfg, true);
      p.gpLastSeason = p.proYears > 0 ? rng.int(0, 12) : 0;
      p.gpLastTwo = p.gpLastSeason + (p.proYears > 1 ? rng.int(0, 8) : 0);
    } else {
      p.proYears = Math.max(3, age - rng.int(19, 21));
      p.draftYear = rng.chance(0.6) ? cfg.seasonStartYear - 1 - p.proYears : null;
      p.contract = {
        capHit: round25k(rng.range(cfg.minSalary, 1_000_000)),
        yearsLeft: rng.int(0, 2),
        expiryStatus: age <= 26 ? 'RFA' : 'UFA',
        nmc: false,
        ntc: false,
        nmcWaived: false,
        elc: false,
        twoWay: true,
      };
      p.gpLastSeason = rng.chance(0.5) ? rng.int(0, 24) : 0;
      p.gpLastTwo = p.gpLastSeason + (rng.chance(0.4) ? rng.int(0, 30) : 0);
    }
    players.push(p);
  }

  const targetPct =
    team.personality === 'capStrapped' ? rng.range(0.96, 1.0) : team.personality === 'contender' ? rng.range(0.9, 0.97) : rng.range(0.77, 0.88);
  fitPayroll(players, Math.max(capFloor(cfg), cfg.salaryCap * targetPct), cfg);
  // If the ceilings kept the payroll under the floor, the team has re-signed some of its pending FAs.
  const committed = () => players.reduce((s, p) => s + (!p.farm && p.contract && p.contract.yearsLeft >= 1 ? p.contract.capHit : 0), 0);
  const pending = players
    .filter((p) => !p.farm && p.contract && p.contract.yearsLeft === 0 && !p.contract.elc)
    .sort((a, b) => (b.contract?.capHit ?? 0) - (a.contract?.capHit ?? 0));
  for (const p of pending) {
    if (committed() >= capFloor(cfg)) break;
    const c = p.contract as Contract;
    c.yearsLeft = Math.max(1, Math.min(rng.int(1, 4), 37 - p.age));
    c.expiryStatus = p.age + c.yearsLeft <= 26 ? 'RFA' : 'UFA';
  }
  if (committed() < capFloor(cfg)) fitPayroll(players, capFloor(cfg) * 1.01, cfg, Infinity);

  for (const p of players) {
    const c = p.contract;
    if (!c || c.elc || c.yearsLeft < 1) continue;
    if (c.capHit >= 5_000_000 && p.age >= 27 && rng.chance(0.42)) {
      c.nmc = true;
      c.nmcWaived = rng.chance(0.1);
    } else if (c.capHit >= 3_000_000 && p.age >= 26 && rng.chance(0.3)) c.ntc = true;
  }

  for (const p of players) {
    p.lastSeason = genLastSeasonStats(rng, p, p.gpLastSeason);
    if (!p.farm && rng.chance(0.04)) p.injury = { description: rng.pick(INJURIES), gamesRemaining: rng.int(2, 30) };
  }
  return players;
}

/**
 * Make sure every team can satisfy the exposure requirements with margin, and that
 * must-protect NMC players fit into at least one protection scheme.
 */
export function repairExposure(rng: Rng, players: Player[], cfg: LeagueConfig): void {
  const rules = cfg.rules;
  // 1) NMC overflow → the cheapest NMC players waive their clause.
  const locked = () => players.filter((p) => isNmcLocked(p, rules));
  while (!rules.schemes.some((s) => fitsScheme(locked(), s))) {
    const worst = locked().sort((a, b) => a.ovr - b.ovr)[0];
    if (!worst?.contract) break;
    worst.contract.nmcWaived = true;
  }
  // 2) Exposure candidates per group with a margin of +2 (goalies +1).
  const need = exposureNeed(rules);
  for (const g of ['F', 'D', 'G'] as const) {
    const want = need[g] + (g === 'G' ? 1 : 2);
    const ok = () =>
      players.filter((p) => groupOf(p.position) === g && qualifiesForExposure(p, rules) && !isNmcLocked(p, rules)).length;
    let guard = 0;
    while (ok() < want && guard++ < 20) {
      const candidates = players
        .filter((p) => groupOf(p.position) === g && !isExempt(p, rules) && !isNmcLocked(p, rules) && !qualifiesForExposure(p, rules))
        .sort((a, b) => b.gpLastTwo - a.gpLastTwo || b.ovr - a.ovr);
      const c = candidates[0];
      if (!c?.contract) break;
      // Typical real-world fix: a short extension and/or the player saw enough games.
      if (c.contract.yearsLeft < 1) {
        c.contract.yearsLeft = rng.int(1, 2);
        c.contract.expiryStatus = c.age + c.contract.yearsLeft <= 26 ? 'RFA' : 'UFA';
      }
      if (g !== 'G' && c.gpLastSeason < rules.exposure.gpLastSeason && c.gpLastTwo < rules.exposure.gpLastTwo) {
        c.gpLastSeason = rng.int(rules.exposure.gpLastSeason, rules.exposure.gpLastSeason + 20);
        c.gpLastTwo = Math.max(c.gpLastTwo, c.gpLastSeason + rng.int(0, 30));
        c.lastSeason = genLastSeasonStats(rng, c, c.gpLastSeason);
      }
    }
  }
}

function genPicks(teams: Team[], cfg: LeagueConfig, seed: string): DraftPick[] {
  const rng = rngFor(seed, 'gen', 'picks');
  const picks: DraftPick[] = [];
  for (let y = 0; y < cfg.pickYearsAhead; y++) {
    const year = cfg.seasonStartYear + y;
    for (const t of teams) {
      for (let r = 1; r <= cfg.draftRounds; r++) {
        const owner = r <= 4 && rng.chance(0.08) ? rng.pick(teams).id : t.id;
        picks.push({ id: `${year}-R${r}-${t.abbrev}`, year, round: r, originalTeamId: t.id, ownerTeamId: owner });
      }
    }
  }
  return picks;
}

export function generateLeague(seed: string, cfg: LeagueConfig = defaultConfig()): League {
  const teams: Team[] = [];
  const players: Record<string, Player> = {};
  const gmRng = rngFor(seed, 'gen', 'gms');
  const gmNames = gmRng.shuffle(GM_LAST);

  EXISTING_TEAMS.slice(0, cfg.existingTeams).forEach((def, i) => {
    const rng = rngFor(seed, 'gen', 'team', i);
    const quality = Math.max(-5, Math.min(5, rng.normal(0, 2.4)));
    const logoRng = rngFor(seed, 'gen', 'logo', i);
    const colors = { primary: def.primary, secondary: def.secondary, accent: '#e5e7eb' };
    const team: Team = {
      id: def.abbrev.toLowerCase(),
      city: def.city,
      name: def.name,
      abbrev: def.abbrev,
      colors,
      logo: { shape: logoRng.pick(LOGO_SHAPES), icon: logoRng.pick(LOGO_ICONS), colors, text: '' },
      conference: def.conference,
      division: def.division,
      lat: def.lat,
      lon: def.lon,
      personality: pickPersonality(rng, quality),
      gmName: `${gmRng.pick(GM_FIRST)} ${gmNames[i % gmNames.length]}`,
      isExpansion: false,
      lastSeasonPoints: Math.max(55, Math.min(121, Math.round(92 + quality * 6 + rng.normal(0, 6)))),
    };
    teams.push(team);
    const roster = genTeamPlayers(rng, team, i, quality, cfg);
    repairExposure(rng, roster, cfg);
    // Extensions during the repair can push the committed payroll over the cap.
    const committed = roster.reduce((s, p) => s + (!p.farm && p.contract && p.contract.yearsLeft >= 1 ? p.contract.capHit : 0), 0);
    if (committed > cfg.salaryCap) fitPayroll(roster, cfg.salaryCap * 0.99, cfg);
    for (const p of roster) players[p.id] = p;
  });

  const divisions = DIVISIONS.map((d) => ({
    name: d.name,
    conference: d.conference,
    teamIds: teams.filter((t) => t.division === d.name).map((t) => t.id),
  }));

  return { seed, config: cfg, teams, players, picks: genPicks(teams, cfg, seed), divisions, franchise: null };
}

/** Diagnostic summary used by tests and the debug screen. */
export function rosterCounts(league: League, teamId: string) {
  const all = Object.values(league.players).filter((p) => p.teamId === teamId);
  return {
    active: countGroups(all.filter((p) => !p.farm)),
    farm: countGroups(all.filter((p) => p.farm)),
    total: all.length,
  };
}
