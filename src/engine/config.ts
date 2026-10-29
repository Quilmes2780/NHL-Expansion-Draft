/** Central league configuration. All tunable numbers of the game live here. */

export type RuleSetId = 'seattle2021' | 'vegas2017' | 'custom';

export interface ProtectionScheme {
  id: string;
  label: string;
  /** Max forwards/defense; null when the scheme only limits skaters in total. */
  forwards: number | null;
  defense: number | null;
  /** Max skaters in total; null when forwards/defense are limited separately. */
  skaters: number | null;
  goalies: number;
}

export interface ExposureRules {
  forwards: number;
  defense: number;
  goalies: number;
  /** Games in the previous season that qualify a skater for exposure. */
  gpLastSeason: number;
  /** Games in the previous two seasons combined that qualify a skater. */
  gpLastTwo: number;
  /** A goalie who is a pending RFA counts towards goalie exposure. */
  goalieRfaCounts: boolean;
}

export interface ExpansionRosterRules {
  minForwards: number;
  minDefense: number;
  minGoalies: number;
  minUnderContract: number;
  capMinPct: number;
  capMaxPct: number;
}

export interface ExpansionRules {
  id: RuleSetId;
  label: string;
  description: string;
  schemes: ProtectionScheme[];
  /** Players with at most this many completed pro seasons are exempt. */
  exemptMaxProYears: number;
  exemptUnsignedDraftees: boolean;
  nmcMustBeProtected: boolean;
  exposure: ExposureRules;
  roster: ExpansionRosterRules;
}

export type Difficulty = 'leicht' | 'normal' | 'schwer';

export interface LeagueConfig {
  seasonLabel: string;
  seasonStartYear: number;
  salaryCap: number;
  capFloorPct: number;
  minSalary: number;
  maxSalaryPct: number;
  elcMaxCapHit: number;
  existingTeams: number;
  activeRosterSize: number;
  prospectsPerTeam: number;
  gamesPerSeason: number;
  draftRounds: number;
  pickYearsAhead: number;
  rules: ExpansionRules;
  difficulty: Difficulty;
  /** Scouting points available during the expansion draft, by difficulty. */
  scoutingBudget: Record<Difficulty, number>;
  /** Realignment never moves existing teams to the other conference (e.g. conferences are separate tiers). */
  fixedConferences?: boolean;
}

const SCHEME_731: ProtectionScheme = {
  id: '7-3-1',
  label: '7 Stürmer + 3 Verteidiger + 1 Goalie',
  forwards: 7,
  defense: 3,
  skaters: null,
  goalies: 1,
};

const SCHEME_81: ProtectionScheme = {
  id: '8-1',
  label: '8 Feldspieler + 1 Goalie',
  forwards: null,
  defense: null,
  skaters: 8,
  goalies: 1,
};

const STANDARD_EXPOSURE: ExposureRules = {
  forwards: 2,
  defense: 1,
  goalies: 1,
  gpLastSeason: 40,
  gpLastTwo: 70,
  goalieRfaCounts: true,
};

const STANDARD_ROSTER: ExpansionRosterRules = {
  minForwards: 14,
  minDefense: 9,
  minGoalies: 3,
  minUnderContract: 20,
  capMinPct: 0.6,
  capMaxPct: 1.0,
};

export const RULE_SETS: Record<RuleSetId, ExpansionRules> = {
  seattle2021: {
    id: 'seattle2021',
    label: 'Seattle 2021',
    description:
      'Standard-Regelwerk: Schutz nach 7-3-1 oder 8-1, Exposure-Pflichten, 14 F / 9 D / 3 G, Cap-Korridor 60–100 %.',
    schemes: [SCHEME_731, SCHEME_81],
    exemptMaxProYears: 2,
    exemptUnsignedDraftees: true,
    nmcMustBeProtected: true,
    exposure: STANDARD_EXPOSURE,
    roster: STANDARD_ROSTER,
  },
  vegas2017: {
    id: 'vegas2017',
    label: 'Vegas 2017',
    description:
      'Historisches Preset mit denselben Kernregeln wie 2021 (die realen Regelwerke waren praktisch identisch).',
    schemes: [SCHEME_731, SCHEME_81],
    exemptMaxProYears: 2,
    exemptUnsignedDraftees: true,
    nmcMustBeProtected: true,
    exposure: STANDARD_EXPOSURE,
    roster: STANDARD_ROSTER,
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    description: 'Alle Parameter frei einstellbar.',
    schemes: [SCHEME_731, SCHEME_81],
    exemptMaxProYears: 2,
    exemptUnsignedDraftees: true,
    nmcMustBeProtected: true,
    exposure: STANDARD_EXPOSURE,
    roster: STANDARD_ROSTER,
  },
};

export function cloneRules(rules: ExpansionRules): ExpansionRules {
  return JSON.parse(JSON.stringify(rules)) as ExpansionRules;
}

export function defaultConfig(overrides: Partial<LeagueConfig> = {}): LeagueConfig {
  return {
    seasonLabel: '2027-28',
    seasonStartYear: 2027,
    salaryCap: 113_500_000,
    capFloorPct: 0.74,
    minSalary: 850_000,
    maxSalaryPct: 0.2,
    elcMaxCapHit: 1_000_000,
    existingTeams: 32,
    activeRosterSize: 23,
    prospectsPerTeam: 10,
    gamesPerSeason: 82,
    draftRounds: 7,
    pickYearsAhead: 3,
    rules: cloneRules(RULE_SETS.seattle2021),
    difficulty: 'normal',
    scoutingBudget: { leicht: 60, normal: 40, schwer: 25 },
    ...overrides,
  };
}

export const capFloor = (cfg: LeagueConfig): number => Math.round(cfg.salaryCap * cfg.capFloorPct);
export const maxSalary = (cfg: LeagueConfig): number => Math.round(cfg.salaryCap * cfg.maxSalaryPct);
