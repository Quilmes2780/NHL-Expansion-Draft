/** Founding the 33rd franchise and geographic realignment of the divisions. */

import { EXPANSION_CITIES } from './data/cities';
import type { CityProfile, Division, League, LogoSpec, Mandate, Team, TeamColors } from './model';

export const EXPANSION_TEAM_ID = 'exp';

export interface FranchiseOptions {
  cityId: string;
  name: string;
  abbrev: string;
  colors: TeamColors;
  logo: LogoSpec;
  mandate: Mandate;
}

export interface RealignmentResult {
  divisions: Division[];
  /** Human readable changes (German). */
  changes: string[];
}

export function cityById(id: string): CityProfile {
  const c = EXPANSION_CITIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown city ${id}`);
  return c;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function divisionCost(teams: Team[]): number {
  let s = 0;
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++) s += distanceKm(teams[i] as Team, teams[j] as Team);
  return s;
}

function totalCost(assign: Map<string, string>, teams: Team[], divNames: string[]): number {
  return divNames.reduce((sum, d) => sum + divisionCost(teams.filter((t) => assign.get(t.id) === d)), 0);
}

/**
 * Put the new team into the geographically closest division, then try one move of a team out of the
 * oversized division if that clearly reduces total travel inside the divisions.
 */
export function realign(league: League, newTeam: Team): RealignmentResult {
  const teams = [...league.teams.filter((t) => t.id !== newTeam.id), newTeam];
  const divs = league.divisions;
  const divNames = divs.map((d) => d.name);
  const confOf = (div: string) => divs.find((d) => d.name === div)?.conference ?? '';
  const assign = new Map<string, string>();
  for (const t of teams) if (t.id !== newTeam.id) assign.set(t.id, t.division);

  let bestDiv = divNames[0] as string;
  let bestAvg = Infinity;
  for (const d of divNames) {
    const members = teams.filter((t) => assign.get(t.id) === d);
    const avg = members.reduce((s, m) => s + distanceKm(m, newTeam), 0) / Math.max(1, members.length);
    if (avg < bestAvg) {
      bestAvg = avg;
      bestDiv = d;
    }
  }
  assign.set(newTeam.id, bestDiv);

  const changes: string[] = [`${newTeam.city} ${newTeam.name} starten in der ${bestDiv} Division (${confOf(bestDiv)} Conference).`];
  const base = totalCost(assign, teams, divNames);
  let bestMove: { team: Team; to: string; cost: number } | null = null;
  for (const t of teams.filter((x) => assign.get(x.id) === bestDiv)) {
    for (const d of divNames) {
      if (d === bestDiv) continue;
      if (league.config.fixedConferences && confOf(d) !== confOf(bestDiv)) continue;
      const trial = new Map(assign);
      trial.set(t.id, d);
      const cost = totalCost(trial, teams, divNames);
      if (cost < base * 0.97 && (!bestMove || cost < bestMove.cost)) bestMove = { team: t, to: d, cost };
    }
  }
  if (bestMove) {
    const from = assign.get(bestMove.team.id) as string;
    assign.set(bestMove.team.id, bestMove.to);
    const confChange = confOf(from) !== confOf(bestMove.to);
    changes.push(
      `${bestMove.team.city} ${bestMove.team.name} wechseln von der ${from} in die ${bestMove.to} Division` +
        (confChange ? ` und damit in die ${confOf(bestMove.to)} Conference.` : '.'),
    );
  }

  const divisions: Division[] = divs.map((d) => ({
    name: d.name,
    conference: d.conference,
    teamIds: teams.filter((t) => assign.get(t.id) === d.name).map((t) => t.id),
  }));
  return { divisions, changes };
}

export function createFranchise(league: League, opts: FranchiseOptions): { league: League; realignment: RealignmentResult } {
  const city = cityById(opts.cityId);
  const team: Team = {
    id: EXPANSION_TEAM_ID,
    city: city.city,
    name: opts.name.trim() || 'Expansion',
    abbrev: opts.abbrev.trim().toUpperCase().slice(0, 3) || 'EXP',
    colors: opts.colors,
    logo: opts.logo,
    conference: '',
    division: '',
    lat: city.lat,
    lon: city.lon,
    personality: 'rebuild',
    gmName: 'Du',
    isExpansion: true,
    lastSeasonPoints: 0,
  };
  const realignment = realign(league, team);
  const divOf = new Map<string, Division>();
  for (const d of realignment.divisions) for (const id of d.teamIds) divOf.set(id, d);
  const teams = [...league.teams.filter((t) => t.id !== team.id), team].map((t) => {
    const d = divOf.get(t.id);
    return d ? { ...t, division: d.name, conference: d.conference } : t;
  });
  return {
    league: {
      ...league,
      teams,
      divisions: realignment.divisions,
      franchise: { teamId: team.id, cityId: city.id, mandate: opts.mandate, foundedYear: league.config.seasonStartYear },
    },
    realignment,
  };
}
