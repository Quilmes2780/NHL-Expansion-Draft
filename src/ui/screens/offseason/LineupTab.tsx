import { useState } from 'react';
import type { Lineup, Player, Slot } from '../../../engine';
import {
  EXPANSION_TEAM_ID,
  countsAgainstCap,
  formatMoneyShort,
  fullName,
  groupOf,
  lineRatings,
  playersOfTeam,
  validateLineup,
} from '../../../engine';
import { useGame } from '../../../store/game';
import { contractLabel } from '../../text';
import { Badge, Button, Panel, Tip } from '../../components/ui';

function PlayerSelect({ value, options, onChange, label }: { value: Slot; options: Player[]; onChange: (v: Slot) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full min-w-0 rounded border border-coal-600 bg-coal-850 px-1.5 py-1 text-xs text-slate-100"
    >
      <option value="">– {label} –</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.lastName} ({p.position} {p.ovr})
        </option>
      ))}
    </select>
  );
}

export function LineupTab() {
  const { offLeague, off, setLineup, autoLineup, toggleFarm, openPlayer } = useGame();
  const [error, setError] = useState<string | null>(null);
  if (!offLeague || !off) return null;
  const l = off.lineup;
  const roster = playersOfTeam(offLeague, EXPANSION_TEAM_ID).sort((a, b) => 'FDG'.indexOf(groupOf(a.position)) - 'FDG'.indexOf(groupOf(b.position)) || b.ovr - a.ovr);
  const active = roster.filter((p) => !p.farm);
  const farm = roster.filter((p) => p.farm);
  const skaters = active.filter((p) => p.position !== 'G');
  const fwd = [...skaters].sort((a, b) => Number(a.position === 'D') - Number(b.position === 'D') || b.ovr - a.ovr);
  const def = [...skaters].sort((a, b) => Number(b.position === 'D') - Number(a.position === 'D') || b.ovr - a.ovr);
  const goalies = active.filter((p) => p.position === 'G');
  const issues = validateLineup(offLeague, EXPANSION_TEAM_ID, l);
  const ratings = lineRatings(offLeague, l);

  const update = (fn: (draft: Lineup) => void) => {
    const next: Lineup = JSON.parse(JSON.stringify(l));
    fn(next);
    setLineup(next);
  };

  const rosterRow = (p: Player) => (
    <li key={p.id} className="flex items-center gap-2 px-3 py-1 text-xs">
      <span className="w-6 font-mono text-slate-500">{p.position}</span>
      <button type="button" className="flex-1 truncate text-left text-slate-200 hover:text-ice-300" onClick={() => openPlayer(p.id)}>
        {fullName(p)}
      </button>
      <span className="w-6 font-mono text-slate-300">{p.ovr}</span>
      <span className="w-14 text-right font-mono text-slate-400" title={contractLabel(p)}>
        {p.contract ? formatMoneyShort(p.contract.capHit) : 'ungesignt'}
      </span>
      {p.farm && countsAgainstCap(p) && <Badge tone="amber" title="One-Way-Vertrag zählt auch im Farmteam gegen den Cap">Cap</Badge>}
      {p.injury && <Badge tone="rose">verl.</Badge>}
      <button
        type="button"
        onClick={() => setError(toggleFarm(p.id))}
        className="rounded border border-coal-600 px-1.5 text-[11px] text-slate-300 hover:border-ice-400"
        title={p.farm ? 'In den NHL-Kader berufen' : 'Ins Farmteam schicken'}
      >
        {p.farm ? '↑ NHL' : '↓ Farm'}
      </button>
    </li>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <Panel title={`NHL-Kader (${active.length}/23)`}>
          <ul className="max-h-[42vh] overflow-auto py-1">{active.map(rosterRow)}</ul>
        </Panel>
        <Panel title={`Farmteam (${farm.length})`}>
          <ul className="max-h-[30vh] overflow-auto py-1">{farm.map(rosterRow)}</ul>
        </Panel>
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={autoLineup}>Auto-Aufstellung</Button>
          <span className="flex items-center text-xs text-slate-400">
            Spieler außerhalb ihrer Position verlieren Rating <Tip text="Center auf dem Flügel: −1, Flügel als Center: −4, Verteidiger im Sturm: −10, Stürmer in der Verteidigung: −12." />
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Sturmreihen">
            <div className="space-y-2 p-3">
              {l.forwards.map((line, i) => (
                <div key={i} className="grid grid-cols-[52px_1fr_1fr_1fr_36px] items-center gap-1.5">
                  <span className="text-xs text-slate-400">{i + 1}. Reihe</span>
                  {(['LW', 'C', 'RW'] as const).map((pos, j) => (
                    <PlayerSelect key={pos} label={pos} value={line[j] ?? null} options={fwd} onChange={(v) => update((d) => void (d.forwards[i]![j] = v))} />
                  ))}
                  <span className="text-right font-mono text-xs text-ice-200">{Math.round(ratings.forwards[i] ?? 0)}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Verteidigung & Goalies">
            <div className="space-y-2 p-3">
              {l.defense.map((pair, i) => (
                <div key={i} className="grid grid-cols-[52px_1fr_1fr_36px] items-center gap-1.5">
                  <span className="text-xs text-slate-400">{i + 1}. Paar</span>
                  {[0, 1].map((j) => (
                    <PlayerSelect key={j} label={j ? 'RD' : 'LD'} value={pair[j] ?? null} options={def} onChange={(v) => update((d) => void (d.defense[i]![j] = v))} />
                  ))}
                  <span className="text-right font-mono text-xs text-ice-200">{Math.round(ratings.defense[i] ?? 0)}</span>
                </div>
              ))}
              <div className="grid grid-cols-[52px_1fr_1fr_36px] items-center gap-1.5 border-t border-coal-700 pt-2">
                <span className="text-xs text-slate-400">Goalies</span>
                {[0, 1].map((j) => (
                  <PlayerSelect key={j} label={j ? 'Backup' : 'Starter'} value={l.goalies[j] ?? null} options={goalies} onChange={(v) => update((d) => void (d.goalies[j] = v))} />
                ))}
                <span className="text-right font-mono text-xs text-ice-200">{ratings.goalie}</span>
              </div>
            </div>
          </Panel>
          <Panel title="Powerplay">
            <div className="space-y-2 p-3">
              {l.pp.map((u, i) => (
                <div key={i} className="grid grid-cols-[40px_repeat(5,minmax(0,1fr))] items-center gap-1">
                  <span className="text-xs text-slate-400">PP{i + 1}</span>
                  {u.f.map((id, j) => (
                    <PlayerSelect key={`f${j}`} label="F" value={id} options={fwd} onChange={(v) => update((d) => void (d.pp[i]!.f[j] = v))} />
                  ))}
                  {u.d.map((id, j) => (
                    <PlayerSelect key={`d${j}`} label="D" value={id} options={def} onChange={(v) => update((d) => void (d.pp[i]!.d[j] = v))} />
                  ))}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Penalty Kill">
            <div className="space-y-2 p-3">
              {l.pk.map((u, i) => (
                <div key={i} className="grid grid-cols-[40px_repeat(4,minmax(0,1fr))] items-center gap-1">
                  <span className="text-xs text-slate-400">PK{i + 1}</span>
                  {u.f.map((id, j) => (
                    <PlayerSelect key={`f${j}`} label="F" value={id} options={fwd} onChange={(v) => update((d) => void (d.pk[i]!.f[j] = v))} />
                  ))}
                  {u.d.map((id, j) => (
                    <PlayerSelect key={`d${j}`} label="D" value={id} options={def} onChange={(v) => update((d) => void (d.pk[i]!.d[j] = v))} />
                  ))}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Kapitän & Assistenten" className="lg:col-span-2">
            <div className="grid grid-cols-3 gap-2 p-3">
              <PlayerSelect label="C" value={l.captain} options={skaters} onChange={(v) => update((d) => void (d.captain = v))} />
              {[0, 1].map((j) => (
                <PlayerSelect key={j} label="A" value={l.assistants[j] ?? null} options={skaters} onChange={(v) => update((d) => void (d.assistants[j] = v))} />
              ))}
            </div>
          </Panel>
        </div>
        {issues.length > 0 && (
          <Panel title="Hinweise zur Aufstellung">
            <ul className="space-y-1 p-3 text-xs">
              {issues.map((i, k) => (
                <li key={k} className={i.level === 'error' ? 'text-rose-300' : 'text-amber-200'}>
                  • {i.message}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
