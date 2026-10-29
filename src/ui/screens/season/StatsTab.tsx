import { useMemo, useState } from 'react';
import { EXPANSION_TEAM_ID, goalieTable, skaterTable, standings } from '../../../engine';
import { useGame } from '../../../store/game';
import { Panel } from '../../components/ui';

type View = 'skaters' | 'goalies' | 'teams';

export function StatsTab() {
  const { offLeague, season, openPlayer } = useGame();
  const [view, setView] = useState<View>('skaters');
  // 'all' or a team id: the stats of every club can be looked at.
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [sort, setSort] = useState<'p' | 'g' | 'a' | 'pm' | 'pim' | 'sog'>('p');
  const skaters = useMemo(() => (offLeague && season ? skaterTable(offLeague, season) : []), [offLeague, season]);
  const goalies = useMemo(() => (offLeague && season ? goalieTable(offLeague, season) : []), [offLeague, season]);
  const table = useMemo(() => (offLeague && season ? standings(offLeague, season) : []), [offLeague, season]);
  if (!offLeague || !season) return null;
  const abbr = (id: string | null) => offLeague.teams.find((t) => t.id === id)?.abbrev ?? '–';
  const mine = (id: string | null) => id === EXPANSION_TEAM_ID;
  const all = teamFilter === 'all';
  const sk = skaters
    .filter((r) => all || r.teamId === teamFilter)
    .sort((a, b) => b[sort] - a[sort] || b.p - a.p)
    .slice(0, all ? 60 : undefined);
  const minGp = Math.max(1, Math.floor(Object.keys(season.results).length / offLeague.teams.length / 4));
  const gs = goalies
    .filter((r) => (all ? r.gp >= minGp : r.teamId === teamFilter))
    .sort((a, b) => b.svPct - a.svPct)
    .slice(0, all ? 40 : undefined);
  const teamOptions = [...offLeague.teams].sort((a, b) => Number(mine(b.id)) - Number(mine(a.id)) || a.city.localeCompare(b.city));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['skaters', 'Scorer'],
            ['goalies', 'Goalies'],
            ['teams', 'Teams'],
          ] as [View, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={`rounded-md px-3 py-1 text-sm ${view === id ? 'bg-ice-500/20 text-ice-200' : 'text-slate-400 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
        {view !== 'teams' && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="ml-2 rounded-md border border-coal-600 bg-coal-850 px-2 py-1 text-xs text-slate-200"
            aria-label="Team auswählen"
          >
            <option value="all">Alle Teams</option>
            {teamOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.city} {t.name}
                {mine(t.id) ? ' (mein Team)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {view === 'skaters' && (
        <Panel>
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm tabular">
              <thead className="sticky top-0 bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Spieler</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2 text-right">GP</th>
                  {(['g', 'a', 'p', 'pm', 'pim', 'sog'] as const).map((k) => (
                    <th key={k} className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setSort(k)} className={sort === k ? 'text-ice-300' : 'hover:text-slate-200'}>
                        {{ g: 'G', a: 'A', p: 'P', pm: '+/-', pim: 'PIM', sog: 'SOG' }[k]}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-coal-800">
                {sk.map((r, i) => (
                  <tr key={r.playerId} className={mine(r.teamId) ? 'bg-ice-500/10' : ''}>
                    <td className="px-3 py-1 font-mono text-slate-500">{i + 1}</td>
                    <td className="px-3">
                      <button type="button" className="hover:text-ice-300" onClick={() => openPlayer(r.playerId)}>
                        {r.name}
                      </button>
                    </td>
                    <td className="px-3 font-mono text-xs">{abbr(r.teamId)}</td>
                    <td className="px-3 font-mono text-xs">{r.position}</td>
                    <td className="px-3 text-right font-mono">{r.gp}</td>
                    <td className="px-3 text-right font-mono">{r.g}</td>
                    <td className="px-3 text-right font-mono">{r.a}</td>
                    <td className="px-3 text-right font-mono font-bold text-white">{r.p}</td>
                    <td className="px-3 text-right font-mono">{r.pm > 0 ? `+${r.pm}` : r.pm}</td>
                    <td className="px-3 text-right font-mono">{r.pim}</td>
                    <td className="px-3 text-right font-mono">{r.sog}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {view === 'goalies' && (
        <Panel title={all ? `Goalies (min. ${minGp} Spiele)` : 'Goalies'}>
          <table className="w-full text-sm tabular">
            <thead className="bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                {['Goalie', 'Team', 'GP', 'W', 'L', 'OTL', 'SV%', 'GAA', 'SO'].map((h) => (
                  <th key={h} className="px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-coal-800">
              {gs.map((r) => (
                <tr key={r.playerId} className={mine(r.teamId) ? 'bg-ice-500/10' : ''}>
                  <td className="px-3 py-1">
                    <button type="button" className="hover:text-ice-300" onClick={() => openPlayer(r.playerId)}>
                      {r.name}
                    </button>
                  </td>
                  <td className="px-3 font-mono text-xs">{abbr(r.teamId)}</td>
                  <td className="px-3 font-mono">{r.gp}</td>
                  <td className="px-3 font-mono">{r.w}</td>
                  <td className="px-3 font-mono">{r.l}</td>
                  <td className="px-3 font-mono">{r.otl}</td>
                  <td className="px-3 font-mono font-bold text-white">{r.svPct.toFixed(3).replace(/^0/, '')}</td>
                  <td className="px-3 font-mono">{r.gaa.toFixed(2)}</td>
                  <td className="px-3 font-mono">{r.so}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {view === 'teams' && (
        <Panel>
          <table className="w-full text-sm tabular">
            <thead className="bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                {['Team', 'GF/G', 'GA/G', 'PP%', 'PK%', 'SF/G', 'SA/G'].map((h) => (
                  <th key={h} className="px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-coal-800">
              {table.map((r) => {
                const ts = season.teamStats[r.teamId]!;
                const gp = r.gp || 1;
                return (
                  <tr key={r.teamId} className={mine(r.teamId) ? 'bg-ice-500/10' : ''}>
                    <td className="px-3 py-1">{offLeague.teams.find((t) => t.id === r.teamId)?.city}</td>
                    <td className="px-3 font-mono">{(r.gf / gp).toFixed(2)}</td>
                    <td className="px-3 font-mono">{(r.ga / gp).toFixed(2)}</td>
                    <td className="px-3 font-mono">{ts.ppOpp ? ((ts.ppGoals / ts.ppOpp) * 100).toFixed(1) : '–'}</td>
                    <td className="px-3 font-mono">{ts.pkOpp ? (100 - (ts.pkGa / ts.pkOpp) * 100).toFixed(1) : '–'}</td>
                    <td className="px-3 font-mono">{(ts.shotsFor / gp).toFixed(1)}</td>
                    <td className="px-3 font-mono">{(ts.shotsAgainst / gp).toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
