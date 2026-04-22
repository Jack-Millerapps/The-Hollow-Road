import * as THREE from 'three';

const registry = {
  ashwick: { group: null, millPivot: null, particles: null, particleVelocities: null },
  veilMarket: { group: null, orbs: [] },
  stonehush: { group: null },
};

function buildAshwick(scene) {
  const group = new THREE.Group();
  group.position.set(-6, 0, -80);

  // Mill body (rectangular lower house)
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 4),
    new THREE.MeshLambertMaterial({ color: 0x5c3a1e }),
  );
  body.position.y = 1.5;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Roof — flattened pyramid using a cone
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 1.4, 4),
    new THREE.MeshLambertMaterial({ color: 0x2c1a0a }),
  );
  roof.position.y = 3.7;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  // Mill tower (cylinder) on the side
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.3, 5.5, 12),
    new THREE.MeshLambertMaterial({ color: 0x6b4423 }),
  );
  tower.position.set(2.5, 2.75, 0.5);
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  // Tower cap
  const towerCap = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, 1.2, 12),
    new THREE.MeshLambertMaterial({ color: 0x2c1a0a }),
  );
  towerCap.position.set(2.5, 6.1, 0.5);
  group.add(towerCap);

  // Windows — emissive warm squares on body
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  for (let i = 0; i < 2; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), windowMat);
    win.position.set(-1.2 + i * 2.4, 1.6, 2.01);
    group.add(win);
  }

  // Mill blades on a pivot
  const pivot = new THREE.Object3D();
  pivot.position.set(2.5, 4.2, 2.1);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x3a2416 });
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.6, 0.08), bladeMat);
    blade.position.y = 1.8;
    const bladeWrap = new THREE.Object3D();
    bladeWrap.rotation.z = (i * Math.PI) / 2;
    bladeWrap.add(blade);
    pivot.add(bladeWrap);
  }
  // Hub
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.3, 10),
    new THREE.MeshLambertMaterial({ color: 0x1a0f06 }),
  );
  hub.rotation.x = Math.PI / 2;
  pivot.add(hub);
  group.add(pivot);

  // Point lights — warm
  const light1 = new THREE.PointLight(0xffaa44, 1.8, 22, 1.4);
  light1.position.set(1.5, 3, 2.5);
  group.add(light1);

  const light2 = new THREE.PointLight(0xffaa44, 1.4, 18, 1.4);
  light2.position.set(-2, 2, 1.5);
  group.add(light2);

  // Particle system — embers drifting up from chimney
  const count = 200;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 3;
    positions[i * 3 + 1] = 2 + Math.random() * 6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 3;
    velocities[i * 3] = (Math.random() - 0.5) * 0.15;
    velocities[i * 3 + 1] = 0.4 + Math.random() * 0.6;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xffb060,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.position.set(1, 0, 0);
  group.add(particles);

  scene.add(group);
  registry.ashwick.group = group;
  registry.ashwick.millPivot = pivot;
  registry.ashwick.particles = particles;
  registry.ashwick.particleVelocities = velocities;
}

function buildVeilMarket(scene) {
  const group = new THREE.Group();
  group.position.set(0, 0, -220);

  // Stalls arranged in two rows along the road
  const stallPositions = [
    [-6, 0, 4], [6, 0, 4],
    [-6.5, 0, 0], [6.5, 0, 0],
    [-6, 0, -4], [6, 0, -4],
  ];
  const stallMat = new THREE.MeshLambertMaterial({ color: 0x3a2816 });
  const clothMat = new THREE.MeshLambertMaterial({ color: 0x4a1e3a });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x1a1208 });

  const postTops = [];
  for (const [x, , z] of stallPositions) {
    // Four posts
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x + dx, 1.2, z + dz);
      group.add(post);
    }
    // Flat roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.12, 2.4),
      stallMat,
    );
    roof.position.set(x, 2.5, z);
    group.add(roof);
    // Cloth drape
    const cloth = Math.random() < 0.6
      ? new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.05), clothMat)
      : null;
    if (cloth) {
      cloth.position.set(x, 1.9, z + (Math.random() < 0.5 ? 1 : -1));
      group.add(cloth);
    }
    postTops.push(new THREE.Vector3(x, 2.4, z));
  }

  // Hanging lantern strings — LineSegments between select post tops
  const linePairs = [
    [postTops[0], postTops[1]],
    [postTops[2], postTops[3]],
    [postTops[4], postTops[5]],
    [postTops[0], postTops[2]],
    [postTops[3], postTops[5]],
  ];
  const linePositions = [];
  for (const [a, b] of linePairs) {
    linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x8a6430, transparent: true, opacity: 0.7 });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  group.add(lines);

  // Small lantern beads strung along the lines
  const beadGeo = new THREE.SphereGeometry(0.09, 6, 6);
  const beadMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  for (const [a, b] of linePairs) {
    const steps = 4;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const bead = new THREE.Mesh(beadGeo, beadMat);
      bead.position.lerpVectors(a, b, t);
      bead.position.y -= 0.12 * Math.sin(t * Math.PI);
      group.add(bead);
    }
  }

  // Floating orbs — bob on sine
  const orbMat = new THREE.MeshBasicMaterial({ color: 0xcc99ff });
  registry.veilMarket.orbs = [];
  for (let i = 0; i < 5; i++) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), orbMat);
    const angle = (i / 5) * Math.PI * 2;
    orb.position.set(
      Math.cos(angle) * 3.2,
      2.8 + Math.random() * 0.6,
      Math.sin(angle) * 2.4,
    );
    orb.userData.bobPhase = Math.random() * Math.PI * 2;
    orb.userData.baseY = orb.position.y;
    orb.userData.driftPhase = Math.random() * Math.PI * 2;
    group.add(orb);
    registry.veilMarket.orbs.push(orb);

    // Soft purple glow as a small point light for a few of them
    if (i % 2 === 0) {
      const orbLight = new THREE.PointLight(0xaa88ff, 0.7, 8, 2);
      orb.add(orbLight);
    }
  }

  // Mixed warm point lights
  const warm1 = new THREE.PointLight(0xffbb66, 1.0, 14, 1.6);
  warm1.position.set(-4, 2.2, 0);
  group.add(warm1);
  const warm2 = new THREE.PointLight(0xffbb66, 1.0, 14, 1.6);
  warm2.position.set(4, 2.2, 0);
  group.add(warm2);
  const cool = new THREE.PointLight(0xaa88ff, 0.8, 12, 2);
  cool.position.set(0, 3.2, 0);
  group.add(cool);

  scene.add(group);
  registry.veilMarket.group = group;
}

