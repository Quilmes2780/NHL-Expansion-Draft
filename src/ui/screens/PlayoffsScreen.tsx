import { useMemo, useState } from 'react';
import type { BoxScore, PlayoffState, Series } from '../../engine';
import { EXPANSION_TEAM_ID, ROUND_NAMES, dayLabel, isEliminated, seriesOf, skaterTable } from '../../engine';
import { useGame } from '../../store/game';
import { BoxScoreModal } from '../components/BoxScoreView';
import { Logo } from '../components/Logo';
import { Button, Panel, Tip } from '../components/ui';
import { NewsFeed, OwnerFansPanel } from '../components/WorldPanels';
import { LineupTab } from './offseason/LineupTab';
import { SimNotice } from '../components/SimNotice';

function SeriesCard({ s, po, highlight, onSelect }: { s: Series | undefined; po: PlayoffState; highlight: boolean; onSelect: (s: Series) => void }) {
  const { offLeague } = useGame();
  if (!offLeague) return null;
  if (!s)
    return <div className="flex h-[74px] items-center justify-center rounded-lg border border-dashed border-coal-700 text-xs text-slate-600">offen</div>;
  const row = (id: string, wins: number) => {
    const t = offLeague.teams.find((x) => x.id === id);
    const lost = s.winner !== null && s.winner !== id;
    return (
      <div className={`flex items-center gap-2 px-2 py-1 ${lost ? 'opacity-40' : ''} ${s.winner === id ? 'font-bold' : ''}`}>
        {t && <Logo spec={t.logo} size={18} />}
        <span className="flex-1 truncate text-xs text-slate-100">
          {t?.city}
          <span className="ml-1 text-[10px] text-slate-500">{po.seeds[id] ?? ''}</span>
        </span>
        {s.homeIce === id && <span className="text-[9px] text-slate-500" title="Heimrecht">H</span>}
        <span className="w-4 text-right font-mono text-sm text-white">{wins}</span>
      </div>
    );
  };
  return (
    <button
      type="button"
      onClick={() => onSelect(s)}
      title="Ergebnisse der Serie anzeigen"
      className={`block w-full rounded-lg border bg-coal-900 text-left hover:border-ice-300 ${highlight ? 'border-ice-400 ring-1 ring-ice-400/40' : 'border-coal-700'}`}
    >
      {row(s.a, s.winsA)}
      <div className="h-px bg-coal-700" />
      {row(s.b, s.winsB)}
    </button>
  );
}

