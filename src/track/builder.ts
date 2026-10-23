import * as THREE from 'three';
import type { CenterlineSample, TrackDef } from './types';
import { TrackQuery } from './query';
import { carvedGroundHeight, createScenery } from './scenery';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SAMPLE_STEP = 1.25;
const DEFAULT_WIDTH = 15;

export interface BuiltTrack {
  def: TrackDef;
  group: THREE.Group;
  samples: CenterlineSample[];
  totalLength: number;
  query: TrackQuery;
  checkpoints: number[];
  start: CenterlineSample;
  finish: CenterlineSample;
  killY: number;
  center: THREE.Vector3;
  radius: number;
}

interface SurfaceData {
  position: number[];
  color: number[];
}

function pushTri(data: SurfaceData, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
  data.position.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < 3; i++) data.color.push(color.r, color.g, color.b);
}

function addQuad(
  data: SurfaceData,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  color: THREE.Color
) {
  pushTri(data, a, b, c, color);
  pushTri(data, a, c, d, color);
}

function toMesh(data: SurfaceData, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(data.color, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, material);
}

function heading(yaw: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
}

/** World heading of a tangent, positive = turning left. */
function tangentYaw(tangent: THREE.Vector3): number {
  return Math.atan2(-tangent.x, -tangent.z);
}

