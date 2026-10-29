/**
 * Fog of War: other teams' ratings are shown as ranges. Scouting narrows the ranges level by level;
 * each narrower range lies inside the previous one and always contains the true value.
 */

import type { Player } from '../model';
import { GOALIE_ATTRS, SKATER_ATTRS } from '../model';
import { rngFor } from '../rng';

export const MAX_SCOUT_LEVEL = 3;
/** Points per additional scouting level. */
export const SCOUT_COST = 1;

const OVR_HALF = [7, 4, 2, 1];
const POT_HALF = [10, 6, 3, 2];
const ATTR_HALF = [9, 5, 3, 1];

export type Range = [number, number];

export interface ScoutView {
  level: number;
  exact: boolean;
  ovr: Range;
  potential: Range;
  attrs: Record<string, Range>;
}

function nestedRange(seed: string, key: string, truth: number, level: number, halves: number[]): Range {
  const rng = rngFor(seed, 'scout', key);
  let a = rng.range(0, 2 * (halves[0] as number));
  for (let l = 1; l <= level; l++) {
    const prevW = 2 * (halves[l - 1] as number);
    const w = 2 * (halves[l] as number);
    const lo = Math.max(0, a - prevW + w);
    const hi = Math.min(w, a);
    a = rng.range(lo, hi);
  }
  const width = 2 * (halves[level] as number);
  const low = Math.round(truth - a);
  const high = Math.round(truth - a + width);
  return [Math.max(20, Math.min(low, truth)), Math.min(99, Math.max(high, truth))];
}

export function scoutView(seed: string, p: Player, level: number, exact = false): ScoutView {
  const keys: readonly string[] = p.position === 'G' ? GOALIE_ATTRS : SKATER_ATTRS;
  const values = (p.position === 'G' ? p.goalie : p.skater) as Record<string, number> | undefined;
  if (exact) {
    const attrs: Record<string, Range> = {};
    for (const k of keys) attrs[k] = [values?.[k] ?? 0, values?.[k] ?? 0];
    return { level, exact: true, ovr: [p.ovr, p.ovr], potential: [p.potential, p.potential], attrs };
  }
  const attrs: Record<string, Range> = {};
  for (const k of keys) attrs[k] = nestedRange(seed, `${p.id}|${k}`, values?.[k] ?? 0, level, ATTR_HALF);
  return {
    level,
    exact: false,
    ovr: nestedRange(seed, `${p.id}|ovr`, p.ovr, level, OVR_HALF),
    potential: nestedRange(seed, `${p.id}|pot`, Math.max(p.potential, p.ovr), level, POT_HALF),
    attrs,
  };
}

export const rangeMid = (r: Range): number => (r[0] + r[1]) / 2;
export const formatRange = (r: Range): string => (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);
