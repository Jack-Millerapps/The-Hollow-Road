import * as THREE from 'three';
import { state, notify } from '../state.js';
import { villages } from '../data/villages.js';
import { TradeSystem } from './TradeSystem.js';
import { RoadEvents } from './RoadEvents.js';
import { Ending } from './Ending.js';
import { Character } from '../scene/Character.js';
import { distanceToNearestRoad } from './Goblins.js';
import { VeilWander } from './VeilWander.js';
import { FriendNPCs } from './FriendNPCs.js';
import { FirstNightWarning } from '../ui/FirstNightWarning.js';
import { DayNight } from '../scene/DayNight.js';
import { Collision } from './Collision.js';

const PLAYER_RADIUS = 0.5;

// CHANGE 9 — player speeds and cycle durations
const WALK_SPEED = 4.0;
const SPRINT_SPEED = 9.0;
const CAVE_SPEED = 2.2;
const SPRINT_DRAIN = 0.25;
const SPRINT_REGEN = 0.15;
const SPRINT_GRACE = 0.2;

// Mouse-look tuning
const MOUSE_SENS_X = 0.0022; // rad per px
const MOUSE_SENS_Y = 0.0022;
const PITCH_LIMIT = (60 * Math.PI) / 180;

const EVENT_INTERVAL = 42;
const EVENT_CHANCE = 0.34;
const ROAD_LATERAL_LIMIT = 10;

const CAMERA_OFFSET = new THREE.Vector3(0, 3.6, 7.4);
const LOOK_OFFSET = new THREE.Vector3(0, 1.55, 0);

