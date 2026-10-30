/** Season wrap-up: fictional awards, expansion draft review, overall verdict and achievements. */

import { EXPANSION_TEAM_ID } from '../franchise';
import type { League, Player } from '../model';
import { fullName, groupOf, isInauguralSeason, isRookie, playersOfTeam } from '../model';
import type { ExpansionDraftState } from '../expansion/draft';
import type { Grade } from '../expansion/selection';
import type { OffseasonState } from '../offseason/offseason';
import type { PlayoffState } from '../sim/playoffs';
import { ROUND_NAMES, seriesOf } from '../sim/playoffs';
import type { SeasonState } from '../sim/season';
import { goalieTable, skaterTable, standings } from '../sim/standings';
import { averageAttendance } from './meta';

export interface Award {
  id: string;
  name: string;
  description: string;
  playerId: string | null;
  teamId: string | null;
  value: string;
}

export function computeAwards(league: League, s: SeasonState): Award[] {
  const sk = skaterTable(league, s).filter((r) => r.gp >= 20);
  const gs = goalieTable(league, s).filter((r) => r.gp >= 30);
  const table = standings(league, s);
  const teamPts = new Map(table.map((r) => [r.teamId, r.pts]));
  const out: Award[] = [];
  const add = (id: string, name: string, description: string, row: { playerId: string; teamId: string | null } | undefined, value: string) => {
    if (row) out.push({ id, name, description, playerId: row.playerId, teamId: row.teamId, value });
  };
  const mvp = [...sk].sort((a, b) => b.p + b.pm * 0.3 + (teamPts.get(b.teamId ?? '') ?? 0) * 0.15 - (a.p + a.pm * 0.3 + (teamPts.get(a.teamId ?? '') ?? 0) * 0.15))[0];
  add('mvp', 'Northern Star Trophy', 'Wertvollster Spieler der Saison', mvp, mvp ? `${mvp.g} Tore, ${mvp.a} Vorlagen` : '');
  const scorer = sk[0];
  add('points', 'Golden Stick', 'Meiste Scorerpunkte', scorer, scorer ? `${scorer.p} Punkte` : '');
  const sniper = [...sk].sort((a, b) => b.g - a.g || b.p - a.p)[0];
  add('goals', 'Sniper Award', 'Meiste Tore', sniper, sniper ? `${sniper.g} Tore` : '');
  const goalie = [...gs].sort((a, b) => b.svPct * 1000 + b.w * 0.4 - (a.svPct * 1000 + a.w * 0.4))[0];
  add('goalie', 'Iron Mask Award', 'Bester Goalie', goalie, goalie ? `${goalie.svPct.toFixed(3).replace(/^0/, '')} SV%, ${goalie.w} Siege` : '');
  const dman = [...sk].filter((r) => r.position === 'D').sort((a, b) => b.p + b.pm * 0.5 - (a.p + a.pm * 0.5))[0];
  add('defense', 'Blue Line Trophy', 'Bester Verteidiger', dman, dman ? `${dman.p} Punkte, ${dman.pm > 0 ? '+' : ''}${dman.pm}` : '');
  const rookie = [...sk].filter((r) => !!league.players[r.playerId] && isRookie(league.players[r.playerId] as Player)).sort((a, b) => b.p - a.p)[0];
  add('rookie', 'Rising Star Award', 'Bester Rookie', rookie, rookie ? `${rookie.p} Punkte` : '');
  const fair = [...sk].filter((r) => r.gp >= 60 && r.p >= 30).sort((a, b) => a.pim - b.pim || b.p - a.p)[0];
  add('fair', 'Gentleman Cup', 'Fairster Spieler mit Klasse', fair, fair ? `${fair.pim} Strafminuten` : '');
  return out;
}

export interface DraftReviewRow {
  playerId: string;
  name: string;
  fromTeamId: string;
  position: string;
  stillHere: boolean;
  line: string;
  /** Performance relative to the player's draft-day rating; >0 = outperformed. */
  score: number;
}

/** How did the expansion draft picks perform in season one? */
export function draftReview(league: League, draft: ExpansionDraftState, s: SeasonState): DraftReviewRow[] {
  const rows: DraftReviewRow[] = [];
  for (const [pid, fromTeamId] of Object.entries(draft.origins)) {
    const p = league.players[pid] as Player | undefined;
    if (!p) continue;
    if (groupOf(p.position) === 'G') {
      const g = s.goalieStats[pid];
      const sv = g && g.sa ? (g.sa - g.ga) / g.sa : 0;
      const expected = 0.884 + (p.ovr - 65) * 0.0011;
      rows.push({
        playerId: pid,
        name: fullName(p),
        fromTeamId,
        position: p.position,
        stillHere: p.teamId === EXPANSION_TEAM_ID,
        line: g ? `${g.gp} GP, ${sv.toFixed(3).replace(/^0/, '')} SV%` : 'nicht eingesetzt',
        score: g && g.gp >= 5 ? (sv - expected) * 400 + g.gp * 0.05 : -2,
      });
    } else {
      const st = s.skaterStats[pid];
      const pts = st ? st.g + st.a : 0;
      const ppg = st && st.gp ? pts / st.gp : 0;
      const expected = Math.pow(Math.max(0.03, (p.ovr - 55) / 35), 1.6) * (p.position === 'D' ? 0.55 : 1) * 0.85;
      rows.push({
        playerId: pid,
        name: fullName(p),
        fromTeamId,
        position: p.position,
        stillHere: p.teamId === EXPANSION_TEAM_ID,
        line: st ? `${st.gp} GP, ${st.g}+${st.a}=${pts}, ${st.pm > 0 ? '+' : ''}${st.pm}` : 'nicht eingesetzt',
        score: st && st.gp >= 10 ? (ppg - expected) * 25 + st.pm * 0.1 + st.gp * 0.02 : -2,
      });
    }
  }
  return rows.sort((a, b) => b.score - a.score);
}

