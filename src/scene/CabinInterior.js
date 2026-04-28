import * as THREE from 'three';
import { ModelLoader } from './ModelLoader.js';

// Simple wooden cabin interior. Built as a self-contained group placed far
// from the main world so fog hides the outside. Exposes `origin` (where the
// player should stand) and a `door` Object3D for targeted animations.

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flatShading ?? true,
    ...opts,
  });
}

function emissive(color, emitColor, intensity, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: emitColor,
    emissiveIntensity: intensity,
    roughness: opts.roughness ?? 0.5,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

function makePlankFloor(w, d) {
  const g = new THREE.Group();
  const floorMat = mat(0x3a2411, { roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), floorMat);
  floor.position.y = -0.05;
  floor.receiveShadow = true;
  g.add(floor);
  // Plank lines
  const plankCount = Math.floor(d / 0.6);
  const plankMat = mat(0x2a1608, { roughness: 0.95 });
  for (let i = 0; i < plankCount; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.02, 0.02),
      plankMat,
    );
    plank.position.y = 0.005;
    plank.position.z = -d / 2 + (i + 0.5) * (d / plankCount);
    g.add(plank);
  }
  return g;
}

function makeWall(w, h, thickness, material) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, thickness), material);
  wall.castShadow = true;
  wall.receiveShadow = true;
  return wall;
}

function makeBed() {
  const g = new THREE.Group();
  const frameMat = mat(0x2a1608, { roughness: 0.95 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 1.1), frameMat);
  frame.position.y = 0.15;
  frame.castShadow = true;
  frame.receiveShadow = true;
  g.add(frame);
  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.2, 1.0),
    mat(0x6a5840, { roughness: 0.95 }),
  );
  mattress.position.y = 0.4;
  mattress.castShadow = true;
  g.add(mattress);
  const blanket = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.08, 0.7),
    mat(0x5a2a1a, { roughness: 0.95 }),
  );
  blanket.position.set(0, 0.54, 0.1);
  blanket.castShadow = true;
  g.add(blanket);
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.12, 0.3),
    mat(0xc9ac7a, { roughness: 0.9 }),
  );
  pillow.position.set(-0.7, 0.56, -0.3);
  g.add(pillow);
  // Footboard / headboard uprights
  const post = mat(0x1e0f05, { roughness: 0.95 });
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), post);
      p.position.set(1.05 * dx, 0.4, 0.5 * dz);
      p.castShadow = true;
      g.add(p);
    }
  }
  return g;
}

function makeTableWithCandle() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.06, 0.6),
    mat(0x3a2411, { roughness: 0.85 }),
  );
  top.position.y = 0.62;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  const legMat = mat(0x1e0f05, { roughness: 0.9 });
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.06), legMat);
      leg.position.set(0.38 * dx, 0.31, 0.22 * dz);
      g.add(leg);
    }
  }
  // Candle base
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, 0.04, 10),
    mat(0x5a4022, { metalness: 0.4, roughness: 0.5 }),
  );
  base.position.set(0.15, 0.66, 0);
  g.add(base);
  // Candle stick
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.03, 0.22, 10),
    mat(0xe8d8b0, { roughness: 0.6 }),
  );
  stick.position.set(0.15, 0.78, 0);
  g.add(stick);
  // Flame
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 6),
    emissive(0xffd38a, 0xffaa44, 3.2),
  );
  flame.position.set(0.15, 0.92, 0);
  flame.scale.y = 1.6;
  g.add(flame);
  const flameLight = new THREE.PointLight(0xffb060, 1.1, 5, 2);
  flameLight.position.set(0.15, 0.94, 0);
  g.add(flameLight);

  // Small book on the table
  const book = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.05, 0.2),
    mat(0x3a1a10, { roughness: 0.9 }),
  );
  book.position.set(-0.18, 0.67, 0.05);
  g.add(book);

  g.userData.flame = flame;
  g.userData.flameLight = flameLight;
  return g;
}

function makeChest() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.55, 0.5),
    mat(0x3a2411, { roughness: 0.9 }),
  );
  body.position.y = 0.275;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.1, 0.52),
    mat(0x4a2e18, { roughness: 0.85 }),
  );
  lid.position.y = 0.6;
  g.add(lid);
  // Metal band
  const bandMat = mat(0x1a0f08, { metalness: 0.5, roughness: 0.5 });
  const band1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.53), bandMat);
  band1.position.y = 0.18;
  g.add(band1);
  const band2 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.53), bandMat);
  band2.position.y = 0.42;
  g.add(band2);
  // Lock
  const lock = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.14, 0.06),
    mat(0x6a4626, { metalness: 0.4, roughness: 0.5 }),
  );
  lock.position.set(0, 0.5, 0.28);
  g.add(lock);
  return g;
}