const WESTWIND_EXIT_Z = 470; // ~30 units south of Westwind centre (z=500), past the signpost

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
  _sprintLocked: false,
  _pitch: 0,
  _yaw: 0,
  _pointerLocked: false,
  _mobileDrag: null, // { lastX, lastY }
  _canvas: null,
  _softPrompt: null,
  _softPromptTimer: 0,

  init(camera, scene, opts = {}) {
    this.scene = scene;
    this.camera = camera;
    this._canvas = opts.canvas || document.querySelector('canvas');

    this.player = new THREE.Object3D();
    const startX = state.playerPos?.x ?? 0;
    const startZ = state.playerPos?.z ?? 500;
    this.player.position.set(startX, 0, startZ);
    this._yaw = state.cameraYaw ?? Math.PI; // facing -Z by default
    this._pitch = state.cameraPitch ?? 0;
    this.player.rotation.y = this._yaw;
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

    this._setCameraFromPlayer();

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.walkForward = false;
    });

    this._initPointerLock();
    this._initMobileDrag();

    state.playerPos = { x: this.player.position.x, z: this.player.position.z };
    notify();
  },

  _initPointerLock() {
    if (!this._canvas) return;
    this._canvas.addEventListener('click', () => {
      if (state.currentScene !== 'world') return;
      if (this.paused) return;
      if (document.pointerLockElement !== this._canvas) {
        this._canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this._pointerLocked = document.pointerLockElement === this._canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this._pointerLocked) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      this._yaw -= dx * MOUSE_SENS_X;
      this._pitch -= dy * MOUSE_SENS_Y;
      if (this._pitch > PITCH_LIMIT) this._pitch = PITCH_LIMIT;
      if (this._pitch < -PITCH_LIMIT) this._pitch = -PITCH_LIMIT;
    });
  },

  _initMobileDrag() {
    if (!this._canvas) return;
    if (!('ontouchstart' in window)) return;
    let lastX = 0;
    let lastY = 0;
    let active = false;
    this._canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      active = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    });
    this._canvas.addEventListener('touchmove', (e) => {
      if (!active || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dx = x - lastX;
      const dy = y - lastY;
      lastX = x;
      lastY = y;
      this._yaw -= dx * MOUSE_SENS_X * 1.4;
      this._pitch -= dy * MOUSE_SENS_Y * 1.4;
      if (this._pitch > PITCH_LIMIT) this._pitch = PITCH_LIMIT;
      if (this._pitch < -PITCH_LIMIT) this._pitch = -PITCH_LIMIT;
    });
    this._canvas.addEventListener('touchend', () => { active = false; });
  },

  setButtonHeld(held) { this.walkForward = held; },

  pause() {
    this.paused = true;
    if (state.isWalking) { state.isWalking = false; notify(); }
    if (state.isSprinting) state.isSprinting = false;
    if (this._pointerLocked) document.exitPointerLock?.();
  },

  resume() { this.paused = false; },

  _setCameraFromPlayer() {
    if (!this.player || !this.camera) return;
    this.player.rotation.y = this._yaw;
    const offset = CAMERA_OFFSET.clone().applyQuaternion(this.player.quaternion);
    const targetPos = this.player.position.clone().add(offset);
    const targetLook = this.player.position.clone().add(LOOK_OFFSET);
    // Apply pitch by nudging the look target up/down based on _pitch.
    targetLook.y += Math.tan(this._pitch) * 4;
    this._cameraPos.copy(targetPos);
    this._cameraLook.copy(targetLook);
    this.camera.position.copy(targetPos);
    this.camera.lookAt(targetLook);
  },

  _updateCamera(delta) {
    if (!this.player || !this.camera) return;
    this.player.rotation.y = this._yaw;
    const offset = CAMERA_OFFSET.clone().applyQuaternion(this.player.quaternion);
    const targetPos = this.player.position.clone().add(offset);
    const targetLook = this.player.position.clone().add(LOOK_OFFSET);
    targetLook.y += Math.tan(this._pitch) * 4;
    const posK = 1 - Math.exp(-delta * 9);
    const lookK = 1 - Math.exp(-delta * 11);
    this._cameraPos.lerp(targetPos, posK);
    this._cameraLook.lerp(targetLook, lookK);
    this.camera.position.copy(this._cameraPos);
    this.camera.lookAt(this._cameraLook);
    state.cameraYaw = this._yaw;
    state.cameraPitch = this._pitch;
  },

  _updateStamina(delta, sprinting) {
    const max = state.maxStamina ?? 1.0;
    if (sprinting) {
      state.stamina = Math.max(0, (state.stamina ?? 0) - SPRINT_DRAIN * delta);
      if (state.stamina <= 0) { state.stamina = 0; this._sprintLocked = true; }
    } else {
      state.stamina = Math.min(max, (state.stamina ?? 0) + SPRINT_REGEN * delta);
      if (this._sprintLocked && state.stamina > SPRINT_GRACE) this._sprintLocked = false;
    }
  },

  _showSoftPrompt(text) {
    if (!this._softPrompt) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'fixed',
        top: '60%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        padding: '14px 22px',
        background: 'rgba(16, 10, 6, 0.92)',
        border: '1px solid rgba(200, 160, 110, 0.5)',
        borderRadius: '4px',
        color: '#ffd79a',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        fontSize: '15px',
        zIndex: '45',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 0.4s ease',
      });
      document.getElementById('ui-root').appendChild(el);
      this._softPrompt = el;
    }
    this._softPrompt.textContent = text;
    this._softPrompt.style.opacity = '1';
    this._softPromptTimer = 3.0;
  },

  _hideSoftPrompt() {
    if (this._softPrompt) this._softPrompt.style.opacity = '0';
  },

  update(delta) {
    if (!this.player) return;

    const now = performance.now() / 1000;
    const clampedDelta = Math.min(delta ?? 1 / 60, 1 / 20);

    if (this._softPromptTimer > 0) {
      this._softPromptTimer -= clampedDelta;
      if (this._softPromptTimer <= 0) this._hideSoftPrompt();
    }

    if (state.flags.endingStarted) {
      this._updateCamera(clampedDelta);
      if (this.character) this.character.update(clampedDelta, false, now);
      return;
    }

    if (this.paused || state.dialogueActive) {
      if (state.isSprinting) state.isSprinting = false;
      this._updateStamina(clampedDelta, false);
      this._updateCamera(clampedDelta);
      if (this.character) this.character.update(clampedDelta, false, now);
      // Release the pointer lock so the UI is clickable without fighting
      // mouselook.
      if (state.dialogueActive && this._pointerLocked) {
        document.exitPointerLock?.();
      }
      return;
    }

    // CHANGE 7 — no more Q/E rotation. WASD relative to camera yaw.
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
      !inCave && shiftHeld && movingInput && !this._sprintLocked &&
      (state.stamina ?? 0) > 0;
    const speed = inCave ? CAVE_SPEED : (canSprint ? SPRINT_SPEED : WALK_SPEED);
    state.isSprinting = canSprint;

    let moved = false;
    if (movingInput) {
      const len = Math.hypot(fwd, strafe);
      const nf = fwd / len;
      const ns = strafe / len;
      const step = speed * clampedDelta;
      const sinY = Math.sin(this._yaw);
      const cosY = Math.cos(this._yaw);
      const moveX = ns * step * cosY + nf * step * sinY;
      const moveZ = -ns * step * sinY + nf * step * cosY;

      // Axis-separated collision: test X and Z independently so the player
      // slides along walls instead of jamming. Colliders are disabled inside
      // caves (CaveInterior builds its own geometry that the player is
      // meant to traverse freely).
      const useCollision = !inCave;
      const curX = this.player.position.x;
      const curZ = this.player.position.z;

      let newX = curX + moveX;
      let newZ = curZ + moveZ;

      if (useCollision) {
        if (moveX !== 0 && Collision.hits(newX, curZ, PLAYER_RADIUS)) {
          newX = curX;
        }
        if (moveZ !== 0 && Collision.hits(newX, newZ, PLAYER_RADIUS)) {
          newZ = curZ;
        }
      }

      const actualDX = newX - curX;
      const actualDZ = newZ - curZ;
      this.player.position.x = newX;
      this.player.position.z = newZ;
      this.distanceSinceEvent += Math.hypot(actualDX, actualDZ);
      moved = actualDX !== 0 || actualDZ !== 0;
    }

    this._updateStamina(clampedDelta, canSprint);
    if (state.isWalking !== moved) state.isWalking = moved;
    state.playerPos = { x: this.player.position.x, z: this.player.position.z };

    // CHANGE 4 / 2 / 6 — crossing south of Westwind for the first time.
    if (!state.flags.hasLeftWestwind && !inCave &&
        this.player.position.z < WESTWIND_EXIT_Z) {
      const missing = FriendNPCs.missingFriend();
      if (!state.flags.friendsArrived) {
        this.player.position.z = WESTWIND_EXIT_Z + 1.5;
        this._showSoftPrompt('Wait — your friends are coming to see you off.');
      } else if (missing) {
        this.player.position.z = WESTWIND_EXIT_Z + 1.5;
        this._showSoftPrompt(
          `You're not ready yet. Talk to ${missing.name} first.`,
        );
      } else {
        // First real exit — start the clock at night, unfreeze, and warn.
        state.flags.hasLeftWestwind = true;
        state.timePaused = false;
        DayNight.setStartPhase('night');
        FirstNightWarning.maybeShow();
        notify();
      }
    }

    // Off-road tracker used by goblins.
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

    if (inCave) { this._updateCamera(clampedDelta); return; }

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
      if (village.wandering) continue;
      if (this.triggered.has(village.name)) continue;
      if (state.tradeComplete[village.name]) { this.triggered.add(village.name); continue; }
      const dx = this.player.position.x - village.position.x;
      const dz = this.player.position.z - village.position.z;
      const dist = Math.hypot(dx, dz);
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

    const END_Z = -14800; // just past the Unnamed Village at z=-14500
    if (this.player.position.z <= END_Z && !state.flags.endingStarted) {
      this.pause();
      Ending.begin();
    }

    this._updateCamera(clampedDelta);
  },
};