export interface SeasonVerdict {
  record: string;
  points: number;
  rank: number;
  divisionRank: number;
  playoffResult: string;
  ownerSatisfaction: number;
  fanMood: number;
  attendance: number;
  fill: number;
  grade: Grade;
  verdict: string;
}

/** One line of the franchise history. */
export interface SeasonRecord {
  label: string;
  record: string;
  points: number;
  rank: number;
  playoffResult: string;
  grade: Grade;
  champion: string | null;
}

export function seasonRecord(league: League, regular: SeasonState, po: PlayoffState | null): SeasonRecord {
  const v = seasonVerdict(league, regular, po);
  return { label: league.config.seasonLabel, record: v.record, points: v.points, rank: v.rank, playoffResult: v.playoffResult, grade: v.grade, champion: po?.champion ?? null };
}

export function seasonVerdict(league: League, regular: SeasonState, po: PlayoffState | null): SeasonVerdict {
  const table = standings(league, regular);
  const row = table.find((r) => r.teamId === EXPANSION_TEAM_ID)!;
  const me = league.teams.find((t) => t.id === EXPANSION_TEAM_ID)!;
  const div = league.divisions.find((d) => d.teamIds.includes(EXPANSION_TEAM_ID));
  const divisionRank = table.filter((r) => div?.teamIds.includes(r.teamId)).findIndex((r) => r.teamId === EXPANSION_TEAM_ID) + 1;
  let playoffResult = 'Playoffs verpasst';
  if (po) {
    const s = seriesOf(po, EXPANSION_TEAM_ID);
    if (s) {
      if (po.champion === EXPANSION_TEAM_ID) playoffResult = 'Meister!';
      else if (s.winner && s.winner !== EXPANSION_TEAM_ID) playoffResult = `Aus in der ${ROUND_NAMES[s.round]}`;
      else playoffResult = `${ROUND_NAMES[s.round]} erreicht`;
    }
  }
  const meta = (po?.season ?? regular).meta;
  const att = averageAttendance(league, meta);
  const owner = Math.round(meta.ownerSatisfaction);
  const grade: Grade = owner >= 80 ? 'A' : owner >= 65 ? 'B' : owner >= 50 ? 'C' : owner >= 35 ? 'D' : 'F';
  const mandate = league.franchise?.mandate;
  const verdict =
    grade === 'A'
      ? `Der Owner ist begeistert. ${me.city} hat einen GM gefunden, der liefert.`
      : grade === 'B'
        ? 'Der Owner ist zufrieden – das Fundament steht.'
        : grade === 'C'
          ? mandate === 'playoffsNow'
            ? 'Der Owner hatte sich mehr erhofft. Nächstes Jahr muss es aufwärts gehen.'
            : 'Durchwachsen, aber im Rahmen der Erwartungen für ein Expansionsteam.'
          : grade === 'D'
            ? 'Der Owner ist enttäuscht. Dein Stuhl wackelt.'
            : 'Der Owner zieht Konsequenzen in Erwägung. Das Mandat wurde klar verfehlt.';
  return {
    record: `${row.w}-${row.l}-${row.otl}`,
    points: row.pts,
    rank: table.findIndex((r) => r.teamId === EXPANSION_TEAM_ID) + 1,
    divisionRank,
    playoffResult,
    ownerSatisfaction: owner,
    fanMood: Math.round(meta.fanMood),
    attendance: att.avg,
    fill: att.fill,
    grade,
    verdict,
  };
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-win', name: 'Geschichte geschrieben', description: 'Gewinne das erste Spiel der Franchise-Geschichte.' },
  { id: 'draft-a', name: 'Draft-Genie', description: 'Erhalte im Expansion Draft die Gesamtnote A.' },
  { id: 'dealmaker', name: 'Hinterzimmer-Diplomat', description: 'Nimm mindestens zwei Side Deals an.' },
  { id: 'negotiator', name: 'Verhandlungsprofi', description: 'Verpflichte zwei Spieler im exklusiven Verhandlungsfenster.' },
  { id: 'trader', name: 'Telefonjoker', description: 'Schließe drei Trades ab.' },
  { id: 'hattrick', name: 'Hutregen', description: 'Ein Spieler deines Teams erzielt einen Hattrick.' },
  { id: 'shutout', name: 'Die Mauer', description: 'Dein Goalie feiert einen Shutout.' },
  { id: 'streak', name: 'Heißer Lauf', description: 'Gewinne fünf Spiele in Folge.' },
  { id: 'winning', name: 'Positive Bilanz', description: 'Beende die reguläre Saison mit mehr Siegen als Niederlagen (inkl. OT).' },
  { id: 'ninety', name: '90 Punkte', description: 'Hole mindestens 90 Punkte in der regulären Saison.' },
  { id: 'playoffs', name: 'Postseason', description: 'Erreiche im ersten Jahr die Playoffs.' },
  { id: 'series', name: 'Serie gewonnen', description: 'Gewinne eine Playoff-Serie.' },
  { id: 'final', name: 'Das Wunder', description: 'Erreiche das Finale.' },
  { id: 'champion', name: 'Unsterblich', description: 'Gewinne die Meisterschaft im ersten Jahr.' },
  { id: 'sellout', name: 'Ausverkauft', description: 'Durchschnittlich mindestens 98 % Auslastung.' },
  { id: 'owner', name: 'Owner-Liebling', description: 'Beende die Saison mit mindestens 80 % Owner-Zufriedenheit.' },
  { id: 'scoring-champ', name: 'Scoring-Champion', description: 'Ein Spieler deines Teams gewinnt den Golden Stick.' },
  { id: 'budget-playoffs', name: 'Moneyball', description: 'Playoffs mit einer Payroll unter 85 % des Caps.' },
];

