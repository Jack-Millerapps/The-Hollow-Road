import { state, notify } from './state.js';
import { SceneManager } from './scene/SceneManager.js';
import { Road } from './scene/Road.js';
import { Environment } from './scene/Environment.js';
import { VillageBuilder } from './scene/VillageBuilder.js';
import { Westwind } from './scene/Westwind.js';
import { CabinInterior } from './scene/CabinInterior.js';
import { DayNight } from './scene/DayNight.js';
import { CaveEntrance } from './scene/CaveEntrance.js';
import { CaveInterior } from './scene/CaveInterior.js';
import { villages } from './data/villages.js';
import { caves } from './data/caves.js';
import { Travel } from './game/Travel.js';
import { HUD } from './ui/HUD.js';
import { Minimap } from './ui/Minimap.js';
import { Map as WorldMap } from './ui/Map.js';
import { Save } from './game/Save.js';
import { IntroCutscene } from './game/IntroCutscene.js';
import { BrotherScene } from './game/BrotherScene.js';
import { FriendNPCs } from './game/FriendNPCs.js';
import { InventoryPanel } from './ui/InventoryPanel.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { StaminaBar } from './ui/StaminaBar.js';
import { Watch } from './ui/Watch.js';
import { PhaseWarning } from './ui/PhaseWarning.js';
import { Goblins } from './game/Goblins.js';
import { GoblinPopup } from './ui/GoblinPopup.js';
import { Mining } from './game/Mining.js';
import { TrollTrade } from './game/TrollTrade.js';
// -- Phase 4 -----------------------------------------------------------------
import { VeilWander } from './game/VeilWander.js';
import { MapShop } from './game/MapShop.js';
import { SpecialTasks } from './game/SpecialTasks.js';
import { Epilogue } from './ui/Epilogue.js';

// ---------------------------------------------------------------------------
// Fade overlay helpers
// ---------------------------------------------------------------------------

function setFade(opacity, duration = 1200) {
  return new Promise((resolve) => {
    const el = document.getElementById('fade-overlay');
    if (!el) return resolve();
    el.style.transition = `opacity ${duration}ms ease`;
    void el.offsetWidth;
    el.style.opacity = String(opacity);
    setTimeout(resolve, duration + 30);
  });
}

// ---------------------------------------------------------------------------
// Scene visibility management
// ---------------------------------------------------------------------------

function setWorldVisible(visible) {
  if (Environment.group) Environment.group.visible = visible;
  if (Westwind.group) Westwind.group.visible = visible;
  if (CaveEntrance.group) CaveEntrance.setVisible(visible);
}

function setCabinVisible(visible) {
  if (CabinInterior.group) CabinInterior.group.visible = visible;
}

const HUD_HIDE_CLASS = 'hide-world-hud';

function hideHUDChrome() {
  document.getElementById('ui-root')?.classList.add(HUD_HIDE_CLASS);
  PauseMenu.setVisible(false);
  InventoryPanel.setEnabled(false);
}

function showHUDChrome() {
  document.getElementById('ui-root')?.classList.remove(HUD_HIDE_CLASS);
  PauseMenu.setVisible(true);
  InventoryPanel.setEnabled(true);
}

(function installHUDHideStyle() {
  if (document.getElementById('hud-hide-style')) return;
  const s = document.createElement('style');
  s.id = 'hud-hide-style';
  s.textContent = `
    #ui-root.${HUD_HIDE_CLASS} > *:not(.panel-backdrop):not(.inv-backdrop):not(.pause-backdrop):not(.troll-backdrop) {
      display: none !important;
    }
  `;
  document.head.appendChild(s);
})();

// ---------------------------------------------------------------------------
// Player placement helpers
// ---------------------------------------------------------------------------

function teleportPlayer(x, z, rotationY = Math.PI) {
  if (!Travel.player) return;
  Travel.player.position.set(x, 0, z);
  Travel.player.rotation.y = rotationY;
  state.playerPos = { x, z };
  if (Travel._cameraPos && Travel._cameraLook && Travel.camera) {
    const offset = new (Travel.camera.position.constructor)(0, 3.6, 7.4);
    offset.applyQuaternion(Travel.player.quaternion);
    Travel._cameraPos.copy(Travel.player.position).add(offset);
    Travel._cameraLook.copy(Travel.player.position);
    Travel._cameraLook.y += 1.55;
    Travel.camera.position.copy(Travel._cameraPos);
    Travel.camera.lookAt(Travel._cameraLook);
  }
  notify();
}

// ---------------------------------------------------------------------------
// Scene entry points
// ---------------------------------------------------------------------------

