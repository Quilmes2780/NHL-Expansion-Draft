import { useState } from 'react';
import { EXPANSION_TEAM_ID, activePlayers, capFloor, formatMoney, seasonReadiness, teamPayroll } from '../../engine';
import { useGame } from '../../store/game';
import { Button, LightDot, Panel, Tip } from '../components/ui';
import { EntryDraftTab } from './offseason/EntryDraftTab';
import { FreeAgencyTab } from './offseason/FreeAgencyTab';
import { LineupTab } from './offseason/LineupTab';
import { TradesTab } from './offseason/TradesTab';
import { SummerReport } from './offseason/SummerReport';

type Tab = 'draft' | 'fa' | 'trades' | 'lineup';

export function OffseasonScreen() {
  const { offLeague, off, startSeason } = useGame();
  const [tab, setTab] = useState<Tab>('draft');
  if (!offLeague || !off) return null;
  const cfg = offLeague.config;
  const pay = teamPayroll(offLeague, EXPANSION_TEAM_ID);
  const active = activePlayers(offLeague, EXPANSION_TEAM_ID).length;
  const issues = seasonReadiness(offLeague, EXPANSION_TEAM_ID, off.lineup);
  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'draft', label: 'Lotterie & Entry Draft', badge: off.stage === 'draft' ? 'jetzt' : '✓' },
    { id: 'fa', label: 'Free Agency', badge: off.stage === 'fa' ? `Tag ${off.fa?.day}` : off.stage === 'ready' ? '✓' : undefined },
    { id: 'trades', label: `Trades (${off.trades.length})` },
    { id: 'lineup', label: 'Kader & Aufstellung' },
  ];
  const capPct = (pay / cfg.salaryCap) * 100;
  const floorPct = (capFloor(cfg) / cfg.salaryCap) * 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white">Offseason {cfg.seasonLabel}</h1>
          <p className="mt-1 text-slate-400">
            {off.report ? 'Entry Draft, Free Agency, Trades und die Aufstellung für die neue Saison.' : 'Entry Draft, Free Agency, Trades und die erste Aufstellung deiner Franchise.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm">
          <div className="w-64">
            <div className="flex justify-between text-xs text-slate-400">
              <span className="flex items-center">
                Payroll <Tip text="Zählt alle Verträge des NHL-Kaders plus One-Way-Verträge im Farmteam. Für den Saisonstart muss die Payroll zwischen Cap Floor und Salary Cap liegen." />
              </span>
              <span className="font-mono text-slate-200">
                {formatMoney(pay)} / {formatMoney(cfg.salaryCap)}
              </span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-coal-700">
              <div className={`h-full rounded-full ${pay > cfg.salaryCap ? 'bg-rose-500' : pay < capFloor(cfg) ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(100, capPct)}%` }} />
              <div className="absolute -top-1 h-4 w-px bg-slate-300" style={{ left: `${floorPct}%` }} title="Cap Floor" />
            </div>
          </div>
          <div className="text-xs text-slate-400">
            NHL-Kader <span className="font-mono text-slate-100">{active}/23</span>
          </div>
          <div className="flex items-center gap-2">
            <LightDot status={issues.length ? 'warn' : 'ok'} />
            <Button disabled={issues.length > 0} title={issues.length ? 'Erst die Punkte unten erledigen.' : 'Los geht’s!'} onClick={() => startSeason()} className={issues.length ? '' : 'animate-glow'}>
              Saison starten →
            </Button>
          </div>
        </div>
      </div>

      {off.report && <SummerReport report={off.report} />}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === t.id ? 'bg-coal-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
            {t.badge && <span className="ml-1.5 rounded bg-ice-500/20 px-1.5 text-[11px] text-ice-200">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'draft' && <EntryDraftTab onDone={() => setTab('fa')} />}
      {tab === 'fa' && <FreeAgencyTab />}
      {tab === 'trades' && <TradesTab />}
      {tab === 'lineup' && <LineupTab />}

      {issues.length > 0 && (
        <Panel title="Bereit für den Saisonstart?">
          <ul className="space-y-1 p-4 text-sm text-amber-200">
            {issues.slice(0, 8).map((i) => (
              <li key={i.message}>• {i.message}</li>
            ))}
            {issues.length > 8 && <li className="text-slate-400">… und {issues.length - 8} weitere Punkte.</li>}
          </ul>
        </Panel>
      )}
    </div>
  );
}
