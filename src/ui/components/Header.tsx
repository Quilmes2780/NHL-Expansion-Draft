import { EXPANSION_TEAM_ID, RULE_SETS } from '../../engine';
import { PHASES, phaseIndex, useGame } from '../../store/game';
import { Logo } from './Logo';

export function Header() {
  const { phase, maxPhase, goto, league, seed, ruleSetId, reset, setMenuOpen } = useGame();
  const team = league?.teams.find((t) => t.id === EXPANSION_TEAM_ID);
  return (
    <header className="sticky top-0 z-40 border-b border-coal-700 bg-coal-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-2 sm:px-6">
        <button
          type="button"
          onClick={() => confirm('Zum Startbildschirm zurückkehren? Der Autosave bleibt erhalten.') && reset()}
          className="flex shrink-0 items-center gap-2.5 text-left"
          title="Zum Startbildschirm"
        >
          {team ? (
            <Logo spec={team.logo} size={34} title={`${team.city} ${team.name}`} />
          ) : (
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-md bg-ice-500/15 text-sm font-black text-ice-300">33</span>
          )}
          <span className="hidden leading-tight md:block">
            <span className="block max-w-44 truncate text-sm font-bold text-slate-100">{team ? `${team.city} ${team.name}` : 'Team 33'}</span>
            <span className="block text-[10px] uppercase tracking-widest text-slate-400">Expansion Draft GM</span>
          </span>
        </button>
        <nav aria-label="Phasen" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-1 [scrollbar-width:none]">
          {PHASES.map((p, i) => {
            const reachable = phaseIndex(p.id) <= phaseIndex(maxPhase);
            const active = p.id === phase;
            const done = phaseIndex(p.id) < phaseIndex(maxPhase);
            return (
              <div key={p.id} className="flex shrink-0 items-center">
                {i > 0 && <span className={`mx-0.5 h-px w-2 lg:w-3 ${done || active ? 'bg-ice-400/60' : 'bg-coal-600'}`} />}
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => goto(p.id)}
                  aria-current={active ? 'step' : undefined}
                  title={p.label}
                  className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold transition ${
                    active ? 'bg-ice-500 text-coal-950' : reachable ? 'text-ice-200 hover:bg-coal-800' : 'text-slate-500'
                  }`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${active ? 'bg-coal-950/20' : done ? 'bg-ice-500/25' : 'bg-coal-700'}`}>
                    {done && !active ? '✓' : i + 1}
                  </span>
                  <span className={active ? '' : 'hidden xl:inline'}>{p.label}</span>
                </button>
              </div>
            );
          })}
        </nav>
        <div className="hidden shrink-0 text-right text-[11px] leading-tight text-slate-400 sm:block">
          <div>
            Seed <span className="font-mono text-slate-300">{seed}</span>
          </div>
          <div>{RULE_SETS[ruleSetId].label}</div>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="shrink-0 rounded-md border border-coal-600 px-2.5 py-1.5 text-sm text-slate-200 hover:border-ice-400"
          aria-label="Menü: Spielstände, Einstellungen, Achievements"
          title="Spielstände, Einstellungen, Achievements"
        >
          ☰ Menü
        </button>
      </div>
    </header>
  );
}
