/**
 * Season loop: day-by-day simulation with lineups, goalie rotation, fatigue (back-to-backs, travel),
 * injuries with call-ups from the farm team, form, team chemistry (incl. optional "misfits" bonus for
 * the expansion team), waivers and the trade deadline.
 */

import { EXPANSION_TEAM_ID, distanceKm } from '../franchise';
import type { League, Player, Team } from '../model';
import { activePlayers, fullName, groupOf, pickActiveRoster, playersOfTeam, teamPayroll } from '../model';
import { rngFor } from '../rng';
import type { Lineup } from '../offseason/lineup';
import { MAX_ACTIVE, autoLineup, validateLineup } from '../offseason/lineup';
import { playerTradeValue } from '../offseason/trade';
import type { BoxScore, TeamGameInput } from './game';
import { simulateGame } from './game';
import type { ScheduledGame } from './schedule';
import { dayLabel, generateSchedule } from './schedule';
import { standings, wildcardStandings } from './standings';
import type { Role } from '../expansion/negotiation';
import type { FranchiseMeta } from '../world/meta';
import { afterUserGame, initMeta, weeklyMorale, weeklyOwnerUpdate } from '../world/meta';
import type { NewsItem } from '../world/news';
import { newsForDay } from '../world/news';

export type GoalieMode = 'auto' | 'starter' | 'rotate';

export interface GameSummary {
  id: string;
  day: number;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  decision: 'REG' | 'OT' | 'SO';
}

export interface SkaterStats {
  gp: number;
  g: number;
  a: number;
  pm: number;
  pim: number;
  sog: number;
}

export interface GoalieStats {
  gp: number;
  w: number;
  l: number;
  otl: number;
  sa: number;
  ga: number;
  so: number;
}

export interface TeamStats {
  shotsFor: number;
  shotsAgainst: number;
  ppOpp: number;
  ppGoals: number;
  pkOpp: number;
  pkGa: number;
}

export interface SeasonEvent {
  day: number;
  teamId: string | null;
  kind: 'injury' | 'return' | 'callup' | 'waiver' | 'trade' | 'info';
  text: string;
}

export interface SeasonOptions {
  misfitsBonus: boolean;
  goalieMode: GoalieMode;
}

export interface SeasonState {
  seasonSeed: string;
  games: ScheduledGame[];
  days: number;
  deadlineDay: number;
  /** Next day to be simulated. */
  day: number;
  results: Record<string, GameSummary>;
  /** Full box scores (only the expansion team's games, to keep saves small). */
  boxes: Record<string, BoxScore>;
  skaterStats: Record<string, SkaterStats>;
  goalieStats: Record<string, GoalieStats>;
  teamStats: Record<string, TeamStats>;
  lineups: Record<string, Lineup>;
  chemistry: Record<string, number>;
  lastGame: Record<string, { day: number; lat: number; lon: number; goalieId: string }>;
  /** Players the user called up because of injuries (sent back automatically). */
  emergency: string[];
  /** The user's own lineup while an automatic one covers injuries (restored when everyone is back). */
  savedLineup?: Lineup | null;
  options: SeasonOptions;
  log: SeasonEvent[];
  done: boolean;
  phase: 'regular' | 'playoffs';
  news: NewsItem[];
  meta: FranchiseMeta;
}

const CHEM_START = 65;
const CHEM_START_EXPANSION = 35;
const MISFIT_GAMES = 20;
const MISFIT_BONUS = 2;

