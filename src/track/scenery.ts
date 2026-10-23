import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CenterlineSample, TrackDef } from './types';
import type { TrackQuery } from './query';

/** Deterministic rolling terrain shared by the ground mesh and prop placement. */
export function terrainHeight(x: number, z: number): number {
  return (
    Math.sin(x * 0.0075) * Math.cos(z * 0.0062) * 9 +
    Math.sin(x * 0.0021 + z * 0.0031) * 16 +
    Math.cos(z * 0.0121) * 3.5
  );
}

/** How far the carved shelf sits below the tarmac. */
const CARVE_DEPTH = 2.8;
/** Extra flat width beyond the road edge before the terrain starts climbing. */
const CARVE_FLAT = 8;
/** Distance over which the shelf blends back into the rolling terrain. */
const CARVE_BLEND = 44;

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * Ground height with a shallow cut carved along the circuit so the road never
 * gets swallowed by the rolling terrain.
 *
 * The shelf is wide enough to cover several ground-mesh cells on either side of
 * the centreline, which keeps the interpolated mesh below the tarmac even when
 * the plane vertices straddle the road.
 */
export function carvedGroundHeight(
  x: number,
  z: number,
  query: TrackQuery,
  groundY: number
): number {
  const base = terrainHeight(x, z);
  const hit = query.nearest(x, groundY + base, z);
  if (!hit) return base;

  // Road surface expressed in the same local space as `terrainHeight`.
  const shelf = hit.pos.y - groundY - CARVE_DEPTH;
  if (base <= shelf) return base;

  const distance = Math.abs(hit.n);
  const inner = hit.halfWidth + CARVE_FLAT;
  if (distance >= inner + CARVE_BLEND) return base;

  return shelf + (base - shelf) * smoothstep((distance - inner) / CARVE_BLEND);
}

