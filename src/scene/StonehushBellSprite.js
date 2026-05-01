import * as THREE from 'three';
import { state } from '../state.js';
import { QuestSystem } from '../game/QuestSystem.js';
import { DayNight } from './DayNight.js';
import { getBellTexture } from './spriteTextures.js';
import { STONEHUSH_BELL_WORLD } from '../data/stonehushBell.js';
import { ChunkManager } from '../game/ChunkManager.js';

// A small 3D world marker (billboard) to help locate the bell.
export const StonehushBellSprite = {
  sprite: null,
  chunkEntry: null,

  init(scene) {
    if (this.sprite) return;
    const map = getBellTexture();
    map.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      opacity: 0.95,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(STONEHUSH_BELL_WORLD.x, 2.4, STONEHUSH_BELL_WORLD.z);
    s.scale.set(2.35, 2.35, 1);
    s.visible = false;
    s.name = 'stonehush-bell-sprite';
    scene.add(s);
    this.sprite = s;
    this.chunkEntry = ChunkManager.register(s, s.position.x, s.position.z);
  },

  update(timeS) {
    if (!this.sprite) return;

    const q = state.quests?.stonehush;
    const stepId = QuestSystem.currentStep?.('stonehush')?.id ?? null;
    const sceneOk = state.currentScene === 'world' && !!state.flags?.hasLeftWestwind;
    const active = !!q && !q.done && (stepId === 'waitNight' || stepId === 'bellChoice');
    const phase = DayNight.getCurrentPhase?.() ?? 'day';
    const darkEnough = phase === 'night' || phase === 'sunset' || phase === 'sunrise';

    // Only show when the quest needs the bell and it's at least dusk.
    const show = sceneOk && active && darkEnough && !state.dialogueActive;
    this.sprite.visible = show;
    if (!show) return;

    // Gentle pulse.
    const t = timeS || (performance.now() * 0.001);
    const pulse = 0.88 + Math.sin(t * 3.2) * 0.10;
    this.sprite.material.opacity = 0.65 + pulse * 0.35;
    const sc = 2.2 + pulse * 0.25;
    this.sprite.scale.set(sc, sc, 1);

    if (this.chunkEntry) {
      ChunkManager.moveEntryToWorld(this.chunkEntry, this.sprite.position.x, this.sprite.position.z);
    }
  },
};

