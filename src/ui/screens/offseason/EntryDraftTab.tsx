import { useState } from 'react';
import { EXPANSION_TEAM_ID, availableProspects, currentSlot, formatRange, fullName, isDraftDone, isInauguralSeason, scoutView } from '../../../engine';
import { useGame } from '../../../store/game';
import { POS_LABEL, RULE_TIPS, nationLabel } from '../../text';
import { Logo } from '../../components/Logo';
import { Badge, Button, Panel, ScoutDots, Tip } from '../../components/ui';

export function EntryDraftTab({ onDone }: { onDone: () => void }) {
  const { offLeague, off, edPick, edAuto, edSimAll, edScout, finishDraft } = useGame();
  const [group, setGroup] = useState<'all' | 'F' | 'D' | 'G'>('all');
  if (!offLeague || !off) return null;
  const d = off.draft;
  const lot = d.lottery;
  const team = (id: string) => offLeague.teams.find((t) => t.id === id);
  const slot = currentSlot(d);
  const myTurn = slot?.ownerTeamId === EXPANSION_TEAM_ID;
  const done = isDraftDone(d);
  const mySlots = d.slots.filter((s) => s.ownerTeamId === EXPANSION_TEAM_ID);
  const myFirst = d.slots.find((s) => s.round === 1 && s.originalTeamId === EXPANSION_TEAM_ID);
  const avail = availableProspects(d).filter((p) => group === 'all' || (group === 'F' ? !['D', 'G'].includes(p.position) : p.position === group));
  const rankOf = (id: string) => d.centralRank.indexOf(id) + 1;

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <div className="space-y-4">
        <Panel
          title={
            <span className="flex items-center">
              Draft-Lotterie{' '}
              <Tip
                text={`${isInauguralSeason(offLeague) ? 'Das Expansionsteam erhält die Lotteriechancen des Teams mit der drittschlechtesten Bilanz.' : 'Die Lotteriechancen richten sich nach den Punkten der Vorsaison – auch für dein Team.'} Gezogen werden die Picks 1 und 2; ein Team kann maximal 10 Plätze nach vorn springen.`}
              />
            </span>
          }
        >
          <div className="space-y-3 p-4 text-sm">
            <div className="flex items-center gap-3 rounded-lg border border-ice-500/30 bg-ice-500/10 p-3">
              {team(EXPANSION_TEAM_ID) && <Logo spec={team(EXPANSION_TEAM_ID)!.logo} size={36} />}
              <div>
                <div className="font-semibold text-slate-100">Dein 1.-Runden-Pick: Nr. {myFirst?.overall ?? '–'}</div>
                <div className="text-xs text-slate-400">Lotteriechance auf Pick 1: {((lot.odds[EXPANSION_TEAM_ID] ?? 0) * 100).toFixed(1)} %</div>
              </div>
            </div>
            <ol className="space-y-1 text-xs">
              {lot.round1.slice(0, 8).map((id, i) => (
                <li key={id} className={`flex items-center gap-2 ${id === EXPANSION_TEAM_ID ? 'text-ice-200' : 'text-slate-300'}`}>
                  <span className="w-5 text-right font-mono text-slate-500">{i + 1}</span>
                  {team(id) && <Logo spec={team(id)!.logo} size={16} />}
                  <span className="flex-1">{team(id)?.city}</span>
                  {i < 2 && <Badge tone="emerald">Lotterie</Badge>}
                  <span className="font-mono text-slate-500">{((lot.odds[id] ?? 0) * 100).toFixed(1)} %</span>
                </li>
              ))}
            </ol>
          </div>
        </Panel>
        <Panel title={`Deine Picks (${mySlots.length})`}>
          <ul className="space-y-1 p-4 text-xs">
            {mySlots.map((s) => {
              const p = s.playerId ? d.prospects[s.playerId] : null;
              return (
                <li key={s.pickId} className="flex justify-between gap-2">
                  <span className="text-slate-400">
                    R{s.round} · Nr. {s.overall}
                    {s.originalTeamId !== EXPANSION_TEAM_ID && <span className="text-slate-500"> (via {team(s.originalTeamId)?.abbrev})</span>}
                  </span>
                  <span className="text-slate-200">{p ? `${fullName(p)} (${p.position})` : s === slot ? 'am Zug' : '–'}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel
        title={
          <span className="flex items-center">
            {done ? 'Entry Draft abgeschlossen' : myTurn ? `Du bist am Zug – Pick Nr. ${slot?.overall} (Runde ${slot?.round})` : 'Entry Draft'}
            <Tip text={RULE_TIPS.fog} />
          </span>
        }
        actions={
          <span className="text-xs text-slate-400">
            Scouting {d.scoutingBudget - d.scoutingSpent}/{d.scoutingBudget}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-coal-700 p-3">
          <div className="flex overflow-hidden rounded-md border border-coal-600">
            {(['all', 'F', 'D', 'G'] as const).map((g) => (
              <button key={g} type="button" onClick={() => setGroup(g)} className={`px-2.5 py-1 text-xs font-semibold ${group === g ? 'bg-ice-500/20 text-ice-200' : 'text-slate-400 hover:bg-coal-800'}`}>
                {g === 'all' ? 'Alle' : g}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          {!done && myTurn && (
            <Button variant="ghost" onClick={edAuto} title="Wählt den Spieler mit dem besten gescouteten Potential.">
              Auto-Pick
            </Button>
          )}
          {!done && (
            <Button variant="ghost" onClick={edSimAll}>
              Rest simulieren
            </Button>
          )}
          {done && off.stage === 'draft' && (
            <Button
              className="animate-glow"
              onClick={() => {
                finishDraft();
                onDone();
              }}
            >
              Weiter zur Free Agency →
            </Button>
          )}
        </div>
        <div className="max-h-[calc(100vh-20rem)] overflow-auto">
          <table className="w-full text-sm tabular [&_td]:whitespace-nowrap">
            <thead className="sticky top-0 bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Rang</th>
                <th className="px-3 py-2">Prospect</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Alter</th>
                <th className="px-3 py-2">Nation</th>
                <th className="px-3 py-2">OVR</th>
                <th className="px-3 py-2">POT</th>
                <th className="px-3 py-2">Scout</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-coal-800">
              {avail.slice(0, 120).map((p) => {
                const lvl = d.scouting[p.id] ?? 0;
                const v = scoutView(offLeague.seed, p, lvl);
                return (
                  <tr key={p.id} className="hover:bg-coal-800/60">
                    <td className="px-3 font-mono text-slate-400">{rankOf(p.id)}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-100">{fullName(p)}</td>
                    <td className="px-3 text-xs" title={POS_LABEL[p.position]}>
                      {p.position}
                    </td>
                    <td className="px-3">{p.age}</td>
                    <td className="px-3 text-xs text-slate-400">{nationLabel(p.nationality)}</td>
                    <td className="px-3 font-mono">{formatRange(v.ovr)}</td>
                    <td className="px-3 font-mono text-ice-200">{formatRange(v.potential)}</td>
                    <td className="px-3">
                      <span className="inline-flex items-center gap-1.5">
                        <ScoutDots level={lvl} />
                        {!done && (
                          <button type="button" disabled={lvl >= 3 || d.scoutingSpent >= d.scoutingBudget} onClick={() => edScout(p.id)} className="rounded px-1 text-xs text-ice-300 hover:bg-ice-500/15 disabled:opacity-30" aria-label="Scouten">
                            +
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="px-3 text-right">
                      {myTurn && (
                        <Button className="px-2.5 py-1 text-xs" onClick={() => edPick(p.id)}>
                          Draften
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {done && <p className="p-4 text-sm text-slate-400">Alle {d.slots.length} Picks sind vergeben. Gedraftete Prospects stehen ungesignt im Farmteam.</p>}
        </div>
      </Panel>
    </div>
  );
}
