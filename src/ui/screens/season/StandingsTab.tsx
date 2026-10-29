import { useMemo, useState } from 'react';
import type { StandingRow } from '../../../engine';
import { EXPANSION_TEAM_ID, standings, wildcardStandings } from '../../../engine';
import { useGame } from '../../../store/game';
import { Logo } from '../../components/Logo';
import { Panel, Tip } from '../../components/ui';

type View = 'division' | 'wildcard' | 'conference' | 'league';

export function StandingsTab() {
  const { offLeague, season } = useGame();
  const [view, setView] = useState<View>('division');
  const all = useMemo(() => (offLeague && season ? standings(offLeague, season) : []), [offLeague, season]);
  const wc = useMemo(() => (offLeague && season ? wildcardStandings(offLeague, season) : []), [offLeague, season]);
  if (!offLeague || !season) return null;
  const team = (id: string) => offLeague.teams.find((t) => t.id === id);

  const Table = ({ rows, title, cut }: { rows: StandingRow[]; title: string; cut?: number }) => (
    <Panel title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular [&_td]:whitespace-nowrap">
          <thead className="bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-2 py-1.5">#</th>
              <th className="px-2 py-1.5">Team</th>
              {['GP', 'W', 'L', 'OTL', 'PTS', 'P%', 'ROW', 'GF', 'GA', 'DIFF', 'L10', 'Serie'].map((h) => (
                <th key={h} className="px-2 py-1.5 text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-coal-800">
            {rows.map((r, i) => {
              const t = team(r.teamId);
              const mine = r.teamId === EXPANSION_TEAM_ID;
              return (
                <tr key={r.teamId} className={`${mine ? 'bg-ice-500/10 font-semibold' : ''} ${cut !== undefined && i === cut ? 'border-t-2 border-t-ice-400/60' : ''}`}>
                  <td className="px-2 py-1 font-mono text-slate-500">{i + 1}</td>
                  <td className="px-2">
                    <span className="inline-flex items-center gap-1.5">
                      {t && <Logo spec={t.logo} size={16} />}
                      <span className="text-slate-100">{t?.city}</span>
                    </span>
                  </td>
                  <td className="px-2 text-right font-mono">{r.gp}</td>
                  <td className="px-2 text-right font-mono">{r.w}</td>
                  <td className="px-2 text-right font-mono">{r.l}</td>
                  <td className="px-2 text-right font-mono">{r.otl}</td>
                  <td className="px-2 text-right font-mono font-bold text-white">{r.pts}</td>
                  <td className="px-2 text-right font-mono text-slate-400">{r.pointsPct.toFixed(3).replace(/^0/, '')}</td>
                  <td className="px-2 text-right font-mono">{r.row}</td>
                  <td className="px-2 text-right font-mono">{r.gf}</td>
                  <td className="px-2 text-right font-mono">{r.ga}</td>
                  <td className={`px-2 text-right font-mono ${r.diff > 0 ? 'text-emerald-300' : r.diff < 0 ? 'text-rose-300' : ''}`}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                  <td className="px-2 text-right font-mono text-slate-400">{r.last10}</td>
                  <td className="px-2 text-right font-mono text-slate-400">{r.streak}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );

  const confs = [...new Set(offLeague.divisions.map((d) => d.conference))];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['division', 'Divisionen'],
            ['wildcard', 'Wildcard'],
            ['conference', 'Conferences'],
            ['league', 'Liga'],
          ] as [View, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={`rounded-md px-3 py-1 text-sm ${view === id ? 'bg-ice-500/20 text-ice-200' : 'text-slate-400 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
        <Tip text="Sortierung: Punkte, Punktequote, ROW (Siege ohne Shootout), Tordifferenz, erzielte Tore. Playoffs: die Top 3 jeder Division plus 2 Wildcards je Conference." />
      </div>
      {view === 'division' && (
        <div className="grid gap-4 xl:grid-cols-2">
          {offLeague.divisions.map((d) => (
            <Table key={d.name} title={`${d.name} Division · ${d.conference}`} rows={all.filter((r) => d.teamIds.includes(r.teamId))} cut={3} />
          ))}
        </div>
      )}
      {view === 'wildcard' && (
        <div className="grid gap-4 xl:grid-cols-2">
          {wc.map((c) => (
            <div key={c.conference} className="space-y-3">
              {c.divisions.map((d) => (
                <Table key={d.name} title={`${d.name} – Top 3`} rows={d.top} />
              ))}
              <Table title={`${c.conference} – Wildcard`} rows={[...c.wildcards, ...c.rest]} cut={2} />
            </div>
          ))}
        </div>
      )}
      {view === 'conference' && (
        <div className="grid gap-4 xl:grid-cols-2">
          {confs.map((c) => (
            <Table key={c} title={`${c} Conference`} rows={all.filter((r) => team(r.teamId)?.conference === c)} />
          ))}
        </div>
      )}
      {view === 'league' && <Table title="Liga" rows={all} />}
    </div>
  );
}
