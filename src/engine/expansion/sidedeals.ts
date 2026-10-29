/**
 * Side deals: AI GMs offer picks or prospects so that the expansion team takes an unwanted contract
 * ("take") or leaves a player they want to keep alone ("avoid"). Accepted deals are binding.
 */

import type { DraftPick, League, Player, Team } from '../model';
import { fullName, playersOfTeam, teamPayroll } from '../model';
import { rngFor } from '../rng';
import { contractSurplus, formatMoney } from '../value';
import { isExempt } from './eligibility';
import type { ProtectionList } from './protection';
import { retentionScore } from './protection';
import { expansionValue, selectableCandidates } from './selection';

export type DealAsset = { kind: 'pick'; pickId: string } | { kind: 'prospect'; playerId: string };

export interface SideDeal {
  id: string;
  teamId: string;
  type: 'take' | 'avoid';
  /** The player the deal is about. */
  playerId: string;
  asset: DealAsset;
  message: string;
  status: 'open' | 'accepted' | 'declined';
}

const MAX_DEALS = 8;

export function pickLabel(pick: DraftPick, league: League): string {
  const orig = league.teams.find((t) => t.id === pick.originalTeamId);
  return `${pick.round}. Runde ${pick.year}${orig && orig.id !== pick.ownerTeamId ? ` (via ${orig.abbrev})` : ''}`;
}

export function assetLabel(asset: DealAsset, league: League): string {
  if (asset.kind === 'pick') {
    const pick = league.picks.find((p) => p.id === asset.pickId);
    return pick ? `${pickLabel(pick, league)}-Pick` : 'Draftpick';
  }
  const p = league.players[asset.playerId];
  return p ? `Prospect ${fullName(p)} (${p.position}, ${p.age})` : 'Prospect';
}

const PICK_VALUE: Record<number, number> = { 1: 6, 2: 3, 3: 1.5, 4: 0.8 };

/** Value of an asset in the same unit as expansionValue differences. */
export function assetValue(asset: DealAsset, league: League): number {
  if (asset.kind === 'pick') {
    const pick = league.picks.find((p) => p.id === asset.pickId);
    if (!pick) return 0;
    return (PICK_VALUE[pick.round] ?? 0.4) * Math.pow(0.9, pick.year - league.config.seasonStartYear);
  }
  const p = league.players[asset.playerId];
  return p ? Math.max(0.5, Math.min(8, (p.potential - 62) * 0.35)) : 0;
}

function findPick(league: League, teamId: string, round: number, used: Set<string>): DraftPick | null {
  for (let r = round; r <= league.config.draftRounds; r++) {
    const pick = league.picks
      .filter((p) => p.ownerTeamId === teamId && p.round === r && !used.has(p.id))
      .sort((a, b) => a.year - b.year)[0];
    if (pick) return pick;
  }
  return null;
}

function bestProspect(league: League, teamId: string, minPotential: number): Player | null {
  const rules = league.config.rules;
  return (
    playersOfTeam(league, teamId)
      .filter((p) => p.farm && isExempt(p, rules) && p.age <= 22 && p.potential >= minPotential)
      .sort((a, b) => a.potential - b.potential || a.id.localeCompare(b.id))[0] ?? null
  );
}

interface Candidate {
  deal: Omit<SideDeal, 'id' | 'status'>;
  weight: number;
}

