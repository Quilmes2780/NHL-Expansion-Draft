/** Generated analyst commentary for the protection list reveal. */

import type { League, Player, Team } from '../model';
import { fullName, groupOf } from '../model';
import { rngFor } from '../rng';
import { formatMoney } from '../value';
import { isNmcLocked } from './eligibility';
import type { ProtectionList } from './protection';

export interface AnalystComment {
  teamId: string;
  playerId: string | null;
  /** Higher = more surprising; used to order the reveal. */
  weight: number;
  text: string;
}

const POS_DE: Record<string, string> = { C: 'Center', LW: 'Linksaußen', RW: 'Rechtsaußen', D: 'Verteidiger', G: 'Goalie' };

export function revealComments(league: League, protections: Record<string, ProtectionList>): AnalystComment[] {
  const out: AnalystComment[] = [];
  const rules = league.config.rules;
  const endYear = (p: Player) => league.config.seasonStartYear + (p.contract?.yearsLeft ?? 0);
  for (const team of league.teams) {
    const list = protections[team.id];
    if (!list) continue;
    const rng = rngFor(league.seed, 'analyst', team.id);
    const exposed = list.exposedIds.map((id) => league.players[id] as Player).sort((a, b) => b.ovr - a.ovr);
    const prot = list.protectedIds.map((id) => league.players[id] as Player);
    const tn = (t: Team) => `${t.city}`;
    const star = exposed[0];
    if (star && star.ovr >= 79) {
      const t = rng.pick([
        `Paukenschlag in ${tn(team)}: ${fullName(star)} (${POS_DE[star.position]}, ${star.age}) steht ungeschützt auf der Liste!`,
        `${tn(team)} riskiert viel – ${fullName(star)} ist zu haben. Das dürfte im War Room des Expansionsteams für Jubel sorgen.`,
        `Niemand hatte damit gerechnet: ${fullName(star)} wird von ${tn(team)} exponiert.`,
      ]);
      out.push({ teamId: team.id, playerId: star.id, weight: star.ovr - 70, text: t });
    }
    const bigDeal = exposed.find((p) => p.contract && p.contract.capHit >= 6_500_000 && p.contract.yearsLeft >= 3);
    if (bigDeal?.contract) {
      out.push({
        teamId: team.id,
        playerId: bigDeal.id,
        weight: 6 + bigDeal.contract.yearsLeft,
        text: `Cap-Signal aus ${tn(team)}: Der Vertrag von ${fullName(bigDeal)} (${formatMoney(bigDeal.contract.capHit)} bis ${endYear(bigDeal)}) liegt offen auf dem Tisch.`,
      });
    }
    if (list.schemeId === '8-1') {
      const d = prot.filter((p) => groupOf(p.position) === 'D').length;
      out.push({
        teamId: team.id,
        playerId: null,
        weight: 4 + Math.max(0, d - 3),
        text: `${tn(team)} wählt das 8-1-Schema und schützt ${d} Verteidiger – die Blue Line ist dort offenbar heilig.`,
      });
    }
    const weakNmc = prot.filter((p) => isNmcLocked(p, rules)).sort((a, b) => a.ovr - b.ovr)[0];
    if (weakNmc && weakNmc.ovr < 74) {
      out.push({
        teamId: team.id,
        playerId: weakNmc.id,
        weight: 5,
        text: `Die No-Movement-Clause von ${fullName(weakNmc)} kostet ${tn(team)} einen wertvollen Schutzplatz.`,
      });
    }
    const goalie = exposed.find((p) => p.position === 'G');
    if (goalie && goalie.ovr >= 74) {
      out.push({
        teamId: team.id,
        playerId: goalie.id,
        weight: goalie.ovr - 68,
        text: `Goalie-Alarm: ${tn(team)} lässt ${fullName(goalie)} (${goalie.age}) ungeschützt – ein möglicher Starter für das neue Team.`,
      });
    }
    const youngProt = prot.filter((p) => p.age <= 23).length;
    if (team.personality === 'rebuild' && youngProt >= 4) {
      out.push({
        teamId: team.id,
        playerId: null,
        weight: 3,
        text: `${tn(team)} bleibt im Rebuild-Modus: ${youngProt} der geschützten Spieler sind 23 oder jünger.`,
      });
    }
  }
  // One comment per player at most: keep the most surprising angle.
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.weight - a.weight || a.teamId.localeCompare(b.teamId))
    .filter((c) => {
      if (!c.playerId) return true;
      if (seen.has(c.playerId)) return false;
      seen.add(c.playerId);
      return true;
    });
}