function Bracket({ po, onSelect }: { po: PlayoffState; onSelect: (s: Series) => void }) {
  const confs = [...new Set(po.rounds[0]!.map((s) => s.conference))];
  const mine = (s: Series | undefined) => !!s && (s.a === EXPANSION_TEAM_ID || s.b === EXPANSION_TEAM_ID);
  const final = po.rounds[3]?.[0];
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_200px_1fr]">
      {confs.map((conf, ci) => {
        const cols = [0, 1, 2].map((r) => po.rounds[r]?.filter((s) => s.conference === conf) ?? []);
        const sizes = [4, 2, 1];
        const columns = cols.map((c, r) => Array.from({ length: sizes[r]! }, (_, i) => c[i]));
        const ordered = ci === 0 ? columns : [...columns].reverse();
        return (
          <Panel key={conf} title={`${conf} Conference`} className={ci === 1 ? 'xl:order-3' : ''}>
            <div className="grid grid-cols-3 gap-2 p-3">
              {ordered.map((col, i) => (
                <div key={i} className="flex flex-col justify-around gap-2">
                  {col.map((s, j) => (
                    <SeriesCard key={s?.id ?? `${i}-${j}`} s={s} po={po} highlight={mine(s)} onSelect={onSelect} />
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        );
      })}
      <div className="flex flex-col justify-center gap-2 xl:order-2">
        <div className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Finale</div>
        <SeriesCard s={final} po={po} highlight={mine(final)} onSelect={onSelect} />
      </div>
    </div>
  );
}

/** The current round, or the one just finished while the next has not started yet. */
const latestPlayedRound = (po: PlayoffState): number => (po.round > 0 && !po.rounds[po.round]?.some((s) => s.games.length) ? po.round - 1 : po.round);

/** Every game of every series in one round: winner, score and overtime; own games open the box score. */
function RoundResults({
  po,
  round,
  setRound,
  selected,
  onBox,
}: {
  po: PlayoffState;
  round: number;
  setRound: (r: number) => void;
  selected: string | null;
  onBox: (b: BoxScore) => void;
}) {
  const { offLeague } = useGame();
  if (!offLeague) return null;
  const abbr = (id: string) => offLeague.teams.find((t) => t.id === id)?.abbrev ?? '?';
  const series = po.rounds[round] ?? [];
  return (
    <Panel
      title="Ergebnisse"
      actions={
        <div className="flex flex-wrap gap-1">
          {po.rounds.map((_, r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRound(r)}
              className={`rounded px-2 py-0.5 text-xs ${r === round ? 'bg-coal-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {ROUND_NAMES[r]}
            </button>
          ))}
        </div>
      }
    >
      <div className="divide-y divide-coal-800">
        {series.map((s) => {
          const leader = s.winsA > s.winsB ? s.a : s.b;
          const lead =
            s.winsA === s.winsB
              ? `Serie ausgeglichen ${s.winsA}–${s.winsB}`
              : `${abbr(leader)} ${s.winner ? 'gewinnt' : 'führt'} ${Math.max(s.winsA, s.winsB)}–${Math.min(s.winsA, s.winsB)}`;
          const own = s.a === EXPANSION_TEAM_ID || s.b === EXPANSION_TEAM_ID;
          return (
            <div key={s.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${s.id === selected ? 'bg-ice-500/10' : ''} ${own ? 'border-l-2 border-ice-400' : ''}`}>
              <div className="w-44 shrink-0 text-sm">
                <span className="font-semibold text-white">{abbr(s.a)}</span> <span className="text-slate-500">vs</span>{' '}
                <span className="font-semibold text-white">{abbr(s.b)}</span>
                <div className="text-[11px] text-slate-400">{s.games.length ? lead : 'noch kein Spiel'}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {s.games.map((gid, i) => {
                  const r = po.season.results[gid];
                  if (!r) return null;
                  const winner = r.homeGoals > r.awayGoals ? r.home : r.away;
                  const ot = r.decision !== 'REG';
                  const title = `${dayLabel(r.day, offLeague.config.seasonStartYear)} · ${abbr(r.away)} @ ${abbr(r.home)} ${r.awayGoals}:${r.homeGoals}${ot ? ' n. V.' : ''}`;
                  const label = (
                    <>
                      <span className="text-slate-500">G{i + 1}</span> <span className="font-semibold text-white">{abbr(winner)}</span>{' '}
                      <span className="font-mono">
                        {Math.max(r.homeGoals, r.awayGoals)}:{Math.min(r.homeGoals, r.awayGoals)}
                      </span>
                      {ot && <span className="ml-1 text-amber-300">OT</span>}
                    </>
                  );
                  const box = po.season.boxes[gid];
                  return box ? (
                    <button
                      key={gid}
                      type="button"
                      title={`${title} – Boxscore öffnen`}
                      onClick={() => onBox(box)}
                      className="rounded border border-ice-500/40 bg-coal-850 px-1.5 py-0.5 text-xs hover:border-ice-300"
                    >
                      {label}
                    </button>
                  ) : (
                    <span key={gid} title={title} className="rounded border border-coal-700 bg-coal-850 px-1.5 py-0.5 text-xs">
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function PlayoffsScreen() {
  const { offLeague, playoffs: po, simulatePlayoffs, simulating, lastBoxes, tickerEnabled, clearBoxes, finishSeason, openPlayer } = useGame();
  const [tab, setTab] = useState<'bracket' | 'stats' | 'lineup'>('bracket');
  const [resultRound, setResultRound] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [openBox, setOpenBox] = useState<BoxScore | null>(null);
  const scorers = useMemo(() => (offLeague && po ? skaterTable(offLeague, po.season).slice(0, 15) : []), [offLeague, po]);
  if (!offLeague || !po) return null;
  const mySeries = seriesOf(po, EXPANSION_TEAM_ID);
  const out = isEliminated(po, EXPANSION_TEAM_ID);
  const champ = po.champion ? offLeague.teams.find((t) => t.id === po.champion) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-amber-300">Playoffs {offLeague.config.seasonLabel}</div>
          <h1 className="text-3xl font-black text-white">{champ ? `${champ.city} ${champ.name} sind Meister!` : ROUND_NAMES[po.round]}</h1>
          <p className="text-sm text-slate-400">
            {dayLabel(po.season.day, offLeague.config.seasonStartYear)} ·{' '}
            {!mySeries ? 'Dein Team hat die Playoffs verpasst.' : out ? 'Dein Team ist ausgeschieden.' : `Dein Team: ${ROUND_NAMES[mySeries.round]}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!po.champion && (
            <>
              <Button variant="ghost" disabled={simulating} onClick={() => simulatePlayoffs('day')}>
                Nächster Spieltag
              </Button>
              <Button variant="ghost" disabled={simulating} onClick={() => simulatePlayoffs('round')}>
                Runde zu Ende
              </Button>
              <Button disabled={simulating} onClick={() => simulatePlayoffs('end')}>
                Bis zum Titel
              </Button>
            </>
          )}
          {po.champion && (
            <Button className="animate-glow" onClick={finishSeason}>
              Zur Saisonbilanz →
            </Button>
          )}
        </div>
      </div>

      <SimNotice onLineup={() => setTab('lineup')} />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['bracket', 'Bracket'],
            ['stats', 'Playoff-Scorer'],
            ['lineup', 'Aufstellung'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === id ? 'bg-coal-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
        <Tip text="Top 3 jeder Division plus zwei Wildcards je Conference. Best-of-7, Heimrecht (H) für das in der regulären Saison bessere Team nach dem Muster 2-2-1-1-1. In den Playoffs gibt es kein Shootout: Overtime wird in 20-Minuten-Abschnitten bis zum ersten Tor gespielt." />
      </div>

      {tab === 'bracket' && (
        <>
          <Bracket
            po={po}
            onSelect={(s) => {
              setSelected(s.id);
              setResultRound(s.round);
            }}
          />
          <RoundResults po={po} round={Math.min(resultRound ?? latestPlayedRound(po), po.rounds.length - 1)} setRound={setResultRound} selected={selected} onBox={setOpenBox} />
        </>
      )}
      {tab === 'stats' && (
        <Panel title="Playoff-Scorer">
          <table className="w-full text-sm tabular">
            <thead className="bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                {['Spieler', 'Team', 'GP', 'G', 'A', 'P', '+/-'].map((h) => (
                  <th key={h} className="px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-coal-800">
              {scorers.map((r) => (
                <tr key={r.playerId} className={r.teamId === EXPANSION_TEAM_ID ? 'bg-ice-500/10' : ''}>
                  <td className="px-3 py-1">
                    <button type="button" className="hover:text-ice-300" onClick={() => openPlayer(r.playerId)}>
                      {r.name}
                    </button>
                  </td>
                  <td className="px-3 font-mono text-xs">{offLeague.teams.find((t) => t.id === r.teamId)?.abbrev}</td>
                  <td className="px-3 font-mono">{r.gp}</td>
                  <td className="px-3 font-mono">{r.g}</td>
                  <td className="px-3 font-mono">{r.a}</td>
                  <td className="px-3 font-mono font-bold text-white">{r.p}</td>
                  <td className="px-3 font-mono">{r.pm > 0 ? `+${r.pm}` : r.pm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {tab === 'lineup' && <LineupTab />}

      <div className="grid gap-4 lg:grid-cols-3">
        <NewsFeed news={po.season.news} title="Playoff-News" className="lg:col-span-2" />
        <OwnerFansPanel league={offLeague} meta={po.season.meta} />
      </div>

      {tickerEnabled && lastBoxes.length > 0 && !simulating && <BoxScoreModal boxes={lastBoxes} league={offLeague} animate onClose={clearBoxes} />}
      {openBox && <BoxScoreModal boxes={[openBox]} league={offLeague} animate={false} onClose={() => setOpenBox(null)} />}
    </div>
  );
}
