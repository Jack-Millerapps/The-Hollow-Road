import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Subtle filmic vignette — darkens edges, adds cinematic framing.
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    darkness: { value: 1.0 },
    offset: { value: 1.15 },
    warmth: { value: 0.06 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float darkness;
    uniform float offset;
    uniform float warmth;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec2 p = vUv * 2.0 - 1.0;
      float d = dot(p, p);
      float vig = smoothstep(offset, 0.2, d);
      tex.rgb *= mix(1.0 - darkness * 0.55, 1.0, vig);
      // Tiny warm tint in the highlights — unifies lantern-lit scene.
      tex.rgb += vec3(warmth, warmth * 0.5, 0.0) * max(0.0, (tex.r + tex.g + tex.b) / 3.0 - 0.35);
      gl_FragColor = tex;
    }
  `,
};

export const SceneManager = {
  scene: null,
  camera: null,
  renderer: null,
  composer: null,
  bloomPass: null,
  fog: null,
  moonLight: null,
  moonFill: null,
  ambient: null,
  hemi: null,

  init() {
    const scene = new THREE.Scene();

    const fogColor = new THREE.Color(0x0f111a);
    const fog = new THREE.FogExp2(fogColor.getHex(), 0.022);
    scene.fog = fog;
    scene.background = fogColor.clone().multiplyScalar(0.55);

    const camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      600,
    );
    camera.position.set(0, 2.5, 0);
    camera.lookAt(0, 2.5, -10);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const app = document.getElementById('app');
    app.appendChild(renderer.domElement);

    // --- Lighting rig ---------------------------------------------------

    const ambient = new THREE.AmbientLight(0x18202e, 0.2);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x3b4a66, 0x150a06, 0.42);
    hemi.position.set(0, 50, 0);
    scene.add(hemi);

    const moonLight = new THREE.DirectionalLight(0xc4d2e8, 0.9);
    moonLight.position.set(-35, 60, -10);
    moonLight.target.position.set(0, 0, -150);
    scene.add(moonLight.target);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    moonLight.shadow.camera.near = 1;
    moonLight.shadow.camera.far = 220;
    moonLight.shadow.camera.left = -70;
    moonLight.shadow.camera.right = 70;
    moonLight.shadow.camera.top = 70;
    moonLight.shadow.camera.bottom = -70;
    moonLight.shadow.bias = -0.0008;
    moonLight.shadow.normalBias = 0.02;
    moonLight.shadow.radius = 4;
    scene.add(moonLight);

    const moonFill = new THREE.DirectionalLight(0xffb070, 0.12);
    moonFill.position.set(15, 4, 6);
    scene.add(moonFill);

    // --- Post-processing stack -----------------------------------------

    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(window.innerWidth, window.innerHeight);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.75, // strength
      0.85, // radius
      0.55, // threshold — only brighter-than-average pixels bloom
    );
    composer.addPass(bloomPass);

    const vignettePass = new ShaderPass(VignetteShader);
    composer.addPass(vignettePass);

    window.addEventListener('resize', () => this.onResize());

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.composer = composer;
    this.bloomPass = bloomPass;
    this.fog = fog;
    this.moonLight = moonLight;
    this.moonFill = moonFill;
    this.ambient = ambient;
    this.hemi = hemi;

    return { scene, camera, renderer, fog };
  },

  onResize() {
    if (!this.renderer || !this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) {
      this.composer.setSize(window.innerWidth, window.innerHeight);
      if (this.bloomPass) this.bloomPass.setSize(window.innerWidth, window.innerHeight);
    }
  },

  render() {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  },
};
