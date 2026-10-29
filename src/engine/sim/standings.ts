/** Standings and statistics tables derived from the season results. */

import type { League, Player } from '../model';
import { fullName } from '../model';
import type { GameSummary, SeasonState } from './season';

export interface StandingRow {
  teamId: string;
  gp: number;
  w: number;
  l: number;
  otl: number;
  pts: number;
  row: number;
  gf: number;
  ga: number;
  diff: number;
  pointsPct: number;
  streak: string;
  last10: string;
}

export function standings(league: League, s: SeasonState): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    league.teams.map((t) => [t.id, { teamId: t.id, gp: 0, w: 0, l: 0, otl: 0, pts: 0, row: 0, gf: 0, ga: 0, diff: 0, pointsPct: 0, streak: '–', last10: '0-0-0' }]),
  );
  const history = new Map<string, ('W' | 'L' | 'O')[]>(league.teams.map((t) => [t.id, []]));
  const ordered = Object.values(s.results).sort((a, b) => a.day - b.day || Number(a.id.slice(1)) - Number(b.id.slice(1)));
  for (const r of ordered) {
    for (const [team, gf, ga] of [
      [r.home, r.homeGoals, r.awayGoals],
      [r.away, r.awayGoals, r.homeGoals],
    ] as const) {
      const row = rows.get(team) as StandingRow;
      row.gp++;
      row.gf += gf;
      row.ga += ga;
      const h = history.get(team) as ('W' | 'L' | 'O')[];
      if (gf > ga) {
        row.w++;
        row.pts += 2;
        if (r.decision !== 'SO') row.row++;
        h.push('W');
      } else if (r.decision === 'REG') {
        row.l++;
        h.push('L');
      } else {
        row.otl++;
        row.pts++;
        h.push('O');
      }
    }
  }
  for (const row of rows.values()) {
    row.diff = row.gf - row.ga;
    row.pointsPct = row.gp ? row.pts / (row.gp * 2) : 0;
    const h = history.get(row.teamId) as ('W' | 'L' | 'O')[];
    if (h.length) {
      const last = h[h.length - 1] as 'W' | 'L' | 'O';
      let n = 0;
      for (let i = h.length - 1; i >= 0 && h[i] === last; i--) n++;
      row.streak = `${last === 'W' ? 'W' : last === 'L' ? 'L' : 'OT'}${n}`;
      const l10 = h.slice(-10);
      row.last10 = `${l10.filter((x) => x === 'W').length}-${l10.filter((x) => x === 'L').length}-${l10.filter((x) => x === 'O').length}`;
    }
  }
  return sortStandings([...rows.values()]);
}

/** Points, then points %, regulation+OT wins, goal differential, goals for. */
export function sortStandings(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort(
    (a, b) => b.pts - a.pts || b.pointsPct - a.pointsPct || b.row - a.row || b.diff - a.diff || b.gf - a.gf || a.teamId.localeCompare(b.teamId),
  );
}

export interface WildcardView {
  conference: string;
  divisions: { name: string; top: StandingRow[] }[];
  wildcards: StandingRow[];
  rest: StandingRow[];
}

/** Top 3 per division + 2 wildcards per conference. */
export function wildcardStandings(league: League, s: SeasonState): WildcardView[] {
  const all = standings(league, s);
  const confs = [...new Set(league.divisions.map((d) => d.conference))];
  return confs.map((conference) => {
    const divs = league.divisions.filter((d) => d.conference === conference);
    const divisions = divs.map((d) => ({ name: d.name, top: all.filter((r) => d.teamIds.includes(r.teamId)).slice(0, 3) }));
    const taken = new Set(divisions.flatMap((d) => d.top.map((r) => r.teamId)));
    const others = all.filter((r) => divs.some((d) => d.teamIds.includes(r.teamId)) && !taken.has(r.teamId));
    return { conference, divisions, wildcards: others.slice(0, 2), rest: others.slice(2) };
  });
}

export interface SkaterRow {
  playerId: string;
  name: string;
  teamId: string | null;
  position: string;
  gp: number;
  g: number;
  a: number;
  p: number;
  pm: number;
  pim: number;
  sog: number;
}

export interface GoalieRow {
  playerId: string;
  name: string;
  teamId: string | null;
  gp: number;
  w: number;
  l: number;
  otl: number;
  svPct: number;
  gaa: number;
  so: number;
}

export function skaterTable(league: League, s: SeasonState): SkaterRow[] {
  return Object.entries(s.skaterStats)
    .map(([id, st]) => {
      const p = league.players[id] as Player | undefined;
      return {
        playerId: id,
        name: p ? fullName(p) : id,
        teamId: p?.teamId ?? null,
        position: p?.position ?? '',
        gp: st.gp,
        g: st.g,
        a: st.a,
        p: st.g + st.a,
        pm: st.pm,
        pim: st.pim,
        sog: st.sog,
      };
    })
    .sort((a, b) => b.p - a.p || b.g - a.g || a.gp - b.gp || a.playerId.localeCompare(b.playerId));
}

export function goalieTable(league: League, s: SeasonState): GoalieRow[] {
  return Object.entries(s.goalieStats)
    .map(([id, st]) => {
      const p = league.players[id] as Player | undefined;
      return {
        playerId: id,
        name: p ? fullName(p) : id,
        teamId: p?.teamId ?? null,
        gp: st.gp,
        w: st.w,
        l: st.l,
        otl: st.otl,
        svPct: st.sa ? (st.sa - st.ga) / st.sa : 0,
        gaa: st.gp ? (st.ga * 60) / (st.gp * 60) : 0,
        so: st.so,
      };
    })
    .sort((a, b) => b.w - a.w || b.svPct - a.svPct || a.playerId.localeCompare(b.playerId));
}

export function teamGames(s: SeasonState, teamId: string): GameSummary[] {
  return s.games
    .filter((g) => g.home === teamId || g.away === teamId)
    .map((g) => s.results[g.id] ?? { id: g.id, day: g.day, home: g.home, away: g.away, homeGoals: -1, awayGoals: -1, decision: 'REG' as const });
}
