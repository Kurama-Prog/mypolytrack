import type { AudioBus } from './context';

export type SfxEvent =
  | 'count'
  | 'go'
  | 'checkpoint'
  | 'boost'
  | 'land'
  | 'finish'
  | 'respawn'
  | 'click'
  | 'ignition'
  | 'best';

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  delay?: number;
  /** Target frequency for a glide. */
  to?: number;
  /** Low-pass cutoff applied after the envelope. */
  filter?: number;
  detune?: number;
}

interface NoiseOptions {
  gain?: number;
  freq?: number;
  to?: number;
  q?: number;
  type?: BiquadFilterType;
  delay?: number;
  attack?: number;
}

/**
 * One-shot interface sounds. Every voice is created on demand, stopped by the
 * AudioContext clock and disconnected when finished, so nothing accumulates.
 */
export class Sfx {
  constructor(private readonly bus: AudioBus) {}

  play(event: SfxEvent): void {
    const out = this.bus.sfx;
    const ctx = this.bus.context;
    if (!out || !ctx) return;

    switch (event) {
      case 'count':
        this.tone(760, 0.11, { type: 'square', gain: 0.1, filter: 3200 });
        this.tone(1520, 0.035, { type: 'sine', gain: 0.035, delay: 0.005 });
        break;

      case 'go':
        [392, 523.25, 783.99].forEach((freq, index) => {
          this.tone(freq, 0.34, {
            type: 'sawtooth',
            gain: 0.085,
            delay: index * 0.022,
            filter: 2600
          });
        });
        this.noiseBurst(0.22, { gain: 0.08, freq: 1800, to: 5200, q: 0.9 });
        break;

      case 'checkpoint':
        this.tone(880, 0.09, { type: 'triangle', gain: 0.1, filter: 4200 });
        this.tone(1318.5, 0.14, { type: 'triangle', gain: 0.08, delay: 0.075, filter: 5000 });
        break;

      case 'boost':
        this.noiseBurst(0.42, { gain: 0.16, freq: 420, to: 3200, q: 1.1 });
        this.tone(180, 0.34, { type: 'sawtooth', gain: 0.05, to: 520, filter: 1800 });
        break;

      case 'land':
        this.tone(112, 0.22, { type: 'sine', gain: 0.2, to: 44, attack: 0.004 });
        this.noiseBurst(0.16, { gain: 0.14, freq: 560, to: 180, q: 0.7 });
        break;

      case 'finish':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
          this.tone(freq, 0.2, {
            type: 'triangle',
            gain: 0.1,
            delay: index * 0.085,
            filter: 4800
          });
        });
        this.tone(130.81, 0.7, { type: 'sine', gain: 0.12, filter: 900 });
        break;

      case 'best':
        [783.99, 1046.5, 1318.5].forEach((freq, index) => {
          this.tone(freq, 0.16, {
            type: 'sine',
            gain: 0.075,
            delay: 0.12 + index * 0.07
          });
        });
        break;

      case 'respawn':
        this.tone(520, 0.3, { type: 'triangle', gain: 0.09, to: 168, filter: 2200 });
        break;

      case 'click':
        this.tone(1180, 0.045, { type: 'triangle', gain: 0.045, filter: 5200 });
        break;

      case 'ignition':
        this.noiseBurst(0.5, { gain: 0.1, freq: 680, to: 1500, q: 2.2 });
        this.tone(44, 0.62, { type: 'sawtooth', gain: 0.09, to: 108, filter: 420 });
        this.tone(96, 0.5, { type: 'square', gain: 0.03, to: 150, filter: 900 });
        break;
    }
  }

  private tone(freq: number, dur: number, options: ToneOptions = {}): void {
    const ctx = this.bus.context;
    const out = this.bus.sfx;
    if (!ctx || !out) return;

    const start = ctx.currentTime + (options.delay ?? 0);
    const peak = Math.max(0.0002, options.gain ?? 0.1);
    const attack = Math.min(dur * 0.6, Math.max(0.002, options.attack ?? 0.006));

    const osc = ctx.createOscillator();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(20, freq), start);
    if (options.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), start + dur);
    }
    if (options.detune !== undefined) osc.detune.value = options.detune;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    let tail: AudioNode = env;
    if (options.filter !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = options.filter;
      filter.Q.value = 0.9;
      env.connect(filter);
      tail = filter;
    }

    osc.connect(env);
    tail.connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      if (tail !== env) tail.disconnect();
    };
  }

  private noiseBurst(dur: number, options: NoiseOptions = {}): void {
    const ctx = this.bus.context;
    const out = this.bus.sfx;
    const buffer = this.bus.noiseBuffer;
    if (!ctx || !out || !buffer) return;

    const start = ctx.currentTime + (options.delay ?? 0);
    const peak = Math.max(0.0002, options.gain ?? 0.1);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = options.type ?? 'bandpass';
    filter.Q.value = options.q ?? 1;
    filter.frequency.setValueAtTime(Math.max(40, options.freq ?? 900), start);
    if (options.to !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.to), start + dur);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + Math.min(dur * 0.4, options.attack ?? 0.008));
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    source.connect(filter);
    filter.connect(env);
    env.connect(out);
    source.start(start);
    source.stop(start + dur + 0.02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }
}
