import { useMemo, useState } from 'react';
import type { BoxScore, GoalieMode } from '../../engine';
import {
  EXPANSION_TEAM_ID,
  dayLabel,
  formatMoney,
  skaterTable,
  standings,
  teamGames,
  teamPayroll,
  tradeDeadlinePassed,
} from '../../engine';
import { useGame } from '../../store/game';
import { BoxScoreModal } from '../components/BoxScoreView';
import { Logo } from '../components/Logo';
import { Button, Panel, Tip } from '../components/ui';
import { NewsFeed, OwnerFansPanel } from '../components/WorldPanels';
import { LineupTab } from './offseason/LineupTab';
import { TradesTab } from './offseason/TradesTab';
import { StandingsTab } from './season/StandingsTab';
import { StatsTab } from './season/StatsTab';
import { SimNotice } from '../components/SimNotice';

type Tab = 'overview' | 'schedule' | 'standings' | 'stats' | 'lineup' | 'trades';

export function SeasonScreen() {
  const { offLeague, season, simulate, simulating, lastBoxes, tickerEnabled, setTicker, clearBoxes, setSeasonOption, startPlayoffs } = useGame();
  const [tab, setTab] = useState<Tab>('overview');
  const [openBoxes, setOpenBoxes] = useState<BoxScore[] | null>(null);
  const table = useMemo(() => (offLeague && season ? standings(offLeague, season) : []), [offLeague, season]);
  if (!offLeague || !season) return null;
  const me = offLeague.teams.find((t) => t.id === EXPANSION_TEAM_ID)!;
  const row = table.find((r) => r.teamId === EXPANSION_TEAM_ID);
  const divRank = table.filter((r) => offLeague.teams.find((t) => t.id === r.teamId)?.division === me.division).findIndex((r) => r.teamId === EXPANSION_TEAM_ID) + 1;
  const deadlinePassed = tradeDeadlinePassed(season);
  const progress = Object.keys(season.results).length / season.games.length;
  const tabs: [Tab, string][] = [
    ['overview', 'Übersicht'],
    ['schedule', 'Spielplan'],
    ['standings', 'Tabellen'],
    ['stats', 'Statistiken'],
    ['lineup', 'Kader & Aufstellung'],
    ['trades', deadlinePassed ? 'Trades (Deadline vorbei)' : 'Trades'],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo spec={me.logo} size={52} />
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-ice-300">Saison {offLeague.config.seasonLabel}</div>
            <h1 className="text-3xl font-black text-white">{season.done ? 'Reguläre Saison beendet' : dayLabel(season.day, offLeague.config.seasonStartYear)}</h1>
            <p className="text-sm text-slate-400">
              {row ? `${row.w}-${row.l}-${row.otl} · ${row.pts} Punkte · Platz ${divRank} in der ${me.division} Division` : ''}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={simulating || season.done} onClick={() => simulate('day')}>
              Nächster Tag
            </Button>
            <Button variant="ghost" disabled={simulating || season.done} onClick={() => simulate('week')}>
              Woche
            </Button>
            {!deadlinePassed && (
              <Button variant="ghost" disabled={simulating || season.done} onClick={() => simulate('deadline')}>
                Bis Trade Deadline
              </Button>
            )}
            <Button disabled={simulating || season.done} onClick={() => simulate('end')}>
              Bis Saisonende
            </Button>
          </div>
          <div className="flex items-center justify-end gap-3 text-xs text-slate-400">
            <div className="h-1.5 w-40 rounded-full bg-coal-700">
              <div className="h-full rounded-full bg-ice-400 transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
            <span>{simulating ? 'Simuliere …' : `${Math.round(progress * 100)} % gespielt`}</span>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={tickerEnabled} onChange={(e) => setTicker(e.target.checked)} /> Kurz-Ticker eigener Spiele
            </label>
          </div>
        </div>
      </div>

      <SimNotice onLineup={() => setTab('lineup')} />

      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === id ? 'bg-coal-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview onOpen={setOpenBoxes} onGoalieMode={(m) => setSeasonOption({ goalieMode: m })} />}
      {tab === 'schedule' && <ScheduleTab onOpen={setOpenBoxes} />}
      {tab === 'standings' && <StandingsTab />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'lineup' && (
        <div className="space-y-3">
          <GoalieModeSelect value={season.options.goalieMode} onChange={(m) => setSeasonOption({ goalieMode: m })} />
          <LineupTab />
        </div>
      )}
      {tab === 'trades' &&
        (deadlinePassed ? (
          <Panel>
            <p className="p-8 text-center text-slate-400">Die Trade Deadline ({dayLabel(season.deadlineDay, offLeague.config.seasonStartYear)}) ist vorbei. Trades sind erst nach der Saison wieder möglich.</p>
          </Panel>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-amber-200">Trade Deadline: {dayLabel(season.deadlineDay, offLeague.config.seasonStartYear)}</p>
            <TradesTab />
          </div>
        ))}

      {tickerEnabled && lastBoxes.length > 0 && !simulating && <BoxScoreModal boxes={lastBoxes} league={offLeague} animate onClose={clearBoxes} />}
      {openBoxes && <BoxScoreModal boxes={openBoxes} league={offLeague} animate={false} onClose={() => setOpenBoxes(null)} />}
      {season.done && (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-slate-300">Die reguläre Saison ist vorbei. Jetzt entscheidet sich, wer um den Titel spielt.</p>
            <Button className="animate-glow" onClick={startPlayoffs}>
              Zu den Playoffs →
            </Button>
          </div>
        </Panel>
      )}
      <p className="text-right text-xs text-slate-500">Payroll {formatMoney(teamPayroll(offLeague, EXPANSION_TEAM_ID))}</p>
    </div>
  );
}

