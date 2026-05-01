import * as THREE from 'three';
import { state } from '../state.js';
import { QuestSystem } from '../game/QuestSystem.js';
import { ChunkManager } from '../game/ChunkManager.js';
import { getRootkeeperTexture, getVillagerTexture } from './spriteTextures.js';
import {
  DEEPROOT_ROOTKEEPER_SPOT,
  DEEPROOT_VILLAGER_POSTS,
} from '../data/deeprootTargets.js';

function makeSprite(map, x, z, y = 2.2, scale = 2.15, name = 'sprite') {
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    opacity: 0.95,
  });
  const s = new THREE.Sprite(mat);
  s.position.set(x, y, z);
  s.scale.set(scale, scale, 1);
  s.visible = false;
  s.name = name;
  return s;
}

export const DeeprootQuestSprites = {
  rootkeeper: null,
  villagers: [],
  chunkEntries: [],

  init(scene) {
    if (this.rootkeeper) return;

    const rk = makeSprite(
      getRootkeeperTexture(),
      DEEPROOT_ROOTKEEPER_SPOT.x,
      DEEPROOT_ROOTKEEPER_SPOT.z,
      2.35,
      2.35,
      'deeproot-rootkeeper-sprite',
    );
    scene.add(rk);
    this.rootkeeper = rk;
    this.chunkEntries.push(ChunkManager.register(rk, rk.position.x, rk.position.z));

    const villMap = getVillagerTexture();
    for (let i = 0; i < DEEPROOT_VILLAGER_POSTS.length; i++) {
      const p = DEEPROOT_VILLAGER_POSTS[i];
      const s = makeSprite(villMap, p.x, p.z, 2.2, 2.1, `deeproot-villager-sprite-${i}`);
      scene.add(s);
      this.villagers.push(s);
      this.chunkEntries.push(ChunkManager.register(s, s.position.x, s.position.z));
    }
  },

  update(timeS) {
    if (!this.rootkeeper) return;
    const t = timeS || (performance.now() * 0.001);

    const q = state.quests?.deeproot;
    const stepId = QuestSystem.currentStep?.('deeproot')?.id ?? null;
    const sceneOk = state.currentScene === 'world' && !!state.flags?.hasLeftWestwind;
    const active = sceneOk && !!q && !q.done && !state.dialogueActive;

    const showRootkeeper =
      active && (stepId === 'intro' || stepId === 'choice');
    this.rootkeeper.visible = showRootkeeper;

    const showVillagers = active && stepId === 'villagers';
    const heard = q?.villagerHeard || [false, false, false];
    for (let i = 0; i < this.villagers.length; i++) {
      const s = this.villagers[i];
      const should = showVillagers && !heard[i];
      s.visible = should;
    }

    // Pulse visible sprites.
    const pulse = 0.88 + Math.sin(t * 3.0) * 0.10;
    const op = 0.65 + pulse * 0.35;
    const scA = 2.2 + pulse * 0.22;
    const scB = 2.0 + pulse * 0.18;

    if (this.rootkeeper.visible) {
      this.rootkeeper.material.opacity = op;
      this.rootkeeper.scale.set(scA, scA, 1);
    }
    for (const s of this.villagers) {
      if (!s.visible) continue;
      s.material.opacity = op;
      s.scale.set(scB, scB, 1);
    }

    // Keep ChunkManager updated.
    for (let i = 0; i < this.villagers.length; i++) {
      const s = this.villagers[i];
      const ce = this.chunkEntries[i + 1];
      if (ce) ChunkManager.moveEntryToWorld(ce, s.position.x, s.position.z);
    }
    const ce0 = this.chunkEntries[0];
    if (ce0) ChunkManager.moveEntryToWorld(ce0, this.rootkeeper.position.x, this.rootkeeper.position.z);
  },
};

