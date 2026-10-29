/**
 * Draft lottery and the (simplified) entry draft. The expansion team gets the lottery odds of the
 * team with the third-worst record. Draft prospects are subject to the same Fog of War as the
 * expansion draft.
 */

import { EXPANSION_TEAM_ID } from '../franchise';
import { genPlayer } from '../gen/player';
import type { DraftPick, League, Player, Position } from '../model';
import { isInauguralSeason } from '../model';
import { rngFor } from '../rng';
import { rangeMid, scoutView } from '../expansion/scouting';

/** Lottery odds (in %) for the 17 non-playoff teams, worst first; slot 3 belongs to the expansion team. */
const ODDS = [18.5, 13.5, 11.5, 11.5, 9.5, 8.5, 7.5, 6.5, 6.0, 5.0, 3.5, 3.0, 2.5, 2.0, 1.5, 0.5, 0.5];
/** A team can move up at most this many spots. */
const MAX_JUMP = 10;
const NON_PLAYOFF = ODDS.length;
const DRAFT_CLASS_EXTRA = 30;

export interface LotteryResult {
  /** All teams, worst record first (expansion team inserted as third-worst). */
  standing: string[];
  /** Lottery odds in [0, 1] for the non-playoff teams. */
  odds: Record<string, number>;
  winners: [string, string];
  /** Round 1 order after the lottery (original team ids). */
  round1: string[];
}

export function runLottery(league: League): LotteryResult {
  const inaugural = isInauguralSeason(league);
  const ranked = league.teams
    .filter((t) => !inaugural || !t.isExpansion)
    .sort((a, b) => a.lastSeasonPoints - b.lastSeasonPoints || a.id.localeCompare(b.id))
    .map((t) => t.id);
  // In its first offseason the expansion team gets the third-worst slot; later its own record counts.
  const standing = inaugural ? [...ranked.slice(0, 2), EXPANSION_TEAM_ID, ...ranked.slice(2)] : ranked;
  // 16 teams make the playoffs; everybody else is in the lottery.
  const odds0 = ODDS.slice(0, Math.max(2, Math.min(NON_PLAYOFF, standing.length - 16)));
  const lotteryTeams = standing.slice(0, odds0.length);
  const total = odds0.reduce((a, b) => a + b, 0);
  const odds: Record<string, number> = {};
  lotteryTeams.forEach((t, i) => (odds[t] = (odds0[i] as number) / total));

  const rng = rngFor(league.seed, 'lottery', league.config.seasonStartYear);
  const first = rng.weighted(lotteryTeams.slice(0, MAX_JUMP + 1), (t) => odds[t] ?? 0);
  const second = rng.weighted(
    lotteryTeams.slice(0, MAX_JUMP + 2).filter((t) => t !== first),
    (t) => odds[t] ?? 0,
  );
  const round1 = [first, second, ...standing.filter((t) => t !== first && t !== second)];
  return { standing, odds, winners: [first, second], round1 };
}

/** The expansion team gets its own picks for the coming years (once). */
export function ensureExpansionPicks(league: League): League {
  if (league.picks.some((p) => p.originalTeamId === EXPANSION_TEAM_ID)) return league;
  const picks: DraftPick[] = [...league.picks];
  for (let y = 0; y < league.config.pickYearsAhead; y++) {
    const year = league.config.seasonStartYear + y;
    for (let r = 1; r <= league.config.draftRounds; r++)
      picks.push({ id: `${year}-R${r}-EXP`, year, round: r, originalTeamId: EXPANSION_TEAM_ID, ownerTeamId: EXPANSION_TEAM_ID });
  }
  return { ...league, picks };
}

export interface DraftSlot {
  overall: number;
  round: number;
  pickId: string;
  originalTeamId: string;
  ownerTeamId: string;
  playerId: string | null;
}

export interface EntryDraftState {
  lottery: LotteryResult;
  slots: DraftSlot[];
  /** Prospects of the draft class (not yet part of league.players). */
  prospects: Record<string, Player>;
  /** Central scouting ranking (noisy), best first. */
  centralRank: string[];
  pointer: number;
  scouting: Record<string, number>;
  scoutingBudget: number;
  scoutingSpent: number;
}

const CLASS_POSITIONS: { pos: Position; w: number }[] = [
  { pos: 'C', w: 20 },
  { pos: 'LW', w: 17 },
  { pos: 'RW', w: 17 },
  { pos: 'D', w: 35 },
  { pos: 'G', w: 11 },
];

export function generateDraftClass(league: League, size: number): Player[] {
  const rng = rngFor(league.seed, 'draftclass', league.config.seasonStartYear);
  const out: Player[] = [];
  for (let i = 0; i < size; i++) {
    const pos = rng.weighted(CLASS_POSITIONS, (x) => x.w).pos;
    const age = rng.chance(0.8) ? 18 : 19;
    const potential = Math.round(Math.min(94, Math.max(52, 91 - 32 * Math.pow(i / size, 0.6) + rng.normal(0, 4))));
    const ovr = Math.round(Math.min(potential, 42 + (potential - 60) * 0.35 + rng.normal(0, 3)));
    const p = genPlayer(rng, { id: `dc${league.config.seasonStartYear}-${i}`, position: pos, age, ovr, teamId: null, farm: true, draftYear: league.config.seasonStartYear });
    p.potential = Math.max(p.ovr, potential);
    p.contract = null;
    out.push(p);
  }
  return out;
}