function wrapAngle(angle: number): number {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

/* --------------------------------------------------------------------------
   Centreline generation
   -------------------------------------------------------------------------- */

export function buildCenterline(def: TrackDef): CenterlineSample[] {
  const samples: CenterlineSample[] = [];
  const pos = new THREE.Vector3(0, 0, 0);
  let yaw = 0;
  let s = 0;

  const tmpTan = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();
  const tmpForward = new THREE.Vector3();

  let halfWidth = DEFAULT_WIDTH / 2;
  let solid = true;
  let boost = false;
  let rails = false;

  samples.push({
    pos: pos.clone(),
    tangent: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    halfWidth,
    s: 0,
    curvature: 0,
    solid: true,
    boost: false,
    rails: false
  });

  const commit = (tangent: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3) => {
    const last = samples[samples.length - 1];
    const dist = pos.distanceTo(last.pos);
    if (dist < 1e-4) return;
    s += dist;
    const curvature = wrapAngle(tangentYaw(tangent) - tangentYaw(last.tangent)) / dist;
    samples.push({
      pos: pos.clone(),
      tangent: tangent.clone(),
      right: right.clone(),
      up: up.clone(),
      halfWidth,
      s,
      curvature,
      solid,
      boost,
      rails
    });
  };

  for (const piece of def.pieces) {
    const width = piece.width ?? DEFAULT_WIDTH;
    halfWidth = width / 2;
    solid = piece.kind !== 'gap';
    boost = piece.boost === true;
    rails = piece.rails === true;

    switch (piece.kind) {
      case 'straight':
      case 'ramp': {
        const length = piece.length;
        const slope = piece.kind === 'straight' ? (piece.slope ?? 0) : piece.rise / Math.max(1, piece.length);
        const steps = Math.max(1, Math.round(length / SAMPLE_STEP));
        const ds = length / steps;
        const pitch = Math.atan(slope);

        for (let i = 0; i < steps; i++) {
          heading(yaw, tmpForward);
          tmpTan.copy(tmpForward).multiplyScalar(Math.cos(pitch)).addScaledVector(WORLD_UP, Math.sin(pitch)).normalize();
          pos.addScaledVector(tmpTan, ds);
          tmpRight.crossVectors(tmpTan, WORLD_UP).normalize();
          tmpUp.crossVectors(tmpRight, tmpTan).normalize();
          commit(tmpTan, tmpRight, tmpUp);
        }
        break;
      }

      case 'curve': {
        const steps = Math.max(3, Math.round(piece.length / SAMPLE_STEP));
        const ds = piece.length / steps;
        const dYaw = piece.angle / steps;
        const pitch = Math.atan(piece.slope ?? 0);
        const bank = Math.sign(piece.angle) * (piece.bank ?? 0);

        for (let i = 0; i < steps; i++) {
          yaw += dYaw * 0.5;
          heading(yaw, tmpForward);
          tmpTan.copy(tmpForward).multiplyScalar(Math.cos(pitch)).addScaledVector(WORLD_UP, Math.sin(pitch)).normalize();
          pos.addScaledVector(tmpTan, ds);
          yaw += dYaw * 0.5;

          tmpRight.crossVectors(tmpTan, WORLD_UP).normalize();
          tmpUp.crossVectors(tmpRight, tmpTan).normalize();
          if (bank !== 0) {
            tmpRight.applyAxisAngle(tmpTan, -bank);
            tmpUp.crossVectors(tmpRight, tmpTan).normalize();
          }
          commit(tmpTan, tmpRight, tmpUp);
        }
        break;
      }

      case 'gap': {
        const steps = Math.max(2, Math.round(piece.length / SAMPLE_STEP));
        const ds = piece.length / steps;
        for (let i = 0; i < steps; i++) {
          heading(yaw, tmpForward);
          pos.addScaledVector(tmpForward, ds);
          tmpTan.copy(tmpForward);
          tmpRight.crossVectors(tmpTan, WORLD_UP).normalize();
          tmpUp.crossVectors(tmpRight, tmpTan).normalize();
          commit(tmpTan, tmpRight, tmpUp);
        }
        break;
      }

      case 'loop': {
        const radius = Math.max(6, piece.radius);
        const drift = piece.drift ?? 7;
        const steps = Math.max(28, Math.round((Math.PI * 2 * radius) / SAMPLE_STEP));
        const dTheta = (Math.PI * 2) / steps;
        const e1 = heading(yaw, new THREE.Vector3());
        const origin = pos.clone();
        const spin = drift / (Math.PI * 2);

        for (let i = 1; i <= steps; i++) {
          const th = dTheta * i;
          const p = new THREE.Vector3()
            .copy(origin)
            .addScaledVector(e1, drift * (th / (Math.PI * 2)) + radius * Math.sin(th))
            .addScaledVector(WORLD_UP, radius * (1 - Math.cos(th)));

          const t = new THREE.Vector3()
            .copy(e1)
            .multiplyScalar(radius * Math.cos(th) + spin)
            .addScaledVector(WORLD_UP, radius * Math.sin(th))
            .normalize();
          const u = new THREE.Vector3()
            .copy(e1)
            .multiplyScalar(-Math.sin(th))
            .addScaledVector(WORLD_UP, Math.cos(th))
            .normalize();
          const r = new THREE.Vector3().crossVectors(t, u).normalize();

          const dist = p.distanceTo(pos);
          s += dist;
          pos.copy(p);
          samples.push({
            pos: pos.clone(),
            tangent: t,
            right: r,
            up: u,
            halfWidth,
            s,
            curvature: 0,
            solid: true,
            boost: false,
            rails
          });
        }
        break;
      }
    }
  }

  return samples;
}

/* --------------------------------------------------------------------------
   Gate helpers
   -------------------------------------------------------------------------- */

let labelCache: Map<string, THREE.CanvasTexture> | null = null;

function labelTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  if (!labelCache) labelCache = new Map();
  const hit = labelCache.get(text);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.font = '800 86px Montserrat, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = fg;
  for (let i = 0; i < canvas.width; i += 64) {
    ctx.fillRect(i, 0, 26, 10);
    ctx.fillRect(i + 32, canvas.height - 10, 26, 10);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  labelCache.set(text, tex);
  return tex;
}

function frameQuaternion(sample: CenterlineSample): THREE.Quaternion {
  const m = new THREE.Matrix4().makeBasis(sample.right, sample.up, sample.tangent.clone().negate());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function createGate(
  sample: CenterlineSample,
  label: string,
  color: number,
  height: number,
  bannerBg: string,
  bannerFg: string
): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(sample.pos);
  group.quaternion.copy(frameQuaternion(sample));

  const postMat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const half = sample.halfWidth + 1.4;
  const postGeo = new THREE.BoxGeometry(0.5, height, 0.5);

  const left = new THREE.Mesh(postGeo, postMat);
  left.position.set(-half, height / 2, 0);
  const right = new THREE.Mesh(postGeo, postMat);
  right.position.set(half, height / 2, 0);
  group.add(left, right);

  const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.5, 0.45, 0.45), postMat);
  beam.position.set(0, height, 0);
  group.add(beam);

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 1.7, 2.3),
    new THREE.MeshBasicMaterial({
      map: labelTexture(label, bannerBg, bannerFg),
      transparent: true,
      toneMapped: false,
      side: THREE.DoubleSide
    })
  );
  banner.position.set(0, height - 1.35, 0);
  group.add(banner);

  return group;
}

