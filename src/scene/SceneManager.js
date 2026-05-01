import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { state } from '../state.js';

// ---------------------------------------------------------------------------
// Light budget. Only the moon DirectionalLight casts shadows. All PointLights
// register themselves with the budget; each frame the 4 closest to the camera
// stay enabled and the rest are turned off (visible=false / intensity=0).
// ---------------------------------------------------------------------------

const POINT_LIGHT_BUDGET = 4;
// Cap pixel ratio to keep fragment work bounded on retina/hi-dpi screens.
// A dpr of 2 means 4x the pixels of dpr 1; 1.5 cuts that to ~2.25x.
const MAX_PIXEL_RATIO = 1.5;
// Throttle point-light culling — sub-frame precision isn't needed.
const CULL_INTERVAL_MS = 200;

// Low-end detection — skip bloom/vignette on devices that can't spare the
// fragment throughput. Override with ?lowend=1 or ?lowend=0 in the URL.
function detectLowEnd() {
  try {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('lowend');
    if (forced === '1') return true;
    if (forced === '0') return false;
  } catch {}
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  // Touch devices with limited cores/memory almost always benefit.
  const touch = typeof window !== 'undefined' && 'ontouchstart' in window;
  return cores <= 4 || mem <= 4 || touch;
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
  _baseExposure: 1.1,
  _baseBloomStrength: 0.75,

  init() {
    const scene = new THREE.Scene();

    const fogColor = new THREE.Color(0x8a9a8a);
    // Default to daylight fog density; DayNight overrides each frame.
    const fog = new THREE.FogExp2(fogColor.getHex(), 0.0015);
    scene.fog = fog;
    // DayNight mutates this color each frame — keep as a Color (not a Texture)
    // so `.copy()` from the phase-lerp works.
    scene.background = new THREE.Color(0x8a9a8a);

    // Far plane tuned for performance: ChunkManager + fog limit what matters,
    // so we don't need to render the full 16k world length at once.
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      9000,
    );
    camera.position.set(0, 2.5, 0);
    camera.lookAt(0, 2.5, -10);

    // Disable antialiasing on high-density screens — the dpr cap gives us
    // plenty of effective sampling and AA is a big fragment-shader cost.
    const dpr = window.devicePixelRatio || 1;
    const useAA = dpr <= 1;
    const renderer = new THREE.WebGLRenderer({
      antialias: useAA,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(dpr, MAX_PIXEL_RATIO));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    // PCFShadowMap is noticeably cheaper than PCFSoftShadowMap and still
    // readable once the shadow.radius blurs the edges.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
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
    // On low-end hardware (<=4 cores / touch / ?lowend=1) we skip the whole
    // composer — UnrealBloomPass alone does ~5 extra render-target draws at
    // the composer resolution, which is the single most expensive thing
    // per frame on integrated GPUs.

    this.lowEnd = detectLowEnd();

    let composer = null;
    let bloomPass = null;
    if (!this.lowEnd) {
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(Math.min(dpr, MAX_PIXEL_RATIO));
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
    this._baseExposure = renderer.toneMappingExposure;
    this._baseBloomStrength = bloomPass ? bloomPass.strength : 0.75;

    this.fog = fog;
    this.moonLight = moonLight;
    this.moonFill = moonFill;
    this.ambient = ambient;
    this.hemi = hemi;

    return { scene, camera, renderer, fog };
  },

  // Mirror Town is intentionally uncanny/dim. Reduce exposure/bloom while in its zone.
  updateTownLook() {
    if (!this.renderer) return;
    const pos = state.playerPos;
    const inWorld = state.currentScene === 'world' && !!pos;
    let inMirror = false;
    if (inWorld) {
      const dx = (pos.x ?? 0) - 200;
      const dz = (pos.z ?? 0) - -7800;
      inMirror = dx * dx + dz * dz < 120 * 120;
    }
    const targetExposure = inMirror ? 0.82 : this._baseExposure;
    const cur = this.renderer.toneMappingExposure ?? this._baseExposure;
    this.renderer.toneMappingExposure = cur + (targetExposure - cur) * 0.06;

    if (this.bloomPass) {
      const targetBloom = inMirror ? 0.45 : this._baseBloomStrength;
      this.bloomPass.strength = this.bloomPass.strength + (targetBloom - this.bloomPass.strength) * 0.06;
    }
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
    // Refresh the shadow map every 3rd frame — the moon moves slowly and
    // nothing else casts shadows, so sub-frame precision is wasted work.
    if (this.renderer) {
      this._shadowFrame = (this._shadowFrame + 1) % 3;
      this.renderer.shadowMap.needsUpdate = this._shadowFrame === 0;
    }
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  },
};