async function enterCabin() {
  state.currentScene = 'cabin';
  setWorldVisible(false);
  setCabinVisible(false);
  // Hide any active cave too.
  const active = CaveInterior.getActive();
  if (active) active.group.visible = false;
  setCabinVisible(true);

  const spawn = CabinInterior.getPlayerSpawn();
  teleportPlayer(spawn.position.x, spawn.position.z, spawn.rotationY);

  Travel.pause();
  hideHUDChrome();

  BrotherScene.spawn(SceneManager.scene);

  Save.write(state);
  await setFade(0, 1600);

  await BrotherScene.play({ onExit: () => {} });

  await setFade(1, 1400);
  BrotherScene.dispose(SceneManager.scene);
  setCabinVisible(false);

  await enterWestwind();
}

async function enterWestwind() {
  state.currentScene = 'world';
  setWorldVisible(true);
  setCabinVisible(false);

  const spawn = Westwind.getArrivalSpawn();
  teleportPlayer(spawn.position.x, spawn.position.z, spawn.rotationY);

  FriendNPCs.spawn(SceneManager.scene, Travel);

  showHUDChrome();
  Travel.resume();
  Save.write(state);

  await setFade(0, 1600);
}

async function resumeWorldFromSave() {
  state.currentScene = 'world';
  setWorldVisible(true);
  setCabinVisible(false);

  FriendNPCs.spawn(SceneManager.scene, Travel);

  const px = state.playerPos?.x ?? 0;
  const pz = state.playerPos?.z ?? 120;
  teleportPlayer(px, pz, Math.PI);
  showHUDChrome();
  Travel.resume();
  await setFade(0, 1200);
}

// ---------------------------------------------------------------------------
// Cave entry / exit
//
// State flow:
//   WORLD → player inside CaveEntrance trigger → presses E
//     1. main.enterCave(caveId) starts a fade-to-black.
//     2. state.currentScene = 'cave', state.currentCaveId = caveId.
//     3. World groups (Environment, Westwind, CaveEntrance) hide.
//     4. CaveInterior.enter builds / shows the cave group and overrides
//        fog + lighting for a dark, claustrophobic feel.
//     5. Player is teleported to the cave's local entry-room spawn
//        (translated to its cave-space world origin).
//     6. Mining.syncDepletion restores previously mined ore state.
//     7. Save.write persists the new currentScene + currentCaveId +
//        playerPos (now in cave-space coords).
//     8. Fade out; movement resumes at CAVE_SPEED.
//
//   CAVE → player near exit portal → presses E
//     1. main.exitCave starts a fade-to-black.
//     2. CaveInterior.exit hides the cave group and restores fog/lights.
//     3. Player is teleported back to the overworld cave position, just
//        outside the arch.
//     4. state.currentScene = 'world', state.currentCaveId = null.
//     5. Save.write persists progress (mined counts, map pieces, trolls
//        traded).
//     6. Fade out; world update loops resume.
//
// Loading mid-cave: if Save.load returns currentScene === 'cave', main.js
// calls resumeCaveFromSave which mirrors enterCave but uses the saved
// cave-space player position instead of the spawn.
// ---------------------------------------------------------------------------

async function enterCave(caveId) {
  const cave = caves.find((c) => c.id === caveId);
  if (!cave) return;

  Travel.pause();
  await setFade(1, 800);

  setWorldVisible(false);
  setCabinVisible(false);

  state.currentScene = 'cave';
  state.currentCaveId = caveId;

  const spawn = CaveInterior.enter(caveId);
  if (spawn) {
    teleportPlayer(spawn.x, spawn.z, spawn.rotationY);
  }
  Mining.syncDepletion();

  Save.write(state);
  Travel.resume();
  await setFade(0, 800);
}

async function exitCave() {
  const active = CaveInterior.getActive();
  if (!active) return;

  Travel.pause();
  await setFade(1, 800);

  const cave = active.cave;
  CaveInterior.exit();

  state.currentScene = 'world';
  state.currentCaveId = null;
  setWorldVisible(true);
  setCabinVisible(false);

  // Drop the player just outside the arch in the overworld, facing away
  // from the entrance so they walk back onto the road naturally.
  teleportPlayer(cave.position.x, cave.position.z + 3.2, 0);

  Save.write(state);
  Travel.resume();
  await setFade(0, 800);
}

