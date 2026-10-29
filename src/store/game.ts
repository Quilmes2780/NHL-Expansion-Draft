import { create } from 'zustand';
import type {
  BoxScore,
  DayResult,
  SeasonOptions,
  SeasonState,
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
  demoteWithWaivers,
  seasonReadiness,
  simDay,
  startSeason as startSeasonEngine,
  tradeDeadlinePassed,
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

export type Phase = 'start' | 'founding' | 'reveal' | 'window' | 'draft' | 'night' | 'results' | 'offseason' | 'season';

export const PHASES: { id: Phase; label: string }[] = [
  { id: 'founding', label: 'Gründung' },
  { id: 'reveal', label: 'Schutzlisten' },
  { id: 'window', label: 'Verhandlungen' },
  { id: 'draft', label: 'Draft Board' },
  { id: 'night', label: 'Draft-Abend' },
  { id: 'results', label: 'Bilanz' },
  { id: 'offseason', label: 'Offseason' },
  { id: 'season', label: 'Saison' },
];

export type SimTarget = 'day' | 'week' | 'deadline' | 'end';

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

  season: SeasonState | null;
  simulating: boolean;
  /** Own games of the last simulation step (for the ticker). */
  lastBoxes: BoxScore[];
  tickerEnabled: boolean;
  startSeason: () => string[];
  simulate: (target: SimTarget) => Promise<void>;
  setSeasonOption: (o: Partial<SeasonOptions>) => void;
  setTicker: (on: boolean) => void;
  clearBoxes: () => void;
}

/** The lineup the user is currently editing (offseason or season). */
export const selectMyLineup = (s: GameStore): Lineup | null => s.season?.lineups[EXPANSION_TEAM_ID] ?? s.off?.lineup ?? null;

const ORDER: Phase[] = ['start', 'founding', 'reveal', 'window', 'draft', 'night', 'results', 'offseason', 'season'];
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
      offLeague: null,
      off: null,
      season: null,
      lastBoxes: [],
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
      season: null,
      lastBoxes: [],
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
    const { offLeague, off, season } = get();
    if (!offLeague || !off) return null;
    if (season && tradeDeadlinePassed(season))
      return { accepted: false, ratio: 0, valueIn: 0, valueOut: 0, reasons: ['Die Trade Deadline ist vorbei.'] };
    const r = proposeTrade(offLeague, off, t);
    if (r.evaluation.accepted) {
      set({ offLeague: r.league, off: r.state });
      if (season) {
        const text = r.state.trades[r.state.trades.length - 1]?.text ?? 'Trade abgeschlossen.';
        set({ season: { ...season, log: [...season.log, { day: season.day, teamId: EXPANSION_TEAM_ID, kind: 'trade', text }] } });
      }
    }
    return r.evaluation;
  },

  setLineup: (l) => {
    const { off, season } = get();
    if (season) set({ season: { ...season, lineups: { ...season.lineups, [EXPANSION_TEAM_ID]: l } } });
    else if (off) set({ off: { ...off, lineup: l } });
  },

  autoLineup: () => {
    const { offLeague } = get();
    if (offLeague) get().setLineup(autoLineupFor(offLeague, EXPANSION_TEAM_ID));
  },

  toggleFarm: (playerId) => {
    const { offLeague, season } = get();
    const p = offLeague?.players[playerId];
    if (!offLeague || !p) return null;
    if (season && !p.farm) {
      const r = demoteWithWaivers(offLeague, season, playerId);
      set({ offLeague: r.league, season: r.state });
      return r.claimedBy ? `${p.lastName} wurde über Waivers geclaimt.` : null;
    }
    const r = setFarm(offLeague, playerId, !p.farm);
    if (!r.error) set({ offLeague: r.league });
    return r.error;
  },

  season: null,
  simulating: false,
  lastBoxes: [],
  tickerEnabled: true,

  startSeason: () => {
    const { offLeague, off, season } = get();
    if (season) {
      set({ phase: 'season' });
      return [];
    }
    if (!offLeague || !off) return ['Keine Offseason aktiv.'];
    const issues = seasonReadiness(offLeague, EXPANSION_TEAM_ID, off.lineup).map((i) => i.message);
    if (issues.length) return issues;
    const r = startSeasonEngine(offLeague, off.lineup);
    set({ offLeague: r.league, season: r.state, phase: 'season', maxPhase: 'season', lastBoxes: [] });
    return [];
  },

  simulate: async (target) => {
    if (get().simulating) return;
    set({ simulating: true, lastBoxes: [] });
    const start = get().season;
    const stopAt = (s: SeasonState): boolean => {
      if (!start) return true;
      if (target === 'day') return s.day > start.day;
      if (target === 'week') return s.day >= start.day + 7;
      // Stop on deadline day itself, so trades are still possible.
      if (target === 'deadline') return s.day >= s.deadlineDay;
      return false;
    };
    const boxes: BoxScore[] = [];
    try {
      // Simulate in small chunks so the UI stays responsive.
      for (;;) {
        const { offLeague, season } = get();
        if (!offLeague || !season || season.done || stopAt(season)) break;
        let r: DayResult = { league: offLeague, state: season, userBoxes: [] };
        for (let k = 0; k < 4 && !r.state.done && !stopAt(r.state); k++) {
          r = simDay(r.league, r.state);
          boxes.push(...r.userBoxes);
        }
        set({ offLeague: r.league, season: r.state });
        await new Promise((res) => setTimeout(res, 0));
      }
    } finally {
      set({ simulating: false, lastBoxes: target === 'day' || target === 'week' ? boxes : [] });
    }
  },

  setSeasonOption: (o) => {
    const s = get().season;
    if (s) set({ season: { ...s, options: { ...s.options, ...o } } });
  },

  setTicker: (on) => set({ tickerEnabled: on }),
  clearBoxes: () => set({ lastBoxes: [] }),
}));
