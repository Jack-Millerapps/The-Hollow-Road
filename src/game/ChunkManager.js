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
//   1. Chunk pass — sets chunk.visible based on distance + facing.
//      - Load: chunk is active if it falls inside LOAD_RADIUS of the player
//        OR of a point shifted forward (LOOKAHEAD) so content streams in
//        before it enters the camera frustum (reduces pop-in / hitches).
//      - Unload: uses player position; chunks *behind* the view direction
//        keep a larger UNLOAD_BEHIND radius so turning around does not reveal
//        empty space; chunks *ahead* use a tighter UNLOAD_AHEAD to save work.
//   2. Frustum pass — for each object in an active chunk, hide it if its
//      world bounding sphere falls outside the camera frustum.
//
// Object visibility is the AND of (chunk active) and (in frustum).
// ---------------------------------------------------------------------------

export const CHUNK_SIZE = 500;
export const LOAD_RADIUS = 1600;
/** Extra world-units forward (along camera yaw) for the second load anchor. */
export const LOAD_LOOKAHEAD = 720;
/** Unload when past this distance from player — ahead of facing (deg > 0). */
export const UNLOAD_AHEAD = 2200;
/** Unload when past this distance — behind facing; larger so trail stays hot. */
export const UNLOAD_BEHIND = 3600;
/** Legacy single radius — used only when yaw is omitted (symmetric fallback). */
export const UNLOAD_RADIUS = UNLOAD_AHEAD;

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
  LOAD_LOOKAHEAD,
  UNLOAD_AHEAD,
  UNLOAD_BEHIND,
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
  // `yaw` — player / camera yaw on Y (radians), same as Travel / state.cameraYaw.
  // When omitted, unload uses UNLOAD_AHEAD for all directions (symmetric).
  update(playerX, playerZ, yaw = null) {
    const camera = this.camera;
    const loadSq = LOAD_RADIUS * LOAD_RADIUS;
    const hasYaw = Number.isFinite(yaw);
    let fwdX = 0;
    let fwdZ = -1;
    let lx = playerX;
    let lz = playerZ;
    if (hasYaw) {
      // Match Travel.js facing: local -Z in XZ is (-sin(yaw), -cos(yaw)).
      fwdX = -Math.sin(yaw);
      fwdZ = -Math.cos(yaw);
      lx = playerX + fwdX * LOAD_LOOKAHEAD;
      lz = playerZ + fwdZ * LOAD_LOOKAHEAD;
    }
    const unloadAheadSq = UNLOAD_AHEAD * UNLOAD_AHEAD;
    const unloadBehindSq = UNLOAD_BEHIND * UNLOAD_BEHIND;

    if (camera) {
      camera.updateMatrixWorld(true);
    }

    const newActive = new Set();

    // Pass 1 — chunk visibility: dual load anchors + asymmetric unload.
    for (const chunk of chunks.values()) {
      const dx = chunk.centerX - playerX;
      const dz = chunk.centerZ - playerZ;
      const dPlayerSq = dx * dx + dz * dz;

      const dxL = chunk.centerX - lx;
      const dzL = chunk.centerZ - lz;
      const dLookSq = dxL * dxL + dzL * dzL;

      const inLoadBubble = dPlayerSq < loadSq || dLookSq < loadSq;

      const unloadMid = (UNLOAD_AHEAD + UNLOAD_BEHIND) * 0.5;
      const unloadSymSq = unloadMid * unloadMid;
      let unloadSq = unloadSymSq;
      if (hasYaw) {
        const along = dx * fwdX + dz * fwdZ;
        unloadSq = along < 0 ? unloadBehindSq : unloadAheadSq;
      }

      if (inLoadBubble) {
        chunk.setActive(true);
        newActive.add(chunkKey(chunk.cx, chunk.cz));
      } else if (dPlayerSq > unloadSq) {
        chunk.setActive(false);
      } else if (chunk.active) {
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
