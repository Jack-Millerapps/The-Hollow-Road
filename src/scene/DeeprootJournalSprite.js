import * as THREE from 'three';
import { state } from '../state.js';
import { QuestSystem } from '../game/QuestSystem.js';
import { getJournalTexture } from './spriteTextures.js';
import { ChunkManager } from '../game/ChunkManager.js';
import { DEEPROOT_JOURNAL_SPOT } from '../data/deeprootTargets.js';

export const DeeprootJournalSprite = {
  sprite: null,
  chunkEntry: null,

  init(scene) {
    if (this.sprite) return;
    const map = getJournalTexture();
    map.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      opacity: 0.95,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(DEEPROOT_JOURNAL_SPOT.x, 2.2, DEEPROOT_JOURNAL_SPOT.z);
    s.scale.set(2.15, 2.15, 1);
    s.visible = false;
    s.name = 'deeproot-journal-sprite';
    scene.add(s);
    this.sprite = s;
    this.chunkEntry = ChunkManager.register(s, s.position.x, s.position.z);
  },

  update(timeS) {
    if (!this.sprite) return;
    const q = state.quests?.deeproot;
    const stepId = QuestSystem.currentStep?.('deeproot')?.id ?? null;
    const sceneOk = state.currentScene === 'world' && !!state.flags?.hasLeftWestwind;
    const show = sceneOk && !!q && !q.done && stepId === 'journal' && !state.dialogueActive;
    this.sprite.visible = show;
    if (!show) return;

    const t = timeS || (performance.now() * 0.001);
    const pulse = 0.88 + Math.sin(t * 3.0) * 0.10;
    this.sprite.material.opacity = 0.65 + pulse * 0.35;
    const sc = 2.05 + pulse * 0.22;
    this.sprite.scale.set(sc, sc, 1);
    if (this.chunkEntry) {
      ChunkManager.moveEntryToWorld(this.chunkEntry, this.sprite.position.x, this.sprite.position.z);
    }
  },
};