function createCheckpointGate(sample: CenterlineSample, index: number): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(sample.pos);
  group.quaternion.copy(frameQuaternion(sample));

  const color = 0x2ec4ff;
  const mat = new THREE.MeshLambertMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.55,
    flatShading: true
  });
  const half = sample.halfWidth + 1.1;

  for (const sign of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.4, 0.28), mat);
    post.position.set(sign * half, 2.2, 0);
    group.add(post);
  }

  const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.28, 0.28, 0.28), mat);
  beam.position.set(0, 4.4, 0);
  group.add(beam);

  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 1.9, 3.6),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );
  curtain.position.set(0, 2.2, 0);
  group.add(curtain);

  const numberMat = new THREE.MeshBasicMaterial({
    map: labelTexture(`CP ${index + 1}`, 'rgba(10,20,32,0.9)', '#7fe4ff'),
    transparent: true,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const number = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), numberMat);
  number.position.set(0, 3.85, 0.02);
  group.add(number);

  return group;
}

/* --------------------------------------------------------------------------
   Track assembly
   -------------------------------------------------------------------------- */

function sampleIndexAtS(samples: CenterlineSample[], s: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s <= s) lo = mid;
    else hi = mid;
  }
  return Math.abs(samples[lo].s - s) <= Math.abs(samples[hi].s - s) ? lo : hi;
}

