/**
 * Trade logic. The AI values players by its own strategy (now vs. future vs. contract), applies
 * diminishing returns to packages ("quantity is not quality") and demands a margin, so obvious
 * exploits (5 depth players for a star, round-trip arbitrage) do not work.
 */

import type { Difficulty } from '../config';
import { EXPANSION_TEAM_ID } from '../franchise';
import type { DraftPick, League, Personality, Player, Team } from '../model';
import { activePlayers, contractCount, fullName, groupOf, playersOfTeam, teamPayroll } from '../model';
import { contractSurplus, projectedOvr } from '../value';

export interface TradeSide {
  players: string[];
  picks: string[];
}

export interface TradeProposal {
  partnerId: string;
  /** What the expansion team gives. */
  give: TradeSide;
  /** What the expansion team receives. */
  get: TradeSide;
}

export interface TradeEvaluation {
  accepted: boolean;
  /** AI value received / (value given × margin); ≥ 1 means the value side is fine. */
  ratio: number;
  valueIn: number;
  valueOut: number;
  reasons: string[];
}

const MARGIN: Record<Difficulty, number> = { leicht: 1.05, normal: 1.15, schwer: 1.3 };
const PACKAGE_WEIGHTS = [1, 0.6, 0.4, 0.25, 0.15, 0.1];
const MAX_CONTRACTS = 50;
const MAX_ROSTER = 23;

const STRATEGY: Record<Personality, { now: number; fut: number; cap: number; picks: number }> = {
  contender: { now: 0.75, fut: 0.25, cap: 0.35, picks: 0.75 },
  rebuild: { now: 0.35, fut: 0.65, cap: 0.55, picks: 1.3 },
  capStrapped: { now: 0.55, fut: 0.45, cap: 1.0, picks: 1.0 },
};

const PICK_BASE: Record<number, number> = { 1: 4, 2: 1.2, 3: 0.5 };

/** Trade value of a player for a team (exponential: stars are worth far more than depth). */
export function playerTradeValue(p: Player, team: Team, league: League): number {
  const w = STRATEGY[team.personality];
  const cfg = league.config;
  let score = w.now * p.ovr + w.fut * projectedOvr(p, 3) + w.cap * Math.max(-12, Math.min(12, contractSurplus(p, cfg)));
  if (!p.contract || p.contract.yearsLeft < 1) score -= p.contract ? 6 : 0; // expiring / unsigned
  if (p.injury && p.injury.gamesRemaining > 20) score -= 2;
  return Math.exp((score - 68) / 5);
}

export function pickTradeValue(pick: DraftPick, team: Team, league: League): number {
  const base = PICK_BASE[pick.round] ?? 0.2;
  return base * STRATEGY[team.personality].picks * Math.pow(0.9, pick.year - league.config.seasonStartYear);
}

/** Sum with diminishing returns: the best asset counts fully, each further one less. */
export function packageValue(values: number[]): number {
  return [...values]
    .sort((a, b) => b - a)
    .reduce((s, v, i) => s + v * (PACKAGE_WEIGHTS[i] ?? 0.05), 0);
}

function sideValues(league: League, side: TradeSide, team: Team): number[] {
  return [
    ...side.players.map((id) => playerTradeValue(league.players[id] as Player, team, league)),
    ...side.picks.map((id) => pickTradeValue(league.picks.find((p) => p.id === id) as DraftPick, team, league)),
  ];
}

const untradeable = (p: Player): boolean => !!p.contract && (p.contract.nmc || p.contract.ntc) && p.contract.yearsLeft >= 1;