export function startEntryDraft(league: League, scoutingBudget: number): { league: League; state: EntryDraftState } {
  const lg = ensureExpansionPicks(league);
  const lottery = runLottery(lg);
  const year = lg.config.seasonStartYear;
  const slots: DraftSlot[] = [];
  for (let r = 1; r <= lg.config.draftRounds; r++) {
    const order = r === 1 ? lottery.round1 : lottery.standing;
    for (const teamId of order) {
      const pick = lg.picks.find((p) => p.year === year && p.round === r && p.originalTeamId === teamId);
      if (!pick) continue;
      slots.push({ overall: slots.length + 1, round: r, pickId: pick.id, originalTeamId: teamId, ownerTeamId: pick.ownerTeamId, playerId: null });
    }
  }
  const cls = generateDraftClass(lg, slots.length + DRAFT_CLASS_EXTRA);
  const prospects: Record<string, Player> = {};
  for (const p of cls) prospects[p.id] = p;
  const rng = rngFor(lg.seed, 'centralrank', year);
  const centralRank = cls
    .map((p) => ({ id: p.id, v: p.potential + 0.3 * p.ovr + rng.normal(0, 4) }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.id);
  return {
    league: lg,
    state: { lottery, slots, prospects, centralRank, pointer: 0, scouting: {}, scoutingBudget, scoutingSpent: 0 },
  };
}

export const currentSlot = (s: EntryDraftState): DraftSlot | null => s.slots[s.pointer] ?? null;
export const isDraftDone = (s: EntryDraftState): boolean => s.pointer >= s.slots.length;

export function availableProspects(s: EntryDraftState): Player[] {
  const taken = new Set(s.slots.map((x) => x.playerId).filter(Boolean));
  return s.centralRank.filter((id) => !taken.has(id)).map((id) => s.prospects[id] as Player);
}

function aiChoice(league: League, s: EntryDraftState, teamId: string): Player {
  let best: Player | null = null;
  let bestV = -Infinity;
  for (const p of availableProspects(s)) {
    const v = p.potential + 0.3 * p.ovr + rngFor(league.seed, 'edraft', league.config.seasonStartYear, teamId, p.id).normal(0, 3) - (p.position === 'G' ? 2 : 0);
    if (v > bestV) {
      bestV = v;
      best = p;
    }
  }
  return best as Player;
}

/** Perceived value for the user's auto pick (scouted midpoints only). */
export function perceivedProspectValue(league: League, s: EntryDraftState, p: Player): number {
  const v = scoutView(league.seed, p, s.scouting[p.id] ?? 0);
  return rangeMid(v.potential) + 0.3 * rangeMid(v.ovr);
}

function applyPick(league: League, s: EntryDraftState, playerId: string): { league: League; state: EntryDraftState } {
  const slot = currentSlot(s);
  const p = s.prospects[playerId];
  if (!slot || !p || slot.playerId) return { league, state: s };
  if (availableProspects(s).every((x) => x.id !== playerId)) return { league, state: s };
  const slots = s.slots.map((x, i) => (i === s.pointer ? { ...x, playerId } : x));
  const drafted: Player = { ...p, teamId: slot.ownerTeamId, farm: true };
  return {
    league: { ...league, players: { ...league.players, [playerId]: drafted } },
    state: { ...s, slots, pointer: s.pointer + 1 },
  };
}

/** Let the AI pick until it is the expansion team's turn (or the draft is over). */
export function simToUserPick(league: League, s: EntryDraftState): { league: League; state: EntryDraftState } {
  let lg = league;
  let st = s;
  while (!isDraftDone(st) && currentSlot(st)?.ownerTeamId !== EXPANSION_TEAM_ID) {
    const slot = currentSlot(st) as DraftSlot;
    ({ league: lg, state: st } = applyPick(lg, st, aiChoice(lg, st, slot.ownerTeamId).id));
  }
  return { league: lg, state: st };
}

export function userDraftPick(league: League, s: EntryDraftState, playerId: string): { league: League; state: EntryDraftState } {
  if (currentSlot(s)?.ownerTeamId !== EXPANSION_TEAM_ID) return { league, state: s };
  return applyPick(league, s, playerId);
}

export function autoUserPick(league: League, s: EntryDraftState): { league: League; state: EntryDraftState } {
  const best = [...availableProspects(s)].sort((a, b) => perceivedProspectValue(league, s, b) - perceivedProspectValue(league, s, a))[0];
  return best ? userDraftPick(league, s, best.id) : { league, state: s };
}

/** Finish the whole draft, auto-picking for the user as well. */
export function simEntryDraft(league: League, s: EntryDraftState): { league: League; state: EntryDraftState } {
  let r = simToUserPick(league, s);
  while (!isDraftDone(r.state)) {
    const picked = autoUserPick(r.league, r.state);
    if (picked.state === r.state) break;
    r = simToUserPick(picked.league, picked.state);
  }
  return r;
}

export function scoutProspect(s: EntryDraftState, playerId: string): EntryDraftState {
  const lvl = s.scouting[playerId] ?? 0;
  if (lvl >= 3 || s.scoutingSpent >= s.scoutingBudget) return s;
  return { ...s, scouting: { ...s.scouting, [playerId]: lvl + 1 }, scoutingSpent: s.scoutingSpent + 1 };
}
