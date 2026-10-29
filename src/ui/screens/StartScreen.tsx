import { useEffect, useRef, useState } from 'react';
import type { Difficulty, ExpansionRules, RuleSetId } from '../../engine';
import { RULE_SETS, cloneRules, defaultConfig, exportLeagueData, generateLeague, importLeagueData } from '../../engine';
import type { SaveMeta } from '../../store/persistence';
import { downloadText, listSaves } from '../../store/persistence';
import { useGame } from '../../store/game';
import { RULE_TIPS } from '../text';
import { Button, Panel, Tip } from '../components/ui';

function randomSeed(): string {
  const words = ['frost', 'blueline', 'icing', 'slapshot', 'zamboni', 'crease', 'hattrick', 'faceoff', 'breakaway', 'boards'];
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return `${words[(buf[0] ?? 0) % words.length]}-${((buf[1] ?? 0) % 9000) + 1000}`;
}

const DIFFS: { id: Difficulty; label: string }[] = [
  { id: 'leicht', label: 'Leicht' },
  { id: 'normal', label: 'Normal' },
  { id: 'schwer', label: 'Schwer' },
];

type NumField = { label: string; get: (r: ExpansionRules) => number; set: (r: ExpansionRules, v: number) => void; min: number; max: number; step?: number };

const scheme = (r: ExpansionRules, id: string) => r.schemes.find((s) => s.id === id) as ExpansionRules['schemes'][number];

const CUSTOM_FIELDS: NumField[] = [
  { label: 'Schema A: Stürmer', get: (r) => scheme(r, '7-3-1').forwards ?? 7, set: (r, v) => (scheme(r, '7-3-1').forwards = v), min: 4, max: 10 },
  { label: 'Schema A: Verteidiger', get: (r) => scheme(r, '7-3-1').defense ?? 3, set: (r, v) => (scheme(r, '7-3-1').defense = v), min: 2, max: 6 },
  { label: 'Schema B: Feldspieler', get: (r) => scheme(r, '8-1').skaters ?? 8, set: (r, v) => (scheme(r, '8-1').skaters = v), min: 5, max: 12 },
  { label: 'Exempt bis Profijahr', get: (r) => r.exemptMaxProYears, set: (r, v) => (r.exemptMaxProYears = v), min: 0, max: 3 },
  { label: 'Exposure: Stürmer', get: (r) => r.exposure.forwards, set: (r, v) => (r.exposure.forwards = v), min: 1, max: 4 },
  { label: 'Exposure: Verteidiger', get: (r) => r.exposure.defense, set: (r, v) => (r.exposure.defense = v), min: 1, max: 3 },
  { label: 'Exposure: Spiele Vorsaison', get: (r) => r.exposure.gpLastSeason, set: (r, v) => (r.exposure.gpLastSeason = v), min: 10, max: 70 },
  { label: 'Exposure: Spiele 2 Saisons', get: (r) => r.exposure.gpLastTwo, set: (r, v) => (r.exposure.gpLastTwo = v), min: 20, max: 130 },
  { label: 'Kader: min. Stürmer', get: (r) => r.roster.minForwards, set: (r, v) => (r.roster.minForwards = v), min: 8, max: 18 },
  { label: 'Kader: min. Verteidiger', get: (r) => r.roster.minDefense, set: (r, v) => (r.roster.minDefense = v), min: 5, max: 12 },
  { label: 'Kader: min. Goalies', get: (r) => r.roster.minGoalies, set: (r, v) => (r.roster.minGoalies = v), min: 2, max: 4 },
  { label: 'Kader: min. Verträge', get: (r) => r.roster.minUnderContract, set: (r, v) => (r.roster.minUnderContract = v), min: 10, max: 26 },
  { label: 'Cap-Korridor min. %', get: (r) => Math.round(r.roster.capMinPct * 100), set: (r, v) => (r.roster.capMinPct = v / 100), min: 30, max: 75, step: 5 },
  { label: 'Cap-Korridor max. %', get: (r) => Math.round(r.roster.capMaxPct * 100), set: (r, v) => (r.roster.capMaxPct = v / 100), min: 80, max: 120, step: 5 },
];