export function evaluateTrade(league: League, t: TradeProposal): TradeEvaluation {
  const reasons: string[] = [];
  const partner = league.teams.find((x) => x.id === t.partnerId);
  if (!partner || partner.isExpansion) return { accepted: false, ratio: 0, valueIn: 0, valueOut: 0, reasons: ['Unbekannter Trade-Partner.'] };
  const nothing = !t.give.players.length && !t.give.picks.length && !t.get.players.length && !t.get.picks.length;
  if (nothing) return { accepted: false, ratio: 0, valueIn: 0, valueOut: 0, reasons: ['Der Trade ist leer.'] };

  // Ownership and tradeability.
  for (const id of t.give.players) {
    const p = league.players[id];
    if (!p || p.teamId !== EXPANSION_TEAM_ID) reasons.push(`${p ? fullName(p) : id} gehört nicht zu deinem Team.`);
    else if (untradeable(p)) reasons.push(`${fullName(p)} hat eine No-Trade/No-Movement-Clause.`);
  }
  for (const id of t.get.players) {
    const p = league.players[id];
    if (!p || p.teamId !== partner.id) reasons.push(`${p ? fullName(p) : id} spielt nicht bei ${partner.abbrev}.`);
    else if (untradeable(p)) reasons.push(`${fullName(p)} hat eine No-Trade/No-Movement-Clause und verweigert den Wechsel.`);
  }
  for (const id of t.give.picks)
    if (league.picks.find((p) => p.id === id)?.ownerTeamId !== EXPANSION_TEAM_ID) reasons.push(`Pick ${id} gehört dir nicht.`);
  for (const id of t.get.picks)
    if (league.picks.find((p) => p.id === id)?.ownerTeamId !== partner.id) reasons.push(`Pick ${id} gehört nicht ${partner.abbrev}.`);
  if (reasons.length) return { accepted: false, ratio: 0, valueIn: 0, valueOut: 0, reasons };

  // Cap, contracts, goalies after the trade.
  const after = executeTradeUnchecked(league, t);
  const capOk = (teamId: string) => teamPayroll(after, teamId) <= league.config.salaryCap;
  if (!capOk(EXPANSION_TEAM_ID)) reasons.push('Du wärst nach dem Trade über dem Salary Cap.');
  if (!capOk(partner.id)) reasons.push(`${partner.abbrev} wäre nach dem Trade über dem Salary Cap.`);
  if (contractCount(after, partner.id) > MAX_CONTRACTS) reasons.push(`${partner.abbrev} hätte mehr als ${MAX_CONTRACTS} Verträge.`);
  if (contractCount(after, EXPANSION_TEAM_ID) > MAX_CONTRACTS) reasons.push(`Du hättest mehr als ${MAX_CONTRACTS} Verträge.`);
  if (playersOfTeam(after, partner.id).filter((p) => p.position === 'G' && p.contract && p.contract.yearsLeft >= 1).length < 2)
    reasons.push(`${partner.abbrev} gibt seine Goalie-Tiefe nicht auf.`);

  // Value from the AI's perspective.
  const valueIn = packageValue(sideValues(league, t.give, partner));
  let valueOut = packageValue(sideValues(league, t.get, partner));
  // Roster spots are not free: every extra body beyond a full roster costs a little.
  const incoming = t.give.players.length - t.get.players.length;
  const overflow = Math.max(0, activePlayers(league, partner.id).length + incoming - MAX_ROSTER);
  valueOut += overflow * 0.25;
  const margin = MARGIN[league.config.difficulty];
  const ratio = valueIn / Math.max(0.05, valueOut * margin + 0.1);
  if (ratio < 1) {
    reasons.push(
      ratio > 0.8
        ? `${partner.gmName}: „Fast – leg noch etwas drauf.“`
        : ratio > 0.5
          ? `${partner.gmName}: „Das reicht uns bei Weitem nicht.“`
          : `${partner.gmName}: „Ist das ein Witz?“`,
    );
  }
  return { accepted: reasons.length === 0, ratio, valueIn, valueOut, reasons };
}

function executeTradeUnchecked(league: League, t: TradeProposal): League {
  const players = { ...league.players };
  const moveTo = (id: string, teamId: string) => {
    const p = players[id];
    if (p) players[id] = { ...p, teamId };
  };
  t.give.players.forEach((id) => moveTo(id, t.partnerId));
  t.get.players.forEach((id) => moveTo(id, EXPANSION_TEAM_ID));
  const picks = league.picks.map((p) =>
    t.give.picks.includes(p.id) ? { ...p, ownerTeamId: t.partnerId } : t.get.picks.includes(p.id) ? { ...p, ownerTeamId: EXPANSION_TEAM_ID } : p,
  );
  return { ...league, players, picks };
}

/** Execute after a successful evaluation. Incoming players join the active roster if there is room. */
export function executeTrade(league: League, t: TradeProposal): League {
  const after = executeTradeUnchecked(league, t);
  const players = { ...after.players };
  for (const [teamId, ids] of [
    [EXPANSION_TEAM_ID, t.get.players],
    [t.partnerId, t.give.players],
  ] as const) {
    let active = activePlayers(league, teamId).filter((p) => !ids.includes(p.id)).length;
    for (const id of ids) {
      const p = players[id] as Player;
      const goesActive = active < MAX_ROSTER;
      players[id] = { ...p, farm: !goesActive };
      if (goesActive) active++;
    }
  }
  return { ...after, players };
}

export function describeSide(league: League, side: TradeSide): string {
  const parts = [
    ...side.players.map((id) => {
      const p = league.players[id] as Player;
      return `${fullName(p)} (${p.position}, ${groupOf(p.position) === 'G' ? 'G' : p.ovr})`;
    }),
    ...side.picks.map((id) => {
      const pk = league.picks.find((p) => p.id === id);
      return pk ? `${pk.round}. Runde ${pk.year}` : id;
    }),
  ];
  return parts.join(', ') || '—';
}
