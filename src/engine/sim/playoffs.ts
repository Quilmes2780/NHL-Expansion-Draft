/**
 * Playoffs: top 3 per division + 2 wildcards per conference, 4 rounds best-of-7 with 2-2-1-1-1
 * home ice for the team with the better regular season. Games run through the normal season loop
 * (with playoff overtime), so injuries, form and fatigue carry over.
 */

import { EXPANSION_TEAM_ID } from '../franchise';
import type { League } from '../model';
import type { DayResult, SeasonState } from './season';
import { simDay } from './season';
import { standings, wildcardStandings } from './standings';
import type { ScheduledGame } from './schedule';

export const ROUND_NAMES = ['Erste Runde', 'Zweite Runde', 'Conference Finals', 'Finale'];

export interface Series {
  id: string;
  round: number;
  conference: string | null;
  /** Bracket order: `a` is the upper slot. */
  a: string;
  b: string;
  homeIce: string;
  winsA: number;
  winsB: number;
  games: string[];
  winner: string | null;
}

export interface PlayoffState {
  season: SeasonState;
  rounds: Series[][];
  round: number;
  /** Seed label per team, e.g. "Atlantic 1" or "WC2". */
  seeds: Record<string, string>;
  /** Regular season rank (0 = best) for home ice. */
  rank: Record<string, number>;
  champion: string | null;
}

function makeSeries(id: string, round: number, conference: string | null, a: string, b: string, rank: Record<string, number>): Series {
  const homeIce = (rank[a] ?? 99) <= (rank[b] ?? 99) ? a : b;
  return { id, round, conference, a, b, homeIce, winsA: 0, winsB: 0, games: [], winner: null };
}

export function playoffSeeding(league: League, regular: SeasonState) {
  const table = standings(league, regular);
  const rank: Record<string, number> = {};
  table.forEach((r, i) => (rank[r.teamId] = i));
  const seeds: Record<string, string> = {};
  const round1: Series[] = [];
  for (const conf of wildcardStandings(league, regular)) {
    const divs = [...conf.divisions].sort((x, y) => (rank[x.top[0]?.teamId ?? ''] ?? 99) - (rank[y.top[0]?.teamId ?? ''] ?? 99));
    const [d1, d2] = divs;
    const [wc1, wc2] = conf.wildcards;
    if (!d1 || !d2 || !wc1 || !wc2) continue;
    for (const d of divs) d.top.forEach((r, i) => (seeds[r.teamId] = `${d.name} ${i + 1}`));
    seeds[wc1.teamId] = 'WC1';
    seeds[wc2.teamId] = 'WC2';
    const t = (r: { teamId: string } | undefined) => r?.teamId ?? '';
    round1.push(
      makeSeries(`r1-${conf.conference}-1`, 0, conf.conference, t(d1.top[0]), wc2.teamId, rank),
      makeSeries(`r1-${conf.conference}-2`, 0, conf.conference, t(d1.top[1]), t(d1.top[2]), rank),
      makeSeries(`r1-${conf.conference}-3`, 0, conf.conference, t(d2.top[0]), wc1.teamId, rank),
      makeSeries(`r1-${conf.conference}-4`, 0, conf.conference, t(d2.top[1]), t(d2.top[2]), rank),
    );
  }
  return { round1, seeds, rank };
}

export function startPlayoffs(league: League, regular: SeasonState): PlayoffState {
  const { round1, seeds, rank } = playoffSeeding(league, regular);
  const teamStats: SeasonState['teamStats'] = {};
  for (const t of league.teams) teamStats[t.id] = { shotsFor: 0, shotsAgainst: 0, ppOpp: 0, ppGoals: 0, pkOpp: 0, pkGa: 0 };
  const start = regular.days + 3;
  const inIt = round1.some((s) => s.a === EXPANSION_TEAM_ID || s.b === EXPANSION_TEAM_ID);
  const season: SeasonState = {
    ...regular,
    games: [],
    days: start,
    day: start,
    results: {},
    boxes: {},
    skaterStats: {},
    goalieStats: {},
    teamStats,
    log: [],
    done: false,
    phase: 'playoffs',
    news: [
      {
        day: start,
        headline: inIt ? 'Playoffs! Das Expansionsteam ist dabei' : 'Die Playoffs beginnen – ohne das Expansionsteam',
        body: inIt ? 'Die Stadt steht Kopf: Im ersten Jahr direkt in die Postseason.' : 'Für dein Team ist die Saison vorbei. Die Playoffs laufen trotzdem weiter.',
        tone: inIt ? 'good' : 'bad',
        teamId: EXPANSION_TEAM_ID,
      },
    ],
  };
  return { season, rounds: [round1], round: 0, seeds, rank, champion: null };
}

const HOME_PATTERN = [true, true, false, false, true, false, true];

export function seriesOf(po: PlayoffState, teamId: string): Series | null {
  for (let r = po.rounds.length - 1; r >= 0; r--) {
    const s = po.rounds[r]!.find((x) => x.a === teamId || x.b === teamId);
    if (s) return s;
  }
  return null;
}