function CustomRulesEditor({ rules, onChange }: { rules: ExpansionRules; onChange: (r: ExpansionRules) => void }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-coal-600 bg-coal-850 p-3">
      {CUSTOM_FIELDS.map((f) => (
        <label key={f.label} className="flex items-center justify-between gap-2 text-xs text-slate-300">
          <span>{f.label}</span>
          <input
            type="number"
            min={f.min}
            max={f.max}
            step={f.step ?? 1}
            value={f.get(rules)}
            onChange={(e) => {
              const v = Math.max(f.min, Math.min(f.max, Number(e.target.value) || f.min));
              const next = cloneRules(rules);
              f.set(next, v);
              onChange(next);
            }}
            className="w-16 rounded border border-coal-600 bg-coal-900 px-1.5 py-1 text-right font-mono text-slate-100"
          />
        </label>
      ))}
      <label className="col-span-2 flex items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={rules.nmcMustBeProtected}
          onChange={(e) => onChange({ ...cloneRules(rules), nmcMustBeProtected: e.target.checked })}
        />
        NMC-Spieler müssen geschützt werden
      </label>
    </div>
  );
}

function ContinuePanel() {
  const { loadFrom, setMenuOpen } = useGame();
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void listSaves().then(setSaves), []);
  const auto = saves.find((s) => s.slot === 'auto');
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-coal-700 bg-coal-900/60 p-4">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Weiterspielen</div>
        <div className="truncate text-sm text-slate-200">
          {auto ? `${auto.teamName} · ${auto.detail}` : saves.length ? `${saves.length} Spielstand/Spielstände vorhanden` : 'Noch keine Spielstände.'}
        </div>
        {auto && <div className="text-xs text-slate-500">Autosave vom {new Date(auto.savedAt).toLocaleString('de-DE')}</div>}
        {error && <div className="text-xs text-rose-300">{error}</div>}
      </div>
      {auto && <Button onClick={async () => setError(await loadFrom('auto'))}>Fortsetzen</Button>}
      <Button variant="ghost" onClick={() => setMenuOpen(true)}>
        Spielstände …
      </Button>
    </div>
  );
}

function LeagueImportPanel({ seed, rules, difficulty }: { seed: string; rules: ExpansionRules; difficulty: Difficulty }) {
  const newGameFromLeague = useGame((s) => s.newGameFromLeague);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-4 rounded-xl border border-coal-700 bg-coal-900/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center text-xs font-semibold uppercase tracking-wider text-slate-400">
            Eigene Liga importieren
            <Tip text="JSON-Datei im Format „team33-league“ (siehe README): 28–32 Teams in 2 Conferences mit je 2 Divisionen, Spieler mit Position, Alter, OVR oder Attributen und Vertrag. Fehlende Details ergänzt das Spiel anhand des Seeds. Die Vorlage enthält die aktuell per Seed generierte Liga." />
          </div>
          <div className="text-xs text-slate-500">Verwendet Seed, Regelset und Schwierigkeit aus dem Formular rechts.</div>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            const lg = generateLeague(seed.trim() || 'vorlage', defaultConfig({ rules: cloneRules(rules), difficulty }));
            downloadText(`team33-liga-${seed.trim() || 'vorlage'}.json`, JSON.stringify(exportLeagueData(lg), null, 2));
          }}
        >
          Vorlage herunterladen
        </Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          Liga-Datei wählen …
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            let raw: unknown;
            try {
              raw = JSON.parse(await f.text());
            } catch {
              setErrors(['Die Datei ist kein gültiges JSON.']);
              return;
            }
            const res = importLeagueData(raw, seed.trim() || f.name, defaultConfig({ rules: cloneRules(rules), difficulty }));
            setErrors(res.errors);
            setWarnings(res.warnings);
            if (res.league) newGameFromLeague(res.league, rules, difficulty);
          }}
        />
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="mt-3 max-h-48 space-y-1 overflow-auto rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-100">
          <li className="font-semibold">Import fehlgeschlagen:</li>
          {errors.map((m) => (
            <li key={m}>• {m}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && errors.length === 0 && <p className="mt-2 text-xs text-amber-200">{warnings.length} Hinweis(e) beim Import, z. B.: {warnings[0]}</p>}
    </div>
  );
}

