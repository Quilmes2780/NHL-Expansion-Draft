/**
 * Save slots in IndexedDB (fallback: localStorage), JSON export/import of save games, per-browser
 * settings and the cross-game achievement list. UI-side only – the engine stays storage-free.
 */

export const SAVE_FORMAT = 'team33-save';
export const SAVE_VERSION = 1;
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof SLOTS)[number];

export interface SaveMeta {
  slot: SlotId;
  name: string;
  savedAt: string;
  phase: string;
  teamName: string;
  seed: string;
  detail: string;
}

export interface SaveFile<T = unknown> {
  format: typeof SAVE_FORMAT;
  version: number;
  meta: SaveMeta;
  state: T;
}

const DB_NAME = 'team33';
const LS_PREFIX = 'team33.save.';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idb<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeSave(file: SaveFile): Promise<string | null> {
  const db = await openDb();
  if (db) {
    const ok1 = await idb(db, 'saves', 'readwrite', (s) => s.put(file, file.meta.slot));
    const ok2 = await idb(db, 'meta', 'readwrite', (s) => s.put(file.meta, file.meta.slot));
    if (ok1 !== null && ok2 !== null) return null;
  }
  try {
    localStorage.setItem(LS_PREFIX + file.meta.slot, JSON.stringify(file));
    return null;
  } catch {
    return 'Speichern fehlgeschlagen: Der Browser erlaubt keinen (ausreichenden) lokalen Speicher. Nutze „Als Datei exportieren“.';
  }
}

export async function readSave(slot: SlotId): Promise<SaveFile | null> {
  const db = await openDb();
  if (db) {
    const f = await idb<SaveFile>(db, 'saves', 'readonly', (s) => s.get(slot));
    if (f) return f;
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + slot);
    return raw ? (JSON.parse(raw) as SaveFile) : null;
  } catch {
    return null;
  }
}

export async function listSaves(): Promise<SaveMeta[]> {
  const out = new Map<string, SaveMeta>();
  const db = await openDb();
  if (db) {
    for (const slot of SLOTS) {
      const m = await idb<SaveMeta>(db, 'meta', 'readonly', (s) => s.get(slot));
      if (m) out.set(slot, m);
    }
  }
  for (const slot of SLOTS) {
    if (out.has(slot)) continue;
    try {
      const raw = localStorage.getItem(LS_PREFIX + slot);
      if (raw) out.set(slot, (JSON.parse(raw) as SaveFile).meta);
    } catch {
      /* ignore broken entries */
    }
  }
  return SLOTS.map((s) => out.get(s)).filter((m): m is SaveMeta => !!m);
}

export async function deleteSave(slot: SlotId): Promise<void> {
  const db = await openDb();
  if (db) {
    await idb(db, 'saves', 'readwrite', (s) => s.delete(slot));
    await idb(db, 'meta', 'readwrite', (s) => s.delete(slot));
  }
  try {
    localStorage.removeItem(LS_PREFIX + slot);
  } catch {
    /* ignore */
  }
}

/** Parse and sanity-check an exported save file. */
export function parseSaveFile(text: string): { file: SaveFile | null; error: string | null } {
  try {
    const f = JSON.parse(text) as SaveFile;
    if (f?.format !== SAVE_FORMAT) return { file: null, error: 'Das ist keine Team-33-Spielstanddatei.' };
    if (f.version !== SAVE_VERSION) return { file: null, error: `Nicht unterstützte Spielstand-Version ${f.version} (erwartet ${SAVE_VERSION}).` };
    if (!f.state || typeof f.state !== 'object') return { file: null, error: 'Die Datei enthält keinen Spielzustand.' };
    return { file: f, error: null };
  } catch {
    return { file: null, error: 'Die Datei ist kein gültiges JSON.' };
  }
}

// ---------------------------------------------------------------- per-browser settings

export type SimSpeed = 'slow' | 'normal' | 'fast';

export interface Settings {
  speed: SimSpeed;
  tutorial: boolean;
  seenTips: string[];
}

const SETTINGS_KEY = 'team33.settings';
const ACH_KEY = 'team33.achievements';

export function loadSettings(): Settings {
  const fallback: Settings = { speed: 'normal', tutorial: true, seenTips: [] };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Settings>) } : fallback;
  } catch {
    return fallback;
  }
}

export function storeSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* settings are a convenience only */
  }
}

/** Achievement id → first unlock date (ISO), across all games in this browser. */
export function loadAchievements(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ACH_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function recordAchievements(ids: string[]): Record<string, string> {
  const all = loadAchievements();
  const now = new Date().toISOString();
  for (const id of ids) all[id] ??= now;
  try {
    localStorage.setItem(ACH_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  return all;
}

export const speedFactor = (s: SimSpeed): number => (s === 'slow' ? 1.7 : s === 'fast' ? 0.3 : 1);

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