export function startSeason(
  league: League,
  userLineup: Lineup,
  options: Partial<SeasonOptions> = {},
  seasonSeed = `${league.seed}|season${league.config.seasonStartYear}`,
  promises: Record<string, Role> = {},
): { league: League; state: SeasonState } {
  // AI teams: balanced NHL rosters from everyone under contract.
  const players = { ...league.players };
  for (const t of league.teams) {
    if (t.isExpansion) continue;
    const signed = playersOfTeam(league, t.id).filter((p) => p.contract && p.contract.yearsLeft >= 1);
    const active = pickActiveRoster(signed, MAX_ACTIVE);
    for (const p of playersOfTeam(league, t.id)) players[p.id] = { ...p, farm: !active.has(p.id) };
  }
  const lg = { ...league, players };
  const sched = generateSchedule(lg, seasonSeed);
  const lineups: Record<string, Lineup> = {};
  const chemistry: Record<string, number> = {};
  for (const t of lg.teams) {
    lineups[t.id] = t.isExpansion ? userLineup : autoLineup(lg, t.id);
    chemistry[t.id] = t.isExpansion ? CHEM_START_EXPANSION : CHEM_START;
  }
  const teamStats: Record<string, TeamStats> = {};
  for (const t of lg.teams) teamStats[t.id] = { shotsFor: 0, shotsAgainst: 0, ppOpp: 0, ppGoals: 0, pkOpp: 0, pkGa: 0 };
  return {
    league: lg,
    state: {
      seasonSeed,
      games: sched.games,
      days: sched.days,
      deadlineDay: sched.deadlineDay,
      day: 0,
      results: {},
      boxes: {},
      skaterStats: {},
      goalieStats: {},
      teamStats,
      lineups,
      chemistry,
      lastGame: {},
      emergency: [],
      options: { misfitsBonus: true, goalieMode: 'auto', ...options },
      log: [{ day: 0, teamId: null, kind: 'info', text: `Saisonstart am ${dayLabel(0)} – ${sched.games.length} Spiele, Trade Deadline am ${dayLabel(sched.deadlineDay)}.` }],
      done: false,
      phase: 'regular',
      news: [
        {
          day: 0,
          headline: `Der große Tag: Die ${lg.teams.find((t) => t.isExpansion)?.city ?? ''} ${lg.teams.find((t) => t.isExpansion)?.name ?? ''} starten in ihre erste Saison`,
          body: `Die Liga zählt jetzt 33 Teams. Trade Deadline ist am ${dayLabel(sched.deadlineDay)}.`,
          tone: 'neutral',
          teamId: EXPANSION_TEAM_ID,
        },
      ],
      meta: initMeta(lg, promises),
    },
  };
}

export const tradeDeadlinePassed = (s: SeasonState): boolean => s.day > s.deadlineDay;

const healthy = (p: Player) => !p.injury || p.injury.gamesRemaining <= 0;

/** Does injury or a roster move keep this lineup from being dressed? */
export const lineupBroken = (league: League, teamId: string, l: Lineup): boolean =>
  validateLineup(league, teamId, l).some((i) => i.level === 'error' || /verletzt/.test(i.message));

/**
 * The user's lineup for today. If injuries or roster moves break it, the team plays with the optimized
 * auto lineup (best healthy players, best goalie in net); the user's own lineup is kept aside and comes
 * back as soon as everyone in it is healthy and on the roster again.
 */
export function gameDayLineup(
  league: League,
  teamId: string,
  current: Lineup,
  saved: Lineup | null,
): { lineup: Lineup; saved: Lineup | null; change: 'auto' | 'restored' | null } {
  if (saved && !lineupBroken(league, teamId, saved)) return { lineup: saved, saved: null, change: 'restored' };
  if (!lineupBroken(league, teamId, current)) return { lineup: current, saved, change: null };
  const own = saved ?? current;
  const auto = autoLineup(league, teamId);
  // The leadership group stays as chosen as long as all of them can play.
  const ok = (id: string | null) => !!id && league.players[id]?.teamId === teamId && !league.players[id]?.farm && healthy(league.players[id] as Player);
  if (ok(own.captain) && own.assistants.every(ok)) {
    auto.captain = own.captain;
    auto.assistants = own.assistants;
  }
  // A thin roster can leave even the auto lineup incomplete: only report actual changes.
  if (JSON.stringify(auto) === JSON.stringify(current)) return { lineup: current, saved: own, change: null };
  return { lineup: auto, saved: own, change: 'auto' };
}

/** Call up farm players if the team cannot dress 12 F, 6 D and 2 G. */
function emergencyCallups(league: League, teamId: string, day: number, log: SeasonEvent[], emergency: string[]): League {
  let lg = league;
  const need = { F: 12, D: 6, G: 2 };
  for (const g of ['F', 'D', 'G'] as const) {
    const have = activePlayers(lg, teamId).filter((p) => healthy(p) && groupOf(p.position) === g).length;
    for (let k = have; k < need[g]; k++) {
      const cand = playersOfTeam(lg, teamId)
        .filter((p) => p.farm && healthy(p) && p.contract && p.contract.yearsLeft >= 1 && groupOf(p.position) === g)
        .sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id))[0];
      if (!cand) break;
      lg = { ...lg, players: { ...lg.players, [cand.id]: { ...cand, farm: false } } };
      if (teamId === EXPANSION_TEAM_ID) {
        emergency.push(cand.id);
        log.push({ day, teamId, kind: 'callup', text: `Notfall-Call-up: ${fullName(cand)} (${cand.position}) kommt aus dem Farmteam.` });
      }
    }
  }
  return lg;
}

