/**
 * Single game simulation. Team strength comes from line ratings weighted by ice time. Shots are
 * Poisson distributed (5v5 and power play), each shot is a goal with an xG-like probability that
 * depends on the shooter and the goalie's form on the day. Ties go to 3-on-3 overtime, then a
 * shootout. The result is a full box score plus a short event ticker.
 */

import type { League, Player } from '../model';
import { groupOf } from '../model';
import type { Rng } from '../rng';
import { rngFor } from '../rng';
import type { Lineup, Slot } from '../offseason/lineup';
import { slotRating } from '../offseason/lineup';

export interface TeamGameInput {
  teamId: string;
  lineup: Lineup;
  goalieId: string;
  /** 0 = rested, positive = tired (back-to-back, travel). Fraction of strength lost. */
  fatigue: number;
  /** Additive rating bonus from chemistry, form of the team etc. */
  bonus: number;
}

export type Strength = 'EV' | 'PP' | 'SH' | 'OT';

export interface GameEvent {
  period: number;
  /** Seconds into the period. */
  time: number;
  type: 'goal' | 'penalty' | 'injury';
  teamId: string;
  playerId: string;
  assists: string[];
  strength: Strength;
}

export interface SkaterLine {
  g: number;
  a: number;
  pm: number;
  pim: number;
  sog: number;
}

export interface GoalieLine {
  sa: number;
  ga: number;
  decision: 'W' | 'L' | 'OTL' | null;
}

export interface TeamBox {
  goals: number;
  shots: number;
  ppOpp: number;
  ppGoals: number;
}

export interface BoxScore {
  gameId: string;
  home: string;
  away: string;
  decision: 'REG' | 'OT' | 'SO';
  teams: Record<string, TeamBox>;
  goalies: Record<string, string>;
  events: GameEvent[];
  skaters: Record<string, SkaterLine>;
  goalieLines: Record<string, GoalieLine>;
  injuries: { playerId: string; teamId: string; games: number; description: string }[];
  shootout: { teamId: string; playerId: string; scored: boolean }[];
  winner: string;
}

const F_WEIGHTS = [0.35, 0.3, 0.22, 0.13];
const D_WEIGHTS = [0.42, 0.35, 0.23];
const PERIOD = 1200;
const OT_LENGTH = 300;
const ES_SHOTS = 25.5;
const PP_SHOTS = 1.65;
const PENALTIES = 3.1;
const ES_BASE = 0.079;
const PP_BASE = 0.118;
const SH_BASE = 0.07;
const INJURY_RATE = 0.15;
const INJURIES = ['Oberkörperverletzung', 'Unterkörperverletzung', 'Knöchel', 'Schulter', 'Gehirnerschütterung', 'Leiste', 'Knie', 'Handgelenk'];

const attr = (p: Player, k: keyof NonNullable<Player['skater']>) => p.skater?.[k] ?? p.ovr;
export const offenseRating = (p: Player) =>
  attr(p, 'shooting') * 0.35 + attr(p, 'passing') * 0.2 + attr(p, 'puckHandling') * 0.2 + attr(p, 'skating') * 0.1 + attr(p, 'hockeyIQ') * 0.15;
export const defenseRating = (p: Player) => attr(p, 'defense') * 0.45 + attr(p, 'hockeyIQ') * 0.2 + attr(p, 'skating') * 0.15 + attr(p, 'physical') * 0.2;

interface Unit {
  players: Player[];
  weight: number;
}

interface PreparedTeam {
  input: TeamGameInput;
  fLines: Unit[];
  dPairs: Unit[];
  pp: Unit[];
  pk: Unit[];
  goalie: Player;
  goalieRating: number;
  off: number;
  def: number;
  ppOff: number;
  pkDef: number;
  dressed: Player[];
}

function resolve(league: League, ids: Slot[]): Player[] {
  return ids.map((id) => (id ? league.players[id] : undefined)).filter((p): p is Player => !!p);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 60);