function makeFireplace() {
  const g = new THREE.Group();
  const stoneMat = mat(0x2a2420, { roughness: 1 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.6), stoneMat);
  base.position.y = 0.2;
  g.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.0, 0.3), stoneMat);
  back.position.set(0, 1.2, -0.15);
  g.add(back);
  const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.6), stoneMat);
  leftPost.position.set(-0.75, 0.9, 0);
  g.add(leftPost);
  const rightPost = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.6), stoneMat);
  rightPost.position.set(0.75, 0.9, 0);
  g.add(rightPost);
  const mantle = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.12, 0.7),
    mat(0x3a2411, { roughness: 0.9 }),
  );
  mantle.position.set(0, 1.66, 0);
  g.add(mantle);

  // Glowing logs / embers inside hearth
  const log1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8),
    mat(0x2a1608, { roughness: 0.9 }),
  );
  log1.rotation.z = Math.PI / 2;
  log1.position.set(-0.15, 0.5, 0);
  g.add(log1);
  const log2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8),
    mat(0x3a1a10, { roughness: 0.9 }),
  );
  log2.rotation.z = Math.PI / 2;
  log2.position.set(0.2, 0.62, 0);
  g.add(log2);
  const ember = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 8),
    emissive(0xff7030, 0xff4010, 2.6),
  );
  ember.position.set(0, 0.52, 0);
  ember.scale.set(1.6, 0.55, 0.7);
  g.add(ember);

  const hearthLight = new THREE.PointLight(0xff7a30, 2.0, 10, 2);
  hearthLight.position.set(0, 1.0, 0.3);
  g.add(hearthLight);

  g.userData.ember = ember;
  g.userData.hearthLight = hearthLight;
  return g;
}

