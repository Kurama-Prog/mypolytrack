import type { AudioBus } from './context';

const STEPS_PER_BAR = 16;
const BARS_PER_LOOP = 4;

export type SongId = 'sunset-valley' | 'neon-canyon' | 'vertex-loop';

interface SongGains {
  kick: number;
  snare: number;
  hat: number;
  bass: number;
  arp: number;
  pad: number;
}

interface SongSpec {
  bpm: number;
  /** Root frequency of the key (Hz). */
  root: number;
  /** Four chords, semitone offsets from the root. */
  chords: number[][];
  kick: number[];
  snare: number[];
  hat: number[];
  openHat: number[];
  /** -1 = rest, otherwise semitones above the chord root. */
  bass: number[];
  /** -1 = rest, otherwise index into the expanded chord tones. */
  arp: number[];
  pad: boolean;
  riser: boolean;
  leadType: OscillatorType;
  bassType: OscillatorType;
  cutoff: number;
  delay: number;
  gains: SongGains;
}

/**
 * Three hand-tuned loops:
 *  - SUNSET VALLEY: warm 104 BPM synth-pop in A major, soft kick and plucked arps.
 *  - NEON CANYON: 126 BPM dark electro in F# minor, pulsing bass and 16th arps.
 *  - VERTEX LOOP: 138 BPM tech-trance in D minor, four-on-the-floor and a riser.
 */
const SONGS: Record<SongId, SongSpec> = {
  'sunset-valley': {
    bpm: 104,
    root: 110,
    chords: [
      [0, 4, 7],
      [7, 11, 14],
      [9, 12, 16],
      [5, 9, 12]
    ],
    kick: [0, 8],
    snare: [4, 12],
    hat: [2, 6, 10, 14],
    openHat: [14],
    bass: [0, -1, -1, -1, -1, -1, 7, -1, 0, -1, -1, -1, -1, -1, 12, -1],
    arp: [0, -1, 2, -1, 4, -1, 2, -1, 1, -1, 3, -1, 4, -1, 2, -1],
    pad: true,
    riser: false,
    leadType: 'triangle',
    bassType: 'triangle',
    cutoff: 760,
    delay: 0.29,
    gains: { kick: 0.32, snare: 0.085, hat: 0.03, bass: 0.17, arp: 0.075, pad: 0.04 }
  },
  'neon-canyon': {
    bpm: 126,
    root: 92.5,
    chords: [
      [0, 3, 7],
      [8, 12, 15],
      [3, 7, 10],
      [10, 14, 17]
    ],
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [0, 2, 3, 6, 8, 10, 11, 14],
    openHat: [6, 14],
    bass: [0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 7, -1, 0, -1],
    arp: [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 2, 1, 3, 5, 3],
    pad: true,
    riser: true,
    leadType: 'square',
    bassType: 'sawtooth',
    cutoff: 520,
    delay: 0.19,
    gains: { kick: 0.3, snare: 0.1, hat: 0.028, bass: 0.16, arp: 0.055, pad: 0.035 }
  },
  'vertex-loop': {
    bpm: 138,
    root: 73.4,
    chords: [
      [0, 3, 7],
      [10, 14, 17],
      [8, 12, 15],
      [7, 11, 14]
    ],
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    openHat: [2, 6, 10, 14],
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 7, 7, 12, 12],
    arp: [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 2, 1, 3, 4, 3],
    pad: true,
    riser: true,
    leadType: 'square',
    bassType: 'sawtooth',
    cutoff: 430,
    delay: 0.16,
    gains: { kick: 0.3, snare: 0.1, hat: 0.026, bass: 0.17, arp: 0.05, pad: 0.032 }
  }
};

export function isSongId(id: string): id is SongId {
  return id === 'sunset-valley' || id === 'neon-canyon' || id === 'vertex-loop';
}

function chordTones(chord: number[]): number[] {
  return [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12, chord[2] + 12];
}

/**
 * Look-ahead step sequencer. Notes are scheduled a fraction of a second ahead
 * on the AudioContext clock, which keeps timing steady regardless of frame rate.
 */
