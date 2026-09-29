// ==================== SPECIES RECORDS, SPAWNING, PERSONALITIES ====================
// What a species is beyond its body map: name, sprite, where it lives, how it
// holds territory, its clade and wander profile, and how it is spawned. There
// are no stats here. Mass, senses, cognition, dodge, accuracy and damage are
// all read from the body map (body-maps.js, physiology.js, combat-constants.js).
import { LAYER_SURFACE, CREATURE_PATHWAYS, initBodyMap } from './constants.js';
import { T } from './terrain.js';
import { rand, randi } from './rng.js';

// The six species of the current fauna (Notes/Surface-Creatures.md). Keys are
// the legacy creature keys the body maps and sprites still use.
//   hostility  0 passive, 1 territorial, 2 aggressive (legacy AI reads it)
//   aggroRange legacy detection radius for the chase state
//   territory  tiles the creature will roam; chase/search are legacy chase-state lengths
const MON = {
  hare: {
    name: 'Small Grazer', sprite: 'SMALL_GRAZER',
    tags: ['flesh', 'beast'],
    biomes: [T.GRASS], layer: LAYER_SURFACE,
    hostility: 0, aggroRange: 2,
    territory: [T.GRASS, T.DIRT, T.BEACH],
    chase: 0, search: 0,
    tint: '#7a8070',           // muted gray-green, plated integument
  },
  wolf: {
    name: 'Meso-Predator', sprite: 'MESO_PRED',
    tags: ['flesh', 'beast'],
    biomes: [T.FOREST], layer: LAYER_SURFACE,
    hostility: 1, aggroRange: 3,
    territory: [T.FOREST, T.GRASS, T.MUD, T.DIRT, T.BEACH],   // roams freely across most terrain
    chase: 5, search: 2,       // solo chase ~5 tiles; personalities adjust for pack/wary
    tint: '#5a4a40',           // dark warm gray-brown, wrinkled skin
  },
  dire_wolf: {
    name: 'Apex Predator', sprite: 'APEX_PRED',
    tags: ['flesh', 'beast'],
    biomes: [T.FOREST], layer: LAYER_SURFACE,
    hostility: 1, aggroRange: 3,
    territory: [T.FOREST, T.GRASS, T.MUD, T.DIRT, T.BEACH],
    chase: 5, search: 2,
    tint: '#3a302a',           // dark charcoal-brown, dense skin
  },
  ambush_pred: {
    name: 'Ambush Predator', sprite: 'AMBUSH_PRED',
    tags: ['flesh', 'beast'],
    biomes: [T.FOREST, T.MUSHFOREST], layer: LAYER_SURFACE,
    hostility: 2, aggroRange: 5,
    territory: [T.FOREST, T.MUSHFOREST, T.FUNGAL_GRASS],
    chase: 4, search: 0,       // short chase, no search — disengages cleanly
    tint: '#5a5048',           // dark mottled gray-brown, blends with terrain
  },
  cave_crab: {
    name: 'Wading Grazer', sprite: 'WADING_GRAZER',
    tags: ['flesh', 'beast'],
    biomes: [T.WATER, T.DEEP_WATER, T.UWATER, T.BEACH], layer: LAYER_SURFACE,
    hostility: 1, aggroRange: 3,
    territory: [T.WATER, T.DEEP_WATER, T.UWATER, T.BEACH, T.GRASS, T.SAND],
    chase: 2, search: 0,
    tint: '#4a5040',           // dark muddy brown-green, lighter belly
  },
  mushroom: {
    name: 'Chemotroph', sprite: 'CHEMOTROPH_NODE',
    tags: ['plant', 'fungal'],
    biomes: [T.MUSHFOREST], layer: LAYER_SURFACE,
    hostility: 0, aggroRange: 0,   // passive; swarm AI handles everything
    territory: [T.MUSHFOREST, T.FUNGAL_GRASS],
    chase: 0, search: 0,
    tint: '#786880',           // muted purple-gray (manganese zone default)
  },
};