export function buildTrack(def: TrackDef): BuiltTrack {
  const samples = buildCenterline(def);
  const totalLength = samples[samples.length - 1].s;
  const query = new TrackQuery(samples);

  const group = new THREE.Group();
  group.name = `track:${def.id}`;

  const roadColor = new THREE.Color(def.palette.road);
  const roadDark = roadColor.clone().multiplyScalar(0.55);
  const curbA = new THREE.Color(def.palette.curbA);
  const curbB = new THREE.Color(def.palette.curbB);
  const railColor = new THREE.Color(def.palette.rail);
  const accent = new THREE.Color(def.palette.accent);
  const accentDim = accent.clone().multiplyScalar(0.45);

  const surface: SurfaceData = { position: [], color: [] };
  const glow: SurfaceData = { position: [], color: [] };
  const white = new THREE.Color(0xffffff);
  const black = new THREE.Color(0x11161f);
  const CURB_W = 0.95;
  const SKIRT = 2.4;

  const edge = (sample: CenterlineSample, offset: number, lift: number) =>
    sample.pos.clone().addScaledVector(sample.right, offset).addScaledVector(sample.up, lift);

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (!a.solid || !b.solid) continue;

    const aw = a.halfWidth;
    const bw = b.halfWidth;

    // Road surface
    const aIL = edge(a, -aw, 0);
    const aIR = edge(a, aw, 0);
    const bIR = edge(b, bw, 0);
    const bIL = edge(b, -bw, 0);
    addQuad(surface, aIL, aIR, bIR, bIL, roadColor);

    // Curbs (alternating every ~4.5 m)
    const curbColor = Math.floor(a.s / 4.5) % 2 === 0 ? curbA : curbB;
    const aOutL = edge(a, -(aw + CURB_W), 0.06);
    const aInL = edge(a, -aw, 0.06);
    const bOutL = edge(b, -(bw + CURB_W), 0.06);
    const bInL = edge(b, -bw, 0.06);
    addQuad(surface, aOutL, aInL, bInL, bOutL, curbColor);

    const aInR = edge(a, aw, 0.06);
    const aOutR = edge(a, aw + CURB_W, 0.06);
    const bInR = edge(b, bw, 0.06);
    const bOutR = edge(b, bw + CURB_W, 0.06);
    addQuad(surface, aInR, aOutR, bOutR, bInR, curbColor);

    // Side skirts so the road reads as a solid slab from below
    const aDownL = aOutL.clone().addScaledVector(a.up, -SKIRT);
    const bDownL = bOutL.clone().addScaledVector(b.up, -SKIRT);
    addQuad(surface, aOutL, bOutL, bDownL, aDownL, roadDark);

    const aDownR = aOutR.clone().addScaledVector(a.up, -SKIRT);
    const bDownR = bOutR.clone().addScaledVector(b.up, -SKIRT);
    addQuad(surface, aOutR, bOutR, bDownR, aDownR, roadDark);

    // Rails
    if (a.rails) {
      const aTopL = aOutL.clone().addScaledVector(a.up, 0.95);
      const bTopL = bOutL.clone().addScaledVector(b.up, 0.95);
      addQuad(surface, aOutL, bOutL, bTopL, aTopL, railColor);

      const aTopR = aOutR.clone().addScaledVector(a.up, 0.95);
      const bTopR = bOutR.clone().addScaledVector(b.up, 0.95);
      addQuad(surface, aOutR, bOutR, bTopR, aTopR, railColor);
    }

    // Boost pads (striped so they read as a speed surface)
    if (a.boost) {
      const lift = 0.07;
      const aBL = a.pos.clone().addScaledVector(a.right, -aw * 0.84).addScaledVector(a.up, lift);
      const aBR = a.pos.clone().addScaledVector(a.right, aw * 0.84).addScaledVector(a.up, lift);
      const bBR = b.pos.clone().addScaledVector(b.right, bw * 0.84).addScaledVector(b.up, lift);
      const bBL = b.pos.clone().addScaledVector(b.right, -bw * 0.84).addScaledVector(b.up, lift);
      const stripe = Math.floor(a.s / 3.2) % 2 === 0 ? accent : accentDim;
      addQuad(glow, aBL, aBR, bBR, bBL, stripe);
    }
  }

  const surfaceMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide
  });
  const roadMesh = toMesh(surface, surfaceMaterial);
  roadMesh.name = 'track-surface';
  group.add(roadMesh);

  if (glow.position.length > 0) {
    const glowMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    const glowMesh = toMesh(glow, glowMaterial);
    glowMesh.name = 'track-boost';
    group.add(glowMesh);
  }

  // Start / finish line paint
  const paint: SurfaceData = { position: [], color: [] };
  const paintLine = (sample: CenterlineSample) => {
    const cols = 12;
    const step = (sample.halfWidth * 2) / cols;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < cols; col++) {
        const c = (row + col) % 2 === 0 ? white : black;
        const x0 = -sample.halfWidth + col * step;
        const x1 = x0 + step;
        const z0 = row * 0.7;
        const z1 = z0 + 0.7;
        const v0 = sample.pos.clone().addScaledVector(sample.right, x0).addScaledVector(sample.tangent, z0).addScaledVector(sample.up, 0.06);
        const v1 = sample.pos.clone().addScaledVector(sample.right, x1).addScaledVector(sample.tangent, z0).addScaledVector(sample.up, 0.06);
        const v2 = sample.pos.clone().addScaledVector(sample.right, x1).addScaledVector(sample.tangent, z1).addScaledVector(sample.up, 0.06);
        const v3 = sample.pos.clone().addScaledVector(sample.right, x0).addScaledVector(sample.tangent, z1).addScaledVector(sample.up, 0.06);
        addQuad(paint, v0, v1, v2, v3, c);
      }
    }
  };
  const startIndex = sampleIndexAtS(samples, 58);
  paintLine(samples[startIndex]);
  paintLine(samples[samples.length - 2]);
  const paintMesh = toMesh(
    paint,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })
  );
  group.add(paintMesh);

  // Gates
  group.add(createGate(samples[startIndex], 'START', 0xff5a3c, 6.4, '#ff5a3c', '#1b0603'));
  group.add(
    createGate(samples[samples.length - 2], 'FINISH', 0xffc93c, 6.6, '#ffc93c', '#241404')
  );

  // Checkpoints
  const checkpoints = def.checkpoints
    .map((f) => Math.max(12, Math.min(totalLength - 12, f * totalLength)))
    .sort((x, y) => x - y);

  checkpoints.forEach((cpS, index) => {
    group.add(createCheckpointGate(samples[sampleIndexAtS(samples, cpS)], index));
  });

  // Bounds — computed before the scenery so distant peaks can be pushed
  // outside the circuit instead of being spread around the world origin.
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const sample of samples) {
    min.min(sample.pos);
    max.max(sample.pos);
  }
  const center = min.clone().add(max).multiplyScalar(0.5);
  let radius = 0;
  for (const sample of samples) {
    radius = Math.max(radius, sample.pos.distanceTo(center));
  }
  const bounds = { center, radius };

  // Ground
  // 220 segments ≈ 24.5 m cells, small enough that the carved road shelf is
  // actually sampled and never spans a whole terrain triangle.
  const groundGeo = new THREE.PlaneGeometry(5400, 5400, 220, 220);
  groundGeo.rotateX(-Math.PI / 2);
  const positions = groundGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, carvedGroundHeight(x, z, query, def.groundY));
  }
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshLambertMaterial({ color: def.palette.ground, flatShading: true });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = def.groundY;
  ground.name = 'ground';
  group.add(ground);

  // Scenery
  group.add(createScenery(def, samples, query, bounds));

  return {
    def,
    group,
    samples,
    totalLength,
    query,
    checkpoints,
    start: samples[0],
    finish: samples[samples.length - 1],
    killY: min.y - 55,
    center,
    radius: radius + 30
  };
}

export function disposeTrack(track: BuiltTrack) {
  track.group.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    }
  });
}
