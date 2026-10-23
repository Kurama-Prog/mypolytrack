import * as THREE from 'three';
import type { TrackPalette } from '../track/types';

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  varying vec3 vDir;

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    float t = smoothstep(0.3, 0.8, h);
    vec3 col = mix(uBottom, uTop, t);

    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSun * pow(sunDot, 260.0) * 1.5;
    col += uSun * pow(sunDot, 6.0) * 0.16;

    // subtle banding break for a flat low-poly look
    col += (fract(sin(dot(dir.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x0b1421, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xffffff, 320, 1900);

    this.camera = new THREE.PerspectiveCamera(64, 1, 0.3, 5200);
    this.camera.position.set(0, 12, 26);

    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uTop: { value: new THREE.Color('#2a7fd0') },
        uBottom: { value: new THREE.Color('#ffd7a3') },
        uSun: { value: new THREE.Color('#fff1cf') },
        uSunDir: { value: new THREE.Vector3(-0.42, 0.34, 0.84).normalize() }
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false
    });

    const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 16), this.skyMaterial);
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    this.scene.add(sky);

    this.hemisphere = new THREE.HemisphereLight(0xbfd8ff, 0x4a5a3a, 0.78);
    this.scene.add(this.hemisphere);

    // Keeps back faces (loop undersides, road skirts) from going pitch black.
    this.ambient = new THREE.AmbientLight(0xffffff, 0.42);
    this.scene.add(this.ambient);

    this.keyLight = new THREE.DirectionalLight(0xfff4e0, 1.55);
    this.keyLight.position.set(-260, 320, 420);
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x8fd4ff, 0.45);
    this.rimLight.position.set(320, 180, -420);
    this.scene.add(this.rimLight);

    this.resize();
  }

  applyPalette(palette: TrackPalette, ambient: string) {
    const uniforms = this.skyMaterial.uniforms;
    (uniforms.uTop.value as THREE.Color).set(palette.skyTop);
    (uniforms.uBottom.value as THREE.Color).set(palette.skyBottom);
    (uniforms.uSun.value as THREE.Color).set(palette.sun);

    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(palette.fog);
    fog.near = 340;
    fog.far = 2450;

    this.hemisphere.color.set(ambient);
    this.hemisphere.groundColor.set(palette.ground);
    this.hemisphere.intensity = 0.78;
    this.ambient.color.set(palette.fog);

    this.keyLight.color.set(palette.sun);
    this.rimLight.color.set(palette.accent);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