// ==================== MONSTER SPEED ====================
// Speed determines action frequency. 100 = every turn. Lower = skip turns.
// Each turn, monster acts only if accumulated energy >= 100.
const MON_SPEED = {
  hare: 90,
  wolf: 80,       dire_wolf: 65,
  ambush_pred: 70,
  cave_crab: 45,
  mushroom: 45,
};

// ==================== PERSONALITY SYSTEM ====================
/*
  Each monster can have a personality trait assigned at spawn.
  Traits modify AI behavior subtly. Probability-weighted so unique
  behaviors are less common.
*/
const PERSONALITY_POOL = {
  wolf: [
    {trait:'normal', weight:0.25},
    {trait:'lone_hunter', weight:0.15},  // hunts alone
    {trait:'pair_bond', weight:0.15},    // stays near a bonded partner
    {trait:'leader', weight:0.10},       // pack follows
    {trait:'skittish', weight:0.15},     // flees at low HP
    {trait:'wary', weight:0.20},         // passive unless very close or attacked
  ],
  dire_wolf: [
    {trait:'normal', weight:0.40},
    {trait:'lone_hunter', weight:0.30},
    {trait:'leader', weight:0.15},
    {trait:'pair_bond', weight:0.15},
  ],
  ambush_pred: [
    {trait:'normal', weight:0.70},
    {trait:'patient', weight:0.30},      // waits longer before striking, tighter leash
  ],
  mushroom: [
    {trait:'normal', weight:0.90},
    {trait:'spore_heavy', weight:0.10},  // slightly more poison damage
  ],
  // Others get no personality variance
};

function rollPersonality(key){
  const pool = PERSONALITY_POOL[key];
  if (!pool) return 'normal';
  let total = pool.reduce((s,p) => s + p.weight, 0);
  let r = rand() * total;
  for (const p of pool){
    r -= p.weight;
    if (r <= 0) return p.trait;
  }
  return pool[pool.length-1].trait;
}

// ==================== VISION PROFILES ====================
// Per-species vision type. coneAngle is no longer read by detection — an NPC's
// visual field comes from its body map's visual transducers (isInVisionCone in
// detection.js, per Per-Eye-Visual-Field-Design). visionType still decides
// whether the creature carries a facing.
const VISION_PROFILES = {
  // Clade A predators — focused hunting cone
  wolf:        { visionType: 'cone', coneAngle: 90 },
  dire_wolf:   { visionType: 'cone', coneAngle: 90 },
  // Clade B ambush predator — moderate forward cone, good motion detection
  ambush_pred: { visionType: 'cone', coneAngle: 120 },
  // Prey / herbivores — near-panoramic awareness
  hare:        { visionType: 'cone', coneAngle: 170 },
  // Full-radius vision (omnidirectional / blindsight)
  cave_crab:   { visionType: 'radius' },
  mushroom:    { visionType: 'radius' },  // blindsight — vibration sense
};

