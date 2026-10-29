import type { Player } from '../../engine';
import { EXPANSION_TEAM_ID, GRADE_POINTS, assetLabel, formatMoney, fullName, groupOf, summarizeSelection } from '../../engine';
import { useGame } from '../../store/game';
import { Logo } from '../components/Logo';
import { Button, GradeBadge, Panel } from '../components/ui';

export function ResultsScreen() {
  const { league, postDraftLeague, draft, openPlayer, newGame, reset, seed, startOffseason } = useGame();
  if (!league || !postDraftLeague || !draft?.grades) return null;
  const g = draft.grades;
  const me = league.teams.find((t) => t.id === EXPANSION_TEAM_ID);
  const sum = summarizeSelection(league, draft.protections, draft.selection);
  const mockSum = summarizeSelection(league, draft.protections, g.mock);
  const pl = (id: string) => postDraftLeague.players[id] as Player;
  const roster = Object.values(postDraftLeague.players).filter((p) => p.teamId === EXPANSION_TEAM_ID);
  const gpa = g.picks.reduce((s, p) => s + GRADE_POINTS[p.grade], 0) / Math.max(1, g.picks.length);
  const steals = [...g.picks].sort((a, b) => pl(b.playerId).ovr - pl(a.playerId).ovr).slice(0, 3);
  const misses = [...g.picks].filter((p) => p.bestPlayerId !== p.playerId).sort((a, b) => b.bestValue - b.value - (a.bestValue - a.value)).slice(0, 3);
  const sameAsAi = g.picks.filter((p) => p.aiPlayerId === p.playerId).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5">
        {me && <Logo spec={me.logo} size={72} />}
        <div className="flex-1">
          <div className="text-xs uppercase tracking-[0.25em] text-ice-300">Expansion-Draft-Bilanz</div>
          <h1 className="text-3xl font-black text-white">
            {me?.city} {me?.name}
          </h1>
          <p className="text-slate-400">
            {roster.length} Spieler · {sum.counts.F} F / {sum.counts.D} D / {sum.counts.G} G · Cap Hits {formatMoney(sum.capTotal)} · {sum.underContract} unter Vertrag
          </p>
        </div>
        <div className="text-center">
          <GradeBadge grade={g.overall} size="xl" />
          <div className="mt-1 text-xs text-slate-400">Pick-Schnitt {gpa.toFixed(2)} / 4</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Dein Draft vs. KI">
          <div className="space-y-2 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Dein Kaderwert</span>
              <span className="font-mono">{g.userValue.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">KI-Mock-Draft</span>
              <span className="font-mono">{g.mockValue.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Gleicher Pick wie KI</span>
              <span className="font-mono">{sameAsAi}/32</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Cap Hits KI</span>
              <span className="font-mono">{formatMoney(mockSum.capTotal)}</span>
            </div>
          </div>
        </Panel>
        <Panel title="Beste Picks (OVR)">
          <ul className="space-y-1.5 p-4 text-sm">
            {steals.map((s) => (
              <li key={s.playerId} className="flex items-center justify-between">
                <button type="button" className="hover:text-ice-300" onClick={() => openPlayer(s.playerId)}>
                  {fullName(pl(s.playerId))}
                </button>
                <span className="font-mono text-slate-300">{pl(s.playerId).ovr}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Verpasste Chancen">
          <ul className="space-y-1.5 p-4 text-sm">
            {misses.length === 0 && <li className="text-slate-400">Keine – du hast überall den Bestwert erwischt.</li>}
            {misses.map((m) => (
              <li key={m.teamId} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <button type="button" className="hover:text-ice-300" onClick={() => openPlayer(m.bestPlayerId)}>
                    {fullName(pl(m.bestPlayerId))}
                  </button>
                  <span className="text-slate-500"> statt {pl(m.playerId).lastName}</span>
                </span>
                <span className="font-mono text-xs text-rose-300">−{(m.bestValue - m.value).toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {(draft.acquired.length > 0 || Object.keys(draft.signings).length > 0) && (
        <Panel title="Verhandlungsfenster & Side Deals">
          <div className="grid gap-4 p-4 text-sm md:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Unterschriften</div>
              <ul className="space-y-1">
                {Object.values(draft.signings).map((sg) => (
                  <li key={sg.playerId} className="flex justify-between gap-2">
                    <button type="button" className="hover:text-ice-300" onClick={() => openPlayer(sg.playerId)}>
                      {fullName(pl(sg.playerId))}
                    </button>
                    <span className="font-mono text-slate-300">
                      {formatMoney(sg.contract.capHit)} × {sg.contract.yearsLeft} J.
                    </span>
                  </li>
                ))}
                {!Object.keys(draft.signings).length && <li className="text-slate-500">Keine.</li>}
              </ul>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Erhaltene Assets</div>
              <ul className="space-y-1">
                {draft.acquired.map((a) => (
                  <li key={JSON.stringify(a)} className="text-emerald-300">
                    + {assetLabel(a, postDraftLeague)}
                  </li>
                ))}
                {!draft.acquired.length && <li className="text-slate-500">Keine.</li>}
              </ul>
            </div>
          </div>
        </Panel>
      )}

      <Panel title="Pick für Pick – mit Vergleich „Was die KI gewählt hätte“">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead className="bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Dein Pick</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Alter</th>
                <th className="px-3 py-2">OVR</th>
                <th className="px-3 py-2">POT</th>
                <th className="px-3 py-2 text-right">Cap Hit</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2">Analyse</th>
                <th className="px-3 py-2">KI-Wahl</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-coal-800">
              {[...g.picks]
                .sort((a, b) => 'FDG'.indexOf(groupOf(pl(a.playerId).position)) - 'FDG'.indexOf(groupOf(pl(b.playerId).position)) || pl(b.playerId).ovr - pl(a.playerId).ovr)
                .map((pk) => {
                  const t = league.teams.find((x) => x.id === pk.teamId);
                  const p = pl(pk.playerId);
                  const ai = pk.aiPlayerId ? pl(pk.aiPlayerId) : null;
                  return (
                    <tr key={pk.playerId}>
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          {t && <Logo spec={t.logo} size={18} />}
                          <span className="font-mono text-xs">{t?.abbrev}</span>
                        </span>
                      </td>
                      <td className="px-3">
                        <button type="button" className="font-medium hover:text-ice-300" onClick={() => openPlayer(p.id)}>
                          {fullName(p)}
                        </button>
                      </td>
                      <td className="px-3 font-mono text-xs">{p.position}</td>
                      <td className="px-3">{p.age}</td>
                      <td className="px-3 font-mono">{p.ovr}</td>
                      <td className="px-3 font-mono text-slate-400">{p.potential}</td>
                      <td className="px-3 text-right font-mono">{p.contract ? formatMoney(p.contract.capHit) : '–'}</td>
                      <td className="px-3">
                        <GradeBadge grade={pk.grade} size="sm" />
                      </td>
                      <td className="max-w-xs px-3 text-xs text-slate-300">{pk.comment}</td>
                      <td className="px-3 text-xs">
                        {ai && ai.id === p.id ? (
                          <span className="text-emerald-300">= gleich</span>
                        ) : ai ? (
                          <button type="button" className="text-slate-300 hover:text-ice-300" onClick={() => openPlayer(ai.id)}>
                            {fullName(ai)} <span className="text-slate-500">({ai.position}, {ai.ovr})</span>
                          </button>
                        ) : (
                          '–'
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Wie geht es weiter?">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <p className="flex-1 text-sm text-slate-400">
            Weiter geht es mit der Offseason: Draft-Lotterie und Entry Draft, Free Agency, Trades und die erste Aufstellung. Oder probiere denselben Seed mit
            anderer Strategie – gleicher Seed und gleiche Entscheidungen führen zum identischen Ergebnis.
          </p>
          <Button variant="ghost" onClick={() => newGame(seed, league.config.rules, league.config.difficulty)}>
            Gleicher Seed, neu starten
          </Button>
          <Button variant="ghost" onClick={reset}>
            Neue Liga
          </Button>
          <Button className="animate-glow" onClick={startOffseason}>
            Weiter zur Offseason →
          </Button>
        </div>
      </Panel>
    </div>
  );
}
