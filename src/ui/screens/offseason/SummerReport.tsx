import { useState } from 'react';
import type { RolloverReport } from '../../../engine';
import { EXPANSION_TEAM_ID } from '../../../engine';
import { useGame } from '../../../store/game';
import { Button, Panel } from '../../components/ui';

/** What happened between two seasons: retirements, development of the own roster, new pro contracts. */
export function SummerReport({ report }: { report: RolloverReport }) {
  const { offLeague, openPlayer } = useGame();
  const [open, setOpen] = useState(true);
  if (!offLeague) return null;
  const abbr = (id: string | null) => offLeague.teams.find((t) => t.id === id)?.abbrev ?? 'FA';
  const champ = offLeague.teams.find((t) => t.id === report.champion);
  const mine = report.retirements.filter((r) => r.teamId === EXPANSION_TEAM_ID);
  const others = report.retirements.filter((r) => r.teamId !== EXPANSION_TEAM_ID).slice(0, 12);
  const name = (id: string) => {
    const p = offLeague.players[id];
    return p ? `${p.firstName} ${p.lastName}` : id;
  };
  return (
    <Panel
      title={`Sommerpause ${report.finished} → ${report.next}`}
      actions={
        <Button variant="ghost" onClick={() => setOpen(!open)}>
          {open ? 'Einklappen' : 'Anzeigen'}
        </Button>
      }
    >
      {open && (
        <div className="grid gap-4 p-4 text-sm lg:grid-cols-3">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300">Karriereende ({report.retirements.length})</div>
            {champ && <p className="mb-2 text-xs text-slate-400">Meister {report.finished}: {champ.city} {champ.name}</p>}
            <ul className="space-y-0.5">
              {[...mine, ...others].map((r) => (
                <li key={r.playerId} className={`flex justify-between gap-2 ${r.teamId === EXPANSION_TEAM_ID ? 'text-ice-200' : ''}`}>
                  <button type="button" className="truncate text-left hover:text-ice-300" onClick={() => openPlayer(r.playerId)}>
                    {r.name} <span className="text-xs text-slate-500">({r.position}, {r.age})</span>
                  </button>
                  <span className="shrink-0 font-mono text-xs text-slate-400">
                    {abbr(r.teamId)} · {r.ovr}
                    {r.underContract && <span className="ml-1 text-amber-300" title="Trotz laufenden Vertrags">V</span>}
                  </span>
                </li>
              ))}
              {report.retirements.length > mine.length + others.length && <li className="text-xs text-slate-500">… und {report.retirements.length - mine.length - others.length} weitere.</li>}
              {!report.retirements.length && <li className="text-slate-500">Niemand hat aufgehört.</li>}
            </ul>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Entwicklung deines Kaders</div>
            <ul className="space-y-0.5">
              {report.development.slice(0, 14).map((d) => (
                <li key={d.playerId} className="flex justify-between gap-2">
                  <button type="button" className="truncate text-left hover:text-ice-300" onClick={() => openPlayer(d.playerId)}>
                    {d.name} <span className="text-xs text-slate-500">({d.age})</span>
                  </button>
                  <span className="shrink-0 font-mono text-xs">
                    {d.from} → <span className={d.to > d.from ? 'text-emerald-300' : 'text-rose-300'}>{d.to}</span>
                  </span>
                </li>
              ))}
              {!report.development.length && <li className="text-slate-500">Keine Veränderungen.</li>}
            </ul>
          </div>
          <div className="space-y-2 text-slate-300">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ice-300">Was jetzt ansteht</div>
            <p className="text-xs text-slate-400">
              Alle Spieler sind ein Jahr älter, Verträge laufen ein Jahr weniger. Auslaufende Verträge landen in der Free Agency; eigene RFAs kannst du dort verlängern.
            </p>
            {report.signedPicks.length > 0 && (
              <p className="text-xs">
                <span className="text-slate-400">Einstiegsverträge für deine Draftpicks: </span>
                {report.signedPicks.map(name).join(', ')}
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
