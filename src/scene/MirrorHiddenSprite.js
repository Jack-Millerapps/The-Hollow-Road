import * as THREE from 'three';
import { state } from '../state.js';
import { QuestSystem } from '../game/QuestSystem.js';
import { getMirrorTexture } from './spriteTextures.js';
import { ChunkManager } from '../game/ChunkManager.js';
import { MIRROR_HIDDEN_MIRROR_SPOT } from '../data/mirrorTownTargets.js';

export const MirrorHiddenSprite = {
  sprite: null,
  chunkEntry: null,

  init(scene) {
    if (this.sprite) return;
    const map = getMirrorTexture();
    map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      opacity: 0.95,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(MIRROR_HIDDEN_MIRROR_SPOT.x, 2.25, MIRROR_HIDDEN_MIRROR_SPOT.z);
    s.scale.set(2.2, 2.2, 1);
    s.visible = false;
    s.name = 'mirror-hidden-sprite';
    scene.add(s);
    this.sprite = s;
    this.chunkEntry = ChunkManager.register(s, s.position.x, s.position.z);
  },

  update(timeS) {
    if (!this.sprite) return;
    const q = state.quests?.mirrorTown;
    const stepId = QuestSystem.currentStep?.('mirrorTown')?.id ?? null;
    const sceneOk = state.currentScene === 'world' && !!state.flags?.hasLeftWestwind;
    const show = sceneOk && !!q && !q.done && (stepId === 'guide' || stepId === 'found') && !state.dialogueActive;
    this.sprite.visible = show;
    if (!show) return;
    const t = timeS || (performance.now() * 0.001);
    const pulse = 0.88 + Math.sin(t * 3.1) * 0.10;
    this.sprite.material.opacity = 0.6 + pulse * 0.4;
    const sc = 2.1 + pulse * 0.25;
    this.sprite.scale.set(sc, sc, 1);
    if (this.chunkEntry) {
      ChunkManager.moveEntryToWorld(this.chunkEntry, this.sprite.position.x, this.sprite.position.z);
    }
  },
};

