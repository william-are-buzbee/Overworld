// ==================== CONSTANTS ====================
export const TILE = 64, PIX = 2, SPR = 16;
export const VIEW_W = 17, VIEW_H = 11;

export const W_SURF = 112, H_SURF = 112;
export const W_UNDER = W_SURF, H_UNDER = H_SURF;

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
  mountain:  {bg:'#262420', fg:'#c8c0b0', mid:'#807868', tint:'#c8c8d0'},
  water:     {bg:'#18202e', fg:'#88a0c8', mid:'#485878', tint:null},
  deep:      {bg:'#0a0e18', fg:'#506078', mid:'#283040', tint:null},
  lava:      {bg:'#2a100a', fg:'#e08060', mid:'#a04020', tint:'#d06040'},
  stone:     {bg:'#161414', fg:'#a0a0a0', mid:'#585858', tint:'#b0b0b0'},
  cave:      {bg:'#0e0a0a', fg:'#787878', mid:'#484040', tint:'#888090'},
  uwater:    {bg:'#0a1218', fg:'#406080', mid:'#203040', tint:'#6890b0'},
  town:      {bg:'#20181a', fg:'#e0d8b8', mid:'#a08c70', tint:null},
  castle:    {bg:'#1a1a20', fg:'#d0d0d8', mid:'#6a6a78', tint:null},
  road:      {bg:'#241e18', fg:'#c0a878', mid:'#806848', tint:null},
  mushroom:  {bg:'#1a1820', fg:'#9878a8', mid:'#604878', tint:'#9070a0'},
  mushforest:{bg:'#1e1620', fg:'#a06838', mid:'#704890', tint:'#9070a0'},
  wheat:     {bg:'#2e2a18', fg:'#d4b860', mid:'#a08830', tint:null},
  wood_floor:{bg:'#1a1410', fg:'#8a6840', mid:'#584028', tint:null},

  // --- New palettes ---
  beach:     {bg:'#3a3422', fg:'#e8d8a0', mid:'#b0a068', tint:'#d0c078'},
  dirt_road: {bg:'#2a2218', fg:'#a08860', mid:'#6e5a3a', tint:null},
  ruin:      {bg:'#1a1818', fg:'#706860', mid:'#484440', tint:'#585050'},
  void:      {bg:'#000000', fg:'#000000', mid:'#000000', tint:null},
  rock:      {bg:'#0a0a0a', fg:'#1a1a1a', mid:'#101010', tint:null},
};

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

// ==================== ATMOSPHERE NOISE CONFIG ====================
// Noise parameters for each atmosphere field.
//   octaves    — number of noise layers
//   frequency  — base sample frequency (lower = larger features)
//   lacunarity — frequency multiplier per octave
//   gain       — amplitude multiplier per octave
//   seedOffset — added to world seed for this field
export const ATMOSPHERE_NOISE = {
  moisture:  { octaves: 4, frequency: 0.028, lacunarity: 2.0, gain: 0.50, seedOffset: 1   },
  elevation: { octaves: 4, frequency: 0.024, lacunarity: 2.0, gain: 0.48, seedOffset: 2   },
  fungal:    { octaves: 3, frequency: 0.050, lacunarity: 2.0, gain: 0.50, seedOffset: 3   },
};

// ==================== BIOME TARGET MAP ====================
// 16×16 low-resolution grid guiding atmosphere field generation.
// Each cell names the dominant biome for a region of the map.
// Rows run north (0) → south (15), columns west (0) → east (15).
export const BIOME_TARGET = [
  ['mountain','mountain','forest','forest','forest','forest','forest','forest','forest','forest','stone','forest','stone','plains','forest','stone'],
  ['mountain','mountain','forest','forest','forest','forest','forest','forest','forest','stone','stone','stone','stone','stone','stone','stone'],
  ['mountain','mountain','forest','plains','plains','plains','plains','plains','plains','stone','stone','stone','stone','stone','stone','stone'],
  ['mountain','mountain','plains','forest','plains','plains','plains','plains','plains','plains','plains','stone','stone','stone','water','stone'],
  ['mountain','mountain','forest','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','water','water','water'],
  ['mountain','forest','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','water','water','water','water'],
  ['mountain','mountain','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','water','water','water','water'],
  ['mountain','plains','plains','forest','plains','plains','plains','plains','plains','plains','plains','plains','water','water','water','water'],
  ['mountain','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','plains','water','water','water','water'],
  ['mountain','plains','mountain','plains','plains','desert','desert','desert','desert','desert','plains','plains','plains','plains','mushroom','mushroom'],
  ['mountain','plains','plains','plains','desert','desert','desert','desert','desert','desert','desert','plains','mushroom','mushroom','mushroom','mushroom'],
  ['mountain','plains','plains','desert','desert','desert','desert','desert','desert','desert','desert','mushroom','mushroom','mushroom','mushroom','mushroom'],
  ['mountain','plains','desert','desert','desert','desert','desert','desert','desert','desert','mushroom','mushroom','mushroom','mushroom','mushroom','mushroom'],
  ['mountain','plains','desert','desert','desert','desert','desert','desert','desert','desert','desert','mushroom','mushroom','mushroom','mushroom','mushroom'],
  ['mountain','plains','desert','desert','desert','desert','desert','desert','desert','desert','desert','mushroom','mushroom','mushroom','plains','mushroom'],
  ['mountain','mountain','desert','desert','desert','desert','desert','desert','desert','mushroom','desert','desert','mushroom','mushroom','mushroom','mushroom'],
];
 

