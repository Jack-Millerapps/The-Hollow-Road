import * as THREE from 'three';

const TREE_TRUNK_GEO = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6);
const TREE_CANOPY_GEO = new THREE.SphereGeometry(1.1, 8, 6);
const LANTERN_POLE_GEO = new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6);
const LANTERN_HEAD_GEO = new THREE.BoxGeometry(0.35, 0.4, 0.35);
const HILL_GEO = new THREE.SphereGeometry(28, 16, 12);

const TRUNK_MAT = new THREE.MeshLambertMaterial({ color: 0x2b1d10 });
const CANOPY_MAT = new THREE.MeshLambertMaterial({ color: 0x16270f });
const POLE_MAT = new THREE.MeshLambertMaterial({ color: 0x1a1208 });
const LANTERN_MAT = new THREE.MeshBasicMaterial({ color: 0xf6c46a });
const GROUND_MAT = new THREE.MeshLambertMaterial({ color: 0x0f1a06 });
const HILL_MAT = new THREE.MeshLambertMaterial({ color: 0x0d1a0d });

const STONEHUSH_CORRIDOR = { start: -410, end: -380 };

function inStonehushCorridor(z) {
  return z <= STONEHUSH_CORRIDOR.start || (z >= STONEHUSH_CORRIDOR.start && z <= STONEHUSH_CORRIDOR.end);
}

function nearStonehushCorridor(z) {
  return z >= -415 && z <= -375;
}

export const Environment = {
  group: null,
  trees: [],
  lanterns: [],

  init(scene) {
    const group = new THREE.Group();
    this.group = group;
    this.trees = [];
    this.lanterns = [];

    // Ground
    const groundGeo = new THREE.PlaneGeometry(200, 1200);
    const ground = new THREE.Mesh(groundGeo, GROUND_MAT);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -400);
    ground.receiveShadow = true;
    group.add(ground);

    // Distant hills
    const hillZs = [-40, -120, -200, -280, -360, -440, -520, -600];
    hillZs.forEach((hz, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const hill = new THREE.Mesh(HILL_GEO, HILL_MAT);
      const scale = 0.8 + Math.random() * 0.8;
      hill.scale.set(scale, scale * 0.45, scale);
      hill.position.set(side * (70 + Math.random() * 30), -6, hz + (Math.random() - 0.5) * 20);
      group.add(hill);
    });

    // Trees — procedurally placed along Z from -2 to -500
    const treeSpacing = 7;
    for (let z = -4; z > -500; z -= treeSpacing * (0.65 + Math.random() * 0.6)) {
      if (nearStonehushCorridor(z)) continue;

      // Two trees per step — one per side, with jitter
      for (const side of [-1, 1]) {
        if (Math.random() < 0.35) continue; // sparse gaps
        const offX = side * (4 + Math.random() * 5);
        const offZ = z + (Math.random() - 0.5) * 4;
        if (nearStonehushCorridor(offZ)) continue;

        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(TREE_TRUNK_GEO, TRUNK_MAT);
        trunk.position.y = 1.1;
        trunk.castShadow = true;
        tree.add(trunk);

        const canopy = new THREE.Mesh(TREE_CANOPY_GEO, CANOPY_MAT);
        canopy.position.y = 2.5;
        const s = 0.7 + Math.random() * 0.8;
        canopy.scale.set(s, s * (0.9 + Math.random() * 0.3), s);
        canopy.castShadow = true;
        tree.add(canopy);

        tree.position.set(offX, 0, offZ);
        tree.userData.swayOffset = Math.random() * Math.PI * 2;
        tree.userData.swayAmp = 0.01 + Math.random() * 0.02;
        group.add(tree);
        this.trees.push(tree);
      }
    }

    // Lantern poles every ~25 units, alternating sides
    let side = 1;
    for (let z = -10; z > -500; z -= 25) {
      const pole = new THREE.Group();

      const poleMesh = new THREE.Mesh(LANTERN_POLE_GEO, POLE_MAT);
      poleMesh.position.y = 1.7;
      poleMesh.castShadow = true;
      pole.add(poleMesh);

      const head = new THREE.Mesh(LANTERN_HEAD_GEO, LANTERN_MAT);
      head.position.y = 3.55;
      pole.add(head);

      const light = new THREE.PointLight(0xe8a030, 1.2, 18, 1.5);
      light.position.y = 3.55;
      pole.add(light);

      pole.position.set(side * 3.6, 0, z + (Math.random() - 0.5) * 4);
      pole.userData.flickerOffset = Math.random() * Math.PI * 2;
      pole.userData.baseIntensity = 1.2;
      pole.userData.light = light;
      pole.userData.head = head;

      group.add(pole);
      this.lanterns.push(pole);
      side *= -1;
    }

    scene.add(group);
  },

  update(time) {
    for (const tree of this.trees) {
      tree.rotation.z = Math.sin(time + tree.userData.swayOffset) * tree.userData.swayAmp;
    }
    for (const pole of this.lanterns) {
      const off = pole.userData.flickerOffset;
      const flicker = 0.88 + Math.sin(time * 3 + off) * 0.08 + (Math.random() - 0.5) * 0.05;
      pole.userData.light.intensity = pole.userData.baseIntensity * flicker;
    }
  },

  hide() {
    if (this.group) this.group.visible = false;
  },
};
