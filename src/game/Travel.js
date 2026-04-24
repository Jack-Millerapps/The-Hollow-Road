import * as THREE from 'three';
import { state, notify } from '../state.js';
import { villages } from '../data/villages.js';
import { TradeSystem } from './TradeSystem.js';
import { RoadEvents } from './RoadEvents.js';
import { Ending } from './Ending.js';
import { Character } from '../scene/Character.js';
import { distanceToNearestRoad } from './Goblins.js';
import { VeilWander } from './VeilWander.js';

// Phase 2 — time-based movement.
const WALK_SPEED = 1.0; // units per second
const SPRINT_SPEED = 3.0; // units per second
const CAVE_SPEED = 0.7; // Phase 3 — reduced in caves
const SPRINT_DRAIN = 0.25; // stamina per second while sprinting
const SPRINT_REGEN = 0.15; // stamina per second while not sprinting
const SPRINT_GRACE = 0.2; // must exceed this to re-sprint after depletion
const ROTATE_SPEED = 2.2; // radians per second

const EVENT_INTERVAL = 36;
const EVENT_CHANCE = 0.42;
const END_Z = -195; // just past the Unnamed Village at z=-170
const ROAD_LATERAL_LIMIT = 8; // Phase 3 — beyond this, state.offRoad = true

// Third-person chase camera — slightly elevated and pulled back.
const CAMERA_OFFSET = new THREE.Vector3(0, 3.6, 7.4);
const LOOK_OFFSET = new THREE.Vector3(0, 1.55, 0);

// When the player leaves Westwind for the first time we zero gameTime so the
// day/night cycle starts at "noon". Westwind center sits at z=120; we pick a
// threshold a little south of the village signpost.
const WESTWIND_EXIT_Z = 108;