export class BgmSystem {
  private songId: SongId | null = null;
  private song: SongSpec | null = null;
  private gain: GainNode | null = null;
  private delay: DelayNode | null = null;
  private wet: GainNode | null = null;
  private nextTime = 0;
  private step = 0;
  private timer = 0;
  private pendingId: SongId | null = null;

  constructor(private readonly bus: AudioBus) {
    this.timer = window.setInterval(this.tick, 25);
  }

  get current(): SongId | null {
    return this.songId;
  }

  play(trackId: string): void {
    if (!isSongId(trackId)) return;
    if (this.songId === trackId && this.gain) return;

    this.pendingId = trackId;
    if (!this.bus.context) {
      this.bus.onReady(() => this.consumePending());
      this.bus.ensure();
      return;
    }
    this.consumePending();
  }

  dispose(): void {
    window.clearInterval(this.timer);
    this.fadeOut();
  }

  private consumePending(): void {
    const id = this.pendingId;
    if (!id) return;
    this.pendingId = null;
    this.startSong(id);
  }

  private startSong(id: SongId): void {
    const ctx = this.bus.context;
    const out = this.bus.music;
    if (!ctx || !out) return;

    const now = ctx.currentTime;
    this.fadeOut();

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(out);

    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = SONGS[id].delay;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.26;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(gain);

    this.song = SONGS[id];
    this.songId = id;
    this.gain = gain;
    this.delay = delay;
    this.wet = wet;
    this.step = 0;
    this.nextTime = now + 0.12;
    gain.gain.setTargetAtTime(0.85, now, 0.3);
  }

