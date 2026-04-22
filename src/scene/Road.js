import * as THREE from 'three';

function createCobblestoneTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Charcoal base
  ctx.fillStyle = '#1e160d';
  ctx.fillRect(0, 0, size, size);

  // Irregular cobblestone blocks — 4x4 grid with jitter
  const rows = 4;
  const cols = 4;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jitterX = (Math.random() - 0.5) * 4;
      const jitterY = (Math.random() - 0.5) * 4;
      const offsetX = (r % 2) * (cellW / 2);
      const cx = c * cellW + offsetX + jitterX;
      const cy = r * cellH + jitterY;
      const w = cellW - 2 + Math.random() * 3;
      const h = cellH - 2 + Math.random() * 3;

      // Stone body — varied brown/charcoal
      const shades = ['#3a2818', '#452e1c', '#2e2013', '#3f2a18', '#503420'];
      ctx.fillStyle = shades[Math.floor(Math.random() * shades.length)];
      ctx.beginPath();
      const rr = 3;
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

      // Highlight on top edge
      ctx.strokeStyle = 'rgba(120, 90, 60, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy + 2);
      ctx.lineTo(cx + w - 4, cy + 2);
      ctx.stroke();

      // Dark grout shadow
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy + h - 1);
      ctx.lineTo(cx + w - 2, cy + h - 1);
      ctx.stroke();
    }
  }

  // Subtle noise grain
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 100);
  texture.anisotropy = 4;
  return texture;
}

export const Road = {
  mesh: null,
  texture: null,
  leftEdge: null,
  rightEdge: null,

  init(scene) {
    const texture = createCobblestoneTexture();
    this.texture = texture;

    const geometry = new THREE.PlaneGeometry(6, 600);
    const material = new THREE.MeshLambertMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, -300);
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.mesh = mesh;

    const edgeGeo = new THREE.BoxGeometry(0.12, 0.05, 600);
    const edgeMat = new THREE.MeshLambertMaterial({ color: 0x4a3a22 });

    const left = new THREE.Mesh(edgeGeo, edgeMat);
    left.position.set(-3.06, 0.025, -300);
    scene.add(left);
    this.leftEdge = left;

    const right = new THREE.Mesh(edgeGeo, edgeMat);
    right.position.set(3.06, 0.025, -300);
    scene.add(right);
    this.rightEdge = right;
  },

  update(delta, isWalking) {
    if (!this.texture) return;
    if (isWalking) {
      // Scroll the texture to simulate forward movement.
      this.texture.offset.y -= delta * 0.6;
    }
  },
};
