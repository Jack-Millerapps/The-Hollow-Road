import * as THREE from 'three';
import { caves, CAVE_TRIGGER_RADIUS } from '../data/caves.js';
import { Collision } from '../game/Collision.js';

// Phase 3 — for each cave in caves.js we build a small overworld landmark:
// two angled boulders forming an arch, a black "void" behind, two amber
// torches flanking the opening, a wooden signpost carved with the cave's
// name, and a faint warm glow 5 units deep into the void.
//
// The module also owns the "Press E to enter …" prompt and exposes the
// interaction handshake used by main.js.

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------

const BOULDER_MAT = new THREE.MeshStandardMaterial({
  color: 0x3a3630,
  roughness: 0.95,
  metalness: 0.0,
  flatShading: true,
});

const VOID_MAT = new THREE.MeshBasicMaterial({
  color: 0x000000,
  side: THREE.FrontSide,
});

const TORCH_HEAD_MAT = new THREE.MeshStandardMaterial({
  color: 0xff6a1a,
  emissive: 0xff7a2a,
  emissiveIntensity: 1.1,
  roughness: 0.6,
});

const TORCH_HANDLE_MAT = new THREE.MeshStandardMaterial({
  color: 0x2a1a10,
  roughness: 0.9,
});

const POST_MAT = new THREE.MeshStandardMaterial({
  color: 0x3a2a18,
  roughness: 0.95,
});

// ---------------------------------------------------------------------------
// Signpost canvas texture
// ---------------------------------------------------------------------------

function makeSignTexture(caveName) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a3620';
  ctx.fillRect(0, 0, 256, 128);
  // grain lines
  ctx.strokeStyle = 'rgba(28, 16, 6, 0.45)';
  ctx.lineWidth = 1;
  for (let y = 6; y < 128; y += 9) {
    ctx.beginPath();
    ctx.moveTo(0, y + (Math.random() - 0.5) * 2);
    ctx.lineTo(256, y + (Math.random() - 0.5) * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#e9d4a8';
  ctx.font = 'italic 26px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(caveName, 128, 66);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.strokeRect(8, 8, 240, 112);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Single-entrance builder
// ---------------------------------------------------------------------------

function buildEntrance(cave) {
  const group = new THREE.Group();
  group.name = `caveEntrance:${cave.id}`;
  group.position.set(cave.position.x, 0, cave.position.z);
  if (typeof cave.entranceRotationY === 'number') {
    group.rotation.y = cave.entranceRotationY;
  }

  // Face the player: entrances face "road-ward" (toward z=0 axis roughly).
  // We just let them face +Z (player is usually approaching from road).
  // The facing axis is +Z for the whole build (torches to either side in X).

  // Two angled boulders forming the arch.
  const leftBoulder = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 5.4, 2.0),
    BOULDER_MAT,
  );
  leftBoulder.position.set(-1.9, 2.5, 0);
  leftBoulder.rotation.z = 0.28;
  leftBoulder.rotation.y = 0.1;
  leftBoulder.castShadow = true;
  leftBoulder.receiveShadow = true;

  const rightBoulder = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 5.4, 2.0),
    BOULDER_MAT,
  );
  rightBoulder.position.set(1.9, 2.5, 0);
  rightBoulder.rotation.z = -0.28;
  rightBoulder.rotation.y = -0.1;
  rightBoulder.castShadow = true;
  rightBoulder.receiveShadow = true;

  const capstone = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 1.6, 2.2),
    BOULDER_MAT,
  );
  capstone.position.set(0, 5.1, 0.05);
  capstone.rotation.z = 0.05;
  capstone.castShadow = true;

  group.add(leftBoulder, rightBoulder, capstone);

  // Dark void "interior" — a black plane that fills the arch opening.
  const voidPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.4), VOID_MAT);
  voidPlane.position.set(0, 2.2, -0.6);
  voidPlane.rotation.y = Math.PI; // face outward (visible from +Z side)
  group.add(voidPlane);

  // Subtle warm glow 5 units deep into the void — visible only near the mouth.
  const innerGlow = new THREE.PointLight(0xffaa55, 0.9, 10, 1.8);
  innerGlow.position.set(0, 2.0, -5.0);
  group.add(innerGlow);

  // Ashwick story cave — extra beacon so it reads from the road east of town.
  if (cave.id === 'ashCave') {
    const beacon = new THREE.PointLight(0xffc080, 1.35, 32, 1.85);
    beacon.position.set(0, 7.5, 1.2);
    group.add(beacon);
    innerGlow.intensity = 1.35;
    innerGlow.distance = 14;
  }

  // Flanking torches.
  for (const side of [-1, 1]) {
    const torchGroup = new THREE.Group();
    torchGroup.position.set(side * 3.0, 0, 0.9);

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.09, 2.4, 8),
      TORCH_HANDLE_MAT,
    );
    handle.position.y = 1.2;
    handle.castShadow = true;
    torchGroup.add(handle);

    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 10),
      TORCH_HEAD_MAT,
    );
    flame.position.y = 2.45;
    flame.scale.set(1, 1.35, 1);
    torchGroup.add(flame);

    const torchLight = new THREE.PointLight(0xffa85a, 1.4, 9, 2.0);
    torchLight.position.set(0, 2.5, 0);
    torchGroup.add(torchLight);

    // Store references for flicker animation.
    torchGroup.userData.flame = flame;
    torchGroup.userData.light = torchLight;
    torchGroup.userData.flickerSeed = Math.random() * 10;
    group.userData.torches = group.userData.torches || [];
    group.userData.torches.push(torchGroup);

    group.add(torchGroup);
  }

  // Signpost.
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8),
    POST_MAT,
  );
  post.position.set(-4.6, 0.9, 1.4);
  post.castShadow = true;
  group.add(post);

  const signGeom = new THREE.PlaneGeometry(1.8, 0.9);
  const signMat = new THREE.MeshStandardMaterial({
    map: makeSignTexture(cave.name),
    roughness: 0.9,
  });
  const sign = new THREE.Mesh(signGeom, signMat);
  sign.position.set(-4.2, 1.6, 1.4);
  sign.rotation.y = Math.PI * 0.18;
  group.add(sign);
  // Back side of the sign — plain wood so it doesn't read as transparent.
  const signBack = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.95 }),
  );
  signBack.position.copy(sign.position);
  signBack.position.z -= 0.002;
  signBack.rotation.y = sign.rotation.y + Math.PI;
  group.add(signBack);

  // A worn stone threshold at the foot of the arch.
  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.18, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 1.0 }),
  );
  threshold.position.set(0, 0.09, 0.4);
  threshold.receiveShadow = true;
  group.add(threshold);

  group.userData.cave = cave;
  return group;
}