function prepare(league: League, t: TeamGameInput, rng: Rng): PreparedTeam {
  const form = (p: Player) => p.form * 0.3 + t.bonus;
  const fLines = t.lineup.forwards.map((l, i) => ({ players: resolve(league, l), weight: F_WEIGHTS[i] ?? 0.1 }));
  const dPairs = t.lineup.defense.map((l, i) => ({ players: resolve(league, l), weight: D_WEIGHTS[i] ?? 0.1 }));
  const slotPenalty = (p: Player, slot: 'C' | 'LW' | 'RW' | 'D') => slotRating(p, slot) - p.ovr;
  const offOf = (u: Unit, slots: ('C' | 'LW' | 'RW' | 'D')[]) => avg(u.players.map((p, i) => offenseRating(p) + form(p) + slotPenalty(p, slots[i] ?? 'C')));
  const defOf = (u: Unit, slots: ('C' | 'LW' | 'RW' | 'D')[]) => avg(u.players.map((p, i) => defenseRating(p) + form(p) + slotPenalty(p, slots[i] ?? 'C')));
  const fSlots: ('C' | 'LW' | 'RW' | 'D')[] = ['LW', 'C', 'RW'];
  const dSlots: ('C' | 'LW' | 'RW' | 'D')[] = ['D', 'D'];
  const fOff = fLines.reduce((s, u) => s + u.weight * offOf(u, fSlots), 0);
  const dOff = dPairs.reduce((s, u) => s + u.weight * offOf(u, dSlots), 0);
  const fDef = fLines.reduce((s, u) => s + u.weight * defOf(u, fSlots), 0);
  const dDef = dPairs.reduce((s, u) => s + u.weight * defOf(u, dSlots), 0);
  const pp = t.lineup.pp.map((u, i) => ({ players: resolve(league, [...u.f, ...u.d]), weight: i === 0 ? 0.65 : 0.35 }));
  const pk = t.lineup.pk.map((u, i) => ({ players: resolve(league, [...u.f, ...u.d]), weight: i === 0 ? 0.6 : 0.4 }));
  const goalie = league.players[t.goalieId] as Player;
  const fat = 1 - t.fatigue;
  const dressed = [...new Set([...fLines, ...dPairs].flatMap((u) => u.players))];
  return {
    input: t,
    fLines,
    dPairs,
    pp,
    pk,
    goalie,
    // Goalie form on the day.
    goalieRating: goalie.ovr + goalie.form * 0.3 + rng.normal(0, 3) - t.fatigue * 40,
    off: (fOff * 0.7 + dOff * 0.3) * fat,
    def: (fDef * 0.4 + dDef * 0.6) * fat,
    ppOff: pp.reduce((s, u) => s + u.weight * avg(u.players.map((p) => offenseRating(p) + form(p))), 0) * fat,
    pkDef: pk.reduce((s, u) => s + u.weight * avg(u.players.map((p) => defenseRating(p) + form(p))), 0) * fat,
    dressed,
  };
}

function pickUnit(rng: Rng, units: Unit[]): Unit {
  return rng.weighted(units.filter((u) => u.players.length), (u) => u.weight);
}

function goalProb(base: number, shooter: Player, goalie: number): number {
  return Math.min(0.5, base * Math.exp(0.02 * (attr(shooter, 'shooting') + shooter.form * 0.3 - 70)) * Math.exp(-0.018 * (goalie - 75)));
}