// ==================== CLADE TRAIT DATA ====================
// Biological clade identity and trait properties for surface fauna.
// Data-only — no AI behavior changes.  Read by future ecology systems.
//
// Keys match MON keys.  Only creatures with defined clade biology are
// listed; legacy/undead/elemental creatures have no clade assignment.
//
//   id              'A' or 'B'
//   cognition       'centralized' | 'distributed'
//   sensing         'chemical' | 'vibration'
//   memory          'episodic' | 'pattern'
//   sync            true if capable of inter-organism synchronization
//   syncRange       tile radius for sync signal propagation (0 if sync false)
//   territorial     true if effectiveness scales with home-range familiarity
//   territoryRadius home range radius in tiles (0 if not territorial)
//   integument      'skin' | 'plates'
//   reproduction    'sequential' | 'simultaneous'
const CLADE_DATA = {
  // Clade A — centralized, chemical-sensing, episodic memory, skin integument
  wolf: {
    id: 'A',
    cognition: 'centralized',
    sensing: 'chemical',
    memory: 'episodic',
    sync: false,
    syncRange: 0,
    territorial: false,
    territoryRadius: 0,
    integument: 'skin',
    reproduction: 'sequential',
  },
  dire_wolf: {
    id: 'A',
    cognition: 'centralized',
    sensing: 'chemical',
    memory: 'episodic',
    sync: false,
    syncRange: 0,
    territorial: false,
    territoryRadius: 0,
    integument: 'skin',
    reproduction: 'sequential',
  },
  cave_crab: {
    id: 'A',
    cognition: 'centralized',
    sensing: 'chemical',
    memory: 'episodic',
    sync: false,
    syncRange: 0,
    territorial: false,
    territoryRadius: 0,
    integument: 'skin',
    reproduction: 'sequential',
  },

  // Clade B — distributed, vibration-sensing, pattern memory, plated integument
  hare: {
    id: 'B',
    cognition: 'distributed',
    sensing: 'vibration',
    memory: 'pattern',
    sync: false,          // no synchronization — flees individually via vibration detection
    syncRange: 0,
    territorial: true,    // home-patch familiarity improves detection & escape
    territoryRadius: 8,
    integument: 'plates',
    reproduction: 'simultaneous',
  },
  mushroom: {
    id: 'B',
    cognition: 'distributed',
    sensing: 'vibration',
    memory: 'pattern',
    sync: true,           // full inter-node synchronization — the core mechanic
    syncRange: 6,
    territorial: true,    // colony bound to mineral substrate patch
    territoryRadius: 12,
    integument: 'plates',
    reproduction: 'simultaneous',
  },
  ambush_pred: {
    id: 'B',
    cognition: 'distributed',
    sensing: 'vibration',
    memory: 'pattern',
    sync: false,          // synchronization suppressed in this lineage
    syncRange: 0,
    territorial: true,    // effectiveness scales sharply with home-range familiarity
    territoryRadius: 10,
    integument: 'plates',
    reproduction: 'simultaneous',
  },
};

/*
  getCladeData(monsterKey)
  Returns the clade trait object for a creature key, or null if the
  creature has no clade assignment (legacy/undead/elemental).
*/
function getCladeData(key) {
  return CLADE_DATA[key] || null;
}

// ==================== WANDER PROFILES ====================
// Per-creature-type wander behavior parameters.
// Drives emergent movement differences: twitchy prey, ponderous grazers,
// patient ambush predators, steady patrolling predators.
const WANDER_PROFILES = {
  // Meso-predator: moderate persistence, few pauses — steady patrol
  wolf: {
    persistenceRange: [4, 10],
    pauseChance: 0.08,
    pauseDuration: [1, 2],
    turnChance: 0.12,
    homeRadius: null,
    waterAffinity: 0.0,
  },
  // Apex predator: high persistence, rare pauses — purposeful, holds heading
  dire_wolf: {
    persistenceRange: [6, 14],
    pauseChance: 0.06,
    pauseDuration: [1, 3],
    turnChance: 0.08,
    homeRadius: null,
    waterAffinity: 0.0,
  },
  // Small herbivore: low persistence, frequent pauses, high turn chance — twitchy
  hare: {
    persistenceRange: [2, 5],
    pauseChance: 0.15,
    pauseDuration: [2, 5],
    turnChance: 0.25,
    homeRadius: null,
    waterAffinity: 0.0,
  },
  // Large herbivore: high persistence, moderate pauses, biased toward water
  cave_crab: {
    persistenceRange: [5, 12],
    pauseChance: 0.12,
    pauseDuration: [2, 4],
    turnChance: 0.10,
    homeRadius: null,
    waterAffinity: 0.6,
  },
  // Ambush predator: moderate persistence, long frequent pauses, home-locked
  ambush_pred: {
    persistenceRange: [3, 7],
    pauseChance: 0.18,
    pauseDuration: [3, 8],
    turnChance: 0.15,
    homeRadius: 10,
    waterAffinity: 0.0,
  },
  // Chemotroph: slow, mostly still, stays near home colony
  mushroom: {
    persistenceRange: [2, 5],
    pauseChance: 0.25,
    pauseDuration: [3, 10],
    turnChance: 0.20,
    homeRadius: 12,
    waterAffinity: 0.0,
  },
};

