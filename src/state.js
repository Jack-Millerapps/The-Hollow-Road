// ---------------------------------------------------------------------------
// The Hollow Road — global game state
// ---------------------------------------------------------------------------

export const SAVE_VERSION = 8;

function freshDefaults() {
  return {
    currencies: { gold: 50, memories: 3, promises: 2, years: 1, secrets: 2 },
    reputation: {
      ashwick: 0,
      veilMarket: 0,
      stonehush: 0,
      deeproot: 0,
      mirrorTown: 0,
    },
    wholeness: 1.0,
    inventory: [],
    // Consolidation — the player starts with NOTHING. Items are granted
    // by the brother (backpack) and the three friends in Westwind.
    items: {
      backpack: false,
      shovel: false,
      pickaxe: false,
      ripMap: false,
      watch: false,
      sleepingBag: false,
      carving: false,
    },
    cameraZ: 0,
    playerPos: { x: 0, z: 500 },
    isWalking: false,
    currentVillage: null,
    tradeComplete: {
      ashwick: false,
      veilMarket: false,
      stonehush: false,
      deeproot: false,
      mirrorTown: false,
    },
    dominantSacrifice: null,
    spent: { gold: 0, memories: 0, promises: 0, years: 0, secrets: 0 },
    seenRoadEvents: new Set(),
    flags: {
      endingStarted: false,
      endingComplete: false,
      nextVillageHintShown: false,
      hasLeftWestwind: false,
      // Phase 4 / consolidation flags
      ashwickTaskDone: false,
      stonehushTaskDone: false,
      deeprootTaskDone: false,
      mirrorSeen: false,
      treeAccepted: false,
      veilFirstEncounterDone: false,
      // Consolidation additions
      seenControls: false,
      seenFirstNightWarning: false,
      // Friend gifting gates
      friendMiraGifted: false,
      friendTomasGifted: false,
      friendElenGifted: false,
      brotherGaveBackpack: false,
      // Friends-arrive sequence + HUD tutorial (bugs 6 & 7)
      friendsArrived: false,
      seenHudTutorial: false,
      /** False until first Ashwick zone entry — blocks night on leg 1. */
      leg1Complete: false,
      /** One-time contextual tutorial (Tutorial.js). */
      tutorialComplete: false,
      tutorialS1Move: false,
      tutorialS2Look: false,
      tutorialS3Interact: false,
      tutorialS4Inventory: false,
      tutorialS5Night: false,
      tutorialS6Cave: false,
      tutorialS7Quest: false,
      tutorialS8Currency: false,
    },
    // -- Phase 1 --------------------------------------------------------------
    playerName: '',
    hasSeenIntro: false,
    currentScene: 'cutscene',
    gameTime: 0,
    // -- Phase 2 --------------------------------------------------------------
    stamina: 1.0,
    maxStamina: 1.0,
    isSprinting: false,
    timePaused: false,
    dialogueActive: false,
    // -- Phase 3 --------------------------------------------------------------
    offRoad: false,
    currentCaveId: null,
    mapPieces: new Set(),
    mined: {},
    trollsTraded: [],
    // -- Phase 4 / consolidation ---------------------------------------------
    totalGoblinThefts: 0,
    tasksCompleted: [],
    veilMarketSpawnCount: 0,
    playtimeSeconds: 0,
    // Consolidation — quests replace MapShop / SpecialTasks.
    quests: {
      ashwick: {
        step: 0,
        done: false,
        branch: null,
        spokeMaren: false,
        spokeDov: false,
        spokeSera: false,
      },
      stonehush: { step: 0, done: false, branch: null },
      deeproot: { step: 0, done: false, branch: null },
      mirrorTown: { step: 0, done: false, branch: null },
    },
    // View state
    cameraYaw: 0,
    cameraPitch: 0,
    // -- Pause + physics ------------------------------------------------------
    paused: false,
    velocityY: 0,
    isGrounded: false,
    needsPointerRelock: false,
    saveVersion: SAVE_VERSION,
  };
}

export const state = freshDefaults();

export function createDefaultState() {
  return freshDefaults();
}

export function mergeDefaults(target) {
  const d = freshDefaults();
  for (const key of Object.keys(d)) {
    if (target[key] === undefined) {
      target[key] = d[key];
      continue;
    }
    if (
      d[key] &&
      typeof d[key] === 'object' &&
      !Array.isArray(d[key]) &&
      !(d[key] instanceof Set) &&
      typeof target[key] === 'object' &&
      target[key] !== null &&
      !Array.isArray(target[key]) &&
      !(target[key] instanceof Set)
    ) {
      for (const sub of Object.keys(d[key])) {
        if (target[key][sub] === undefined) target[key][sub] = d[key][sub];
        // One-level deeper merge for quests sub-objects
        if (
          d[key][sub] &&
          typeof d[key][sub] === 'object' &&
          target[key][sub] &&
          typeof target[key][sub] === 'object' &&
          !Array.isArray(d[key][sub])
        ) {
          for (const k2 of Object.keys(d[key][sub])) {
            if (target[key][sub][k2] === undefined) {
              target[key][sub][k2] = d[key][sub][k2];
            }
          }
        }
      }
    }
  }
  return target;
}

const subs = new Set();

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function notify() {
  for (const fn of subs) fn(state);
}

export function canAfford(cost) {
  if (!cost) return true;
  return Object.entries(cost).every(([k, v]) => (state.currencies[k] || 0) >= v);
}

export function spend(type, amount) {
  state.currencies[type] = (state.currencies[type] ?? 0) - amount;
  state.spent[type] = (state.spent[type] ?? 0) + amount;
  if (type === 'memories') {
    state.wholeness = Math.max(0, state.wholeness - 0.1 * amount);
  } else if (type === 'years') {
    state.wholeness = Math.max(0, state.wholeness - 0.2 * amount);
  }
  notify();
}

export function gain(type, amount) {
  state.currencies[type] = (state.currencies[type] ?? 0) + amount;
  if (type === 'years') {
    state.wholeness = Math.min(1, state.wholeness + 0.15 * amount);
  } else if (type === 'memories') {
    state.wholeness = Math.min(1, state.wholeness + 0.05 * amount);
  }
  notify();
}

export function addInventory(item) {
  state.inventory.push(item);
  notify();
}

export function grantItem(key) {
  state.items[key] = true;
  notify();
}

export function computeDominantSacrifice() {
  const entries = Object.entries(state.spent);
  const totalSpent = entries.reduce((sum, [, v]) => sum + v, 0);
  if (totalSpent === 0) {
    state.dominantSacrifice = 'none';
    return state.dominantSacrifice;
  }
  entries.sort((a, b) => b[1] - a[1]);
  state.dominantSacrifice = entries[0][0];
  return state.dominantSacrifice;
}
