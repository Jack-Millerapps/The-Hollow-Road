import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Road — consolidation patch.
//
// The route spans ~16,500 units. Waypoints define the trunk line from
// Westwind to The Unnamed Village. Legs longer than 1500 units are sampled
// along a Catmull-Rom curve (natural bends) rather than straight segments.
//
// The Road module exposes a list of straight sub-segments (`SEGMENTS`) that
// Environment.js, Minimap/Map, VeilWander, and Goblins all consume to
// measure distance-to-road.
// ---------------------------------------------------------------------------

function createCobblestoneTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#141009';
  ctx.fillRect(0, 0, size, size);

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

      const grad = ctx.createRadialGradient(
        cx + w * 0.35, cy + h * 0.35, 1,
        cx + w * 0.5, cy + h * 0.5, Math.max(w, h) * 0.8,
      );
      grad.addColorStop(0, 'rgba(255, 220, 170, 0.12)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - 1, cy - 1, w + 2, h + 2);
    }
  }

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

// Main route anchors — these are the town centers along the road. Between
// them, sub-waypoints are generated to introduce bends on long legs.
const ANCHORS = [
  { x: 0, z: 500 },    // Westwind
  { x: 0, z: -500 },   // Ashwick
  { x: 0, z: -2500 },  // Veil Market
  { x: -800, z: -5000 }, // Stonehush
  { x: 600, z: -6000 },  // Deeproot
  { x: 200, z: -7800 },  // Mirror Town
  { x: 0, z: -14500 }, // Unnamed Village
];

// For legs > 1500 units, introduce bends by sampling a Catmull-Rom curve
// built from anchors with tangent-aware control points.
function buildWaypoints() {
  const pts = [];
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i];
    const b = ANCHORS[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const legLen = Math.hypot(dx, dz);
    pts.push({ x: a.x, z: a.z });

    if (legLen > 1500) {
      // Insert 2 bends with lateral offset.
      const perpX = -dz / legLen;
      const perpZ = dx / legLen;
      const bends = [0.33, 0.66];
      for (const t of bends) {
        const px = a.x + dx * t;
        const pz = a.z + dz * t;
        // Alternating lateral offset proportional to length (5-8%).
        const sign = t < 0.5 ? 1 : -1;
        const off = legLen * 0.05 * sign;
        pts.push({ x: px + perpX * off, z: pz + perpZ * off });
      }
    }
  }
  pts.push(ANCHORS[ANCHORS.length - 1]);
  return pts;
}

// Dense-sample the polyline through a Catmull-Rom curve so the visible road
// looks smoothly curved rather than straight-kinked.
function buildCurveSegments(waypoints, segmentMax = 120) {
  const vecs = waypoints.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const curve = new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.25);
  const totalLen = curve.getLength();
  const count = Math.max(2, Math.ceil(totalLen / segmentMax));
  const pts = curve.getSpacedPoints(count);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    segs.push({
      start: { x: pts[i].x, z: pts[i].z },
      end: { x: pts[i + 1].x, z: pts[i + 1].z },
    });
  }
  return { segs, curve, totalLen };
}

const RAW_WAYPOINTS = buildWaypoints();
const { segs: RAW_SEGMENTS, curve: ROAD_CURVE, totalLen: ROAD_LENGTH } =
  buildCurveSegments(RAW_WAYPOINTS, 120);

export const ROAD_WAYPOINTS = RAW_WAYPOINTS;
export const ROAD_SEGMENTS_DATA = RAW_SEGMENTS;
export const ROAD_TOTAL_LENGTH = ROAD_LENGTH;
export { ROAD_CURVE };

const EDGE_MAT = new THREE.MeshStandardMaterial({
  color: 0x5a4226,
  roughness: 0.95,
  flatShading: true,
});

function buildSegment(scene, start, end, texture) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 0.01) return null;
  const angle = Math.atan2(-dx, -dz);

  const group = new THREE.Group();
  group.position.set((start.x + end.x) / 2, 0.005, (start.z + end.z) / 2);
  group.rotation.y = angle;

  const geometry = new THREE.PlaneGeometry(
    6,
    length,
    1,
    Math.max(1, Math.round(length / 20)),
  );
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.88,
    metalness: 0.02,
  });
  const road = new THREE.Mesh(geometry, material);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  group.add(road);

  // Edge stones
  const edgeGeo = new THREE.BoxGeometry(0.16, 0.1, length);
  const left = new THREE.Mesh(edgeGeo, EDGE_MAT);
  left.position.set(-3.1, 0.05, 0);
  left.receiveShadow = true;
  group.add(left);
  const right = new THREE.Mesh(edgeGeo, EDGE_MAT);
  right.position.set(3.1, 0.05, 0);
  right.receiveShadow = true;
  group.add(right);

  scene.add(group);
  return group;
}

export const Road = {
  texture: null,
  segments: [],
  scene: null,

  init(scene) {
    this.scene = scene;
    const texture = createCobblestoneTexture();
    texture.repeat.set(2, 14);
    this.texture = texture;
    this.segments = RAW_SEGMENTS.map((s) =>
      buildSegment(scene, s.start, s.end, texture),
    ).filter(Boolean);
    // Guard: every segment group MUST be parented directly to the scene so
    // the road stays fixed in world space. If anything (a previous bug, a
    // future regression, or an accidental player.add()) reparented a segment
    // off the scene, detach it and re-add to the scene root.
    this._enforceSceneParent();
  },

  _enforceSceneParent() {
    if (!this.scene) return;
    for (const seg of this.segments) {
      if (!seg) continue;
      if (seg.parent !== this.scene) {
        if (seg.parent) seg.parent.remove(seg);
        this.scene.add(seg);
      }
    }
  },

  // Single-mesh accessor for parent assertions: returns the first segment so
  // callers can verify Road.mesh.parent === scene.
  get mesh() {
    return this.segments[0] || null;
  },

  update(delta, isWalking) {
    if (!this.texture) return;
    if (isWalking) {
      this.texture.offset.y -= delta * 0.3;
    }
  },

  // Returns perpendicular distance from (x,z) to the nearest road segment.
  distanceToRoad(x, z) {
    let best = Infinity;
    for (const s of RAW_SEGMENTS) {
      const ax = s.start.x;
      const az = s.start.z;
      const bx = s.end.x;
      const bz = s.end.z;
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      if (l2 === 0) continue;
      let t = ((x - ax) * dx + (z - az) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx;
      const pz = az + t * dz;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) best = d;
    }
    return best;
  },
};
