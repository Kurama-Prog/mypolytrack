import * as THREE from 'three';
import type { HazardKind, HazardSpec, TrackPalette } from './types';
import { TrackQuery } from './query';

/**
 * Timed obstacles for a circuit.
 *
 * Everything is analytic: the physics runs on the centreline (arc length `s` +
 * lateral offset `n`), so a hit test is a handful of multiplications instead of
 * a collision mesh. The clock is advanced by the fixed physics step and reset
 * on GO, which keeps the rhythm identical for every run and for the ghost.
 */
export interface HazardField {
  group: THREE.Group;
  advance(dt: number): void;
  reset(): void;
  /** False while a collapsible deck is folded open under `s`. */
  solidAt(s: number): boolean;
  /** Returns the hazard type the car at (`s`, `n`) is touching, if any. */
  hitTest(s: number, n: number): HazardKind | null;
}

interface BaseRuntime {
  spec: HazardSpec;
  halfWidth: number;
}

interface GateRuntime extends BaseRuntime {
  kind: 'gate';
  panels: THREE.Object3D[];
  /** 0 = fully sunk, 1 = fully raised. */
  lift: [number, number];
  duty: number;
}

interface CollapseRuntime extends BaseRuntime {
  kind: 'collapse';
  from: number;
  to: number;
  hinges: THREE.Object3D[];
  duty: number;
  open: number;
}

type Runtime = GateRuntime | CollapseRuntime;

/** Cap on how much the deck folds down (radians). */
const SLAT_FLIP = 1.5;
/** Vertical travel of a gate panel; it sinks flush with the tarmac. */
const GATE_DROP = 3.9;
/** Phase width of the gate / deck transitions. */
const EASE = 0.07;
const SLAT_STEP = 2.6;