async function resumeCaveFromSave() {
  const caveId = state.currentCaveId;
  const cave = caves.find((c) => c.id === caveId);
  if (!cave) {
    // Fall through to world.
    await resumeWorldFromSave();
    return;
  }
  state.currentScene = 'cave';
  setWorldVisible(false);
  setCabinVisible(false);

  // playerPos is stored in world-space (cave-space origin added during the
  // last enter). Re-enter using the saved coords by computing the local
  // offset relative to the cave's origin.
  const spawn = CaveInterior.enter(caveId);
  const active = CaveInterior.getActive();
  // If the saved player position falls within the active cave's world-space
  // bounding box, restore exactly; otherwise spawn at the entry.
  const origin = active.origin;
  const saved = state.playerPos || { x: 0, z: 0 };
  const withinCave =
    Math.abs(saved.x - origin.x) < 200 && Math.abs(saved.z - origin.z) < 200;
  const finalPos = withinCave
    ? { x: saved.x, z: saved.z, rotationY: Math.PI }
    : spawn;
  teleportPlayer(finalPos.x, finalPos.z, finalPos.rotationY);
  Mining.syncDepletion();

  showHUDChrome();
  Travel.resume();
  await setFade(0, 1200);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function start() {
  const { scene, camera, renderer } = SceneManager.init();
  Road.init(scene);
  Environment.init(scene);
  for (const v of villages) VillageBuilder.buildVillage(v.name, scene);
  Westwind.build(scene);
  CabinInterior.build(scene);
  CaveEntrance.build(scene);

  HUD.mount();
  Minimap.mount();
  Travel.init(camera, scene);

  InventoryPanel.mount();
  PauseMenu.mount({
    onPause: () => Travel.pause(),
    onResume: () => Travel.resume(),
  });

  // Phase 2 HUD additions.
  StaminaBar.mount();
  Watch.mount();
  PhaseWarning.mount();

  // Phase 3 systems.
  GoblinPopup.mount();
  Goblins.init(scene);
  CaveInterior.init(scene);
  CaveInterior.setOnExit(() => exitCave());
  CaveEntrance.setOnEnter((caveId) => enterCave(caveId));
  Mining.init();
  TrollTrade.init();
  WorldMap.mount();

  // Phase 4 systems.
  VeilWander.init(scene);
  MapShop.init(scene, {
    onPause: () => Travel.pause(),
    onResume: () => Travel.resume(),
  });
  SpecialTasks.init(scene, {
    onPause: () => Travel.pause(),
    onResume: () => Travel.resume(),
  });
  // Epilogue mounts lazily on show() — no init needed.
  void Epilogue;

  // Day/night cycle — wraps panel open/close for pause tracking and seeds
  // lighting from state.gameTime.
  DayNight.init();

  // Start fully black — every entry path fades in explicitly.
  const fade = document.getElementById('fade-overlay');
  if (fade) {
    fade.style.transition = 'none';
    fade.style.opacity = '1';
    fade.style.pointerEvents = 'none';
  }

  notify();

  // Game loop.
  let prev = performance.now();
  function tick(now) {
    const delta = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    const t = now * 0.001;

    // Phase 4 — track real elapsed play time (used in the epilogue). We
    // explicitly do NOT count the cutscene or pre-boot states so the
    // counter only reflects actual play.
    if (state.currentScene !== 'cutscene') {
      state.playtimeSeconds = (state.playtimeSeconds || 0) + delta;
    }

    // Order: simulate, then update world-time-driven systems, then render.
    Travel.update(delta);
    DayNight.update(delta); // advances state.gameTime when unpaused
    Environment.update(t);
    VillageBuilder.update(t);
    Road.update(delta, state.isWalking);
    CabinInterior.update(t);
    Westwind.update(t);

    if (state.currentScene === 'world') {
      FriendNPCs.update(state.playerPos, t);
      CaveEntrance.update(state.playerPos, t);
      Goblins.update(delta, state.playerPos);
      VeilWander.update(delta, state.playerPos);
      MapShop.update(state.playerPos);
      SpecialTasks.update(state.playerPos);
    } else {
      // Keep goblins cleared while inside caves / cutscenes.
      Goblins.update(delta, state.playerPos);
    }
    if (state.currentScene === 'cave' && Travel.player) {
      CaveInterior.update(delta, state.playerPos, Travel.player.rotation.y);
      Mining.update(delta, state.playerPos);
      TrollTrade.update(delta, state.playerPos);
    }
    if (BrotherScene.mesh) {
      BrotherScene.update(delta, t);
    }

    Minimap.update(state.playerPos, villages, state);
    SceneManager.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Auto-save on critical state changes.
  let lastSignature = '';
  setInterval(() => {
    if (state.currentScene === 'cutscene') return;
    const sig = JSON.stringify({
      c: state.currencies,
      t: state.tradeComplete,
      p: state.playerPos,
      i: state.items,
      g: Math.floor(state.gameTime || 0),
      sc: state.currentScene,
      cv: state.currentCaveId,
      mp: Array.from(state.mapPieces || []),
      md: state.mined,
      tt: state.trollsTraded,
      // Phase 4
      gb: state.totalGoblinThefts || 0,
      tk: state.tasksCompleted || [],
      ms: state.mapShopsUsed || [],
      fl: state.flags,
      pt: Math.floor(state.playtimeSeconds || 0),
    });
    if (sig !== lastSignature) {
      lastSignature = sig;
      Save.write(state);
    }
  }, 3000);

  // Decide starting path.
  const snapshot = Save.load();
  if (snapshot) {
    Save.apply(snapshot);
    if (snapshot.currentScene === 'cave') {
      resumeCaveFromSave();
      return;
    }
    if (snapshot.currentScene === 'world') {
      resumeWorldFromSave();
      return;
    }
    if (snapshot.currentScene === 'cabin') {
      enterCabin();
      return;
    }
  }

  hideHUDChrome();
  Travel.pause();

  IntroCutscene.start(() => {
    enterCabin();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
