/**
 * Import/export of custom league data (teams + players) in a documented JSON format.
 * Missing details (attributes, potential, stats) are filled in deterministically from the seed.
 * See README.md, section "JSON-Import eigener Ligadaten".
 */

import type { ExpansionRules, LeagueConfig } from '../config';
import { defaultConfig } from '../config';
import { genLastSeasonStats, genPlayer, potentialFor } from '../gen/player';
import { genPicks, repairExposure } from '../gen/league';
import { LOGO_ICONS, LOGO_SHAPES } from '../data/cities';
import type { Contract, Division, GoalieAttributes, League, Personality, Player, Position, SkaterAttributes, Team } from '../model';
import { GOALIE_ATTRS, SKATER_ATTRS, groupOf } from '../model';
import { rngFor } from '../rng';
import { goalieOvr, skaterOvr } from '../value';

export const LEAGUE_FORMAT = 'team33-league';
export const LEAGUE_FORMAT_VERSION = 1;
export const MIN_TEAMS = 28;
export const MAX_TEAMS = 32;

export interface TeamData {
  abbrev: string;
  city: string;
  name: string;
  conference: string;
  division: string;
  primaryColor: string;
  secondaryColor: string;
  lat: number;
  lon: number;
  personality?: Personality;
  lastSeasonPoints?: number;
}

export interface ContractData {
  capHit: number;
  yearsLeft: number;
  expiryStatus?: 'UFA' | 'RFA';
  nmc?: boolean;
  ntc?: boolean;
  elc?: boolean;
  twoWay?: boolean;
}

export interface PlayerData {
  firstName: string;
  lastName: string;
  team: string;
  position: Position;
  age: number;
  nationality?: string;
  shoots?: 'L' | 'R';
  ovr?: number;
  potential?: number;
  attributes?: Record<string, number>;
  contract: ContractData | null;
  proYears?: number;
  gpLastSeason?: number;
  gpLastTwo?: number;
  farm?: boolean;
}

export interface LeagueData {
  format: typeof LEAGUE_FORMAT;
  version: number;
  name?: string;
  config?: Partial<Pick<LeagueConfig, 'salaryCap' | 'capFloorPct' | 'minSalary' | 'seasonLabel' | 'seasonStartYear'>>;
  teams: TeamData[];
  players: PlayerData[];
}

export interface ImportResult {
  league: League | null;
  errors: string[];
  warnings: string[];
}

