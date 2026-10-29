import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { LogoSpec, Mandate } from '../../engine';
import { EXPANSION_CITIES, EXPANSION_NAME_IDEAS, LOGO_ICONS, LOGO_SHAPES, createFranchise } from '../../engine';
import { useGame } from '../../store/game';
import { MANDATES } from '../text';
import { Logo } from '../components/Logo';
import { Button, Panel, Tip } from '../components/ui';

const PALETTES: [string, string, string][] = [
  ['#0ea5e9', '#0b1220', '#e0f2fe'],
  ['#14532d', '#facc15', '#f8fafc'],
  ['#7f1d1d', '#111827', '#f5f5f4'],
  ['#4c1d95', '#22d3ee', '#f8fafc'],
  ['#ea580c', '#1e293b', '#fff7ed'],
  ['#0f766e', '#0b1220', '#ccfbf1'],
  ['#1e3a8a', '#dc2626', '#f8fafc'],
  ['#111827', '#a3e635', '#f9fafb'],
];

const STAT_LABEL: [keyof (typeof EXPANSION_CITIES)[number], string, string][] = [
  ['marketSize', 'Markt', 'Marktgröße: beeinflusst Einnahmen und Medieninteresse.'],
  ['tradition', 'Tradition', 'Hockey-Tradition: beeinflusst Fan-Geduld und Zuschauer.'],
  ['taxAdvantage', 'Steuer', 'Steuervorteil: erhöht die Bereitschaft von Free Agents, zu unterschreiben.'],
  ['travelLoad', 'Reisen', 'Reisebelastung: höher = mehr Ermüdung in der Saison.'],
];

