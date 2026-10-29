/** Offseason flow: entry draft → free agency; trades and lineup work at any time. */

import { EXPANSION_TEAM_ID } from '../franchise';
import type { League } from '../model';
import type { EntryDraftState } from './entrydraft';
import { isDraftDone, simToUserPick, startEntryDraft } from './entrydraft';
import type { FreeAgencyState } from './freeagency';
import { startFreeAgency } from './freeagency';
import type { Lineup } from './lineup';
import type { RolloverReport } from './rollover';
import { autoLineup } from './lineup';
import type { TradeEvaluation, TradeProposal } from './trade';
import { describeSide, evaluateTrade, executeTrade } from './trade';

export type OffseasonStage = 'draft' | 'fa' | 'ready';

export interface TradeRecord {
  proposal: TradeProposal;
  text: string;
}

export interface OffseasonState {
  stage: OffseasonStage;
  draft: EntryDraftState;
  fa: FreeAgencyState | null;
  trades: TradeRecord[];
  lineup: Lineup;
  /** What happened over the summer (later seasons only): retirements, development. */
  report?: RolloverReport | null;
}

const DRAFT_SCOUTING = { leicht: 30, normal: 20, schwer: 12 } as const;

export function startOffseason(league: League, report: RolloverReport | null = null): { league: League; state: OffseasonState } {
  const started = startEntryDraft(league, DRAFT_SCOUTING[league.config.difficulty]);
  // The AI picks until the expansion team is on the clock.
  const r = simToUserPick(started.league, started.state);
  return {
    league: r.league,
    state: { stage: 'draft', draft: r.state, fa: null, trades: [], lineup: autoLineup(r.league, EXPANSION_TEAM_ID), report },
  };
}

export function finishEntryDraft(league: League, s: OffseasonState): { league: League; state: OffseasonState } {
  if (s.stage !== 'draft' || !isDraftDone(s.draft)) return { league, state: s };
  const fa = startFreeAgency(league);
  return { league: fa.league, state: { ...s, stage: 'fa', fa: fa.state } };
}

export function finishFreeAgency(s: OffseasonState): OffseasonState {
  return s.stage === 'fa' && s.fa?.done ? { ...s, stage: 'ready' } : s;
}

export function proposeTrade(
  league: League,
  s: OffseasonState,
  t: TradeProposal,
): { league: League; state: OffseasonState; evaluation: TradeEvaluation } {
  const evaluation = evaluateTrade(league, t);
  if (!evaluation.accepted) return { league, state: s, evaluation };
  const partner = league.teams.find((x) => x.id === t.partnerId);
  const text = `Trade mit ${partner?.abbrev}: du gibst ${describeSide(league, t.give)} – du erhältst ${describeSide(league, t.get)}.`;
  const next = executeTrade(league, t);
  return { league: next, state: { ...s, trades: [...s.trades, { proposal: t, text }] }, evaluation };
}
