import { useEffect, useMemo, useState } from 'react';
import type { Player } from '../../engine';
import { EXPANSION_TEAM_ID, formatMoney, fullName } from '../../engine';
import { useGame } from '../../store/game';
import { speedFactor } from '../../store/persistence';
import { POS_LABEL } from '../text';
import { Logo } from '../components/Logo';
import { Button, GradeBadge } from '../components/ui';

export function DraftNight() {
  const { league, postDraftLeague, draft, goto } = useGame();
  const picks = useMemo(() => {
    if (!league || !draft?.grades) return [];
    return [...draft.grades.picks].sort((a, b) => {
      const ta = league.teams.find((t) => t.id === a.teamId)?.city ?? '';
      const tb = league.teams.find((t) => t.id === b.teamId)?.city ?? '';
      return ta.localeCompare(tb);
    });
  }, [league, draft]);
  const [shown, setShown] = useState(0);
  const [speed, setSpeed] = useState<'normal' | 'fast'>('normal');
  const factor = speedFactor(useGame((s) => s.settings.speed));

  useEffect(() => {
    if (shown > picks.length) return;
    const id = setTimeout(() => setShown((s) => s + 1), (speed === 'fast' ? 250 : 1600) * factor);
    return () => clearTimeout(id);
  }, [shown, speed, picks.length, factor]);

  if (!league || !draft?.grades || !postDraftLeague) return null;
  const me = league.teams.find((t) => t.id === EXPANSION_TEAM_ID);
  const done = shown > picks.length;
  const current = picks[Math.min(shown, picks.length) - 1];
  const player = (id: string) => postDraftLeague.players[id] as Player;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {me && <Logo spec={me.logo} size={52} />}
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-ice-300">Live aus der Arena</div>
            <h1 className="text-3xl font-black text-white">Draft-Abend</h1>
          </div>
        </div>
        <div className="flex gap-2">
          {!done && (
            <>
              <Button variant="ghost" onClick={() => setSpeed((s) => (s === 'fast' ? 'normal' : 'fast'))}>
                {speed === 'fast' ? 'Normal' : 'Schneller'}
              </Button>
              <Button variant="ghost" onClick={() => setShown(picks.length + 1)}>
                Überspringen
              </Button>
            </>
          )}
          {done && (
            <Button className="animate-glow" onClick={() => goto('results')}>
              Zur Bilanz →
            </Button>
          )}
        </div>
      </div>

      {/* Spotlight */}
      <div className="relative overflow-hidden rounded-2xl border border-coal-600 bg-coal-900 p-6 sm:p-8" style={{ background: `radial-gradient(800px 300px at 50% 0%, ${me?.colors.primary ?? '#0ea5e9'}40, transparent 70%), var(--color-coal-900)` }}>
        {shown === 0 && <p className="py-10 text-center text-xl text-slate-300">Der Commissioner betritt die Bühne …</p>}
        {current && !done && (
          <div key={current.playerId} className="animate-pick-in grid items-center gap-6 sm:grid-cols-[auto_1fr_auto]">
            <Logo spec={league.teams.find((t) => t.id === current.teamId)!.logo} size={96} />
            <div>
              <div className="text-sm uppercase tracking-widest text-slate-400">
                Pick {shown}/32 · von den {league.teams.find((t) => t.id === current.teamId)?.city} {league.teams.find((t) => t.id === current.teamId)?.name}
              </div>
              <div className="mt-1 text-4xl font-black text-white">{fullName(player(current.playerId))}</div>
              <div className="mt-1 text-slate-300">
                {POS_LABEL[player(current.playerId).position]} · {player(current.playerId).age} Jahre · OVR {player(current.playerId).ovr} · {player(current.playerId).contract ? formatMoney(player(current.playerId).contract!.capHit) : '–'}
              </div>
              <div className="mt-2 text-sm italic text-ice-200">„{current.comment}“</div>
            </div>
            <span className="animate-pick-in" style={{ animationDelay: speed === 'fast' ? '0ms' : '700ms' }}>
              <GradeBadge grade={current.grade} size="xl" />
            </span>
          </div>
        )}
        {done && (
          <div className="animate-pick-in flex flex-col items-center gap-3 py-4 text-center">
            <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Gesamtnote der Analysten</div>
            <GradeBadge grade={draft.grades.overall} size="xl" />
            <p className="max-w-lg text-slate-300">
              Dein Draft erreicht {Math.round((draft.grades.userValue / draft.grades.mockValue) * 1000) / 10} % des Werts, den die KI aus denselben Listen herausgeholt hätte.
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {picks.slice(0, Math.min(shown, picks.length)).map((pk) => {
          const t = league.teams.find((x) => x.id === pk.teamId);
          const p = player(pk.playerId);
          return (
            <div key={pk.playerId} className="animate-pick-in flex items-center gap-2.5 rounded-lg border border-coal-700 bg-coal-900/80 p-2.5">
              {t && <Logo spec={t.logo} size={28} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-100">{fullName(p)}</div>
                <div className="text-[11px] text-slate-400">
                  {t?.abbrev} · {p.position} · OVR {p.ovr}
                </div>
              </div>
              <GradeBadge grade={pk.grade} size="sm" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
