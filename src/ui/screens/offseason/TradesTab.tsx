import { useMemo, useState } from 'react';
import type { DraftPick, Player, TradeEvaluation, TradeProposal } from '../../../engine';
import {
  EXPANSION_TEAM_ID,
  evaluateTrade,
  formatMoneyShort,
  formatRange,
  fullName,
  playersOfTeam,
  scoutLevel,
  scoutView,
  teamPayroll,
} from '../../../engine';
import { useGame } from '../../../store/game';
import { PERSONALITY_LABEL } from '../../text';
import { Logo } from '../../components/Logo';
import { Badge, Button, Panel, Tip } from '../../components/ui';

const TRADE_TIP =
  'Die KI bewertet Spieler nach ihrer Strategie (Rebuild: Jugend & Picks, Contender: aktuelle Stärke, Cap-gebunden: günstige Verträge). Pakete haben abnehmenden Grenznutzen – viele mittelmäßige Spieler ergeben keinen Star. Für eine Zusage verlangt die KI einen Aufschlag. Spieler mit NTC/NMC sind nicht handelbar.';

const toggle = (xs: string[], id: string) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]);

export function TradesTab() {
  const { offLeague, off, draft, trade, openPlayer } = useGame();
  const partners = useMemo(() => (offLeague ? offLeague.teams.filter((t) => !t.isExpansion).sort((a, b) => a.city.localeCompare(b.city)) : []), [offLeague]);
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? '');
  const [give, setGive] = useState<{ players: string[]; picks: string[] }>({ players: [], picks: [] });
  const [get, setGet] = useState<{ players: string[]; picks: string[] }>({ players: [], picks: [] });
  const [result, setResult] = useState<TradeEvaluation | null>(null);
  if (!offLeague || !off) return null;
  const partner = offLeague.teams.find((t) => t.id === partnerId);
  const proposal: TradeProposal = { partnerId, give, get };
  const empty = !give.players.length && !give.picks.length && !get.players.length && !get.picks.length;
  const ev = empty ? null : evaluateTrade(offLeague, proposal);
  const lvl = (id: string) => (draft ? scoutLevel(draft, id) : 0);

  const playerRows = (teamId: string, side: 'give' | 'get') => {
    const sel = side === 'give' ? give : get;
    const set = side === 'give' ? setGive : setGet;
    const own = teamId === EXPANSION_TEAM_ID;
    return playersOfTeam(offLeague, teamId)
      .filter((p) => p.contract || own)
      .sort((a, b) => Number(a.farm) - Number(b.farm) || b.ovr - a.ovr)
      .map((p: Player) => {
        const locked = !!p.contract && (p.contract.ntc || p.contract.nmc) && p.contract.yearsLeft >= 1;
        const ovr = own ? `${p.ovr}` : formatRange(scoutView(offLeague.seed, p, lvl(p.id)).ovr);
        return (
          <label key={p.id} className={`flex items-center gap-2 px-3 py-1 text-xs ${locked ? 'opacity-40' : 'cursor-pointer hover:bg-coal-800/60'}`}>
            <input type="checkbox" disabled={locked} checked={sel.players.includes(p.id)} onChange={() => set({ ...sel, players: toggle(sel.players, p.id) })} />
            <button type="button" className="flex-1 truncate text-left text-slate-200 hover:text-ice-300" onClick={() => openPlayer(p.id)}>
              {fullName(p)}
            </button>
            <span className="w-6 font-mono text-slate-500">{p.position}</span>
            <span className="w-6 text-slate-400">{p.age}</span>
            <span className="w-12 text-right font-mono text-slate-200">{ovr}</span>
            <span className="w-14 text-right font-mono text-slate-400">{p.contract ? formatMoneyShort(p.contract.capHit) : '–'}</span>
            {p.farm && <Badge>Farm</Badge>}
            {locked && <Badge tone="violet">NTC</Badge>}
          </label>
        );
      });
  };
  const pickRows = (teamId: string, side: 'give' | 'get') => {
    const sel = side === 'give' ? give : get;
    const set = side === 'give' ? setGive : setGet;
    return offLeague.picks
      .filter((p: DraftPick) => p.ownerTeamId === teamId && p.year > offLeague.config.seasonStartYear)
      .sort((a, b) => a.year - b.year || a.round - b.round)
      .map((p) => (
        <label key={p.id} className="flex cursor-pointer items-center gap-2 px-3 py-1 text-xs hover:bg-coal-800/60">
          <input type="checkbox" checked={sel.picks.includes(p.id)} onChange={() => set({ ...sel, picks: toggle(sel.picks, p.id) })} />
          <span className="flex-1 text-slate-200">
            {p.round}. Runde {p.year}
            {p.originalTeamId !== teamId && <span className="text-slate-500"> (via {offLeague.teams.find((t) => t.id === p.originalTeamId)?.abbrev})</span>}
          </span>
        </label>
      ));
  };

  const ratio = ev ? Math.min(1.5, ev.ratio) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Trade-Partner
          <select
            value={partnerId}
            onChange={(e) => {
              setPartnerId(e.target.value);
              setGet({ players: [], picks: [] });
              setResult(null);
            }}
            className="rounded-md border border-coal-600 bg-coal-850 px-2 py-1.5 text-sm"
          >
            {partners.map((t) => (
              <option key={t.id} value={t.id}>
                {t.city} {t.name} ({PERSONALITY_LABEL[t.personality]})
              </option>
            ))}
          </select>
        </label>
        <Tip text={TRADE_TIP} />
        {partner && (
          <span className="text-xs text-slate-400">
            GM {partner.gmName} · Payroll {formatMoneyShort(teamPayroll(offLeague, partner.id))}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px_1fr]">
        <Panel title="Du gibst ab">
          <div className="max-h-[50vh] overflow-auto py-1">
            {playerRows(EXPANSION_TEAM_ID, 'give')}
            <div className="mt-2 border-t border-coal-700 pt-1 text-[11px] uppercase tracking-wider text-slate-500 [&]:px-3">Picks</div>
            {pickRows(EXPANSION_TEAM_ID, 'give')}
          </div>
        </Panel>

        <Panel title="Verhandlungstisch">
          <div className="space-y-3 p-4 text-sm">
            <div className="flex items-center justify-center gap-3">
              {offLeague.teams.find((t) => t.id === EXPANSION_TEAM_ID) && <Logo spec={offLeague.teams.find((t) => t.id === EXPANSION_TEAM_ID)!.logo} size={40} />}
              <span className="text-2xl text-slate-500">⇄</span>
              {partner && <Logo spec={partner.logo} size={40} />}
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>Interesse von {partner?.abbrev}</span>
                <span>{ev ? `${Math.round(ev.ratio * 100)} %` : '–'}</span>
              </div>
              <div className="relative h-2.5 rounded-full bg-coal-700">
                <div className={`h-full rounded-full ${ratio >= 1 ? 'bg-emerald-400' : ratio > 0.8 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${(ratio / 1.5) * 100}%` }} />
                <div className="absolute -top-1 h-4.5 w-px bg-slate-300" style={{ left: `${(1 / 1.5) * 100}%` }} />
              </div>
            </div>
            {ev && ev.reasons.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-200">
                {ev.reasons.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            )}
            <Button
              className="w-full"
              disabled={!ev?.accepted}
              onClick={() => {
                const r = trade(proposal);
                setResult(r);
                if (r?.accepted) {
                  setGive({ players: [], picks: [] });
                  setGet({ players: [], picks: [] });
                }
              }}
            >
              Trade abschließen
            </Button>
            {result?.accepted && <p className="text-xs text-emerald-300">Trade durchgeführt!</p>}
          </div>
        </Panel>

        <Panel title={`Du erhältst von ${partner?.abbrev ?? ''}`}>
          <div className="max-h-[50vh] overflow-auto py-1">
            {partner && playerRows(partner.id, 'get')}
            <div className="mt-2 border-t border-coal-700 px-3 pt-1 text-[11px] uppercase tracking-wider text-slate-500">Picks</div>
            {partner && pickRows(partner.id, 'get')}
          </div>
        </Panel>
      </div>

      {off.trades.length > 0 && (
        <Panel title="Abgeschlossene Trades">
          <ul className="space-y-1 p-4 text-sm text-slate-300">
            {off.trades.map((t, i) => (
              <li key={i}>• {t.text}</li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
