// Mirror Town quest target locations (world XZ).

export const MIRROR_TOWN_CENTER = { x: 200, z: -7800 };

// Pinned villager posts (slots 0..3) — keep in sync with TownNPCs mirror NPCs.
export const MIRROR_VILLAGER_POSTS = [
  { x: 186, z: -7792 },
  { x: 214, z: -7798 },
  { x: 192, z: -7810 },
  { x: 208, z: -7812 },
];

// Wetland area (used by the Mirror Town quest "guide"/"found" steps).
// Keep this location (world XZ). Environment hills/rocks must not overlap it.
export const MIRROR_WETLAND_CENTER = { x: 420, z: -8120 };
export const MIRROR_WETLAND_R = 140;

// A specific spot inside the wetland to "find the hidden mirror".
export const MIRROR_HIDDEN_MIRROR_SPOT = { x: 452, z: -8208 };
export const MIRROR_HIDDEN_MIRROR_R = 10;