/** Healthy roster over 23? Send emergency call-ups (user) or the weakest extras (AI) back down. */
function trimRoster(league: League, teamId: string, emergency: string[]): League {
  let lg = league;
  for (let guard = 0; guard < 6; guard++) {
    const act = activePlayers(lg, teamId).filter(healthy);
    if (act.length <= MAX_ACTIVE) break;
    const candidates = teamId === EXPANSION_TEAM_ID ? act.filter((p) => emergency.includes(p.id)) : act;
    const down = [...candidates].sort((a, b) => a.ovr - b.ovr || a.id.localeCompare(b.id)).find((p) => {
      const g = groupOf(p.position);
      return act.filter((x) => groupOf(x.position) === g).length > (g === 'G' ? 2 : g === 'D' ? 6 : 12);
    });
    if (!down) break;
    lg = { ...lg, players: { ...lg.players, [down.id]: { ...down, farm: true } } };
    const i = emergency.indexOf(down.id);
    if (i >= 0) emergency.splice(i, 1);
  }
  return lg;
}

function chooseGoalie(league: League, s: SeasonState, teamId: string, lineup: Lineup, day: number): string {
  const [starter, backup] = lineup.goalies;
  const last = s.lastGame[teamId];
  const b2b = last?.day === day - 1;
  const mode: GoalieMode = teamId === EXPANSION_TEAM_ID ? s.options.goalieMode : 'auto';
  const usable = (id: string | null) => !!id && healthy(league.players[id] as Player);
  let pick = starter;
  if (mode === 'auto' && b2b && last?.goalieId === starter) pick = backup;
  if (mode === 'rotate') pick = last?.goalieId === starter ? backup : starter;
  if (!usable(pick)) pick = usable(starter) ? starter : backup;
  if (!pick) pick = activePlayers(league, teamId).find((p) => p.position === 'G')?.id ?? null;
  return pick as string;
}

function teamInput(league: League, s: SeasonState, team: Team, lineup: Lineup, day: number, game: ScheduledGame): TeamGameInput {
  const last = s.lastGame[team.id];
  const venue = league.teams.find((t) => t.id === game.home) as Team;
  let fatigue = 0;
  if (last?.day === day - 1) fatigue += 0.03;
  if (last && distanceKm(last, venue) > 2000) fatigue += 0.01;
  const chem = s.chemistry[team.id] ?? CHEM_START;
  let bonus = (chem - 60) * 0.04;
  if (team.isExpansion && s.options.misfitsBonus && s.phase === 'regular') {
    const gp = Object.values(s.results).filter((r) => r.home === team.id || r.away === team.id).length;
    if (gp < MISFIT_GAMES) bonus += MISFIT_BONUS;
  }
  return { teamId: team.id, lineup, goalieId: chooseGoalie(league, s, team.id, lineup, day), fatigue, bonus };
}

function addStats(s: SeasonState, box: BoxScore): void {
  // Copy-on-write: only touched entries get new objects, earlier states stay untouched.
  for (const [pid, l] of Object.entries(box.skaters)) {
    const st = s.skaterStats[pid];
    s.skaterStats[pid] = {
      gp: (st?.gp ?? 0) + 1,
      g: (st?.g ?? 0) + l.g,
      a: (st?.a ?? 0) + l.a,
      pm: (st?.pm ?? 0) + l.pm,
      pim: (st?.pim ?? 0) + l.pim,
      sog: (st?.sog ?? 0) + l.sog,
    };
  }
  for (const [pid, l] of Object.entries(box.goalieLines)) {
    const st = s.goalieStats[pid];
    s.goalieStats[pid] = {
      gp: (st?.gp ?? 0) + 1,
      w: (st?.w ?? 0) + (l.decision === 'W' ? 1 : 0),
      l: (st?.l ?? 0) + (l.decision === 'L' ? 1 : 0),
      otl: (st?.otl ?? 0) + (l.decision === 'OTL' ? 1 : 0),
      sa: (st?.sa ?? 0) + l.sa,
      ga: (st?.ga ?? 0) + l.ga,
      so: (st?.so ?? 0) + (l.ga === 0 && l.decision === 'W' ? 1 : 0),
    };
  }
  for (const [team, opp] of [
    [box.home, box.away],
    [box.away, box.home],
  ] as const) {
    const t = { ...(s.teamStats[team] as TeamStats) };
    s.teamStats[team] = t;
    const tb = box.teams[team]!;
    const ob = box.teams[opp]!;
    t.shotsFor += tb.shots;
    t.shotsAgainst += ob.shots;
    t.ppOpp += tb.ppOpp;
    t.ppGoals += tb.ppGoals;
    t.pkOpp += ob.ppOpp;
    t.pkGa += ob.ppGoals;
  }
}