export interface AchievementContext {
  league: League;
  draft: ExpansionDraftState | null;
  off: OffseasonState | null;
  regular: SeasonState;
  po: PlayoffState | null;
}

export function evaluateAchievements(ctx: AchievementContext): string[] {
  const { league, draft, off, regular, po } = ctx;
  const got = new Set<string>();
  const mine = Object.values(regular.results).filter((r) => r.home === EXPANSION_TEAM_ID || r.away === EXPANSION_TEAM_ID).sort((a, b) => a.day - b.day);
  const won = (r: (typeof mine)[number]) => (r.home === EXPANSION_TEAM_ID ? r.homeGoals > r.awayGoals : r.awayGoals > r.homeGoals);
  if (mine.some(won)) got.add('first-win');
  let run = 0;
  for (const r of mine) {
    run = won(r) ? run + 1 : 0;
    if (run >= 5) got.add('streak');
  }
  if (draft?.grades?.overall === 'A') got.add('draft-a');
  if ((draft?.deals.filter((d) => d.status === 'accepted').length ?? 0) >= 2) got.add('dealmaker');
  if (Object.keys(draft?.signings ?? {}).length >= 2) got.add('negotiator');
  if ((off?.trades.length ?? 0) >= 3) got.add('trader');
  const boxes = [...Object.values(regular.boxes), ...Object.values(po?.season.boxes ?? {})];
  for (const b of boxes) {
    const goals: Record<string, number> = {};
    for (const e of b.events) if (e.type === 'goal' && e.teamId === EXPANSION_TEAM_ID) goals[e.playerId] = (goals[e.playerId] ?? 0) + 1;
    if (Object.values(goals).some((g) => g >= 3)) got.add('hattrick');
    const opp = b.home === EXPANSION_TEAM_ID ? b.away : b.home;
    if (b.winner === EXPANSION_TEAM_ID && b.teams[opp]?.goals === 0) got.add('shutout');
  }
  const row = standings(league, regular).find((r) => r.teamId === EXPANSION_TEAM_ID);
  if (row && row.w > row.l + row.otl) got.add('winning');
  if (row && row.pts >= 90) got.add('ninety');
  if (po) {
    const s = seriesOf(po, EXPANSION_TEAM_ID);
    if (s) {
      got.add('playoffs');
      if (s.round > 0 || s.winner === EXPANSION_TEAM_ID) got.add('series');
      if (s.round === 3) got.add('final');
      if (po.champion === EXPANSION_TEAM_ID && isInauguralSeason(league)) got.add('champion');
      const pay = playersOfTeam(league, EXPANSION_TEAM_ID).reduce((a, p) => a + (!p.farm && p.contract && p.contract.yearsLeft >= 1 ? p.contract.capHit : 0), 0);
      if (pay < league.config.salaryCap * 0.85) got.add('budget-playoffs');
    }
  }
  const meta = (po?.season ?? regular).meta;
  if (averageAttendance(league, meta).fill >= 0.98) got.add('sellout');
  if (meta.ownerSatisfaction >= 80) got.add('owner');
  const top = skaterTable(league, regular)[0];
  if (top && top.teamId === EXPANSION_TEAM_ID) got.add('scoring-champ');
  return ACHIEVEMENTS.filter((a) => got.has(a.id)).map((a) => a.id);
}
