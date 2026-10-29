import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { Player, ScoutView } from '../../engine';
import {
  GOALIE_ATTRS,
  SKATER_ATTRS,
  blockedPlayers,
  canScout,
  effectiveLeague,
  formatMoney,
  formatMoneyShort,
  formatRange,
  fullName,
  groupOf,
  isPendingRfa,
  isPendingUfa,
  rangeMid,
  scoutLevel,
  scoutView,
  teamLock,
} from '../../engine';
import { useGame } from '../../store/game';
import { ATTR_LABEL, RULE_TIPS, contractLabel } from '../text';
import { ConstraintTracker } from '../components/ConstraintTracker';
import { Logo } from '../components/Logo';
import { Badge, Button, Panel, RangeBar, ScoutDots, Tip } from '../components/ui';

type SortKey = 'name' | 'team' | 'pos' | 'age' | 'ovr' | 'pot' | 'cap' | 'years' | 'gp';
type Tab = 'pool' | 'mine' | 'compare';

interface Row {
  p: Player;
  teamId: string;
  view: ScoutView;
}

export function DraftBoard() {
  const { league: baseLeague, draft, select, toggleWish, toggleCompare, compare, openPlayer, scout, goto } = useGame();
  // Contracts signed in the negotiation window replace the old (expiring) ones.
  const league = useMemo(() => (baseLeague && draft ? effectiveLeague(baseLeague, draft) : baseLeague), [baseLeague, draft]);
  const blocked = useMemo(() => (draft ? blockedPlayers(draft) : new Set<string>()), [draft]);
  const [tab, setTab] = useState<Tab>('pool');
  const [team, setTeam] = useState<string>('all');
  const [group, setGroup] = useState<'all' | 'F' | 'D' | 'G'>('all');
  const [contract, setContract] = useState<'all' | 'signed' | 'rfa' | 'ufa'>('all');
  const [maxAge, setMaxAge] = useState(40);
  const [search, setSearch] = useState('');
  const [onlyWish, setOnlyWish] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'ovr', dir: -1 });

  const rows: Row[] = useMemo(() => {
    if (!league || !draft) return [];
    const out: Row[] = [];
    for (const [teamId, list] of Object.entries(draft.protections)) {
      for (const id of list.exposedIds) {
        const p = league.players[id] as Player;
        out.push({ p, teamId, view: scoutView(league.seed, p, scoutLevel(draft, id), !!draft.grades) });
      }
    }
    return out;
  }, [league, draft]);

  if (!league || !draft) return null;
  const locked = !!draft.grades;
  const teamOf = (id: string) => league.teams.find((t) => t.id === id);

  const filtered = rows.filter(({ p, teamId }) => {
    if (team !== 'all' && teamId !== team) return false;
    if (group !== 'all' && groupOf(p.position) !== group) return false;
    if (contract === 'signed' && !(p.contract && p.contract.yearsLeft >= 1)) return false;
    if (contract === 'rfa' && !isPendingRfa(p)) return false;
    if (contract === 'ufa' && !isPendingUfa(p)) return false;
    if (p.age > maxAge) return false;
    if (onlyWish && !draft.wishlist.includes(p.id)) return false;
    if (onlyOpen && draft.selection[teamId]) return false;
    if (search && !fullName(p).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const key = (r: Row): number | string => {
    switch (sort.key) {
      case 'name':
        return r.p.lastName;
      case 'team':
        return teamOf(r.teamId)?.abbrev ?? '';
      case 'pos':
        return 'C LW RW D G'.indexOf(r.p.position);
      case 'age':
        return r.p.age;
      case 'ovr':
        return rangeMid(r.view.ovr);
      case 'pot':
        return rangeMid(r.view.potential);
      case 'cap':
        return r.p.contract?.capHit ?? 0;
      case 'years':
        return r.p.contract?.yearsLeft ?? 0;
      case 'gp':
        return r.p.gpLastSeason;
    }
  };
  const sorted = [...filtered].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const c = typeof ka === 'string' ? ka.localeCompare(kb as string) : ka - (kb as number);
    return c * sort.dir || a.p.id.localeCompare(b.p.id);
  });

  const Th = ({ k, children, className = '' }: { k: SortKey; children: ReactNode; className?: string }) => (
    <th className={`whitespace-nowrap px-2 py-2 font-semibold ${className}`}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : k === 'name' || k === 'team' ? 1 : -1 }))}
        className={`inline-flex items-center gap-1 hover:text-ice-200 ${sort.key === k ? 'text-ice-300' : ''}`}
      >
        {children}
        {sort.key === k && <span>{sort.dir === 1 ? '▲' : '▼'}</span>}
      </button>
    </th>
  );

  const picksDone = Object.keys(draft.selection).length;
  const mine = Object.entries(draft.selection).map(([teamId, id]) => ({ teamId, p: league.players[id] as Player }));

  return (
    <div className="grid gap-4 lg:grid-cols-[180px_1fr] xl:grid-cols-[170px_1fr_300px] 2xl:grid-cols-[200px_1fr_330px]">
      {/* Team rail */}
      <Panel title={`Teams · ${picksDone}/${league.config.existingTeams}`} className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-auto">
        <div className="grid grid-cols-4 gap-1 p-2 sm:grid-cols-8 lg:grid-cols-1">
          <button
            type="button"
            onClick={() => setTeam('all')}
            className={`rounded px-2 py-1.5 text-left text-xs font-semibold ${team === 'all' ? 'bg-ice-500/15 text-ice-200' : 'text-slate-300 hover:bg-coal-800'}`}
          >
            Alle Teams
          </button>
          {league.teams
            .filter((t) => !t.isExpansion)
            .sort((a, b) => a.city.localeCompare(b.city))
            .map((t) => {
              const picked = draft.selection[t.id];
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTeam(t.id)}
                  className={`flex items-center gap-2 rounded px-1.5 py-1 text-left text-xs ${team === t.id ? 'bg-ice-500/15 text-ice-100' : 'text-slate-300 hover:bg-coal-800'}`}
                  title={`${t.city} ${t.name}`}
                >
                  <Logo spec={t.logo} size={18} />
                  <span className="flex-1 truncate">
                    <span className="font-mono">{t.abbrev}</span>
                    <span className="hidden text-slate-500 xl:inline"> · {t.city}</span>
                  </span>
                  {picked ? <span className="text-emerald-400">✓</span> : <span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />}
                </button>
              );
            })}
        </div>
      </Panel>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['pool', `Exponierte Spieler (${rows.length})`],
              ['mine', `Meine Auswahl (${picksDone}/${league.config.existingTeams})`],
              ['compare', `Vergleich (${compare.length}/3)`],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === id ? 'bg-coal-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto flex items-center text-xs text-slate-400">
            Spannen = Fog of War <Tip text={RULE_TIPS.fog} />
          </span>
        </div>

        {tab === 'pool' && (
          <Panel>
            <div className="flex flex-wrap items-center gap-2 border-b border-coal-700 p-3 text-sm">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Spieler suchen…"
                aria-label="Spieler suchen"
                className="w-44 rounded-md border border-coal-600 bg-coal-850 px-2.5 py-1.5 text-sm outline-none focus:border-ice-400"
              />
              <div className="flex overflow-hidden rounded-md border border-coal-600">
                {(['all', 'F', 'D', 'G'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGroup(g)} className={`px-2.5 py-1.5 text-xs font-semibold ${group === g ? 'bg-ice-500/20 text-ice-200' : 'text-slate-400 hover:bg-coal-800'}`}>
                    {g === 'all' ? 'Alle' : g}
                  </button>
                ))}
              </div>
              <select value={contract} onChange={(e) => setContract(e.target.value as typeof contract)} aria-label="Vertragsstatus" className="rounded-md border border-coal-600 bg-coal-850 px-2 py-1.5 text-xs">
                <option value="all">Alle Verträge</option>
                <option value="signed">Vertrag 2027-28</option>
                <option value="rfa">pending RFA</option>
                <option value="ufa">pending UFA</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                Alter ≤
                <input type="number" min={18} max={40} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value) || 40)} className="w-14 rounded border border-coal-600 bg-coal-850 px-1.5 py-1 font-mono" />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={onlyWish} onChange={(e) => setOnlyWish(e.target.checked)} /> Wunschliste
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Teams ohne Pick
              </label>
              <span className="ml-auto text-xs text-slate-500">{sorted.length} Spieler</span>
            </div>
            <div className="max-h-[calc(100vh-15rem)] overflow-auto">
              <table className="w-full text-sm tabular [&_td]:whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="w-8 px-2" aria-label="Wunschliste" />
                    <Th k="name">Spieler</Th>
                    <Th k="team">Team</Th>
                    <Th k="pos">Pos</Th>
                    <Th k="age">Alter</Th>
                    <Th k="ovr">OVR</Th>
                    <Th k="pot">POT</Th>
                    <Th k="cap" className="text-right">
                      Cap Hit
                    </Th>
                    <Th k="years">Vertrag</Th>
                    <Th k="gp" className="hidden 2xl:table-cell">
                      GP
                    </Th>
                    <th className="px-2 py-2 font-semibold">Scout</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-coal-800">
                  {sorted.map(({ p, teamId, view }) => {
                    const t = teamOf(teamId);
                    const chosen = draft.selection[teamId] === p.id;
                    const teamTaken = !!draft.selection[teamId] && !chosen;
                    const ufa = isPendingUfa(p);
                    const lvl = scoutLevel(draft, p.id);
                    const lock = teamLock(draft, teamId);
                    const signed = !!draft.signings[p.id];
                    return (
                      <tr key={p.id} className={`${chosen ? 'bg-ice-500/10' : teamTaken ? 'opacity-55' : ''} hover:bg-coal-800/70`}>
                        <td className="px-2">
                          <button type="button" onClick={() => toggleWish(p.id)} aria-label="Wunschliste umschalten" className={draft.wishlist.includes(p.id) ? 'text-amber-300' : 'text-slate-600 hover:text-slate-300'}>
                            ★
                          </button>
                        </td>
                        <td className="max-w-[200px] px-2 py-1.5">
                          <button type="button" onClick={() => openPlayer(p.id)} className="truncate text-left font-medium text-slate-100 hover:text-ice-300">
                            {fullName(p)}
                          </button>
                          <span className="ml-1.5 inline-flex gap-1 align-middle">
                            {p.contract?.ntc && <Badge title="No-Trade-Clause">NTC</Badge>}
                            {p.injury && <Badge tone="rose" title={p.injury.description}>verl.</Badge>}
                          </span>
                        </td>
                        <td className="px-2">
                          <span className="inline-flex items-center gap-1.5">
                            {t && <Logo spec={t.logo} size={16} />}
                            <span className="font-mono text-xs text-slate-300">{t?.abbrev}</span>
                          </span>
                        </td>
                        <td className="px-2 font-mono text-xs text-slate-300">{p.position}</td>
                        <td className="px-2 text-slate-300">{p.age}</td>
                        <td className="px-2">
                          <span className="font-mono font-semibold text-slate-100">{formatRange(view.ovr)}</span>
                        </td>
                        <td className="px-2 font-mono text-slate-400">{formatRange(view.potential)}</td>
                        <td className="px-2 text-right font-mono text-slate-200">{p.contract ? formatMoneyShort(p.contract.capHit) : '–'}</td>
                        <td className="whitespace-nowrap px-2 text-xs">
                          {ufa ? (
                            <Badge tone="amber" title={RULE_TIPS.pendingUfa}>
                              pending UFA
                            </Badge>
                          ) : isPendingRfa(p) ? (
                            <Badge tone="violet" title={RULE_TIPS.pendingRfa}>
                              pending RFA
                            </Badge>
                          ) : (
                            <span className="text-slate-300">
                              {signed && (
                                <Badge tone="emerald" title="Im Verhandlungsfenster unterschrieben">
                                  neu
                                </Badge>
                              )}{' '}
                              {contractLabel(p)}
                            </span>
                          )}
                        </td>
                        <td className="hidden px-2 font-mono text-xs text-slate-400 2xl:table-cell" title={`Letzte 2 Saisons: ${p.gpLastTwo}`}>
                          {p.gpLastSeason}
                        </td>
                        <td className="px-2">
                          <span className="inline-flex items-center gap-1.5">
                            <ScoutDots level={lvl} />
                            {!locked && (
                              <button type="button" disabled={!canScout(draft, p.id)} onClick={() => scout(p.id)} className="rounded px-1 text-xs text-ice-300 hover:bg-ice-500/15 disabled:opacity-30" aria-label="Scouten">
                                +
                              </button>
                            )}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-2 text-right">
                          <label className="mr-2 inline-flex items-center text-[11px] text-slate-500" title="Zum Vergleich">
                            <input type="checkbox" checked={compare.includes(p.id)} onChange={() => toggleCompare(p.id)} />
                          </label>
                          {chosen && lock ? (
                            <Badge tone="emerald" title={lock === 'signing' ? 'Unterschrift = Pick' : 'Bindender Side Deal'}>
                              🔒 {lock === 'signing' ? 'Unterschrift' : 'Deal'}
                            </Badge>
                          ) : blocked.has(p.id) ? (
                            <Badge tone="rose" title="Per Side Deal ausgeschlossen">
                              Deal: tabu
                            </Badge>
                          ) : lock ? (
                            <span className="text-[11px] text-slate-500">Team fixiert</span>
                          ) : ufa ? (
                            <button type="button" className="text-[11px] text-amber-300 hover:underline" title={RULE_TIPS.pendingUfa} onClick={() => goto('window')}>
                              Verhandeln →
                            </button>
                          ) : (
                            <Button
                              variant={chosen ? 'primary' : 'subtle'}
                              disabled={locked}
                              className="px-2.5 py-1 text-xs"
                              onClick={() => select(teamId, chosen ? null : p.id)}
                            >
                              {chosen ? 'Gewählt ✓' : teamTaken ? 'Ersetzen' : 'Wählen'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {tab === 'mine' && (
          <Panel>
            <table className="w-full text-sm tabular">
              <thead className="bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">Von</th>
                  <th className="px-3 py-2">Spieler</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Alter</th>
                  <th className="px-3 py-2">OVR</th>
                  <th className="px-3 py-2 text-right">Cap Hit</th>
                  <th className="px-3 py-2">Vertrag</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-coal-800">
                {(['F', 'D', 'G'] as const).flatMap((g) =>
                  mine
                    .filter(({ p }) => groupOf(p.position) === g)
                    .sort((a, b) => b.p.ovr - a.p.ovr)
                    .map(({ teamId, p }) => {
                      const t = teamOf(teamId);
                      const v = scoutView(league.seed, p, scoutLevel(draft, p.id), locked);
                      return (
                        <tr key={p.id}>
                          <td className="px-3 py-1.5">
                            <span className="inline-flex items-center gap-1.5">
                              {t && <Logo spec={t.logo} size={16} />}
                              <span className="font-mono text-xs">{t?.abbrev}</span>
                            </span>
                          </td>
                          <td className="px-3">
                            <button type="button" className="hover:text-ice-300" onClick={() => openPlayer(p.id)}>
                              {fullName(p)}
                            </button>
                          </td>
                          <td className="px-3 font-mono text-xs">{p.position}</td>
                          <td className="px-3">{p.age}</td>
                          <td className="px-3 font-mono">{formatRange(v.ovr)}</td>
                          <td className="px-3 text-right font-mono">{p.contract ? formatMoney(p.contract.capHit) : '–'}</td>
                          <td className="px-3 text-xs">{contractLabel(p)}</td>
                          <td className="px-3 text-right">
                            {teamLock(draft, teamId) ? (
                              <span className="text-xs text-emerald-300">🔒 {teamLock(draft, teamId) === 'signing' ? 'Unterschrift' : 'Deal'}</span>
                            ) : (
                              !locked && (
                                <button type="button" className="text-xs text-rose-300 hover:underline" onClick={() => select(teamId, null)}>
                                  entfernen
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    }),
                )}
                {mine.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      Noch keine Picks. Wähle von jedem Team genau einen exponierten Spieler.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        )}

        {tab === 'compare' && <ComparePanel />}
      </div>

      <div className="lg:col-span-2 xl:sticky xl:top-20 xl:col-span-1 xl:self-start">
        <ConstraintTracker />
      </div>
    </div>
  );
}

function ComparePanel() {
  const { league, draft, compare, toggleCompare, openPlayer } = useGame();
  if (!league || !draft) return null;
  const players = compare.map((id) => league.players[id]).filter((p): p is Player => !!p);
  if (!players.length)
    return (
      <Panel>
        <p className="p-8 text-center text-slate-500">Markiere bis zu 3 Spieler in der Tabelle (Checkbox rechts), um sie hier zu vergleichen.</p>
      </Panel>
    );
  const views = players.map((p) => scoutView(league.seed, p, scoutLevel(draft, p.id), !!draft.grades));
  const anyGoalie = players.some((p) => p.position === 'G');
  const anySkater = players.some((p) => p.position !== 'G');
  const attrs = [...(anySkater ? SKATER_ATTRS : []), ...(anyGoalie ? GOALIE_ATTRS.filter((a) => a !== 'puckHandling' || !anySkater) : [])];
  return (
    <Panel>
      <div className="grid gap-px overflow-x-auto bg-coal-700" style={{ gridTemplateColumns: `140px repeat(${players.length}, minmax(160px, 1fr))` }}>
        <div className="bg-coal-900" />
        {players.map((p) => (
          <div key={p.id} className="bg-coal-900 p-3">
            <button type="button" onClick={() => openPlayer(p.id)} className="font-bold text-slate-100 hover:text-ice-300">
              {fullName(p)}
            </button>
            <div className="text-xs text-slate-400">
              {p.position} · {p.age} J. · {league.teams.find((t) => t.id === p.teamId)?.abbrev}
            </div>
            <button type="button" className="mt-1 text-[11px] text-rose-300 hover:underline" onClick={() => toggleCompare(p.id)}>
              entfernen
            </button>
          </div>
        ))}
        {[
          ['OVR', (i: number) => formatRange(views[i]!.ovr)],
          ['Potential', (i: number) => formatRange(views[i]!.potential)],
          ['Cap Hit', (i: number) => (players[i]!.contract ? formatMoney(players[i]!.contract!.capHit) : '–')],
          ['Vertrag', (i: number) => contractLabel(players[i]!)],
          ['GP Vorsaison', (i: number) => `${players[i]!.gpLastSeason} (${players[i]!.gpLastTwo} in 2)`],
          ['Punkte Vorsaison', (i: number) => (players[i]!.position === 'G' ? `SV% ${players[i]!.lastSeason.savePct?.toFixed(3)}` : `${players[i]!.lastSeason.goals}+${players[i]!.lastSeason.assists}`)],
        ].map(([label, fn]) => (
          <Row key={label as string} label={label as string} cells={players.map((_, i) => (fn as (i: number) => string)(i))} />
        ))}
        {attrs.map((a) => (
          <div key={a} className="contents">
            <div className="bg-coal-900 px-3 py-1.5 text-xs text-slate-400">{ATTR_LABEL[a]}</div>
            {views.map((v, i) => {
              const r = v.attrs[a];
              return (
                <div key={i} className="bg-coal-900 px-3 py-1.5">
                  {r ? (
                    <div className="flex items-center gap-2">
                      <RangeBar range={r} />
                      <span className="w-12 text-right font-mono text-xs text-slate-300">{formatRange(r)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-600">–</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Row({ label, cells }: { label: string; cells: string[] }) {
  return (
    <>
      <div className="bg-coal-900 px-3 py-1.5 text-xs text-slate-400">{label}</div>
      {cells.map((c, i) => (
        <div key={i} className="bg-coal-900 px-3 py-1.5 font-mono text-sm text-slate-200">
          {c}
        </div>
      ))}
    </>
  );
}
