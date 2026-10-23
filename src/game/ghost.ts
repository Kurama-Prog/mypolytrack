import * as THREE from 'three';
import type { GhostRecord } from '../storage/storage';

const STRIDE = 7; // x, y, z, qx, qy, qz, qw
const SAMPLE_HZ = 30;

function encode(values: number[]): string {
  const floats = new Float32Array(values);
  const bytes = new Uint8Array(floats.buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function decode(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export class GhostRecorder {
  private values: number[] = [];
  private recording = false;
  private nextSampleTime = 0;
  private duration = 0;

  start() {
    this.values = [];
    this.recording = true;
    this.nextSampleTime = 0;
    this.duration = 0;
  }

  /** `timeMs` is the elapsed race time in milliseconds. */
  record(timeMs: number, position: THREE.Vector3, quaternion: THREE.Quaternion) {
    if (!this.recording) return;
    const seconds = timeMs / 1000;
    if (seconds < this.nextSampleTime) return;

    this.nextSampleTime = seconds + 1 / SAMPLE_HZ;
    this.duration = seconds;
    this.values.push(
      position.x,
      position.y,
      position.z,
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w
    );
  }

  finish(): GhostRecord | null {
    this.recording = false;
    if (this.values.length < STRIDE * 4) return null;
    return {
      data: encode(this.values),
      duration: this.duration
    };
  }
}

export class GhostPlayer {
  readonly duration: number;
  private readonly samples: Float32Array;
  private readonly count: number;

  constructor(record: GhostRecord) {
    this.samples = decode(record.data);
    this.count = Math.floor(this.samples.length / STRIDE);
    this.duration = record.duration;
  }

  get valid(): boolean {
    return this.count > 1;
  }

  sample(timeMs: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion): boolean {
    if (this.count < 2) return false;

    const t = Math.max(0, timeMs / 1000) * SAMPLE_HZ;
    const index = Math.min(this.count - 2, Math.floor(t));
    const alpha = Math.min(1, Math.max(0, t - index));

    const a = index * STRIDE;
    const b = a + STRIDE;

    outPos.set(
      this.samples[a] + (this.samples[b] - this.samples[a]) * alpha,
      this.samples[a + 1] + (this.samples[b + 1] - this.samples[a + 1]) * alpha,
      this.samples[a + 2] + (this.samples[b + 2] - this.samples[a + 2]) * alpha
    );

    const qa = new THREE.Quaternion(
      this.samples[a + 3],
      this.samples[a + 4],
      this.samples[a + 5],
      this.samples[a + 6]
    );
    const qb = new THREE.Quaternion(
      this.samples[b + 3],
      this.samples[b + 4],
      this.samples[b + 5],
      this.samples[b + 6]
    );
    outQuat.copy(qa).slerp(qb, alpha);
    return true;
  }
}
