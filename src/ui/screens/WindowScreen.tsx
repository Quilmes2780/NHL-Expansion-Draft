import { useMemo, useState } from 'react';
import type { Offer, Player, Role } from '../../engine';
import {
  MAX_OFFERS,
  ROLE_RANK,
  agentHint,
  assetLabel,
  cityById,
  cityFactors,
  dealConflict,
  formatMoney,
  formatRange,
  fullName,
  isNegotiable,
  isPendingRfa,
  maxSalary,
  negotiationBlocker,
  roleLabel,
  scoutLevel,
  scoutView,
  teamLock,
} from '../../engine';
import { useGame } from '../../store/game';
import { RULE_TIPS, contractLabel } from '../text';
import { Logo } from '../components/Logo';
import { Badge, Button, Panel, ScoutDots, Tip } from '../components/ui';

const NEG_TIP =
  'Exklusives Verhandlungsfenster: Mit exponierten pending UFAs und RFAs darfst du vor dem Draft verhandeln. Eine Unterschrift zählt als dein Pick von diesem Team. Gehalt, Laufzeit und Rollenversprechen bestimmen die Zusage – Stadtfaktoren und das Owner-Mandat beeinflussen die Bereitschaft. Nach zu vielen schwachen Angeboten bricht der Agent ab.';
const DEAL_TIP =
  'Side Deals sind bindend: Nimmst du ein Angebot an, wird es beim Draft-Abschluss geprüft und vollzogen. „Nimm Spieler X“ legt deinen Pick fest, „Nimm Spieler X nicht“ sperrt ihn. Die Gegenleistung (Pick oder Prospect) geht nach dem Draft an dich.';

export function WindowScreen() {
  const [tab, setTab] = useState<'neg' | 'deals'>('neg');
  const { league, draft, goto } = useGame();
  if (!draft || !league) return null;
  const openDeals = draft.deals.filter((d) => d.status === 'open').length;
  const signed = Object.keys(draft.signings).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-white">Verhandlungen & Side Deals</h1>
          <p className="mt-1 text-slate-400">Das exklusive Fenster vor dem Draft: Verträge mit Free Agents und Absprachen mit den {league.config.existingTeams} GMs.</p>
        </div>
        <Button onClick={() => goto('draft')}>Zum Draft Board →</Button>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('neg')} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === 'neg' ? 'bg-coal-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
          Exklusives Fenster {signed > 0 && <span className="ml-1 text-emerald-300">· {signed} unterschrieben</span>}
        </button>
        <button type="button" onClick={() => setTab('deals')} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === 'deals' ? 'bg-coal-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
          Side Deals {openDeals > 0 && <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[11px] text-coal-950">{openDeals}</span>}
        </button>
      </div>
      {tab === 'neg' ? <Negotiations /> : <SideDeals />}
    </div>
  );
}

function statusOf(draft: NonNullable<ReturnType<typeof useGame.getState>['draft']>, id: string) {
  if (draft.signings[id]) return { label: 'unterschrieben', tone: 'emerald' as const };
  const n = draft.negotiations[id];
  if (n?.status === 'walked') return { label: 'abgebrochen', tone: 'rose' as const };
  if (n && n.offers.length) return { label: `Runde ${n.offers.length}/${MAX_OFFERS}`, tone: 'amber' as const };
  return null;
}

