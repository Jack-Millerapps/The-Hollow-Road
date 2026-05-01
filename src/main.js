import { state, notify, subscribe } from './state.js';
import { SceneManager } from './scene/SceneManager.js';
import { Road } from './scene/Road.js';
import { Environment } from './scene/Environment.js';
import { VillageBuilder } from './scene/VillageBuilder.js';
import { AshwickNPCs } from './scene/AshwickNPCs.js';
import { TownNPCs } from './scene/TownNPCs.js';
import { Westwind } from './scene/Westwind.js';
import { CabinInterior } from './scene/CabinInterior.js';
import { DayNight } from './scene/DayNight.js';
import { CaveEntrance } from './scene/CaveEntrance.js';
import { CaveInterior } from './scene/CaveInterior.js';
import { villages } from './data/villages.js';
import { caves } from './data/caves.js';
import { Travel } from './game/Travel.js';
import { RoadEvents } from './game/RoadEvents.js';
import { HUD } from './ui/HUD.js';
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
import { VeilWander } from './game/VeilWander.js';
import { Epilogue } from './ui/Epilogue.js';
// Consolidation additions
import { QuestSystem } from './game/QuestSystem.js';
import { QuestLog } from './ui/QuestLog.js';
import { Exchanger } from './game/Exchanger.js';
import { FPSCounter } from './ui/FPSCounter.js';
import { ControlsIntro } from './ui/ControlsIntro.js';
import { ObjectiveTracker } from './ui/ObjectiveTracker.js';
import { QuestBanner } from './ui/QuestBanner.js';
import { StonehushBellPointer } from './ui/StonehushBellPointer.js';
import { FinderBar } from './ui/FinderBar.js';
import { StonehushBellSprite } from './scene/StonehushBellSprite.js';
import { DeeprootJournalSprite } from './scene/DeeprootJournalSprite.js';
import { DeeprootQuestSprites } from './scene/DeeprootQuestSprites.js';
import { MirrorQuestSprites } from './scene/MirrorQuestSprites.js';
import { Wetland } from './scene/Wetland.js';
import { MirrorHiddenSprite } from './scene/MirrorHiddenSprite.js';
import { HUDTutorial } from './ui/HUDTutorial.js';
import { DebugOverlay } from './ui/DebugOverlay.js';
// Engine fixes (this prompt)
import { ChunkManager } from './game/ChunkManager.js';
import { PauseManager } from './game/PauseManager.js';
import { BackgroundMusic } from './game/BackgroundMusic.js';
import { Tutorial } from './game/Tutorial.js';
import { AdminPanel } from './ui/AdminPanel.js';
import { TitleScreen } from './ui/TitleScreen.js';
import { Compass } from './ui/Compass.js';

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

