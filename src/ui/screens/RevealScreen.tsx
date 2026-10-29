import { useEffect, useMemo, useState } from 'react';
import type { Player, Team } from '../../engine';
import { formatRange, groupOf, scoutView } from '../../engine';
import { useGame } from '../../store/game';
import { PERSONALITY_LABEL, RULE_TIPS } from '../text';
import { Logo } from '../components/Logo';
import { Badge, Button, Panel, Tip } from '../components/ui';

function PlayerLine({ p, seed, level, onOpen }: { p: Player; seed: string; level: number; onOpen: (id: string) => void }) {
  const v = scoutView(seed, p, level);
  return (
    <button type="button" onClick={() => onOpen(p.id)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-coal-700">
      <span className="w-6 font-mono text-[10px] text-slate-500">{p.position}</span>
      <span className="flex-1 truncate text-slate-200">
        {p.firstName.charAt(0)}. {p.lastName}
      </span>
      <span className="text-slate-500">{p.age}</span>
      <span className="w-12 text-right font-mono text-slate-400 tabular">{formatRange(v.ovr)}</span>
    </button>
  );
}

function TeamCard({ team, index }: { team: Team; index: number }) {
  const { league, draft, openPlayer } = useGame();
  if (!league || !draft) return null;
  const list = draft.protections[team.id];
  if (!list) return null;
  const prot = list.protectedIds.map((id) => league.players[id] as Player);
  const exposed = list.exposedIds.map((id) => league.players[id] as Player);
  const sortGroup = (a: Player, b: Player) => 'FDG'.indexOf(groupOf(a.position)) - 'FDG'.indexOf(groupOf(b.position)) || b.ovr - a.ovr;
  const topExposed = [...exposed].sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  return (
    <div className="animate-pick-in rounded-xl border border-coal-700 bg-coal-900/90 p-3" style={{ animationDelay: `${Math.min(index, 3) * 40}ms` }}>
      <div className="mb-2 flex items-center gap-2.5">
        <Logo spec={team.logo} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-100">
            {team.city} {team.name}
          </div>
          <div className="flex gap-1.5">
            <Badge tone="ice">{list.schemeId}</Badge>
            <Badge tone={team.personality === 'contender' ? 'amber' : team.personality === 'rebuild' ? 'emerald' : 'violet'}>
              {PERSONALITY_LABEL[team.personality]}
            </Badge>
          </div>
        </div>
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Geschützt ({prot.length})</div>
      <div className="mb-2">
        {[...prot].sort(sortGroup).map((p) => (
          <PlayerLine key={p.id} p={p} seed={league.seed} level={0} onOpen={openPlayer} />
        ))}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">Top exponiert ({exposed.length})</div>
      {topExposed.map((p) => (
        <PlayerLine key={p.id} p={p} seed={league.seed} level={draft.scouting[p.id] ?? 0} onOpen={openPlayer} />
      ))}
    </div>
  );
}

export function RevealScreen() {
  const { league, draft, goto, realignment } = useGame();
  const teams = useMemo(
    () => (league ? league.teams.filter((t) => !t.isExpansion).sort((a, b) => a.city.localeCompare(b.city)) : []),
    [league],
  );
  const [shown, setShown] = useState(0);
  const [fast, setFast] = useState(false);

  useEffect(() => {
    if (shown >= teams.length) return;
    const id = setTimeout(() => setShown((s) => s + 1), fast ? 120 : 900);
    return () => clearTimeout(id);
  }, [shown, fast, teams.length]);

  if (!league || !draft) return null;
  const visible = teams.slice(0, shown);
  const visibleIds = new Set(visible.map((t) => t.id));
  const comments = draft.comments.filter((c) => visibleIds.has(c.teamId)).slice(0, 14);
  const schemeCount = visible.reduce<Record<string, number>>((acc, t) => {
    const s = draft.protections[t.id]?.schemeId ?? '?';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center text-3xl font-black text-white">
            Schutzlisten-Reveal <Tip text={`${RULE_TIPS.schemes} ${RULE_TIPS.nmc} ${RULE_TIPS.exempt}`} />
          </h1>
          <p className="mt-1 text-slate-400">
            {shown < teams.length ? `Die Liga veröffentlicht die Listen … ${shown}/${teams.length}` : 'Alle 32 Listen sind veröffentlicht.'}
            {Object.entries(schemeCount).map(([k, v]) => (
              <span key={k} className="ml-3 text-xs text-slate-500">
                {k}: {v}
              </span>
            ))}
          </p>
        </div>
        <div className="flex gap-2">
          {shown < teams.length && (
            <>
              <Button variant="ghost" onClick={() => setFast((f) => !f)}>
                {fast ? 'Normal' : 'Schneller'}
              </Button>
              <Button variant="ghost" onClick={() => setShown(teams.length)}>
                Alle zeigen
              </Button>
            </>
          )}
          <Button onClick={() => goto('window')} className={shown >= teams.length ? 'animate-glow' : ''}>
            Zu den Verhandlungen →
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.map((t, i) => (
            <TeamCard key={t.id} team={t} index={shown - 1 - i} />
          ))}
        </div>
        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Panel title="Analysten-Desk">
            <ul className="max-h-[60vh] space-y-2 overflow-auto p-3">
              {comments.length === 0 && <li className="text-sm text-slate-500">Die Experten warten auf die ersten Listen …</li>}
              {comments.map((c, i) => {
                const t = league.teams.find((x) => x.id === c.teamId);
                return (
                  <li key={`${c.teamId}-${i}`} className="animate-pick-in flex gap-2.5 rounded-lg border border-coal-700 bg-coal-850 p-2.5 text-sm text-slate-200">
                    {t && <Logo spec={t.logo} size={22} />}
                    <span>{c.text}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
          {realignment.length > 0 && (
            <Panel title="Liga-News">
              <ul className="space-y-1 p-3 text-sm text-slate-300">
                {realignment.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
