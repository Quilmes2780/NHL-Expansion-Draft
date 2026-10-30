import { useMemo, useState } from 'react';
import type { SeasonState } from '../../../engine';
import { EXPANSION_TEAM_ID, goalieTable, isRookie, skaterTable, standings } from '../../../engine';
import { useGame } from '../../../store/game';
import { Panel } from '../../components/ui';

type View = 'skaters' | 'goalies' | 'teams';
type SkaterSort = 'p' | 'g' | 'a' | 'pm' | 'pim' | 'sog' | 'gp';
type GoalieSort = 'svPct' | 'gaa' | 'gp' | 'w' | 'so';

/** Player and team stats; `state` defaults to the regular season, the playoffs pass their own state. */
export function StatsTab({ state, playoffs = false }: { state?: SeasonState | null; playoffs?: boolean }) {
  const { offLeague, season: regular, openPlayer } = useGame();
  const season = state ?? regular;
  const [view, setView] = useState<View>('skaters');
  // 'all' or a team id: the stats of every club can be looked at.
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [rookies, setRookies] = useState(false);
  const [sort, setSort] = useState<SkaterSort>('p');
  const [gSort, setGSort] = useState<GoalieSort>('svPct');
  const skaters = useMemo(() => (offLeague && season ? skaterTable(offLeague, season) : []), [offLeague, season]);
  const goalies = useMemo(() => (offLeague && season ? goalieTable(offLeague, season) : []), [offLeague, season]);
  const table = useMemo(() => (offLeague && season && !playoffs ? standings(offLeague, season) : []), [offLeague, season, playoffs]);
  if (!offLeague || !season) return null;
  const abbr = (id: string | null) => offLeague.teams.find((t) => t.id === id)?.abbrev ?? '–';
  const mine = (id: string | null) => id === EXPANSION_TEAM_ID;
  const all = teamFilter === 'all';
  const rookieOk = (id: string) => !rookies || (!!offLeague.players[id] && isRookie(offLeague.players[id]));
  const sk = skaters
    .filter((r) => (all || r.teamId === teamFilter) && rookieOk(r.playerId))
    .sort((a, b) => b[sort] - a[sort] || b.p - a.p)
    .slice(0, all ? 60 : undefined);
  // Save percentage needs a minimum workload to mean anything (not for team views or the short playoffs).
  const minGp = playoffs ? 1 : Math.max(1, Math.floor(Object.keys(season.results).length / offLeague.teams.length / 4));
  const gs = goalies
    .filter((r) => (all ? r.gp >= minGp : r.teamId === teamFilter) && rookieOk(r.playerId))
    .sort((a, b) => (gSort === 'gaa' ? a.gaa - b.gaa : b[gSort] - a[gSort]) || b.svPct - a.svPct)
    .slice(0, all ? 40 : undefined);
  const teamOptions = [...offLeague.teams].sort((a, b) => Number(mine(b.id)) - Number(mine(a.id)) || a.city.localeCompare(b.city));
  const views: [View, string][] = [
    ['skaters', 'Scorer'],
    ['goalies', 'Goalies'],
  ];
  if (!playoffs) views.push(['teams', 'Teams']);
  const sortHead = <K extends string>(k: K, label: string, cur: K, setCur: (k: K) => void) => (
    <th key={k} className="px-3 py-2 text-right">
      <button type="button" onClick={() => setCur(k)} className={cur === k ? 'text-ice-300' : 'hover:text-slate-200'}>
        {label}
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {views.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={`rounded-md px-3 py-1 text-sm ${view === id ? 'bg-ice-500/20 text-ice-200' : 'text-slate-400 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
        {view !== 'teams' && (
          <>
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
            <label className="flex items-center gap-1.5 text-xs text-slate-300" title="Höchstens 26 Jahre alt und vor dieser Saison weniger als 25 NHL-Spiele">
              <input type="checkbox" checked={rookies} onChange={(e) => setRookies(e.target.checked)} /> nur Rookies
            </label>
          </>
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
                  {sortHead('gp', 'GP', sort, setSort)}
                  {(['g', 'a', 'p', 'pm', 'pim', 'sog'] as const).map((k) => sortHead(k, { g: 'G', a: 'A', p: 'P', pm: '+/-', pim: 'PIM', sog: 'SOG' }[k], sort, setSort))}
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
                {!sk.length && (
                  <tr>
                    <td colSpan={11} className="px-3 py-4 text-center text-slate-500">
                      Noch keine Einträge.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {view === 'goalies' && (
        <Panel title={all && minGp > 1 ? `Goalies (min. ${minGp} Spiele)` : 'Goalies'}>
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm tabular">
              <thead className="sticky top-0 bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">Goalie</th>
                  <th className="px-3 py-2">Team</th>
                  {sortHead('gp', 'GP', gSort, setGSort)}
                  {sortHead('w', 'W', gSort, setGSort)}
                  <th className="px-3 py-2 text-right">L</th>
                  <th className="px-3 py-2 text-right">OTL</th>
                  {sortHead('svPct', 'SV%', gSort, setGSort)}
                  {sortHead('gaa', 'GAA', gSort, setGSort)}
                  {sortHead('so', 'SO', gSort, setGSort)}
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
                    <td className="px-3 text-right font-mono">{r.gp}</td>
                    <td className="px-3 text-right font-mono">{r.w}</td>
                    <td className="px-3 text-right font-mono">{r.l}</td>
                    <td className="px-3 text-right font-mono">{r.otl}</td>
                    <td className="px-3 text-right font-mono font-bold text-white">{r.svPct.toFixed(3).replace(/^0/, '')}</td>
                    <td className="px-3 text-right font-mono">{r.gaa.toFixed(2)}</td>
                    <td className="px-3 text-right font-mono">{r.so}</td>
                  </tr>
                ))}
                {!gs.length && (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-center text-slate-500">
                      Noch keine Einträge.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
