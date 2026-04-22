import { state, notify } from './state.js';
import { SceneManager } from './scene/SceneManager.js';
import { Road } from './scene/Road.js';
import { Environment } from './scene/Environment.js';
import { VillageBuilder } from './scene/VillageBuilder.js';
import { villages } from './data/villages.js';
import { Travel } from './game/Travel.js';
import { HUD } from './ui/HUD.js';
import { Minimap } from './ui/Minimap.js';

function showIntro(onBegin) {
  const root = document.getElementById('ui-root');
  const intro = document.createElement('div');
  intro.className = 'intro';
  intro.innerHTML = `
    <h1>The Hollow Road</h1>
    <p>You set out at dusk. The road runs south, then forks — to Ashwick in the west, to the Veil Market and Stonehush in the east. Something waits at the end, whichever way you go.</p>
    <p>You carry: fifty gold. Three memories. Two promises. One year. Two secrets. Spend carefully. The road remembers.</p>
    <p>Hold <strong>W</strong> (or the button) to walk forward. <strong>A / D</strong> strafe. <strong>S</strong> step back. <strong>Q / E</strong> turn. <strong>M</strong> opens the map.</p>
    <button type="button">Begin</button>
  `;
  const btn = intro.querySelector('button');
  btn.addEventListener('click', () => {
    intro.classList.add('hidden');
    setTimeout(() => intro.remove(), 1200);
    onBegin();
  });
  root.appendChild(intro);
}

function start() {
  const { scene, camera, renderer } = SceneManager.init();
  Road.init(scene);
  Environment.init(scene);
  for (const v of villages) VillageBuilder.buildVillage(v.name, scene);

  HUD.mount();
  Minimap.mount();
  Travel.init(camera, scene);
  notify();

  let prev = performance.now();
  function tick(now) {
    const delta = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    const t = now * 0.001;

    Travel.update(delta);
    Environment.update(t);
    VillageBuilder.update(t);
    Road.update(delta, state.isWalking);
    Minimap.update(state.playerPos, villages, state);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  showIntro(() => {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
