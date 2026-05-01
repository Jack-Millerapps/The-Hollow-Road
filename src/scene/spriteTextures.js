import * as THREE from 'three';

let _softCircleTex = null;
let _bellTex = null;
let _journalTex = null;
let _rootTex = null;
let _villagerTex = null;

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

function makeJournalCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.save();
  ctx.translate(64, 64);

  // Cool green glow.
  const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 58);
  g.addColorStop(0, 'rgba(140, 215, 163, 0.95)');
  g.addColorStop(0.28, 'rgba(140, 215, 163, 0.30)');
  g.addColorStop(1, 'rgba(140, 215, 163, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, Math.PI * 2);
  ctx.fill();

  // Journal silhouette (simple book).
  ctx.fillStyle = 'rgba(12, 10, 8, 0.92)';
  ctx.beginPath();
  ctx.roundRect?.(-20, -18, 40, 36, 5);
  if (!ctx.roundRect) {
    ctx.rect(-20, -18, 40, 36);
  }
  ctx.fill();

  // Spine.
  ctx.strokeStyle = 'rgba(200, 255, 220, 0.6)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-6, -16);
  ctx.lineTo(-6, 16);
  ctx.stroke();

  // Page hint.
  ctx.strokeStyle = 'rgba(200, 255, 220, 0.35)';
  ctx.lineWidth = 1.2;
  for (let y = -10; y <= 10; y += 6) {
    ctx.beginPath();
    ctx.moveTo(-2, y);
    ctx.lineTo(16, y);
    ctx.stroke();
  }

  ctx.restore();
  return c;
}

export function getJournalTexture() {
  if (_journalTex) return _journalTex;
  const tex = new THREE.CanvasTexture(makeJournalCanvas());
  tex.needsUpdate = true;
  _journalTex = tex;
  return tex;
}

function makeRootkeeperCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.save();
  ctx.translate(64, 64);

  const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 60);
  g.addColorStop(0, 'rgba(200, 144, 58, 0.95)');
  g.addColorStop(0.35, 'rgba(200, 144, 58, 0.28)');
  g.addColorStop(1, 'rgba(200, 144, 58, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 60, 0, Math.PI * 2);
  ctx.fill();

  // Stylized root / tree.
  ctx.strokeStyle = 'rgba(12, 10, 8, 0.92)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 34);
  ctx.quadraticCurveTo(-4, 10, 0, -8);
  ctx.stroke();

  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.quadraticCurveTo(-18, -10, -20, -28);
  ctx.moveTo(0, -2);
  ctx.quadraticCurveTo(18, -12, 20, -30);
  ctx.stroke();

  // Highlight.
  ctx.strokeStyle = 'rgba(255, 210, 130, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(2, 30);
  ctx.quadraticCurveTo(6, 10, 2, -6);
  ctx.stroke();

  ctx.restore();
  return c;
}

export function getRootkeeperTexture() {
  if (_rootTex) return _rootTex;
  const tex = new THREE.CanvasTexture(makeRootkeeperCanvas());
  tex.needsUpdate = true;
  _rootTex = tex;
  return tex;
}

function makeVillagerCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.save();
  ctx.translate(64, 64);

  const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 58);
  g.addColorStop(0, 'rgba(229, 217, 182, 0.9)');
  g.addColorStop(0.35, 'rgba(229, 217, 182, 0.22)');
  g.addColorStop(1, 'rgba(229, 217, 182, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, Math.PI * 2);
  ctx.fill();

  // Simple person bust.
  ctx.fillStyle = 'rgba(12, 10, 8, 0.92)';
  ctx.beginPath();
  ctx.arc(0, -10, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect?.(-18, 2, 36, 26, 10);
  if (!ctx.roundRect) ctx.rect(-18, 2, 36, 26);
  ctx.fill();

  ctx.restore();
  return c;
}

export function getVillagerTexture() {
  if (_villagerTex) return _villagerTex;
  const tex = new THREE.CanvasTexture(makeVillagerCanvas());
  tex.needsUpdate = true;
  _villagerTex = tex;
  return tex;
}

