import { EXPANSION_TEAM_ID, RULE_SETS } from '../../engine';
import { PHASES, phaseIndex, useGame } from '../../store/game';
import { Logo } from './Logo';

export function Header() {
  const { phase, maxPhase, goto, league, seed, ruleSetId, reset } = useGame();
  const team = league?.teams.find((t) => t.id === EXPANSION_TEAM_ID);
  return (
    <header className="sticky top-0 z-40 border-b border-coal-700 bg-coal-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <button type="button" onClick={() => confirm('Spiel verlassen und zum Startbildschirm zurückkehren?') && reset()} className="flex items-center gap-2.5 text-left">
          {team ? (
            <Logo spec={team.logo} size={34} title={`${team.city} ${team.name}`} />
          ) : (
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-md bg-ice-500/15 text-sm font-black text-ice-300">33</span>
          )}
          <span className="leading-tight">
            <span className="block text-sm font-bold text-slate-100">{team ? `${team.city} ${team.name}` : 'Team 33'}</span>
            <span className="block text-[11px] uppercase tracking-widest text-slate-400">Expansion Draft GM</span>
          </span>
        </button>
        <nav aria-label="Phasen" className="flex flex-1 flex-wrap items-center gap-1">
          {PHASES.map((p, i) => {
            const reachable = phaseIndex(p.id) <= phaseIndex(maxPhase);
            const active = p.id === phase;
            const done = phaseIndex(p.id) < phaseIndex(maxPhase);
            return (
              <div key={p.id} className="flex items-center">
                {i > 0 && <span className={`mx-1 h-px w-4 sm:w-6 ${done || active ? 'bg-ice-400/60' : 'bg-coal-600'}`} />}
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => goto(p.id)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    active ? 'bg-ice-500 text-coal-950' : reachable ? 'text-ice-200 hover:bg-coal-800' : 'text-slate-500'
                  }`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${active ? 'bg-coal-950/20' : done ? 'bg-ice-500/25' : 'bg-coal-700'}`}>
                    {done && !active ? '✓' : i + 1}
                  </span>
                  {p.label}
                </button>
              </div>
            );
          })}
          <span className="ml-2 hidden text-xs text-slate-500 lg:inline">→ Saison · Playoffs (folgen)</span>
        </nav>
        <div className="text-right text-[11px] leading-tight text-slate-400">
          <div>
            Seed <span className="font-mono text-slate-300">{seed}</span>
          </div>
          <div>{RULE_SETS[ruleSetId].label}</div>
        </div>
      </div>
    </header>
  );
}
