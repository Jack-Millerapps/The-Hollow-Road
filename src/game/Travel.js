import * as THREE from 'three';
import { state, notify } from '../state.js';
import { villages } from '../data/villages.js';
import { TradeSystem } from './TradeSystem.js';
import { RoadEvents } from './RoadEvents.js';
import { Ending } from './Ending.js';
import { Character } from '../scene/Character.js';
import { isWithinRoadDistance } from './Goblins.js';
import { VeilWander } from './VeilWander.js';
import { FriendNPCs } from './FriendNPCs.js';
import { FirstNightWarning } from '../ui/FirstNightWarning.js';
import { DayNight } from '../scene/DayNight.js';
import { Collision } from './Collision.js';
import { PauseManager } from './PauseManager.js';

const PLAYER_RADIUS = 0.5;

const WALK_SPEED = 6.0;
const SPRINT_SPEED = 13.5;
const CAVE_SPEED = 4.0;
const SPRINT_DRAIN = 0.25;
const SPRINT_REGEN = 0.34;
const SPRINT_GRACE = 0.2;

// Mouse-look tuning
const MOUSE_SENS_X = 0.0022;
const MOUSE_SENS_Y = 0.0022;
const PITCH_LIMIT = (60 * Math.PI) / 180;

const EVENT_INTERVAL = 42;
const EVENT_CHANCE = 0.34;
const ROAD_LATERAL_LIMIT = 10;

// Fix 5 — gravity and jump tuning.
const GRAVITY = -18; // u/s²
const JUMP_FORCE = 7; // u/s
const DEFAULT_GROUND_Y = 0;
const EYE_HEIGHT = 1.7;

// Fix 7 — camera FOV tuning.
const FOV_WALK = 50;
const FOV_SPRINT = 55;

const CAMERA_OFFSET = new THREE.Vector3(0, 3.6, 7.4);
const LOOK_OFFSET = new THREE.Vector3(0, 1.55, 0);

const _scratchOffset = new THREE.Vector3();
const _scratchTargetPos = new THREE.Vector3();
const _scratchTargetLook = new THREE.Vector3();
const _rollQuat = new THREE.Quaternion();
const _rollAxis = new THREE.Vector3(0, 0, 1);

const WESTWIND_EXIT_Z = 470;