function rotateFlatXZ(lx, lz, rotY) {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return { x: lx * c - lz * s, z: lx * s + lz * c };
}

// ---------------------------------------------------------------------------
// Prompt element
// ---------------------------------------------------------------------------

function makePrompt() {
  const el = document.createElement('div');
  el.className = 'cave-prompt';
  el.style.cssText = [
    'position: fixed',
    'bottom: 150px',
    'left: 50%',
    'transform: translateX(-50%)',
    'padding: 8px 18px',
    'background: rgba(13, 10, 6, 0.88)',
    'border: 1px solid #3a2e1a',
    'border-radius: 999px',
    'color: #c8903a',
    'font-family: Georgia, serif',
    'font-size: 13px',
    'font-variant: small-caps',
    'letter-spacing: 0.22em',
    'z-index: 25',
    'opacity: 0',
    'transition: opacity 0.25s ease',
    'pointer-events: none',
  ].join(';');
  const root = document.getElementById('ui-root') || document.body;
  root.appendChild(el);
  return el;
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const CaveEntrance = {
  group: null, // parent group containing every entrance in the world
  entries: [], // { cave, mesh }
  prompt: null,
  activeCave: null,
  onEnter: null, // callback(caveId) set by main.js

  build(scene) {
    if (this.group) return;
    const parent = new THREE.Group();
    parent.name = 'caveEntrances';
    this.entries = [];
    for (const cave of caves) {
      const mesh = buildEntrance(cave);
      parent.add(mesh);
      this.entries.push({ cave, mesh });
      // Flanking boulder colliders — rotate with entrance so they match the mesh.
      const rot = cave.entranceRotationY ?? 0;
      const oL = rotateFlatXZ(-1.9, 0, rot);
      const oR = rotateFlatXZ(1.9, 0, rot);
      Collision.addCircle(cave.position.x + oL.x, cave.position.z + oL.z, 1.2);
      Collision.addCircle(cave.position.x + oR.x, cave.position.z + oR.z, 1.2);
    }
    scene.add(parent);
    this.group = parent;

    if (!this.prompt) this.prompt = makePrompt();

    window.addEventListener('keydown', (e) => {
      if (!this.activeCave) return;
      if (e.key === 'e' || e.key === 'E') {
        const cave = this.activeCave;
        if (typeof this.onEnter === 'function') {
          this.onEnter(cave.id);
        }
      }
    });
  },

  setOnEnter(fn) {
    this.onEnter = fn;
  },

  setVisible(v) {
    if (this.group) this.group.visible = !!v;
    if (!v) this._clearPrompt();
  },

  _clearPrompt() {
    this.activeCave = null;
    if (this.prompt) this.prompt.style.opacity = '0';
  },

  // Called by Travel each frame when in the world scene.
  update(playerPos, t) {
    if (!this.group || !this.group.visible) {
      this._clearPrompt();
      return;
    }
    // Torch flicker — caves are scattered along a 16k route; only update
    // entrances within visual range of the player.
    const rangeSq = 160 * 160;
    for (const { mesh, cave } of this.entries) {
      const dxm = cave.position.x - playerPos.x;
      const dzm = cave.position.z - playerPos.z;
      if (dxm * dxm + dzm * dzm > rangeSq) continue;
      const torches = mesh.userData.torches || [];
      for (const torch of torches) {
        const seed = torch.userData.flickerSeed || 0;
        const f = 0.85 + 0.15 * Math.sin(t * 9 + seed) + 0.1 * Math.sin(t * 17 + seed);
        torch.userData.light.intensity = 1.1 + f * 0.5;
        torch.userData.flame.scale.set(1, 1.2 + f * 0.25, 1);
      }
    }

    let nearest = null;
    let nearestDist = Infinity;
    for (const { cave } of this.entries) {
      const dx = playerPos.x - cave.position.x;
      const dz = playerPos.z - cave.position.z;
      const dist = Math.hypot(dx, dz);
      const triggerR = cave.triggerRadius ?? CAVE_TRIGGER_RADIUS;
      if (dist < triggerR && dist < nearestDist) {
        nearest = cave;
        nearestDist = dist;
      }
    }

    if (nearest) {
      if (this.activeCave?.id !== nearest.id) {
        this.activeCave = nearest;
        if (this.prompt) {
          this.prompt.textContent = `Press E to enter ${nearest.name}`;
          this.prompt.style.opacity = '1';
        }
      }
    } else if (this.activeCave) {
      this._clearPrompt();
    }
  },
};
