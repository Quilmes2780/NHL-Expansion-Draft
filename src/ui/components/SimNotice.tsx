import { useGame } from '../../store/game';
import { Button } from './ui';

/** Shown when a simulation stopped early because players of the own team got hurt. */
export function SimNotice({ onLineup }: { onLineup: () => void }) {
  const { simNotice, clearSimNotice } = useGame();
  if (!simNotice.length) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-rose-500/50 bg-rose-500/10 p-3">
      <div className="space-y-1 text-sm">
        <div className="font-semibold text-rose-200">Simulation angehalten – Verletzung im eigenen Team</div>
        {simNotice.map((t, i) => (
          <div key={i} className="text-slate-200">
            {t}
          </div>
        ))}
        <div className="text-xs text-slate-400">
          Bis alle wieder fit sind, spielt die optimierte Auto-Aufstellung; danach gilt automatisch wieder deine eigene.
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            clearSimNotice();
            onLineup();
          }}
        >
          Zur Aufstellung
        </Button>
        <Button variant="ghost" onClick={clearSimNotice}>
          OK
        </Button>
      </div>
    </div>
  );
}
