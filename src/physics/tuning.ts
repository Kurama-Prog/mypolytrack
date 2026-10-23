export type GripMode = 'grip' | 'drift';

export interface TuningParams {
  /** Multiplier applied to engine force. 1 = stock. */
  acceleration: number;
  /** Multiplier applied to braking force. 1 = stock. */
  brake: number;
  gripMode: GripMode;
}

export const TUNING_LIMITS = {
  min: 0.5,
  max: 2,
  step: 0.05
} as const;

export const DEFAULT_TUNING: TuningParams = {
  acceleration: 1,
  brake: 1,
  gripMode: 'grip'
};

export function clampTuning(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(TUNING_LIMITS.max, Math.max(TUNING_LIMITS.min, value));
}

export function sanitizeTuning(raw: unknown): TuningParams {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TUNING };
  const source = raw as Partial<TuningParams>;
  return {
    acceleration: clampTuning(Number(source.acceleration ?? DEFAULT_TUNING.acceleration)),
    brake: clampTuning(Number(source.brake ?? DEFAULT_TUNING.brake)),
    gripMode: source.gripMode === 'drift' ? 'drift' : 'grip'
  };
}

/** Small observable store shared by the HUD, the pause menu and the game. */
export class TuningStore {
  private params: TuningParams;
  private listeners = new Set<(params: TuningParams) => void>();

  constructor(initial: TuningParams = DEFAULT_TUNING) {
    this.params = sanitizeTuning(initial);
  }

  get value(): Readonly<TuningParams> {
    return this.params;
  }

  set(patch: Partial<TuningParams>) {
    this.params = sanitizeTuning({ ...this.params, ...patch });
    for (const listener of this.listeners) listener(this.params);
  }

  reset() {
    this.set({ ...DEFAULT_TUNING });
  }

  subscribe(listener: (params: TuningParams) => void): () => void {
    this.listeners.add(listener);
    listener(this.params);
    return () => this.listeners.delete(listener);
  }
}
