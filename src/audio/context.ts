import type { AudioStore } from './settings';

type AudioContextCtor = typeof AudioContext;

function resolveCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const legacy = window as unknown as { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? legacy.webkitAudioContext ?? null;
}

/**
 * Owns the single AudioContext, the music / sfx buses and the safety limiter.
 * The context is only created after a user gesture so browser autoplay policy
 * never leaves the game in a permanently silent state.
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private musicLevel = 0.55;
  private sfxLevel = 0.8;
  private duckLevel = 1;
  private muted = false;

  private readyCallbacks: Array<() => void> = [];

  constructor(private readonly store: AudioStore) {
    const unlock = () => {
      this.ensure();
      void this.resume();
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) {
        void this.ctx.suspend().catch(() => undefined);
      } else {
        void this.ctx.resume().catch(() => undefined);
      }
    });

    this.store.subscribe((params) => {
      this.musicLevel = params.music;
      this.sfxLevel = params.sfx;
      this.muted = params.muted;
      this.applyLevels();
    });
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  get noiseBuffer(): AudioBuffer | null {
    return this.noise;
  }

  /** Destination for continuous engine / brake voices. */
  get sfx(): GainNode | null {
    return this.sfxGain;
  }

  /** Destination for the music sequencer. */
  get music(): GainNode | null {
    return this.musicGain;
  }

  /** Creates the context + bus graph on demand. Returns null when Web Audio is unavailable. */
  ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = resolveCtor();
    if (!Ctor) {
      console.warn('[audio] Web Audio is not supported in this browser');
      return null;
    }

    try {
      const ctx = new Ctor({ latencyHint: 'interactive' });

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 10;
      limiter.ratio.value = 5;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.22;
      limiter.connect(ctx.destination);

      const music = ctx.createGain();
      music.gain.value = 0;
      music.connect(limiter);

      const sfx = ctx.createGain();
      sfx.gain.value = 0;
      sfx.connect(limiter);

      this.ctx = ctx;
      this.musicGain = music;
      this.sfxGain = sfx;
      this.noise = this.createNoise(ctx);
      this.applyLevels(true);

      const queued = this.readyCallbacks;
      this.readyCallbacks = [];
      for (const callback of queued) callback();
      return ctx;
    } catch (error) {
      console.warn('[audio] failed to initialise AudioContext', error);
      return null;
    }
  }

  /** Resumes a suspended context (autoplay policy, tab switches). */
  async resume(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    try {
      await ctx.resume();
    } catch (error) {
      console.warn('[audio] resume blocked', error);
    }
  }

  onReady(callback: () => void): void {
    if (this.isRunning) {
      callback();
      return;
    }
    this.readyCallbacks.push(callback);
  }

  /** Lowers the music bus without touching the user's volume setting. */
  setDuck(level: number): void {
    const next = Math.min(1, Math.max(0, level));
    if (Math.abs(next - this.duckLevel) < 0.001) return;
    this.duckLevel = next;
    this.applyLevels();
  }

  private applyLevels(immediate = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || !this.sfxGain) return;
    const now = ctx.currentTime;
    const musicTarget = this.muted ? 0 : this.musicLevel * this.duckLevel;
    const sfxTarget = this.muted ? 0 : this.sfxLevel;

    if (immediate) {
      this.musicGain.gain.cancelScheduledValues(now);
      this.sfxGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(musicTarget, now);
      this.sfxGain.gain.setValueAtTime(sfxTarget, now);
      return;
    }

    this.musicGain.gain.setTargetAtTime(musicTarget, now, 0.09);
    this.sfxGain.gain.setTargetAtTime(sfxTarget, now, 0.06);
  }

  private createNoise(ctx: AudioContext): AudioBuffer {
    const seconds = 2;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      // Slight low-passing keeps white noise from sounding brittle.
      last = 0.7 * last + 0.3 * white;
      data[i] = last;
    }
    return buffer;
  }

  dispose(): void {
    this.readyCallbacks = [];
    const ctx = this.ctx;
    this.ctx = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noise = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
  }
}
