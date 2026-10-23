import * as THREE from 'three';
import type { CenterlineSample, LocalFrame, SurfaceHit } from './types';

/**
 * Spatial hash over the track centreline. Every query is O(1) in practice
 * because the bucket size is larger than the sample spacing.
 */
export class TrackQuery {
  readonly samples: CenterlineSample[];
  private readonly cell = 18;
  private readonly buckets = new Map<number, number[]>();

  constructor(samples: CenterlineSample[]) {
    this.samples = samples;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i].pos;
      const key = this.key(Math.floor(p.x / this.cell), Math.floor(p.z / this.cell));
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(i);
      else this.buckets.set(key, [i]);
    }
  }

  private key(ix: number, iz: number): number {
    return ix * 73856093 + iz * 19349663;
  }

  private nearestIndex(x: number, y: number, z: number): number {
    const gx = Math.floor(x / this.cell);
    const gz = Math.floor(z / this.cell);
    let best = -1;
    let bestDist = Infinity;

    for (let radius = 0; radius <= 3; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          const bucket = this.buckets.get(this.key(gx + dx, gz + dz));
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k++) {
            const i = bucket[k];
            const p = this.samples[i].pos;
            const ddx = p.x - x;
            const ddy = p.y - y;
            const ddz = p.z - z;
            // Height aware so stacked sections (loops) resolve correctly.
            const d2 = ddx * ddx + ddy * ddy * 1.6 + ddz * ddz;
            if (d2 < bestDist) {
              bestDist = d2;
              best = i;
            }
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /**
   * Finds the track surface below / around a world XZ position.
   * Returns null when the position is far away from any track segment.
   */
  nearest(x: number, y: number, z: number): SurfaceHit | null {
    const start = this.nearestIndex(x, y, z);
    if (start < 0) return null;

    // Refine using the immediate neighbours so lateral error stays small.
    let bestIdx = start;
    let bestAbs = Infinity;
    const tmp = new THREE.Vector3();
    for (let i = start - 1; i <= start + 1; i++) {
      if (i < 0 || i >= this.samples.length) continue;
      const sample = this.samples[i];
      tmp.set(x - sample.pos.x, y - sample.pos.y, z - sample.pos.z);
      const abs = Math.abs(tmp.dot(sample.right));
      if (abs < bestAbs) {
        bestAbs = abs;
        bestIdx = i;
      }
    }

    const sample = this.samples[bestIdx];
    const rel = new THREE.Vector3(x - sample.pos.x, y - sample.pos.y, z - sample.pos.z);
    const n = rel.dot(sample.right);
    // Signed distance along the road normal: works for ramps and loops.
    const height = rel.dot(sample.up);

    return {
      pos: sample.pos.clone(),
      tangent: sample.tangent.clone(),
      right: sample.right.clone(),
      up: sample.up.clone(),
      halfWidth: sample.halfWidth,
      s: sample.s,
      curvature: sample.curvature,
      solid: sample.solid,
      boost: sample.boost,
      rails: sample.rails,
      n,
      height
    };
  }

  /** Interpolated local frame at an arc-length position. */
  frameAtS(s: number): LocalFrame {
    const samples = this.samples;
    let lo = 0;
    let hi = samples.length - 1;

    if (s <= samples[0].s) return this.copyFrame(samples[0]);
    if (s >= samples[hi].s) return this.copyFrame(samples[hi]);

    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].s <= s) lo = mid;
      else hi = mid;
    }

    const a = samples[lo];
    const b = samples[hi];
    const span = b.s - a.s;
    const t = span > 1e-5 ? (s - a.s) / span : 0;

    return {
      pos: new THREE.Vector3().lerpVectors(a.pos, b.pos, t),
      tangent: new THREE.Vector3().lerpVectors(a.tangent, b.tangent, t).normalize(),
      right: new THREE.Vector3().lerpVectors(a.right, b.right, t).normalize(),
      up: new THREE.Vector3().lerpVectors(a.up, b.up, t).normalize(),
      halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * t,
      s,
      curvature: a.curvature + (b.curvature - a.curvature) * t,
      solid: a.solid && b.solid,
      boost: a.boost || b.boost,
      rails: a.rails || b.rails
    };
  }

  private copyFrame(sample: CenterlineSample): LocalFrame {
    return {
      pos: sample.pos.clone(),
      tangent: sample.tangent.clone(),
      right: sample.right.clone(),
      up: sample.up.clone(),
      halfWidth: sample.halfWidth,
      s: sample.s,
      curvature: sample.curvature,
      solid: sample.solid,
      boost: sample.boost,
      rails: sample.rails
    };
  }
}
