/** Lines, pairs, special teams and captains; plus roster moves between NHL and farm team. */

import type { League, Player } from '../model';
import { activePlayers, fullName, groupOf, pickActiveRoster, playersOfTeam, teamPayroll } from '../model';
import { capFloor } from '../config';

export type Slot = string | null;

export interface Lineup {
  /** 4 lines: [LW, C, RW]. */
  forwards: [Slot, Slot, Slot][];
  /** 3 pairs: [left, right]. */
  defense: [Slot, Slot][];
  /** [starter, backup]. */
  goalies: [Slot, Slot];
  /** 2 units: 3 forwards + 2 defense. */
  pp: { f: [Slot, Slot, Slot]; d: [Slot, Slot] }[];
  /** 2 units: 2 forwards + 2 defense. */
  pk: { f: [Slot, Slot]; d: [Slot, Slot] }[];
  captain: Slot;
  assistants: [Slot, Slot];
}

export const MAX_ACTIVE = 23;
export const MIN_ACTIVE = 20;

export function emptyLineup(): Lineup {
  return {
    forwards: Array.from({ length: 4 }, () => [null, null, null] as [Slot, Slot, Slot]),
    defense: Array.from({ length: 3 }, () => [null, null] as [Slot, Slot]),
    goalies: [null, null],
    pp: Array.from({ length: 2 }, () => ({ f: [null, null, null] as [Slot, Slot, Slot], d: [null, null] as [Slot, Slot] })),
    pk: Array.from({ length: 2 }, () => ({ f: [null, null] as [Slot, Slot], d: [null, null] as [Slot, Slot] })),
    captain: null,
    assistants: [null, null],
  };
}

const sk = (p: Player, k: keyof NonNullable<Player['skater']>) => p.skater?.[k] ?? p.ovr;
const offense = (p: Player) => (sk(p, 'shooting') + sk(p, 'passing') + sk(p, 'puckHandling') + sk(p, 'hockeyIQ')) / 4;
const defenseScore = (p: Player) => (sk(p, 'defense') * 2 + sk(p, 'hockeyIQ') + sk(p, 'physical') + sk(p, 'skating')) / 5;

/** Rating of a player in a slot, with a penalty for playing off his natural position. */
export function slotRating(p: Player, slot: 'C' | 'LW' | 'RW' | 'D' | 'G'): number {
  if (slot === 'G') return p.position === 'G' ? p.ovr : 0;
  if (p.position === 'G') return 0;
  if (slot === 'D') return p.position === 'D' ? p.ovr : p.ovr - 12;
  if (p.position === 'D') return p.ovr - 10;
  if (p.position === slot) return p.ovr;
  if (slot === 'C') return p.ovr - 4;
  return p.ovr - (p.position === 'C' ? 1 : 2);
}

function available(league: League, teamId: string): Player[] {
  return activePlayers(league, teamId)
    .filter((p) => !p.injury || p.injury.gamesRemaining === 0)
    .sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id));
}