const POSITIONS: Position[] = ['C', 'LW', 'RW', 'D', 'G'];
const PERSONALITIES: Personality[] = ['rebuild', 'contender', 'capStrapped'];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isColor = (v: unknown) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** Validate the structure; returns German error messages with the offending path. */
export function validateLeagueData(raw: unknown, rules: ExpansionRules): string[] {
  const e: string[] = [];
  if (!raw || typeof raw !== 'object') return ['Die Datei enthält kein JSON-Objekt.'];
  const d = raw as Partial<LeagueData>;
  if (d.format !== LEAGUE_FORMAT) e.push(`"format" muss "${LEAGUE_FORMAT}" sein.`);
  if (d.version !== LEAGUE_FORMAT_VERSION) e.push(`"version" muss ${LEAGUE_FORMAT_VERSION} sein.`);
  if (!Array.isArray(d.teams)) return [...e, '"teams" fehlt oder ist kein Array.'];
  if (!Array.isArray(d.players)) return [...e, '"players" fehlt oder ist kein Array.'];
  const minTeams = Math.max(MIN_TEAMS, rules.roster.minForwards + rules.roster.minDefense + rules.roster.minGoalies);
  if (d.teams.length < minTeams || d.teams.length > MAX_TEAMS)
    e.push(`Es werden ${minTeams}–${MAX_TEAMS} Teams benötigt (Expansion Draft: 1 Spieler pro Team, Spielplan mit 82 Spielen); gefunden: ${d.teams.length}.`);
  const abbrevs = new Set<string>();
  d.teams.forEach((t, i) => {
    const p = `teams[${i}]`;
    if (!isStr(t?.abbrev) || !/^[A-Za-z]{2,4}$/.test(t.abbrev)) e.push(`${p}.abbrev: 2–4 Buchstaben erwartet.`);
    else if (t.abbrev.toUpperCase() === 'EXP') e.push(`${p}.abbrev: "EXP" ist für das Expansionsteam reserviert.`);
    else if (abbrevs.has(t.abbrev.toUpperCase())) e.push(`${p}.abbrev: "${t.abbrev}" ist doppelt.`);
    else abbrevs.add(t.abbrev.toUpperCase());
    for (const k of ['city', 'name', 'conference', 'division'] as const) if (!isStr(t?.[k])) e.push(`${p}.${k}: Text erwartet.`);
    if (!isColor(t?.primaryColor) || !isColor(t?.secondaryColor)) e.push(`${p}: primaryColor/secondaryColor als "#rrggbb" erwartet.`);
    if (!isNum(t?.lat) || !isNum(t?.lon) || Math.abs(t.lat) > 90 || Math.abs(t.lon) > 180) e.push(`${p}: lat/lon als Koordinaten erwartet.`);
    if (t?.personality !== undefined && !PERSONALITIES.includes(t.personality)) e.push(`${p}.personality: eines von ${PERSONALITIES.join(', ')}.`);
  });
  const confs = new Map<string, Set<string>>();
  for (const t of d.teams) if (isStr(t?.conference) && isStr(t?.division)) (confs.get(t.conference) ?? confs.set(t.conference, new Set()).get(t.conference)!).add(t.division);
  if (confs.size !== 2) e.push(`Es werden genau 2 Conferences benötigt (gefunden: ${confs.size}).`);
  for (const [c, divs] of confs) if (divs.size !== 2) e.push(`Conference "${c}" braucht genau 2 Divisionen (gefunden: ${divs.size}).`);
  const divCount = new Map<string, number>();
  for (const t of d.teams) if (isStr(t?.division)) divCount.set(t.division, (divCount.get(t.division) ?? 0) + 1);
  for (const [div, n] of divCount) if (n < 4) e.push(`Division "${div}" braucht mindestens 4 Teams (gefunden: ${n}).`);

  const perTeam = new Map<string, Record<'F' | 'D' | 'G', number>>();
  d.players.forEach((pl, i) => {
    const p = `players[${i}]`;
    if (!isStr(pl?.firstName) || !isStr(pl?.lastName)) e.push(`${p}: firstName/lastName erwartet.`);
    if (!isStr(pl?.team) || !abbrevs.has(pl.team.toUpperCase())) e.push(`${p}.team: unbekanntes Team "${pl?.team}".`);
    if (!POSITIONS.includes(pl?.position)) e.push(`${p}.position: eines von ${POSITIONS.join(', ')}.`);
    if (!isNum(pl?.age) || pl.age < 16 || pl.age > 45) e.push(`${p}.age: Zahl zwischen 16 und 45.`);
    if (pl?.ovr !== undefined && (!isNum(pl.ovr) || pl.ovr < 25 || pl.ovr > 99)) e.push(`${p}.ovr: Zahl zwischen 25 und 99.`);
    if (pl?.ovr === undefined && !pl?.attributes) e.push(`${p}: entweder "ovr" oder "attributes" angeben.`);
    if (pl?.attributes) {
      const keys: readonly string[] = pl.position === 'G' ? GOALIE_ATTRS : SKATER_ATTRS;
      for (const k of keys) if (!isNum(pl.attributes[k]) || pl.attributes[k]! < 1 || pl.attributes[k]! > 99) e.push(`${p}.attributes.${k}: Zahl zwischen 1 und 99.`);
    }
    if (pl?.contract !== null && pl?.contract !== undefined) {
      const c = pl.contract;
      if (!isNum(c.capHit) || c.capHit < 0) e.push(`${p}.contract.capHit: Betrag in Dollar erwartet.`);
      if (!isNum(c.yearsLeft) || c.yearsLeft < 0 || c.yearsLeft > 8 || !Number.isInteger(c.yearsLeft)) e.push(`${p}.contract.yearsLeft: ganze Zahl 0–8.`);
      if (c.expiryStatus !== undefined && c.expiryStatus !== 'UFA' && c.expiryStatus !== 'RFA') e.push(`${p}.contract.expiryStatus: "UFA" oder "RFA".`);
    } else if (pl?.contract === undefined) e.push(`${p}.contract: Vertrag oder null (ungesignter Draftpick) angeben.`);
    if (isStr(pl?.team) && POSITIONS.includes(pl?.position) && !pl.farm) {
      const c = perTeam.get(pl.team.toUpperCase()) ?? { F: 0, D: 0, G: 0 };
      c[groupOf(pl.position)]++;
      perTeam.set(pl.team.toUpperCase(), c);
    }
  });
  for (const a of abbrevs) {
    const c = perTeam.get(a) ?? { F: 0, D: 0, G: 0 };
    if (c.F < 12 || c.D < 6 || c.G < 2) e.push(`Team ${a}: NHL-Kader braucht mind. 12 F, 6 D, 2 G (hat ${c.F} F, ${c.D} D, ${c.G} G).`);
  }
  return e.slice(0, 50);
}