export interface DayResult {
  league: League;
  state: SeasonState;
  /** Box scores of the expansion team's games that day. */
  userBoxes: BoxScore[];
}

export function simDay(league: League, s0: SeasonState): DayResult {
  if (s0.done) return { league, state: s0, userBoxes: [] };
  const day = s0.day;
  const s: SeasonState = {
    ...s0,
    results: { ...s0.results },
    boxes: { ...s0.boxes },
    skaterStats: { ...s0.skaterStats },
    goalieStats: { ...s0.goalieStats },
    teamStats: { ...s0.teamStats },
    lineups: { ...s0.lineups },
    chemistry: { ...s0.chemistry },
    lastGame: { ...s0.lastGame },
    emergency: [...s0.emergency],
    log: [...s0.log],
  };

  let lg = league;
  const todays = s.games.filter((g) => g.day === day);
  const userBoxes: BoxScore[] = [];
  const playing = new Set(todays.flatMap((g) => [g.home, g.away]));
  for (const teamId of playing) {
    lg = emergencyCallups(lg, teamId, day, s.log, s.emergency);
    if (teamId !== EXPANSION_TEAM_ID) {
      // AI coaches dress their best healthy players every night (also right after a star returns).
      s.lineups[teamId] = autoLineup(lg, teamId);
      continue;
    }
    const r = gameDayLineup(lg, teamId, s.lineups[teamId] as Lineup, s.savedLineup ?? null);
    s.lineups[teamId] = r.lineup;
    s.savedLineup = r.saved;
    if (r.change === 'auto') s.log.push({ day, teamId, kind: 'info', text: 'Optimierte Aufstellung wegen Verletzung/Kaderänderung – deine Aufstellung kommt zurück, sobald alle fit sind.' });
    if (r.change === 'restored') s.log.push({ day, teamId, kind: 'info', text: 'Alle wieder fit: Deine eigene Aufstellung gilt wieder.' });
  }

  const players = { ...lg.players };
  const injuredToday: string[] = [];
  const dayBoxes: BoxScore[] = [];
  for (const g of todays) {
    const home = lg.teams.find((t) => t.id === g.home) as Team;
    const away = lg.teams.find((t) => t.id === g.away) as Team;
    const hi = teamInput(lg, s, home, s.lineups[home.id] as Lineup, day, g);
    const ai = teamInput(lg, s, away, s.lineups[away.id] as Lineup, day, g);
    const box = simulateGame(lg, g.id, hi, ai, s.seasonSeed, { playoff: s.phase === 'playoffs' });
    dayBoxes.push(box);
    s.results[g.id] = {
      id: g.id,
      day,
      home: g.home,
      away: g.away,
      homeGoals: box.teams[g.home]!.goals,
      awayGoals: box.teams[g.away]!.goals,
      decision: box.decision,
    };
    addStats(s, box);
    if (g.home === EXPANSION_TEAM_ID || g.away === EXPANSION_TEAM_ID) {
      s.boxes[g.id] = box;
      userBoxes.push(box);
    }
    s.lastGame[g.home] = { day, lat: home.lat, lon: home.lon, goalieId: hi.goalieId };
    s.lastGame[g.away] = { day, lat: home.lat, lon: home.lon, goalieId: ai.goalieId };
    for (const t of [g.home, g.away]) s.chemistry[t] = Math.min(100, (s.chemistry[t] ?? CHEM_START) + 0.35);

    // Form: recent performance drifts towards the player's current output.
    for (const [pid, l] of Object.entries(box.skaters)) {
      const p = players[pid];
      if (!p) continue;
      const perf = Math.max(-10, Math.min(10, (l.g * 2 + l.a) * 3 + l.pm * 1.5 - 1.5));
      players[pid] = { ...p, form: Math.round((p.form * 0.85 + perf * 0.15) * 10) / 10 };
    }
    for (const [pid, l] of Object.entries(box.goalieLines)) {
      const p = players[pid];
      if (!p || !l.sa) continue;
      const perf = Math.max(-10, Math.min(10, ((l.sa - l.ga) / l.sa - 0.905) * 150));
      players[pid] = { ...p, form: Math.round((p.form * 0.8 + perf * 0.2) * 10) / 10 };
    }
    // Existing injuries heal by one game for both teams.
    for (const t of [g.home, g.away]) {
      for (const p of playersOfTeam(lg, t)) {
        const cur = players[p.id] as Player;
        if (!cur.injury) continue;
        const left = cur.injury.gamesRemaining - 1;
        if (left <= 0) {
          players[p.id] = { ...cur, injury: null };
          if (t === EXPANSION_TEAM_ID) s.log.push({ day, teamId: t, kind: 'return', text: `${fullName(cur)} ist wieder fit.` });
        } else players[p.id] = { ...cur, injury: { ...cur.injury, gamesRemaining: left } };
      }
    }
    for (const inj of box.injuries) {
      const p = players[inj.playerId] as Player;
      players[inj.playerId] = { ...p, injury: { description: inj.description, gamesRemaining: inj.games } };
      injuredToday.push(inj.playerId);
      if (inj.teamId === EXPANSION_TEAM_ID)
        s.log.push({ day, teamId: inj.teamId, kind: 'injury', text: `${fullName(p)} fällt verletzt aus (${inj.description}, ca. ${inj.games} Spiele).` });
    }
  }
  lg = { ...lg, players };
  for (const t of playing) lg = trimRoster(lg, t, s.emergency);

  // Fans, attendance and the newsfeed.
  const playoff = s.phase === 'playoffs';
  const isMine = (r: GameSummary) => r.home === EXPANSION_TEAM_ID || r.away === EXPANSION_TEAM_ID;
  const wonBy = (r: GameSummary, t: string) => (r.home === t ? r.homeGoals > r.awayGoals : r.awayGoals > r.homeGoals);
  for (const box of userBoxes) {
    const r = s.results[box.gameId] as GameSummary;
    const home = r.home === EXPANSION_TEAM_ID;
    const gf = home ? r.homeGoals : r.awayGoals;
    const ga = home ? r.awayGoals : r.homeGoals;
    s.meta = afterUserGame(lg, s.meta, r.id, home, gf > ga, r.decision, Math.abs(gf - ga), playoff);
  }
  const prior = Object.values(s0.results).filter(isMine);
  const myResults = Object.values(s.results)
    .filter(isMine)
    .sort((a, b) => a.day - b.day);
  s.news = [
    ...s.news,
    ...newsForDay(lg, dayBoxes, {
      seed: s.seasonSeed,
      day,
      playoff,
      priorGames: prior.length,
      priorWins: prior.filter((r) => wonBy(r, EXPANSION_TEAM_ID)).length,
      priorHomeWins: prior.filter((r) => r.home === EXPANSION_TEAM_ID && wonBy(r, EXPANSION_TEAM_ID)).length,
      myResults,
    }),
  ];

  s.day = day + 1;
  const regularOver = !playoff && s.games.every((g) => s.results[g.id]);
  // Weekly: owner verdict and promised roles.
  if (!playoff && (day % 7 === 6 || regularOver)) {
    const row = standings(lg, s).find((x) => x.teamId === EXPANSION_TEAM_ID);
    const inSpot = wildcardStandings(lg, s).some((c) => [...c.divisions.flatMap((d) => d.top), ...c.wildcards].some((x) => x.teamId === EXPANSION_TEAM_ID));
    s.meta = weeklyOwnerUpdate(lg, s.meta, day, row?.pts ?? 0, row?.gp ?? 0, inSpot);
    const morale = weeklyMorale(lg, s.meta, s.lineups[EXPANSION_TEAM_ID] as Lineup, day);
    lg = { ...lg, players: morale.players };
    s.meta = morale.meta;
    for (const m of morale.messages) s.news.push({ day, headline: 'Unruhe in der Kabine', body: m, tone: 'bad', teamId: EXPANSION_TEAM_ID });
  }
  if (!playoff && day === s.deadlineDay)
    s.news.push({ day, headline: 'Heute ist Trade Deadline', body: 'Nach dem heutigen Tag sind bis Saisonende keine Trades mehr möglich.', tone: 'neutral', teamId: null });
  if (regularOver) {
    s.done = true;
    s.log.push({ day, teamId: null, kind: 'info', text: 'Die reguläre Saison ist beendet.' });
    const top = standings(lg, s)[0];
    const leader = top ? lg.teams.find((t) => t.id === top.teamId) : null;
    s.news.push({ day, headline: 'Die reguläre Saison ist vorbei', body: leader ? `${leader.city} ${leader.name} gewinnen mit ${top?.pts} Punkten die Liga-Wertung.` : '', tone: 'neutral', teamId: null });
  }
  return { league: lg, state: s, userBoxes };
}

