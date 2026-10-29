/** Generated headlines for the newsfeed. Templates vary deterministically via the season seed. */

import { EXPANSION_TEAM_ID } from '../franchise';
import type { League, Player, Team } from '../model';
import { fullName } from '../model';
import { rngFor } from '../rng';
import type { BoxScore } from '../sim/game';

export interface NewsItem {
  day: number;
  headline: string;
  body: string;
  tone: 'good' | 'bad' | 'neutral';
  teamId: string | null;
}

export interface Streak {
  kind: 'W' | 'L';
  n: number;
}

export function streakOf(results: { home: string; away: string; homeGoals: number; awayGoals: number; decision: string }[], teamId: string): Streak {
  let kind: 'W' | 'L' | null = null;
  let n = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i]!;
    const won = (r.home === teamId ? r.homeGoals : r.awayGoals) > (r.home === teamId ? r.awayGoals : r.homeGoals);
    const k = won ? 'W' : 'L';
    if (kind === null) kind = k;
    if (k !== kind) break;
    n++;
  }
  return { kind: kind ?? 'W', n };
}

export interface NewsContext {
  seed: string;
  day: number;
  playoff: boolean;
  /** Number of franchise games before today (regular season). */
  priorGames: number;
  priorWins: number;
  priorHomeWins: number;
  /** Expansion team's results so far including today, oldest first. */
  myResults: { home: string; away: string; homeGoals: number; awayGoals: number; decision: string }[];
}