export const CabinInterior = {
  group: null,
  origin: new THREE.Vector3(500, 0, 500),
  door: null,
  doorExterior: null,
  hearth: null,
  candle: null,
  flicker: [],

  build(scene) {
    const group = new THREE.Group();
    group.position.copy(this.origin);
    this.group = group;

    // Room dimensions — intentionally larger than a "realistic" cabin so
    // that the third-person camera (which sits ~7.4 units behind the
    // player at y=3.6) still fits inside the walls without clipping.
    // H raised so camera doesn't intersect the ceiling mesh (was the cause
    // of the "half the screen is brown" bug).
    const W = 16;
    const D = 20;
    const H = 5.6;
    const wallThickness = 0.2;
    const wallMat = mat(0x4a2e18, { roughness: 0.95 });

    // Floor
    const floor = makePlankFloor(W, D);
    group.add(floor);

    // Ceiling (dark planks with exposed beams)
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.1, D),
      mat(0x1a0f08, { roughness: 0.95 }),
    );
    ceiling.position.y = H;
    group.add(ceiling);
    const beamCount = 6;
    for (let i = 0; i < beamCount; i++) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(W, 0.18, 0.18),
        mat(0x1a0f08, { roughness: 0.95 }),
      );
      beam.position.set(0, H - 0.12, -D / 2 + (i + 0.5) * (D / beamCount));
      group.add(beam);
    }

    // North wall (back, with window)
    const northMat = wallMat.clone();
    const north = makeWall(W, H, wallThickness, northMat);
    north.position.set(0, H / 2, -D / 2);
    group.add(north);
    // Window cutout — fake by overlaying a dark pane
    const windowFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.0, 0.05),
      mat(0x2a1608, { roughness: 0.85 }),
    );
    windowFrame.position.set(-2.2, 1.8, -D / 2 + 0.12);
    group.add(windowFrame);
    const windowPane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.8),
      new THREE.MeshStandardMaterial({
        color: 0x2a3048,
        emissive: 0x3a4870,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.6,
        roughness: 0.2,
        side: THREE.DoubleSide,
      }),
    );
    windowPane.position.set(-2.2, 1.8, -D / 2 + 0.14);
    group.add(windowPane);
    // Window cross
    for (const horiz of [true, false]) {
      const bar = new THREE.Mesh(
        horiz
          ? new THREE.BoxGeometry(1.2, 0.05, 0.02)
          : new THREE.BoxGeometry(0.05, 0.8, 0.02),
        mat(0x2a1608, { roughness: 0.85 }),
      );
      bar.position.set(-2.2, 1.8, -D / 2 + 0.15);
      group.add(bar);
    }

    // South wall (front, with door opening)
    // Split into left slab, right slab, and a lintel above the door.
    const doorW = 1.3;
    const doorH = 2.2;
    const sideW = (W - doorW) / 2;
    const southLeft = makeWall(sideW, H, wallThickness, wallMat);
    southLeft.position.set(-(doorW / 2 + sideW / 2), H / 2, D / 2);
    group.add(southLeft);
    const southRight = makeWall(sideW, H, wallThickness, wallMat);
    southRight.position.set(doorW / 2 + sideW / 2, H / 2, D / 2);
    group.add(southRight);
    const southTop = makeWall(doorW, H - doorH, wallThickness, wallMat);
    southTop.position.set(0, doorH + (H - doorH) / 2, D / 2);
    group.add(southTop);

    // The door itself — procedural dark wooden plank door.
    const doorGroup = new THREE.Group();
    doorGroup.position.set(0, 0, D / 2 - 0.02);
    const doorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 2.1, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x2a1508, roughness: 0.95, flatShading: true }),
    );
    doorMesh.position.y = 1.05;
    doorGroup.add(doorMesh);
    group.add(doorGroup);
    this.door = doorGroup;

    // East / West walls
    const east = makeWall(D, H, wallThickness, wallMat);
    east.rotation.y = Math.PI / 2;
    east.position.set(W / 2, H / 2, 0);
    group.add(east);
    const west = makeWall(D, H, wallThickness, wallMat);
    west.rotation.y = Math.PI / 2;
    west.position.set(-W / 2, H / 2, 0);
    group.add(west);

    // Furniture
    const bed = makeBed();
    bed.position.set(-W / 2 + 1.6, 0, -D / 2 + 2.2);
    bed.rotation.y = Math.PI / 2;
    group.add(bed);

    // Rolled bedroll on the bed (procedural cylinder).
    const bedrollAnchor = new THREE.Group();
    bedrollAnchor.position.set(-W / 2 + 1.6, 0.6, -D / 2 + 2.2);
    bedrollAnchor.rotation.y = Math.PI / 2;
    bedrollAnchor.scale.setScalar(0.8);
    group.add(bedrollAnchor);
    const bedrollMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.26, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.95, flatShading: true }),
    );
    bedrollMesh.rotation.z = Math.PI / 2;
    bedrollMesh.position.y = 0.26;
    bedrollAnchor.add(bedrollMesh);

    const table = makeTableWithCandle();
    table.position.set(W / 2 - 1.6, 0, -D / 2 + 2.5);
    group.add(table);
    this.candle = table.userData;

    // Brass pocket watch resting on the table.
    const watchAnchor = new THREE.Group();
    watchAnchor.position.set(W / 2 - 1.6, 0.85, -D / 2 + 2.5);
    watchAnchor.scale.setScalar(0.6);
    group.add(watchAnchor);
    ModelLoader.ensure('pocketWatch')
      .then(() => {
        const inst = ModelLoader.instantiate('pocketWatch');
        if (inst) watchAnchor.add(inst.root);
      })
      .catch(() => {});

    const chest = makeChest();
    chest.position.set(W / 2 - 1.3, 0, D / 2 - 2.5);
    chest.rotation.y = -Math.PI / 5;
    group.add(chest);

    const fireplace = makeFireplace();
    fireplace.position.set(0, 0, -D / 2 + 0.3);
    group.add(fireplace);
    this.hearth = fireplace.userData;

    // Rug by the door
    const rug = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.02, 1.4),
      mat(0x5a2a1a, { roughness: 0.95 }),
    );
    rug.position.set(0, 0.01, D / 2 - 2.0);
    group.add(rug);

    // Warm ambient fill just for the interior so it doesn't feel dead when
    // the moonlight doesn't reach inside.
    const interiorFill = new THREE.PointLight(0xffb878, 0.4, 12, 2);
    interiorFill.position.set(0, 2.4, 0);
    group.add(interiorFill);

    scene.add(group);

    // Flicker registry for update()
    this.flicker = [];
    if (this.hearth?.ember) this.flicker.push(this.hearth.ember);
    if (this.candle?.flame) this.flicker.push(this.candle.flame);

    this.hide();
    return group;
  },

  show() {
    if (this.group) this.group.visible = true;
  },

  hide() {
    if (this.group) this.group.visible = false;
  },

  // Player-facing spawn: at the foot of the bed, roughly centered on X,
  // pushed forward enough that the chase camera (7.4u behind, 3.6u up)
  // lands well inside the cabin with no wall clipping. Player faces +Z
  // (the door) so all four walls are visible in frame.
  getPlayerSpawn() {
    return {
      position: { x: this.origin.x, z: this.origin.z + 4 },
      rotationY: Math.PI, // face +Z (toward the door)
    };
  },

  getDoorWorldPos(out = new THREE.Vector3()) {
    out.copy(this.origin);
    out.z += 10; // south wall with D=20
    return out;
  },

  update(time) {
    if (!this.group?.visible) return;
    if (this.hearth?.hearthLight) {
      const f =
        1.0 +
        Math.sin(time * 6.1) * 0.1 +
        Math.sin(time * 13.3) * 0.05 +
        (Math.random() - 0.5) * 0.05;
      this.hearth.hearthLight.intensity = 2.0 * f;
      if (this.hearth.ember) this.hearth.ember.material.emissiveIntensity = 2.6 * f;
    }
    if (this.candle?.flameLight) {
      const f =
        1.0 +
        Math.sin(time * 9.1) * 0.06 +
        (Math.random() - 0.5) * 0.08;
      this.candle.flameLight.intensity = 1.1 * f;
      if (this.candle.flame) {
        this.candle.flame.material.emissiveIntensity = 3.2 * f;
        this.candle.flame.scale.y = 1.5 + Math.sin(time * 8) * 0.15;
      }
    }
  },
};