function buildStonehush(scene) {
  const group = new THREE.Group();
  group.position.set(0, 0, -380);

  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

  const stonePositions = [
    [-5, -3], [-3, 0], [-4.5, 3],
    [5, -2], [4.2, 1.5], [5.2, 4],
    [0, 5],
  ];
  for (const [x, z] of stonePositions) {
    const h = 3 + Math.random() * 3;
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35 + Math.random() * 0.2, 0.5 + Math.random() * 0.2, h, 8),
      stoneMat,
    );
    stone.position.set(x + (Math.random() - 0.5) * 0.4, h / 2, z + (Math.random() - 0.5) * 0.4);
    stone.rotation.z = (Math.random() - 0.5) * 0.16;
    stone.rotation.x = (Math.random() - 0.5) * 0.12;
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
  }

  // Loom frame — intersecting beams
  const beamMat = new THREE.MeshLambertMaterial({ color: 0x1f160c });
  const vert1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.6, 0.18), beamMat);
  vert1.position.set(-1.4, 1.8, 0);
  group.add(vert1);
  const vert2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.6, 0.18), beamMat);
  vert2.position.set(1.4, 1.8, 0);
  group.add(vert2);
  const horizTop = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 0.18), beamMat);
  horizTop.position.set(0, 3.4, 0);
  group.add(horizTop);
  const horizBot = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 0.18), beamMat);
  horizBot.position.set(0, 0.4, 0);
  group.add(horizBot);

  // Suspended threads — thin vertical boxes
  const threadMat = new THREE.MeshBasicMaterial({ color: 0xb8a088, transparent: true, opacity: 0.5 });
  for (let i = 0; i < 14; i++) {
    const thread = new THREE.Mesh(new THREE.BoxGeometry(0.015, 2.9, 0.015), threadMat);
    thread.position.set(-1.25 + i * 0.19, 1.9, 0);
    group.add(thread);
  }

  // Diagonal crossbeam for the loom
  const cross = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 0.1), beamMat);
  cross.position.set(0, 2.1, -0.15);
  cross.rotation.z = -0.3;
  group.add(cross);

  // NO point lights — moon only
  scene.add(group);
  registry.stonehush.group = group;
}

export const VillageBuilder = {
  buildVillage(name, scene) {
    if (name === 'ashwick') buildAshwick(scene);
    else if (name === 'veilMarket') buildVeilMarket(scene);
    else if (name === 'stonehush') buildStonehush(scene);
  },

  update(time) {
    // Ashwick: rotate mill, drift particles
    if (registry.ashwick.millPivot) {
      registry.ashwick.millPivot.rotation.z += 0.012;
    }
    if (registry.ashwick.particles) {
      const pos = registry.ashwick.particles.geometry.attributes.position;
      const vel = registry.ashwick.particleVelocities;
      const arr = pos.array;
      const dt = 1 / 60;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += vel[i] * dt;
        arr[i + 1] += vel[i + 1] * dt;
        arr[i + 2] += vel[i + 2] * dt;
        if (arr[i + 1] > 9) {
          arr[i] = (Math.random() - 0.5) * 1.4;
          arr[i + 1] = 2.5;
          arr[i + 2] = (Math.random() - 0.5) * 1.4;
        }
      }
      pos.needsUpdate = true;
    }

    // Veil Market: bob orbs and drift gently
    for (const orb of registry.veilMarket.orbs) {
      orb.position.y = orb.userData.baseY + Math.sin(time * 1.4 + orb.userData.bobPhase) * 0.22;
      orb.position.x += Math.sin(time * 0.5 + orb.userData.driftPhase) * 0.004;
    }
  },
};
