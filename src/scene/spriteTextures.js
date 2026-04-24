import * as THREE from 'three';

let _softCircleTex = null;

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

