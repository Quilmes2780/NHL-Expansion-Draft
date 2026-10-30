import { useMemo, useState } from 'react';
import type { Player } from '../../../engine';
import {
  EXPANSION_TEAM_ID,
  FA_DAYS,
  agentHint,
  entryLevelContract,
  formatMoney,
  formatMoneyShort,
  formatRange,
  fullName,
  groupOf,
  maxSalary,
  negotiationProfile,
  roleLabel,
  scoutLevel,
  scoutView,
  unsignedPicks,
  userCapSpace,
} from '../../../engine';
import { useGame } from '../../../store/game';
import { OfferForm } from '../../components/OfferForm';
import { Badge, Button, Panel, Tip } from '../../components/ui';

const FA_TIP =
  'Free Agency läuft über mehrere Tage. Gib Angebote ab und beende den Tag: Jeder Spieler wählt das für ihn beste Angebot (Geld, Laufzeit, Rolle, Team/Stadt), sobald es seine Erwartung erfüllt. Seine Ansprüche sinken von Tag zu Tag leicht. Offene Angebote blockieren Cap Space.';

export function FreeAgencyTab() {
  const { offLeague, off, draft, faOffer, faWithdraw, faAdvance, finishFa, faOwnRfa, faAutoFill, signPick, openPlayer } = useGame();
  const [filled, setFilled] = useState<string[] | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [group, setGroup] = useState<'all' | 'F' | 'D' | 'G'>('all');
  const [error, setError] = useState<string | null>(null);
  const pool = useMemo(
    () => (offLeague && off?.fa ? off.fa.pool.map((id) => offLeague.players[id] as Player).sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id)) : []),
    [offLeague, off],
  );
  if (!offLeague || !off) return null;
  const fa = off.fa;
  if (!fa)
    return (
      <Panel>
        <p className="p-8 text-center text-slate-500">Die Free Agency beginnt nach dem Entry Draft.</p>
      </Panel>
    );
  const level = (id: string) => (draft ? scoutLevel(draft, id) : 0);
  const shown = pool.filter((p) => group === 'all' || groupOf(p.position) === group);
  const cur = selected ? offLeague.players[selected] : shown[0];
  const space = userCapSpace(offLeague, fa);
  const ownRfas = Object.entries(fa.ownRfas);
  const picks = unsignedPicks(offLeague, EXPANSION_TEAM_ID);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center text-lg font-bold text-white">
          {fa.done ? 'Free Agency beendet' : `Tag ${fa.day} von ${FA_DAYS}`} <Tip text={FA_TIP} />
        </span>
        <span className="text-sm text-slate-400">
          Cap Space (inkl. offener Angebote): <span className="font-mono text-slate-100">{formatMoney(space)}</span>
        </span>
        <span className="flex-1" />
        {!fa.done && (
          <Button variant="ghost" onClick={() => setFilled(faAutoFill())} title="Verlängert eigene RFAs und bietet den besten Free Agents für fehlende Positionen (und bis zum Cap Floor) etwas über ihrer Forderung.">
            Kader automatisch auffüllen
          </Button>
        )}
        {!fa.done && (
          <Button onClick={faAdvance} className="animate-glow">
            Tag beenden →
          </Button>
        )}
        {fa.done && off.stage === 'fa' && <Button onClick={finishFa}>Free Agency abschließen</Button>}
      </div>

      {filled && (
        <Panel
          title="Kader automatisch auffüllen"
          actions={
            <Button variant="ghost" onClick={() => setFilled(null)}>
              OK
            </Button>
          }
        >
          <ul className="space-y-0.5 p-4 text-sm text-slate-300">
            {filled.map((t) => (
              <li key={t}>• {t}</li>
            ))}
            {!filled.length && <li className="text-slate-500">Nichts zu tun: Positionen und Cap Floor sind bereits abgedeckt (offene Angebote eingerechnet).</li>}
            {filled.length > 0 && (
              <li className="pt-2 text-xs text-slate-400">
                Angebote sind keine Garantie – beende den Tag und drücke bei Bedarf erneut. Danach unter „Kader & Aufstellung“ den besten NHL-Kader bilden.
              </li>
            )}
          </ul>
        </Panel>
      )}

      {ownRfas.length > 0 && (
        <Panel title="Eigene pending RFAs – exklusive Verlängerung">
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {ownRfas.map(([pid, neg]) => {
              const p = offLeague.players[pid] as Player;
              const prof = negotiationProfile(offLeague, p);
              const last = neg.offers.at(-1);
              return (
                <div key={pid} className="rounded-lg border border-coal-700 bg-coal-850 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <button type="button" className="font-semibold text-slate-100 hover:text-ice-300" onClick={() => openPlayer(pid)}>
                      {fullName(p)}
                    </button>
                    <span className="text-xs text-slate-400">
                      {p.position} · {p.age} J. · OVR {p.ovr}
                    </span>
                  </div>
                  {last && <p className="mt-1 text-xs text-slate-400">{last.message}</p>}
                  {neg.status === 'signed' ? (
                    <Badge tone="emerald">verlängert</Badge>
                  ) : neg.status === 'walked' ? (
                    <Badge tone="rose">geht in die Free Agency</Badge>
                  ) : fa.done ? null : (
                    <div className="mt-2">
                      <OfferForm
                        key={neg.offers.length}
                        p={p}
                        initial={last?.counter ?? { salary: prof.ask, years: prof.prefYears, role: prof.desiredRole }}
                        min={offLeague.config.minSalary}
                        max={maxSalary(offLeague.config)}
                        desiredRole={prof.desiredRole}
                        submitLabel="Angebot"
                        onSubmit={(o) => faOwnRfa(pid, o)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {picks.length > 0 && (
        <Panel title={`Ungesignte Draft Picks (${picks.length})`} actions={<Tip text="Draft Picks ohne Vertrag zählen nicht gegen Cap und 50-Verträge-Limit. Mit 20 Jahren erhalten sie automatisch ihren Einstiegsvertrag (ELC). Gesignte Picks starten im Farmteam; ein ELC zählt dort nicht gegen den Cap." />}>
          <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead className="bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Spieler</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2 text-right">Alter</th>
                <th className="px-3 py-2 text-right">OVR</th>
                <th className="px-3 py-2 text-right">Pot.</th>
                <th className="px-3 py-2 text-right">ELC</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-coal-800">
              {picks.map((p) => {
                const elc = entryLevelContract(offLeague, p);
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-1">
                      <button type="button" className="hover:text-ice-300" onClick={() => openPlayer(p.id)}>
                        {fullName(p)}
                      </button>
                    </td>
                    <td className="px-3 font-mono text-xs">{p.position}</td>
                    <td className="px-3 text-right font-mono">{p.age}</td>
                    <td className="px-3 text-right font-mono">{p.ovr}</td>
                    <td className="px-3 text-right font-mono">{p.potential}</td>
                    <td className="whitespace-nowrap px-3 text-right font-mono text-slate-300">
                      {formatMoneyShort(elc.capHit)} · {elc.yearsLeft} J.
                    </td>
                    <td className="px-3 py-1 text-right">
                      <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => setPickError(signPick(p.id))}>
                        Signen
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {pickError && <p className="px-3 pb-3 text-xs text-rose-300">{pickError}</p>}
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel
          title={`Markt (${pool.length})`}
          actions={
            <div className="flex overflow-hidden rounded-md border border-coal-600">
              {(['all', 'F', 'D', 'G'] as const).map((g) => (
                <button key={g} type="button" onClick={() => setGroup(g)} className={`px-2.5 py-1 text-xs font-semibold ${group === g ? 'bg-ice-500/20 text-ice-200' : 'text-slate-400 hover:bg-coal-800'}`}>
                  {g === 'all' ? 'Alle' : g}
                </button>
              ))}
            </div>
          }
        >
          <div className="max-h-[calc(100vh-22rem)] overflow-auto">
            <table className="w-full text-sm tabular [&_td]:whitespace-nowrap">
              <thead className="sticky top-0 bg-coal-850 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">Spieler</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Alter</th>
                  <th className="px-3 py-2">OVR</th>
                  <th className="px-3 py-2">Forderung</th>
                  <th className="px-3 py-2">Interesse</th>
                  <th className="px-3 py-2">Dein Angebot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-coal-800">
                {shown.map((p) => {
                  const h = agentHint(offLeague, p);
                  const mine = fa.userOffers[p.id];
                  return (
                    <tr key={p.id} onClick={() => setSelected(p.id)} className={`cursor-pointer ${cur?.id === p.id ? 'bg-ice-500/10' : 'hover:bg-coal-800/60'}`}>
                      <td className="px-3 py-1.5 font-medium text-slate-100">{fullName(p)}</td>
                      <td className="px-3 font-mono text-xs">{p.position}</td>
                      <td className="px-3">{p.age}</td>
                      <td className="px-3 font-mono">{formatRange(scoutView(offLeague.seed, p, level(p.id)).ovr)}</td>
                      <td className="px-3 font-mono text-xs text-slate-300">
                        {formatMoney(h.salary[0])}–{(h.salary[1] / 1e6).toFixed(1)}
                      </td>
                      <td className="px-3 text-xs">
                        <Badge tone={h.interest === 'hoch' ? 'emerald' : h.interest === 'mittel' ? 'amber' : 'rose'}>{h.interest}</Badge>
                      </td>
                      <td className="px-3 text-xs text-ice-200">{mine ? `${formatMoney(mine.salary)} × ${mine.years}` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          {cur && fa.pool.includes(cur.id) && !fa.done && (
            <Panel
              title={`Angebot · ${fullName(cur)}`}
              actions={
                <button type="button" className="text-xs text-ice-300 hover:underline" onClick={() => openPlayer(cur.id)}>
                  Spielerkarte
                </button>
              }
            >
              <div className="space-y-3 p-4 text-sm">
                {(() => {
                  const h = agentHint(offLeague, cur);
                  return (
                    <p className="rounded-lg border border-coal-700 bg-coal-850 p-3 text-slate-300">
                      „{formatMoney(h.salary[0])} bis {formatMoney(h.salary[1])}, {h.years[0]}–{h.years[1]} Jahre, Rolle als {roleLabel(h.role, cur)}.“
                    </p>
                  );
                })()}
                <OfferForm
                  key={cur.id + (fa.userOffers[cur.id]?.salary ?? '')}
                  p={cur}
                  initial={fa.userOffers[cur.id] ?? { salary: agentHint(offLeague, cur).salary[1], years: agentHint(offLeague, cur).years[0], role: agentHint(offLeague, cur).role }}
                  min={offLeague.config.minSalary}
                  max={maxSalary(offLeague.config)}
                  desiredRole={agentHint(offLeague, cur).role}
                  submitLabel={fa.userOffers[cur.id] ? 'Angebot ändern' : 'Angebot abgeben'}
                  onSubmit={(o) => setError(faOffer(cur.id, o))}
                />
                {fa.userOffers[cur.id] && (
                  <Button variant="ghost" onClick={() => faWithdraw(cur.id)}>
                    Angebot zurückziehen
                  </Button>
                )}
                {error && <p className="text-xs text-rose-300">{error}</p>}
              </div>
            </Panel>
          )}
          <Panel title="Transaktionen">
            <ul className="max-h-80 space-y-1 overflow-auto p-4 text-xs">
              {[...fa.log].reverse().slice(0, 60).map((e, i) => (
                <li key={i} className={e.teamId === 'exp' ? 'text-emerald-300' : e.teamId === null ? 'text-rose-300' : 'text-slate-400'}>
                  <span className="mr-1 font-mono text-slate-600">{e.day === 0 ? 'Vorab' : `T${e.day}`}</span>
                  {e.text}
                </li>
              ))}
              {!fa.log.length && <li className="text-slate-500">Noch keine Transaktionen.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