export function isEliminated(po: PlayoffState, teamId: string): boolean {
  const s = seriesOf(po, teamId);
  return !s || (s.winner !== null && s.winner !== teamId);
}

/** Play one game in every open series of the current round. */
export function simPlayoffDay(league: League, po: PlayoffState): DayResult & { po: PlayoffState } {
  if (po.champion) return { league, state: po.season, userBoxes: [], po };
  const day = po.season.day;
  const round = po.rounds[po.round] as Series[];
  const games: ScheduledGame[] = [];
  for (const s of round) {
    if (s.winner) continue;
    const n = s.winsA + s.winsB;
    const other = s.homeIce === s.a ? s.b : s.a;
    const home = HOME_PATTERN[n] ? s.homeIce : other;
    games.push({ id: `${s.id}-g${n + 1}`, day, home, away: home === s.a ? s.b : s.a });
  }
  const r = simDay(league, { ...po.season, games: [...po.season.games, ...games] });
  const updated = round.map((s) => {
    const g = games.find((x) => x.id.startsWith(`${s.id}-`));
    const res = g ? r.state.results[g.id] : undefined;
    if (!g || !res) return s;
    const winner = res.homeGoals > res.awayGoals ? res.home : res.away;
    const winsA = s.winsA + (winner === s.a ? 1 : 0);
    const winsB = s.winsB + (winner === s.b ? 1 : 0);
    return { ...s, winsA, winsB, games: [...s.games, g.id], winner: winsA === 4 ? s.a : winsB === 4 ? s.b : null };
  });
  const rounds = po.rounds.map((x, i) => (i === po.round ? updated : x));
  const season = { ...r.state };
  const name = (id: string) => league.teams.find((t) => t.id === id);
  // Series results in the news.
  for (const s of updated) {
    const before = round.find((x) => x.id === s.id);
    if (!s.winner || before?.winner) continue;
    const loser = s.winner === s.a ? s.b : s.a;
    const mine = s.winner === EXPANSION_TEAM_ID || loser === EXPANSION_TEAM_ID;
    season.news = [
      ...season.news,
      {
        day,
        headline: `${name(s.winner)?.city} ${s.winner === EXPANSION_TEAM_ID ? 'zieht weiter' : 'gewinnt'}: ${Math.max(s.winsA, s.winsB)}:${Math.min(s.winsA, s.winsB)} gegen ${name(loser)?.city}`,
        body: `${ROUND_NAMES[s.round]} entschieden.`,
        tone: mine ? (s.winner === EXPANSION_TEAM_ID ? 'good' : 'bad') : 'neutral',
        teamId: mine ? EXPANSION_TEAM_ID : null,
      },
    ];
    if (s.winner === EXPANSION_TEAM_ID) season.meta = { ...season.meta, ownerSatisfaction: Math.min(100, season.meta.ownerSatisfaction + 8), fanMood: Math.min(100, season.meta.fanMood + 6) };
  }
  let next: PlayoffState = { ...po, season, rounds };
  if (updated.every((s) => s.winner)) {
    if (po.round === 3) {
      const champ = updated[0]!.winner as string;
      next = { ...next, champion: champ };
      next.season = {
        ...next.season,
        done: true,
        news: [
          ...next.season.news,
          {
            day,
            headline: champ === EXPANSION_TEAM_ID ? 'SENSATION! Das Expansionsteam gewinnt den Titel im ersten Jahr!' : `${name(champ)?.city} ${name(champ)?.name} sind Meister`,
            body: champ === EXPANSION_TEAM_ID ? 'Ein Märchen, wie es die Liga noch nie gesehen hat.' : 'Die Saison ist zu Ende.',
            tone: champ === EXPANSION_TEAM_ID ? 'good' : 'neutral',
            teamId: champ === EXPANSION_TEAM_ID ? EXPANSION_TEAM_ID : null,
          },
        ],
      };
    } else {
      const winners = updated.map((s) => s.winner as string);
      const nextRound: Series[] = [];
      if (po.round < 2) {
        // Pair neighbouring bracket slots within each conference.
        for (let i = 0; i < winners.length; i += 2)
          nextRound.push(makeSeries(`r${po.round + 2}-${updated[i]!.conference}-${i / 2 + 1}`, po.round + 1, updated[i]!.conference, winners[i]!, winners[i + 1]!, po.rank));
      } else nextRound.push(makeSeries('r4-final', 3, null, winners[0]!, winners[1]!, po.rank));
      next = { ...next, rounds: [...rounds, nextRound], round: po.round + 1 };
      next.season = { ...next.season, day: next.season.day + 1 }; // a rest day between rounds
    }
  }
  return { league: r.league, state: next.season, userBoxes: r.userBoxes, po: next };
}

/** Simulate until `stop` or the champion is decided. */
export function simPlayoffsUntil(league: League, po: PlayoffState, stop: (po: PlayoffState) => boolean) {
  let lg = league;
  let p = po;
  const boxes: DayResult['userBoxes'] = [];
  while (!p.champion && !stop(p)) {
    const r = simPlayoffDay(lg, p);
    lg = r.league;
    p = r.po;
    boxes.push(...r.userBoxes);
  }
  return { league: lg, po: p, userBoxes: boxes };
}
