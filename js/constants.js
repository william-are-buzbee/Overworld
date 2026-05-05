// ==================== CONSTANTS ====================
export const TILE = 64, PIX = 2, SPR = 16;
export const VIEW_W = 20, VIEW_H = 11;

export const W_SURF = 224, H_SURF = 224;

// Biome target map resolution.  Change this and supply a matching NxN grid
// in BIOME_TARGET below.  Larger = finer biome control, smaller = broader zones.
// Use separate W/H if you ever want a non-square grid.
export const BIOME_GRID_W = 16;
export const BIOME_GRID_H = 16;

// Underground dimensions always match surface — change W_SURF/H_SURF and these follow.
export const W_UNDER = W_SURF;
export const H_UNDER = H_SURF;

// Layer 0 is always the surface.  All other indices are generated on demand.
// LAYER_SURFACE is kept for readability; LAYER_UNDER is now just a convention
// (the first underground layer the player discovers) — any layerIndex >= 1
// can be underground, lava, town, shop interior, etc.
export const LAYER_SURFACE = 0;
export const LAYER_UNDER   = 1;   // default underground entry point

// ==================== LAYER TYPE REGISTRY ====================
// Maps a layerIndex to the *kind* of map it should be.
// Entries are added lazily by the world generator so callers can query
// "what kind of layer is this?" without importing world-gen.
//   key   = layerIndex (number)
//   value = { type, w, h, seed, ...extra }
//
// Types: 'surface' | 'underground' | 'lava' | 'town' | 'shop'
export const LAYER_META = {};

// Helper — dimensions of an already-registered layer
export function layerDims(layerIndex) {
  const meta = LAYER_META[layerIndex];
  if (!meta) return null;
  return { w: meta.w, h: meta.h };
}

// ==================== TILE_VOID ====================
// Impassable, opaque void tile used to surround underground caves.
// Renders as pure black and blocks all movement and vision.
export const TILE_VOID = { walkable: false, transparent: false };

// ==================== BIOME PALETTES ====================

export const COL_FG = '#e8e8e8';
export const COL_MID = '#8a8a8a';

export const BIOME = {
  plains:    {bg:'#2a3020', fg:'#d4d8b8', mid:'#8a9270', tint:null},
  forest:    {bg:'#1a2618', fg:'#a8c088', mid:'#607848', tint:'#a8c088'},
  desert:    {bg:'#3a2e1a', fg:'#e0c890', mid:'#b09868', tint:'#d8b878'},
  rock:      {bg:'#2a2620', fg:'#c8c0a8', mid:'#807060', tint:'#b0a890'},
  water:     {bg:'#18202e', fg:'#88a0c8', mid:'#485878', tint:null},
  deep:      {bg:'#0a0e18', fg:'#506078', mid:'#283040', tint:null},
  lava:      {bg:'#2a100a', fg:'#e08060', mid:'#a04020', tint:'#d06040'},
  stone:     {bg:'#1e1c1a', fg:'#a8a8a0', mid:'#5c5a50', tint:'#b0b0b0'},
  cave:      {bg:'#0e0a0a', fg:'#787878', mid:'#484040', tint:'#888090'},
  uwater:    {bg:'#0a1218', fg:'#406080', mid:'#203040', tint:'#6890b0'},
  town:      {bg:'#20181a', fg:'#e0d8b8', mid:'#a08c70', tint:null},
  castle:    {bg:'#1a1a20', fg:'#d0d0d8', mid:'#6a6a78', tint:null},
  road:      {bg:'#241e18', fg:'#c0a878', mid:'#806848', tint:null},
  mushroom:  {bg:'#1a1820', fg:'#9878a8', mid:'#604878', tint:'#9070a0'},
  mushforest:{bg:'#1e1620', fg:'#a06838', mid:'#704890', tint:'#9070a0'},
  wheat:     {bg:'#2e2a18', fg:'#d4b860', mid:'#a08830', tint:null},
  wood_floor:{bg:'#1a1410', fg:'#8a6840', mid:'#584028', tint:null},

  // --- New / updated palettes ---
  beach:     {bg:'#3a3422', fg:'#e8d8a0', mid:'#b0a068', tint:'#d0c078'},
  dirt_road: {bg:'#2a2218', fg:'#a08860', mid:'#6e5a3a', tint:null},
  ruin:      {bg:'#1a1818', fg:'#706860', mid:'#484440', tint:'#585050'},
  void:      {bg:'#000000', fg:'#000000', mid:'#000000', tint:null},
  cave_wall: {bg:'#0c0a08', fg:'#1e1a16', mid:'#141210', tint:null},
  cave_rock: {bg:'#0a0a0a', fg:'#1a1a1a', mid:'#101010', tint:null},
  mud:       {bg:'#1a1c12', fg:'#5a6038', mid:'#3a4020', tint:'#4a5028'},
  fungal_grass:{bg:'#181420', fg:'#7a6898', mid:'#504060', tint:'#685880'},
  dirt:      {bg:'#28200e', fg:'#a08050', mid:'#6a5430', tint:null},
};

