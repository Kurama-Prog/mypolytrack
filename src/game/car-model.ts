import * as THREE from 'three';

export interface CarModel {
  group: THREE.Group;
  update(speed: number, steer: number, dt: number): void;
}

interface ModelOptions {
  ghost?: boolean;
  bodyColor?: number;
  accentColor?: number;
}

export function createCarModel(options: ModelOptions = {}): CarModel {
  const ghost = options.ghost === true;
  const bodyColor = options.bodyColor ?? 0xff5a3c;
  const accentColor = options.accentColor ?? 0xffc93c;

  const group = new THREE.Group();
  group.name = ghost ? 'ghost-car' : 'player-car';

  const mat = (color: number, emissive = 0x000000, emissiveIntensity = 0) =>
    new THREE.MeshLambertMaterial({
      color,
      emissive,
      emissiveIntensity,
      flatShading: true,
      transparent: ghost,
      opacity: ghost ? 0.32 : 1,
      depthWrite: !ghost
    });

  const bodyMat = mat(ghost ? 0x9fe8ff : bodyColor, ghost ? 0x2ec4ff : 0x000000, ghost ? 0.6 : 0);
  const darkMat = mat(ghost ? 0x7fd8ff : 0x1b2430, ghost ? 0x2ec4ff : 0x000000, ghost ? 0.6 : 0);
  const glassMat = mat(ghost ? 0x7fd8ff : 0x223247, ghost ? 0x2ec4ff : 0x000000, ghost ? 0.6 : 0);
  const tyreMat = mat(ghost ? 0x6fbfe0 : 0x14171d, ghost ? 0x2ec4ff : 0x000000, ghost ? 0.5 : 0);
  const rimMat = mat(ghost ? 0x9fe8ff : 0xc6d3e2, ghost ? 0x2ec4ff : 0x000000, ghost ? 0.6 : 0);
  const accentMat = mat(ghost ? 0x9fe8ff : accentColor, ghost ? 0x2ec4ff : 0x22160a, ghost ? 0.6 : 0.25);
  const lightMat = mat(ghost ? 0xfff3c4 : 0xfff0c0, 0xffc93c, ghost ? 0.2 : 1);
  const tailMat = mat(ghost ? 0xff9d9d : 0xd8232a, 0xff2d2d, ghost ? 0.2 : 0.8);

  // Main chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.4, 3.9), bodyMat);
  chassis.position.y = 0.52;
  group.add(chassis);

  // Nose wedge
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.26, 1.1), bodyMat);
  nose.position.set(0, 0.42, -2.1);
  group.add(nose);

  // Upper shell
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.34, 2.1), bodyMat);
  shell.position.set(0, 0.86, 0.25);
  group.add(shell);

  // Cockpit
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.36, 1.15), glassMat);
  cockpit.position.set(0, 1.14, 0.2);
  group.add(cockpit);

  // Splitter
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.1, 0.5), darkMat);
  splitter.position.set(0, 0.32, -2.45);
  group.add(splitter);

  // Rear wing
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.6), accentMat);
  wing.position.set(0, 1.32, 1.86);
  group.add(wing);
  for (const x of [-0.7, 0.7]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.24), darkMat);
    support.position.set(x, 1.1, 1.82);
    group.add(support);
  }

  // Lights
  for (const x of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.1), lightMat);
    head.position.set(x, 0.56, -2.62);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.08), tailMat);
    tail.position.set(x, 0.72, 1.94);
    group.add(tail);
  }

  // Wheels
  const wheelRadius = 0.42;
  const tyreGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.36, 8);
  const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.55, wheelRadius * 0.55, 0.38, 8);

  const steerGroups: THREE.Group[] = [];
  const spinGroups: THREE.Group[] = [];

  for (const z of [-1.32, 1.34]) {
    for (const x of [-0.98, 0.98]) {
      const steerGroup = new THREE.Group();
      steerGroup.position.set(x, wheelRadius, z);
      const spinGroup = new THREE.Group();
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      spinGroup.add(tyre, rim);
      steerGroup.add(spinGroup);
      group.add(steerGroup);
      steerGroups.push(steerGroup);
      spinGroups.push(spinGroup);
    }
  }

  // Contact shadow
  if (!ghost) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 10),
      new THREE.MeshBasicMaterial({
        color: 0x0b1421,
        transparent: true,
        opacity: 0.3,
        depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 1.55, 1);
    shadow.position.y = 0.015;
    group.add(shadow);
  }

  let spin = 0;

  return {
    group,
    update(speed: number, steer: number, dt: number) {
      spin -= (speed * dt) / wheelRadius;
      for (let i = 0; i < spinGroups.length; i++) {
        spinGroups[i].rotation.x = spin;
      }
      const steerAngle = Math.max(-0.5, Math.min(0.5, steer * 0.42));
      // Only the front pair steers.
      steerGroups[0].rotation.y = steerAngle;
      steerGroups[1].rotation.y = steerAngle;
    }
  };
}
