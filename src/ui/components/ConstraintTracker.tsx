import { summarizeSelection } from '../../engine';
import { useGame } from '../../store/game';
import { RULE_TIPS } from '../text';
import { Button, LightDot, Panel, Tip } from './ui';

export function ConstraintTracker() {
  const { league, draft, violations, submit, autoFill, clearSelection } = useGame();
  if (!league || !draft) return null;
  const sum = summarizeSelection(league, draft.protections, draft.selection);
  const capPct = Math.min(100, (sum.capTotal / league.config.salaryCap) * 100);
  const minPct = (sum.capMin / league.config.salaryCap) * 100;
  const maxPct = Math.min(100, (sum.capMax / league.config.salaryCap) * 100);
  const allOk = sum.constraints.every((c) => c.status === 'ok');
  const locked = !!draft.grades;
  const budgetLeft = draft.scoutingBudget - draft.scoutingSpent;

  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="flex items-center">
            Constraint-Tracker <Tip text={RULE_TIPS.roster} />
          </span>
        }
      >
        <ul className="divide-y divide-coal-700/70">
          {sum.constraints.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 px-4 py-2 text-sm">
              <LightDot status={c.status} />
              <span className="flex flex-1 items-center text-slate-300">
                {c.label}
                <Tip text={c.hint} />
              </span>
              <span className="font-mono font-semibold text-slate-100 tabular">{c.value}</span>
            </li>
          ))}
        </ul>
        <div className="px-4 pb-3 pt-1">
          <div className="relative h-2.5 rounded-full bg-coal-700" aria-label="Cap-Auslastung">
            <div className="absolute inset-y-0 rounded-full bg-emerald-500/20" style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-ice-400" style={{ width: `${capPct}%` }} />
            <div className="absolute -top-1 h-4.5 w-px bg-emerald-300" style={{ left: `${minPct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>0</span>
            <span>Min {Math.round(minPct)} %</span>
            <span>Cap</span>
          </div>
        </div>
      </Panel>

      <Panel
        title={
          <span className="flex items-center">
            Scouting <Tip text={RULE_TIPS.fog} />
          </span>
        }
      >
        <div className="px-4 py-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-slate-300">Budget</span>
            <span className="font-mono text-slate-100">
              {budgetLeft} / {draft.scoutingBudget}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-coal-700">
            <div className="h-full rounded-full bg-ice-400 transition-all" style={{ width: `${(budgetLeft / draft.scoutingBudget) * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-400">Jede Stufe kostet 1 Punkt und engt OVR, Potential und Attribute ein (max. 3 Stufen).</p>
        </div>
      </Panel>

      {!locked && (
        <div className="space-y-2">
          <Button className={`w-full py-3 ${allOk ? 'animate-glow' : ''}`} onClick={() => submit()}>
            Draftliste abschicken
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={autoFill} title="Füllt Teams ohne Pick – auf Basis deiner Scouting-Informationen, nicht der echten Werte.">
              Rest auto-füllen
            </Button>
            <Button variant="ghost" onClick={() => confirm('Alle Picks entfernen?') && clearSelection()}>
              Auswahl leeren
            </Button>
          </div>
        </div>
      )}
      {locked && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">Draft abgeschlossen – das Board ist schreibgeschützt.</p>}

      {violations.length > 0 && (
        <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
          <div className="mb-1.5 text-sm font-bold text-rose-200">Draftliste ungültig – {violations.length} Regelverstoß/-verstöße:</div>
          <ul className="space-y-1.5 text-sm text-rose-100">
            {violations.map((v, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                <span>{v.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
