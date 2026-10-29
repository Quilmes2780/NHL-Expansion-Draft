import { create } from 'zustand';
import type { SaveFile, Settings, SlotId } from './persistence';
import { SAVE_FORMAT, SAVE_VERSION, loadSettings, parseSaveFile, readSave, storeSettings, writeSave } from './persistence';
import type {
  FranchiseMeta,
  SeasonRecord,
  PlayoffState,
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
  autoFillRoster,
  bestActiveRoster,
  advanceSeason,
  seasonRecord,
  simPlayoffDay,
  startPlayoffs as startPlayoffsEngine,
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

export type Phase = 'start' | 'founding' | 'reveal' | 'window' | 'draft' | 'night' | 'results' | 'offseason' | 'season' | 'playoffs' | 'summary';

export const PHASES: { id: Phase; label: string }[] = [
  { id: 'founding', label: 'Gründung' },
  { id: 'reveal', label: 'Schutzlisten' },
  { id: 'window', label: 'Verhandlungen' },
  { id: 'draft', label: 'Draft Board' },
  { id: 'night', label: 'Draft-Abend' },
  { id: 'results', label: 'Bilanz' },
  { id: 'offseason', label: 'Offseason' },
  { id: 'season', label: 'Saison' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'summary', label: 'Saisonbilanz' },
];

export type PlayoffSimTarget = 'day' | 'round' | 'end';

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
  /** Re-sign own RFAs and make offers until positions and cap floor are covered; returns what was done. */
  faAutoFill: () => string[];
  /** Offseason: best NHL roster from all players under contract, then the auto lineup. */
  bestRoster: () => void;
  finishFa: () => void;
  trade: (t: TradeProposal) => TradeEvaluation | null;
  setLineup: (l: Lineup) => void;
  autoLineup: () => void;
  toggleFarm: (playerId: string) => string | null;

  season: SeasonState | null;
  simulating: boolean;
  /** Own games of the last simulation step (for the ticker). */
  lastBoxes: BoxScore[];
  /** Why the last simulation stopped early (injuries in the own team). */
  simNotice: string[];
  clearSimNotice: () => void;
  tickerEnabled: boolean;
  startSeason: () => string[];
  simulate: (target: SimTarget) => Promise<void>;
  setSeasonOption: (o: Partial<SeasonOptions>) => void;
  setTicker: (on: boolean) => void;
  clearBoxes: () => void;

  playoffs: PlayoffState | null;
  /** 1 = inaugural season; later seasons skip the expansion phases. */
  seasonNo: number;
  /** Results of the finished seasons (oldest first). */
  history: SeasonRecord[];
  /** Fans/owner at the end of the last season, carried into the next one. */
  prevMeta: FranchiseMeta | null;
  /** After the season summary: roll over into the next offseason. */
  nextSeason: () => void;
  startPlayoffs: () => void;
  simulatePlayoffs: (target: PlayoffSimTarget) => Promise<void>;
  finishSeason: () => void;

  /** Start a new game from an imported league (see engine/io/leagueData). */
  newGameFromLeague: (league: League, rules: ExpansionRules, difficulty: Difficulty) => void;
  settings: Settings;
  updateSettings: (s: Partial<Settings>) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  saveTo: (slot: SlotId, name?: string) => Promise<string | null>;
  loadFrom: (slot: SlotId) => Promise<string | null>;
  exportSave: () => string | null;
  importSave: (text: string) => string | null;
}

/**
 * Let the browser render between simulation chunks. A MessageChannel macrotask is used instead of
 * setTimeout, which browsers throttle to ≥ 1 s in background tabs.
 */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'undefined') return void setTimeout(resolve, 0);
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(null);
  });
}

/** Injury messages of the own team logged since log index `from`. */
const ownInjuries = (s: SeasonState, from: number): string[] =>
  s.log.slice(from).filter((e) => e.kind === 'injury' && e.teamId === EXPANSION_TEAM_ID).map((e) => e.text);

/** The parts of the store that make up a save game. */
const SNAPSHOT_KEYS = [
  'phase',
  'maxPhase',
  'seed',
  'ruleSetId',
  'difficulty',
  'league',
  'postDraftLeague',
  'realignment',
  'draft',
  'offLeague',
  'off',
  'season',
  'playoffs',
  'seasonNo',
  'history',
  'prevMeta',
  'tickerEnabled',
] as const;
type Snapshot = Pick<GameStore, (typeof SNAPSHOT_KEYS)[number]>;