// Default wander profile for creatures without a specific one
const DEFAULT_WANDER_PROFILE = {
  persistenceRange: [3, 8],
  pauseChance: 0.12,
  pauseDuration: [1, 3],
  turnChance: 0.15,
  homeRadius: null,
  waterAffinity: 0.0,
};

// ==================== VISION CONE WIDTHS (Prompt L-A) ====================
// Per-creature vision cone width for the L-B perception system.
// Separate from VISION_PROFILES.coneAngle (used by FOV / AI detection).
// Stored on each creature instance as visionConeWidth.
const VISION_CONE_WIDTHS = {
  wolf:        120,   // forward-focused predator
  dire_wolf:   100,   // narrow, focused apex hunter
  hare:        350,   // near-panoramic prey vision
  cave_crab:   200,   // wide-field large herbivore
  ambush_pred: 240,   // multi-directional sensor coverage
  mushroom:    360,   // omnidirectional (blindsight)
};

function spawnMonster(key){
  const d = MON[key];
  if (!d) return null;
  const personality = rollPersonality(key);
  const m = {
    key, name: d.name, spr: d.sprite,
    tags: [...d.tags],
    biomes: [...d.biomes],
    layer: d.layer,
    hostility: d.hostility, aggroRange: d.aggroRange,
    territory: [...d.territory],
    chase: d.chase, search: d.search,
    tint: d.tint,
    spawnRules: d.spawnRules || null,
    pathways: CREATURE_PATHWAYS[key] || [],
    effects: [],
    isMonster: true,
    alerted: false,
    wasAttacked: false,
    aiState: 'idle',  // idle | chase | search
    chaseTurnsLeft: 0,
    searchTurnsLeft: 0,
    lastSeenX: -1, lastSeenY: -1,
    homeX: 0, homeY: 0,
    hitFlash: 0,
    // Speed and personality
    speed: MON_SPEED[key] || 60,
    energy: randi(100),  // randomize initial phase so they don't all sync
    personality,
    damageTaken: 0,  // track total damage for rock golem 'still' trait
    bondPartner: null,  // for pair-bonded wolves
    // Vision profile
    visionType: 'radius',
    coneAngle: 360,
    // Chemotroph swarm phase tracking
    swarmPhase: 'passive',    // passive | coalescing | mobbing
    coalesceTick: 0,          // counter for slow drift during coalescing
    // Prompt K-B: water movement — only cave_crab (large herbivore) can enter water
    canEnterWater: (key === 'cave_crab'),
    // Prompt K-B: flee retaliation — tracks whether creature took damage this turn
    tookDamageThisTurn: false,
    // ── Signal emission state (Prompt L-A) ──
    movedThisTurn: false,
    inCombatThisTurn: false,
    inWater: false,
    visionConeWidth: VISION_CONE_WIDTHS[key] || 120,
    signals: {
      chemical: 0,
      vibration: { ground: 0, air: 0, water: 0 },
      visual: 0,
    },
  };
  // Personality modifiers. (The lone hunter's extra size and strength went
  // with the stat table: a bigger wolf needs a bigger body map, not a number.)
  if (personality === 'spore_heavy' && key === 'mushroom'){
    m.sporeHeavy = true;  // flag checked during poison touch
  } else if (personality === 'patient' && key === 'ambush_pred'){
    m.aggroRange = Math.max(2, m.aggroRange - 2);  // tighter detection
    m.chase += 2;  // but more persistent once committed
  }
  // Wolf biome avoidance: wolves avoid desert and rock, give up chase into those biomes.
  // Pack/leader wolves range wider, lone/wary stick closer to forest.
  if (key === 'wolf' || key === 'dire_wolf'){
    m.avoidBiomes = [T.SAND, T.ROCK];  // won't chase deep into desert or stone
    m.avoidLeash = 3;  // give up after 3 tiles into avoided terrain
    if (personality === 'wary'){
      m.hostility = 0;     // passive — only fights when attacked or player is adjacent
      m.aggroRange = 2;    // very short detection
      m.chase = 4;         // gives up quickly
      m.avoidLeash = 2;
    } else if (personality === 'lone_hunter' || personality === 'skittish'){
      m.chase = 4;           // shorter chase range
      m.avoidLeash = 2;
    } else if (personality === 'leader'){
      m.chase = 10;          // pack leaders range wider
      m.aggroRange = 4;      // slightly more alert than solo
      m.avoidLeash = 5;
    } else if (personality === 'pair_bond'){
      m.chase = 8;           // bonded pairs pursue moderately
      m.avoidLeash = 4;
    }
  }
  // Ambush predator: personality adjusts territory radius (set from clade data above).
  // Patient variants patrol a tighter home range.
  if (key === 'ambush_pred'){
    if (personality === 'patient') m.territoryRadius = 8;
  }
  // Apply vision profile from lookup
  const vp = VISION_PROFILES[key];
  if (vp) {
    m.visionType = vp.visionType;
    if (vp.coneAngle != null) m.coneAngle = vp.coneAngle;
  }
  // Initialize facing direction for cone-vision creatures.
  // Radius-vision creatures have no facing (set to null).
  if (m.visionType === 'cone') {
    const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    const pick = dirs[randi(dirs.length)];
    m.facing = { dx: pick[0], dy: pick[1] };
  } else {
    m.facing = null;
  }
  // Attach clade trait data (null for creatures without clade biology)
  m.clade = getCladeData(key);
  // Territory radius from clade data (Clade B territorial creatures).
  // Creatures with territorial: true are leashed to their home position.
  if (m.clade && m.clade.territorial && m.clade.territoryRadius > 0) {
    m.territoryRadius = m.clade.territoryRadius;
  }
  m.hp = 1;   // alive flag; death is decided by the body (applyZoneDamage, processBleed)
  m.immobilized = false;
  // Initialize per-instance body map with zone HP
  initBodyMap(m);
  // Prompt H: store original neural mass for neural death threshold ratio
  if (m.bodyMap) {
    m.originalNeural = m.bodyMap.reduce((sum, z) => sum + (z.neural || 0), 0);
  }

  // ── Circulation type (Prompt M-A1) ──
  // Clade A = closed circulatory system; Clade B = open
  const CIRCULATION_MAP = {
    wolf: 'closed', dire_wolf: 'closed', cave_crab: 'closed',
    hare: 'open',   ambush_pred: 'open', mushroom: 'open',
  };
  m.circulationType = CIRCULATION_MAP[key] || 'closed';

  // ── Cognitive tier initialization (Prompt M-A1) ──
  m.integrationCapacity = 0;
  m.tier = 1;

  // ── Stress chemistry (Ganglion system) ──
  m.stressLevel = 0;

  // ── Drive system initialization (Prompt I-A) ──
  m.drives = {
    hunger: 0.15 + rand() * 0.30,   // random 0.15–0.45
    safety: 0.0,
    rest:   rand() * 0.15,           // random 0.0–0.15
  };

  // ── Threat detection / flee (Prompt I-B) ──
  const DIET_MAP = {
    hare: 'herbivore', cave_crab: 'herbivore',
    wolf: 'predator',  dire_wolf: 'predator',
    ambush_pred: 'predator', mushroom: 'herbivore',
  };
  const FLEE_MODE_MAP = {
    cave_crab: 'water',
    ambush_pred: 'home',
  };
  m.diet = DIET_MAP[key] || 'predator';
  m.fleeMode = FLEE_MODE_MAP[key] || 'standard';
  m.detectedThreats = [];
  m.threatSource = null;

  // ── Hunt/forage state (Prompt I-C) ──
  m.detectedPrey = [];
  m.detectedCorpses = [];
  m.huntTarget = null;

  // ── Wander profile and state (Prompt I-A) ──
  const wp = WANDER_PROFILES[key] || DEFAULT_WANDER_PROFILE;
  m.wanderProfile = { ...wp, homePosition: null };
  // Ambush predator and mushroom: homePosition set at spawn
  if (wp.homeRadius != null && wp.homeRadius > 0) {
    // homePosition will be set in world-logic after m.x/m.y are assigned
    // (spawnMonster doesn't know coordinates yet — caller sets them)
    m._needsHomePosition = true;
  }
  const [minP, maxP] = wp.persistenceRange;
  m.wander = {
    direction: randi(8),
    persistence: minP + randi(maxP - minP + 1),
    pauseTimer: 0,
  };
  m.currentBehavior = 'wander';

  return m;
}

