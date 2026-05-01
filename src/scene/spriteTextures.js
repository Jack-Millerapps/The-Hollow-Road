import * as THREE from 'three';

let _softCircleTex = null;
let _bellTex = null;

function makeSoftCircleCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.25, 'rgba(255, 255, 255, 0.55)');
  g.addColorStop(0.55, 'rgba(255, 255, 255, 0.18)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

export function getSoftCircleTexture() {
  if (_softCircleTex) return _softCircleTex;
  const tex = new THREE.CanvasTexture(makeSoftCircleCanvas());
  tex.needsUpdate = true;
  _softCircleTex = tex;
  return tex;
}

function makeBellCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, 128, 128);
  ctx.save();
  ctx.translate(64, 64);

  // Soft glow backdrop.
  const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 58);
  g.addColorStop(0, 'rgba(240, 200, 106, 0.95)');
  g.addColorStop(0.28, 'rgba(240, 200, 106, 0.35)');
  g.addColorStop(1, 'rgba(240, 200, 106, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, Math.PI * 2);
  ctx.fill();

  // Bell silhouette.
  ctx.fillStyle = 'rgba(18, 12, 6, 0.92)';
  ctx.beginPath();
  // Dome
  ctx.moveTo(-20, -10);
  ctx.quadraticCurveTo(0, -34, 20, -10);
  // Body
  ctx.quadraticCurveTo(28, 10, 22, 26);
  ctx.quadraticCurveTo(0, 38, -22, 26);
  ctx.quadraticCurveTo(-28, 10, -20, -10);
  ctx.closePath();
  ctx.fill();

  // Highlight edge.
  ctx.strokeStyle = 'rgba(255, 230, 160, 0.55)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-18, -8);
  ctx.quadraticCurveTo(0, -30, 18, -8);
  ctx.stroke();

  // Clapper.
  ctx.fillStyle = 'rgba(255, 230, 160, 0.75)';
  ctx.beginPath();
  ctx.arc(0, 26, 4.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  return c;
}

export function getBellTexture() {
  if (_bellTex) return _bellTex;
  const tex = new THREE.CanvasTexture(makeBellCanvas());
  tex.needsUpdate = true;
  _bellTex = tex;
  return tex;
}