export function autoLineup(league: League, teamId: string): Lineup {
  const l = emptyLineup();
  const pool = available(league, teamId);
  const used = new Set<string>();
  const take = (slot: 'C' | 'LW' | 'RW' | 'D' | 'G', pred: (p: Player) => boolean = () => true): Slot => {
    const best = pool
      .filter((p) => !used.has(p.id) && pred(p) && slotRating(p, slot) > 0)
      .sort((a, b) => slotRating(b, slot) - slotRating(a, slot) || a.id.localeCompare(b.id))[0];
    if (!best) return null;
    used.add(best.id);
    return best.id;
  };
  const fwd = (p: Player) => groupOf(p.position) === 'F';
  for (let i = 0; i < 4; i++) {
    const c = take('C', fwd);
    const lw = take('LW', fwd);
    const rw = take('RW', fwd);
    l.forwards[i] = [lw, c, rw];
  }
  for (let i = 0; i < 3; i++) {
    const left = take('D', (p) => p.position === 'D' && p.shoots === 'L') ?? take('D', (p) => p.position === 'D');
    const right = take('D', (p) => p.position === 'D' && p.shoots === 'R') ?? take('D', (p) => p.position === 'D');
    l.defense[i] = [left, right];
  }
  // Not enough natural forwards/defensemen: fill the holes with any healthy skater (off-position).
  l.forwards = l.forwards.map((line) => line.map((id, j) => id ?? take((['LW', 'C', 'RW'] as const)[j] ?? 'C')) as [Slot, Slot, Slot]);
  l.defense = l.defense.map((pair) => pair.map((id) => id ?? take('D')) as [Slot, Slot]);
  const goalies = pool.filter((p) => p.position === 'G');
  l.goalies = [goalies[0]?.id ?? null, goalies[1]?.id ?? null];

  const fs = pool.filter((p) => groupOf(p.position) === 'F');
  const ds = pool.filter((p) => p.position === 'D');
  const byOff = (xs: Player[]) => [...xs].sort((a, b) => offense(b) - offense(a) || a.id.localeCompare(b.id)).map((p) => p.id);
  const byDef = (xs: Player[]) => [...xs].sort((a, b) => defenseScore(b) - defenseScore(a) || a.id.localeCompare(b.id)).map((p) => p.id);
  const ppF = byOff(fs);
  const ppD = byOff(ds);
  const pkF = byDef(fs);
  const pkD = byDef(ds);
  const at = (xs: string[], i: number): Slot => xs[i] ?? null;
  l.pp = [
    { f: [at(ppF, 0), at(ppF, 1), at(ppF, 2)], d: [at(ppD, 0), at(ppD, 1)] },
    { f: [at(ppF, 3), at(ppF, 4), at(ppF, 5)], d: [at(ppD, 2), at(ppD, 3)] },
  ];
  l.pk = [
    { f: [at(pkF, 0), at(pkF, 1)], d: [at(pkD, 0), at(pkD, 1)] },
    { f: [at(pkF, 2), at(pkF, 3)], d: [at(pkD, 2), at(pkD, 3)] },
  ];
  const leaders = pool
    .filter((p) => p.position !== 'G')
    .sort((a, b) => sk(b, 'hockeyIQ') + b.age * 0.6 + b.ovr * 0.5 - (sk(a, 'hockeyIQ') + a.age * 0.6 + a.ovr * 0.5) || a.id.localeCompare(b.id));
  l.captain = leaders[0]?.id ?? null;
  l.assistants = [leaders[1]?.id ?? null, leaders[2]?.id ?? null];
  return l;
}

export interface LineupIssue {
  level: 'error' | 'warn';
  message: string;
}

export function validateLineup(league: League, teamId: string, l: Lineup): LineupIssue[] {
  const out: LineupIssue[] = [];
  const name = (id: string) => (league.players[id] ? fullName(league.players[id] as Player) : id);
  const check = (id: Slot, label: string, need: 'F' | 'D' | 'G' | 'S') => {
    if (!id) {
      out.push({ level: 'error', message: `${label}: nicht besetzt.` });
      return;
    }
    const p = league.players[id];
    if (!p || p.teamId !== teamId) out.push({ level: 'error', message: `${label}: ${name(id)} gehört nicht zum Team.` });
    else if (p.farm) out.push({ level: 'error', message: `${label}: ${name(id)} steht im Farmteam.` });
    else if (need === 'G' && p.position !== 'G') out.push({ level: 'error', message: `${label}: ${name(id)} ist kein Goalie.` });
    else if (need !== 'G' && p.position === 'G') out.push({ level: 'error', message: `${label}: Goalies können nicht als Feldspieler eingesetzt werden.` });
    else if (need === 'D' && p.position !== 'D') out.push({ level: 'warn', message: `${label}: ${name(id)} spielt ungewohnt in der Verteidigung.` });
    else if (need === 'F' && p.position === 'D') out.push({ level: 'warn', message: `${label}: ${name(id)} spielt ungewohnt im Sturm.` });
    if (p?.injury && p.injury.gamesRemaining > 0) out.push({ level: 'warn', message: `${label}: ${name(id)} ist verletzt.` });
  };
  l.forwards.forEach((line, i) => line.forEach((id, j) => check(id, `${i + 1}. Reihe ${['LW', 'C', 'RW'][j]}`, 'F')));
  l.defense.forEach((pair, i) => pair.forEach((id, j) => check(id, `${i + 1}. Verteidigerpaar ${j ? 'rechts' : 'links'}`, 'D')));
  check(l.goalies[0], 'Starting Goalie', 'G');
  check(l.goalies[1], 'Backup Goalie', 'G');
  const es = [...l.forwards.flat(), ...l.defense.flat(), ...l.goalies].filter((x): x is string => !!x);
  const dup = es.filter((id, i) => es.indexOf(id) !== i);
  for (const id of new Set(dup)) out.push({ level: 'error', message: `${name(id)} ist mehrfach in Reihen/Paaren eingeteilt.` });
  l.pp.forEach((u, i) => [...u.f, ...u.d].forEach((id) => check(id, `PP${i + 1}`, 'S')));
  l.pk.forEach((u, i) => [...u.f, ...u.d].forEach((id) => check(id, `PK${i + 1}`, 'S')));
  check(l.captain, 'Kapitän', 'S');
  l.assistants.forEach((id) => check(id, 'Assistent', 'S'));
  const leaders = [l.captain, ...l.assistants].filter(Boolean);
  if (new Set(leaders).size !== leaders.length) out.push({ level: 'error', message: 'Kapitän und Assistenten müssen verschiedene Spieler sein.' });
  return out;
}

