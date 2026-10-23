import { DEFAULT_TUNING, sanitizeTuning, type TuningParams } from '../physics/tuning';

const PREFIX = 'mypolytrack.v1';

const KEYS = {
  settings: `${PREFIX}.settings`,
  scores: (trackId: string) => `${PREFIX}.scores.${trackId}`,
  ghost: (trackId: string) => `${PREFIX}.ghost.${trackId}`
};

export interface ScoreEntry {
  time: number;
  date: string;
}

export interface GhostRecord {
  data: string;
  duration: number;
}

export interface SubmitResult {
  list: ScoreEntry[];
  rank: number;
  isBest: boolean;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('[storage] failed to read', key, error);
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('[storage] failed to write', key, error);
    return false;
  }
}

export function loadSettings(): TuningParams {
  return sanitizeTuning(read<unknown>(KEYS.settings) ?? DEFAULT_TUNING);
}

export function saveSettings(params: TuningParams): void {
  write(KEYS.settings, sanitizeTuning(params));
}

export function loadScores(trackId: string): ScoreEntry[] {
  const raw = read<unknown>(KEYS.scores(trackId));
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is ScoreEntry => {
      if (!item || typeof item !== 'object') return false;
      const entry = item as Partial<ScoreEntry>;
      return typeof entry.time === 'number' && Number.isFinite(entry.time) && entry.time > 0;
    })
    .map((entry) => ({
      time: entry.time,
      date: typeof entry.date === 'string' ? entry.date : '—'
    }))
    .sort((a, b) => a.time - b.time)
    .slice(0, 5);
}

export function submitScore(trackId: string, time: number): SubmitResult {
  const previous = loadScores(trackId);
  const previousBest = previous.length > 0 ? previous[0].time : Infinity;
  const entry: ScoreEntry = {
    time,
    date: new Date().toISOString().slice(0, 10)
  };
  const list = [...previous, entry].sort((a, b) => a.time - b.time).slice(0, 5);
  write(KEYS.scores(trackId), list);
  return {
    list,
    rank: list.indexOf(entry),
    isBest: time < previousBest
  };
}

export function bestTime(trackId: string): number | null {
  const list = loadScores(trackId);
  return list.length ? list[0].time : null;
}

export function saveGhost(trackId: string, record: GhostRecord): boolean {
  return write(KEYS.ghost(trackId), record);
}

export function loadGhost(trackId: string): GhostRecord | null {
  const raw = read<GhostRecord>(KEYS.ghost(trackId));
  if (!raw || typeof raw.data !== 'string' || typeof raw.duration !== 'number') return null;
  return raw;
}

export function clearAllProgress(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch (error) {
    console.warn('[storage] failed to clear progress', error);
  }
}