// ==================== PRICE CATEGORIES ====================
// Tiered INT-discount brackets.  Each item is tagged (or derived)
// into one of these so buyPriceMul / sellValueMul can apply the
// correct per-INT scaling.
//   staple   — food, basic supplies.          1% per INT above 1 (max ~9%).
//   standard — basic weapons, basic armor.    2% per INT above 1 (max ~18%).
//   luxury   — books, potions, high-end gear. 3% per INT above 1 (max ~27%).
export const PRICE_CAT = { STAPLE:'staple', STANDARD:'standard', LUXURY:'luxury' };

// ==================== FED MAX ====================
export const FED_MAX = 100;

// ==================== DAMAGE TYPES ====================
export const DMG = {
  BLADE:'blade', BLUNT:'blunt', FIRE:'fire', COLD:'cold', ELEC:'electric', POISON:'poison'
};

export const TAG_RESIST = {
  flesh:    {blade:1.2, blunt:0.9, fire:1.1, cold:1.0, electric:1.0, poison:1.2},
  bone:     {blade:0.35,blunt:1.7, fire:1.0, cold:0,   electric:0.9, poison:0},
  armored:  {blade:0.4, blunt:1.6, fire:0.8, cold:0.8, electric:1.1, poison:0.6},
  plant:    {blade:1.1, blunt:0.8, fire:2.0, cold:0.7, electric:1.1, poison:0.5},
  insect:   {blade:0.85,blunt:1.4, fire:1.4, cold:1.2, electric:1.1, poison:0.8},
  undead:   {blade:0.9, blunt:1.1, fire:1.3, cold:0,   electric:1.0, poison:0},
  fire:     {blade:1.0, blunt:1.0, fire:0,   cold:1.9, electric:1.2, poison:0},
  ice:      {blade:1.0, blunt:1.1, fire:1.9, cold:0,   electric:1.0, poison:0},
  aquatic:  {blade:1.0, blunt:1.0, fire:0.8, cold:1.0, electric:2.0, poison:1.0},
  stone:    {blade:0.3, blunt:1.6, fire:0.8, cold:1.0, electric:0.7, poison:0},
  cursed:   {blade:0.75,blunt:0.85,fire:1.5, cold:0,   electric:1.2, poison:0},
  beast:    {blade:1.1, blunt:1.0, fire:1.2, cold:1.0, electric:1.2, poison:1.1},
  scaled:   {blade:0.5, blunt:1.3, fire:1.0, cold:1.0, electric:1.0, poison:0.8},
  shelled:  {blade:0.4, blunt:1.5, fire:0.9, cold:0.9, electric:1.0, poison:0.7},
  fungal:   {blade:1.0, blunt:1.2, fire:1.5, cold:0.8, electric:1.0, poison:0},
  rockite:  {blade:0,   blunt:2.0, fire:0,   cold:0,   electric:0.8, poison:0},
};

export function resistMult(tags, dmgType){
  let m = 1;
  for (const t of tags){
    const r = TAG_RESIST[t];
    if (r && r[dmgType] != null){
      if (r[dmgType] === 0) return 0;
      m *= r[dmgType];
    }
  }
  return m;
}

// ==================== BIOME TARGET MAP ====================
// BIOME_GRID_W × BIOME_GRID_H low-resolution grid — the single source of truth
// for biome placement.  Each cell names the biome that owns that region.
// Surface generation reads this directly; no intermediate atmosphere fields
// are needed.
// Rows run north (0) → south (BIOME_GRID_H-1),
// columns west (0) → east (BIOME_GRID_W-1).
//
// The "mountain" biome has been removed.  All former mountain cells are now
// "rock", which uses walkable rock ground with boulder/outcrop cover.
// The former "water" biome has been split into "ocean" (deep open water)
// and "shallows" (coastal transition).  "stone" → "rock", "mushroom" →
// "fungal", "mud" → "wetland".
//
// Each cell is { biome, density }.  `density` (0.0–1.0) controls cover
// intensity — e.g. tree probability in forests — without changing biome
// identity.  The value is bilinearly interpolated across the map just
// like biome weights, so gradients between cells create natural treelines
// and density falloffs with no special-case code.
function B(biome, density) { return { biome, density }; }

// BIOME_TARGET — 16 x 16
// Generated by Biome Map Editor
//
// The "mountain" biome has been removed.  All former mountain cells are now
// "rock", which uses walkable rock ground with boulder/outcrop cover.
// The former "water" biome has been split into "ocean" (deep open water)
// and "shallows" (coastal transition).  "stone" → "rock", "mushroom" →
// "fungal", "mud" → "wetland".