function Negotiations() {
  const { league, draft, openPlayer } = useGame();
  const [group, setGroup] = useState<'all' | 'UFA' | 'RFA'>('all');
  const candidates = useMemo(() => {
    if (!league || !draft) return [];
    return Object.entries(draft.protections)
      .flatMap(([teamId, l]) => l.exposedIds.map((id) => ({ teamId, p: league.players[id] as Player })))
      .filter(({ p }) => isNegotiable(p))
      .sort((a, b) => b.p.ovr - a.p.ovr);
  }, [league, draft]);
  const [selected, setSelected] = useState<string | null>(null);
  if (!league || !draft) return null;
  const shown = candidates.filter(({ p }) => group === 'all' || (group === 'RFA') === isPendingRfa(p));
  const current = candidates.find((c) => c.p.id === (selected ?? shown[0]?.p.id));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Panel
        title={
          <span className="flex items-center">
            Exponierte Free Agents ({candidates.length}) <Tip text={NEG_TIP} />
          </span>
        }
        actions={
          <div className="flex overflow-hidden rounded-md border border-coal-600">
            {(['all', 'UFA', 'RFA'] as const).map((g) => (
              <button key={g} type="button" onClick={() => setGroup(g)} className={`px-2.5 py-1 text-xs font-semibold ${group === g ? 'bg-ice-500/20 text-ice-200' : 'text-slate-400 hover:bg-coal-800'}`}>
                {g === 'all' ? 'Alle' : g}
              </button>
            ))}
          </div>
        }
      >
        <ul className="max-h-[calc(100vh-17rem)] divide-y divide-coal-800 overflow-auto">
          {shown.map(({ teamId, p }) => {
            const t = league.teams.find((x) => x.id === teamId);
            const v = scoutView(league.seed, p, scoutLevel(draft, p.id));
            const st = statusOf(draft, p.id);
            const hint = agentHint(league, p);
            const active = current?.p.id === p.id;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setSelected(p.id)} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${active ? 'bg-ice-500/10' : 'hover:bg-coal-800/70'}`}>
                  {t && <Logo spec={t.logo} size={22} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-100">{fullName(p)}</span>
                    <span className="block text-[11px] text-slate-400">
                      {t?.abbrev} · {p.position} · {p.age} J. · Interesse {hint.interest}
                    </span>
                  </span>
                  <span className="font-mono text-slate-200 tabular">{formatRange(v.ovr)}</span>
                  <Badge tone={isPendingRfa(p) ? 'violet' : 'amber'}>{isPendingRfa(p) ? 'RFA' : 'UFA'}</Badge>
                  {st && <Badge tone={st.tone}>{st.label}</Badge>}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>
      {current ? <NegotiationPanel key={current.p.id} p={current.p} teamId={current.teamId} onOpen={() => openPlayer(current.p.id)} /> : <Panel><p className="p-8 text-center text-slate-500">Keine exponierten Free Agents.</p></Panel>}
    </div>
  );
}

function NegotiationPanel({ p, teamId, onOpen }: { p: Player; teamId: string; onOpen: () => void }) {
  const { league, draft, offer } = useGame();
  const cfg = league!.config;
  const hint = agentHint(league!, p);
  const neg = draft!.negotiations[p.id];
  const last = neg?.offers.at(-1);
  const [salary, setSalary] = useState(() => last?.counter?.salary ?? Math.round((hint.salary[0] + hint.salary[1]) / 2 / 25_000) * 25_000);
  const [years, setYears] = useState(() => last?.counter?.years ?? hint.years[0]);
  const [role, setRole] = useState<Role>(() => last?.counter?.role ?? hint.role);
  if (!league || !draft) return null;
  const team = league.teams.find((t) => t.id === teamId);
  const v = scoutView(league.seed, p, scoutLevel(draft, p.id));
  const blocker = negotiationBlocker(league, draft, p.id);
  const signing = draft.signings[p.id];
  const franchise = league.franchise!;
  const factors = cityFactors(cityById(franchise.cityId), franchise.mandate, p);
  const fitSum = factors.reduce((s, f) => s + f.value, 0);
  const existingPick = draft.selection[teamId] && draft.selection[teamId] !== p.id ? league.players[draft.selection[teamId]!] : null;
  const isOpen = !signing && neg?.status !== 'walked' && !blocker;
  const submit = (o: Offer) => offer(p.id, o);

  return (
    <Panel
      title={`Verhandlung · ${team?.abbrev}`}
      actions={
        <button type="button" onClick={onOpen} className="text-xs text-ice-300 hover:underline">
          Spielerkarte
        </button>
      }
    >
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          {team && <Logo spec={team.logo} size={44} />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-black text-white">{fullName(p)}</div>
            <div className="text-xs text-slate-400">
              {p.position} · {p.age} J. · bisher {p.contract ? formatMoney(p.contract.capHit) : '–'} · {contractLabel(p)}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-black text-white tabular">{formatRange(v.ovr)}</div>
            <ScoutDots level={scoutLevel(draft, p.id)} />
          </div>
        </div>

        <div className="rounded-lg border border-coal-700 bg-coal-850 p-3 text-sm text-slate-300">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ice-300">Der Agent</div>„Wir reden über {formatMoney(hint.salary[0])} bis {formatMoney(hint.salary[1])} pro Jahr, {hint.years[0]}–{hint.years[1]} Jahre. Mein Klient sieht sich als{' '}
          {roleLabel(hint.role, p)}.“
          {isPendingRfa(p) && <p className="mt-1.5 text-xs text-slate-400">{RULE_TIPS.pendingRfa}</p>}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Stadt & Mandat</span>
            <span className={fitSum >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
              {fitSum >= 0 ? '+' : ''}
              {(fitSum * 100).toFixed(1)} %
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {factors.map((f) => (
              <span key={f.label} className={`rounded border px-1.5 py-0.5 text-[11px] ${f.value >= 0 ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'}`}>
                {f.label} {f.value >= 0 ? '+' : ''}
                {(f.value * 100).toFixed(1)} %
              </span>
            ))}
          </div>
        </div>

        {neg && neg.offers.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Verlauf</span>
              <span>Stimmung {neg.mood}/100</span>
            </div>
            <div className="mb-2 h-1.5 rounded-full bg-coal-700">
              <div className={`h-full rounded-full ${neg.mood > 60 ? 'bg-emerald-400' : neg.mood > 30 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${neg.mood}%` }} />
            </div>
            <ol className="space-y-1.5">
              {neg.offers.map((r, i) => (
                <li key={i} className="rounded-md border border-coal-700 bg-coal-850 p-2 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>
                      Angebot {i + 1}: {formatMoney(r.offer.salary)} × {r.offer.years} J. · {roleLabel(r.offer.role, p)}
                    </span>
                    <Badge tone={r.response === 'accept' ? 'emerald' : r.response === 'counter' ? 'amber' : 'rose'}>
                      {r.response === 'accept' ? 'Zusage' : r.response === 'counter' ? 'Gegenangebot' : r.response === 'reject' ? 'Abgelehnt' : 'Abbruch'}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-slate-400">{r.message}</div>
                  {r.counter && (
                    <div className="mt-1 flex items-center justify-between gap-2 text-ice-200">
                      <span>
                        Forderung: {formatMoney(r.counter.salary)} × {r.counter.years} J. · {roleLabel(r.counter.role, p)}
                      </span>
                      {isOpen && i === neg.offers.length - 1 && (
                        <Button className="px-2 py-1 text-xs" onClick={() => submit(r.counter!)}>
                          Annehmen
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {signing && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            Unterschrieben: {formatMoney(signing.contract.capHit)} × {signing.contract.yearsLeft} Jahre, Rolle {roleLabel(signing.role, p)}. Zählt als dein Pick von {team?.abbrev}.
          </div>
        )}
        {!signing && blocker && <div className="rounded-lg border border-coal-600 bg-coal-850 p-3 text-sm text-slate-400">{blocker}</div>}

        {isOpen && (
          <form
            className="space-y-3 rounded-lg border border-coal-700 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit({ salary, years, role });
            }}
          >
            <label className="block text-sm">
              <span className="flex justify-between text-slate-400">
                Gehalt (Cap Hit) <span className="font-mono text-slate-100">{formatMoney(salary)}</span>
              </span>
              <input type="range" min={cfg.minSalary} max={maxSalary(cfg)} step={25_000} value={salary} onChange={(e) => setSalary(Number(e.target.value))} className="w-full accent-sky-400" />
            </label>
            <label className="block text-sm">
              <span className="flex justify-between text-slate-400">
                Laufzeit <span className="font-mono text-slate-100">{years} Jahre</span>
              </span>
              <input type="range" min={1} max={8} step={1} value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-full accent-sky-400" />
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['top', 'middle', 'depth'] as Role[]).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRole(r)}
                  className={`rounded-md border px-2 py-1.5 text-xs ${role === r ? 'border-ice-400 bg-ice-500/10 text-ice-200' : 'border-coal-600 text-slate-300'}`}
                >
                  {roleLabel(r, p)}
                  {ROLE_RANK[r] > ROLE_RANK[hint.role] && <span className="block text-[10px] text-amber-300">Versprechen!</span>}
                </button>
              ))}
            </div>
            {existingPick && (
              <p className="text-xs text-amber-300">
                Eine Unterschrift ersetzt deinen bisherigen Pick von {team?.abbrev} ({fullName(existingPick)}).
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Angebot {(neg?.offers.length ?? 0) + 1} von max. {MAX_OFFERS}
              </span>
              <Button type="submit">Angebot abgeben</Button>
            </div>
          </form>
        )}
        {teamLock(draft, teamId) === 'deal' && !signing && <p className="text-xs text-slate-500">Hinweis: Ein Side Deal legt deinen Pick von {team?.abbrev} fest.</p>}
      </div>
    </Panel>
  );
}

