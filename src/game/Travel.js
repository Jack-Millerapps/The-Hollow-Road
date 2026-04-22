import { state, notify } from '../state.js';
import { villages } from '../data/villages.js';
import { TradeSystem } from './TradeSystem.js';
import { RoadEvents } from './RoadEvents.js';
import { Ending } from './Ending.js';

const WALK_SPEED = 0.12; // units per 60fps-frame
const ZONE_RADIUS = 2;
const EVENT_INTERVAL = 40;
const EVENT_CHANCE = 0.4;
const END_Z = -500;

export const Travel = {
  camera: null,
  triggered: new Set(),
  distanceSinceEvent: 0,
  paused: false,
  keyHeld: false,
  buttonHeld: false,

  init(camera) {
    this.camera = camera;
    this.triggered = new Set();
    this.distanceSinceEvent = 0;
    this.paused = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'w' || e.key === 'W') {
        this.keyHeld = true;
        this.updateWalking();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'w' || e.key === 'W') {
        this.keyHeld = false;
        this.updateWalking();
      }
    });
    window.addEventListener('blur', () => {
      this.keyHeld = false;
      this.buttonHeld = false;
      this.updateWalking();
    });
  },

  setButtonHeld(held) {
    this.buttonHeld = held;
    this.updateWalking();
  },

  updateWalking() {
    const walking = !this.paused && (this.keyHeld || this.buttonHeld);
    if (walking !== state.isWalking) {
      state.isWalking = walking;
      notify();
    }
  },

  pause() {
    this.paused = true;
    this.updateWalking();
  },

  resume() {
    this.paused = false;
    this.updateWalking();
  },

  update(delta) {
    if (!this.camera) return;
    if (this.paused) return;
    if (state.flags.endingStarted) return;

    if (state.isWalking) {
      const frameDelta = delta * 60;
      const step = WALK_SPEED * frameDelta;
      this.camera.position.z -= step;
      state.cameraZ = this.camera.position.z;
      this.distanceSinceEvent += step;
    }

    // Check village trigger zones
    for (const village of villages) {
      if (this.triggered.has(village.name)) continue;
      if (state.tradeComplete[village.name]) {
        this.triggered.add(village.name);
        continue;
      }
      if (Math.abs(this.camera.position.z - village.triggerZ) < ZONE_RADIUS) {
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
        return;
      }
    }

    // Road events
    if (this.distanceSinceEvent >= EVENT_INTERVAL) {
      this.distanceSinceEvent = 0;
      if (Math.random() < EVENT_CHANCE) {
        this.pause();
        RoadEvents.trigger(() => {
          this.resume();
        });
        return;
      }
    }

    // Ending trigger
    if (this.camera.position.z <= END_Z && !state.flags.endingStarted) {
      this.pause();
      Ending.begin();
    }
  },
};
