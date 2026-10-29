/** UI texts, labels and rule tooltips (German; hockey terms stay English). */

import type { Mandate, Personality, Player } from '../engine';
import { NATIONS } from '../engine';

export const POS_LABEL: Record<string, string> = { C: 'Center', LW: 'Left Wing', RW: 'Right Wing', D: 'Verteidiger', G: 'Goalie' };

export const ATTR_LABEL: Record<string, string> = {
  skating: 'Skating',
  shooting: 'Shooting',
  passing: 'Passing',
  puckHandling: 'Puck Handling',
  defense: 'Defense',
  physical: 'Physical',
  hockeyIQ: 'Hockey IQ',
  reflexes: 'Reflexes',
  positioning: 'Positioning',
  reboundControl: 'Rebound Control',
};

export const PERSONALITY_LABEL: Record<Personality, string> = {
  rebuild: 'Rebuild',
  contender: 'Contender',
  capStrapped: 'Cap-gebunden',
};

export const MANDATES: { id: Mandate; label: string; text: string; difficulty: string }[] = [
  {
    id: 'playoffsNow',
    label: 'Sofort Playoffs',
    text: 'Der Owner will Ergebnisse – und zwar in Saison 1. Hohe Erwartungen, wenig Geduld.',
    difficulty: 'Schwer',
  },
  {
    id: 'patientBuild',
    label: 'Geduldiger Aufbau',
    text: 'Jugend, Picks und ein klarer Plan. Konkurrenzfähig sein reicht für den Anfang.',
    difficulty: 'Normal',
  },
  {
    id: 'budget',
    label: 'Budget-Owner',
    text: 'Jeder Dollar zählt. Gute Leistungen zu niedrigen Cap Hits werden belohnt.',
    difficulty: 'Knifflig',
  },
];

export const nationLabel = (code: string): string => NATIONS.find((n) => n.code === code)?.label ?? code;

export function contractLabel(p: Player): string {
  if (!p.contract) return 'Ungesignt';
  if (p.contract.yearsLeft === 0) return `pending ${p.contract.expiryStatus}`;
  return `${p.contract.yearsLeft} J. → ${p.contract.expiryStatus}`;
}

export const RULE_TIPS = {
  schemes:
    'Jedes bestehende Team schützt entweder 7 Stürmer + 3 Verteidiger + 1 Goalie oder 8 beliebige Feldspieler + 1 Goalie. Alle übrigen berechtigten Spieler sind „exposed“.',
  exempt:
    'Ausgenommen (weder schutzbedürftig noch wählbar) sind Spieler im 1. und 2. Profijahr sowie ungesignte Draftpicks.',
  nmc: 'Spieler mit No-Movement-Clause (NMC) müssen geschützt werden – außer sie verzichten darauf – und belegen einen Schutzplatz.',
  exposure:
    'Jedes Team muss mindestens 1 Verteidiger und 2 Stürmer exponieren, die nächste Saison unter Vertrag stehen und in der Vorsaison ≥ 40 oder in den letzten zwei Saisons ≥ 70 Spiele bestritten haben – sowie 1 Goalie mit Vertrag oder als pending RFA.',
  roster:
    'Das Expansionsteam wählt genau 1 Spieler pro Team (32), darunter mind. 14 Stürmer, 9 Verteidiger und 3 Goalies. Mindestens 20 müssen für die nächste Saison unter Vertrag stehen, und die Summe der Cap Hits muss zwischen 60 % und 100 % des Salary Caps liegen.',
  pendingUfa:
    'Pending UFAs haben keinen Vertrag für die nächste Saison. Sie können nur im exklusiven Verhandlungsfenster verpflichtet werden – die Unterschrift zählt dann als Pick von ihrem Team.',
  pendingRfa:
    'Pending RFAs dürfen gewählt werden; ihre Rechte gehen ans Expansionsteam. Sie zählen nicht zu den 20 Spielern unter Vertrag; ihr Cap Hit wird mit dem bisherigen Wert (Qualifying Offer) angesetzt.',
  fog: 'Fog of War: Fremde Spieler siehst du als Spanne. Scouting kostet Punkte und engt die Spanne ein. Echte Werte siehst du erst nach dem Draft.',
};
