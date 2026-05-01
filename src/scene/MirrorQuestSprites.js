import * as THREE from 'three';
import { state } from '../state.js';
import { ChunkManager } from '../game/ChunkManager.js';
import { getMirrorTexture } from './spriteTextures.js';
import { MIRROR_GLASSMAKER_SPOT } from '../data/mirrorTownTargets.js';

function makeSprite(map, x, z, y = 2.25, scale = 2.2, name = 'sprite') {
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

export const MirrorQuestSprites = {
  glassmaker: null,
  chunkEntry: null,

  init(scene) {
    if (this.glassmaker) return;
    const s = makeSprite(
      getMirrorTexture(),
      MIRROR_GLASSMAKER_SPOT.x,
      MIRROR_GLASSMAKER_SPOT.z,
      2.28,
      2.25,
      'mirror-glassmaker-sprite',
    );
    scene.add(s);
    this.glassmaker = s;
    this.chunkEntry = ChunkManager.register(s, s.position.x, s.position.z);
  },

  update(timeS) {
    if (!this.glassmaker) return;
    const t = timeS || performance.now() * 0.001;

    const q = state.quests?.mirrorTown;
    const sceneOk = state.currentScene === 'world' && !!state.flags?.hasLeftWestwind;
    const active = sceneOk && !!q && !q.done && !state.dialogueActive;

    this.glassmaker.visible = active;

    if (this.glassmaker.visible) {
      const pulse = 0.88 + Math.sin(t * 3.0) * 0.1;
      const op = 0.65 + pulse * 0.35;
      const sc = 2.15 + pulse * 0.22;
      this.glassmaker.material.opacity = op;
      this.glassmaker.scale.set(sc, sc, 1);
    }

    if (this.chunkEntry) {
      ChunkManager.moveEntryToWorld(
        this.chunkEntry,
        this.glassmaker.position.x,
        this.glassmaker.position.z,
      );
    }
  },
};