// Each gate sits just past a town along the road. The player cannot cross a
// gate (i.e. their z cannot go below `gateZ`) until that town's
// `tradeComplete` flag is set by QuestSystem.complete / TradeSystem.choose.
//
// Ordered north → south so we can pick the first unsatisfied gate ahead of
// the player and use that as the cap.
const TOWN_GATES = [
  { name: 'ashwick', gateZ: -540, displayName: 'Ashwick' },
  { name: 'veilMarket', gateZ: -2545, displayName: 'The Veil Market' },
  { name: 'stonehush', gateZ: -5045, displayName: 'Stonehush' },
  { name: 'deeproot', gateZ: -6045, displayName: 'Deeproot' },
  { name: 'mirrorTown', gateZ: -7840, displayName: 'Mirror Town' },
];

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
  _renderedYaw: 0, // for camera-yaw lerp (Fix 7)
  _lastTime: 0,
  _sprintLocked: false,
  _pitch: 0,
  _yaw: 0,
  _pointerLocked: false,
  _mobileDrag: null,
  _canvas: null,
  _softPrompt: null,
  _softPromptTimer: 0,
  _lastNotifyMs: 0,
  // Ground level — overridden when entering/exiting caves.
  _groundY: DEFAULT_GROUND_Y,
  _lastYawForRoll: 0,
  _cameraRoll: 0,
  _walkCycle: 0,
  // Admin controls
  adminFlying: false,
  adminSpeedMult: 1,

  init(camera, scene, opts = {}) {
    this.scene = scene;
    this.camera = camera;
    this._canvas = opts.canvas || document.querySelector('canvas');

    this.player = new THREE.Object3D();
    const startX = state.playerPos?.x ?? 0;
    const startZ = state.playerPos?.z ?? 500;
    this.player.position.set(startX, this._groundY, startZ);
    this._yaw = state.cameraYaw ?? Math.PI;
    this._pitch = state.cameraPitch ?? 0;
    this._renderedYaw = this._yaw;
    this.player.rotation.y = this._yaw;
    scene.add(this.player);

    this.character = new Character();
    this.player.add(this.character.root);

    // Initial vertical state — player is grounded.
    state.velocityY = 0;
    state.isGrounded = true;

    this.triggered = new Set();
    this.distanceSinceEvent = 0;
    this.paused = false;
    this.keys = new Set();
    this.walkForward = false;
    this._lastTime = performance.now() / 1000;
    this._sprintLocked = false;
    this._lastYawForRoll = this._yaw;
    this._cameraRoll = 0;
    this._walkCycle = 0;

    // Initialize camera FOV.
    if (this.camera && this.camera.fov !== FOV_WALK) {
      this.camera.fov = FOV_WALK;
      this.camera.updateProjectionMatrix();
    }

    this._setCameraFromPlayer();

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this._handleSpecialKey(e);
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

  // Fix 1 — Escape and pause hook. Other panels (inventory, map, quest log,
  // troll trade) consume Escape themselves; if any of those listeners ran
  // first they'll have called preventDefault(), which is our signal to bail.
  _handleSpecialKey(e) {
    if (e.key !== 'Escape') return;
    if (e.defaultPrevented) return;
    // Belt + suspenders: also detect open panels by their DOM markers in
    // case a future panel forgets to preventDefault().
    const otherPanelOpen =
      !!document.querySelector(
        '.panel-backdrop, .inv-backdrop, .troll-backdrop',
      );
    if (otherPanelOpen) return;

    e.preventDefault();
    if (this._pointerLocked) {
      try { document.exitPointerLock?.(); } catch {}
      PauseManager.pause();
    } else if (PauseManager.isPaused()) {
      PauseManager.resume();
    }
  },

  _initPointerLock() {
    if (!this._canvas) return;
    this._canvas.addEventListener('click', () => {
      if (state.currentScene !== 'world' && state.currentScene !== 'cave') return;
      if (this.paused || PauseManager.isPaused()) return;
      if (state.dialogueActive) return;
      if (state.needsPointerRelock) {
        try {
          this._canvas.requestPointerLock?.();
          state.needsPointerRelock = false;
          notify();
        } catch { /* ignore */ }
        return;
      }
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

  // Fix 6 — caves set their floor height when the scene loads. Caves are
  // currently flat at 0; this hook keeps the architecture in place for
  // terrain-mapped floors later.
  setGroundY(y) {
    this._groundY = Number.isFinite(y) ? y : DEFAULT_GROUND_Y;
  },
  resetGroundY() {
    this._groundY = DEFAULT_GROUND_Y;
  },

  getGroundY() {
    return this._groundY;
  },

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
    this._renderedYaw = this._yaw;
    _scratchOffset.copy(CAMERA_OFFSET).applyQuaternion(this.player.quaternion);
    _scratchTargetPos.copy(this.player.position).add(_scratchOffset);
    _scratchTargetLook.copy(this.player.position).add(LOOK_OFFSET);
    _scratchTargetLook.y += Math.tan(this._pitch) * 4;
    this._cameraPos.copy(_scratchTargetPos);
    this._cameraLook.copy(_scratchTargetLook);
    this.camera.position.copy(_scratchTargetPos);
    this.camera.lookAt(_scratchTargetLook);
  },

  // Fix 7 — smooth camera follow with lerped position and yaw, snappier
  // vertical tracking, FOV widening on sprint, walk bob, turn roll,
  // exhausted sprint shake (Prompt D).
  _updateCamera(delta, camOpts = {}) {
    if (!this.player || !this.camera) return;

    const inCave = camOpts.inCave === true;
    const horizDist = camOpts.horizDist ?? 0;
    const movedWalk = camOpts.movedWalk === true;
    const exhausted = (state.stamina ?? 1) < 0.1;

    // Lerp the visible yaw toward the target yaw — gives the camera a touch
    // of lag on quick spins. The player object's rotation still uses the
    // raw target yaw (so movement direction is responsive to input).
    this.player.rotation.y = this._yaw;
    this._renderedYaw += (this._yaw - this._renderedYaw) * 0.12;

    const cosY = Math.cos(this._renderedYaw);
    const sinY = Math.sin(this._renderedYaw);

    // Camera offset rotated by the rendered (lagged) yaw.
    _scratchOffset.set(
      CAMERA_OFFSET.x * cosY + CAMERA_OFFSET.z * sinY,
      CAMERA_OFFSET.y,
      -CAMERA_OFFSET.x * sinY + CAMERA_OFFSET.z * cosY,
    );

    _scratchTargetPos.copy(this.player.position).add(_scratchOffset);
    _scratchTargetLook.copy(this.player.position).add(LOOK_OFFSET);
    _scratchTargetLook.y += Math.tan(this._pitch) * 4;

    // Position lerp factor 0.15 per frame (per the spec).
    this._cameraPos.lerp(_scratchTargetPos, 0.15);
    // Vertical tracking — snappier (0.2/frame) so the camera follows jumps
    // and ground transitions tightly.
    this._cameraPos.y += (_scratchTargetPos.y - this._cameraPos.y) * 0.2;
    this._cameraLook.lerp(_scratchTargetLook, 0.18);

    // Camera occlusion — prevent camera from passing through GLB collision geometry.
    // Ray-march from player eye to ideal camera position; stop at first hit.
    const CAMERA_PROBE = 0.35;
    const eyeX = this.player.position.x;
    const eyeZ = this.player.position.z;
    if (!inCave && Collision.hits(this._cameraPos.x, this._cameraPos.z, CAMERA_PROBE)) {
      const camDX = this._cameraPos.x - eyeX;
      const camDZ = this._cameraPos.z - eyeZ;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) * 0.5;
        const tx = eyeX + camDX * mid;
        const tz = eyeZ + camDZ * mid;
        if (Collision.hits(tx, tz, CAMERA_PROBE)) hi = mid;
        else lo = mid;
      }
      const t = Math.max(0, lo - 0.02);
      this._cameraPos.x = eyeX + camDX * t;
      this._cameraPos.z = eyeZ + camDZ * t;
      // Interpolate y along the same ratio so the camera doesn't float.
      const fullLen = Math.hypot(camDX, camDZ);
      const clampLen = fullLen > 0.001 ? Math.hypot(this._cameraPos.x - eyeX, this._cameraPos.z - eyeZ) / fullLen : 1;
      this._cameraPos.y = this.player.position.y + (_scratchTargetPos.y - this.player.position.y) * clampLen;
    }

    this.camera.position.copy(this._cameraPos);
    this.camera.lookAt(this._cameraLook);

    const dYaw = this._yaw - this._lastYawForRoll;
    this._lastYawForRoll = this._yaw;
    let tiltTarget = 0;
    if (Math.abs(dYaw) > 0.0004) {
      tiltTarget = THREE.MathUtils.clamp(dYaw * 9, -0.04, 0.04);
    }
    this._cameraRoll += (tiltTarget - this._cameraRoll) * 0.1;
    if (Math.abs(dYaw) < 0.00025) {
      this._cameraRoll += (0 - this._cameraRoll) * 0.08;
    }
    if (!inCave) {
      _rollQuat.setFromAxisAngle(_rollAxis, this._cameraRoll);
      this.camera.quaternion.multiply(_rollQuat);
    }

    if (!inCave && movedWalk) {
      this._walkCycle += horizDist * 0.38;
      const bob = Math.sin(this._walkCycle * Math.PI * 2) * 0.04;
      this.camera.position.y += bob;
    }

    if (exhausted && state.isSprinting && !inCave) {
      this.camera.position.x += (Math.random() - 0.5) * 0.02;
      this.camera.position.y += (Math.random() - 0.5) * 0.02;
      this.camera.position.z += (Math.random() - 0.5) * 0.02;
    }

    // FOV — lerp toward target based on sprint state.
    const targetFov = state.isSprinting ? FOV_SPRINT : FOV_WALK;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * 0.08;
      this.camera.updateProjectionMatrix();
    }

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

  // Fix 5 — gravity & jump physics. Runs every frame, regardless of dialogue
  // state (so the player can't hover by opening a panel mid-air).
  _updatePhysics(dt) {
    if (!this.player) return;
    if (this.adminFlying) {
      state.velocityY = 0;
      state.isGrounded = false;
      return;
    }
    // Apply gravity if not grounded.
    if (!state.isGrounded) {
      state.velocityY += GRAVITY * dt;
    }
    let py = this.player.position.y + state.velocityY * dt;
    if (py <= this._groundY) {
      py = this._groundY;
      state.velocityY = 0;
      state.isGrounded = true;
    } else {
      state.isGrounded = false;
    }
    this.player.position.y = py;
  },

  // Fix 5 — Space-bar jump input. Guarded against pause, dialogue, cutscene,
  // and any open tutorial / panel overlay (which use Space to dismiss).
  _consumeJumpInput() {
    if (!state.isGrounded) return;
    if (state.dialogueActive) return;
    if (state.paused || this.paused || PauseManager.isPaused()) return;
    if (state.currentScene === 'cutscene') return;
    if (state.flags.endingStarted) return;
    // Any open backdrop/tutorial consumes Space for "dismiss" — don't double
    // it up with a jump.
    if (
      document.querySelector(
        '.panel-backdrop, .inv-backdrop, .troll-backdrop, .hud-tut-backdrop, .pm-backdrop, .controls-intro, .hr-tutorial-tip',
      )
    ) {
      return;
    }
    // Both ' ' (space) and 'spacebar' have shown up in older browsers.
    if (this.keys.has(' ') || this.keys.has('spacebar')) {
      state.velocityY = JUMP_FORCE;
      state.isGrounded = false;
    }
  },

  update(delta) {
    if (!this.player) return;

    const now = performance.now() / 1000;
    const clampedDelta = Math.min(delta ?? 1 / 60, 1 / 20);

    if (this._softPromptTimer > 0) {
      this._softPromptTimer -= clampedDelta;
      if (this._softPromptTimer <= 0) this._hideSoftPrompt();
    }

    const caveScene = state.currentScene === 'cave';

    if (state.flags.endingStarted) {
      this._updatePhysics(clampedDelta);
      this._updateCamera(clampedDelta, { inCave: caveScene });
      if (this.character) this.character.update(clampedDelta, false, now);
      return;
    }

    if (this.paused || PauseManager.isPaused()) {
      if (state.isSprinting) state.isSprinting = false;
      this._updateStamina(clampedDelta, false);
      this._updatePhysics(clampedDelta);
      this._updateCamera(clampedDelta, { inCave: caveScene });
      if (this.character) this.character.update(clampedDelta, false, now);
      return;
    }

    if (state.dialogueActive) {
      if (state.isSprinting) state.isSprinting = false;
      this._updateStamina(clampedDelta, false);
      this._updatePhysics(clampedDelta);
      if (this._pointerLocked) document.exitPointerLock?.();
      this._updateCamera(clampedDelta, { inCave: caveScene });
      if (this.character) this.character.update(clampedDelta, false, now);
      return;
    }

    // --- Movement input ----------------------------------------------------
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
    const baseSpeed = inCave ? CAVE_SPEED : (canSprint ? SPRINT_SPEED : WALK_SPEED);
    const speed = baseSpeed * (this.adminSpeedMult ?? 1);
    state.isSprinting = canSprint;

    let moved = false;
    let actualDX = 0;
    let actualDZ = 0;
    if (movingInput) {
      const len = Math.hypot(fwd, strafe);
      const nf = fwd / len;
      const ns = strafe / len;
      const step = speed * clampedDelta;
      const sinY = Math.sin(this._yaw);
      const cosY = Math.cos(this._yaw);
      const moveX = ns * step * cosY + nf * step * sinY;
      const moveZ = -ns * step * sinY + nf * step * cosY;

      const useCollision = true; // Fix 6 — enabled in caves too.
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

      actualDX = newX - curX;
      actualDZ = newZ - curZ;
      this.player.position.x = newX;
      this.player.position.z = newZ;
      this.distanceSinceEvent += Math.hypot(actualDX, actualDZ);
      moved = actualDX !== 0 || actualDZ !== 0;
    }

    const camOpts = {
      inCave,
      movedWalk: moved && !canSprint && movingInput,
      horizDist: Math.hypot(actualDX, actualDZ),
    };

    // --- Jump input + gravity ---------------------------------------------
    this._consumeJumpInput();
    this._updatePhysics(clampedDelta);

    // --- Admin fly vertical (Q = down, E = up) ----------------------------
    if (this.adminFlying && this.player) {
      const flySpeed = WALK_SPEED * (this.adminSpeedMult ?? 1);
      if (this.keys.has('e')) this.player.position.y += flySpeed * clampedDelta;
      if (this.keys.has('q')) this.player.position.y -= flySpeed * clampedDelta;
      if (this.player.position.y < this._groundY) this.player.position.y = this._groundY;
    }

    this._updateStamina(clampedDelta, canSprint);
    if (state.isWalking !== moved) state.isWalking = moved;
    if (!state.playerPos) state.playerPos = { x: 0, z: 0 };
    state.playerPos.x = this.player.position.x;
    state.playerPos.z = this.player.position.z;

    // --- Westwind exit gate ------------------------------------------------
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
        state.flags.hasLeftWestwind = true;
        state.timePaused = false;
        if (state.flags.leg1Complete) {
          DayNight.setStartPhase('night');
          FirstNightWarning.maybeShow();
        } else {
          DayNight.setStartPhase('day');
        }
        notify();
      }
    }

    // --- Per-town quest gates --------------------------------------------
    // Each gate is just south of its town. Until the town's quest/trade is
    // finished (state.tradeComplete[name] === true) the player gets shoved
    // back to gateZ + small offset and a prompt nudges them to finish up.
    if (!inCave && !state.flags.endingStarted) {
      for (const gate of TOWN_GATES) {
        if (state.tradeComplete?.[gate.name]) continue;
        if (this.player.position.z < gate.gateZ) {
          this.player.position.z = gate.gateZ + 1.5;
          state.playerPos.z = this.player.position.z;
          this._showSoftPrompt(
            `Finish your business in ${gate.displayName} before walking on.`,
          );
          break;
        }
      }
    }

    // --- Off-road tracker -------------------------------------------------
    if (inCave) {
      state.offRoad = false;
    } else {
      state.offRoad = !isWithinRoadDistance(
        this.player.position.x,
        this.player.position.z,
        ROAD_LATERAL_LIMIT,
      );
    }

    const nowMs = now * 1000;
    if (nowMs - this._lastNotifyMs > 100) {
      this._lastNotifyMs = nowMs;
      notify();
    }
    if (this.character) this.character.update(clampedDelta, moved, now);

    if (inCave) {
      this._updateCamera(clampedDelta, camOpts);
      return;
    }

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
      this._updateCamera(clampedDelta, camOpts);
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
      // Ashwick: don't trigger trade until player reaches the town's z-level
      // (prevents the quest from firing while still approaching from the north).
      const pastTownZ = village.name !== 'ashwick' || this.player.position.z <= village.position.z + 2;
      if (dist < village.radius && pastTownZ) {
        this.triggered.add(village.name);
        if (village.name === 'ashwick' && !state.flags.leg1Complete) {
          RoadEvents.markLeg1Complete();
        }
        this.pause();
        state.currentVillage = village.name;
        notify();
        TradeSystem.startTrade(village, () => {
          state.currentVillage = null;
          this.distanceSinceEvent = 0;
          this.resume();
          notify();
        });
        this._updateCamera(clampedDelta, camOpts);
        return;
      }
    }

    if (this.distanceSinceEvent >= EVENT_INTERVAL) {
      this.distanceSinceEvent = 0;
      if (Math.random() < EVENT_CHANCE) {
        RoadEvents.tryBeginEvent(
          { x: this.player.position.x, z: this.player.position.z },
          this._yaw,
          () => {
            this.distanceSinceEvent = 0;
          },
        );
      }
    }

    const END_Z = -14800;
    if (this.player.position.z <= END_Z && !state.flags.endingStarted) {
      this.pause();
      Ending.begin();
    }

    this._updateCamera(clampedDelta, camOpts);
  },
};
