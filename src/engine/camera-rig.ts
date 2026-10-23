import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Minimum height the camera keeps above the ground. */
const GROUND_CLEARANCE = 1.4;
/** How much air must exist between the sight line and the terrain. */
const SIGHT_CLEARANCE = 0.9;
/** Highest lift the rig will apply before it starts pulling in instead. */
const MAX_LIFT = 5.5;
const LIFT_STEP = 0.5;
const SIGHT_SAMPLES = 10;
const MIN_PULL = 0.7;

export interface CameraTarget {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  speed: number;
}

/** Analytic terrain sampler used to keep the chase camera out of the ground. */
export interface GroundProbe {
  heightAt(x: number, z: number): number;
}

export class CameraRig {
  private readonly desired = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly smoothLook = new THREE.Vector3();
  private readonly smoothUp = new THREE.Vector3(0, 1, 0);
  private readonly forward = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly probeEye = new THREE.Vector3();
  private readonly probePoint = new THREE.Vector3();
  private readonly menuPos = new THREE.Vector3();
  private initialised = false;
  private lift = 0;
  private pull = 1;

  /** True when nothing on the way from the look target to the eye blocks it. */
  private sightClear(ground: GroundProbe, lift: number, pull: number): boolean {
    const eye = this.probeEye.copy(this.desired).lerp(this.look, 1 - pull);
    eye.y += lift;

    const eyeGround = ground.heightAt(eye.x, eye.z);
    if (eye.y < eyeGround + GROUND_CLEARANCE) eye.y = eyeGround + GROUND_CLEARANCE;

    for (let i = 1; i <= SIGHT_SAMPLES; i++) {
      this.probePoint.copy(this.look).lerp(eye, i / SIGHT_SAMPLES);
      const height = ground.heightAt(this.probePoint.x, this.probePoint.z);
      if (height + SIGHT_CLEARANCE > this.probePoint.y) return false;
    }
    return true;
  }

  follow(
    camera: THREE.PerspectiveCamera,
    target: CameraTarget,
    dt: number,
    snap = false,
    ground?: GroundProbe | null
  ) {
    this.forward.set(0, 0, -1).applyQuaternion(target.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(target.quaternion);

    const speedFactor = Math.min(1, Math.abs(target.speed) / 48);
    const distance = 7.5 + speedFactor * 2.1;
    const height = 2.85 + speedFactor * 0.3;

    this.desired
      .copy(target.position)
      .addScaledVector(this.forward, -distance)
      .addScaledVector(this.up, height);

    this.look
      .copy(target.position)
      .addScaledVector(this.forward, 7.5)
      .addScaledVector(this.up, 1.15);

    // Find the smallest lift (and, as a last resort, pull-in) that keeps the
    // road ahead visible instead of leaving terrain between eye and tarmac.
    let goalLift = 0;
    let goalPull = 1;
    if (ground) {
      let found = false;
      for (let lift = 0; lift <= MAX_LIFT + 1e-4; lift += LIFT_STEP) {
        if (this.sightClear(ground, lift, 1)) {
          goalLift = lift;
          found = true;
          break;
        }
      }
      if (!found) {
        goalLift = MAX_LIFT;
        goalPull = MIN_PULL;
        for (let pull = 0.92; pull >= MIN_PULL - 1e-4; pull -= 0.06) {
          if (this.sightClear(ground, MAX_LIFT, pull)) {
            goalPull = pull;
            break;
          }
        }
      }
    }

    const ease = snap || !this.initialised ? 1 : 1 - Math.exp(-dt * 8);
    this.lift += (goalLift - this.lift) * ease;
    this.pull += (goalPull - this.pull) * ease;

    if (this.pull < 0.999) this.desired.lerp(this.look, 1 - this.pull);
    this.desired.y += this.lift;
    if (ground) {
      const floor = ground.heightAt(this.desired.x, this.desired.z) + GROUND_CLEARANCE;
      if (this.desired.y < floor) this.desired.y = floor;
    }

    this.tmp.copy(this.up).lerp(WORLD_UP, 0.32).normalize();

    if (snap || !this.initialised) {
      camera.position.copy(this.desired);
      this.smoothLook.copy(this.look);
      this.smoothUp.copy(this.tmp);
      this.initialised = true;
    } else {
      const posLerp = 1 - Math.exp(-dt * 9);
      const lookLerp = 1 - Math.exp(-dt * 12);
      const upLerp = 1 - Math.exp(-dt * 6);
      camera.position.lerp(this.desired, posLerp);
      this.smoothLook.lerp(this.look, lookLerp);
      this.smoothUp.lerp(this.tmp, upLerp).normalize();
    }

    camera.up.copy(this.smoothUp);
    camera.lookAt(this.smoothLook);

    const targetFov = 62 + speedFactor * 12;
    camera.fov += (targetFov - camera.fov) * (snap ? 1 : 1 - Math.exp(-dt * 4));
    camera.updateProjectionMatrix();
  }

  orbit(
    camera: THREE.PerspectiveCamera,
    center: THREE.Vector3,
    radius: number,
    angle: number,
    dt: number,
    snap = false
  ) {
    const dist = radius * 0.95 + 18;
    this.menuPos.set(
      center.x + Math.cos(angle) * dist,
      center.y + radius * 0.32 + 9,
      center.z + Math.sin(angle) * dist
    );

    this.look.set(center.x, center.y + 3, center.z);

    if (snap || !this.initialised) {
      camera.position.copy(this.menuPos);
      this.smoothLook.copy(this.look);
      this.smoothUp.copy(WORLD_UP);
      this.initialised = true;
    } else {
      camera.position.lerp(this.menuPos, 1 - Math.exp(-dt * 2.2));
      this.smoothLook.lerp(this.look, 1 - Math.exp(-dt * 2.2));
      this.smoothUp.lerp(WORLD_UP, 1 - Math.exp(-dt * 3));
    }

    camera.up.copy(this.smoothUp);
    camera.lookAt(this.smoothLook);

    const targetFov = 56;
    camera.fov += (targetFov - camera.fov) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    camera.updateProjectionMatrix();
  }

  reset() {
    this.initialised = false;
    this.lift = 0;
    this.pull = 1;
  }
}
