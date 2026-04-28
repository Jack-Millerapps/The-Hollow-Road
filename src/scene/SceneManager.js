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
// Cap pixel ratio to keep fragment work bounded on retina/hi-dpi screens.
// On retina the browser default dpr is 2 (4x the pixels of dpr 1). At 1.0
// the canvas matches the CSS resolution — the cheapest mode that still
// looks reasonable. Bump back up with ?dpr=1.5 for a sharper image.
const MAX_PIXEL_RATIO = (() => {
  try {
    const v = parseFloat(new URLSearchParams(window.location.search).get('dpr'));
    if (Number.isFinite(v) && v > 0) return v;
  } catch {}
  return 1.0;
})();
// Throttle point-light culling — sub-frame precision isn't needed.
const CULL_INTERVAL_MS = 250;

// Bloom + vignette is the single most expensive thing per frame on retina
// displays — UnrealBloomPass alone does 5 extra render-target draws at the
// composer resolution. Default OFF; opt in with ?bloom=1.
function detectLowEnd() {
  try {
    const params = new URLSearchParams(window.location.search);
    const bloom = params.get('bloom');
    if (bloom === '1') return false;
    if (bloom === '0') return true;
    const forced = params.get('lowend');
    if (forced === '1') return true;
    if (forced === '0') return false;
  } catch {}
  return true;
}

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
  _lastCullMs: 0,
  _cullScratch: null,
  _shadowFrame: 0,

  init() {
    const scene = new THREE.Scene();

    const fogColor = new THREE.Color(0x8a9a8a);
    // Default to daylight fog density; DayNight overrides each frame.
    const fog = new THREE.FogExp2(fogColor.getHex(), 0.0015);
    scene.fog = fog;
    // DayNight mutates this color each frame — keep as a Color (not a Texture)
    // so `.copy()` from the phase-lerp works.
    scene.background = new THREE.Color(0x8a9a8a);

    // Extended far plane so the (much bigger) 16k-unit world is visible.
    // Far plane must cover the full ~16.5k-unit road; 1200 caused distant
    // terrain and props to clip out long before ChunkManager hid them.
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      32000,
    );
    camera.position.set(0, 2.5, 0);
    camera.lookAt(0, 2.5, -10);

    // Disable antialiasing — dpr cap + tone mapping gives a clean enough
    // image and AA is a big fragment-shader cost on retina screens.
    const dpr = window.devicePixelRatio || 1;
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    // Auto-scale DPR down on very large logical canvases (5K+ retina Macs).
    // Total fragment work scales with (width × height × dpr²). If the canvas
    // is already 1920+ logical px wide, dropping below 1.0 cuts pixel work
    // dramatically with minimal visible impact since we're rendering at the
    // physical screen anyway.
    const w = window.innerWidth;
    const h = window.innerHeight;
    let autoDpr = MAX_PIXEL_RATIO;
    if (w * h > 1920 * 1080) autoDpr = Math.min(autoDpr, 0.85);
    if (w * h > 2560 * 1440) autoDpr = Math.min(autoDpr, 0.75);
    if (w * h > 3200 * 1800) autoDpr = Math.min(autoDpr, 0.6);
    renderer.setPixelRatio(Math.min(dpr, autoDpr));
    renderer.setSize(w, h);
    this._effectiveDpr = Math.min(dpr, autoDpr);
    // Allow disabling shadows entirely with ?shadows=0 — biggest win when GPU
    // bound on retina + integrated GPUs.
    const shadowsOff = (() => {
      try { return new URLSearchParams(window.location.search).get('shadows') === '0'; } catch { return false; }
    })();
    renderer.shadowMap.enabled = !shadowsOff;
    // PCFShadowMap is cheaper than PCFSoftShadowMap; with a small map the
    // moon shadow only acts as a soft AO directly under the player anyway.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    this._shadowsOff = shadowsOff;
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
    moonLight.castShadow = !shadowsOff;
    // Smaller map — 256² is enough at the tight 50u radius the camera covers,
    // and is 16× cheaper to render than the previous 1024² and 4× cheaper
    // than 512². Sample radius blurs the steps.
    moonLight.shadow.mapSize.set(256, 256);
    moonLight.shadow.camera.near = 1;
    moonLight.shadow.camera.far = 140;
    moonLight.shadow.camera.left = -50;
    moonLight.shadow.camera.right = 50;
    moonLight.shadow.camera.top = 50;
    moonLight.shadow.camera.bottom = -50;
    moonLight.shadow.bias = -0.0008;
    moonLight.shadow.normalBias = 0.02;
    moonLight.shadow.radius = 3;
    scene.add(moonLight);

    const moonFill = new THREE.DirectionalLight(0xffb070, 0.12);
    moonFill.position.set(15, 4, 6);
    scene.add(moonFill);

    // --- Post-processing stack -----------------------------------------
    // On low-end hardware (<=4 cores / touch / ?lowend=1) we skip the whole
    // composer — UnrealBloomPass alone does ~5 extra render-target draws at
    // the composer resolution, which is the single most expensive thing
    // per frame on integrated GPUs.

    this.lowEnd = detectLowEnd();

    let composer = null;
    let bloomPass = null;
    if (!this.lowEnd) {
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(this._effectiveDpr);
      composer.setSize(window.innerWidth, window.innerHeight);

      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);

      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.75,
        0.85,
        0.55,
      );
      composer.addPass(bloomPass);

      const vignettePass = new ShaderPass(VignetteShader);
      composer.addPass(vignettePass);
    }

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

  unregisterPointLight(light) {
    if (!light) return;
    const i = this._pointLights.indexOf(light);
    if (i >= 0) this._pointLights.splice(i, 1);
  },

  // Throttled — sub-frame precision isn't necessary for which lanterns glow.
  cullPointLights() {
    if (this._pointLights.length === 0 || !this.camera) return;
    const now = performance.now();
    if (now - this._lastCullMs < CULL_INTERVAL_MS) return;
    this._lastCullMs = now;

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

    // Pre-allocated scratch vec to avoid per-frame GC churn.
    if (!this._cullScratch) this._cullScratch = new THREE.Vector3();
    const wp = this._cullScratch;

    // Partial selection: find the POINT_LIGHT_BUDGET nearest without a full sort.
    const nearest = [];
    for (const l of entries) {
      if (!l.parent) continue;
      l.getWorldPosition(wp);
      const d = wp.distanceToSquared(cam);
      if (nearest.length < POINT_LIGHT_BUDGET) {
        nearest.push({ l, d });
        continue;
      }
      let worstIdx = 0;
      for (let i = 1; i < nearest.length; i++) {
        if (nearest[i].d > nearest[worstIdx].d) worstIdx = i;
      }
      if (d < nearest[worstIdx].d) nearest[worstIdx] = { l, d };
    }
    const kept = new Set(nearest.map((n) => n.l));
    for (const l of entries) {
      if (kept.has(l)) {
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

  // Re-home the moon shadow camera around the player so the 160x160 shadow
  // frustum covers the area the player can actually see. Previously it was
  // fixed at origin (z=0), meaning anywhere past z=±80 got no shadows at all.
  updateShadowFollow(playerPos) {
    if (!this.moonLight || !playerPos) return;
    const dx = playerPos.x;
    const dz = playerPos.z;
    // Keep the same relative moon angle, just translated toward the player.
    this.moonLight.position.set(-35 + dx, 60, -10 + dz);
    this.moonLight.target.position.set(dx, 0, dz);
    this.moonLight.target.updateMatrixWorld();
  },

  render() {
    this.cullPointLights();
    // Refresh the shadow map every 6th frame — the moon moves slowly and
    // nothing else casts shadows, so sub-frame precision is wasted work.
    // (Was every 3rd; halving this cuts shadow draw cost in half.)
    if (this.renderer && !this._shadowsOff) {
      this._shadowFrame = (this._shadowFrame + 1) % 6;
      this.renderer.shadowMap.needsUpdate = this._shadowFrame === 0;
    }
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  },
};