let _worldVisible = null;
function setWorldVisible(visible) {
  // Avoid expensive per-frame toggles (especially road segments).
  if (_worldVisible === visible) return;
  _worldVisible = visible;
  // Environment has sky props (moon/stars) that are not parented under
  // Environment.group, so we must use its show/hide helpers rather than
  // toggling only the group visibility (otherwise you can get a blank sky
  // with no world geometry during scene transitions).
  if (visible) Environment.show?.();
  else Environment.hide?.();
  if (Westwind.group) Westwind.group.visible = visible;
  if (CaveEntrance.group) CaveEntrance.setVisible(visible);
  // Road segments are added directly to the scene; hide them during cabin/cave.
  if (Road.segments?.length) {
    for (const seg of Road.segments) {
      if (seg) seg.visible = visible;
    }
  }
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
    #ui-root.${HUD_HIDE_CLASS} > *:not(.panel-backdrop):not(.inv-backdrop):not(.pm-backdrop):not(.troll-backdrop) {
      display: none !important;
    }
  `;
  document.head.appendChild(s);
})();

// ---------------------------------------------------------------------------
// Player placement helpers
// ---------------------------------------------------------------------------

let _teleportSeq = 0;
let _lastTeleport = '';

function teleportPlayer(x, z, rotationY = Math.PI, reason = '') {
  if (!Travel.player) return;
  _teleportSeq++;
  _lastTeleport = reason || _lastTeleport || 'unknown';
  const gy = Travel.getGroundY?.() ?? 0;
  Travel.player.position.set(x, gy, z);
  Travel._yaw = rotationY;
  Travel.player.rotation.y = rotationY;
  state.playerPos = { x, z };
  state.cameraYaw = rotationY;
  if (Travel._setCameraFromPlayer) Travel._setCameraFromPlayer();
  notify();
}

// ---------------------------------------------------------------------------
// Scene entry points
// ---------------------------------------------------------------------------

async function enterCabin() {
  state.currentScene = 'cabin';
  setWorldVisible(false);
  setCabinVisible(false);
  const active = CaveInterior.getActive();
  if (active) active.group.visible = false;
  setCabinVisible(true);

  const spawn = CabinInterior.getPlayerSpawn();
  teleportPlayer(
    spawn.position.x,
    spawn.position.z,
    spawn.rotationY,
    'enterCabin',
  );

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
  teleportPlayer(
    spawn.position.x,
    spawn.position.z,
    spawn.rotationY,
    'enterWestwind',
  );

  FriendNPCs.spawn(SceneManager.scene, Travel);

  showHUDChrome();
  Travel.resume();
  Save.write(state);

  await setFade(0, 1600);

  Tutorial.onWestwindEntered();

  // First-visit flow: controls overlay → friends come → HUD tutorial.
  if (!state.flags.friendsArrived) {
    // Show the controls overlay first (if not seen), wait for dismissal.
    if (!state.flags.seenControls) {
      await new Promise((resolve) => {
        const prevDismiss = ControlsIntro.dismiss.bind(ControlsIntro);
        ControlsIntro.dismiss = function (...args) {
          const ret = prevDismiss(...args);
          ControlsIntro.dismiss = prevDismiss;
          resolve();
          return ret;
        };
        if (!ControlsIntro.maybeShow()) resolve();
      });
    }

    // Friends walk up to the player one at a time.
    await FriendNPCs.runArrivalSequence(Travel);

    // Then the HUD tutorial.
    HUDTutorial.maybeShow();
  } else {
    ControlsIntro.maybeShow();
  }
}

async function resumeWorldFromSave() {
  state.currentScene = 'world';
  setWorldVisible(true);
  setCabinVisible(false);

  FriendNPCs.spawn(SceneManager.scene, Travel);

  const px = state.playerPos?.x ?? 0;
  const pz = state.playerPos?.z ?? 500;
  const yaw = state.cameraYaw ?? Math.PI;
  teleportPlayer(px, pz, yaw, 'resumeWorldFromSave');

  // Consolidation — if somehow the save left timePaused stuck after
  // leaving Westwind, clear it now.
  if (state.flags.hasLeftWestwind) state.timePaused = false;

  showHUDChrome();
  Travel.resume();
  await setFade(0, 1200);
  Tutorial.onWestwindEntered();
}

// ---------------------------------------------------------------------------
// Cave entry / exit (unchanged)
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
  // Fix 6 — caves are flat at floor y=0 for now. Travel reads the value to
  // resolve gravity collisions against the cave floor.
  Travel.setGroundY(CaveInterior.getActive()?.floorY ?? 0);
  if (spawn) teleportPlayer(spawn.x, spawn.z, spawn.rotationY, 'enterCave');
  Mining.syncDepletion();

  Save.write(state);
  Travel.resume();
  await setFade(0, 800);
  // Best-effort pointer lock for cave look — may only succeed if still tied
  // to the initiating user gesture on some browsers.
  const canvas = SceneManager.renderer?.domElement;
  if (canvas && state.currentScene === 'cave') {
    requestAnimationFrame(() => {
      try {
        if (!PauseManager.isPaused() && !state.dialogueActive) {
          canvas.requestPointerLock?.();
        }
      } catch { /* ignore */ }
    });
  }
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

  // Fix 6 — restore world ground level when leaving the cave.
  Travel.resetGroundY();
  teleportPlayer(cave.position.x, cave.position.z + 3.2, 0, 'exitCave');

  Save.write(state);
  Travel.resume();
  await setFade(0, 800);
}

async function resumeCaveFromSave() {
  const caveId = state.currentCaveId;
  const cave = caves.find((c) => c.id === caveId);
  if (!cave) {
    await resumeWorldFromSave();
    return;
  }
  state.currentScene = 'cave';
  setWorldVisible(false);
  setCabinVisible(false);

  const spawn = CaveInterior.enter(caveId);
  const active = CaveInterior.getActive();
  Travel.setGroundY(active?.floorY ?? 0);
  const origin = active.origin;
  const saved = state.playerPos || { x: 0, z: 0 };
  const withinCave =
    Math.abs(saved.x - origin.x) < 200 && Math.abs(saved.z - origin.z) < 200;
  const finalPos = withinCave
    ? { x: saved.x, z: saved.z, rotationY: Math.PI }
    : spawn;
  teleportPlayer(finalPos.x, finalPos.z, finalPos.rotationY, 'resumeCaveFromSave');
  Mining.syncDepletion();

  showHUDChrome();
  Travel.resume();
  await setFade(0, 1200);
  const canvas = SceneManager.renderer?.domElement;
  if (canvas && state.currentScene === 'cave') {
    requestAnimationFrame(() => {
      try {
        if (!PauseManager.isPaused() && !state.dialogueActive) {
          canvas.requestPointerLock?.();
        }
      } catch { /* ignore */ }
    });
  }
}

// ---------------------------------------------------------------------------
// Visibility watchdog (prevents "blank sky" state)
// ---------------------------------------------------------------------------

function applySceneVisibility(sc) {
  // Enforce expected visibility *only when scene changes*.
  if (sc === 'world') {
    setWorldVisible(true);
    setCabinVisible(false);
    const active = CaveInterior.getActive?.();
    if (active?.group) active.group.visible = false;
  } else if (sc === 'cabin') {
    setWorldVisible(false);
    setCabinVisible(true);
    const active = CaveInterior.getActive?.();
    if (active?.group) active.group.visible = false;
  } else if (sc === 'cave') {
    setWorldVisible(false);
    setCabinVisible(false);
    const active = CaveInterior.getActive?.();
    if (active?.group) active.group.visible = true;
  } else if (sc === 'cutscene') {
    // Keep the world visible behind the name-entry intro. The intro layer
    // starts at opacity 0 for a short time; if the world is hidden here the
    // canvas reads as solid black until the intro fades in (felt "stuck").
    setWorldVisible(true);
    setCabinVisible(false);
    const active = CaveInterior.getActive?.();
    if (active?.group) active.group.visible = false;
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function start() {
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.has('_new')) {
      u.searchParams.delete('_new');
      const tail = u.searchParams.toString();
      const q = tail ? `?${tail}` : '';
      history.replaceState(null, '', `${u.pathname}${q}${u.hash}`);
    }
  } catch {
    /* ignore */
  }

  const { scene, camera, renderer } = SceneManager.init();
  // ChunkManager must know the camera before any scene module registers
  // objects (so frustum-test setup is valid from the first frame).
  ChunkManager.setCamera(camera);
  Road.init(scene);
  Environment.init(scene);
  Wetland.init(scene);
  for (const v of villages) VillageBuilder.buildVillage(v.name, scene);
  Westwind.build(scene);
  CabinInterior.build(scene);
  CaveEntrance.build(scene);

  HUD.mount();
  Tutorial.mount();
  Travel.init(camera, scene, { canvas: renderer.domElement });
  AshwickNPCs.init(scene);
  TownNPCs.init(scene);
  RoadEvents.init(scene, {
    pause: () => Travel.pause(),
    resume: () => Travel.resume(),
  });
  PauseManager.setCanvas(renderer.domElement);
  // Debug overlay is opt-in to avoid impacting performance.
  const debugEnabled =
    new URLSearchParams(window.location.search).get('debug') === '1';
  if (debugEnabled) DebugOverlay.mount({ canvas: renderer.domElement });
  // Apply visibility when scene changes (not every frame).
  let _lastScene = null;
  subscribe(() => {
    const sc = state.currentScene;
    if (sc === _lastScene) return;
    _lastScene = sc;
    applySceneVisibility(sc);
  });
  // Ensure initial visibility is correct.
  applySceneVisibility(state.currentScene);

  InventoryPanel.mount();
  PauseMenu.mount();

  StaminaBar.mount();
  Watch.mount();
  Compass.mount();
  PhaseWarning.mount();

  GoblinPopup.mount();
  Goblins.init(scene);
  StonehushBellSprite.init(scene);
  DeeprootJournalSprite.init(scene);
  DeeprootQuestSprites.init(scene);
  MirrorQuestSprites.init(scene);
  MirrorHiddenSprite.init(scene);
  CaveInterior.init(scene);
  CaveInterior.setOnExit(() => exitCave());
  CaveEntrance.setOnEnter((caveId) => enterCave(caveId));
  Mining.init();
  TrollTrade.init();
  WorldMap.mount();

  VeilWander.init(scene);

  // Consolidation — quest system + exchangers + quest log + FPS counter.
  QuestSystem.init();
  QuestLog.mount();
  Exchanger.init(scene, { travel: Travel });
  FPSCounter.mount();
  ObjectiveTracker.mount();
  QuestBanner.mount();
  StonehushBellPointer.mount();
  FinderBar.mount();

  void Epilogue;
  AdminPanel.mount({ teleport: teleportPlayer });

  // Day/night — starts at "night" on first exit from Westwind (Travel.js
  // calls DayNight.setStartPhase('night') then). Until then, gameTime = 0
  // (day) but state.timePaused is true while in the cabin/cutscene via
  // reconcilePause().
  DayNight.init();

  BackgroundMusic.init();

  const fade = document.getElementById('fade-overlay');
  if (fade) {
    fade.style.transition = 'none';
    // Hold the screen black during boot and across every scene transition
    // until the next entry point fades it out explicitly. Lets the title
    // screen mount on top of black instead of a flash of the live canvas.
    fade.style.opacity = '1';
    fade.style.pointerEvents = 'none';
  }

  notify();

  let prev = performance.now();
  function tick(now) {
    try {
      const delta = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      const t = now * 0.001;

      if (state.currentScene !== 'cutscene') {
        state.playtimeSeconds = (state.playtimeSeconds || 0) + delta;
      }

      Travel.update(delta);
      DayNight.update(delta);
      BackgroundMusic.update(state.currentScene, state.playerPos);
      Environment.update(t);
      Environment.updateCulling(camera);
      Wetland.update(t);
      VillageBuilder.update(t, state.playerPos);
      Road.update(delta, state.isWalking);
      CabinInterior.update(t);
      Westwind.update(t, state.playerPos);

      if (state.currentScene === 'world') {
        FriendNPCs.update(state.playerPos, t);
        CaveEntrance.update(state.playerPos, t);
        Goblins.update(delta, state.playerPos);
        VeilWander.update(delta, state.playerPos);
        Exchanger.update(state.playerPos);
        RoadEvents.update(delta, state.playerPos, Travel);
        StonehushBellSprite.update(t);
        DeeprootJournalSprite.update(t);
        DeeprootQuestSprites.update(t);
        MirrorQuestSprites.update(t);
        MirrorHiddenSprite.update(t);
        // TownNPCs first so Stonehush (etc.) E-interacts win the same frame
        // before Ashwick's shared Travel.keys edge detection.
        TownNPCs.update(delta, t, state.playerPos);
        AshwickNPCs.update(delta, t, state.playerPos);
      } else {
        Goblins.update(delta, state.playerPos);
      }
      if (state.currentScene === 'cave' && Travel.player) {
        CaveInterior.update(delta, state.playerPos, Travel.player.rotation.y);
        Mining.update(delta, state.playerPos);
        TrollTrade.update(delta, state.playerPos);
      }
      if (BrotherScene.mesh) BrotherScene.update(delta, t);

      // ChunkManager — runs every frame BEFORE renderer.render() to set
      // visibility based on player chunk + camera frustum.
      const px = state.playerPos?.x ?? 0;
      const pz = state.playerPos?.z ?? 0;
      ChunkManager.update(px, pz, state.cameraYaw);

      SceneManager.updateTownLook();
      SceneManager.updateShadowFollow(state.playerPos);
      SceneManager.render();
      FPSCounter.tick();
    } finally {
      requestAnimationFrame(tick);
    }
  }
  requestAnimationFrame(tick);

  if (debugEnabled) {
    // Throttle debug overlay extra info (DOM updates can be costly).
    setInterval(() => {
      DebugOverlay.setExtra({
        cabinVisible: !!CabinInterior.group?.visible,
        envVisible: !!Environment.group?.visible,
        starsVisible: !!Environment.stars?.visible,
        westwindVisible: !!Westwind.group?.visible,
        teleportSeq: _teleportSeq,
        lastTeleport: _lastTeleport,
        playerPos: state.playerPos,
        cameraPos: SceneManager.camera
          ? {
              x: Number(SceneManager.camera.position.x.toFixed(2)),
              y: Number(SceneManager.camera.position.y.toFixed(2)),
              z: Number(SceneManager.camera.position.z.toFixed(2)),
            }
          : null,
      });
    }, 250);
  }

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
      gb: state.totalGoblinThefts || 0,
      q: state.quests,
      fl: state.flags,
      pt: Math.floor(state.playtimeSeconds || 0),
    });
    if (sig !== lastSignature) {
      lastSignature = sig;
      Save.write(state);
    }
  }, 3000);

  hideHUDChrome();
  Travel.pause();

  const hasSave = Save.exists();

  TitleScreen.show({ hasSave }).then(({ mode }) => {
    if (mode === 'continue' && hasSave) {
      const snapshot = Save.load();
      if (snapshot) {
        Save.apply(snapshot);
        if (snapshot.currentScene === 'cave') return resumeCaveFromSave();
        if (snapshot.currentScene === 'world') return resumeWorldFromSave();
        if (snapshot.currentScene === 'cabin') return enterCabin();
        // Stale/unknown scene — fall through using the same recovery rules
        // the auto-loader used to apply.
        if (state.hasSeenIntro && state.playerName) {
          if (!state.flags.friendsArrived) return void enterCabin();
          return void enterWestwind();
        }
      }
    }

    // New game (or fallback): wipe any prior save and run the original intro
    // flow. State is already at fresh defaults on page load — no need to
    // re-reset and risk swapping object references modules captured at init.
    Save.clear();
    IntroCutscene.start(() => {
      enterCabin();
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
