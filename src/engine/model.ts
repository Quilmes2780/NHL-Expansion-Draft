/** Core data model. Plain serialisable objects only (no classes), so states can be saved as JSON. */

import type { LeagueConfig } from './config';

export type Position = 'C' | 'LW' | 'RW' | 'D' | 'G';
export type PositionGroup = 'F' | 'D' | 'G';
export type Hand = 'L' | 'R';
export type ContractStatus = 'UFA' | 'RFA';
export type Personality = 'rebuild' | 'contender' | 'capStrapped';
export type Mandate = 'playoffsNow' | 'patientBuild' | 'budget';

export const SKATER_ATTRS = [
  'skating',
  'shooting',
  'passing',
  'puckHandling',
  'defense',
  'physical',
  'hockeyIQ',
] as const;
export const GOALIE_ATTRS = ['reflexes', 'positioning', 'reboundControl', 'puckHandling'] as const;

export type SkaterAttr = (typeof SKATER_ATTRS)[number];
export type GoalieAttr = (typeof GOALIE_ATTRS)[number];
export type SkaterAttributes = Record<SkaterAttr, number>;
export type GoalieAttributes = Record<GoalieAttr, number>;

export interface Contract {
  /** Average annual value counted against the cap, in dollars. */
  capHit: number;
  /** Seasons remaining starting with the upcoming season. 0 = contract expires now (pending FA). */
  yearsLeft: number;
  /** Status when the contract expires. */
  expiryStatus: ContractStatus;
  nmc: boolean;
  ntc: boolean;
  /** Player agreed to waive his NMC for the expansion draft. */
  nmcWaived: boolean;
  elc: boolean;
  twoWay: boolean;
}

export interface SeasonStats {
  gp: number;
  goals: number;
  assists: number;
  plusMinus: number;
  pim: number;
  /** Goalies only. */
  wins?: number;
  savePct?: number;
  gaa?: number;
  shutouts?: number;
}

export interface Injury {
  description: string;
  gamesRemaining: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  nationality: string;
  position: Position;
  shoots: Hand;
  skater?: SkaterAttributes;
  goalie?: GoalieAttributes;
  ovr: number;
  potential: number;
  /** null = unsigned draft pick (no contract yet). */
  contract: Contract | null;
  /** Completed professional seasons. */
  proYears: number;
  draftYear: number | null;
  gpLastSeason: number;
  gpLastTwo: number;
  lastSeason: SeasonStats;
  morale: number;
  form: number;
  injury: Injury | null;
  seasonStats: SeasonStats;
  teamId: string | null;
  /** true = farm team / prospect pool, false = active roster. */
  farm: boolean;
}

export interface DraftPick {
  id: string;
  year: number;
  round: number;
  originalTeamId: string;
  ownerTeamId: string;
}

export interface TeamColors {
  primary: string;
  secondary: string;
  accent: string;
}

export interface LogoSpec {
  shape: 'shield' | 'circle' | 'hexagon' | 'diamond' | 'square';
  icon: string;
  colors: TeamColors;
  text: string;
}

export interface Team {
  id: string;
  city: string;
  name: string;
  abbrev: string;
  colors: TeamColors;
  logo: LogoSpec;
  conference: string;
  division: string;
  lat: number;
  lon: number;
  personality: Personality;
  gmName: string;
  isExpansion: boolean;
  /** Last season's points, used for lottery odds and analyst texts. */
  lastSeasonPoints: number;
}

export interface CityProfile {
  id: string;
  city: string;
  region: string;
  lat: number;
  lon: number;
  /** 1–10 ratings. */
  marketSize: number;
  tradition: number;
  arenaCapacity: number;
  taxAdvantage: number;
  travelLoad: number;
  blurb: string;
}

export interface Franchise {
  teamId: string;
  cityId: string;
  mandate: Mandate;
}

export interface Division {
  name: string;
  conference: string;
  teamIds: string[];
}

export interface League {
  seed: string;
  config: LeagueConfig;
  teams: Team[];
  players: Record<string, Player>;
  picks: DraftPick[];
  divisions: Division[];
  franchise: Franchise | null;
}

export const groupOf = (pos: Position): PositionGroup =>
  pos === 'D' ? 'D' : pos === 'G' ? 'G' : 'F';

export const fullName = (p: Player): string => `${p.firstName} ${p.lastName}`;

export const teamName = (t: Team): string => `${t.city} ${t.name}`;

export function playersOfTeam(league: League, teamId: string): Player[] {
  return Object.values(league.players).filter((p) => p.teamId === teamId);
}

export function teamById(league: League, teamId: string): Team {
  const t = league.teams.find((x) => x.id === teamId);
  if (!t) throw new Error(`Unknown team ${teamId}`);
  return t;
}

/** Sum of next-season cap hits of all players under contract (active + farm one-way). */
export function teamPayroll(league: League, teamId: string): number {
  let sum = 0;
  for (const p of playersOfTeam(league, teamId)) {
    if (p.contract && p.contract.yearsLeft >= 1 && !p.farm) sum += p.contract.capHit;
  }
  return sum;
}
