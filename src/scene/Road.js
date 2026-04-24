import * as THREE from 'three';

function createCobblestoneTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Deep damp base so grout reads dark
  ctx.fillStyle = '#141009';
  ctx.fillRect(0, 0, size, size);

  // Vignette-like moisture mottling
  for (let i = 0; i < 16; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r = 40 + Math.random() * 100;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(32, 26, 20, 0.5)');
    g.addColorStop(1, 'rgba(32, 26, 20, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  // Irregular cobblestone blocks — denser grid for higher resolution
  const cols = 8;
  const rows = 8;
  const cellW = size / cols;
  const cellH = size / rows;
  const shades = [
    '#3d2a18', '#46321e', '#2e2013', '#3f2a18', '#583823',
    '#4c3420', '#2a1c10', '#5a3c22',
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jitterX = (Math.random() - 0.5) * 6;
      const jitterY = (Math.random() - 0.5) * 6;
      const offsetX = (r % 2) * (cellW / 2);
      const cx = c * cellW + offsetX + jitterX;
      const cy = r * cellH + jitterY;
      const w = cellW - 3 + Math.random() * 5;
      const h = cellH - 3 + Math.random() * 5;

      const baseHex = shades[Math.floor(Math.random() * shades.length)];
      ctx.fillStyle = baseHex;
      const rr = 4 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(cx + rr, cy);
      ctx.lineTo(cx + w - rr, cy);
      ctx.quadraticCurveTo(cx + w, cy, cx + w, cy + rr);
      ctx.lineTo(cx + w, cy + h - rr);
      ctx.quadraticCurveTo(cx + w, cy + h, cx + w - rr, cy + h);
      ctx.lineTo(cx + rr, cy + h);
      ctx.quadraticCurveTo(cx, cy + h, cx, cy + h - rr);
      ctx.lineTo(cx, cy + rr);
      ctx.quadraticCurveTo(cx, cy, cx + rr, cy);
      ctx.closePath();
      ctx.fill();

      // Gradient lighting on top of each stone to fake rounding
      const grad = ctx.createRadialGradient(
        cx + w * 0.35,
        cy + h * 0.35,
        1,
        cx + w * 0.5,
        cy + h * 0.5,
        Math.max(w, h) * 0.8,
      );
      grad.addColorStop(0, 'rgba(255, 220, 170, 0.12)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - 1, cy - 1, w + 2, h + 2);

      // Moss patches on a small percentage of stones
      if (Math.random() < 0.08) {
        const mx = cx + Math.random() * w;
        const my = cy + Math.random() * h;
        const mr = 2 + Math.random() * 4;
        const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, 'rgba(60, 100, 40, 0.5)');
        mg.addColorStop(1, 'rgba(60, 100, 40, 0)');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Dark crack
      if (Math.random() < 0.25) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const sx = cx + Math.random() * w;
        const sy = cy + Math.random() * h;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (Math.random() - 0.5) * 8, sy + (Math.random() - 0.5) * 8);
        ctx.stroke();
      }
    }
  }

  // Grain pass
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// Generate a very simple normal map from the albedo, gives stones relief.
function createCobblestoneNormal(colorCanvas) {
  const c = document.createElement('canvas');
  c.width = c.height = colorCanvas.width;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, c.width, c.height);
  const src = colorCanvas.getContext('2d').getImageData(0, 0, c.width, c.height);
  const dst = ctx.getImageData(0, 0, c.width, c.height);
  const s = src.data;
  const d = dst.data;
  const w = c.width;
  const h = c.height;
  function brightness(i) {
    return (s[i] + s[i + 1] + s[i + 2]) / 3;
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const l = brightness(i - 4);
      const r = brightness(i + 4);
      const u = brightness(i - w * 4);
      const db = brightness(i + w * 4);
      const dx = (r - l) * 0.4;
      const dy = (db - u) * 0.4;
      d[i] = Math.max(0, Math.min(255, 128 - dx));
      d[i + 1] = Math.max(0, Math.min(255, 128 + dy));
      d[i + 2] = 220;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(dst, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// Phase 2 — cobblestone route from Westwind's southern edge all the way
// down to the Unnamed Village. Exported so Minimap.js can render the same
// path. Each entry is a world-space (x, z) waypoint.
export const ROAD_WAYPOINTS = [
  { x: 0, z: 110 }, // Westwind southern edge (dirt path handoff)
  { x: 0, z: 70 }, // Ashwick
  { x: 0, z: 40 }, // Veil Market
  { x: -8, z: 15 }, // gentle bend west before Stonehush
  { x: -25, z: -20 }, // Stonehush
  { x: -10, z: -55 }, // bend back east toward Deeproot
  { x: 20, z: -80 }, // Deeproot
  { x: 30, z: -100 }, // Mirror Town
  { x: 18, z: -135 }, // bend back toward center
  { x: 0, z: -170 }, // The Unnamed Village
  { x: 0, z: -195 }, // open road past the village (ending threshold)
];

const SEGMENTS = [];
for (let i = 0; i < ROAD_WAYPOINTS.length - 1; i++) {
  SEGMENTS.push({
    start: ROAD_WAYPOINTS[i],
    end: ROAD_WAYPOINTS[i + 1],
  });
}

const EDGE_MAT = new THREE.MeshStandardMaterial({
  color: 0x5a4226,
  roughness: 0.95,
  flatShading: true,
});

function buildSegment(scene, start, end, texture, normalTex) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(-dx, -dz);

  const group = new THREE.Group();
  group.position.set((start.x + end.x) / 2, 0.005, (start.z + end.z) / 2);
  group.rotation.y = angle;

  const geometry = new THREE.PlaneGeometry(6, length, 1, Math.max(1, Math.round(length / 10)));
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    normalMap: normalTex,
    roughness: 0.88,
    metalness: 0.02,
  });
  const road = new THREE.Mesh(geometry, material);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  group.add(road);

  // Soft wet strip down the middle — subtle emissive line that picks up a bit
  // of moonlight reflection and makes the road feel alive.
  const wetStripMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a22,
    emissive: 0x2a3050,
    emissiveIntensity: 0.12,
    roughness: 0.2,
    metalness: 0.35,
    transparent: true,
    opacity: 0.3,
  });
  const wetStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, length),
    wetStripMat,
  );
  wetStrip.rotation.x = -Math.PI / 2;
  wetStrip.position.y = 0.01;
  group.add(wetStrip);

  // Edge stones
  const edgeGeo = new THREE.BoxGeometry(0.16, 0.1, length);
  const left = new THREE.Mesh(edgeGeo, EDGE_MAT);
  left.position.set(-3.1, 0.05, 0);
  left.castShadow = true;
  left.receiveShadow = true;
  group.add(left);

  const right = new THREE.Mesh(edgeGeo, EDGE_MAT);
  right.position.set(3.1, 0.05, 0);
  right.castShadow = true;
  right.receiveShadow = true;
  group.add(right);

  // Mossy trim strip just outside the edge
  const mossMat = new THREE.MeshStandardMaterial({
    color: 0x1c3412,
    roughness: 1,
    flatShading: true,
  });
  const mossLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, length), mossMat);
  mossLeft.position.set(-3.35, 0.02, 0);
  group.add(mossLeft);
  const mossRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, length), mossMat);
  mossRight.position.set(3.35, 0.02, 0);
  group.add(mossRight);

  scene.add(group);
  return group;
}

export const Road = {
  texture: null,
  normalTexture: null,
  segments: [],

  init(scene) {
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = colorCanvas.height = 256;
    const ctx = colorCanvas.getContext('2d');
    // Re-run the pattern logic onto our own canvas so we can also build a
    // matching normal map from the albedo values.
    const tmpTex = createCobblestoneTexture();
    // createCobblestoneTexture already built a CanvasTexture from its own
    // offscreen canvas; grab that canvas for the normal map derivation.
    const srcCanvas = tmpTex.image;
    ctx.drawImage(srcCanvas, 0, 0, 256, 256);
    const normalTex = createCobblestoneNormal(colorCanvas);

    tmpTex.repeat.set(2, 28);
    normalTex.repeat.set(2, 28);
    this.texture = tmpTex;
    this.normalTexture = normalTex;

    this.segments = SEGMENTS.map((s) =>
      buildSegment(scene, s.start, s.end, tmpTex, normalTex),
    );
  },

  update(delta, isWalking) {
    if (!this.texture) return;
    if (isWalking) {
      // Subtle, not too fast, and both layers scroll together.
      this.texture.offset.y -= delta * 0.3;
      if (this.normalTexture) this.normalTexture.offset.y -= delta * 0.3;
    }
  },
};
