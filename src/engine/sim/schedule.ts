/**
 * 82-game schedule for 33 teams: every pair meets at least twice, division rivals four times, and
 * the remaining games go to conference opponents. Home/away is balanced exactly (41/41) via an
 * Euler orientation of the odd pairings. Games are spread over the calendar with occasional
 * back-to-backs but never three games in three days.
 */

import type { League } from '../model';
import type { Rng } from '../rng';
import { rngFor } from '../rng';

export interface ScheduledGame {
  id: string;
  day: number;
  home: string;
  away: string;
}

export interface Schedule {
  games: ScheduledGame[];
  days: number;
  deadlineDay: number;
}

const START = { year: 2027, month: 10, day: 8 };
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const monthLen = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] as number;
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Day of the week (0 = Sunday) without Date objects (Sakamoto's method). */
function weekday(y: number, m: number, d: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  return (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + (t[m - 1] as number) + d) % 7;
}

/** Calendar date of a season day (day 0 = opening night on 8 October), e.g. "Sa 9. Okt 2027". */
export function dayLabel(day: number, startYear = START.year): string {
  let y = startYear;
  let m = START.month;
  let d = START.day + day;
  while (d > monthLen(y, m)) {
    d -= monthLen(y, m);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return `${WEEKDAYS[weekday(y, m, d)]} ${d}. ${MONTHS[m - 1]} ${y}`;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function extraEdges(rng: Rng, teams: string[], residual: Map<string, number>, sameConf: (a: string, b: string) => boolean, sameDiv: (a: string, b: string) => boolean): [string, string][] | null {
  const res = new Map(residual);
  const used = new Set<string>();
  const edges: [string, string][] = [];
  for (let guard = 0; guard < 10_000; guard++) {
    const open = teams.filter((t) => (res.get(t) ?? 0) > 0);
    if (!open.length) return edges;
    const maxR = Math.max(...open.map((t) => res.get(t) ?? 0));
    const a = rng.pick(open.filter((t) => res.get(t) === maxR));
    const cands = open.filter((b) => b !== a && !used.has(pairKey(a, b)));
    const tiers = [cands.filter((b) => sameConf(a, b) && !sameDiv(a, b)), cands.filter((b) => !sameDiv(a, b)), cands];
    const tier = tiers.find((t) => t.length);
    if (!tier) return null;
    const best = Math.max(...tier.map((b) => res.get(b) ?? 0));
    const b = rng.pick(tier.filter((x) => res.get(x) === best));
    used.add(pairKey(a, b));
    edges.push([a, b]);
    res.set(a, (res.get(a) ?? 0) - 1);
    res.set(b, (res.get(b) ?? 0) - 1);
  }
  return null;
}

/** Orient edges so every vertex has in-degree = out-degree (all degrees are even). */
function eulerOrient(edges: [string, string][]): [string, string][] {
  const adj = new Map<string, { to: string; idx: number }[]>();
  edges.forEach(([a, b], idx) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ to: b, idx });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ to: a, idx });
  });
  const usedEdge = new Array<boolean>(edges.length).fill(false);
  const out: [string, string][] = [];
  for (const start of [...adj.keys()].sort()) {
    const stack = [start];
    while (stack.length) {
      const v = stack[stack.length - 1] as string;
      const list = adj.get(v) ?? [];
      while (list.length && usedEdge[list[list.length - 1]!.idx]) list.pop();
      const e = list.pop();
      if (!e) {
        stack.pop();
        continue;
      }
      usedEdge[e.idx] = true;
      out.push([v, e.to]);
      stack.push(e.to);
    }
  }
  return out;
}

export function generateSchedule(league: League, seed: string, games = league.config.gamesPerSeason): Schedule {
  const teams = league.teams.map((t) => t.id).sort();
  const team = new Map(league.teams.map((t) => [t.id, t]));
  const sameConf = (a: string, b: string) => team.get(a)?.conference === team.get(b)?.conference;
  const sameDiv = (a: string, b: string) => team.get(a)?.division === team.get(b)?.division;
  const count = new Map<string, number>();
  const total = new Map<string, number>(teams.map((t) => [t, 0]));
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i] as string;
      const b = teams[j] as string;
      const c = sameDiv(a, b) ? 4 : 2;
      count.set(pairKey(a, b), c);
      total.set(a, (total.get(a) ?? 0) + c);
      total.set(b, (total.get(b) ?? 0) + c);
    }
  const residual = new Map(teams.map((t) => [t, games - (total.get(t) ?? 0)]));
  let extras: [string, string][] | null = null;
  for (let attempt = 0; attempt < 200 && !extras; attempt++) extras = extraEdges(rngFor(seed, 'schedule-extra', attempt), teams, residual, sameConf, sameDiv);
  if (!extras) throw new Error('Could not build a balanced schedule');
  for (const [a, b] of extras) count.set(pairKey(a, b), (count.get(pairKey(a, b)) ?? 0) + 1);
  const oriented = new Set(eulerOrient(extras).map(([h, a]) => `${h}>${a}`));

  const matchups: { home: string; away: string }[] = [];
  for (const [key, c] of count) {
    const [a, b] = key.split('|') as [string, string];
    const half = Math.floor(c / 2);
    for (let k = 0; k < half; k++) {
      matchups.push({ home: a, away: b });
      matchups.push({ home: b, away: a });
    }
    if (c % 2 === 1) matchups.push(oriented.has(`${a}>${b}`) ? { home: a, away: b } : { home: b, away: a });
  }

  // Spread over the calendar.
  const rng = rngFor(seed, 'schedule-days');
  let remaining = rng.shuffle(matchups);
  const left = new Map(teams.map((t) => [t, games]));
  const played = new Map<string, number[]>(teams.map((t) => [t, []]));
  const targetDays = 176;
  const out: ScheduledGame[] = [];
  let day = 0;
  while (remaining.length && day < 400) {
    const daysLeft = Math.max(1, targetDays - day);
    const urgency = (t: string) => (left.get(t) ?? 0) / daysLeft;
    const weekend = day % 7 === 1 || day % 7 === 2;
    const cap = weekend ? 12 : 7;
    const today = new Set<string>();
    const ordered = [...remaining].sort((x, y) => urgency(y.home) + urgency(y.away) - (urgency(x.home) + urgency(x.away)));
    const scheduled = new Set<(typeof remaining)[number]>();
    for (const g of ordered) {
      if (scheduled.size >= cap) break;
      if (today.has(g.home) || today.has(g.away)) continue;
      const ok = [g.home, g.away].every((t) => {
        const days = played.get(t) as number[];
        const y1 = days.includes(day - 1);
        const y2 = days.includes(day - 2);
        if (y1 && y2) return false;
        if (y1) return urgency(t) > 0.55 || rng.chance(0.25);
        return true;
      });
      if (!ok) continue;
      scheduled.add(g);
      today.add(g.home);
      today.add(g.away);
    }
    for (const g of scheduled) {
      out.push({ id: `g${out.length + 1}`, day, home: g.home, away: g.away });
      (played.get(g.home) as number[]).push(day);
      (played.get(g.away) as number[]).push(day);
      left.set(g.home, (left.get(g.home) ?? 0) - 1);
      left.set(g.away, (left.get(g.away) ?? 0) - 1);
    }
    remaining = remaining.filter((g) => !scheduled.has(g));
    day++;
  }
  const deadlineGame = out[Math.floor(out.length * 0.72)];
  return { games: out, days: day, deadlineDay: deadlineGame?.day ?? Math.floor(day * 0.72) };
}
