import * as THREE from 'three';
import { state, notify } from '../state.js';
import { villages } from '../data/villages.js';
import { TradeSystem } from './TradeSystem.js';
import { RoadEvents } from './RoadEvents.js';
import { Ending } from './Ending.js';
import { Character } from '../scene/Character.js';

const MOVE_SPEED = 0.12;
const ROTATE_SPEED = (2.2 * Math.PI) / 180;
const EVENT_INTERVAL = 36;
const EVENT_CHANCE = 0.42;
const END_Z = -400;

// Third-person chase camera — slightly elevated and pulled back.
const CAMERA_OFFSET = new THREE.Vector3(0, 3.6, 7.4);
const LOOK_OFFSET = new THREE.Vector3(0, 1.55, 0);

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

  init(camera, scene) {
    this.scene = scene;
    this.camera = camera;

    this.player = new THREE.Object3D();
    this.player.position.set(0, 0, 0);
    scene.add(this.player);

    // Create the character and attach it to the player so it inherits
    // position and rotation automatically.
    this.character = new Character();
    this.player.add(this.character.root);

    this.triggered = new Set();
    this.distanceSinceEvent = 0;
    this.paused = false;
    this.keys = new Set();
    this.walkForward = false;
    this._lastTime = performance.now() / 1000;

    // Seed the smoothed camera to its target position.
    const initialOffset = CAMERA_OFFSET.clone().applyQuaternion(this.player.quaternion);
    this._cameraPos.copy(this.player.position).add(initialOffset);
    this._cameraLook.copy(this.player.position).add(LOOK_OFFSET);
    this.camera.position.copy(this._cameraPos);
    this.camera.lookAt(this._cameraLook);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
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
  },

  resume() {
    this.paused = false;
  },

  _updateCamera(delta) {
    if (!this.player || !this.camera) return;
    const offset = CAMERA_OFFSET.clone().applyQuaternion(this.player.quaternion);
    const targetPos = this.player.position.clone().add(offset);
    const targetLook = this.player.position.clone().add(LOOK_OFFSET);

    // Smooth chase for a cinematic feel — exponential lerp with dt.
    const posK = 1 - Math.exp(-delta * 9);
    const lookK = 1 - Math.exp(-delta * 11);
    this._cameraPos.lerp(targetPos, posK);
    this._cameraLook.lerp(targetLook, lookK);

    this.camera.position.copy(this._cameraPos);
    this.camera.lookAt(this._cameraLook);
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
      this._updateCamera(clampedDelta);
      if (this.character) this.character.update(clampedDelta, false, now);
      return;
    }

    const rotLeft = this.keys.has('q') || this.keys.has('arrowleft');
    const rotRight = this.keys.has('e') || this.keys.has('arrowright');
    if (rotLeft) this.player.rotation.y += ROTATE_SPEED;
    if (rotRight) this.player.rotation.y -= ROTATE_SPEED;

    const forwardPressed = this.keys.has('w') || this.walkForward;
    const backPressed = this.keys.has('s');
    const strafeLeftPressed = this.keys.has('a');
    const strafeRightPressed = this.keys.has('d');

    let mx = 0;
    let mz = 0;
    if (forwardPressed) mz -= MOVE_SPEED;
    if (backPressed) mz += MOVE_SPEED;
    if (strafeLeftPressed) mx -= MOVE_SPEED;
    if (strafeRightPressed) mx += MOVE_SPEED;

    const isMoving = mx !== 0 || mz !== 0;

    if (isMoving) {
      const move = new THREE.Vector3(mx, 0, mz);
      move.applyQuaternion(this.player.quaternion);
      this.player.position.x += move.x;
      this.player.position.z += move.z;
      this.distanceSinceEvent += Math.hypot(move.x, move.z);
    }

    if (state.isWalking !== isMoving) {
      state.isWalking = isMoving;
    }

    state.playerPos = { x: this.player.position.x, z: this.player.position.z };
    notify();

    if (this.character) this.character.update(clampedDelta, isMoving, now);

    for (const village of villages) {
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
