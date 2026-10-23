import type { AudioBus } from './context';

const MAX_SPEED = 56;

export interface EngineTelemetry {
  /** World speed in units per second (same unit the HUD converts to km/h). */
  speed: number;
  throttle: number;
  brake: number;
  boost: boolean;
  grounded: boolean;
}

interface EngineVoice {
  a: OscillatorNode;
  b: OscillatorNode;
  sub: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  intake: AudioBufferSourceNode;
  intakeFilter: BiquadFilterNode;
  intakeGain: GainNode;
}

interface BrakeVoice {
  noise: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  squeal: OscillatorNode;
  squealGain: GainNode;
}

/**
 * Continuous engine + brake voices. Built once, then only AudioParams are
 * ramped each frame — no nodes are allocated in the render loop.
 */
export class EngineAudio {
  private engine: EngineVoice | null = null;
  private brakes: BrakeVoice | null = null;
  private active = false;

  constructor(private readonly bus: AudioBus) {}

  get isActive(): boolean {
    return this.active;
  }

  start(): void {
    if (this.active) return;
    const ctx = this.bus.ensure();
    if (!ctx) return;

    // Pausing only silences the graph; re-entering a race reuses the same voices.
    if (this.engine && this.brakes) {
      this.active = true;
      const now = ctx.currentTime;
      this.engine.gain.gain.setTargetAtTime(0.09, now, 0.16);
      this.engine.intakeGain.gain.setTargetAtTime(0.02, now, 0.12);
      this.brakes.gain.gain.setTargetAtTime(0.0001, now, 0.08);
      return;
    }

    const out = this.bus.sfx;
    const buffer = this.bus.noiseBuffer;
    if (!out || !buffer) return;

    this.active = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 4.5;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    filter.connect(gain);
    gain.connect(out);

    const makeOsc = (type: OscillatorType, detune: number, level: number) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 54;
      osc.detune.value = detune;
      const trim = ctx.createGain();
      trim.gain.value = level;
      osc.connect(trim);
      trim.connect(filter);
      osc.start();
      return osc;
    };

    const a = makeOsc('sawtooth', -6, 0.55);
    const b = makeOsc('sawtooth', 9, 0.45);
    const sub = makeOsc('sine', 0, 0.5);

    const intake = ctx.createBufferSource();
    intake.buffer = buffer;
    intake.loop = true;
    const intakeFilter = ctx.createBiquadFilter();
    intakeFilter.type = 'bandpass';
    intakeFilter.frequency.value = 1100;
    intakeFilter.Q.value = 0.8;
    const intakeGain = ctx.createGain();
    intakeGain.gain.value = 0.0001;
    intake.connect(intakeFilter);
    intakeFilter.connect(intakeGain);
    intakeGain.connect(gain);
    intake.start();

    this.engine = { a, b, sub, filter, gain, intake, intakeFilter, intakeGain };

    const brakes = this.createBrakes(ctx, out, buffer);
    this.brakes = brakes;

    const now = ctx.currentTime;
    gain.gain.setTargetAtTime(0.09, now, 0.18);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    const ctx = this.bus.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.engine?.gain.gain.setTargetAtTime(0.0001, now, 0.16);
    this.brakes?.gain.gain.setTargetAtTime(0.0001, now, 0.12);
    this.engine?.intakeGain.gain.setTargetAtTime(0.0001, now, 0.12);
    this.brakes?.squealGain.gain.setTargetAtTime(0.0001, now, 0.12);
  }

  update(input: EngineTelemetry): void {
    const ctx = this.bus.context;
    if (!ctx || !this.active || !this.engine || !this.brakes) return;

    const now = ctx.currentTime;
    const speed = Math.abs(input.speed);
    const norm = Math.min(1, speed / MAX_SPEED);
    const rev = Math.min(1, 0.18 + norm * 0.82 + input.throttle * 0.06);
    const boost = input.boost ? 1.06 : 1;
    const base = (52 + 186 * Math.pow(rev, 0.92)) * boost;

    this.engine.a.frequency.setTargetAtTime(base, now, 0.055);
    this.engine.b.frequency.setTargetAtTime(base * 1.007, now, 0.055);
    this.engine.sub.frequency.setTargetAtTime(base * 0.5, now, 0.07);

    const cutoff = 380 + 2300 * Math.pow(rev, 1.25) + input.throttle * 220;
    this.engine.filter.frequency.setTargetAtTime(Math.min(6000, cutoff), now, 0.07);
    this.engine.intakeFilter.frequency.setTargetAtTime(700 + 2600 * norm, now, 0.08);

    const engineLevel = input.grounded
      ? 0.1 + input.throttle * 0.075 + norm * 0.05
      : 0.045 + norm * 0.02;
    this.engine.gain.gain.setTargetAtTime(engineLevel, now, 0.07);
    this.engine.intakeGain.gain.setTargetAtTime(
      input.grounded ? 0.02 + norm * 0.05 + input.throttle * 0.02 : 0.008,
      now,
      0.09
    );

    const braking = input.brake > 0.35 && speed > 1.5 && input.grounded;
    const brakeLevel = braking ? 0.05 + 0.1 * Math.min(1, speed / 18) : 0.0001;
    this.brakes.gain.gain.setTargetAtTime(brakeLevel, now, braking ? 0.05 : 0.09);
    this.brakes.filter.frequency.setTargetAtTime(1400 + norm * 1400, now, 0.1);
    this.brakes.squealGain.gain.setTargetAtTime(
      braking && speed > 9 ? 0.012 + norm * 0.012 : 0.0001,
      now,
      0.08
    );
    this.brakes.squeal.frequency.setTargetAtTime(2400 + norm * 900, now, 0.12);
  }

  dispose(): void {
    const stop = (node?: { stop: () => void } | null) => {
      try {
        node?.stop();
      } catch {
        /* already stopped */
      }
    };
    stop(this.engine?.a);
    stop(this.engine?.b);
    stop(this.engine?.sub);
    stop(this.engine?.intake);
    stop(this.brakes?.noise);
    stop(this.brakes?.squeal);
    this.engine = null;
    this.brakes = null;
    this.active = false;
  }

  private createBrakes(ctx: AudioContext, out: AudioNode, buffer: AudioBuffer): BrakeVoice {
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1700;
    filter.Q.value = 5.5;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    noise.start();

    const squeal = ctx.createOscillator();
    squeal.type = 'triangle';
    squeal.frequency.value = 2450;
    const squealGain = ctx.createGain();
    squealGain.gain.value = 0.0001;
    squeal.connect(squealGain);
    squealGain.connect(gain);
    squeal.start();

    return { noise, filter, gain, squeal, squealGain };
  }
}