  private fadeOut(): void {
    const ctx = this.bus.context;
    const gain = this.gain;
    const delay = this.delay;
    const wet = this.wet;
    this.gain = null;
    this.delay = null;
    this.wet = null;
    this.song = null;
    this.songId = null;
    if (!ctx || !gain) return;

    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, 0.16);
    window.setTimeout(() => {
      try {
        gain.disconnect();
        delay?.disconnect();
        wet?.disconnect();
      } catch {
        /* already disconnected */
      }
    }, 1100);
  }

  private tick = (): void => {
    const ctx = this.bus.context;
    const song = this.song;
    const gain = this.gain;
    if (!ctx || !song || !gain || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.035;

    const stepDur = 60 / song.bpm / 4;
    while (this.nextTime < now + 0.16) {
      this.scheduleStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % (STEPS_PER_BAR * BARS_PER_LOOP);
    }
  };

  private scheduleStep(step: number, time: number, stepDur: number): void {
    const song = this.song;
    const gain = this.gain;
    if (!song || !gain) return;

    const local = step % STEPS_PER_BAR;
    const bar = Math.floor(step / STEPS_PER_BAR) % BARS_PER_LOOP;
    const chord = song.chords[bar % song.chords.length];

    if (song.kick.includes(local)) this.kick(time, song.gains.kick, gain);
    if (song.snare.includes(local)) this.snare(time, song.gains.snare, gain);
    if (song.hat.includes(local)) this.hat(time, song.gains.hat, gain);
    if (song.openHat.includes(local)) this.hat(time, song.gains.hat * 2.4, gain, true);

    const bassOffset = song.bass[local];
    if (bassOffset >= 0) {
      const freq = song.root * Math.pow(2, (chord[0] + bassOffset) / 12);
      this.bassNote(time, stepDur, freq, song, gain);
    }

    const arpIndex = song.arp[local];
    if (arpIndex >= 0) {
      const tones = chordTones(chord);
      const semitone = tones[Math.min(tones.length - 1, arpIndex)];
      const freq = song.root * Math.pow(2, (semitone + 12) / 12);
      this.arpNote(time, stepDur, freq, song, gain);
    }

    if (local === 0 && song.pad) {
      this.padChord(time, stepDur * STEPS_PER_BAR, chord, song, gain);
    }

    if (song.riser && bar === BARS_PER_LOOP - 1 && local === 8) {
      this.riser(time, stepDur * 8, gain);
    }
  }

  /* ----------------------------------------------------------------- voices */

  private kick(time: number, level: number, out: AudioNode): void {
    const ctx = this.bus.context;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(148, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.15);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(level, time + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    osc.connect(env);
    env.connect(out);
    osc.start(time);
    osc.stop(time + 0.32);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  private snare(time: number, level: number, out: AudioNode): void {
    this.noiseHit(time, 0.16, level, 1950, out, 0.9);
    const ctx = this.bus.context;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(196, time);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(level * 0.5, time + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    osc.connect(env);
    env.connect(out);
    osc.start(time);
    osc.stop(time + 0.12);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  private hat(time: number, level: number, out: AudioNode, open = false): void {
    this.noiseHit(time, open ? 0.14 : 0.035, level, 7800, out, 0.7, 'highpass');
  }

  private bassNote(time: number, stepDur: number, freq: number, song: SongSpec, out: AudioNode): void {
    const ctx = this.bus.context;
    if (!ctx) return;
    const dur = stepDur * 0.85;
    const osc = ctx.createOscillator();
    osc.type = song.bassType;
    osc.frequency.setValueAtTime(freq, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 5;
    filter.frequency.setValueAtTime(song.cutoff * 3.2, time);
    filter.frequency.exponentialRampToValueAtTime(song.cutoff, time + dur * 0.8);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(song.gains.bass, time + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(env);
    env.connect(out);
    osc.start(time);
    osc.stop(time + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  private arpNote(time: number, stepDur: number, freq: number, song: SongSpec, out: AudioNode): void {
    const ctx = this.bus.context;
    if (!ctx) return;
    const dur = stepDur * (song.bpm > 130 ? 1.1 : 1.6);
    const osc = ctx.createOscillator();
    osc.type = song.leadType;
    osc.frequency.setValueAtTime(freq, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4200, time);
    filter.frequency.exponentialRampToValueAtTime(1500, time + dur);
    filter.Q.value = 1.2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(song.gains.arp, time + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(env);
    env.connect(out);
    if (this.delay) env.connect(this.delay);
    osc.start(time);
    osc.stop(time + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  private padChord(
    time: number,
    barDur: number,
    chord: number[],
    song: SongSpec,
    out: AudioNode
  ): void {
    const ctx = this.bus.context;
    if (!ctx) return;

    for (let i = 0; i < 3; i++) {
      const freq = song.root * Math.pow(2, (chord[i] + 12) / 12);
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);
        osc.detune.value = detune;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1050;
        filter.Q.value = 0.7;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, time);
        env.gain.exponentialRampToValueAtTime(song.gains.pad / 3, time + Math.min(0.6, barDur * 0.3));
        env.gain.setValueAtTime(song.gains.pad / 3, time + barDur * 0.75);
        env.gain.exponentialRampToValueAtTime(0.0001, time + barDur);

        osc.connect(filter);
        filter.connect(env);
        env.connect(out);
        osc.start(time);
        osc.stop(time + barDur + 0.05);
        osc.onended = () => {
          osc.disconnect();
          filter.disconnect();
          env.disconnect();
        };
      }
    }
  }

  private riser(time: number, dur: number, out: AudioNode): void {
    this.noiseHit(time, dur, 0.05, 400, out, 1.1, 'bandpass', 5200);
  }

  private noiseHit(
    time: number,
    dur: number,
    level: number,
    freq: number,
    out: AudioNode,
    q: number,
    type: BiquadFilterType = 'bandpass',
    sweepTo?: number
  ): void {
    const ctx = this.bus.context;
    const buffer = this.bus.noiseBuffer;
    if (!ctx || !buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, time);
    if (sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(sweepTo, time + dur);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(level, time + Math.min(0.02, dur * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    source.connect(filter);
    filter.connect(env);
    env.connect(out);
    source.start(time);
    source.stop(time + dur + 0.02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }
}