export function collapseRanges(specs: HazardSpec[] | undefined): Array<{ from: number; to: number }> {
  if (!specs) return [];
  const ranges: Array<{ from: number; to: number }> = [];
  for (const spec of specs) {
    if (spec.kind !== 'collapse') continue;
    ranges.push({ from: spec.at, to: spec.at + spec.length });
  }
  return ranges;
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function cycle(duty: number, phase: number): number {
  const t = phase;
  if (t <= duty - EASE) return 1;
  if (t >= duty) return 0;
  return smoothstep((duty - t) / EASE);
}

function frameQuaternion(sample: { right: THREE.Vector3; up: THREE.Vector3; tangent: THREE.Vector3 }) {
  const m = new THREE.Matrix4().makeBasis(sample.right, sample.up, sample.tangent.clone().negate());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function createHazards(
  specs: HazardSpec[],
  query: TrackQuery,
  palette: TrackPalette
): HazardField {
  const group = new THREE.Group();
  group.name = 'hazards';

  const lipMaterial = new THREE.MeshLambertMaterial({
    color: new THREE.Color(palette.accent),
    emissive: new THREE.Color(palette.accent),
    emissiveIntensity: 0.35,
    flatShading: true
  });
  const hubMaterial = new THREE.MeshLambertMaterial({ color: 0x1a2433, flatShading: true });
  const gateMaterial = new THREE.MeshLambertMaterial({
    color: new THREE.Color(palette.curbB),
    emissive: new THREE.Color(palette.accent),
    emissiveIntensity: 0.14,
    flatShading: true
  });
  const slatMaterial = new THREE.MeshLambertMaterial({
    color: new THREE.Color(palette.road),
    flatShading: true,
    side: THREE.DoubleSide
  });

  const runtimes: Runtime[] = [];
  let time = 0;

  for (const spec of specs) {
    const frame = query.frameAtS(spec.at);
    const quaternion = frameQuaternion(frame);
    const base: BaseRuntime = { spec, halfWidth: frame.halfWidth };

    if (spec.kind === 'gate') {
      const duty = Math.min(0.9, Math.max(0.3, spec.duty ?? 0.5));
      const pivot = new THREE.Group();
      pivot.position.copy(frame.pos);
      pivot.quaternion.copy(quaternion);
      group.add(pivot);

      const panelWidth = frame.halfWidth;
      const panels: THREE.Object3D[] = [];
      for (const side of [-1, 1]) {
        const panel = new THREE.Group();
        panel.position.set((side * panelWidth) / 2, 0, 0);
        const slab = box(panelWidth - 0.3, 3.5, 0.55, gateMaterial, 0, 1.75, 0);
        panel.add(slab);
        panel.add(box(0.5, 0.28, 0.7, hubMaterial, 0, 3.4, 0));
        pivot.add(panel);
        panels.push(panel);
      }

      runtimes.push({
        ...base,
        kind: 'gate',
        panels,
        lift: [1, 0],
        duty
      });
      continue;
    }

    // Collapsible grilled deck.
    const from = spec.at;
    const to = spec.at + spec.length;
    const duty = Math.min(0.85, Math.max(0.4, spec.duty ?? 0.55));
    const slats = Math.max(2, Math.round(spec.length / SLAT_STEP));
    const hinges: THREE.Object3D[] = [];

    for (let i = 0; i < slats; i++) {
      // Hinge across the road width at the leading edge of each row, so the
      // whole row tips forward and down like a trap door instead of swinging
      // 15 m sideways on a single edge.
      const edge = from + (i * spec.length) / slats;
      const sample = query.frameAtS(edge);
      const hinge = new THREE.Group();
      hinge.position.copy(sample.pos).addScaledVector(sample.up, 0.04);
      hinge.quaternion.copy(frameQuaternion(sample));

      const span = spec.length / slats - 0.12;
      const slat = box(sample.halfWidth * 2, 0.16, span, slatMaterial, 0, 0, -span / 2);
      hinge.add(slat);
      // Outer lip so the deck reads as a bridge grille, not a flat quad.
      for (const side of [-1, 1]) {
        hinge.add(box(0.3, 0.26, span, lipMaterial, side * sample.halfWidth, 0.05, -span / 2));
      }
      group.add(hinge);
      hinges.push(hinge);
    }

    runtimes.push({
      ...base,
      kind: 'collapse',
      from,
      to,
      hinges,
      duty,
      open: 0
    });
  }

  const apply = () => {
    for (const rt of runtimes) {
      const phase = (((time / rt.spec.period + (rt.spec.phase ?? 0)) % 1) + 1) % 1;

      if (rt.kind === 'gate') {
        rt.lift[0] = cycle(rt.duty, phase);
        rt.lift[1] = cycle(rt.duty, (phase + 0.5) % 1);
        rt.panels[0].position.y = -GATE_DROP * (1 - rt.lift[0]);
        rt.panels[1].position.y = -GATE_DROP * (1 - rt.lift[1]);
      } else {
        const closed = cycle(rt.duty, phase);
        rt.open = 1 - closed;
        const count = rt.hinges.length;
        for (let i = 0; i < count; i++) {
          // Slats fold from the entry edge towards the exit, one beat apart.
          const local = Math.min(1, Math.max(0, (rt.open - (i / count) * 0.25) / 0.75));
          rt.hinges[i].rotation.x = -SLAT_FLIP * smoothstep(local);
        }
      }
    }
  };

  apply();

  return {
    group,

    advance(dt: number) {
      time += dt;
      apply();
    },

    reset() {
      time = 0;
      apply();
    },

    solidAt(s: number) {
      for (const rt of runtimes) {
        if (rt.kind !== 'collapse') continue;
        if (s < rt.from || s > rt.to) continue;
        if (rt.open > 0.32) return false;
      }
      return true;
    },

    hitTest(s: number, n: number) {
      for (const rt of runtimes) {
        if (rt.kind === 'collapse') continue;

        const ps = s - rt.spec.at;
        if (ps < -3.2 || ps > 3.2) continue;

        // Gate: only the half of the road under a raised panel is blocked.
        if (Math.abs(ps) > 1.15) continue;
        const halfWidth = rt.halfWidth;
        if (n < -halfWidth - 0.4 || n > halfWidth + 0.4) continue;
        const leftSide = n < 0;
        const lift = leftSide ? rt.lift[0] : rt.lift[1];
        if (lift > 0.22) return 'gate';
      }
      return null;
    }
  };
}
