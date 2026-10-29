import { create } from 'zustand';
import type {
  Difficulty,
  ExpansionDraftState,
  ExpansionRules,
  FranchiseOptions,
  League,
  Offer,
  RuleSetId,
  Violation,
} from '../engine';
import {
  acceptDeal,
  autoFillSelection,
  clearSelection,
  declineDeal,
  makeOffer,
  cloneRules,
  createFranchise,
  defaultConfig,
  generateLeague,
  scoutPlayer,
  selectPlayer,
  startExpansionDraft,
  submitExpansionDraft,
  toggleWishlist,
} from '../engine';

export type Phase = 'start' | 'founding' | 'reveal' | 'window' | 'draft' | 'night' | 'results';

export const PHASES: { id: Phase; label: string }[] = [
  { id: 'founding', label: 'Gründung' },
  { id: 'reveal', label: 'Schutzlisten' },
  { id: 'window', label: 'Verhandlungen' },
  { id: 'draft', label: 'Draft Board' },
  { id: 'night', label: 'Draft-Abend' },
  { id: 'results', label: 'Bilanz' },
];

interface GameStore {
  phase: Phase;
  maxPhase: Phase;
  seed: string;
  ruleSetId: RuleSetId;
  difficulty: Difficulty;
  /** League before the draft was executed (protections refer to these rosters). */
  league: League | null;
  /** League after the draft was executed. */
  postDraftLeague: League | null;
  realignment: string[];
  draft: ExpansionDraftState | null;
  violations: Violation[];
  modalPlayerId: string | null;
  compare: string[];

  newGame: (seed: string, rules: ExpansionRules, difficulty: Difficulty) => void;
  found: (opts: FranchiseOptions) => void;
  goto: (phase: Phase) => void;
  scout: (playerId: string) => void;
  select: (teamId: string, playerId: string | null) => void;
  autoFill: () => void;
  clearSelection: () => void;
  toggleWish: (playerId: string) => void;
  toggleCompare: (playerId: string) => void;
  openPlayer: (playerId: string | null) => void;
  offer: (playerId: string, offer: Offer) => void;
  acceptDeal: (dealId: string) => string | null;
  declineDeal: (dealId: string) => void;
  submit: () => boolean;
  reset: () => void;
}

const ORDER: Phase[] = ['start', 'founding', 'reveal', 'window', 'draft', 'night', 'results'];
/** Phases the player can move between freely until the draft list is submitted. */
const OPEN_PHASES: Phase[] = ['reveal', 'window', 'draft'];
export const phaseIndex = (p: Phase): number => ORDER.indexOf(p);

export const useGame = create<GameStore>((set, get) => ({
  phase: 'start',
  maxPhase: 'start',
  seed: '',
  ruleSetId: 'seattle2021',
  difficulty: 'normal',
  league: null,
  postDraftLeague: null,
  realignment: [],
  draft: null,
  violations: [],
  modalPlayerId: null,
  compare: [],

  newGame: (seed, rules, difficulty) => {
    const league = generateLeague(seed, defaultConfig({ rules: cloneRules(rules), difficulty }));
    set({
      seed,
      ruleSetId: rules.id,
      difficulty,
      league,
      postDraftLeague: null,
      draft: null,
      violations: [],
      compare: [],
      realignment: [],
      phase: 'founding',
      maxPhase: 'founding',
    });
  },

  found: (opts) => {
    const base = get().league;
    if (!base) return;
    const { league, realignment } = createFranchise(base, opts);
    document.documentElement.style.setProperty('--team-primary', opts.colors.primary);
    document.documentElement.style.setProperty('--team-secondary', opts.colors.secondary);
    set({ league, realignment: realignment.changes, draft: startExpansionDraft(league), phase: 'reveal', maxPhase: 'reveal' });
  },

  goto: (phase) => {
    const { maxPhase } = get();
    if (phaseIndex(phase) <= phaseIndex(maxPhase)) set({ phase });
    else if (OPEN_PHASES.includes(phase) && OPEN_PHASES.includes(maxPhase)) set({ phase, maxPhase: phase });
  },

  offer: (playerId, offer) => {
    const { draft, league } = get();
    if (draft && league) set({ draft: makeOffer(league, draft, playerId, offer), violations: [] });
  },

  acceptDeal: (dealId) => {
    const d = get().draft;
    if (!d) return null;
    const res = acceptDeal(d, dealId);
    if (!res.error) set({ draft: res.state, violations: [] });
    return res.error;
  },

  declineDeal: (dealId) => {
    const d = get().draft;
    if (d) set({ draft: declineDeal(d, dealId) });
  },

  scout: (playerId) => {
    const d = get().draft;
    if (d) set({ draft: scoutPlayer(d, playerId) });
  },

  select: (teamId, playerId) => {
    const { draft, league } = get();
    if (draft && league) set({ draft: selectPlayer(league, draft, teamId, playerId), violations: [] });
  },

  autoFill: () => {
    const { draft, league } = get();
    if (draft && league) set({ draft: autoFillSelection(league, draft), violations: [] });
  },

  clearSelection: () => {
    const d = get().draft;
    if (d) set({ draft: clearSelection(d), violations: [] });
  },

  toggleWish: (playerId) => {
    const d = get().draft;
    if (d) set({ draft: toggleWishlist(d, playerId) });
  },

  toggleCompare: (playerId) => {
    const c = get().compare;
    set({ compare: c.includes(playerId) ? c.filter((x) => x !== playerId) : [...c, playerId].slice(-3) });
  },

  openPlayer: (playerId) => set({ modalPlayerId: playerId }),

  submit: () => {
    const { draft, league } = get();
    if (!draft || !league) return false;
    const res = submitExpansionDraft(league, draft);
    if (!res.ok) {
      set({ violations: res.violations });
      return false;
    }
    set({ draft: res.state, postDraftLeague: res.league, violations: [], phase: 'night', maxPhase: 'results' });
    return true;
  },

  reset: () =>
    set({ phase: 'start', maxPhase: 'start', league: null, postDraftLeague: null, draft: null, violations: [], compare: [], modalPlayerId: null }),
}));