export function importLeagueData(raw: unknown, seed: string, cfgIn: LeagueConfig = defaultConfig()): ImportResult {
  const errors = validateLeagueData(raw, cfgIn.rules);
  if (errors.length) return { league: null, errors, warnings: [] };
  const d = raw as LeagueData;
  const cfg: LeagueConfig = { ...cfgIn, ...(d.config ?? {}), existingTeams: d.teams.length };
  const warnings: string[] = [];
  const teams: Team[] = d.teams.map((t, i) => {
    const r = rngFor(seed, 'import-team', i);
    const colors = { primary: t.primaryColor, secondary: t.secondaryColor, accent: '#e5e7eb' };
    return {
      id: t.abbrev.toLowerCase(),
      city: t.city,
      name: t.name,
      abbrev: t.abbrev.toUpperCase(),
      colors,
      logo: { shape: r.pick(LOGO_SHAPES), icon: r.pick(LOGO_ICONS), colors, text: '' },
      conference: t.conference,
      division: t.division,
      lat: t.lat,
      lon: t.lon,
      personality: t.personality ?? r.pick(PERSONALITIES),
      gmName: `GM ${t.city}`,
      isExpansion: false,
      lastSeasonPoints: t.lastSeasonPoints ?? r.int(70, 110),
    };
  });
  const byTeam = new Map<string, Player[]>(teams.map((t) => [t.id, []]));
  d.players.forEach((pl, i) => {
    const rng = rngFor(seed, 'import-player', i);
    const teamId = pl.team.toLowerCase();
    let skater: SkaterAttributes | undefined;
    let goalie: GoalieAttributes | undefined;
    let ovr: number;
    if (pl.attributes) {
      if (pl.position === 'G') goalie = Object.fromEntries(GOALIE_ATTRS.map((k) => [k, Math.round(pl.attributes![k]!)])) as GoalieAttributes;
      else skater = Object.fromEntries(SKATER_ATTRS.map((k) => [k, Math.round(pl.attributes![k]!)])) as SkaterAttributes;
      ovr = goalie ? goalieOvr(goalie) : skaterOvr(pl.position, skater as SkaterAttributes);
      if (pl.ovr !== undefined && Math.abs(pl.ovr - ovr) > 3) warnings.push(`players[${i}]: OVR ${pl.ovr} weicht von den Attributen ab, verwendet wird ${ovr}.`);
    } else {
      const gen = genPlayer(rng, { id: 'x', position: pl.position, age: pl.age, ovr: pl.ovr as number, teamId, farm: !!pl.farm, draftYear: null });
      skater = gen.skater;
      goalie = gen.goalie;
      ovr = gen.ovr;
    }
    const contract: Contract | null = pl.contract
      ? {
          capHit: Math.round(pl.contract.capHit),
          yearsLeft: pl.contract.yearsLeft,
          expiryStatus: pl.contract.expiryStatus ?? (pl.age + pl.contract.yearsLeft <= 26 ? 'RFA' : 'UFA'),
          nmc: !!pl.contract.nmc,
          ntc: !!pl.contract.ntc,
          nmcWaived: false,
          elc: !!pl.contract.elc,
          twoWay: pl.contract.twoWay ?? !!pl.contract.elc,
        }
      : null;
    const proYears = pl.proYears ?? (contract ? Math.max(0, pl.age - 20) : 0);
    const player: Player = {
      id: `i${i}`,
      firstName: pl.firstName.trim(),
      lastName: pl.lastName.trim(),
      age: Math.round(pl.age),
      nationality: pl.nationality ?? 'CAN',
      position: pl.position,
      shoots: pl.shoots ?? (rng.chance(0.6) ? 'L' : 'R'),
      ovr,
      potential: Math.max(ovr, pl.potential ?? potentialFor(rng, ovr, pl.age)),
      contract,
      proYears,
      draftYear: null,
      gpLastSeason: pl.gpLastSeason ?? (pl.farm ? 0 : rng.int(45, 82)),
      gpLastTwo: 0,
      lastSeason: { gp: 0, goals: 0, assists: 0, plusMinus: 0, pim: 0 },
      morale: 70,
      form: 0,
      injury: null,
      seasonStats: { gp: 0, goals: 0, assists: 0, plusMinus: 0, pim: 0 },
      teamId,
      farm: !!pl.farm,
    };
    if (skater) player.skater = skater;
    if (goalie) player.goalie = goalie;
    player.gpLastTwo = Math.max(player.gpLastSeason, pl.gpLastTwo ?? player.gpLastSeason + (proYears >= 2 ? rng.int(30, 82) : 0));
    player.lastSeason = genLastSeasonStats(rng, player, player.gpLastSeason);
    byTeam.get(teamId)?.push(player);
  });
  const players: Record<string, Player> = {};
  for (const [teamId, roster] of byTeam) {
    const before = JSON.stringify(roster.map((p) => [p.contract?.yearsLeft, p.contract?.nmcWaived, p.gpLastSeason]));
    repairExposure(rngFor(seed, 'import-repair', teamId), roster, cfg);
    if (JSON.stringify(roster.map((p) => [p.contract?.yearsLeft, p.contract?.nmcWaived, p.gpLastSeason])) !== before)
      warnings.push(`Team ${teamId.toUpperCase()}: Daten leicht angepasst, damit die Exposure-Regeln des Expansion Drafts erfüllbar sind.`);
    for (const p of roster) players[p.id] = p;
  }
  const divNames = [...new Set(teams.map((t) => t.division))];
  const divisions: Division[] = divNames.map((name) => ({
    name,
    conference: teams.find((t) => t.division === name)!.conference,
    teamIds: teams.filter((t) => t.division === name).map((t) => t.id),
  }));
  // Keep conference order stable: the first conference's divisions first.
  divisions.sort((a, b) => a.conference.localeCompare(b.conference) || a.name.localeCompare(b.name));
  return {
    league: { seed, config: cfg, teams, players, picks: genPicks(teams, cfg, seed), divisions, franchise: null },
    errors: [],
    warnings,
  };
}

