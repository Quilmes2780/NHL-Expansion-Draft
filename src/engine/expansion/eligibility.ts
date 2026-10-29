/** Expansion draft eligibility and exposure predicates (pure, rule-set driven). */

import type { ExpansionRules, ProtectionScheme } from '../config';
import type { Player, PositionGroup } from '../model';
import { groupOf } from '../model';

export function isExempt(p: Player, rules: ExpansionRules): boolean {
  if (p.contract === null) return rules.exemptUnsignedDraftees;
  return p.proYears <= rules.exemptMaxProYears;
}

export function exemptReason(p: Player, rules: ExpansionRules): string | null {
  if (p.contract === null && rules.exemptUnsignedDraftees) return 'Ungesignter Draftpick';
  if (p.proYears <= rules.exemptMaxProYears)
    return p.proYears <= 1 ? 'Im 1. Profijahr' : `Im ${p.proYears}. Profijahr`;
  return null;
}

export const hasContractNextSeason = (p: Player): boolean => !!p.contract && p.contract.yearsLeft >= 1;

export const isPendingUfa = (p: Player): boolean =>
  !!p.contract && p.contract.yearsLeft === 0 && p.contract.expiryStatus === 'UFA';

export const isPendingRfa = (p: Player): boolean =>
  !!p.contract && p.contract.yearsLeft === 0 && p.contract.expiryStatus === 'RFA';

/** NMC that must be protected (effective next season and not waived). */
export function isNmcLocked(p: Player, rules: ExpansionRules): boolean {
  return rules.nmcMustBeProtected && !!p.contract && p.contract.nmc && !p.contract.nmcWaived && p.contract.yearsLeft >= 1;
}

/** Does this player count towards the team's minimum exposure requirement? */
export function qualifiesForExposure(p: Player, rules: ExpansionRules): boolean {
  if (isExempt(p, rules)) return false;
  const g = groupOf(p.position);
  if (g === 'G') return hasContractNextSeason(p) || (rules.exposure.goalieRfaCounts && isPendingRfa(p));
  return (
    hasContractNextSeason(p) &&
    (p.gpLastSeason >= rules.exposure.gpLastSeason || p.gpLastTwo >= rules.exposure.gpLastTwo)
  );
}

export function exposureNeed(rules: ExpansionRules): Record<PositionGroup, number> {
  return { F: rules.exposure.forwards, D: rules.exposure.defense, G: rules.exposure.goalies };
}

/** Can a set of locked (must-protect) players fit into the scheme? */
export function fitsScheme(locked: Player[], scheme: ProtectionScheme): boolean {
  const c = countGroups(locked);
  if (c.G > scheme.goalies) return false;
  if (scheme.skaters !== null) return c.F + c.D <= scheme.skaters;
  return c.F <= (scheme.forwards ?? 0) && c.D <= (scheme.defense ?? 0);
}

export function countGroups(players: Player[]): Record<PositionGroup, number> {
  const c: Record<PositionGroup, number> = { F: 0, D: 0, G: 0 };
  for (const p of players) c[groupOf(p.position)]++;
  return c;
}
