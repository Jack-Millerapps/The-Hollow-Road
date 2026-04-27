// ---------------------------------------------------------------------------
// ModelLoader.js — central GLB cache + tier streaming.
//
// API:
//   ModelLoader.preloadCore()                 -> Promise<void>
//   ModelLoader.preloadTier(tierName)         -> Promise<void>
//   ModelLoader.request(key)                  -> Promise<{scene, animations}>
//   ModelLoader.get(key)                      -> {scene, animations} | null
//   ModelLoader.instantiate(key, opts)        -> { root, mixer, actions }
//   ModelLoader.streamByPlayerPos(pos)        -> void  (call ~1 Hz)
//
// Each cached entry is the original GLTF result. instantiate() clones the
// scene (with SkeletonUtils.clone if skinned) so multiple consumers can use
// the same model independently.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MODELS, TOWN_ANCHORS, modelsByTier } from './Models.js';

const skeletonClone = SkeletonUtils.clone.bind(SkeletonUtils);

const _loader = new GLTFLoader();
const _cache = new Map();      // key -> { scene, animations }
const _pending = new Map();    // key -> Promise
const _failed = new Set();     // keys that failed (don't retry every frame)

function loadOne(key) {
  if (_cache.has(key)) return Promise.resolve(_cache.get(key));
  if (_pending.has(key)) return _pending.get(key);
  const def = MODELS[key];
  if (!def) {
    return Promise.reject(new Error(`ModelLoader: unknown key "${key}"`));
  }
  const p = new Promise((resolve, reject) => {
    _loader.load(
      def.path,
      async (gltf) => {
        // Pull additional clips out of separate animation GLBs (Meshy splits
        // walk/run/jump across files using the same skeleton).
        let animations = gltf.animations || [];
        if (Array.isArray(def.extraClips) && def.extraClips.length) {
          for (const url of def.extraClips) {
            try {
              const extra = await new Promise((res, rej) => {
                _loader.load(url, res, undefined, rej);
              });
              if (extra.animations?.length) {
                animations = animations.concat(extra.animations);
              }
            } catch (e) {
              console.warn(`[ModelLoader] extraClip failed: ${url}`, e);
            }
          }
        }
        const entry = { scene: gltf.scene, animations };
        _cache.set(key, entry);
        _pending.delete(key);
        resolve(entry);
      },
      undefined,
      (err) => {
        _failed.add(key);
        _pending.delete(key);
        console.error(`[ModelLoader] failed to load "${key}" @ ${def.path}`, err);
        reject(err);
      },
    );
  });
  _pending.set(key, p);
  return p;
}

function preloadTierByName(tierName) {
  const keys = modelsByTier(tierName);
  return Promise.allSettled(keys.map((k) => loadOne(k))).then(() => {});
}

// Distance² check (cheap, avoids sqrt).
function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

const _triggeredTowns = new Set();
let _streamLastT = 0;

export const ModelLoader = {
  preloadCore() {
    return preloadTierByName('core');
  },

  preloadTier(tierName) {
    return preloadTierByName(tierName);
  },

  request(key) {
    return loadOne(key);
  },

  get(key) {
    return _cache.get(key) || null;
  },

  has(key) {
    return _cache.has(key);
  },

  failed(key) {
    return _failed.has(key);
  },

  // Instantiate a cached model. If not yet loaded, returns null — callers
  // should poll on a subsequent frame or pass a `ready` callback.
  instantiate(key, opts = {}) {
    const entry = _cache.get(key);
    if (!entry) return null;
    const def = MODELS[key];
    const isSkinned = entry.animations.length > 0
      || _hasSkinnedMesh(entry.scene);
    const root = isSkinned ? skeletonClone(entry.scene) : entry.scene.clone(true);
    if (def.scale && def.scale !== 1) root.scale.setScalar(def.scale);
    if (def.yOffset) root.position.y += def.yOffset;
    // Default: enable shadows on every mesh.
    root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    let mixer = null;
    const actions = {};
    if (entry.animations.length && !opts.noMixer) {
      mixer = new THREE.AnimationMixer(root);
      const wantedNames = (opts.animations) || Object.values(def.anims || {});
      for (const clip of entry.animations) {
        const action = mixer.clipAction(clip);
        actions[clip.name] = action;
        // Friendly aliases: walk/run/jump/idle from def.anims.
        if (def.anims) {
          for (const [alias, name] of Object.entries(def.anims)) {
            if (clip.name === name) actions[alias] = action;
          }
        }
        // If the consumer passed a list of wanted clip names, only enable those.
        if (wantedNames.length && !wantedNames.includes(clip.name)) {
          // still cached, but not auto-played
        }
      }
    }
    return { root, mixer, actions, animations: entry.animations };
  },

  // Onload helper: resolve once the given model is cached (or fail after timeout).
  ensure(key, timeoutMs = 30000) {
    if (_cache.has(key)) return Promise.resolve(_cache.get(key));
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const tick = () => {
        if (_cache.has(key)) return resolve(_cache.get(key));
        if (_failed.has(key)) return reject(new Error(`failed ${key}`));
        if (performance.now() - start > timeoutMs) return reject(new Error(`timeout ${key}`));
        // Kick off the load if no one else has yet.
        if (!_pending.has(key)) loadOne(key).catch(() => {});
        setTimeout(tick, 100);
      };
      tick();
    });
  },

  // Called from main.js tick. Throttled internally.
  streamByPlayerPos(pos) {
    const now = performance.now();
    if (now - _streamLastT < 1000) return;
    _streamLastT = now;
    if (!pos) return;
    const px = pos.x ?? 0;
    const pz = pos.z ?? 0;
    for (const [townId, anchor] of Object.entries(TOWN_ANCHORS)) {
      if (_triggeredTowns.has(townId)) continue;
      const d2 = dist2(px, pz, anchor.x, anchor.z);
      const r = anchor.radius || 400;
      if (d2 <= r * r) {
        _triggeredTowns.add(townId);
        preloadTierByName(`town:${townId}`).catch(() => {});
      }
    }
  },
};

function _hasSkinnedMesh(node) {
  let found = false;
  node.traverse((o) => { if (o.isSkinnedMesh) found = true; });
  return found;
}

// Convenience: tween a model in once it's loaded. Returns a Promise<root>.
export function instantiateWhenReady(key, opts) {
  return ModelLoader.ensure(key).then(() => ModelLoader.instantiate(key, opts));
}
