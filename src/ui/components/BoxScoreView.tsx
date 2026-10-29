import { useEffect, useState } from 'react';
import type { BoxScore, League } from '../../engine';
import { EXPANSION_TEAM_ID, fullName } from '../../engine';
import { Logo } from './Logo';
import { Button } from './ui';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const periodLabel = (p: number) => (p <= 3 ? `${p}. Drittel` : 'Overtime');

export function BoxScoreView({ box, league, animate = false }: { box: BoxScore; league: League; animate?: boolean }) {
  const events = box.events.filter((e) => e.type !== 'injury' || e.teamId === EXPANSION_TEAM_ID);
  const [shown, setShown] = useState(animate ? 0 : events.length);
  useEffect(() => {
    if (shown >= events.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), 450);
    return () => clearTimeout(id);
  }, [shown, events.length]);
  const done = shown >= events.length;
  const team = (id: string) => league.teams.find((t) => t.id === id);
  const name = (id: string) => (league.players[id] ? fullName(league.players[id]!) : id);
  const visible = events.slice(0, shown);
  const score = (teamId: string) =>
    done ? box.teams[teamId]!.goals : visible.filter((e) => e.type === 'goal' && e.teamId === teamId).length;
  const H = team(box.home);
  const A = team(box.away);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2">
          {A && <Logo spec={A.logo} size={36} />}
          <div>
            <div className="text-xs text-slate-400">Auswärts</div>
            <div className="font-bold text-slate-100">{A?.city}</div>
          </div>
        </div>
        <div className="text-center font-mono text-3xl font-black text-white tabular">
          {score(box.away)} : {score(box.home)}
          {done && box.decision !== 'REG' && <div className="text-xs font-semibold text-amber-300">{box.decision === 'OT' ? 'n. V.' : 'n. P.'}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 text-right">
          <div>
            <div className="text-xs text-slate-400">Heim</div>
            <div className="font-bold text-slate-100">{H?.city}</div>
          </div>
          {H && <Logo spec={H.logo} size={36} />}
        </div>
      </div>
      <ol className="max-h-72 space-y-1 overflow-auto text-xs">
        {visible.map((e, i) => {
          const t = team(e.teamId);
          const prev = visible[i - 1];
          return (
            <li key={i}>
              {(!prev || prev.period !== e.period) && <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{periodLabel(e.period)}</div>}
              <div className={`animate-pick-in flex gap-2 rounded px-2 py-1 ${e.type === 'goal' ? 'bg-emerald-500/10 text-emerald-100' : e.type === 'injury' ? 'bg-rose-500/10 text-rose-200' : 'text-slate-400'}`}>
                <span className="w-10 font-mono text-slate-500">{clock(e.time)}</span>
                <span className="w-9 font-mono">{t?.abbrev}</span>
                <span className="flex-1">
                  {e.type === 'goal' && (
                    <>
                      <b>Tor</b> {name(e.playerId)}
                      {e.strength === 'PP' && ' (PP)'}
                      {e.strength === 'SH' && ' (SH)'}
                      {e.assists.length > 0 && <span className="text-slate-400"> – Vorlage {e.assists.map(name).join(', ')}</span>}
                    </>
                  )}
                  {e.type === 'penalty' && <>Strafe (2 Min.) gegen {name(e.playerId)}</>}
                  {e.type === 'injury' && <>Verletzung: {name(e.playerId)}</>}
                </span>
              </div>
            </li>
          );
        })}
        {done && box.decision === 'SO' && (
          <li className="mt-1 rounded bg-amber-500/10 px-2 py-1 text-amber-100">
            Shootout: {box.shootout.map((s) => `${team(s.teamId)?.abbrev} ${league.players[s.playerId]?.lastName} ${s.scored ? '✓' : '✗'}`).join(' · ')}
          </li>
        )}
      </ol>
      {done && (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded bg-coal-850 p-2">
            <div className="text-slate-500">Schüsse</div>
            <div className="font-mono text-slate-100">
              {box.teams[box.away]!.shots} – {box.teams[box.home]!.shots}
            </div>
          </div>
          <div className="rounded bg-coal-850 p-2">
            <div className="text-slate-500">Powerplay</div>
            <div className="font-mono text-slate-100">
              {box.teams[box.away]!.ppGoals}/{box.teams[box.away]!.ppOpp} – {box.teams[box.home]!.ppGoals}/{box.teams[box.home]!.ppOpp}
            </div>
          </div>
          <div className="rounded bg-coal-850 p-2">
            <div className="text-slate-500">Goalies</div>
            <div className="truncate text-slate-100">
              {league.players[box.goalies[box.away]!]?.lastName} – {league.players[box.goalies[box.home]!]?.lastName}
            </div>
          </div>
        </div>
      )}
      {!done && (
        <div className="text-right">
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setShown(events.length)}>
            Überspringen
          </Button>
        </div>
      )}
    </div>
  );
}

export function BoxScoreModal({ boxes, league, animate, onClose }: { boxes: BoxScore[]; league: League; animate: boolean; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const box = boxes[idx];
  if (!box) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Spielbericht" className="animate-pick-in w-full max-w-xl rounded-2xl border border-coal-600 bg-coal-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ice-300">
            Spielbericht {boxes.length > 1 && `${idx + 1}/${boxes.length}`}
          </h2>
          <button type="button" onClick={onClose} aria-label="Schließen" className="text-xl text-slate-400 hover:text-white">
            ×
          </button>
        </div>
        <BoxScoreView key={box.gameId} box={box} league={league} animate={animate} />
        {boxes.length > 1 && (
          <div className="mt-3 flex justify-between">
            <Button variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
              ← Vorheriges
            </Button>
            <Button variant="ghost" disabled={idx === boxes.length - 1} onClick={() => setIdx(idx + 1)}>
              Nächstes →
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