export function newsForDay(league: League, boxes: BoxScore[], ctx: NewsContext): NewsItem[] {
  const out: NewsItem[] = [];
  const rng = rngFor(ctx.seed, 'news', ctx.day, ctx.playoff ? 'po' : 'rs');
  const team = (id: string) => league.teams.find((t) => t.id === id) as Team;
  const name = (id: string) => (league.players[id] ? fullName(league.players[id] as Player) : id);
  const me = team(EXPANSION_TEAM_ID);
  let wins = ctx.priorWins;
  let homeWins = ctx.priorHomeWins;
  let games = ctx.priorGames;

  for (const box of boxes) {
    const mine = box.home === EXPANSION_TEAM_ID || box.away === EXPANSION_TEAM_ID;
    const goalsBy: Record<string, number> = {};
    for (const e of box.events) if (e.type === 'goal') goalsBy[e.playerId] = (goalsBy[e.playerId] ?? 0) + 1;
    if (!mine) {
      for (const [pid, g] of Object.entries(goalsBy)) {
        if (g >= 4 || (g === 3 && rng.chance(0.25))) {
          const t = team(league.players[pid]?.teamId ?? '');
          out.push({ day: ctx.day, headline: `${g === 4 ? 'Vier-Tore-Gala' : 'Hattrick'} für ${name(pid)}`, body: `${name(pid)} (${t?.abbrev ?? ''}) trifft ${g}-mal.`, tone: 'neutral', teamId: t?.id ?? null });
        }
      }
      continue;
    }
    const home = box.home === EXPANSION_TEAM_ID;
    const opp = team(home ? box.away : box.home);
    const gf = box.teams[EXPANSION_TEAM_ID]!.goals;
    const ga = box.teams[opp.id]!.goals;
    const won = gf > ga;
    games++;
    if (!ctx.playoff && games === 1) {
      const scorer = box.events.find((e) => e.type === 'goal' && e.teamId === EXPANSION_TEAM_ID);
      out.push({
        day: ctx.day,
        headline: `Premiere: ${me.city} ${me.name} ${won ? 'gewinnen' : 'verlieren'} ihr erstes Spiel`,
        body: `${gf}:${ga} gegen ${opp.city}.${scorer ? ` Das erste Tor der Franchise-Geschichte erzielt ${name(scorer.playerId)}.` : ''}`,
        tone: won ? 'good' : 'neutral',
        teamId: EXPANSION_TEAM_ID,
      });
    }
    if (won && !ctx.playoff) {
      wins++;
      if (wins === 1 && games > 1)
        out.push({ day: ctx.day, headline: 'Endlich! Der erste Sieg der Franchise-Geschichte', body: `${gf}:${ga} gegen ${opp.city} – die Fans feiern bis tief in die Nacht.`, tone: 'good', teamId: EXPANSION_TEAM_ID });
      if (home) {
        homeWins++;
        if (homeWins === 1)
          out.push({ day: ctx.day, headline: 'Erster Heimsieg vor ausverkauftem Haus', body: `${me.city} bejubelt das ${gf}:${ga} gegen ${opp.city}.`, tone: 'good', teamId: EXPANSION_TEAM_ID });
      }
    }
    for (const [pid, g] of Object.entries(goalsBy)) {
      if (g >= 3 && league.players[pid]?.teamId === EXPANSION_TEAM_ID)
        out.push({
          day: ctx.day,
          headline: rng.pick([`Hüte fliegen aufs Eis: Hattrick für ${name(pid)}`, `${name(pid)} mit dem Hattrick`, `Drei Tore, ein Name: ${name(pid)}`]),
          body: `${me.city} ${won ? 'gewinnt' : 'verliert trotzdem'} ${gf}:${ga} gegen ${opp.city}.`,
          tone: 'good',
          teamId: EXPANSION_TEAM_ID,
        });
    }
    const myGoalie = box.goalies[EXPANSION_TEAM_ID]!;
    if (won && ga === 0)
      out.push({ day: ctx.day, headline: `Shutout für ${name(myGoalie)}`, body: `${box.goalieLines[myGoalie]?.sa ?? 0} Saves beim ${gf}:0 gegen ${opp.city}.`, tone: 'good', teamId: EXPANSION_TEAM_ID });
    if (Math.abs(gf - ga) >= 5)
      out.push({
        day: ctx.day,
        headline: won ? `Kantersieg: ${me.city} überrollt ${opp.city}` : `Debakel in ${home ? me.city : opp.city}`,
        body: `Endstand ${gf}:${ga}.`,
        tone: won ? 'good' : 'bad',
        teamId: EXPANSION_TEAM_ID,
      });
    if (box.decision !== 'REG' && won && ctx.playoff)
      out.push({ day: ctx.day, headline: `Overtime-Drama! ${me.city} gewinnt in der Verlängerung`, body: `${gf}:${ga} gegen ${opp.city}.`, tone: 'good', teamId: EXPANSION_TEAM_ID });
    for (const inj of box.injuries) {
      if (inj.teamId === EXPANSION_TEAM_ID && inj.games >= 15)
        out.push({ day: ctx.day, headline: `Schock: ${name(inj.playerId)} fällt lange aus`, body: `${inj.description}, voraussichtlich ${inj.games} Spiele.`, tone: 'bad', teamId: EXPANSION_TEAM_ID });
    }
  }

  if (!ctx.playoff && boxes.some((b) => b.home === EXPANSION_TEAM_ID || b.away === EXPANSION_TEAM_ID)) {
    const st = streakOf(ctx.myResults, EXPANSION_TEAM_ID);
    if (st.kind === 'W' && [4, 6, 8, 10].includes(st.n))
      out.push({ day: ctx.day, headline: `${me.city} ist heiß: ${st.n} Siege in Folge`, body: rng.pick(['Die Stadt träumt von den Playoffs.', 'Plötzlich spricht die ganze Liga über das Expansionsteam.']), tone: 'good', teamId: EXPANSION_TEAM_ID });
    if (st.kind === 'L' && [5, 8, 11].includes(st.n))
      out.push({ day: ctx.day, headline: `Krise in ${me.city}: ${st.n} Niederlagen am Stück`, body: rng.pick(['Die Fans werden ungeduldig.', 'Der Owner fordert eine Reaktion.']), tone: 'bad', teamId: EXPANSION_TEAM_ID });
  }
  return out;
}
