/**
 * Audio preferences: two independent levels plus a global mute, persisted in
 * localStorage. Volume is stored as 0..1 and applied on the audio buses.
 */

export interface AudioParams {
  /** Music bus level, 0..1. */
  music: number;
  /** Sound-effect bus level, 0..1. */
  sfx: number;
  muted: boolean;
}

export const AUDIO_LIMITS = {
  min: 0,
  max: 1,
  step: 0.05
} as const;

export const DEFAULT_AUDIO: AudioParams = {
  music: 0.55,
  sfx: 0.8,
  muted: false
};

const STORAGE_KEY = 'mypolytrack.v1.audio';

export function clampLevel(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(AUDIO_LIMITS.max, Math.max(AUDIO_LIMITS.min, value));
}

export function sanitizeAudio(raw: unknown): AudioParams {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AUDIO };
  const source = raw as Partial<AudioParams>;
  return {
    music: clampLevel(Number(source.music ?? DEFAULT_AUDIO.music), DEFAULT_AUDIO.music),
    sfx: clampLevel(Number(source.sfx ?? DEFAULT_AUDIO.sfx), DEFAULT_AUDIO.sfx),
    muted: source.muted === true
  };
}

export function loadAudioSettings(): AudioParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO };
    return sanitizeAudio(JSON.parse(raw) as unknown);
  } catch (error) {
    console.warn('[audio] failed to read settings', error);
    return { ...DEFAULT_AUDIO };
  }
}

export function saveAudioSettings(params: AudioParams): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeAudio(params)));
  } catch (error) {
    console.warn('[audio] failed to write settings', error);
  }
}

/** Observable store shared by the settings screen, pause menu and HUD. */
export class AudioStore {
  private params: AudioParams;
  private listeners = new Set<(params: AudioParams) => void>();

  constructor(initial: AudioParams = loadAudioSettings()) {
    this.params = sanitizeAudio(initial);
  }

  get value(): Readonly<AudioParams> {
    return this.params;
  }

  set(patch: Partial<AudioParams>) {
    this.params = sanitizeAudio({ ...this.params, ...patch });
    for (const listener of this.listeners) listener(this.params);
  }

  toggleMute() {
    this.set({ muted: !this.params.muted });
  }

  reset() {
    this.set({ ...DEFAULT_AUDIO });
  }

  subscribe(listener: (params: AudioParams) => void): () => void {
    this.listeners.add(listener);
    listener(this.params);
    return () => this.listeners.delete(listener);
  }
}