function GoalieModeSelect({ value, onChange }: { value: GoalieMode; onChange: (m: GoalieMode) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-300">
      Goalie-Rotation
      <select value={value} onChange={(e) => onChange(e.target.value as GoalieMode)} className="rounded-md border border-coal-600 bg-coal-850 px-2 py-1 text-sm">
        <option value="auto">Automatisch (Backup bei Back-to-Backs)</option>
        <option value="starter">Immer der Starter</option>
        <option value="rotate">Abwechselnd</option>
      </select>
      <Tip text="Back-to-Backs ermüden: Ein Goalie, der am Vortag gespielt hat, ist schwächer. Der Backup sammelt dafür weniger Spielpraxis." />
    </label>
  );
}

function resultLabel(teamId: string, g: { home: string; homeGoals: number; awayGoals: number; decision: string }) {
  const mine = g.home === teamId ? g.homeGoals : g.awayGoals;
  const theirs = g.home === teamId ? g.awayGoals : g.homeGoals;
  const won = mine > theirs;
  const suffix = g.decision === 'OT' ? ' n.V.' : g.decision === 'SO' ? ' n.P.' : '';
  return { text: `${mine}:${theirs}${suffix}`, tone: won ? 'text-emerald-300' : g.decision === 'REG' ? 'text-rose-300' : 'text-amber-300', letter: won ? 'S' : g.decision === 'REG' ? 'N' : 'OTN' };
}