// ==================== SPAWN RULES LOOKUP ====================
/*
  getSpawnRules(key)
  Returns the spawnRules object for a monster key, or null if none.
  Used by world-gen spawner to enforce regional exclusivity.
*/
function getSpawnRules(key){
  const d = MON[key];
  return (d && d.spawnRules) || null;
}

// ==================== HABITAT DEFINITIONS ====================
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
// Tile-level habitat preferences for spawning. Each species maps to the
// ground and cover terrain types it can spawn on. A tile matches if its
// ground type OR cover type appears in the species' set.
//
// "light forest" vs "dense forest" cannot be distinguished at tile level —
// T.FOREST cover is a single type. Both ambush and apex predators accept
// any forest-cover tile; the density difference is handled by how many
// such tiles exist in the biome.
//
// These are static lookup tables, not body-map-derived preferences.
// The long-term system will derive habitat from physical traits.

const SPAWN_HABITAT = {
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md

  // C3 — Small herbivore: open-ground grazer, feeds on photosynthetic mats in open light.
  // Spawns on open grassland, light forest edges, and bare earth.
  hare: {
    ground: new Set([T.GRASS, T.DIRT]),
    cover:  new Set([T.FOREST]),        // forest-edge tiles count as habitat
    // Note: FUNGAL_GRASS omitted — C3 feeds on photosynthetic mats, not chemotrophic substrate
  },

  // C4 — Large herbivore: amphibious grazer, prefers edges between land and water.
  // Spawns on grassland, mud, beach, and shallow water (can enter water).
  cave_crab: {
    ground: new Set([T.GRASS, T.MUD, T.BEACH, T.WATER]),
    cover:  new Set([]),
    // Note: T.WATER included because cave_crab has canEnterWater=true.
    // Viability check + nearWater affinity ensures these aren't stranded.
  },

  // C1 — Meso-predator: generalist, crosses biome boundaries.
  // Spawns across most terrestrial terrain.
  wolf: {
    ground: new Set([T.GRASS, T.DIRT, T.MUD]),
    cover:  new Set([T.FOREST]),
    // Note: wider habitat than other predators reflects generalist niche
  },

  // C6 — Ambush predator: cover specialist, needs concealment for ambush strategy.
  // Spawns only on tiles with forest cover (canopy concealment).
  ambush_pred: {
    ground: new Set([]),                // no bare-ground spawning
    cover:  new Set([T.FOREST, T.MUSHFOREST]),
    // Note: MUSHFOREST added — ambush_pred's existing biomes include 'fungal',
    // and its territory array includes T.MUSHFOREST and T.FUNGAL_GRASS
  },

  // C2 — Apex predator: forest apex, hunts under canopy.
  // Spawns on forest-cover tiles.
  dire_wolf: {
    ground: new Set([]),                // no bare-ground spawning
    cover:  new Set([T.FOREST]),
    // Note: design doc specifies "dense forest, light forest" — both are T.FOREST
  },
};

// ---- Legacy HABITAT (biome-based) — retained for mushroom spawning ----
// Mushroom (C5) is NOT part of the density-based system (dead concept per
// Spawning-Design.md) but still spawns via the old biome-weight approach.
// Only the mushroom entry is kept active; all other species use SPAWN_HABITAT.
const HABITAT = {
  // Colonial chemotroph: only in fungal zones, spawns in clusters.
  // NOT part of first-pass density system — uses legacy per-tile probability.
  mushroom: {
    biomes: ['fungal'],
    spawnWeight: 0.030,
    nearWater: false,
    nearWaterDist: 0,
    maxPerCell: 15,
  },
};

// Re-export everything that other modules need
export { MON, MON_SPEED, PERSONALITY_POOL, VISION_PROFILES, CLADE_DATA, HABITAT, SPAWN_HABITAT, WANDER_PROFILES, DEFAULT_WANDER_PROFILE };
export { rollPersonality, spawnMonster, getSpawnRules, getCladeData };
