import { useMemo } from 'react';
import {
  ACHIEVEMENTS,
  EXPANSION_TEAM_ID,
  computeAwards,
  draftReview,
  evaluateAchievements,
  seasonVerdict,
} from '../../engine';
import { useGame } from '../../store/game';
import { MANDATES } from '../text';
import { Logo } from '../components/Logo';
import { Button, GradeBadge, Panel } from '../components/ui';

export function SummaryScreen() {
  const { offLeague, season, playoffs, draft, off, openPlayer, newGame, reset, seed } = useGame();
  const data = useMemo(() => {
    if (!offLeague || !season) return null;
    return {
      verdict: seasonVerdict(offLeague, season, playoffs),
      awards: computeAwards(offLeague, season),
      review: draft ? draftReview(offLeague, draft, season) : [],
      achievements: evaluateAchievements({ league: offLeague, draft, off, regular: season, po: playoffs }),
    };
  }, [offLeague, season, playoffs, draft, off]);
  if (!offLeague || !season || !data) return null;
  const me = offLeague.teams.find((t) => t.id === EXPANSION_TEAM_ID)!;
  const v = data.verdict;
  const team = (id: string | null) => offLeague.teams.find((t) => t.id === id);
  const mandate = MANDATES.find((m) => m.id === offLeague.franchise?.mandate);
  const best = data.review.slice(0, 3);
  const worst = [...data.review].reverse().slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5">
        <Logo spec={me.logo} size={80} />
        <div className="flex-1">
          <div className="text-xs uppercase tracking-[0.25em] text-ice-300">Saisonbilanz {offLeague.config.seasonLabel}</div>
          <h1 className="text-3xl font-black text-white">
            {me.city} {me.name}
          </h1>
          <p className="text-slate-300">
            {v.record} · {v.points} Punkte · Platz {v.divisionRank} in der Division, {v.rank}. der Liga · <b>{v.playoffResult}</b>
          </p>
        </div>
        <div className="text-center">
          <GradeBadge grade={v.grade} size="xl" />
          <div className="mt-1 text-xs text-slate-400">Owner-Note</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel title={`Owner-Urteil · Mandat „${mandate?.label ?? ''}“`} className="md:col-span-2">
          <div className="space-y-3 p-4">
            <p className="text-lg text-slate-100">„{v.verdict}“</p>
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[
                ['Owner', `${v.ownerSatisfaction}/100`],
                ['Fans', `${v.fanMood}/100`],
                ['Zuschauer', v.attendance ? v.attendance.toLocaleString('de-DE') : '–'],
                ['Auslastung', `${Math.round(v.fill * 100)} %`],
              ].map(([l, x]) => (
                <div key={l} className="rounded bg-coal-850 p-2">
                  <dt className="text-[11px] text-slate-500">{l}</dt>
                  <dd className="font-mono text-slate-100">{x}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>
        <Panel title="Expansion Draft im Rückblick">
          <div className="space-y-3 p-4 text-sm">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Beste Picks</div>
              {best.map((r) => (
                <button key={r.playerId} type="button" onClick={() => openPlayer(r.playerId)} className="flex w-full justify-between gap-2 text-left hover:text-ice-300">
                  <span className="truncate">
                    {r.name} <span className="text-xs text-slate-500">({team(r.fromTeamId)?.abbrev})</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{r.line}</span>
                </button>
              ))}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-rose-300">Enttäuschungen</div>
              {worst.map((r) => (
                <button key={r.playerId} type="button" onClick={() => openPlayer(r.playerId)} className="flex w-full justify-between gap-2 text-left hover:text-ice-300">
                  <span className="truncate">
                    {r.name} <span className="text-xs text-slate-500">({team(r.fromTeamId)?.abbrev})</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{r.line}</span>
                </button>
              ))}
            </div>
            {draft?.grades && <p className="text-xs text-slate-500">Draft-Note am Draft-Abend: {draft.grades.overall}</p>}
          </div>
        </Panel>
      </div>

      <Panel title="Awards">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.awards.map((a) => {
            const t = team(a.teamId);
            const p = a.playerId ? offLeague.players[a.playerId] : null;
            return (
              <div key={a.id} className={`rounded-xl border p-3 ${a.teamId === EXPANSION_TEAM_ID ? 'border-amber-400/60 bg-amber-500/10' : 'border-coal-700 bg-coal-850'}`}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">🏆 {a.name}</div>
                <div className="text-xs text-slate-500">{a.description}</div>
                <button type="button" onClick={() => a.playerId && openPlayer(a.playerId)} className="mt-2 flex items-center gap-2 text-left">
                  {t && <Logo spec={t.logo} size={22} />}
                  <span>
                    <span className="block font-semibold text-slate-100">{p ? `${p.firstName} ${p.lastName}` : '–'}</span>
                    <span className="block text-xs text-slate-400">{a.value}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title={`Achievements (${data.achievements.length}/${ACHIEVEMENTS.length})`}>
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((a) => {
            const got = data.achievements.includes(a.id);
            return (
              <div key={a.id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${got ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-coal-700 opacity-50'}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${got ? 'bg-emerald-400 text-coal-950' : 'bg-coal-700 text-slate-500'}`}>{got ? '✓' : '?'}</span>
                <div>
                  <div className="text-sm font-semibold text-slate-100">{a.name}</div>
                  <div className="text-xs text-slate-400">{a.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Wie geht es weiter?">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <p className="flex-1 text-sm text-slate-400">
            Die erste Saison ist Geschichte. Starte neu – mit demselben Seed (gleiche Liga, gleiche Startbedingungen) oder mit einer ganz neuen Liga.
          </p>
          <Button variant="ghost" onClick={() => newGame(seed, offLeague.config.rules, offLeague.config.difficulty)}>
            Neustart mit gleichem Seed
          </Button>
          <Button onClick={reset}>Neue Liga</Button>
        </div>
      </Panel>
    </div>
  );
}
