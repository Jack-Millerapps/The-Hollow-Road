import * as THREE from 'three';

// ---------------------------------------------------------------------------
// ChunkManager — chunked visibility + frustum culling for The Hollow Road.
//
// The world is ~3000 wide × ~16,500 long. Loading every prop and lantern at
// once was the source of the "everything pops in" symptom and the long load.
// ChunkManager partitions the world into 500×500 cells. Each registered
// object lives in exactly one chunk and is shown/hidden as the player moves.
//
// Per-frame, two passes run:
//   1. Chunk pass — sets chunk.visible based on distance to player.
//      Inside  LOAD_RADIUS  → chunk visible
//      Outside UNLOAD_RADIUS → chunk hidden
//   2. Frustum pass — for each object in an active chunk, hide it if its
//      world bounding sphere falls outside the camera frustum.
//
// Object visibility is the AND of (chunk active) and (in frustum).
// ---------------------------------------------------------------------------

export const CHUNK_SIZE = 500;
export const LOAD_RADIUS = 1500;
export const UNLOAD_RADIUS = 2000;

const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _objWorldPos = new THREE.Vector3();
const _objSphere = new THREE.Sphere();

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

function chunkCoordsForWorld(x, z) {
  return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.centerX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
    this.centerZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
    this.objects = [];
    this.active = true;
  }

  add(entry) {
    this.objects.push(entry);
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    for (const e of this.objects) {
      // Global entries opt out of distance-based hiding — they stay visible
      // regardless of which chunk the player is standing in.
      if (e.global) continue;
      e.object.visible = active;
    }
  }
}

const chunks = new Map();
const _globalEntries = [];
let _activeKeys = new Set();
// World extents — used to compute total chunk count for diagnostics.
let _minCX = 0;
let _maxCX = 0;
let _minCZ = 0;
let _maxCZ = 0;

function getOrCreateChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  let c = chunks.get(key);
  if (!c) {
    c = new Chunk(cx, cz);
    chunks.set(key, c);
    if (chunks.size === 1) {
      _minCX = _maxCX = cx;
      _minCZ = _maxCZ = cz;
    } else {
      if (cx < _minCX) _minCX = cx;
      if (cx > _maxCX) _maxCX = cx;
      if (cz < _minCZ) _minCZ = cz;
      if (cz > _maxCZ) _maxCZ = cz;
    }
  }
  return c;
}

export const ChunkManager = {
  CHUNK_SIZE,
  LOAD_RADIUS,
  UNLOAD_RADIUS,
  camera: null,

  setCamera(camera) {
    this.camera = camera;
  },

  // Register a Three.js Object3D at world (x, z). The object's `visible`
  // flag is now owned by ChunkManager. options.global = true means the
  // object spans many chunks (e.g. an InstancedMesh of trees over the whole
  // world) — chunk distance hiding is skipped for it; only frustum culling
  // applies (and even that defers to three.js's built-in mesh culling).
  register(object, worldX, worldZ, options = {}) {
    if (!object) return null;
    const [cx, cz] = chunkCoordsForWorld(worldX, worldZ);
    const chunk = getOrCreateChunk(cx, cz);
    const entry = {
      object,
      x: worldX,
      z: worldZ,
      chunk,
      global: !!options.global,
      radius: options.radius || 0,
    };
    chunk.add(entry);
    if (entry.global) _globalEntries.push(entry);
    return entry;
  },

  // Convenience for global/world-spanning meshes.
  registerGlobal(object) {
    return this.register(object, 0, 0, { global: true });
  },

  // Manual deregistration (rarely needed — chunks persist across the run).
  unregister(entry) {
    if (!entry || !entry.chunk) return;
    const arr = entry.chunk.objects;
    const i = arr.indexOf(entry);
    if (i >= 0) arr.splice(i, 1);
  },

  clear() {
    chunks.clear();
    _activeKeys.clear();
    _globalEntries.length = 0;
  },

  // Per-frame update — call BEFORE renderer.render().
  update(playerX, playerZ) {
    const camera = this.camera;
    const loadSq = LOAD_RADIUS * LOAD_RADIUS;
    const unloadSq = UNLOAD_RADIUS * UNLOAD_RADIUS;

    if (camera) {
      camera.updateMatrixWorld(true);
    }

    const newActive = new Set();

    // Pass 1 — chunk visibility based on distance to player.
    for (const chunk of chunks.values()) {
      const dx = chunk.centerX - playerX;
      const dz = chunk.centerZ - playerZ;
      const dSq = dx * dx + dz * dz;

      if (dSq < loadSq) {
        chunk.setActive(true);
        newActive.add(chunkKey(chunk.cx, chunk.cz));
      } else if (dSq > unloadSq) {
        chunk.setActive(false);
      }
      // Between LOAD and UNLOAD: hysteresis band, leave previous state.
      else if (chunk.active) {
        newActive.add(chunkKey(chunk.cx, chunk.cz));
      }
    }

    _activeKeys = newActive;

    // Pass 2 — frustum culling per object in active chunks.
    if (camera) {
      _projScreenMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      _frustum.setFromProjectionMatrix(_projScreenMatrix);

      for (const key of _activeKeys) {
        const chunk = chunks.get(key);
        if (!chunk) continue;
        for (const entry of chunk.objects) {
          const obj = entry.object;
          if (!obj) continue;
          // Global entries (large InstancedMeshes spanning the world) defer
          // to three.js's built-in per-mesh frustum culling. Forcing them
          // through a single bounding sphere here would hide everything when
          // the player faces away from the world's centroid.
          if (entry.global) {
            obj.visible = true;
            continue;
          }
          obj.getWorldPosition(_objWorldPos);
          let radius = 30;
          if (obj.geometry?.boundingSphere) {
            radius = obj.geometry.boundingSphere.radius * obj.scale.x;
          } else if (entry.radius) {
            radius = entry.radius;
          }
          _objSphere.center.copy(_objWorldPos);
          _objSphere.radius = radius;
          const inFrustum = _frustum.intersectsSphere(_objSphere);
          obj.visible = inFrustum;
        }
      }
    }

    // Global entries are skipped in chunk.setActive(), so their visibility is
    // never tied to the chunk's active flag — but the frustum pass above only
    // touches objects in *active* chunks. Re-show globals every frame so a
    // dormant home chunk cannot leave trees/grass invisible.
    for (const entry of _globalEntries) {
      if (entry?.object) entry.object.visible = true;
    }
  },

  getActiveChunks() {
    return Array.from(_activeKeys);
  },

  // Diagnostics — total chunk count for the registered world span.
  totalChunks() {
    if (chunks.size === 0) return 0;
    const xSpan = _maxCX - _minCX + 1;
    const zSpan = _maxCZ - _minCZ + 1;
    return xSpan * zSpan;
  },

  // Diagnostics — extent of the registered area in world units.
  worldExtents() {
    return {
      minX: _minCX * CHUNK_SIZE,
      maxX: (_maxCX + 1) * CHUNK_SIZE,
      minZ: _minCZ * CHUNK_SIZE,
      maxZ: (_maxCZ + 1) * CHUNK_SIZE,
      chunkCount: this.totalChunks(),
      registeredObjects: Array.from(chunks.values()).reduce(
        (n, c) => n + c.objects.length,
        0,
      ),
    };
  },
};
