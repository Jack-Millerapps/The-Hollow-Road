export const state = {
  currencies: { gold: 50, memories: 3, promises: 2, years: 0, secrets: 2 },
  reputation: { ashwick: 0, veilMarket: 0, stonehush: 0 },
  wholeness: 1.0,
  inventory: [],
  cameraZ: 0,
  isWalking: false,
  currentVillage: null,
  tradeComplete: { ashwick: false, veilMarket: false, stonehush: false },
  dominantSacrifice: null,
  spent: { gold: 0, memories: 0, promises: 0, years: 0, secrets: 0 },
  seenRoadEvents: new Set(),
  flags: {
    endingStarted: false,
    endingComplete: false,
    nextVillageHintShown: false,
  },
};

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
  return Object.entries(cost).every(([k, v]) => state.currencies[k] >= v);
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
  }
  notify();
}

export function addInventory(item) {
  state.inventory.push(item);
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