/** Cheap analytic probe shared by the ground mesh, props and the camera rig. */
export function makeGroundProbe(def: TrackDef, query: TrackQuery) {
  return {
    heightAt(x: number, z: number): number {
      return def.groundY + carvedGroundHeight(x, z, query, def.groundY);
    }
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

interface StyleColors {
  trunk: number;
  leaf: number[];
  rock: number;
  peak: number;
}

const STYLES: Record<TrackDef['scenery']['style'], StyleColors> = {
  valley: {
    trunk: 0x5b4530,
    leaf: [0x69a94a, 0x55963c, 0x7cbb57, 0x477f34],
    rock: 0x8b9099,
    peak: 0x7e9a7d
  },
  canyon: {
    trunk: 0x4a3327,
    leaf: [0x9d7b45, 0x86603a, 0x6f4c31],
    rock: 0xb2613d,
    peak: 0x6b4b52
  },
  ice: {
    trunk: 0x4a5a75,
    leaf: [0xdbe8f7, 0xc4dcf2, 0xa9cbe8],
    rock: 0x9fb6cc,
    peak: 0xdfeaf8
  }
};

export interface TrackBounds {
  center: THREE.Vector3;
  radius: number;
}

/** Minimum gap kept between the circuit bounds and the base of every peak. */
const PEAK_CLEARANCE = 260;

interface PeakMeta {
  x: number;
  z: number;
  radius: number;
  height: number;
}

/** Smallest horizontal gap between any peak surface and the centreline. */
function measurePeakClearance(peaks: PeakMeta[], samples: CenterlineSample[]): number {
  let clearance = Infinity;
  for (const peak of peaks) {
    for (const sample of samples) {
      const dx = sample.pos.x - peak.x;
      const dz = sample.pos.z - peak.z;
      const gap = Math.sqrt(dx * dx + dz * dz) - peak.radius;
      if (gap < clearance) clearance = gap;
    }
  }
  return clearance;
}

export function createScenery(
  def: TrackDef,
  samples: CenterlineSample[],
  query: TrackQuery,
  bounds: TrackBounds
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'scenery';

  const rng = mulberry32(def.scenery.seed);
  const style = STYLES[def.scenery.style];
  const geometries: THREE.BufferGeometry[] = [];

  const trunkBase = new THREE.CylinderGeometry(0.5, 0.75, 2.4, 5).toNonIndexed();
  trunkBase.translate(0, 1.2, 0);
  const trunkColor = new THREE.Color(style.trunk);

  const rockBase = new THREE.IcosahedronGeometry(1, 0);
  const shardBase = new THREE.OctahedronGeometry(1, 0);

  // Query at the height of the road sample that spawned the prop so elevated
  // sections (loops, ice bridges) are avoided just like ground-level road.
  const place = (x: number, z: number, y: number) => {
    const hit = query.nearest(x, y, z);
    if (hit && Math.abs(hit.n) < hit.halfWidth + 9) return false;
    return true;
  };

  const count = Math.round(def.scenery.density);
  for (let i = 0; i < count; i++) {
    const sample = samples[Math.floor(rng() * samples.length)];
    const side = rng() < 0.5 ? -1 : 1;
    const distance = 16 + rng() * 62;
    const jitter = (rng() - 0.5) * 34;
    const x = sample.pos.x + sample.right.x * distance * side + sample.tangent.x * jitter;
    const z = sample.pos.z + sample.right.z * distance * side + sample.tangent.z * jitter;
    if (!place(x, z, sample.pos.y)) continue;

    const groundY = def.groundY + carvedGroundHeight(x, z, query, def.groundY);
    const kind = rng();

    if (kind < 0.62) {
      // Tree
      const scale = 0.7 + rng() * 0.9;
      const leafColor = new THREE.Color(style.leaf[Math.floor(rng() * style.leaf.length)]);
      const cone = new THREE.ConeGeometry(2.3, 7.4, 6).toNonIndexed();
      cone.translate(0, 3.7, 0);
      cone.scale(scale, scale * (0.85 + rng() * 0.4), scale);
      cone.rotateY(rng() * Math.PI);
      cone.translate(x, groundY - 0.4, z);
      geometries.push(paint(cone, leafColor));

      const trunk = trunkBase.clone();
      trunk.scale(scale, scale, scale);
      trunk.translate(x, groundY - 0.4, z);
      geometries.push(paint(trunk, trunkColor));
    } else if (kind < 0.9) {
      // Rock / spire
      const scale = 1.4 + rng() * 3.4;
      const rockColor = new THREE.Color(style.rock);
      rockColor.offsetHSL(0, 0, (rng() - 0.5) * 0.08);

      if (def.scenery.style === 'canyon' && rng() < 0.55) {
        const spire = new THREE.ConeGeometry(3.6, 22, 5).toNonIndexed();
        spire.translate(0, 11, 0);
        spire.scale(scale * 0.8, 1 + rng() * 1.4, scale * 0.8);
        spire.rotateY(rng() * Math.PI);
        spire.translate(x, groundY - 1.5, z);
        geometries.push(paint(spire, rockColor));
      } else if (def.scenery.style === 'ice' && rng() < 0.6) {
        const shard = shardBase.clone();
        shard.scale(scale * 0.6, scale * 2.6, scale * 0.6);
        shard.rotateZ((rng() - 0.5) * 0.4);
        shard.rotateY(rng() * Math.PI);
        shard.translate(x, groundY + scale * 0.7, z);
        geometries.push(paint(shard, new THREE.Color(0xcdeaff)));
      } else {
        const rock = rockBase.clone();
        rock.scale(scale, scale * (0.55 + rng() * 0.7), scale);
        rock.rotateY(rng() * Math.PI);
        rock.translate(x, groundY + scale * 0.25, z);
        geometries.push(paint(rock, rockColor));
      }
    }
  }

  // Distant peaks framing the horizon. They orbit the *circuit* bounds — not
  // the world origin — so the far half of a circuit can never run through them.
  const peakColor = new THREE.Color(style.peak);
  const peaks = 24;
  const peakMeta: PeakMeta[] = [];

  for (let i = 0; i < peaks; i++) {
    const angle = (i / peaks) * Math.PI * 2 + rng() * 0.14;
    const peakRadius = 110 + rng() * 130;
    // The inner edge of the cone always clears the circuit bounds by
    // PEAK_CLEARANCE metres, no matter how the track is laid out.
    const distance = bounds.radius + PEAK_CLEARANCE + peakRadius + rng() * 620;
    const height = 170 + rng() * 220;
    const x = bounds.center.x + Math.cos(angle) * distance;
    const z = bounds.center.z + Math.sin(angle) * distance;

    const cone = new THREE.ConeGeometry(peakRadius, height, 5).toNonIndexed();
    cone.translate(0, height / 2, 0);
    cone.rotateY(rng() * Math.PI);
    cone.translate(x, def.groundY - 55, z);
    const tint = peakColor.clone();
    tint.offsetHSL(0, 0, (rng() - 0.5) * 0.1);
    geometries.push(paint(cone, tint));
    peakMeta.push({ x, z, radius: peakRadius, height });
  }

  const peakClearance = measurePeakClearance(peakMeta, samples);
  group.userData.peaks = peakMeta;
  group.userData.peakClearance = peakClearance;
  if (peakClearance < PEAK_CLEARANCE - 1) {
    console.warn(
      `[scenery] ${def.id}: horizon peak clearance ${peakClearance.toFixed(0)}m is below the ${PEAK_CLEARANCE}m target`
    );
  }

  const merged = mergeGeometries(geometries, false);
  if (merged) {
    merged.computeVertexNormals();
    merged.computeBoundingSphere();
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true
    });
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = 'scenery-merged';
    group.add(mesh);
  }

  for (const geometry of geometries) geometry.dispose();

  return group;
}
