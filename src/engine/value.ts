/** Shared valuation helpers: OVR formula, market value, projections, contract surplus. */

import type { LeagueConfig } from './config';
import { maxSalary } from './config';
import type { GoalieAttributes, Player, Position, SkaterAttributes } from './model';

const SKATER_WEIGHTS: Record<'C' | 'W' | 'D', SkaterAttributes> = {
  C: { skating: 0.16, shooting: 0.15, passing: 0.19, puckHandling: 0.14, defense: 0.1, physical: 0.07, hockeyIQ: 0.19 },
  W: { skating: 0.17, shooting: 0.21, passing: 0.15, puckHandling: 0.16, defense: 0.07, physical: 0.08, hockeyIQ: 0.16 },
  D: { skating: 0.16, shooting: 0.07, passing: 0.13, puckHandling: 0.08, defense: 0.28, physical: 0.13, hockeyIQ: 0.15 },
};

const GOALIE_WEIGHTS: GoalieAttributes = {
  reflexes: 0.36,
  positioning: 0.33,
  reboundControl: 0.21,
  puckHandling: 0.1,
};

export function skaterOvr(pos: Position, a: SkaterAttributes): number {
  const w = SKATER_WEIGHTS[pos === 'C' ? 'C' : pos === 'D' ? 'D' : 'W'];
  let s = 0;
  for (const k of Object.keys(w) as (keyof SkaterAttributes)[]) s += w[k] * a[k];
  return Math.round(s);
}

export function goalieOvr(a: GoalieAttributes): number {
  let s = 0;
  for (const k of Object.keys(GOALIE_WEIGHTS) as (keyof GoalieAttributes)[]) s += GOALIE_WEIGHTS[k] * a[k];
  return Math.round(s);
}

/** What a player of this quality would earn on the open market (dollars). */
export function marketValue(ovr: number, age: number, pos: Position, cfg: LeagueConfig): number {
  const top = maxSalary(cfg) * 0.6;
  let v = cfg.minSalary + Math.pow(Math.max(0, ovr - 60) / 30, 2.2) * top;
  if (pos === 'G') v *= 0.85;
  if (age >= 35) v *= 0.7;
  else if (age >= 32) v *= 0.85;
  return Math.min(maxSalary(cfg), Math.max(cfg.minSalary, v));
}

/** Expected OVR `years` seasons from now, based on age curve and potential. */
export function projectedOvr(p: Pick<Player, 'ovr' | 'potential' | 'age'>, years: number): number {
  let ovr = p.ovr;
  for (let y = 0; y < years; y++) {
    const age = p.age + y;
    if (age < 27) {
      const remaining = Math.max(0, p.potential - ovr);
      ovr += remaining / Math.max(1.5, 27 - age);
    } else if (age >= 34) ovr -= 3;
    else if (age >= 31) ovr -= 1.5;
  }
  return ovr;
}

/** Value surplus of the contract over the next seasons in millions (positive = bargain). */
export function contractSurplus(p: Player, cfg: LeagueConfig): number {
  if (!p.contract) return 0;
  const years = Math.max(1, p.contract.yearsLeft);
  let total = 0;
  for (let y = 0; y < Math.min(years, 4); y++) {
    const ovr = projectedOvr(p, y);
    total += marketValue(ovr, p.age + y, p.position, cfg) - p.contract.capHit;
  }
  return total / 1_000_000;
}

export const formatMoney = (dollars: number): string =>
  `${(dollars / 1_000_000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mio. $`;