export const Travel = {
  scene: null,
  camera: null,
  player: null,
  character: null,
  triggered: new Set(),
  distanceSinceEvent: 0,
  paused: false,
  keys: new Set(),
  walkForward: false,
  _cameraPos: new THREE.Vector3(),
  _cameraLook: new THREE.Vector3(),
  _lastTime: 0,
  _sprintLocked: false, // true after stamina hits 0; cleared once stamina > SPRINT_GRACE

  init(camera, scene) {
    this.scene = scene;
    this.camera = camera;

    this.player = new THREE.Object3D();
    this.player.position.set(0, 0, 0);
    scene.add(this.player);

    this.character = new Character();
    this.player.add(this.character.root);

    this.triggered = new Set();
    this.distanceSinceEvent = 0;
    this.paused = false;
    this.keys = new Set();
    this.walkForward = false;
    this._lastTime = performance.now() / 1000;
    this._sprintLocked = false;

    const initialOffset = CAMERA_OFFSET.clone().applyQuaternion(this.player.quaternion);
    this._cameraPos.copy(this.player.position).add(initialOffset);
    this._cameraLook.copy(this.player.position).add(LOOK_OFFSET);
    this.camera.position.copy(this._cameraPos);
    this.camera.lookAt(this._cameraLook);

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.walkForward = false;
    });

    state.playerPos = { x: 0, z: 0 };
    notify();
  },

  setButtonHeld(held) {
    this.walkForward = held;
  },

  pause() {
    this.paused = true;
    if (state.isWalking) {
      state.isWalking = false;
      notify();
    }
    if (state.isSprinting) {
      state.isSprinting = false;
    }
  },

  resume() {
    this.paused = false;
  },

  _updateCamera(delta) {
    if (!this.player || !this.camera) return;
    const offset = CAMERA_OFFSET.clone().applyQuaternion(this.player.quaternion);
    const targetPos = this.player.position.clone().add(offset);
    const targetLook = this.player.position.clone().add(LOOK_OFFSET);

    const posK = 1 - Math.exp(-delta * 9);
    const lookK = 1 - Math.exp(-delta * 11);
    this._cameraPos.lerp(targetPos, posK);
    this._cameraLook.lerp(targetLook, lookK);

    this.camera.position.copy(this._cameraPos);
    this.camera.lookAt(this._cameraLook);
  },

  _updateStamina(delta, sprinting) {
    const max = state.maxStamina ?? 1.0;
    if (sprinting) {
      state.stamina = Math.max(0, (state.stamina ?? 0) - SPRINT_DRAIN * delta);
      if (state.stamina <= 0) {
        state.stamina = 0;
        this._sprintLocked = true;
      }
    } else {
      state.stamina = Math.min(max, (state.stamina ?? 0) + SPRINT_REGEN * delta);
      if (this._sprintLocked && state.stamina > SPRINT_GRACE) {
        this._sprintLocked = false;
      }
    }
  },

  update(delta) {
    if (!this.player) return;

    const now = performance.now() / 1000;
    const clampedDelta = Math.min(delta ?? 1 / 60, 1 / 20);

    if (state.flags.endingStarted) {
      this._updateCamera(clampedDelta);
      if (this.character) this.character.update(clampedDelta, false, now);
      return;
    }

    if (this.paused) {
      if (state.isSprinting) state.isSprinting = false;
      this._updateStamina(clampedDelta, false);
      this._updateCamera(clampedDelta);
      if (this.character) this.character.update(clampedDelta, false, now);
      return;
    }

    const rotLeft = this.keys.has('q') || this.keys.has('arrowleft');
    const rotRight = this.keys.has('arrowright');
    if (rotLeft) this.player.rotation.y += ROTATE_SPEED * clampedDelta;
    if (rotRight) this.player.rotation.y -= ROTATE_SPEED * clampedDelta;

    const forwardPressed = this.keys.has('w') || this.walkForward;
    const backPressed = this.keys.has('s');
    const strafeLeftPressed = this.keys.has('a');
    const strafeRightPressed = this.keys.has('d');
    const shiftHeld = this.keys.has('shift');

    let fwd = 0;
    let strafe = 0;
    if (forwardPressed) fwd -= 1;
    if (backPressed) fwd += 1;
    if (strafeLeftPressed) strafe -= 1;
    if (strafeRightPressed) strafe += 1;

    const movingInput = fwd !== 0 || strafe !== 0;

    const inCave = state.currentScene === 'cave';
    const canSprint =
      !inCave &&
      shiftHeld &&
      movingInput &&
      !this._sprintLocked &&
      (state.stamina ?? 0) > 0;
    let speed;
    if (inCave) {
      speed = CAVE_SPEED;
    } else {
      speed = canSprint ? SPRINT_SPEED : WALK_SPEED;
    }
    state.isSprinting = canSprint;

    let moved = false;
    if (movingInput) {
      const len = Math.hypot(fwd, strafe);
      const nf = fwd / len;
      const ns = strafe / len;
      const step = speed * clampedDelta;
      const move = new THREE.Vector3(ns * step, 0, nf * step);
      move.applyQuaternion(this.player.quaternion);
      this.player.position.x += move.x;
      this.player.position.z += move.z;
      this.distanceSinceEvent += Math.hypot(move.x, move.z);
      moved = true;
    }

    this._updateStamina(clampedDelta, canSprint);

    if (state.isWalking !== moved) {
      state.isWalking = moved;
    }

    state.playerPos = { x: this.player.position.x, z: this.player.position.z };

    // First exit from Westwind — clock resets to noon the moment the player
    // crosses south of the signpost.
    if (
      !state.flags.hasLeftWestwind &&
      !inCave &&
      this.player.position.z < WESTWIND_EXIT_Z
    ) {
      state.flags.hasLeftWestwind = true;
      state.gameTime = 0;
    }

    // Phase 3 — off-road tracker used by the goblin system. Only meaningful
    // in the world scene; inside caves we pin it to false.
    if (inCave) {
      state.offRoad = false;
    } else {
      const d = distanceToNearestRoad(
        this.player.position.x,
        this.player.position.z,
      );
      state.offRoad = d > ROAD_LATERAL_LIMIT;
    }

    notify();

    if (this.character) this.character.update(clampedDelta, moved, now);

    // Skip village triggers, random road events and the ending when the
    // player is currently inside a cave scene. Cave interactions use their
    // own proximity + keypress handlers.
    if (inCave) {
      this._updateCamera(clampedDelta);
      return;
    }

    // Phase 4 — the Veil Market is handled separately because it can
    // respawn elsewhere (VeilWander). Check that first.
    if (VeilWander.consumeTradeRequest()) {
      this.pause();
      state.currentVillage = 'veilMarket';
      notify();
      VeilWander.openTradePanel(() => {
        state.currentVillage = null;
        this.distanceSinceEvent = 0;
        this.resume();
        notify();
      });
      this._updateCamera(clampedDelta);
      return;
    }

    for (const village of villages) {
      if (village.placeholder) continue;
      if (village.wandering) continue; // veilMarket handled by VeilWander
      if (this.triggered.has(village.name)) continue;
      if (state.tradeComplete[village.name]) {
        this.triggered.add(village.name);
        continue;
      }
      const dx = this.player.position.x - village.position.x;
      const dz = this.player.position.z - village.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < village.radius) {
        this.triggered.add(village.name);
        this.pause();
        state.currentVillage = village.name;
        notify();
        TradeSystem.startTrade(village, () => {
          state.currentVillage = null;
          this.distanceSinceEvent = 0;
          this.resume();
          notify();
        });
        this._updateCamera(clampedDelta);
        return;
      }
    }

    if (this.distanceSinceEvent >= EVENT_INTERVAL) {
      this.distanceSinceEvent = 0;
      if (Math.random() < EVENT_CHANCE) {
        this.pause();
        RoadEvents.trigger(() => this.resume());
        this._updateCamera(clampedDelta);
        return;
      }
    }

    if (this.player.position.z <= END_Z && !state.flags.endingStarted) {
      this.pause();
      Ending.begin();
    }

    this._updateCamera(clampedDelta);
  },
};
