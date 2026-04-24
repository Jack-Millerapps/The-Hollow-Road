import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// ---------------------------------------------------------------------------
// Light budget. Only the moon DirectionalLight casts shadows. All PointLights
// register themselves with the budget; each frame the 4 closest to the camera
// stay enabled and the rest are turned off (visible=false / intensity=0).
// ---------------------------------------------------------------------------

const POINT_LIGHT_BUDGET = 4;

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

  // Culling budgets
  _pointLights: [],

  init() {
    const scene = new THREE.Scene();

    const fogColor = new THREE.Color(0x0f111a);
    // Consolidation — default to daylight fog density; DayNight overrides each frame.
    const fog = new THREE.FogExp2(fogColor.getHex(), 0.0015);
    scene.fog = fog;
    scene.background = fogColor.clone().multiplyScalar(0.55);

    // Extended far plane so the (much bigger) 16k-unit world is visible.
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1200,
    );
    camera.position.set(0, 2.5, 0);
    camera.lookAt(0, 2.5, -10);

    // Disable antialiasing on high-density screens to keep mobile fast.
    const useAA = (window.devicePixelRatio || 1) <= 2;
    const renderer = new THREE.WebGLRenderer({
      antialias: useAA,
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

    // --- Lighting rig --------------------------------------------------

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
    // Consolidation — reduced shadow map from 2048 → 512.
    moonLight.shadow.mapSize.set(512, 512);
    moonLight.shadow.camera.near = 1;
    moonLight.shadow.camera.far = 240;
    moonLight.shadow.camera.left = -80;
    moonLight.shadow.camera.right = 80;
    moonLight.shadow.camera.top = 80;
    moonLight.shadow.camera.bottom = -80;
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
      0.75,
      0.85,
      0.55,
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

  // Register a PointLight so we can cap the active count per frame.
  registerPointLight(light) {
    if (!light) return;
    light.castShadow = false; // hard rule
    light.userData._baseIntensity = light.intensity;
    this._pointLights.push(light);
  },

  // Called every frame — only the 4 closest to the camera stay lit.
  cullPointLights() {
    if (this._pointLights.length === 0 || !this.camera) return;
    const cam = this.camera.position;
    const entries = this._pointLights;
    if (entries.length <= POINT_LIGHT_BUDGET) {
      for (const l of entries) {
        if (l.userData._baseIntensity !== undefined && l.intensity === 0) {
          l.intensity = l.userData._baseIntensity;
        }
        l.visible = true;
      }
      return;
    }
    const ranked = [];
    for (const l of entries) {
      if (!l.parent) continue;
      const wp = new THREE.Vector3();
      l.getWorldPosition(wp);
      const d = wp.distanceToSquared(cam);
      ranked.push({ l, d });
    }
    ranked.sort((a, b) => a.d - b.d);
    for (let i = 0; i < ranked.length; i++) {
      const { l } = ranked[i];
      if (i < POINT_LIGHT_BUDGET) {
        l.visible = true;
        if (l.userData._baseIntensity !== undefined && l.intensity === 0) {
          l.intensity = l.userData._baseIntensity;
        }
      } else {
        l.visible = false;
      }
    }
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
    this.cullPointLights();
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  },
};