export function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const [seed, setSeed] = useState(randomSeed);
  const [ruleSet, setRuleSet] = useState<RuleSetId>('seattle2021');
  const [custom, setCustom] = useState<ExpansionRules>(() => cloneRules(RULE_SETS.custom));
  const [diff, setDiff] = useState<Difficulty>('normal');
  const budget = defaultConfig().scoutingBudget[diff];

  return (
    <div className="mx-auto grid max-w-5xl gap-10 pt-10 lg:grid-cols-[1.2fr_1fr] lg:pt-20">
      <div>
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-ice-500/30 bg-ice-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ice-300">
          Saison 2027-28 · Franchise Nr. 33
        </div>
        <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl">
          Team 33
          <span className="block bg-gradient-to-r from-ice-300 to-ice-500 bg-clip-text text-transparent">Expansion Draft GM</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
          Die Liga wächst. Du bist General Manager des 33. Franchise – ohne Spieler, ohne Picks, ohne Geschichte. Baue deinen Kader im
          Expansion Draft aus den ungeschützten Spielern der 32 Teams. Lies die Schutzlisten, scoute klug, halte die Regeln ein.
        </p>
        <ul className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
          {[
            ['Regelkonform', 'Schutzlisten, Exposure-Pflichten und Cap-Korridor wie im echten Expansion Draft.'],
            ['Fog of War', 'Fremde Spieler nur als Spanne – Scouting-Budget gezielt einsetzen.'],
            ['32 KI-GMs', 'Jedes Team schützt nach eigener Strategie: Rebuild, Contender, Cap-gebunden.'],
            ['Reproduzierbar', 'Gleicher Seed + gleiche Entscheidungen = identisches Ergebnis.'],
          ].map(([t, d]) => (
            <li key={t} className="rounded-lg border border-coal-700 bg-coal-900/60 p-3">
              <div className="font-semibold text-ice-200">{t}</div>
              <div className="mt-1 text-slate-400">{d}</div>
            </li>
          ))}
        </ul>
        <ContinuePanel />
        <LeagueImportPanel seed={seed} rules={ruleSet === 'custom' ? custom : RULE_SETS[ruleSet]} difficulty={diff} />
      </div>

      <Panel title="Neue Liga" className="self-start">
        <form
          className="space-y-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            newGame(seed.trim() || randomSeed(), ruleSet === 'custom' ? custom : RULE_SETS[ruleSet], diff);
          }}
        >
          <label className="block">
            <span className="mb-1.5 flex items-center text-xs font-semibold uppercase tracking-wider text-slate-400">
              Seed
              <Tip text="Der Seed bestimmt die gesamte Liga: Teams, Spieler, Verträge und alle KI-Entscheidungen. Teile ihn, um dieselbe Liga erneut zu spielen." />
            </span>
            <div className="flex gap-2">
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="w-full rounded-md border border-coal-600 bg-coal-850 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-ice-400"
                aria-label="Seed"
              />
              <Button variant="ghost" onClick={() => setSeed(randomSeed())} title="Zufälliger Seed">
                ⟳
              </Button>
            </div>
          </label>

          <fieldset>
            <legend className="mb-1.5 flex items-center text-xs font-semibold uppercase tracking-wider text-slate-400">
              Regelset <Tip text={RULE_TIPS.schemes + ' ' + RULE_TIPS.exposure} />
            </legend>
            <div className="grid gap-2">
              {(Object.keys(RULE_SETS) as RuleSetId[]).map((id) => (
                <label
                  key={id}
                  className={`cursor-pointer rounded-lg border p-3 transition ${ruleSet === id ? 'border-ice-400 bg-ice-500/10' : 'border-coal-600 hover:border-coal-500'}`}
                >
                  <input type="radio" name="rules" className="sr-only" checked={ruleSet === id} onChange={() => setRuleSet(id)} />
                  <div className="text-sm font-semibold text-slate-100">
                    {RULE_SETS[id].label}
                    {id === 'seattle2021' && <span className="ml-2 text-[10px] uppercase text-ice-300">Standard</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">{RULE_SETS[id].description}</div>
                </label>
              ))}
            </div>
            {ruleSet === 'custom' && <CustomRulesEditor rules={custom} onChange={setCustom} />}
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Schwierigkeit</legend>
            <div className="grid grid-cols-3 gap-2">
              {DIFFS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDiff(d.id)}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold ${diff === d.id ? 'border-ice-400 bg-ice-500/10 text-ice-200' : 'border-coal-600 text-slate-300 hover:border-coal-500'}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">Scouting-Budget im Expansion Draft: {budget} Punkte.</p>
          </fieldset>

          <Button type="submit" className="w-full py-3 text-base">
            Liga generieren
          </Button>
        </form>
      </Panel>
    </div>
  );
}