// Target biases per biome — what atmosphere values each biome pulls toward.
// Each entry: { moisture, elevation, fungal } where each is a target value (0–1).
// null means "don't bias this field, let noise decide."
export const BIOME_TARGET_BIAS = {
  plains:   { moisture: 0.35, elevation: 0.30, fungal: null   },
  forest:   { moisture: 0.58, elevation: 0.38, fungal: null   },
  desert:   { moisture: 0.10, elevation: 0.40, fungal: null   },
  mountain: { moisture: null,  elevation: 0.82, fungal: null   },
  stone:    { moisture: 0.18, elevation: 0.80, fungal: null   },
  mushroom: { moisture: 0.45, elevation: 0.35, fungal: 0.65   },
  water:    { moisture: 0.90, elevation: 0.15, fungal: null   },
};

// ==================== BIOME RULES TABLE ====================
// Each rule is tested in order; the first match wins.
//   moisture, elevation, fungal — [min, max] ranges (0–1 inclusive)
//   ground  — terrain type for the ground layer (use T.* constants)
//   cover   — terrain type for the cover layer, or 0 for none
//   coverChance — probability (0–1) of actually placing cover (for sparse biomes)
//
// Import T dynamically — the rules reference numeric constants from terrain.js.
// We store the raw numbers here; world-gen resolves them via T.
//
// NOTE: ground/cover values are set to numeric IDs matching terrain.js T.*
//       0=PLAINS, 1=FOREST, 2=DESERT, 3=MOUNTAIN, 4=WATER, 5=DEEP,
//       8=MUSHFOREST, 11=CAVE
export const BIOME_RULES = [
  // === Fungal override (mushroom forest) — small, southeast-biased field ===
  { fungal: [0.40, 1.0], moisture: [0.0, 1.0], elevation: [0.0, 0.75],
    ground: 11, cover: 8, coverChance: 1.0 },

  // === Very high moisture → deep water / water ===
  { moisture: [0.84, 1.0], elevation: [0.0, 1.0], fungal: [0.0, 1.0],
    ground: 5, cover: 0, coverChance: 0 },
  { moisture: [0.72, 0.84], elevation: [0.0, 0.65], fungal: [0.0, 1.0],
    ground: 4, cover: 0, coverChance: 0 },

  // === Low moisture + high elevation → stone / mountain ===
  { moisture: [0.0, 0.30], elevation: [0.72, 1.0], fungal: [0.0, 1.0],
    ground: 3, cover: 0, coverChance: 0 },

  // === Very low moisture → desert ===
  { moisture: [0.0, 0.22], elevation: [0.0, 0.72], fungal: [0.0, 1.0],
    ground: 2, cover: 0, coverChance: 0 },

  // === High elevation → mountains ===
  { moisture: [0.0, 1.0], elevation: [0.72, 1.0], fungal: [0.0, 1.0],
    ground: 3, cover: 0, coverChance: 0 },

  // === Medium-high moisture + medium-high elevation → mountain with scattered trees ===
  { moisture: [0.40, 1.0], elevation: [0.58, 0.72], fungal: [0.0, 1.0],
    ground: 3, cover: 1, coverChance: 0.30 },

  // === Lowland plains (tree cover applied as smooth moisture gradient in surface-gen) ===
  { moisture: [0.22, 0.72], elevation: [0.0, 0.58], fungal: [0.0, 1.0],
    ground: 0, cover: 0, coverChance: 0 },

  // === Default → plains ===
  { moisture: [0.0, 1.0], elevation: [0.0, 1.0], fungal: [0.0, 1.0],
    ground: 0, cover: 0, coverChance: 0 },
];

// ==================== ATMOSPHERE FIELD STORAGE ====================
// Filled by world-gen.js after field generation.
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