/** Average slot rating per line/pair (for display and later the simulation). */
export function lineRatings(league: League, l: Lineup) {
  const r = (id: Slot, slot: 'C' | 'LW' | 'RW' | 'D' | 'G') => (id && league.players[id] ? slotRating(league.players[id] as Player, slot) : 0);
  return {
    forwards: l.forwards.map(([lw, c, rw]) => (r(lw, 'LW') + r(c, 'C') + r(rw, 'RW')) / 3),
    defense: l.defense.map(([a, b]) => (r(a, 'D') + r(b, 'D')) / 2),
    goalie: r(l.goalies[0], 'G'),
  };
}

/** Move a player between NHL roster and farm team (max 23 active). */
export function setFarm(league: League, playerId: string, farm: boolean): { league: League; error: string | null } {
  const p = league.players[playerId];
  if (!p || !p.teamId) return { league, error: 'Unbekannter Spieler.' };
  if (p.farm === farm) return { league, error: null };
  if (!farm && activePlayers(league, p.teamId).length >= MAX_ACTIVE) return { league, error: `Der NHL-Kader ist voll (${MAX_ACTIVE}).` };
  if (!farm && !p.contract) return { league, error: 'Ungesignte Draftpicks können nicht in den NHL-Kader berufen werden.' };
  if (!farm && p.contract && p.contract.yearsLeft < 1) return { league, error: 'Spieler ohne Vertrag für die Saison können nicht berufen werden.' };
  return { league: { ...league, players: { ...league.players, [playerId]: { ...p, farm } } }, error: null };
}

/**
 * Offseason only (no waivers): the best balanced NHL roster from everyone under contract for the coming
 * season; the rest goes to the farm team.
 */
export function bestActiveRoster(league: League, teamId: string): League {
  const signed = playersOfTeam(league, teamId).filter((p) => p.contract && p.contract.yearsLeft >= 1);
  const keep = pickActiveRoster(signed, MAX_ACTIVE);
  const players = { ...league.players };
  for (const p of playersOfTeam(league, teamId)) {
    const farm = !keep.has(p.id);
    if (p.farm !== farm) players[p.id] = { ...p, farm };
  }
  return { ...league, players };
}

export interface ReadinessIssue {
  message: string;
}

/** Is the team ready for opening night? */
export function seasonReadiness(league: League, teamId: string, lineup: Lineup | null): ReadinessIssue[] {
  const out: ReadinessIssue[] = [];
  const act = activePlayers(league, teamId).filter((p) => p.contract && p.contract.yearsLeft >= 1);
  const c = { F: 0, D: 0, G: 0 };
  for (const p of act) c[groupOf(p.position)]++;
  if (act.length < MIN_ACTIVE) out.push({ message: `Mindestens ${MIN_ACTIVE} Spieler mit Vertrag im NHL-Kader nötig (aktuell ${act.length}).` });
  if (activePlayers(league, teamId).length > MAX_ACTIVE) out.push({ message: `Höchstens ${MAX_ACTIVE} Spieler im NHL-Kader erlaubt.` });
  if (c.F < 12) out.push({ message: `Mindestens 12 Stürmer im NHL-Kader nötig (aktuell ${c.F}).` });
  if (c.D < 6) out.push({ message: `Mindestens 6 Verteidiger im NHL-Kader nötig (aktuell ${c.D}).` });
  if (c.G < 2) out.push({ message: `Mindestens 2 Goalies im NHL-Kader nötig (aktuell ${c.G}).` });
  const pay = teamPayroll(league, teamId);
  if (pay > league.config.salaryCap) out.push({ message: 'Die Payroll liegt über dem Salary Cap.' });
  if (pay < capFloor(league.config)) out.push({ message: 'Die Payroll liegt unter dem Cap Floor.' });
  if (!lineup) out.push({ message: 'Noch keine Aufstellung festgelegt.' });
  else for (const i of validateLineup(league, teamId, lineup)) if (i.level === 'error') out.push({ message: `Aufstellung: ${i.message}` });
  return out;
}