/** Export the existing teams/players of a league as importable data (also a handy template). */
export function exportLeagueData(league: League): LeagueData {
  const teams = league.teams.filter((t) => !t.isExpansion);
  const ids = new Set(teams.map((t) => t.id));
  return {
    format: LEAGUE_FORMAT,
    version: LEAGUE_FORMAT_VERSION,
    name: `Export ${league.seed}`,
    config: {
      salaryCap: league.config.salaryCap,
      capFloorPct: league.config.capFloorPct,
      minSalary: league.config.minSalary,
      seasonLabel: league.config.seasonLabel,
      seasonStartYear: league.config.seasonStartYear,
    },
    teams: teams.map((t) => ({
      abbrev: t.abbrev,
      city: t.city,
      name: t.name,
      conference: t.conference,
      division: t.division,
      primaryColor: t.colors.primary,
      secondaryColor: t.colors.secondary,
      lat: t.lat,
      lon: t.lon,
      personality: t.personality,
      lastSeasonPoints: t.lastSeasonPoints,
    })),
    players: Object.values(league.players)
      .filter((p) => p.teamId && ids.has(p.teamId))
      .map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        team: league.teams.find((t) => t.id === p.teamId)!.abbrev,
        position: p.position,
        age: p.age,
        nationality: p.nationality,
        shoots: p.shoots,
        ovr: p.ovr,
        potential: p.potential,
        attributes: { ...((p.position === 'G' ? p.goalie : p.skater) as Record<string, number>) },
        contract: p.contract
          ? { capHit: p.contract.capHit, yearsLeft: p.contract.yearsLeft, expiryStatus: p.contract.expiryStatus, nmc: p.contract.nmc && !p.contract.nmcWaived, ntc: p.contract.ntc, elc: p.contract.elc, twoWay: p.contract.twoWay }
          : null,
        proYears: p.proYears,
        gpLastSeason: p.gpLastSeason,
        gpLastTwo: p.gpLastTwo,
        farm: p.farm,
      })),
  };
}