export function simulateGame(
  league: League,
  gameId: string,
  home: TeamGameInput,
  away: TeamGameInput,
  seed: string,
  opts: { playoff?: boolean } = {},
): BoxScore {
  const rng = rngFor(seed, 'game', gameId);
  const H = prepare(league, home, rng);
  const A = prepare(league, away, rng);
  const side = (id: string) => (id === home.teamId ? H : A);
  const other = (id: string) => (id === home.teamId ? A : H);
  const skaters: Record<string, SkaterLine> = {};
  const sl = (id: string) => (skaters[id] ??= { g: 0, a: 0, pm: 0, pim: 0, sog: 0 });
  for (const p of [...H.dressed, ...A.dressed]) sl(p.id);
  const teams: Record<string, TeamBox> = {
    [home.teamId]: { goals: 0, shots: 0, ppOpp: 0, ppGoals: 0 },
    [away.teamId]: { goals: 0, shots: 0, ppOpp: 0, ppGoals: 0 },
  };
  const events: GameEvent[] = [];
  const ga: Record<string, number> = { [home.teamId]: 0, [away.teamId]: 0 };

  type Shot = { t: number; team: string; strength: Strength; window?: number };
  const shots: Shot[] = [];

  // Penalties and power plays.
  const penalties: { t: number; team: string }[] = [];
  for (const T of [H, A]) {
    const n = rng.poisson(PENALTIES);
    for (let i = 0; i < n; i++) penalties.push({ t: rng.range(0, 3 * PERIOD - 30), team: T.input.teamId });
  }
  penalties.sort((a, b) => a.t - b.t);
  penalties.forEach((pen, idx) => {
    const T = side(pen.team);
    const unit = pickUnit(rng, [...T.fLines, ...T.dPairs]);
    const offender = rng.weighted(unit.players, (p) => 40 + attr(p, 'physical'));
    sl(offender.id).pim += 2;
    events.push({ period: Math.floor(pen.t / PERIOD) + 1, time: pen.t % PERIOD, type: 'penalty', teamId: pen.team, playerId: offender.id, assists: [], strength: 'EV' });
    const pp = other(pen.team);
    teams[pp.input.teamId]!.ppOpp++;
    const lam = PP_SHOTS * Math.exp(0.02 * (pp.ppOff - T.pkDef));
    const n = rng.poisson(lam);
    for (let i = 0; i < n; i++) shots.push({ t: Math.min(3 * PERIOD - 1, pen.t + rng.range(0, 120)), team: pp.input.teamId, strength: 'PP', window: idx });
    if (rng.chance(0.12)) shots.push({ t: Math.min(3 * PERIOD - 1, pen.t + rng.range(0, 120)), team: pen.team, strength: 'SH', window: idx });
  });

  // Even strength shots.
  for (const [T, O] of [
    [H, A],
    [A, H],
  ] as const) {
    const homeAdv = T === H ? 1.035 : 1;
    // Game-to-game variance (puck luck, effort) keeps the league competitive.
    const lam = ES_SHOTS * Math.exp(0.016 * (T.off - O.def) + rng.normal(0, 0.12)) * homeAdv;
    const n = rng.poisson(lam);
    for (let i = 0; i < n; i++) shots.push({ t: rng.range(0, 3 * PERIOD), team: T.input.teamId, strength: 'EV' });
  }
  shots.sort((a, b) => a.t - b.t);

  const closedWindows = new Set<number>();
  const resolveShot = (s: Shot, period: number, time: number, strength: Strength): boolean => {
    const T = side(s.team);
    const O = other(s.team);
    let unitPlayers: Player[];
    if (strength === 'PP') unitPlayers = pickUnit(rng, T.pp).players;
    else if (strength === 'SH') unitPlayers = pickUnit(rng, T.pk).players;
    else if (strength === 'OT') unitPlayers = [...(T.fLines[0]?.players.slice(0, 2) ?? []), ...(T.dPairs[0]?.players.slice(0, 1) ?? [])];
    else unitPlayers = [...pickUnit(rng, T.fLines).players, ...pickUnit(rng, T.dPairs).players];
    if (!unitPlayers.length) return false;
    const shooter = rng.weighted(unitPlayers, (p) => (groupOf(p.position) === 'D' ? 0.45 : 1) * attr(p, 'shooting'));
    sl(shooter.id).sog++;
    teams[s.team]!.shots++;
    const base = strength === 'PP' ? PP_BASE : strength === 'SH' ? SH_BASE : ES_BASE;
    if (!rng.chance(goalProb(base, shooter, O.goalieRating))) return false;
    const mates = unitPlayers.filter((p) => p.id !== shooter.id);
    const assists: string[] = [];
    if (mates.length && rng.chance(0.9)) {
      const a1 = rng.weighted(mates, (p) => attr(p, 'passing'));
      assists.push(a1.id);
      const rest = mates.filter((p) => p.id !== a1.id);
      if (rest.length && rng.chance(0.72)) assists.push(rng.weighted(rest, (p) => attr(p, 'passing')).id);
    }
    sl(shooter.id).g++;
    for (const a of assists) sl(a).a++;
    teams[s.team]!.goals++;
    ga[O.input.teamId]!++;
    if (strength === 'PP') teams[s.team]!.ppGoals++;
    if (strength === 'EV' || strength === 'OT') {
      for (const p of unitPlayers) sl(p.id).pm++;
      const opp = strength === 'OT' ? [] : [...pickUnit(rng, O.fLines).players, ...pickUnit(rng, O.dPairs).players];
      for (const p of opp) sl(p.id).pm--;
    }
    events.push({ period, time, type: 'goal', teamId: s.team, playerId: shooter.id, assists, strength });
    return true;
  };

  for (const s of shots) {
    if (s.window !== undefined && s.strength === 'PP' && closedWindows.has(s.window)) continue;
    const scored = resolveShot(s, Math.floor(s.t / PERIOD) + 1, s.t % PERIOD, s.strength);
    if (scored && s.strength === 'PP' && s.window !== undefined) closedWindows.add(s.window);
  }

  let decision: BoxScore['decision'] = 'REG';
  const shootout: BoxScore['shootout'] = [];
  if (teams[home.teamId]!.goals === teams[away.teamId]!.goals) {
    decision = 'OT';
    // Regular season: 5 min 3-on-3, then shootout. Playoffs: 20-min 5-on-5 periods, sudden death.
    const playoff = !!opts.playoff;
    const base = playoff ? 1.0 : 0.45;
    const len = playoff ? PERIOD : OT_LENGTH;
    const lamH = base * Math.exp(0.03 * (H.off - A.def)) * Math.exp(-0.02 * (A.goalieRating - 75));
    const lamA = base * Math.exp(0.03 * (A.off - H.def)) * Math.exp(-0.02 * (H.goalieRating - 75));
    const tH = (-Math.log(1 - rng.next()) / lamH) * len;
    const tA = (-Math.log(1 - rng.next()) / lamA) * len;
    const t = Math.min(tH, tA);
    // A few shots in overtime for the stats.
    for (const [T, n] of [
      [H, rng.poisson(1.5)],
      [A, rng.poisson(1.5)],
    ] as const) {
      teams[T.input.teamId]!.shots += n;
    }
    if (playoff || t < OT_LENGTH) {
      const team = tH < tA ? H : A;
      const O = other(team.input.teamId);
      const scorers = [...(team.fLines[0]?.players ?? []), ...(team.dPairs[0]?.players ?? [])];
      const shooter = rng.weighted(scorers, (p) => attr(p, 'shooting'));
      const mates = scorers.filter((p) => p.id !== shooter.id);
      const assists = mates.length ? [rng.weighted(mates, (p) => attr(p, 'passing')).id] : [];
      sl(shooter.id).g++;
      sl(shooter.id).sog++;
      teams[team.input.teamId]!.shots++;
      for (const a of assists) sl(a).a++;
      teams[team.input.teamId]!.goals++;
      ga[O.input.teamId]!++;
      events.push({
        period: playoff ? 4 + Math.floor(t / PERIOD) : 4,
        time: playoff ? t % PERIOD : t,
        type: 'goal',
        teamId: team.input.teamId,
        playerId: shooter.id,
        assists,
        strength: 'OT',
      });
    } else {
      decision = 'SO';
      const shooters = (T: PreparedTeam) => [...T.fLines.flatMap((u) => u.players)].sort((a, b) => attr(b, 'shooting') - attr(a, 'shooting')).slice(0, 6);
      const hs = shooters(H);
      const as = shooters(A);
      let hg = 0;
      let ag = 0;
      for (let r = 0; r < 20; r++) {
        const hp = hs[r % hs.length] as Player;
        const ap = as[r % as.length] as Player;
        const hScore = rng.chance(goalProb(0.33, hp, A.goalieRating));
        const aScore = rng.chance(goalProb(0.33, ap, H.goalieRating));
        shootout.push({ teamId: home.teamId, playerId: hp.id, scored: hScore }, { teamId: away.teamId, playerId: ap.id, scored: aScore });
        hg += Number(hScore);
        ag += Number(aScore);
        if (r < 2) {
          // Best of three: stop early when one side cannot catch up.
          if (Math.abs(hg - ag) > 2 - r) break;
        } else if (hg !== ag) break;
      }
      if (hg === ag) hg++; // safety net; practically unreachable
      // The shootout winner is credited with one goal.
      teams[hg > ag ? home.teamId : away.teamId]!.goals++;
    }
  }

  const winner = teams[home.teamId]!.goals > teams[away.teamId]!.goals ? home.teamId : away.teamId;
  const loser = winner === home.teamId ? away.teamId : home.teamId;
  const goalieLines: Record<string, GoalieLine> = {
    [H.goalie.id]: { sa: teams[away.teamId]!.shots, ga: ga[home.teamId]!, decision: null },
    [A.goalie.id]: { sa: teams[home.teamId]!.shots, ga: ga[away.teamId]!, decision: null },
  };
  goalieLines[side(winner).goalie.id]!.decision = 'W';
  goalieLines[side(loser).goalie.id]!.decision = decision === 'REG' ? 'L' : 'OTL';

  const injuries: BoxScore['injuries'] = [];
  for (const T of [H, A]) {
    if (!rng.chance(INJURY_RATE)) continue;
    const victim = rng.chance(0.04) ? T.goalie : rng.pick(T.dressed);
    const games = Math.max(1, Math.min(40, Math.round(Math.exp(rng.normal(1.7, 0.9)))));
    injuries.push({ playerId: victim.id, teamId: T.input.teamId, games, description: rng.pick(INJURIES) });
    events.push({ period: rng.int(1, 3), time: rng.range(0, PERIOD), type: 'injury', teamId: T.input.teamId, playerId: victim.id, assists: [], strength: 'EV' });
  }

  events.sort((a, b) => a.period - b.period || a.time - b.time);
  return {
    gameId,
    home: home.teamId,
    away: away.teamId,
    decision,
    teams,
    goalies: { [home.teamId]: H.goalie.id, [away.teamId]: A.goalie.id },
    events,
    skaters,
    goalieLines,
    injuries,
    shootout,
    winner,
  };
}