function Overview({ onOpen, onGoalieMode }: { onOpen: (b: BoxScore[]) => void; onGoalieMode: (m: GoalieMode) => void }) {
  const { offLeague, season, openPlayer } = useGame();
  if (!offLeague || !season) return null;
  const games = teamGames(season, EXPANSION_TEAM_ID);
  const played = games.filter((g) => g.homeGoals >= 0);
  const upcoming = games.filter((g) => g.homeGoals < 0).slice(0, 5);
  const team = (id: string) => offLeague.teams.find((t) => t.id === id);
  const ts = season.teamStats[EXPANSION_TEAM_ID]!;
  const gp = played.length || 1;
  const gf = played.reduce((s, g) => s + (g.home === EXPANSION_TEAM_ID ? g.homeGoals : g.awayGoals), 0);
  const ga = played.reduce((s, g) => s + (g.home === EXPANSION_TEAM_ID ? g.awayGoals : g.homeGoals), 0);
  const scorers = skaterTable(offLeague, season).filter((r) => r.teamId === EXPANSION_TEAM_ID).slice(0, 6);
  const chem = Math.round(season.chemistry[EXPANSION_TEAM_ID] ?? 0);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Nächste Spiele">
        <ul className="space-y-1.5 p-4 text-sm">
          {upcoming.map((g) => {
            const home = g.home === EXPANSION_TEAM_ID;
            const opp = team(home ? g.away : g.home);
            return (
              <li key={g.id} className="flex items-center gap-2">
                <span className="w-32 text-xs text-slate-500">{dayLabel(g.day, offLeague.config.seasonStartYear)}</span>
                <span className="w-6 text-xs text-slate-400">{home ? 'vs' : '@'}</span>
                {opp && <Logo spec={opp.logo} size={18} />}
                <span className="text-slate-200">{opp?.city}</span>
              </li>
            );
          })}
          {!upcoming.length && <li className="text-slate-500">Keine Spiele mehr.</li>}
        </ul>
        <div className="border-t border-coal-700 p-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Goalie-Rotation
            <select value={season.options.goalieMode} onChange={(e) => onGoalieMode(e.target.value as GoalieMode)} className="rounded border border-coal-600 bg-coal-850 px-1.5 py-1 text-xs">
              <option value="auto">Automatisch</option>
              <option value="starter">Immer Starter</option>
              <option value="rotate">Abwechselnd</option>
            </select>
          </label>
        </div>
      </Panel>

      <Panel title="Letzte Ergebnisse">
        <ul className="space-y-1 p-4 text-sm">
          {[...played].reverse().slice(0, 8).map((g) => {
            const home = g.home === EXPANSION_TEAM_ID;
            const opp = team(home ? g.away : g.home);
            const r = resultLabel(EXPANSION_TEAM_ID, g);
            const box = season.boxes[g.id];
            return (
              <li key={g.id}>
                <button type="button" disabled={!box} onClick={() => box && onOpen([box])} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-coal-800">
                  <span className={`w-8 text-xs font-bold ${r.tone}`}>{r.letter}</span>
                  <span className="w-6 text-xs text-slate-400">{home ? 'vs' : '@'}</span>
                  {opp && <Logo spec={opp.logo} size={18} />}
                  <span className="flex-1 text-slate-200">{opp?.city}</span>
                  <span className={`font-mono ${r.tone}`}>{r.text}</span>
                </button>
              </li>
            );
          })}
          {!played.length && <li className="text-slate-500">Noch keine Spiele.</li>}
        </ul>
      </Panel>

      <Panel title="Team">
        <dl className="grid grid-cols-2 gap-2 p-4 text-sm">
          {[
            ['Tore/Spiel', (gf / gp).toFixed(2)],
            ['Gegentore/Spiel', (ga / gp).toFixed(2)],
            ['Powerplay', ts.ppOpp ? `${((ts.ppGoals / ts.ppOpp) * 100).toFixed(1)} %` : '–'],
            ['Penalty Kill', ts.pkOpp ? `${(100 - (ts.pkGa / ts.pkOpp) * 100).toFixed(1)} %` : '–'],
            ['Schüsse/Spiel', (ts.shotsFor / gp).toFixed(1)],
            ['Teamchemie', `${chem}/100`],
          ].map(([l, v]) => (
            <div key={l} className="rounded bg-coal-850 p-2">
              <dt className="text-[11px] text-slate-500">{l}</dt>
              <dd className="font-mono text-slate-100">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center px-4 pb-3 text-xs text-slate-400">
          Teamchemie wächst mit jedem Spiel. {season.options.misfitsBonus && 'Misfits-Bonus: In den ersten 20 Spielen spielt das Expansionsteam mit besonderem Ehrgeiz (+2).'}
          <Tip text="Chemie verbessert alle Spieler leicht; das neu zusammengewürfelte Expansionsteam startet niedriger als eingespielte Teams." />
        </div>
      </Panel>

      <Panel title="Topscorer (Team)">
        <ul className="space-y-1 p-4 text-sm">
          {scorers.map((s) => (
            <li key={s.playerId} className="flex justify-between">
              <button type="button" className="hover:text-ice-300" onClick={() => openPlayer(s.playerId)}>
                {s.name}
              </button>
              <span className="font-mono text-slate-300">
                {s.g}+{s.a}={s.p}
              </span>
            </li>
          ))}
          {!scorers.length && <li className="text-slate-500">–</li>}
        </ul>
      </Panel>

      <OwnerFansPanel league={offLeague} meta={season.meta} />
      <NewsFeed news={season.news} className="lg:col-span-2" />

      <Panel title="Ereignisse" className="lg:col-span-3">
        <ul className="max-h-72 space-y-1 overflow-auto p-4 text-xs">
          {[...season.log].reverse().slice(0, 40).map((e, i) => (
            <li key={i} className={e.kind === 'injury' ? 'text-rose-300' : e.kind === 'return' ? 'text-emerald-300' : e.kind === 'trade' || e.kind === 'waiver' ? 'text-amber-200' : 'text-slate-400'}>
              <span className="mr-2 font-mono text-slate-600">{dayLabel(e.day, offLeague.config.seasonStartYear)}</span>
              {e.text}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function ScheduleTab({ onOpen }: { onOpen: (b: BoxScore[]) => void }) {
  const { offLeague, season } = useGame();
  if (!offLeague || !season) return null;
  const games = teamGames(season, EXPANSION_TEAM_ID);
  const team = (id: string) => offLeague.teams.find((t) => t.id === id);
  const lastDay = new Map<number, boolean>();
  games.forEach((g) => lastDay.set(g.day, true));
  return (
    <Panel title={`Spielplan (${games.length} Spiele)`}>
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full text-sm tabular">
          <thead className="sticky top-0 bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">Gegner</th>
              <th className="px-3 py-2">Ergebnis</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-coal-800">
            {games.map((g, i) => {
              const home = g.home === EXPANSION_TEAM_ID;
              const opp = team(home ? g.away : g.home);
              const done = g.homeGoals >= 0;
              const r = done ? resultLabel(EXPANSION_TEAM_ID, g) : null;
              const b2b = lastDay.has(g.day - 1);
              return (
                <tr key={g.id} className={g.day === season.day ? 'bg-ice-500/10' : ''}>
                  <td className="px-3 py-1 font-mono text-slate-500">{i + 1}</td>
                  <td className="px-3 text-xs text-slate-300">
                    {dayLabel(g.day, offLeague.config.seasonStartYear)} {b2b && <span className="text-amber-300" title="Back-to-Back">B2B</span>}
                    {g.day === season.deadlineDay && <span className="ml-1 text-violet-300">Deadline</span>}
                  </td>
                  <td className="px-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-5 text-xs text-slate-500">{home ? 'vs' : '@'}</span>
                      {opp && <Logo spec={opp.logo} size={16} />}
                      {opp?.city} {opp?.name}
                    </span>
                  </td>
                  <td className={`px-3 font-mono ${r?.tone ?? 'text-slate-500'}`}>{r ? `${r.letter} ${r.text}` : '–'}</td>
                  <td className="px-3 text-right">
                    {season.boxes[g.id] && (
                      <button type="button" className="text-xs text-ice-300 hover:underline" onClick={() => onOpen([season.boxes[g.id]!])}>
                        Bericht
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