function StatBar({ value, invert }: { value: number; invert?: boolean }) {
  const good = invert ? 11 - value : value;
  const color = good >= 7 ? 'bg-emerald-400' : good >= 4 ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-sm ${i < value ? color : 'bg-coal-700'}`} />
      ))}
    </div>
  );
}

export function FoundingScreen() {
  const { league, found } = useGame();
  const [cityId, setCityId] = useState(EXPANSION_CITIES[0]?.id ?? 'houston');
  const [name, setName] = useState('Glaciers');
  const [abbrev, setAbbrev] = useState('');
  const [colors, setColors] = useState({ primary: '#0ea5e9', secondary: '#0b1220', accent: '#e0f2fe' });
  const [shape, setShape] = useState<LogoSpec['shape']>('shield');
  const [icon, setIcon] = useState<string>('snowflake');
  const [logoText, setLogoText] = useState(true);
  const [mandate, setMandate] = useState<Mandate>('patientBuild');

  const city = EXPANSION_CITIES.find((c) => c.id === cityId) ?? EXPANSION_CITIES[0]!;
  const abbr = (abbrev || city.city.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase();
  const logo: LogoSpec = { shape, icon, colors, text: logoText ? abbr : '' };
  const opts = { cityId, name, abbrev: abbr, colors, logo, mandate };

  // Only city and name influence the realignment text.
  const preview = useMemo(
    () => (league ? createFranchise(league, opts).realignment : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, cityId, name],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black text-white">Franchise-Gründung</h1>
        <p className="mt-1 text-slate-400">Wähle Stadt, Identität und das Mandat deines Owners.</p>
      </div>

      <Panel title="1 · Stadt">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {EXPANSION_CITIES.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setCityId(c.id)}
              className={`rounded-lg border p-3 text-left transition ${c.id === cityId ? 'border-ice-400 bg-ice-500/10 ring-1 ring-ice-400/40' : 'border-coal-700 bg-coal-850 hover:border-coal-500'}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-bold text-slate-100">{c.city}</span>
                <span className="text-[11px] text-slate-500">{c.region}</span>
              </div>
              <div className="mt-2 space-y-1">
                {STAT_LABEL.map(([k, l, tip]) => (
                  <div key={k} className="grid grid-cols-[60px_1fr] items-center gap-2 text-[11px] text-slate-400" title={tip}>
                    <span>{l}</span>
                    <StatBar value={c[k] as number} invert={k === 'travelLoad'} />
                  </div>
                ))}
                <div className="text-[11px] text-slate-400">Arena: {c.arenaCapacity.toLocaleString('de-DE')} Plätze</div>
              </div>
            </button>
          ))}
        </div>
        <p className="border-t border-coal-700 px-4 py-3 text-sm text-slate-300">{city.blurb}</p>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Panel title="2 · Name & Logo">
          <div className="grid gap-5 p-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_90px] gap-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Teamname
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} className="mt-1 w-full rounded-md border border-coal-600 bg-coal-850 px-3 py-2 text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-ice-400" />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Kürzel
                  <input value={abbrev} placeholder={abbr} onChange={(e) => setAbbrev(e.target.value.toUpperCase().slice(0, 3))} className="mt-1 w-full rounded-md border border-coal-600 bg-coal-850 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-ice-400" />
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EXPANSION_NAME_IDEAS.map((n) => (
                  <button type="button" key={n} onClick={() => setName(n)} className="rounded-full border border-coal-600 px-2.5 py-0.5 text-xs text-slate-300 hover:border-ice-400">
                    {n}
                  </button>
                ))}
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Farben</div>
                <div className="flex flex-wrap items-center gap-2">
                  {PALETTES.map(([p, s, a]) => (
                    <button
                      type="button"
                      key={p + s}
                      onClick={() => setColors({ primary: p, secondary: s, accent: a })}
                      className="flex h-7 w-11 overflow-hidden rounded border border-coal-600 hover:scale-105"
                      aria-label={`Farbpalette ${p}`}
                    >
                      <span className="flex-1" style={{ background: p }} />
                      <span className="flex-1" style={{ background: s }} />
                      <span className="w-2" style={{ background: a }} />
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-3 text-xs text-slate-400">
                  {(['primary', 'secondary', 'accent'] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input type="color" value={colors[k]} onChange={(e) => setColors({ ...colors, [k]: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-coal-600 bg-transparent" />
                      {k === 'primary' ? 'Primär' : k === 'secondary' ? 'Sekundär' : 'Akzent'}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Grundform</div>
                <div className="flex flex-wrap gap-2">
                  {LOGO_SHAPES.map((s) => (
                    <button type="button" key={s} onClick={() => setShape(s)} className={`rounded-md border p-1 ${s === shape ? 'border-ice-400 bg-ice-500/10' : 'border-coal-600'}`} aria-label={s}>
                      <Logo spec={{ shape: s, icon: '', colors: { primary: '#334155', secondary: '#94a3b8', accent: 'transparent' }, text: '' }} size={30} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Symbol</div>
                <div className="flex flex-wrap gap-2">
                  {LOGO_ICONS.map((i) => (
                    <button type="button" key={i} onClick={() => setIcon(i)} className={`rounded-md border p-1 ${i === icon ? 'border-ice-400 bg-ice-500/10' : 'border-coal-600'}`} aria-label={i}>
                      <Logo spec={{ shape: 'circle', icon: i, colors: { primary: '#1d2a42', secondary: '#1d2a42', accent: '#cbd5e1' }, text: '' }} size={30} />
                    </button>
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <input type="checkbox" checked={logoText} onChange={(e) => setLogoText(e.target.checked)} /> Kürzel im Logo
                </label>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3 sm:w-48">
              <div className="rounded-2xl border border-coal-700 p-5" style={{ background: `radial-gradient(circle at 50% 30%, ${colors.primary}33, transparent 70%)` }}>
                <Logo spec={logo} size={150} />
              </div>
              <div className="text-center">
                <div className="text-xs uppercase tracking-widest text-slate-400">{city.city}</div>
                <div className="text-xl font-black text-white">{name || '—'}</div>
              </div>
            </div>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="3 · Owner-Mandat">
            <div className="grid gap-2 p-4">
              {MANDATES.map((m) => (
                <label key={m.id} className={`cursor-pointer rounded-lg border p-3 transition ${mandate === m.id ? 'border-ice-400 bg-ice-500/10' : 'border-coal-600 hover:border-coal-500'}`}>
                  <input type="radio" className="sr-only" name="mandate" checked={mandate === m.id} onChange={() => setMandate(m.id)} />
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100">{m.label}</span>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400">{m.difficulty}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-slate-400">{m.text}</div>
                </label>
              ))}
            </div>
          </Panel>

          <Panel
            title={
              <span className="flex items-center">
                Neueinteilung der Divisionen
                <Tip text="Mit 33 Teams wird nach Geografie neu eingeteilt: Dein Team kommt in die nächstgelegene Division. Spart ein Wechsel deutlich Reisekilometer, tauscht ein Team die Division – ggf. sogar die Conference." />
              </span>
            }
          >
            <div className="space-y-3 p-4 text-sm">
              <ul className="space-y-1 text-ice-200">
                {preview?.changes.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {preview?.divisions.map((d) => (
                  <div key={d.name} className="rounded-md border border-coal-700 bg-coal-850 p-2">
                    <div className="mb-1 font-semibold text-slate-200">
                      {d.name} <span className="text-slate-500">· {d.conference} · {d.teamIds.length}</span>
                    </div>
                    <div className="text-slate-400">
                      {d.teamIds
                        .map((id) => (id === 'exp' ? <b key={id} className="text-ice-300">{abbr}</b> : league?.teams.find((t) => t.id === id)?.abbrev))
                        .reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, ' · ', el] : [el]), [])}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
          <Button className="w-full py-3 text-base" disabled={!name.trim()} onClick={() => found(opts)}>
            Franchise gründen & Schutzlisten abwarten →
          </Button>
        </div>
      </div>
    </div>
  );
}
