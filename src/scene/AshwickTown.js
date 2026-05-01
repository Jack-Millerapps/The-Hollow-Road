import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ChunkManager } from '../game/ChunkManager.js';
import { SceneManager } from './SceneManager.js';
import { MODEL_URLS } from './modelUrls.js';
import { voxelizeMeshCollision } from './glbCollision.js';

export const AshwickWorld = {
  MILL_X: 0,
  MILL_Z: -500,
  GRAVE_X: 80,
  GRAVE_Z: -500,
  PAGE_X: 82,
  PAGE_Z: -498,
};

/** @type {THREE.Object3D | null} */
let _graveMarker = null;
/** @type {THREE.Mesh | null} */
let _tornPage = null;

export function getQuestMeshes() {
  // Quest shrine / bed live in CaveInterior (ancientAshwickCave) — see caves.js.
  return { grave: _graveMarker, page: _tornPage, shrine: null, caveRoot: null };
}

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flatShading ?? true,
    ...opts,
  });
}

export function build(scene, reg) {
  reg.group?.removeFromParent?.();
  reg.group = null;
  reg.millPivot = null;
  reg.millSpinning = false;
  reg.windows = [];
  reg.lanternLights = [];
  reg.forge = null;
  reg.tavernWindowMeshes = [];
  reg._townRoot = null;
  reg._graveRoot = null;

  const townRoot = new THREE.Group();
  townRoot.position.set(0, 0, AshwickWorld.MILL_Z);
  scene.add(townRoot);
  reg.group = townRoot;
  reg._townRoot = townRoot;

  new GLTFLoader().load(MODEL_URLS.Ashwick, (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(20);
    model.rotation.y = Math.PI / 6;
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    if (isFinite(box.min.y)) model.position.y = -box.min.y;
    model.position.y += 0.5;
    model.position.x -= 30;
    townRoot.add(model);
    townRoot.updateMatrixWorld(true);
    voxelizeMeshCollision(model);
  });

  ChunkManager.register(townRoot, 0, AshwickWorld.MILL_Z);

  // --- Grave (quest item) ---
  const graveRoot = new THREE.Group();
  graveRoot.position.set(AshwickWorld.GRAVE_X, 0, AshwickWorld.GRAVE_Z);
  scene.add(graveRoot);
  reg._graveRoot = graveRoot;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.15, 1.1),
    stdMat(0x4a4a4a, { roughness: 1 }),
  );
  slab.position.set(0, 0.08, 0);
  slab.receiveShadow = true;
  graveRoot.add(slab);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.2), stdMat(0x3a3a3a));
  crossV.position.set(0, 0.85, 0);
  graveRoot.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.2), stdMat(0x3a3a3a));
  crossH.position.set(0, 1.25, 0);
  graveRoot.add(crossH);
  _graveMarker = graveRoot;

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x2a4a1a,
    emissive: 0x1a3a0a,
    emissiveIntensity: 0.35,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  for (let g = 0; g < 14; g++) {
    const tuft = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8 + Math.random() * 0.6, 1.2 + Math.random()),
      grassMat,
    );
    const ga = Math.random() * Math.PI * 2;
    const gr = 2 + Math.random() * 5;
    tuft.position.set(Math.cos(ga) * gr, 0.4 + Math.random() * 0.2, Math.sin(ga) * gr);
    tuft.rotation.y = Math.random() * Math.PI;
    graveRoot.add(tuft);
  }
  ChunkManager.register(graveRoot, AshwickWorld.GRAVE_X, AshwickWorld.GRAVE_Z);

  // --- Torn page (quest item) ---
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = 512;
  pageCanvas.height = 256;
  const pctx = pageCanvas.getContext('2d');
  pctx.fillStyle = '#d8c8a8';
  pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
  pctx.fillStyle = '#2a1810';
  pctx.font = '22px Georgia, serif';
  const line =
    'He went to the cave in the hills to the east — the old place they call Ancient Ashwick Cave. He said he heard it singing.';
  const words = line.split(' ');
  let lineY = 40;
  let buf = '';
  for (const w of words) {
    const test = buf ? `${buf} ${w}` : w;
    if (pctx.measureText(test).width > 480) {
      pctx.fillText(buf, 20, lineY);
      lineY += 28;
      buf = w;
    } else {
      buf = test;
    }
  }
  if (buf) pctx.fillText(buf, 20, lineY);

  const pageTex = new THREE.CanvasTexture(pageCanvas);
  const pageMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.75),
    new THREE.MeshStandardMaterial({ map: pageTex, side: THREE.DoubleSide, roughness: 0.9 }),
  );
  pageMesh.position.set(AshwickWorld.PAGE_X, 0.35, AshwickWorld.PAGE_Z);
  pageMesh.rotation.x = -Math.PI / 2 + 0.12;
  pageMesh.rotation.z = 0.15;
  scene.add(pageMesh);
  _tornPage = pageMesh;
  ChunkManager.register(pageMesh, AshwickWorld.PAGE_X, AshwickWorld.PAGE_Z);
}

export function setMillWheelSpinning() {}

export function update() {}
