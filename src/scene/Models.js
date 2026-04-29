// ---------------------------------------------------------------------------
// Models.js — single source of truth for every GLB asset in the game.
//
// Each entry: {
//   path:       URL relative to /public (Vite serves these)
//   tier:       'core' | 'westwind' | 'cave' | 'road' | 'town:<id>'
//   scale:      uniform scale multiplier
//   yOffset:    additional y offset applied after scale
//   anims:      animation clip name hints { walk, run, jump, idle }
// }
//
// Tier semantics (see ModelLoader.js):
//   core      — fetched at start; small + always-needed models
//   westwind  — fetched while the cabin intro plays (hidden by world fade)
//   cave      — fetched on first cave entry
//   road      — fetched lazily when player crosses a chunk boundary
//   town:<id> — fetched when player gets within 400 u of that town
// ---------------------------------------------------------------------------

const M = '/Models/';

// URL-encode the path segments that contain spaces (Vite serves files raw,
// the browser needs the URL-encoded form to fetch them).
function p(s) {
  // Just encode spaces to %20 — leave / intact.
  return s.replace(/ /g, '%20');
}

export const MODELS = {
  // ----- Bipeds (animated) ---------------------------------------------------
  player: {
    path: p(M + 'Meshy_AI_Lantern_Bearer_biped 2/Meshy_AI_Lantern_Bearer_biped_Animation_Walking_withSkin.glb'),
    extraClips: [
      p(M + 'Meshy_AI_Lantern_Bearer_biped 2/Meshy_AI_Lantern_Bearer_biped_Animation_Running_withSkin.glb'),
      p(M + 'Meshy_AI_Lantern_Bearer_biped 2/Meshy_AI_Lantern_Bearer_biped_Animation_Regular_Jump_withSkin.glb'),
    ],
    tier: 'core',
    scale: 1.0,
    yOffset: 0,
    anims: { walk: 'Walking', run: 'Running', jump: 'Jump' },
  },
  brother: {
    path: M + 'Meshy_AI_A_lean_young_man_in_a_biped/Meshy_AI_A_lean_young_man_in_a_biped_Animation_Walking_withSkin.glb',
    extraClips: [
      M + 'Meshy_AI_A_lean_young_man_in_a_biped/Meshy_AI_A_lean_young_man_in_a_biped_Animation_Running_withSkin.glb',
    ],
    tier: 'core',
    scale: 1.0,
    yOffset: 0,
    anims: { walk: 'Walking', run: 'Running' },
  },
  friendMira: {
    path: M + 'Meshy_AI_A_compact_woman_in_a__biped/Meshy_AI_A_compact_woman_in_a__biped_Animation_Walking_withSkin.glb',
    extraClips: [
      M + 'Meshy_AI_A_compact_woman_in_a__biped/Meshy_AI_A_compact_woman_in_a__biped_Animation_Running_withSkin.glb',
    ],
    tier: 'core',
    scale: 1.0,
    yOffset: 0,
    anims: { walk: 'Walking', run: 'Running' },
  },
  friendTomas: {
    path: M + 'Meshy_AI_A_plain_low_poly_huma_biped/Meshy_AI_A_plain_low_poly_huma_biped_Animation_Walking_withSkin.glb',
    extraClips: [
      M + 'Meshy_AI_A_plain_low_poly_huma_biped/Meshy_AI_A_plain_low_poly_huma_biped_Animation_Running_withSkin.glb',
    ],
    tier: 'core',
    scale: 1.0,
    yOffset: 0,
    anims: { walk: 'Walking', run: 'Running' },
  },
  friendElen: {
    path: M + 'Meshy_AI_A_young_woman_in_a_da_biped/Meshy_AI_A_young_woman_in_a_da_biped_Animation_Walking_withSkin.glb',
    extraClips: [
      M + 'Meshy_AI_A_young_woman_in_a_da_biped/Meshy_AI_A_young_woman_in_a_da_biped_Animation_Running_withSkin.glb',
    ],
    tier: 'core',
    scale: 1.0,
    yOffset: 0,
    anims: { walk: 'Walking', run: 'Running' },
  },
  npcLantern: {
    path: M + 'Meshy_AI_Lantern_Bearer_biped/Meshy_AI_Lantern_Bearer_biped_Animation_Walking_withSkin.glb',
    extraClips: [
      M + 'Meshy_AI_Lantern_Bearer_biped/Meshy_AI_Lantern_Bearer_biped_Animation_Running_withSkin.glb',
    ],
    tier: 'core',
    scale: 1.0,
    yOffset: 0,
    anims: { walk: 'Walking', run: 'Running' },
  },
  npcOlderMan: {
    path: M + 'Meshy_AI_An_older_man_in_a_dar_biped/Meshy_AI_An_older_man_in_a_dar_biped_Animation_Walking_withSkin.glb',
    extraClips: [
      M + 'Meshy_AI_An_older_man_in_a_dar_biped/Meshy_AI_An_older_man_in_a_dar_biped_Animation_Running_withSkin.glb',
    ],
    tier: 'core',
    scale: 1.0,
    yOffset: 0,
    anims: { walk: 'Walking', run: 'Running' },
  },
  npcBroad: {
    path: M + 'Meshy_AI_A_large_broad_shoulde_biped/Meshy_AI_A_large_broad_shoulde_biped_Animation_Walking_withSkin.glb',
    extraClips: [
      M + 'Meshy_AI_A_large_broad_shoulde_biped/Meshy_AI_A_large_broad_shoulde_biped_Animation_Running_withSkin.glb',
    ],
    tier: 'core',
    scale: 1.0,
    yOffset: 0,
    anims: { walk: 'Walking', run: 'Running' },
  },
  npcSymmetrical: {
    path: M + 'Meshy_AI_A_symmetrical_figure__biped/Meshy_AI_A_symmetrical_figure__biped_Animation_Walking_withSkin.glb',
    extraClips: [
      M + 'Meshy_AI_A_symmetrical_figure__biped/Meshy_AI_A_symmetrical_figure__biped_Animation_Running_withSkin.glb',
    ],
    tier: 'core',
    scale: 1.0,
    yOffset: 0,
    anims: { walk: 'Walking', run: 'Running' },
  },
  veilWanderer: {
    path: M + 'Meshy_AI_A_robed_masked_figure_biped/Meshy_AI_A_robed_masked_figure_biped_Animation_Walking_withSkin.glb',
    extraClips: [
      M + 'Meshy_AI_A_robed_masked_figure_biped/Meshy_AI_A_robed_masked_figure_biped_Animation_Running_withSkin.glb',
    ],
    tier: 'road',
    scale: 1.0,
    yOffset: 0,
    anims: { walk: 'Walking', run: 'Running' },
  },

  // ----- Static props (core, small / always-loaded) -------------------------
  pocketWatch: {
    path: M + 'Meshy_AI_A_small_brass_pocket__0426205320_texture.glb',
    tier: 'core',
    scale: 1.0,
    yOffset: 0,
  },
  troll: {
    path: M + 'Meshy_AI_A_large_low_poly_trol_0426213448_texture.glb',
    tier: 'core',
    scale: 1.0,
    yOffset: 0,
  },

  // ----- Westwind tier (loaded during cabin intro) --------------------------
  hamlet: {
    path: M + 'Meshy_AI_Cozy_timber_hamlet_3_0427000431_texture.glb',
    tier: 'westwind',
    scale: 1.0,
    yOffset: 0,
  },

  // ----- Cave tier (lazy on first cave entry) -------------------------------
  caveArch: {
    path: M + 'Meshy_AI_A_rough_hewn_stone_ar_0426205658_texture.glb',
    tier: 'cave',
    scale: 1.0,
    yOffset: 0,
  },
  caveFloor: {
    path: M + 'Meshy_AI_A_rough_stone_cave_fl_0426204449_texture.glb',
    tier: 'cave',
    scale: 1.0,
    yOffset: 0,
  },
  caveSleeping: {
    path: M + 'Meshy_AI_A_rough_stone_sleepin_0426205646_texture.glb',
    tier: 'cave',
    scale: 1.0,
    yOffset: 0,
  },
  caveMassiveStone: {
    path: M + 'Meshy_AI_A_massive_rough_cut_s_0426205710_texture.glb',
    tier: 'cave',
    scale: 1.0,
    yOffset: 0,
  },
  caveAncient: {
    path: M + 'Meshy_AI_A_6_unit_wide_ancient_0426204424_texture.glb',
    tier: 'cave',
    scale: 1.0,
    yOffset: 0,
  },
  rockFormation: {
    path: M + 'Meshy_AI_Same_rock_formation_a_0426205636_texture.glb',
    tier: 'cave',
    scale: 1.0,
    yOffset: 0,
  },

  // ----- Road tier (lazy as player walks) -----------------------------------

  // ----- Town shells (per-town tiers, streamed at 400u radius) --------------
  townMill: {
    // Ashwick
    path: M + 'Meshy_AI_Mill_town_centered_on_0427000549_texture.glb',
    tier: 'town:ashwick',
    scale: 1.0,
    yOffset: 0,
  },
  townStone: {
    path: M + 'Meshy_AI_Silent_grey_stone_vil_0427000701_texture.glb',
    tier: 'town:stonehush',
    scale: 1.0,
    yOffset: 0,
  },
  townPristine: {
    path: M + 'Meshy_AI_Pristine_symmetrical__0427000735_texture.glb',
    tier: 'town:mirrorTown',
    scale: 1.0,
    yOffset: 0,
  },
  townForest: {
    path: M + 'Meshy_AI_Warm_forest_settlemen_0427000620_texture.glb',
    tier: 'town:deeproot',
    scale: 1.0,
    yOffset: 0,
  },
  townBarely: {
    path: M + 'Meshy_AI_Barely_visible_settle_0427000841_texture.glb',
    tier: 'town:unnamed',
    scale: 1.0,
    yOffset: 0,
  },
};

// Map town id → trigger anchor for streamByPlayerPos.
export const TOWN_ANCHORS = {
  ashwick:    { x: 0,    z: -500,   radius: 400 },
  stonehush:  { x: -800, z: -5000,  radius: 400 },
  deeproot:   { x: 600,  z: -6000,  radius: 400 },
  mirrorTown: { x: 200,  z: -7800,  radius: 400 },
  unnamed:    { x: 0,    z: -14500, radius: 500 },
};

// Look up models by tier (used by ModelLoader).
export function modelsByTier(tier) {
  return Object.entries(MODELS)
    .filter(([, def]) => def.tier === tier)
    .map(([key]) => key);
}