function SideDeals() {
  const { league, draft, acceptDeal, declineDeal, openPlayer } = useGame();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  if (!league || !draft) return null;
  if (!draft.deals.length)
    return (
      <Panel>
        <p className="p-8 text-center text-slate-500">Kein GM hat dir ein Angebot gemacht.</p>
      </Panel>
    );
  return (
    <div className="space-y-3">
      <p className="flex items-center text-sm text-slate-400">
        Die KI-GMs melden sich mit Angeboten. Alle Zusagen sind bindend. <Tip text={DEAL_TIP} />
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {draft.deals.map((d) => {
          const t = league.teams.find((x) => x.id === d.teamId);
          const p = league.players[d.playerId] as Player;
          const v = scoutView(league.seed, p, scoutLevel(draft, p.id), !!draft.grades);
          const conflict = d.status === 'open' ? dealConflict(draft, d) : null;
          return (
            <div key={d.id} className={`animate-pick-in flex flex-col rounded-xl border p-4 ${d.status === 'accepted' ? 'border-emerald-500/50 bg-emerald-500/5' : d.status === 'declined' ? 'border-coal-700 opacity-50' : 'border-coal-600 bg-coal-900/80'}`}>
              <div className="mb-2 flex items-center gap-2.5">
                {t && <Logo spec={t.logo} size={32} />}
                <div className="flex-1">
                  <div className="text-sm font-bold text-slate-100">
                    {t?.city} {t?.name}
                  </div>
                  <div className="text-[11px] text-slate-400">GM {t?.gmName}</div>
                </div>
                <Badge tone={d.type === 'take' ? 'amber' : 'violet'}>{d.type === 'take' ? 'Nimm ihn' : 'Nimm ihn nicht'}</Badge>
              </div>
              <p className="flex-1 text-sm italic text-slate-300">{d.message}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-coal-850 p-2 text-xs">
                <div>
                  <div className="text-slate-500">Spieler</div>
                  <button type="button" className="text-left text-slate-200 hover:text-ice-300" onClick={() => openPlayer(p.id)}>
                    {fullName(p)}
                  </button>
                  <div className="text-slate-400">
                    {p.position} · {p.age} J. · OVR {formatRange(v.ovr)}
                  </div>
                  <div className="text-slate-400">
                    {p.contract ? formatMoney(p.contract.capHit) : '–'} · {contractLabel(p)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Gegenleistung</div>
                  <div className="text-emerald-300">{assetLabel(d.asset, league)}</div>
                </div>
              </div>
              {d.status === 'open' ? (
                <div className="mt-3 space-y-2">
                  {(errors[d.id] || conflict) && <p className="text-xs text-rose-300">{errors[d.id] ?? conflict}</p>}
                  {confirming === d.id ? (
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => {
                          const err = acceptDeal(d.id);
                          if (err) setErrors((e) => ({ ...e, [d.id]: err }));
                          setConfirming(null);
                        }}
                      >
                        Verbindlich zusagen
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirming(null)}>
                        Zurück
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button className="flex-1" disabled={!!conflict} onClick={() => setConfirming(d.id)}>
                        Annehmen
                      </Button>
                      <Button variant="ghost" className="flex-1" onClick={() => declineDeal(d.id)}>
                        Ablehnen
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className={`mt-3 text-center text-sm font-semibold ${d.status === 'accepted' ? 'text-emerald-300' : 'text-slate-500'}`}>
                  {d.status === 'accepted' ? '✓ Angenommen – bindend' : 'Abgelehnt'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