/** Simulate until `stop` returns true (checked before each day) or the season ends. */
export function simUntil(league: League, s: SeasonState, stop: (s: SeasonState) => boolean): DayResult {
  let r: DayResult = { league, state: s, userBoxes: [] };
  const boxes: BoxScore[] = [];
  while (!r.state.done && !stop(r.state)) {
    r = simDay(r.league, r.state);
    boxes.push(...r.userBoxes);
  }
  return { ...r, userBoxes: boxes };
}

export const simWeek = (league: League, s: SeasonState) => {
  const end = s.day + 7;
  return simUntil(league, s, (x) => x.day >= end);
};

/** Needs this player to pass through waivers when sent down? */
export function needsWaivers(p: Player): boolean {
  return !!p.contract && !p.contract.twoWay && !p.contract.elc && p.proYears >= 3;
}

/**
 * Send a player down during the season. Waiver-eligible players can be claimed by AI teams that value
 * them (worst teams claim first).
 */
export function demoteWithWaivers(league: League, s: SeasonState, playerId: string): { league: League; state: SeasonState; claimedBy: string | null } {
  const p = league.players[playerId];
  if (!p || p.teamId !== EXPANSION_TEAM_ID || p.farm) return { league, state: s, claimedBy: null };
  if (needsWaivers(p)) {
    const order = standingsOrder(league, s).reverse();
    for (const teamId of order) {
      if (teamId === EXPANSION_TEAM_ID) continue;
      const team = league.teams.find((t) => t.id === teamId) as Team;
      const room = league.config.salaryCap - teamPayroll(league, teamId);
      const want = playerTradeValue(p, team, league) * rngFor(s.seasonSeed, 'waiver', playerId, teamId, s.day).range(0.8, 1.2);
      if (want >= 1.1 && room >= (p.contract?.capHit ?? 0) && activePlayers(league, teamId).length < MAX_ACTIVE) {
        const lg = { ...league, players: { ...league.players, [playerId]: { ...p, teamId, farm: false } } };
        const log = [...s.log, { day: s.day, teamId: EXPANSION_TEAM_ID, kind: 'waiver' as const, text: `${fullName(p)} wurde von ${team.abbrev} über Waivers geclaimt.` }];
        return { league: lg, state: { ...s, log }, claimedBy: teamId };
      }
    }
  }
  const lg = { ...league, players: { ...league.players, [playerId]: { ...p, farm: true } } };
  const text = needsWaivers(p) ? `${fullName(p)} hat die Waivers passiert und spielt im Farmteam.` : `${fullName(p)} wurde ins Farmteam geschickt.`;
  return { league: lg, state: { ...s, log: [...s.log, { day: s.day, teamId: EXPANSION_TEAM_ID, kind: 'waiver', text }] }, claimedBy: null };
}

/** Team ids ordered by current points (best first). */
export function standingsOrder(league: League, s: SeasonState): string[] {
  const pts = new Map(league.teams.map((t) => [t.id, 0]));
  for (const r of Object.values(s.results)) {
    const homeWin = r.homeGoals > r.awayGoals;
    pts.set(homeWin ? r.home : r.away, (pts.get(homeWin ? r.home : r.away) ?? 0) + 2);
    if (r.decision !== 'REG') pts.set(homeWin ? r.away : r.home, (pts.get(homeWin ? r.away : r.home) ?? 0) + 1);
  }
  return [...pts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
}
