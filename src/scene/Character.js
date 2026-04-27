import * as THREE from 'three';
import { ModelLoader } from './ModelLoader.js';

// The Lantern Bearer GLB ships in roughly 1-unit-per-meter scale already,
// but Meshy bipeds tend to be a touch tall — tune here to land at ~2 units.
const PLAYER_SCALE = 1.6;

// Walk/run cross-fade thresholds, expressed as fraction of WALK_SPEED.
// Travel passes isMoving and we infer run from sprint state.
const RUN_FADE_TIME = 0.18;
const WALK_FADE_TIME = 0.22;

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.modelGroup = new THREE.Group();
    this.root.add(this.modelGroup);

    this.mixer = null;
    this.actions = null;
    this._currentAction = null;
    this._loaded = false;

    // Lantern light follows the player even before the GLB loads, so the
    // world has its iconic warm bubble immediately.
    this.lanternLight = new THREE.PointLight(0xffb864, 2.6, 16, 1.5);
    this.lanternLight.position.set(0.45, 1.6, 0.1);
    this.root.add(this.lanternLight);
    this._flickerOffset = Math.random() * Math.PI * 2;

    this._tryAttach();
  }

  _tryAttach() {
    if (this._loaded) return;
    const inst = ModelLoader.instantiate('player');
    if (!inst) {
      // Not cached yet — poll briefly.
      ModelLoader.ensure('player')
        .then(() => this._tryAttach())
        .catch((e) => console.warn('[Character] player GLB failed', e));
      return;
    }
    const { root, mixer, actions } = inst;
    root.scale.setScalar(PLAYER_SCALE);
    this.modelGroup.add(root);
    this.mixer = mixer;
    this.actions = actions;
    this._loaded = true;

    // Default to idle (no animation); fall back to walk if no idle clip.
    const init = actions?.walk || actions?.Walking || null;
    if (init) {
      init.reset();
      init.setEffectiveWeight(0);
      init.play();
      this._currentAction = init;
    }
  }

  setVisible(visible) {
    this.root.visible = visible;
  }

  // Pick a clip based on current movement state.
  _pickAction(isMoving, speedHint) {
    if (!this.actions) return null;
    if (!isMoving) return this.actions.walk || null;
    if (speedHint && speedHint > 6 && this.actions.run) return this.actions.run;
    return this.actions.walk || this.actions.run || null;
  }

  _crossFade(target, fade) {
    if (!target || target === this._currentAction) return;
    target.reset();
    target.setEffectiveWeight(1);
    target.play();
    if (this._currentAction) {
      this._currentAction.crossFadeTo(target, fade, false);
    }
    this._currentAction = target;
  }

  update(delta, isMoving, time, speedHint = 0) {
    if (!this._loaded) {
      // Try again — the loader may have just resolved.
      this._tryAttach();
    }

    if (this.mixer) {
      // When stopped we still play the walk clip but at zero weight, so the
      // rig settles in pose 0 (no idle clip in this asset). Toggle weight.
      if (this._currentAction) {
        const targetW = isMoving ? 1 : 0;
        const w = this._currentAction.getEffectiveWeight();
        const next = w + (targetW - w) * Math.min(1, delta * 6);
        this._currentAction.setEffectiveWeight(next);
      }
      const desired = this._pickAction(isMoving, speedHint);
      const fade = (desired === this.actions?.run) ? RUN_FADE_TIME : WALK_FADE_TIME;
      if (desired && desired !== this._currentAction) {
        this._crossFade(desired, fade);
      }
      // Drive mixer faster when sprinting so the run clip looks correct.
      const timeScale = (desired === this.actions?.run) ? 1.15 : 1.0;
      this.mixer.update(delta * timeScale);
    }

    // Lantern flicker — keeps the warm bubble alive in all phases.
    const fl =
      0.85 +
      Math.sin(time * 7.2 + this._flickerOffset) * 0.06 +
      Math.sin(time * 13.3 + this._flickerOffset) * 0.04 +
      (Math.random() - 0.5) * 0.05;
    this.lanternLight.intensity = 2.6 * fl;
  }
}
