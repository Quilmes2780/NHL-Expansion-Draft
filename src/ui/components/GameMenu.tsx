import { useEffect, useRef, useState } from 'react';
import { ACHIEVEMENTS, RULE_SETS } from '../../engine';
import type { SaveMeta, SimSpeed, SlotId } from '../../store/persistence';
import { SLOTS, deleteSave, downloadText, listSaves, loadAchievements } from '../../store/persistence';
import { useGame } from '../../store/game';
import { Button } from './ui';

type Tab = 'saves' | 'settings' | 'achievements';

const SLOT_LABEL: Record<SlotId, string> = { auto: 'Autosave', slot1: 'Platz 1', slot2: 'Platz 2', slot3: 'Platz 3' };

export function SavesPanel({ allowSave }: { allowSave: boolean }) {
  const { saveTo, loadFrom, exportSave, importSave, seed } = useGame();
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => void listSaves().then(setSaves);
  useEffect(refresh, []);
  const meta = (slot: SlotId) => saves.find((s) => s.slot === slot);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {SLOTS.map((slot) => {
          const m = meta(slot);
          return (
            <li key={slot} className="flex flex-wrap items-center gap-3 rounded-lg border border-coal-700 bg-coal-850 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-ice-300">{SLOT_LABEL[slot]}</div>
                {m ? (
                  <>
                    <div className="truncate text-sm text-slate-100">{m.name}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(m.savedAt).toLocaleString('de-DE')} · {m.detail} · Seed {m.seed}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">leer</div>
                )}
              </div>
              {allowSave && slot !== 'auto' && (
                <Button
                  variant="subtle"
                  className="px-2.5 py-1 text-xs"
                  onClick={async () => {
                    if (m && !confirm(`${SLOT_LABEL[slot]} überschreiben?`)) return;
                    const err = await saveTo(slot);
                    setMsg(err ? { text: err, error: true } : { text: `Gespeichert in ${SLOT_LABEL[slot]}.`, error: false });
                    refresh();
                  }}
                >
                  Speichern
                </Button>
              )}
              {m && (
                <>
                  <Button
                    className="px-2.5 py-1 text-xs"
                    onClick={async () => {
                      const err = await loadFrom(slot);
                      setMsg(err ? { text: err, error: true } : null);
                    }}
                  >
                    Laden
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-rose-300 hover:underline"
                    onClick={async () => {
                      if (!confirm(`${SLOT_LABEL[slot]} löschen?`)) return;
                      await deleteSave(slot);
                      refresh();
                    }}
                  >
                    löschen
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-coal-700 pt-3">
        {allowSave && (
          <Button
            variant="ghost"
            onClick={() => {
              const text = exportSave();
              if (text) downloadText(`team33-${seed || 'spielstand'}.json`, text);
            }}
          >
            Als Datei exportieren
          </Button>
        )}
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          Spielstand-Datei importieren
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
            const err = importSave(await f.text());
            setMsg(err ? { text: err, error: true } : null);
          }}
        />
      </div>
      {msg && <p className={`text-sm ${msg.error ? 'text-rose-300' : 'text-emerald-300'}`}>{msg.text}</p>}
      <p className="text-xs text-slate-500">
        Spielstände liegen lokal in diesem Browser (IndexedDB). Der Autosave wird nach jeder Änderung automatisch aktualisiert. Für Backups oder einen
        anderen Rechner nutze den Datei-Export.
      </p>
    </div>
  );
}

function SettingsPanel() {
  const { settings, updateSettings, tickerEnabled, setTicker, season, setSeasonOption, seed, ruleSetId, difficulty } = useGame();
  const speeds: [SimSpeed, string][] = [
    ['slow', 'Langsam'],
    ['normal', 'Normal'],
    ['fast', 'Schnell'],
  ];
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Simulations- und Animationsgeschwindigkeit</div>
        <div className="grid grid-cols-3 gap-2">
          {speeds.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => updateSettings({ speed: id })}
              className={`rounded-md border px-3 py-2 font-semibold ${settings.speed === id ? 'border-ice-400 bg-ice-500/10 text-ice-200' : 'border-coal-600 text-slate-300'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">Gilt für Schutzlisten-Reveal, Draft-Abend und Spiel-Ticker.</p>
      </div>
      <label className="flex items-center gap-2 text-slate-300">
        <input type="checkbox" checked={tickerEnabled} onChange={(e) => setTicker(e.target.checked)} /> Kurz-Ticker für eigene Spiele
      </label>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-slate-300">
          <input type="checkbox" checked={settings.autoLineup} onChange={(e) => updateSettings({ autoLineup: e.target.checked })} /> Vor jedem Spieltag automatisch die
          bestmögliche Aufstellung setzen
        </label>
        <p className="pl-6 text-xs text-slate-500">
          Aus: Deine eigene Aufstellung gilt; nur bei Verletzungen springt die Auto-Aufstellung ein, bis alle wieder fit sind.
        </p>
        <label className="flex items-center gap-2 text-slate-300">
          <input type="checkbox" checked={settings.stopOnReturn} onChange={(e) => updateSettings({ stopOnReturn: e.target.checked })} /> Simulation auch anhalten, wenn ein
          verletzter Spieler wieder fit ist
        </label>
        <p className="pl-6 text-xs text-slate-500">Bei Verletzungen im eigenen Team stoppt die Simulation immer. Diese Option verlangsamt den Spielfluss.</p>
      </div>
      {season && (
        <label className="flex items-center gap-2 text-slate-300">
          <input type="checkbox" checked={season.options.misfitsBonus} onChange={(e) => setSeasonOption({ misfitsBonus: e.target.checked })} /> Misfits-Bonus für
          das Expansionsteam (erste 20 Spiele)
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-slate-300">
          <input type="checkbox" checked={settings.tutorial} onChange={(e) => updateSettings({ tutorial: e.target.checked })} /> Tutorial-Hinweise anzeigen
        </label>
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => updateSettings({ seenTips: [], tutorial: true })}>
          Hinweise zurücksetzen
        </Button>
      </div>
      {seed && (
        <div className="rounded-lg border border-coal-700 bg-coal-850 p-3 text-xs text-slate-400">
          Laufendes Spiel: Seed <span className="font-mono text-slate-200">{seed}</span> · Regelset {RULE_SETS[ruleSetId].label} · Schwierigkeit {difficulty}. Regelset, Seed
          und Schwierigkeit (Scouting-Budget, KI-Aufschlag bei Trades) werden beim Start einer neuen Liga gewählt.
        </div>
      )}
    </div>
  );
}

export function AchievementsPanel() {
  const all = loadAchievements();
  const got = ACHIEVEMENTS.filter((a) => all[a.id]).length;
  return (
    <div>
      <p className="mb-3 text-sm text-slate-400">
        {got} von {ACHIEVEMENTS.length} freigeschaltet – über alle Spiele in diesem Browser.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ACHIEVEMENTS.map((a) => {
          const when = all[a.id];
          return (
            <div key={a.id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${when ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-coal-700 opacity-50'}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${when ? 'bg-emerald-400 text-coal-950' : 'bg-coal-700 text-slate-500'}`}>{when ? '✓' : '?'}</span>
              <div>
                <div className="text-sm font-semibold text-slate-100">{a.name}</div>
                <div className="text-xs text-slate-400">{a.description}</div>
                {when && <div className="text-[10px] text-emerald-300">seit {new Date(when).toLocaleDateString('de-DE')}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GameMenu() {
  const { menuOpen, setMenuOpen, phase } = useGame();
  const [tab, setTab] = useState<Tab>('saves');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setMenuOpen]);
  if (!menuOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={() => setMenuOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Menü" className="animate-pick-in w-full max-w-2xl rounded-2xl border border-coal-600 bg-coal-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-coal-700 px-4 py-3">
          {(
            [
              ['saves', 'Spielstände'],
              ['settings', 'Einstellungen'],
              ['achievements', 'Achievements'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === id ? 'bg-coal-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Schließen" className="ml-auto text-xl text-slate-400 hover:text-white">
            ×
          </button>
        </div>
        <div className="max-h-[75vh] overflow-auto p-4">
          {tab === 'saves' && <SavesPanel allowSave={phase !== 'start'} />}
          {tab === 'settings' && <SettingsPanel />}
          {tab === 'achievements' && <AchievementsPanel />}
        </div>
      </div>
    </div>
  );
}
