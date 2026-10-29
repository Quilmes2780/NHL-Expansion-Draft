import { create } from 'zustand';
import type {
  Difficulty,
  ExpansionDraftState,
  ExpansionRules,
  FranchiseOptions,
  League,
  Lineup,
  Offer,
  OffseasonState,
  RuleSetId,
  TradeEvaluation,
  TradeProposal,
  Violation,
} from '../engine';
import {
  EXPANSION_TEAM_ID,
  advanceFaDay,
  autoLineup as autoLineupFor,
  autoUserPick,
  finishEntryDraft,
  finishFreeAgency,
  offerOwnRfa,
  placeUserOffer,
  proposeTrade,
  scoutProspect,
  setFarm,
  simEntryDraft,
  simToUserPick,
  startOffseason,
  userDraftPick,
  withdrawUserOffer,
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

export type Phase = 'start' | 'founding' | 'reveal' | 'window' | 'draft' | 'night' | 'results' | 'offseason';

export const PHASES: { id: Phase; label: string }[] = [
  { id: 'founding', label: 'Gründung' },
  { id: 'reveal', label: 'Schutzlisten' },
  { id: 'window', label: 'Verhandlungen' },
  { id: 'draft', label: 'Draft Board' },
  { id: 'night', label: 'Draft-Abend' },
  { id: 'results', label: 'Bilanz' },
  { id: 'offseason', label: 'Offseason' },
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

  /** The league during the offseason (after the expansion draft). */
  offLeague: League | null;
  off: OffseasonState | null;
  startOffseason: () => void;
  edPick: (playerId: string) => void;
  edAuto: () => void;
  edSimAll: () => void;
  edScout: (playerId: string) => void;
  finishDraft: () => void;
  faOffer: (playerId: string, offer: Offer) => string | null;
  faWithdraw: (playerId: string) => void;
  faOwnRfa: (playerId: string, offer: Offer) => void;
  faAdvance: () => void;
  finishFa: () => void;
  trade: (t: TradeProposal) => TradeEvaluation | null;
  setLineup: (l: Lineup) => void;
  autoLineup: () => void;
  toggleFarm: (playerId: string) => string | null;
}

const ORDER: Phase[] = ['start', 'founding', 'reveal', 'window', 'draft', 'night', 'results', 'offseason'];
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
    set({
      phase: 'start',
      maxPhase: 'start',
      league: null,
      postDraftLeague: null,
      draft: null,
      violations: [],
      compare: [],
      modalPlayerId: null,
      offLeague: null,
      off: null,
    }),

  offLeague: null,
  off: null,

  startOffseason: () => {
    const { postDraftLeague, off } = get();
    if (!postDraftLeague) return;
    if (off) return set({ phase: 'offseason' });
    const r = startOffseason(postDraftLeague);
    set({ offLeague: r.league, off: r.state, phase: 'offseason', maxPhase: 'offseason' });
  },

  edPick: (playerId) => {
    const { offLeague, off } = get();
    if (!offLeague || !off) return;
    const a = userDraftPick(offLeague, off.draft, playerId);
    const b = simToUserPick(a.league, a.state);
    set({ offLeague: b.league, off: { ...off, draft: b.state } });
  },

  edAuto: () => {
    const { offLeague, off } = get();
    if (!offLeague || !off) return;
    const a = autoUserPick(offLeague, off.draft);
    const b = simToUserPick(a.league, a.state);
    set({ offLeague: b.league, off: { ...off, draft: b.state } });
  },

  edSimAll: () => {
    const { offLeague, off } = get();
    if (!offLeague || !off) return;
    const r = simEntryDraft(offLeague, off.draft);
    set({ offLeague: r.league, off: { ...off, draft: r.state } });
  },

  edScout: (playerId) => {
    const off = get().off;
    if (off) set({ off: { ...off, draft: scoutProspect(off.draft, playerId) } });
  },

  finishDraft: () => {
    const { offLeague, off } = get();
    if (!offLeague || !off) return;
    const r = finishEntryDraft(offLeague, off);
    set({ offLeague: r.league, off: r.state });
  },

  faOffer: (playerId, offer) => {
    const { offLeague, off } = get();
    if (!offLeague || !off?.fa) return null;
    const r = placeUserOffer(offLeague, off.fa, playerId, offer);
    if (!r.error) set({ off: { ...off, fa: r.state } });
    return r.error;
  },

  faWithdraw: (playerId) => {
    const off = get().off;
    if (off?.fa) set({ off: { ...off, fa: withdrawUserOffer(off.fa, playerId) } });
  },

  faOwnRfa: (playerId, offer) => {
    const { offLeague, off } = get();
    if (!offLeague || !off?.fa) return;
    const r = offerOwnRfa(offLeague, off.fa, playerId, offer);
    set({ offLeague: r.league, off: { ...off, fa: r.state } });
  },

  faAdvance: () => {
    const { offLeague, off } = get();
    if (!offLeague || !off?.fa) return;
    const r = advanceFaDay(offLeague, off.fa);
    set({ offLeague: r.league, off: { ...off, fa: r.state } });
  },

  finishFa: () => {
    const off = get().off;
    if (off) set({ off: finishFreeAgency(off) });
  },

  trade: (t) => {
    const { offLeague, off } = get();
    if (!offLeague || !off) return null;
    const r = proposeTrade(offLeague, off, t);
    if (r.evaluation.accepted) set({ offLeague: r.league, off: r.state });
    return r.evaluation;
  },

  setLineup: (l) => {
    const off = get().off;
    if (off) set({ off: { ...off, lineup: l } });
  },

  autoLineup: () => {
    const { offLeague, off } = get();
    if (offLeague && off) set({ off: { ...off, lineup: autoLineupFor(offLeague, EXPANSION_TEAM_ID) } });
  },

  toggleFarm: (playerId) => {
    const { offLeague } = get();
    const p = offLeague?.players[playerId];
    if (!offLeague || !p) return null;
    const r = setFarm(offLeague, playerId, !p.farm);
    if (!r.error) set({ offLeague: r.league });
    return r.error;
  },
}));
