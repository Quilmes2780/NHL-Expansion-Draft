/** Expansion draft state and its pure transitions. */

import { EXPANSION_TEAM_ID } from '../franchise';
import type { League, Player } from '../model';
import type { AnalystComment } from './analyst';
import { revealComments } from './analyst';
import type { ProtectionList, Violation } from './protection';
import { aiProtectAll } from './protection';
import { MAX_SCOUT_LEVEL, SCOUT_COST } from './scouting';
import type { DraftGrades, Selection } from './selection';
import { gradeDraft, isSelectable, mockDraft, validateSelection } from './selection';

export interface ExpansionDraftState {
  protections: Record<string, ProtectionList>;
  comments: AnalystComment[];
  scouting: Record<string, number>;
  scoutingBudget: number;
  scoutingSpent: number;
  selection: Selection;
  wishlist: string[];
  /** Set once the draft has been submitted successfully. */
  grades: DraftGrades | null;
  /** Player id → original team id, for the draft review. */
  origins: Record<string, string>;
}

export function startExpansionDraft(league: League): ExpansionDraftState {
  const protections = aiProtectAll(league);
  return {
    protections,
    comments: revealComments(league, protections),
    scouting: {},
    scoutingBudget: league.config.scoutingBudget[league.config.difficulty],
    scoutingSpent: 0,
    selection: {},
    wishlist: [],
    grades: null,
    origins: {},
  };
}

export const scoutLevel = (s: ExpansionDraftState, playerId: string): number => s.scouting[playerId] ?? 0;

export function canScout(s: ExpansionDraftState, playerId: string): boolean {
  return !s.grades && scoutLevel(s, playerId) < MAX_SCOUT_LEVEL && s.scoutingSpent + SCOUT_COST <= s.scoutingBudget;
}

export function scoutPlayer(s: ExpansionDraftState, playerId: string): ExpansionDraftState {
  if (!canScout(s, playerId)) return s;
  return {
    ...s,
    scouting: { ...s.scouting, [playerId]: scoutLevel(s, playerId) + 1 },
    scoutingSpent: s.scoutingSpent + SCOUT_COST,
  };
}

export function selectPlayer(league: League, s: ExpansionDraftState, teamId: string, playerId: string | null): ExpansionDraftState {
  if (s.grades) return s;
  const selection = { ...s.selection };
  if (playerId === null) delete selection[teamId];
  else {
    const list = s.protections[teamId];
    const p = league.players[playerId];
    if (!list || !p || !list.exposedIds.includes(playerId) || !isSelectable(p)) return s;
    selection[teamId] = playerId;
  }
  return { ...s, selection };
}

export function toggleWishlist(s: ExpansionDraftState, playerId: string): ExpansionDraftState {
  const has = s.wishlist.includes(playerId);
  return { ...s, wishlist: has ? s.wishlist.filter((x) => x !== playerId) : [...s.wishlist, playerId] };
}

export type SubmitResult =
  | { ok: false; violations: Violation[] }
  | { ok: true; league: League; state: ExpansionDraftState };

/** Validate and execute the draft: players move to the expansion team, grades are computed. */
export function submitExpansionDraft(league: League, s: ExpansionDraftState): SubmitResult {
  const violations = validateSelection(league, s.protections, s.selection);
  if (violations.length) return { ok: false, violations };
  const mock = mockDraft(league, s.protections);
  const grades = gradeDraft(league, s.protections, s.selection, mock);
  const players = { ...league.players };
  const picked = Object.values(s.selection).map((id) => league.players[id] as Player);
  const origins: Record<string, string> = {};
  for (const [teamId, id] of Object.entries(s.selection)) origins[id] = teamId;
  // Best 23 form the active roster, the rest start in the farm team.
  const active = new Set(
    [...picked].sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id)).slice(0, league.config.activeRosterSize).map((p) => p.id),
  );
  for (const p of picked) players[p.id] = { ...p, teamId: EXPANSION_TEAM_ID, farm: !active.has(p.id) };
  return { ok: true, league: { ...league, players }, state: { ...s, grades, origins } };
}