export const BIOME_TARGET = [
  [B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('shallows',1.0), B('shallows',1.0), B('shallows',1.0), B('shallows',1.0), B('shallows',1.0), B('shallows',1.0), B('shallows',1.0), B('shallows',1.0), B('shallows',1.0), B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('ocean',1.0),    B('shallows',1.0), B('wetland',0.8),  B('wetland',0.6),  B('plains',0.4),   B('plains',0.7),   B('plains',1.0),   B('plains',1.0),   B('plains',0.7),   B('desert',0.5),   B('desert',1.0),   B('shallows',1.0), B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('ocean',1.0),    B('shallows',1.0), B('wetland',1.0),  B('plains',0.6),   B('forest',0.8),   B('forest',1.0),   B('forest',0.9),   B('plains',0.8),   B('rock',0.6),     B('desert',0.8),   B('desert',1.0),   B('shallows',1.0), B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('shallows',1.0), B('wetland',0.5),  B('plains',0.5),   B('forest',0.9),   B('forest',1.0),   B('forest',1.0),   B('forest',0.8),   B('rock',0.8),     B('rock',1.0),     B('desert',0.6),   B('desert',0.8),   B('shallows',1.0), B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('shallows',1.0), B('plains',0.5),   B('plains',0.8),   B('forest',0.7),   B('forest',0.9),   B('plains',1.0),   B('plains',0.8),   B('rock',1.0),     B('rock',0.8),     B('desert',0.5),   B('shallows',1.0), B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('shallows',1.0), B('plains',0.6),   B('plains',1.0),   B('plains',1.0),   B('plains',0.8),   B('plains',1.0),   B('plains',0.6),   B('rock',0.6),     B('plains',0.5),   B('shallows',1.0), B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('shallows',1.0), B('plains',0.5),   B('plains',0.8),   B('plains',0.6),   B('fungal',0.7),   B('fungal',1.0),   B('fungal',0.8),   B('plains',0.5),   B('shallows',1.0), B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('ocean',1.0),    B('shallows',1.0), B('plains',0.5),   B('fungal',0.5),   B('fungal',0.9),   B('fungal',1.0),   B('fungal',0.7),   B('wetland',0.6),  B('shallows',1.0), B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('ocean',1.0),    B('shallows',1.0), B('shallows',1.0), B('wetland',0.6),  B('wetland',0.8),  B('wetland',0.5),  B('shallows',1.0), B('shallows',1.0), B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('shallows',1.0), B('shallows',1.0), B('shallows',1.0), B('shallows',1.0), B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)],
  [B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0),    B('ocean',1.0)]
];














// ---- Target map validation ----
if (BIOME_TARGET.length !== BIOME_GRID_H) {
  console.warn(`BIOME_TARGET has ${BIOME_TARGET.length} rows but BIOME_GRID_H is ${BIOME_GRID_H}`);
}
for (let r = 0; r < BIOME_TARGET.length; r++) {
  if (BIOME_TARGET[r].length !== BIOME_GRID_W) {
    console.warn(`BIOME_TARGET row ${r} has ${BIOME_TARGET[r].length} cols but BIOME_GRID_W is ${BIOME_GRID_W}`);
    break;          // one warning is enough
  }
}

// ==================== BIOME PROFILES ====================
// Self-contained definition for every biome that appears on the target map.
// Adding a new biome = adding one entry here + placing it on BIOME_TARGET.
//
// Fields:
//   groundPalette — { terrainType: weight } map of weighted ground types.
//                   Weights should sum to 1.0.  During generation, palettes
//                   from blended biomes are interpolated by distance, and
//                   a noise field selects the ground type per tile.
//   ground        — legacy: dominant ground type (highest palette weight).
//                   Kept for downstream code that reads a single ground type.
//   covers        — array of { type, chance } objects.  Each is rolled
//                   independently per tile; first hit wins.
//   lakeChance    — probability of a coherent water pocket (noise-gated)
//   palette       — key into the BIOME palette table (for rendering)
//   derived       — { moisture, elevation, fungal } values written to the
//                   atmosphere fields so downstream systems can query them.
//                   These do NOT drive biome selection.