export function generateSideDeals(league: League, protections: Record<string, ProtectionList>): SideDeal[] {
  const cfg = league.config;
  const cands: Candidate[] = [];
  const usedPicks = new Set<string>();
  const usedProspects = new Set<string>();
  const teams = league.teams.filter((t) => !t.isExpansion && protections[t.id]);

  const offerAsset = (team: Team, round: number, prospectPot: number, preferProspect: boolean): DealAsset | null => {
    if (preferProspect) {
      const pr = bestProspect(league, team.id, prospectPot);
      if (pr && !usedProspects.has(pr.id)) {
        usedProspects.add(pr.id);
        return { kind: 'prospect', playerId: pr.id };
      }
    }
    const pick = findPick(league, team.id, round, usedPicks);
    if (!pick) return null;
    usedPicks.add(pick.id);
    return { kind: 'pick', pickId: pick.id };
  };

  for (const team of teams) {
    const rng = rngFor(league.seed, 'deals', team.id);
    const cands4team = selectableCandidates(league, protections[team.id] as ProtectionList);
    const tight = teamPayroll(league, team.id) > cfg.salaryCap * 0.95;

    // "Take" deal: dump an overpaid contract.
    if (team.personality === 'capStrapped' || tight) {
      // Burden = overpayment per remaining season (in millions).
      const dump = cands4team
        .filter((p) => p.contract && p.contract.capHit >= 4_500_000 && p.contract.yearsLeft >= 2)
        .map((p) => ({ p, burden: -contractSurplus(p, cfg) / Math.min(4, p.contract!.yearsLeft) }))
        .filter((x) => x.burden >= 1.2)
        .sort((a, b) => b.burden - a.burden)[0];
      if (dump) {
        const c = dump.p.contract!;
        const total = dump.burden * c.yearsLeft;
        const round = dump.burden >= 4 && total >= 14 ? 1 : dump.burden >= 2.5 ? 2 : 3;
        const asset = offerAsset(team, round, 70, round <= 2 && rng.chance(0.35));
        if (asset) {
          const intro = rng.pick(['Wir brauchen Cap Space.', 'Unter uns: Wir müssen Gehalt loswerden.', 'Hilf uns beim Cap, wir helfen dir bei der Zukunft.']);
          cands.push({
            weight: total / 3 + rng.range(0, 2),
            deal: {
              teamId: team.id,
              type: 'take',
              playerId: dump.p.id,
              asset,
              message: `${team.gmName} (${team.abbrev}): „${intro} Nimm ${fullName(dump.p)} (${formatMoney(c.capHit)}, noch ${c.yearsLeft} Jahre) – dafür bekommst du ${assetLabel(asset, league)}.“`,
            },
          });
        }
      }
    }

    // "Avoid" deal: protect a player they could not fit on the list.
    const ranked = [...cands4team].sort(
      (a, b) => retentionScore(b, team, cfg, league.seed) - retentionScore(a, team, cfg, league.seed),
    );
    const keep = ranked[0];
    if (keep && keep.ovr >= 72 && (team.personality === 'contender' || rng.chance(0.3))) {
      const others = cands4team.filter((p) => p.id !== keep.id).map((p) => expansionValue(p, cfg));
      const gap = expansionValue(keep, cfg) - Math.max(0, ...others);
      if (gap >= 1.5) {
        const round = gap >= 8 ? 2 : gap >= 4 ? 3 : 4;
        const asset = offerAsset(team, round, 66, gap >= 6 && rng.chance(0.3));
        if (asset) {
          const intro = rng.pick([
            `Lass ${fullName(keep)} bei uns`,
            `${fullName(keep)} ist für unsere Kabine unverzichtbar`,
            `Wir konnten ${fullName(keep)} nicht schützen, wollen ihn aber behalten`,
          ]);
          cands.push({
            weight: gap + rng.range(0, 2),
            deal: {
              teamId: team.id,
              type: 'avoid',
              playerId: keep.id,
              asset,
              message: `${team.gmName} (${team.abbrev}): „${intro} – wähle einen anderen Spieler von unserer Liste, und ${assetLabel(asset, league)} gehört dir.“`,
            },
          });
        }
      }
    }
  }

  // Keep a mix of both deal types, the most pressing ones first.
  const byWeight = (a: Candidate, b: Candidate) => b.weight - a.weight || a.deal.teamId.localeCompare(b.deal.teamId);
  const takes = cands.filter((c) => c.deal.type === 'take').sort(byWeight);
  const avoids = cands.filter((c) => c.deal.type === 'avoid').sort(byWeight);
  const nAvoid = Math.min(avoids.length, Math.max(MAX_DEALS - takes.length, MAX_DEALS / 2));
  return [...takes.slice(0, MAX_DEALS - nAvoid), ...avoids.slice(0, nAvoid)]
    .sort(byWeight)
    .map((c, i) => ({ ...c.deal, id: `deal-${i + 1}-${c.deal.teamId}`, status: 'open' as const }));
}
