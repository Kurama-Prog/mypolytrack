import * as THREE from 'three';
import type { BuiltTrack } from '../track/builder';
import type { LocalFrame } from '../track/types';
import type { DriveInput } from '../engine/input';
import type { TuningParams } from './tuning';

const GRAVITY = 26;
const MAX_SPEED = 56;
const REVERSE_MAX = 12;
const ENGINE_FORCE = 34;
const BRAKE_FORCE = 47;
const DRAG_LINEAR = 0.55;
const DRAG_QUAD = 0.0027;
const STEER_RATE = 2.15;
/** Self-aligning rate towards the road tangent. Low values = loose rear end. */
const GRIP_ALIGN = 2.3;
const DRIFT_ALIGN = 0.85;
const AIR_STEER = 0.5;
const CAR_LIFT = 0.02;

export interface CarState {
  grounded: boolean;
  /** Arc length along the centreline. */
  s: number;
  /** Lateral offset from the centreline. */
  n: number;
  /** Heading offset relative to the track tangent (positive = right). */
  psi: number;
  /** Forward speed along the heading. */
  v: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  speed: number;
  airTime: number;
  boosting: boolean;
  landed: boolean;
}

const basisMatrix = new THREE.Matrix4();
const basisRight = new THREE.Vector3();
const basisUp = new THREE.Vector3();
const basisBack = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Orients an object whose local forward axis is -Z. Returns false on degenerate input. */
export function orientCar(quat: THREE.Quaternion, forward: THREE.Vector3, up: THREE.Vector3): boolean {
  basisRight.crossVectors(forward, up);
  if (basisRight.lengthSq() < 1e-6) {
    basisRight.crossVectors(forward, WORLD_UP);
    if (basisRight.lengthSq() < 1e-6) return false;
  }
  basisRight.normalize();
  basisUp.crossVectors(basisRight, forward).normalize();
  basisBack.copy(forward).negate();
  basisMatrix.makeBasis(basisRight, basisUp, basisBack);
  quat.setFromRotationMatrix(basisMatrix);
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function createCar(track: BuiltTrack, startS = 6): CarState {
  const frame = track.query.frameAtS(startS);
  const car: CarState = {
    grounded: true,
    s: startS,
    n: 0,
    psi: 0,
    v: 0,
    pos: frame.pos.clone().addScaledVector(frame.up, CAR_LIFT),
    vel: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    speed: 0,
    airTime: 0,
    boosting: false,
    landed: false
  };
  orientCar(car.quat, frame.tangent, frame.up);
  return car;
}

export function resetCar(car: CarState, track: BuiltTrack, s: number) {
  const clamped = Math.max(0, Math.min(track.totalLength - 1, s));
  const frame = track.query.frameAtS(clamped);
  car.grounded = true;
  car.s = clamped;
  car.n = 0;
  car.psi = 0;
  car.v = 0;
  car.pos.copy(frame.pos).addScaledVector(frame.up, CAR_LIFT);
  car.vel.set(0, 0, 0);
  car.speed = 0;
  car.airTime = 0;
  car.boosting = false;
  car.landed = false;
  orientCar(car.quat, frame.tangent, frame.up);
}

function launch(car: CarState, frame: LocalFrame) {
  const cs = Math.cos(car.psi);
  const sn = Math.sin(car.psi);
  tmpForward.copy(frame.tangent).multiplyScalar(cs).addScaledVector(frame.right, sn).normalize();
  car.pos.copy(frame.pos).addScaledVector(frame.right, car.n).addScaledVector(frame.up, CAR_LIFT);
  car.vel.copy(tmpForward).multiplyScalar(car.v);
  car.grounded = false;
  car.airTime = 0;
  orientCar(car.quat, tmpForward, frame.up);
}

export function stepCar(
  car: CarState,
  input: DriveInput,
  track: BuiltTrack,
  tuning: TuningParams,
  dt: number
) {
  car.landed = false;
  car.boosting = false;

  if (car.grounded) stepGrounded(car, input, track, tuning, dt);
  else stepAirborne(car, input, track, tuning, dt);

  car.speed = car.grounded ? Math.abs(car.v) : car.vel.length();
}

function stepGrounded(
  car: CarState,
  input: DriveInput,
  track: BuiltTrack,
  tuning: TuningParams,
  dt: number
) {
  const frame = track.query.frameAtS(car.s);

  if (!frame.solid) {
    launch(car, frame);
    return;
  }

  const grip = tuning.gripMode === 'grip';
  const align = grip ? GRIP_ALIGN : DRIFT_ALIGN;
  const speedAbs = Math.abs(car.v);

  // Steering: sharper at low speed, calmer at top speed.
  const steerFactor = Math.min(1, speedAbs / 5.5) * (1 - 0.5 * Math.min(1, speedAbs / MAX_SPEED));
  car.psi += input.steer * STEER_RATE * steerFactor * dt;
  const maxPsi = grip ? 0.85 : 1.3;
  car.psi = clamp(car.psi, -maxPsi, maxPsi);

  // The road rotates beneath the car. Without steering input the heading stays
  // fixed in world space, so the car runs wide through corners.
  const forwardStep = car.v * Math.cos(car.psi) * dt;
  car.psi += frame.curvature * forwardStep;

  // Self-aligning torque: a small stability assist, weaker in drift mode.
  car.psi *= Math.exp(-align * dt);

  // Longitudinal forces
  let accel = 0;
  if (input.throttle > 0) {
    if (car.v < -0.5) accel += BRAKE_FORCE * tuning.brake;
    else accel += ENGINE_FORCE * tuning.acceleration * Math.max(0.1, 1 - 0.72 * clamp(car.v / MAX_SPEED, 0, 1));
  }
  if (input.brake > 0) {
    if (car.v > 0.6) accel -= BRAKE_FORCE * tuning.brake;
    else accel -= ENGINE_FORCE * 0.55 * tuning.acceleration;
  }

  const dirSign = car.v === 0 ? 0 : Math.sign(car.v);
  accel -= dirSign * (DRAG_LINEAR + DRAG_QUAD * car.v * car.v);
  if (input.throttle === 0 && input.brake === 0) accel -= dirSign * 1.6;
  // Gravity works along the slope of the road (matters on ramps and loops).
  accel -= GRAVITY * frame.tangent.y;

  car.v += accel * dt;

  const onRoad = Math.abs(car.n) < frame.halfWidth;
  if (frame.boost && onRoad) {
    car.v = Math.min(car.v + 62 * dt, MAX_SPEED * 1.3);
    car.boosting = true;
  }

  car.v = clamp(car.v, -REVERSE_MAX, MAX_SPEED * (car.boosting ? 1.3 : 1.1));

  const cs = Math.cos(car.psi);
  const sn = Math.sin(car.psi);
  car.s = clamp(car.s + car.v * cs * dt, 0, track.totalLength - 0.5);
  car.n += car.v * sn * dt;

  // Barriers
  if (frame.rails) {
    const limit = frame.halfWidth - 0.7;
    if (Math.abs(car.n) > limit) {
      car.n = Math.sign(car.n) * limit;
      car.v *= 0.84;
      car.psi *= -0.45;
    }
  } else if (Math.abs(car.n) > frame.halfWidth + 0.3) {
    launch(car, frame);
    return;
  }

  const next = track.query.frameAtS(car.s);
  car.pos.copy(next.pos).addScaledVector(next.right, car.n).addScaledVector(next.up, CAR_LIFT);

  const heading = tmpForward
    .copy(next.tangent)
    .multiplyScalar(Math.cos(car.psi))
    .addScaledVector(next.right, Math.sin(car.psi));
  orientCar(car.quat, heading, next.up);
}

function stepAirborne(
  car: CarState,
  input: DriveInput,
  track: BuiltTrack,
  tuning: TuningParams,
  dt: number
) {
  car.airTime += dt;
  car.vel.y -= GRAVITY * dt;

  if (input.steer !== 0 && car.airTime > 0.05) {
    const amount = -input.steer * AIR_STEER * dt;
    const cos = Math.cos(amount);
    const sin = Math.sin(amount);
    const vx = car.vel.x;
    const vz = car.vel.z;
    car.vel.x = vx * cos + vz * sin;
    car.vel.z = -vx * sin + vz * cos;
  }

  car.pos.addScaledVector(car.vel, dt);

  const speed = car.vel.length();
  if (speed > 1.5) {
    tmpTarget.copy(car.vel).multiplyScalar(1 / speed);
    tmpUp.set(0, 1, 0).applyQuaternion(car.quat);
    if (Math.abs(tmpTarget.dot(tmpUp)) < 0.94) tmpUp.copy(WORLD_UP);
    if (orientCar(tmpQuat, tmpTarget, tmpUp)) {
      car.quat.slerp(tmpQuat, 1 - Math.exp(-dt * 5));
    }
  }

  // Give the car a moment of air before it can touch down again.
  if (car.airTime < 0.12) return;

  const hit = track.query.nearest(car.pos.x, car.pos.y, car.pos.z);
  if (!hit || !hit.solid) return;
  if (Math.abs(hit.n) > hit.halfWidth - 0.1) return;

  const surfaceUpVelocity = car.vel.dot(hit.up);
  if (hit.height > 0.65 || hit.height < -2.5) return;
  if (surfaceUpVelocity > 0.1) return;

  // Touchdown
  const vt = car.vel.dot(hit.tangent);
  const vn = car.vel.dot(hit.right);
  car.s = clamp(hit.s, 0, track.totalLength - 0.5);
  car.n = clamp(hit.n, -hit.halfWidth + 0.4, hit.halfWidth - 0.4);
  car.v = clamp(vt, -REVERSE_MAX, MAX_SPEED * 1.3);
  car.psi = clamp(Math.atan2(vn, Math.max(0.6, Math.abs(vt))), -1.3, 1.3);
  car.grounded = true;
  car.airTime = 0;
  car.landed = true;
  car.pos.copy(hit.pos).addScaledVector(hit.right, car.n).addScaledVector(hit.up, CAR_LIFT);
  orientCar(car.quat, hit.tangent, hit.up);

  // Landing scrub
  car.v *= tuning.gripMode === 'grip' ? 0.985 : 0.955;
  car.speed = Math.abs(car.v);
}