function applyTeamColors(league: League | null): void {
  const t = league?.teams.find((x) => x.isExpansion);
  if (!t || typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--team-primary', t.colors.primary);
  document.documentElement.style.setProperty('--team-secondary', t.colors.secondary);
}

function makeSaveFile(s: GameStore, slot: SlotId, name?: string): SaveFile<Snapshot> | null {
  if (s.phase === 'start' || !s.league) return null;
  const state = Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, s[k]])) as Snapshot;
  const current = s.offLeague ?? s.postDraftLeague ?? s.league;
  const me = current.teams.find((t) => t.isExpansion);
  const phaseLabel = PHASES.find((p) => p.id === s.phase)?.label ?? s.phase;
  const detail = s.season ? `Tag ${s.season.day} · ${Object.keys(s.season.results).length} Spiele gespielt` : phaseLabel;
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    meta: {
      slot,
      name: name ?? (slot === 'auto' ? 'Autosave' : `${me ? `${me.city} ${me.name}` : 'Neue Liga'} – ${phaseLabel}`),
      savedAt: new Date().toISOString(),
      phase: phaseLabel,
      teamName: me ? `${me.city} ${me.name}` : '–',
      seed: s.seed,
      detail,
    },
    state,
  };
}

/** The lineup the user is currently editing (offseason, season or playoffs). */
export const selectMyLineup = (s: GameStore): Lineup | null =>
  s.playoffs?.season.lineups[EXPANSION_TEAM_ID] ?? s.season?.lineups[EXPANSION_TEAM_ID] ?? s.off?.lineup ?? null;

