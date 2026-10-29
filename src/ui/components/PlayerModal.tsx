import { useEffect } from 'react';
import type { Player } from '../../engine';
import {
  EXPANSION_TEAM_ID,
  canScout,
  formatMoney,
  formatRange,
  fullName,
  isExempt,
  isNmcLocked,
  isPendingUfa,
  qualifiesForExposure,
  scoutLevel,
} from '../../engine';
import { useGame } from '../../store/game';
import { useScoutView } from '../hooks';
import { ATTR_LABEL, POS_LABEL, RULE_TIPS, contractLabel, nationLabel } from '../text';
import { Logo } from './Logo';
import { Badge, Button, RangeBar, ScoutDots, Tip } from './ui';

export function PlayerModal() {
  const { modalPlayerId, openPlayer, league, postDraftLeague, draft, scout, toggleWish, select } = useGame();
  const p: Player | undefined = modalPlayerId ? (postDraftLeague ?? league)?.players[modalPlayerId] : undefined;
  const view = useScoutView(p);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openPlayer(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPlayer]);

  if (!p || !view || !league) return null;
  const rules = league.config.rules;
  const origTeamId = draft ? Object.entries(draft.protections).find(([, l]) => l.exposedIds.includes(p.id) || l.protectedIds.includes(p.id))?.[0] : undefined;
  const team = league.teams.find((t) => t.id === (origTeamId ?? p.teamId));
  const list = origTeamId ? draft?.protections[origTeamId] : undefined;
  const status = list?.protectedIds.includes(p.id) ? 'geschützt' : list?.exposedIds.includes(p.id) ? 'exponiert' : isExempt(p, rules) ? 'ausgenommen' : null;
  const level = draft ? scoutLevel(draft, p.id) : 0;
  const chosen = !!origTeamId && draft?.selection[origTeamId] === p.id;
  const locked = !!draft?.grades;
  const accent = team?.colors.primary ?? '#0ea5e9';
  const attrKeys = Object.keys(view.attrs);
  const s = p.lastSeason;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={() => openPlayer(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={fullName(p)}
        className="animate-pick-in w-full max-w-3xl overflow-hidden rounded-2xl border border-coal-600 bg-coal-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center gap-4 p-5" style={{ background: `linear-gradient(120deg, ${accent}55, transparent 70%)` }}>
          {team && <Logo spec={team.logo} size={64} />}
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-widest text-slate-300">
              {team ? `${team.city} ${team.name}` : 'Free Agent'} · {POS_LABEL[p.position]}
            </div>
            <h2 className="truncate text-2xl font-black text-white">{fullName(p)}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-300">
              <span>{p.age} Jahre</span>·<span>{nationLabel(p.nationality)}</span>·<span>schießt {p.shoots === 'L' ? 'links' : 'rechts'}</span>·<span>{p.proYears} Profijahre</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {status === 'exponiert' && <Badge tone="amber">exponiert</Badge>}
              {status === 'geschützt' && <Badge tone="ice">geschützt</Badge>}
              {status === 'ausgenommen' && (
                <Badge tone="emerald" title={RULE_TIPS.exempt}>
                  ausgenommen
                </Badge>
              )}
              {isNmcLocked(p, rules) && <Badge tone="violet" title={RULE_TIPS.nmc}>NMC</Badge>}
              {p.contract?.nmc && p.contract.nmcWaived && <Badge>NMC (verzichtet)</Badge>}
              {p.contract?.ntc && <Badge>NTC</Badge>}
              {qualifiesForExposure(p, rules) && <Badge tone="slate" title={RULE_TIPS.exposure}>erfüllt Exposure</Badge>}
              {p.teamId === EXPANSION_TEAM_ID && <Badge tone="emerald">Dein Team</Badge>}
              {p.injury && <Badge tone="rose">{p.injury.description} ({p.injury.gamesRemaining} Sp.)</Badge>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">OVR</div>
            <div className="font-mono text-4xl font-black text-white tabular">{formatRange(view.ovr)}</div>
            <div className="text-xs text-slate-400">POT {formatRange(view.potential)}</div>
          </div>
          <button type="button" onClick={() => openPlayer(null)} aria-label="Schließen" className="absolute right-3 top-2 text-xl text-slate-400 hover:text-white">
            ×
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ice-300">
              <span className="flex items-center">
                Attribute {!view.exact && <Tip text={RULE_TIPS.fog} />}
              </span>
              {!view.exact && (
                <span className="flex items-center gap-2 normal-case tracking-normal text-slate-400">
                  <ScoutDots level={level} /> Stufe {level}/3
                </span>
              )}
            </div>
            <div className="space-y-2">
              {attrKeys.map((k) => {
                const r = view.attrs[k]!;
                return (
                  <div key={k} className="grid grid-cols-[110px_1fr_52px] items-center gap-2 text-sm">
                    <span className="text-slate-400">{ATTR_LABEL[k]}</span>
                    <RangeBar range={r} accent={accent} />
                    <span className="text-right font-mono text-slate-200 tabular">{formatRange(r)}</span>
                  </div>
                );
              })}
            </div>
            {draft && !view.exact && !locked && (
              <Button variant="ghost" className="mt-3 w-full" disabled={!canScout(draft, p.id)} onClick={() => scout(p.id)}>
                Scouten (1 Punkt · {draft.scoutingBudget - draft.scoutingSpent} übrig)
              </Button>
            )}
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ice-300">Vertrag</div>
              {p.contract ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt className="text-slate-400">Cap Hit</dt>
                  <dd className="font-mono text-slate-100">{formatMoney(p.contract.capHit)}</dd>
                  <dt className="text-slate-400">Laufzeit</dt>
                  <dd className="text-slate-100">{contractLabel(p)}</dd>
                  <dt className="text-slate-400">Art</dt>
                  <dd className="text-slate-100">{p.contract.elc ? 'Entry-Level' : p.contract.twoWay ? 'Two-Way' : 'One-Way'}</dd>
                </dl>
              ) : (
                <p className="text-slate-400">Ungesignter Draftpick</p>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ice-300">Vorsaison</div>
              {p.position === 'G' ? (
                <dl className="grid grid-cols-4 gap-2 text-center">
                  {[
                    ['GP', s.gp],
                    ['W', s.wins ?? 0],
                    ['SV%', s.savePct?.toFixed(3) ?? '–'],
                    ['GAA', s.gaa?.toFixed(2) ?? '–'],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded bg-coal-850 py-1.5">
                      <dt className="text-[10px] text-slate-500">{l}</dt>
                      <dd className="font-mono text-slate-100">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <dl className="grid grid-cols-5 gap-2 text-center">
                  {[
                    ['GP', s.gp],
                    ['G', s.goals],
                    ['A', s.assists],
                    ['P', s.goals + s.assists],
                    ['+/-', s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded bg-coal-850 py-1.5">
                      <dt className="text-[10px] text-slate-500">{l}</dt>
                      <dd className="font-mono text-slate-100">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-1.5 text-xs text-slate-400">Spiele in den letzten zwei Saisons: {p.gpLastTwo}</p>
            </div>
            {draft && origTeamId && list?.exposedIds.includes(p.id) && (
              <div className="flex gap-2 pt-1">
                <Button variant="ghost" onClick={() => toggleWish(p.id)}>
                  {draft.wishlist.includes(p.id) ? '★ Auf Wunschliste' : '☆ Wunschliste'}
                </Button>
                {!locked &&
                  (isPendingUfa(p) ? (
                    <span className="self-center text-xs text-slate-400">{RULE_TIPS.pendingUfa}</span>
                  ) : (
                    <Button onClick={() => select(origTeamId, chosen ? null : p.id)}>{chosen ? 'Pick entfernen' : `Von ${team?.abbrev} wählen`}</Button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