export const BIOME_PROFILES = {
  plains: {
    groundPalette: { 0: 0.85, 57: 0.15 },   // grass 85%, dirt 15%
    ground: 0,                                // legacy: dominant ground (T.GRASS)
    covers: [
      { type: 1, chance: 0.08 },              // sparse trees
    ],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0.005 + density * 0.025;
      return null;
    },
    lakeChance: 0.015,
    palette: 'plains',
    derived: { moisture: 0.35, elevation: 0.30, fungal: 0 },
  },
  forest: {
    groundPalette: { 0: 0.9, 57: 0.1 },      // grass 90%, dirt 10%
    ground: 0,
    covers: [
      { type: 1, chance: 0.70 },              // dense canopy
    ],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0.03 + density * 0.89;
      return null;
    },
    lakeChance: 0.008,
    palette: 'forest',
    derived: { moisture: 0.58, elevation: 0.38, fungal: 0 },
  },
  desert: {
    groundPalette: { 2: 1.0 },                // sand 100%
    ground: 2,
    covers: [],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0;
      return null;
    },
    lakeChance: 0,
    palette: 'desert',
    derived: { moisture: 0.10, elevation: 0.40, fungal: 0 },
  },
  rock: {
    groundPalette: { 3: 1.0 },                // rock 100%
    ground: 3,
    covers: [
      { type: 53, chance: 0.10 },             // boulders
      { type: 54, chance: 0.08 },             // rock outcrops
    ],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0;
      return null;
    },
    lakeChance: 0,
    palette: 'rock',
    derived: { moisture: 0.18, elevation: 0.80, fungal: 0 },
  },
  ocean: {
    groundPalette: { 5: 0.7, 4: 0.3 },       // deep_water 70%, water 30%
    ground: 5,
    covers: [],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0;
      return null;
    },
    lakeChance: 0,
    palette: 'water',
    derived: { moisture: 0.90, elevation: 0.10, fungal: 0 },
  },
  shallows: {
    groundPalette: { 4: 0.7, 0: 0.15, 2: 0.15 }, // water 70%, grass 15%, sand 15%
    ground: 4,
    covers: [],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0;
      return null;
    },
    lakeChance: 0,
    palette: 'water',
    derived: { moisture: 0.80, elevation: 0.15, fungal: 0 },
  },
  wetland: {
    groundPalette: { 55: 0.4, 4: 0.3, 0: 0.3 }, // mud 40%, water 30%, grass 30%
    ground: 55,
    covers: [],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0.01 + density * 0.04;
      return null;
    },
    lakeChance: 0.02,
    palette: 'mud',
    derived: { moisture: 0.70, elevation: 0.25, fungal: 0 },
  },
  fungal: {
    groundPalette: { 56: 0.9, 55: 0.1 },     // fungal_grass 90%, mud 10%
    ground: 56,
    covers: [
      { type: 8, chance: 0.80 },              // mushroom forest
    ],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0;
      return null;
    },
    lakeChance: 0,
    palette: 'fungal_grass',
    derived: { moisture: 0.45, elevation: 0.35, fungal: 0.65 },
  },
};

// ==================== BLEND TUNING ====================
// Controls how wide (in world tiles) the transition zone is between
// adjacent biomes.  Higher = softer gradient, lower = sharper edge.
// The bilinear sampling of the target map over the world grid gives a
// natural blend whose width scales with (W_SURF / BIOME_GRID_W).
// BLEND_WIDTH adds noise-driven waviness on top of that.
export const BLEND_WIDTH = 8;

// ==================== ATMOSPHERE FIELD STORAGE ====================
// Populated by surface-gen with values *derived from* the biome profile,
// NOT used to select biomes.  Downstream systems (fire spread, creature
// comfort, etc.) may query these; for now they are inert.
// Structure: { moisture: Float32Array, elevation: Float32Array,
//              fungal: Float32Array, w: number, h: number }
// Access pattern: fields.moisture[y * w + x]
export const ATMOSPHERE = {};

// Helper: query atmosphere value at a tile coordinate
export function getAtmosphere(x, y) {
  const a = ATMOSPHERE;
  if (!a.w) return { moisture: 0.5, elevation: 0.5, fungal: 0 };
  const cx = Math.max(0, Math.min(a.w - 1, Math.floor(x)));
  const cy = Math.max(0, Math.min(a.h - 1, Math.floor(y)));
  const idx = cy * a.w + cx;
  return {
    moisture:  a.moisture  ? a.moisture[idx]  : 0.5,
    elevation: a.elevation ? a.elevation[idx] : 0.5,
    fungal:    a.fungal    ? a.fungal[idx]    : 0,
  };
}

// ==================== DIFFICULTY ====================
export const DIFFICULTIES = {
  easy:   {label:'Easy',    enemyHp:0.75, enemyAtk:0.70, goldMul:1.30, foodMul:1.30, startGold:60, startPoints:14},
  normal: {label:'Normal',  enemyHp:1.00, enemyAtk:1.00, goldMul:1.00, foodMul:1.00, startGold:30, startPoints:12},
  hard:   {label:'Hard',    enemyHp:1.25, enemyAtk:1.25, goldMul:0.80, foodMul:0.80, startGold:20, startPoints:10},
};
