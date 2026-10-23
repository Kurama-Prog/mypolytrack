import type { BuiltTrack } from '../track/builder';
import { createCar, resetCar, stepCar, type CarState } from '../physics/car';
import type { TuningStore } from '../physics/tuning';
import type { DriveInput } from '../engine/input';
import { GhostRecorder } from './ghost';
import type { GhostRecord } from '../storage/storage';

export type RacePhase = 'countdown' | 'racing' | 'finished';

export interface RaceResult {
  time: number;
  splits: number[];
  respawns: number;
  ghost: GhostRecord | null;
}

export interface RaceCallbacks {
  onCountdown?: (value: number | 'go') => void;
  onCheckpoint?: (index: number, total: number, split: number) => void;
  onRespawn?: () => void;
  onFinish?: (result: RaceResult) => void;
}

const START_S = 48;
const COUNTDOWN_SECONDS = 3;

export class RaceSession {
  readonly car: CarState;
  phase: RacePhase = 'countdown';
  time = 0;
  splits: number[] = [];
  nextCheckpoint = 0;
  respawns = 0;

  private countdown = COUNTDOWN_SECONDS;
  private countdownMark = COUNTDOWN_SECONDS;
  private recorder = new GhostRecorder();

  constructor(
    readonly track: BuiltTrack,
    private readonly tuning: TuningStore,
    private readonly callbacks: RaceCallbacks
  ) {
    this.car = createCar(track, START_S);
    this.reset();
  }

  reset() {
    this.phase = 'countdown';
    this.time = 0;
    this.splits = [];
    this.nextCheckpoint = 0;
    this.respawns = 0;
    this.countdown = COUNTDOWN_SECONDS;
    this.countdownMark = COUNTDOWN_SECONDS;
    this.recorder = new GhostRecorder();
    resetCar(this.car, this.track, START_S);
    this.callbacks.onCountdown?.(COUNTDOWN_SECONDS);
  }

  update(dt: number, input: DriveInput) {
    if (this.phase === 'countdown') {
      this.tickCountdown(dt);
      return;
    }
    if (this.phase !== 'racing') return;

    this.time += dt * 1000;
    stepCar(this.car, input, this.track, this.tuning.value, dt);
    this.recorder.record(this.time, this.car.pos, this.car.quat);

    if (this.car.pos.y < this.track.killY) {
      this.respawn();
      return;
    }

    const checkpoints = this.track.checkpoints;
    if (this.nextCheckpoint < checkpoints.length && this.car.s >= checkpoints[this.nextCheckpoint]) {
      this.nextCheckpoint++;
      this.splits.push(this.time);
      this.callbacks.onCheckpoint?.(this.nextCheckpoint - 1, checkpoints.length, this.time);
    }

    if (this.nextCheckpoint >= checkpoints.length && this.car.s >= this.track.totalLength - 3) {
      this.finish();
    }
  }

  private tickCountdown(dt: number) {
    this.countdown -= dt;
    const mark = Math.ceil(this.countdown);
    if (mark !== this.countdownMark && mark > 0) {
      this.countdownMark = mark;
      this.callbacks.onCountdown?.(mark);
    }
    if (this.countdown <= 0) {
      this.phase = 'racing';
      this.time = 0;
      this.recorder.start();
      this.callbacks.onCountdown?.('go');
    }
  }

  private respawn() {
    this.respawns++;
    const checkpointIndex = this.splits.length - 1;
    const respawnS = checkpointIndex >= 0 ? this.track.checkpoints[checkpointIndex] - 4 : START_S;
    resetCar(this.car, this.track, Math.max(2, respawnS));
    this.callbacks.onRespawn?.();
  }

  private finish() {
    this.phase = 'finished';
    const result: RaceResult = {
      time: this.time,
      splits: [...this.splits],
      respawns: this.respawns,
      ghost: this.recorder.finish()
    };
    this.callbacks.onFinish?.(result);
  }
}