const ORDER: Phase[] = ['start', 'founding', 'reveal', 'window', 'draft', 'night', 'results', 'offseason', 'season', 'playoffs', 'summary'];
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
      playoffs: null,
      lastBoxes: [],
      simNotice: [],
      seasonNo: 1,
      history: [],
      prevMeta: null,
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
    const { maxPhase, seasonNo } = get();
    if (seasonNo > 1 && phaseIndex(phase) < phaseIndex('offseason')) return;
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
      playoffs: null,
      lastBoxes: [],
      simNotice: [],
      seasonNo: 1,
      history: [],
      prevMeta: null,
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

  faAutoFill: () => {
    const { offLeague, off } = get();
    if (!offLeague || !off?.fa) return [];
    const r = autoFillRoster(offLeague, off.fa);
    set({ offLeague: r.league, off: { ...off, fa: r.state } });
    return r.actions;
  },

  bestRoster: () => {
    const { offLeague, off, season } = get();
    if (!offLeague || !off || season) return;
    const lg = bestActiveRoster(offLeague, EXPANSION_TEAM_ID);
    set({ offLeague: lg, off: { ...off, lineup: autoLineupFor(lg, EXPANSION_TEAM_ID) } });
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
    const { off, season, playoffs } = get();
    if (playoffs)
      set({ playoffs: { ...playoffs, season: { ...playoffs.season, savedLineup: null, lineups: { ...playoffs.season.lineups, [EXPANSION_TEAM_ID]: l } } } });
    else if (season) set({ season: { ...season, savedLineup: null, lineups: { ...season.lineups, [EXPANSION_TEAM_ID]: l } } });
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
    // Roles promised in the negotiation window are tracked for player morale.
    const { seasonNo, prevMeta } = get();
    const promises = seasonNo === 1 ? Object.fromEntries(Object.values(get().draft?.signings ?? {}).map((sg) => [sg.playerId, sg.role])) : {};
    const r = startSeasonEngine(offLeague, off.lineup, {}, undefined, promises, prevMeta);
    set({ offLeague: r.league, season: r.state, phase: 'season', maxPhase: 'season', lastBoxes: [] });
    return [];
  },

  simulate: async (target) => {
    if (get().simulating) return;
    set({ simulating: true, lastBoxes: [], simNotice: [] });
    const start = get().season;
    const logStart = start?.log.length ?? 0;
    const stopAt = (s: SeasonState): boolean => {
      if (!start) return true;
      // An injury in the own team interrupts longer simulations, so the user can react.
      if (target !== 'day' && ownInjuries(s, logStart).length) return true;
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
        await yieldToUi();
      }
    } finally {
      const s = get().season;
      set({ simulating: false, lastBoxes: target === 'day' || target === 'week' ? boxes : [], simNotice: s ? ownInjuries(s, logStart) : [] });
    }
  },

  setSeasonOption: (o) => {
    const s = get().season;
    if (s) set({ season: { ...s, options: { ...s.options, ...o } } });
  },

  setTicker: (on) => set({ tickerEnabled: on }),
  clearBoxes: () => set({ lastBoxes: [] }),
  simNotice: [],
  clearSimNotice: () => set({ simNotice: [] }),

  playoffs: null,
  seasonNo: 1,
  history: [],
  prevMeta: null,

  nextSeason: () => {
    const { offLeague, season, playoffs, seasonNo, history } = get();
    if (!offLeague || !season?.done || (playoffs && !playoffs.champion)) return;
    const record = seasonRecord(offLeague, season, playoffs);
    const roll = advanceSeason(offLeague, season, playoffs);
    const r = startOffseason(roll.league, roll.report);
    set({
      offLeague: r.league,
      off: r.state,
      season: null,
      playoffs: null,
      prevMeta: (playoffs?.season ?? season).meta,
      seasonNo: seasonNo + 1,
      history: [...history, record],
      phase: 'offseason',
      maxPhase: 'offseason',
      lastBoxes: [],
      simNotice: [],
    });
  },

  startPlayoffs: () => {
    const { offLeague, season, playoffs } = get();
    if (playoffs) return set({ phase: 'playoffs' });
    if (!offLeague || !season?.done) return;
    set({ playoffs: startPlayoffsEngine(offLeague, season), phase: 'playoffs', maxPhase: 'playoffs', lastBoxes: [] });
  },

  simulatePlayoffs: async (target) => {
    if (get().simulating) return;
    const start = get().playoffs;
    if (!start) return;
    set({ simulating: true, lastBoxes: [], simNotice: [] });
    const logStart = start.season.log.length;
    const boxes: BoxScore[] = [];
    try {
      for (;;) {
        const { offLeague, playoffs } = get();
        if (!offLeague || !playoffs || playoffs.champion) break;
        if (target !== 'day' && ownInjuries(playoffs.season, logStart).length) break;
        if (target === 'day' && playoffs.season.day > start.season.day) break;
        if (target === 'round' && playoffs.round > start.round) break;
        const r = simPlayoffDay(offLeague, playoffs);
        boxes.push(...r.userBoxes);
        set({ offLeague: r.league, playoffs: r.po });
        await yieldToUi();
      }
    } finally {
      const po = get().playoffs;
      set({ simulating: false, lastBoxes: target === 'end' ? [] : boxes, simNotice: po ? ownInjuries(po.season, logStart) : [] });
    }
  },

  finishSeason: () => {
    const { season, playoffs } = get();
    if (season?.done && (!playoffs || playoffs.champion)) set({ phase: 'summary', maxPhase: 'summary' });
  },

  newGameFromLeague: (league, rules, difficulty) => {
    const lg: League = { ...league, config: { ...league.config, rules: cloneRules(rules), difficulty } };
    set({
      seed: league.seed,
      ruleSetId: rules.id,
      difficulty,
      league: lg,
      postDraftLeague: null,
      draft: null,
      violations: [],
      compare: [],
      realignment: [],
      offLeague: null,
      off: null,
      season: null,
      playoffs: null,
      lastBoxes: [],
      simNotice: [],
      seasonNo: 1,
      history: [],
      prevMeta: null,
      phase: 'founding',
      maxPhase: 'founding',
    });
  },

  settings: loadSettings(),
  updateSettings: (s) => {
    const settings = { ...get().settings, ...s };
    storeSettings(settings);
    set({ settings });
  },

  menuOpen: false,
  setMenuOpen: (open) => set({ menuOpen: open }),

  saveTo: async (slot, name) => {
    const file = makeSaveFile(get(), slot, name);
    if (!file) return 'Es gibt noch keinen Spielstand zum Speichern.';
    return writeSave(file);
  },

  loadFrom: async (slot) => {
    const file = await readSave(slot);
    if (!file) return 'Dieser Speicherplatz ist leer.';
    return get().importSave(JSON.stringify(file));
  },

  exportSave: () => {
    const file = makeSaveFile(get(), 'slot1', 'Export');
    return file ? JSON.stringify(file) : null;
  },

  importSave: (text) => {
    const { file, error } = parseSaveFile(text);
    if (!file) return error;
    const state = file.state as Snapshot;
    if (!state.league || !PHASES.some((p) => p.id === state.phase)) return 'Der Spielstand ist unvollständig.';
    set({ ...state, seasonNo: state.seasonNo ?? 1, history: state.history ?? [], prevMeta: state.prevMeta ?? null, violations: [], modalPlayerId: null, compare: [], lastBoxes: [], simNotice: [], simulating: false, menuOpen: false });
    applyTeamColors(state.league);
    return null;
  },
}));

/** Autosave: shortly after any change to the game state (but not while simulating). */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return useGame.subscribe((s, prev) => {
    if (s.phase === 'start' || s.simulating) return;
    const changed = SNAPSHOT_KEYS.some((k) => s[k] !== prev[k]) || (prev.simulating && !s.simulating);
    if (!changed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const file = makeSaveFile(useGame.getState(), 'auto');
      if (file) void writeSave(file);
    }, 2000);
  });
}
