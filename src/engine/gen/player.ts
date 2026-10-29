/** Procedural player generation: names, attributes for a target OVR, potential, stats. */

import { NATIONS } from '../data/names';
import type {
  GoalieAttributes,
  Hand,
  Player,
  Position,
  SeasonStats,
  SkaterAttributes,
} from '../model';
import { GOALIE_ATTRS, SKATER_ATTRS } from '../model';
import type { Rng } from '../rng';
import { goalieOvr, skaterOvr } from '../value';

type Bias = Partial<Record<string, number>>;

const F_ARCHETYPES: Bias[] = [
  { shooting: 7, defense: -4, physical: -2 }, // sniper
  { passing: 7, hockeyIQ: 3, physical: -4 }, // playmaker
  { physical: 7, shooting: 2, skating: -3 }, // power forward
  { defense: 6, hockeyIQ: 2, shooting: -3 }, // two-way
  { physical: 7, defense: 3, shooting: -5, puckHandling: -4 }, // grinder
  { skating: 7, puckHandling: 3, physical: -5 }, // speedster
];

const D_ARCHETYPES: Bias[] = [
  { passing: 5, shooting: 4, skating: 2, defense: -4, physical: -3 }, // offensive
  { defense: 6, physical: 5, puckHandling: -5, shooting: -3 }, // shutdown
  { hockeyIQ: 3, defense: 2 }, // two-way
];

const G_ARCHETYPES: Bias[] = [
  { reflexes: 5, positioning: -3 }, // athletic
  { positioning: 5, reflexes: -3 }, // technical
  {}, // balanced
];

const clampAttr = (v: number): number => Math.max(25, Math.min(99, Math.round(v)));

function genAttributes<K extends string>(
  rng: Rng,
  keys: readonly K[],
  target: number,
  bias: Bias,
  ovrOf: (a: Record<K, number>) => number,
): Record<K, number> {
  const a = {} as Record<K, number>;
  for (const k of keys) a[k] = clampAttr(target + (bias[k] ?? 0) + rng.normal(0, 4));
  // Shift the profile so the resulting OVR lands on the target.
  for (let i = 0; i < 3; i++) {
    const diff = target - ovrOf(a);
    if (diff === 0) break;
    for (const k of keys) a[k] = clampAttr(a[k] + diff);
  }
  return a;
}

export function pickNation(rng: Rng) {
  return rng.weighted(NATIONS, (n) => n.weight);
}

function pickHand(rng: Rng, pos: Position): Hand {
  const leftShare = pos === 'LW' ? 0.68 : pos === 'RW' ? 0.42 : pos === 'D' ? 0.62 : 0.6;
  return rng.chance(leftShare) ? 'L' : 'R';
}

export function potentialFor(rng: Rng, ovr: number, age: number): number {
  let gain: number;
  if (age <= 19) gain = rng.range(10, 26);
  else if (age <= 21) gain = rng.range(6, 18);
  else if (age <= 23) gain = rng.range(2, 10);
  else if (age <= 26) gain = rng.range(0, 4);
  else gain = 0;
  return Math.min(96, Math.round(ovr + gain));
}

export function emptyStats(): SeasonStats {
  return { gp: 0, goals: 0, assists: 0, plusMinus: 0, pim: 0 };
}

export function genLastSeasonStats(rng: Rng, p: Player, gp: number): SeasonStats {
  if (p.position === 'G') {
    const sv = Math.min(0.935, Math.max(0.87, 0.884 + (p.ovr - 65) * 0.0011 + rng.normal(0, 0.007)));
    const shotsPerGame = 29;
    const gaa = Math.round((1 - sv) * shotsPerGame * 100) / 100;
    const wins = Math.round(gp * Math.min(0.68, Math.max(0.3, 0.45 + (p.ovr - 72) * 0.01 + rng.normal(0, 0.06))));
    return {
      gp,
      goals: 0,
      assists: rng.int(0, 2),
      plusMinus: 0,
      pim: rng.int(0, 4),
      wins,
      savePct: Math.round(sv * 1000) / 1000,
      gaa,
      shutouts: gp > 20 ? rng.int(0, 5) : rng.int(0, 1),
    };
  }
  const base = Math.max(0.03, (p.ovr - 55) / 35);
  const ppg = Math.pow(base, 1.6) * (p.position === 'D' ? 0.55 : 1) * rng.range(0.8, 1.2);
  const points = Math.round(ppg * gp);
  const goalShare =
    p.position === 'D' ? rng.range(0.12, 0.28) : (p.skater?.shooting ?? 60) > (p.skater?.passing ?? 60) ? rng.range(0.42, 0.58) : rng.range(0.28, 0.44);
  const goals = Math.round(points * goalShare);
  return {
    gp,
    goals,
    assists: points - goals,
    plusMinus: Math.round(rng.normal((p.ovr - 72) * 0.4, 8) * (gp / 82)),
    pim: Math.round(gp * rng.range(0.1, 0.4) * (1 + ((p.skater?.physical ?? 60) - 60) / 40)),
  };
}

export interface PlayerSpec {
  id: string;
  position: Position;
  age: number;
  ovr: number;
  teamId: string | null;
  farm: boolean;
  draftYear: number | null;
}

export function genPlayer(rng: Rng, spec: PlayerSpec): Player {
  const nation = pickNation(rng);
  const target = Math.max(35, Math.min(95, Math.round(spec.ovr)));
  let skater: SkaterAttributes | undefined;
  let goalie: GoalieAttributes | undefined;
  let ovr: number;
  if (spec.position === 'G') {
    goalie = genAttributes(rng, GOALIE_ATTRS, target, rng.pick(G_ARCHETYPES), goalieOvr);
    ovr = goalieOvr(goalie);
  } else {
    const arche = spec.position === 'D' ? rng.pick(D_ARCHETYPES) : rng.pick(F_ARCHETYPES);
    skater = genAttributes(rng, SKATER_ATTRS, target, arche, (a) => skaterOvr(spec.position, a));
    ovr = skaterOvr(spec.position, skater);
  }
  const player: Player = {
    id: spec.id,
    firstName: rng.pick(nation.first),
    lastName: rng.pick(nation.last),
    age: spec.age,
    nationality: nation.code,
    position: spec.position,
    shoots: pickHand(rng, spec.position),
    ovr,
    potential: potentialFor(rng, ovr, spec.age),
    contract: null,
    proYears: 0,
    draftYear: spec.draftYear,
    gpLastSeason: 0,
    gpLastTwo: 0,
    lastSeason: emptyStats(),
    morale: Math.round(Math.max(30, Math.min(95, rng.normal(70, 10)))),
    form: 0,
    injury: null,
    seasonStats: emptyStats(),
    teamId: spec.teamId,
    farm: spec.farm,
  };
  if (skater) player.skater = skater;
  if (goalie) player.goalie = goalie;
  return player;
}
