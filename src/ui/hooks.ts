import { useMemo } from 'react';
import type { Player, ScoutView } from '../engine';
import { EXPANSION_TEAM_ID, scoutLevel, scoutView } from '../engine';
import { useGame } from '../store/game';

/** Fog of War view for a player, taking scouting progress and draft state into account. */
export function useScoutView(p: Player | undefined): ScoutView | null {
  const seed = useGame((s) => s.league?.seed ?? '');
  const draft = useGame((s) => s.draft);
  return useMemo(() => {
    if (!p) return null;
    const level = draft ? scoutLevel(draft, p.id) : 0;
    const revealed =
      p.teamId === EXPANSION_TEAM_ID ||
      (!!draft?.grades && Object.values(draft.protections).some((l) => l.exposedIds.includes(p.id)));
    return scoutView(seed, p, level, revealed);
  }, [p, seed, draft]);
}
