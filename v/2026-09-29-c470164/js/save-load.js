// ==================== SAVE / LOAD SYSTEM ====================
// Serializes full game state to IndexedDB. Auto-saved after every turn.
// Handles circular references (bondPartner) and body maps (zone state only).
// All public functions (saveGame, loadGame, hasSave, deleteSave, tryResume) are async.

import { state, worlds, covers, monsters, features, groundItems } from './state.js';
import { LAYER_META, SPECIES_TEMPLATES, initBodyMap, getBodyMap, computeBleedPenalty } from './constants.js';
import { WANDER_PROFILES, DEFAULT_WANDER_PROFILE } from './monsters.js';
import { render } from './rendering.js';
import { textureConfig, rebuildSpriteCache, SPRITE_LIBRARY } from './sprites.js';
import { log, LOG_CATEGORIES } from './log.js';
import { updatePlayerFOV } from './fov.js';
import { resetScent } from './scent.js';
import { rand, getRngState, setRngState } from './rng.js';

const SAVE_KEY = 'overworld_zero_save';
const BACKUP_KEY = 'overworld_zero_save_backup';   // a save that failed to load, kept rather than deleted
const SAVE_VERSION = 6;   // v6: no stat table on the player or creatures (v5 dropped the player's HP pool, inventory, equipment, XP, gold)
const ACCEPTED_VERSIONS = [4, 5, SAVE_VERSION];   // v4 and v5 are migrated on load; older saves are kept as a backup and not loaded
let _saveFailWarned = false;

// ==================== INDEXEDDB STORAGE BACKEND ====================
// Replaces localStorage. No 5 MB cap — IndexedDB supports hundreds of MB to GB.
// All public save/load functions are now async.

const DB_NAME = 'overworld_zero';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

/** Open (or create) the IndexedDB database. */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Store a value in IndexedDB. Stores structured data directly (no JSON.stringify needed). */
async function saveToIDB(key, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(data, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/** Load a value from IndexedDB. Returns the stored object or null. */
async function loadFromIDB(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result !== undefined ? request.result : null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/** Delete a value from IndexedDB. */
async function deleteFromIDB(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * One-time migration: move save data from localStorage to IndexedDB.
 * Call at startup before the first load attempt. Clears localStorage after migration.
 */
export async function migrateFromLocalStorage() {
  try {
    // Check if IndexedDB already has data — skip if so
    const existing = await loadFromIDB(SAVE_KEY);
    if (existing) return;

    // Check localStorage for old save
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return;

    // Migrate: parse and store as structured object in IndexedDB
    const data = JSON.parse(json);
    await saveToIDB(SAVE_KEY, data);

    // Clear localStorage to free the 5 MB space
    localStorage.removeItem(SAVE_KEY);

    console.log('[Save] Migrated save from localStorage to IndexedDB');
  } catch (err) {
    console.error('[Save] Migration from localStorage failed:', err);
  }
}

// ==================== SAVE-IN-PROGRESS GUARD ====================
// Prevents overlapping async saves if the player acts twice quickly.
let _saveInProgress = false;

// ==================== TRANSIENT FIELD MANAGEMENT ====================
// Add any new per-turn recomputed fields here to prevent save bloat.
// These are stripped before serialization and re-initialized on load.
// Entity references (huntTarget, threatSource) and detection results
// (detectedThreats, detectedPrey, detectedCorpses) are included because
// they contain object references that cause circular-reference errors or
// unbounded growth in JSON.stringify output.

const TRANSIENT_FIELDS = [
    // Signal emission (L-A)
    'signals',

    // Cached senses (legacy — no longer populated but stripped for old save compat)
    '_senses',
    '_cachedSenses',

    // Per-turn state flags
    'movedThisTurn',
    'inCombatThisTurn',
    'inWater',
    'tookDamageThisTurn',

    // Detection results (contain entity references that can't serialize)
    'detectedThreats',
    'detectedPrey',
    'detectedCorpses',

    // Entity references (circular references break JSON.stringify)
    'huntTarget',
    'threatSource',

    // Cognitive tier (recomputed from body map each turn)
    'integrationCapacity',
    'tier',

    // Current behavior label (recomputed each turn)
    'currentBehavior',

    // Player non-visual detection results (Prompt P: { creature, bestSNR } tuples)
    'sensedCreatures',

    // Prompt P: continuous-uncertainty detection info (entity references, recomputed each turn)
    'detectionInfo',

    // Prompt O/P: goal persistence counter (transient tracking state)
    '_goalLostTurns',

    // Prompt O/P: decision trace for debugCognition (debug-only, recomputed each turn)
    '_lastTrace',

    // Prompt Q: per-turn fields that were missing from stripping
    '_actedNormally',       // DEPRECATED: old speed system flag (replaced by AP system)
    '_cachedWater',         // cached nearest water tile position (periodically refreshed)
    '_cachedWaterAge',      // age counter for _cachedWater cache
    'bleedPenalty',         // recomputed each turn via computeBleedPenalty

    // Prompt S: active simulation radius — dormancy state (runtime only)
    '_dormant',             // boolean: true if creature is outside active radius
    '_dormantTurns',        // number: how many turns the creature has been dormant

    // Ganglion system: per-turn flags (not persistent)
    '_ganglionTriggeredStress',  // flag: stress release trigger this turn
    '_lastGanglionIntensity',    // float: ganglion motor output intensity this turn

    // AP system: accumulated action points and per-input action count (runtime only)
    '_accumulatedAP',            // float: AP carryover between player inputs
    '_actionsThisTurn',          // int: how many actions creature took this player input

    // Speed overhaul: mass-dependent acceleration and sprint (runtime only)
    '_consecutiveMoveTurns',     // int: consecutive turns this entity has been moving (inertia tracking)
    '_lastMovementIntensity',    // float: player movement intensity this turn (creep 0.1, walk 0.25, sprint 1.0)
    'sprintMode',                // boolean: player is holding sprint (Shift key)
    '_sprintWarnedLow',          // boolean: player has been warned about low substrate

    // Perception passes 5-8 (runtime only; Maps and entity references do not
    // survive JSON: a Map comes back as {} and breaks .get)
    '_traces',                   // Map<entity, trace>: what integration tissue holds (pass 8)
    '_visuallyDetected',         // Map<creature, percept>: player's sightings this turn (pass 5)
    '_perceivedAt',              // Map<tile, {creature, species}>: player's display percepts (pass 5)
    'plume',                     // this action's airborne reading (pass 6b-2)
    '_scentTrace',               // lost-scent memory for casting (pass 6b-2)
    '_fights',                   // Map<entity, fight>: blows dealt and taken (tools/ecology.mjs)
    '_lastStruckBy',             // entity: last to land a blow (tools/ecology.mjs)
    '_hunts',                    // Map<entity, episode>: open hunt episodes (hunt-funnel.js, tools/ecology.mjs)
    '_huntLog',                  // closed hunt episodes (hunt-funnel.js)
    '_huntStats',                // hunger bands, trail bouts (hunt-funnel.js)
];

/** Create a shallow copy with all transient per-turn fields removed. */
function stripTransientFields(obj) {
    const clean = { ...obj };
    for (const field of TRANSIENT_FIELDS) {
        delete clean[field];
    }
    return clean;
}

/** Initialize all transient fields to safe defaults on a loaded entity. */
function initTransientFields(entity) {
    entity.signals = { chemical: 0, vibration: { ground: 0, air: 0, water: 0 }, visual: 0 };
    entity._senses = null;
    entity._cachedSenses = null;
    entity.movedThisTurn = false;
    entity.inCombatThisTurn = false;
    entity.inWater = false;
    entity.tookDamageThisTurn = false;
    entity.detectedThreats = [];
    entity.detectedPrey = [];
    entity.detectedCorpses = [];
    entity.huntTarget = null;
    entity.threatSource = null;
    entity.integrationCapacity = 0;
    entity.tier = 1;
    entity.currentBehavior = 'wander';
    entity.sensedCreatures = [];
    entity.detectionInfo = [];         // Prompt P
    entity._goalLostTurns = 0;         // Prompt O/P
    entity._lastTrace = null;          // Prompt O/P: debugCognition trace
    entity._actedNormally = false;     // DEPRECATED: old speed system flag (kept for save compat)
    entity._cachedWater = null;        // Prompt Q: cached nearest water tile
    entity._cachedWaterAge = 0;        // Prompt Q: cache age counter
    entity.bleedPenalty = 0;           // Prompt Q: recomputed from computeBleedPenalty
    entity._dormant = false;           // Prompt S: not dormant on load (activity check runs first turn)
    entity._dormantTurns = 0;          // Prompt S: no dormant turns accumulated
    entity._ganglionTriggeredStress = false;  // Ganglion: no stress trigger pending
    entity._lastGanglionIntensity = null;     // Ganglion: no intensity from last turn
    entity._accumulatedAP = 0;                // AP system: no carryover on load
    entity._actionsThisTurn = 0;              // AP system: no actions taken yet
    entity._consecutiveMoveTurns = 0;         // Speed overhaul: no momentum on load
    entity._lastMovementIntensity = null;     // Speed overhaul: no movement intensity
    entity.sprintMode = false;                // Speed overhaul: not sprinting
    entity._sprintWarnedLow = false;          // Speed overhaul: no substrate warning
}

// ==================== HELPERS ====================

// Dynamically import cellKeyToLayer — it may live in world-state or state.
// We access it at call time, not import time, to avoid circular deps.
let _cellKeyToLayer = null;
export function registerCellKeyToLayer(obj) { _cellKeyToLayer = obj; }

// ==================== EXPLORED SET SERIALIZATION ====================
// state.explored is { layerIndex → Set<"x,y"> }. Sets don't survive
// JSON.stringify, so we convert to/from arrays of strings.

function serializeExplored(explored) {
  if (!explored) return {};
  const out = {};
  for (const layer of Object.keys(explored)) {
    out[layer] = explored[layer] ? [...explored[layer]] : [];
  }
  return out;
}

function deserializeExplored(raw) {
  if (!raw) return {};
  const out = {};
  for (const layer of Object.keys(raw)) {
    out[layer] = new Set(raw[layer] || []);
  }
  return out;
}

// Fields of the retired stat table (save v5 and earlier), dropped on load.
const LEGACY_STAT_FIELDS = ['siz', 'strength', 'chem', 'vib', 'vis', 'central', 'distributed',
                            'weaponAtk', 'def', 'xp', 'goldRange', 'dmgType', 'percept', 'mods', 'hpMax'];

// ==================== ZONE STATE PERSISTENCE ====================
// Restore saved zone HP and destroyed state onto a freshly-initialized body map.
// Matches by zone key. If a saved zone doesn't exist in the template (e.g. body
// map changed between versions), it's silently skipped.

function restoreZoneState(bodyMap, savedState) {
  if (!bodyMap || !savedState) return;
  const stateByKey = {};
  for (const zs of savedState) {
    if (zs && zs.key) stateByKey[zs.key] = zs;
  }
  for (const zone of bodyMap) {
    const saved = stateByKey[zone.key];
    if (saved) {
      zone.hp = saved.hp != null ? saved.hp : zone.maxHp;
      zone.destroyed = saved.destroyed || false;
      if (saved.maxHp != null) zone.maxHp = saved.maxHp;
      zone.clotting = saved.clotting != null ? saved.clotting : 0;
      // The store's size is derived from the muscle (initBodyMap), not saved
      // state: an older save carries the hand-written sizes
      if (saved.substrate != null && zone.substrateMax != null) zone.substrate = Math.min(zone.substrateMax, saved.substrate);
    }
  }
}

// Extract saveable zone state from a body map.
function extractZoneState(bodyMap) {
  if (!bodyMap) return null;
  return bodyMap.map(z => ({
    key: z.key,
    hp: z.hp,
    maxHp: z.maxHp,
    destroyed: z.destroyed,
    clotting: z.clotting || 0,
    substrate: z.substrate,
    substrateMax: z.substrateMax,
  }));
}

// ==================== SERIALIZATION ====================

/** Serialize a player object into a plain JSON-safe structure. */
function serializePlayer(p) {
  if (!p) return null;
  const out = { ...p };
  // Body map → save only zone runtime state (hp, maxHp, destroyed, clotting,
  // substrate). Same extractor as monsters; a hand-rolled copy here used to
  // leave substrate out, so a reload was a free sprint recovery.
  if (p.bodyMap) {
    out._zoneState = extractZoneState(p.bodyMap);
  }
  delete out.bodyMap;  // don't persist full body map (static data reloaded from template)
  // Blood system — save current blood level (bloodMax/bleedPenalty/bloodShare are derived on load)
  // Keep blood on out — it's a simple float, JSON-safe

  // ── Prompt Q: defensive entity-reference clearing ──
  // sensedCreatures contains live creature object references ({creature, bestSNR, ...}).
  // detectionInfo contains entity references ({entity, ...}).
  // These MUST be removed before JSON.stringify — if they survive, stringify follows
  // the references and serializes every creature's full bodyMap, detectionInfo, etc.,
  // cascading into hundreds of KB and triggering QuotaExceededError.
  // Belt-and-suspenders: delete explicitly here AND via stripTransientFields below.
  delete out.sensedCreatures;
  delete out.detectionInfo;
  delete out.detectedThreats;
  delete out.detectedPrey;
  delete out.detectedCorpses;
  delete out.huntTarget;
  delete out.threatSource;

  // Strip transient per-turn fields (recomputed every turn, may contain entity refs)
  return stripTransientFields(out);
}

/** Deserialize a player object, reconnecting registry references. */
function deserializePlayer(raw) {
  if (!raw) return null;
  const p = { ...raw };
  // v4 → v5: the fantasy layer is gone. v5 → v6: so is the stat table.
  // Drop their fields; hp is an alive flag. Everything else is derived from
  // the body map on load.
  for (const k of ['hpMax', 'inventory', 'gold', 'xp', 'xpNext', 'level', 'perks',
                   'restTurns', 'regenProgress', 'weapon', 'armor', 'npcsMet', 'booksRead',
                   '_weaponKey', '_armorKey', '_npcsMet', '_booksRead',
                   ...LEGACY_STAT_FIELDS]) delete p[k];
  p.hp = p.hp > 0 ? 1 : 0;
  p.effects = (p.effects || []).filter(e => e && e.type === 'stealth');
  // Backwards compat: colorPalette added post-launch
  if (p.colorPalette == null) p.colorPalette = 'meso_predator';
  // Backwards compat: species added in Prompt F
  // Old saves have bodyType but no species. Map bodyType → species key.
  if (p.species == null) {
    const bodyTypeToSpecies = { meso: 'prowler', apex: 'ravager', grazer: 'grazer' };
    p.species = bodyTypeToSpecies[p.bodyType] || 'prowler';
    p.displayName = p.displayName || (p.species === 'prowler' ? 'Prowler' : p.species === 'ravager' ? 'Ravager' : 'Grazer');
  }
  // Backwards compat: immobilized flag
  if (p.immobilized == null) p.immobilized = false;
  // Backwards compat: ecology fields added in Prompt K-A
  // Old saves won't have diet/fleeMode/wanderProfile on the player.
  // Derive from species key using the same mappings as freshPlayer.
  if (p.diet == null) {
    const sp = p.species || 'prowler';
    const SPECIES_CREATURE_MAP = {
      prowler: 'wolf', ravager: 'dire_wolf', grazer: 'hare',
      shaleback: 'cave_crab', lurker: 'ambush_pred',
    };
    const ck = SPECIES_CREATURE_MAP[sp] || 'wolf';
    const DIET_MAP = { hare: 'herbivore', cave_crab: 'herbivore' };
    const FLEE_MAP = { cave_crab: 'water', ambush_pred: 'home' };
    p.diet = DIET_MAP[ck] || 'predator';
    p.fleeMode = FLEE_MAP[ck] || 'standard';
    p.wanderProfile = { ...(WANDER_PROFILES[ck] || DEFAULT_WANDER_PROFILE) };
  }
  // Reconstruct body map from template, then restore zone state
  const savedZoneState = raw._zoneState || null;
  delete p._zoneState;
  const savedBlood = p.blood;  // save before initBodyMap overwrites
  initBodyMap(p);
  if (savedZoneState && p.bodyMap) {
    restoreZoneState(p.bodyMap, savedZoneState);
  }
  // Restore blood level (initBodyMap sets blood = bloodMax; override with saved value)
  if (savedBlood != null && p.bloodMax > 0) {
    p.blood = Math.min(savedBlood, p.bloodMax);
    p.bleedPenalty = computeBleedPenalty(p);
  }
  // Prompt H: ensure originalNeural exists (recompute if missing from old saves)
  if (p.originalNeural == null && p.bodyMap) {
    p.originalNeural = p.bodyMap.reduce((sum, z) => sum + (z.neural || 0), 0);
  }
  // Prompt M-A1: ensure circulationType exists (backward compat for old saves)
  if (p.circulationType == null) {
    const sp = p.species || 'prowler';
    const spTmpl = SPECIES_TEMPLATES[sp];
    p.circulationType = (spTmpl && spTmpl.circulationType) || 'closed';
  }
  // Initialize transient per-turn fields (recomputed every turn after load)
  initTransientFields(p);
  return p;
}

/**
 * Serialize all monsters across all layers.
 * Handles bondPartner circular refs by replacing with an index-based ID.
 * monsters is an Object keyed by layerIndex.
 */
function serializeMonsters(allLayers) {
  const result = {};
  for (const li of Object.keys(allLayers)) {
    const layer = allLayers[li] || [];
    const serialized = [];
    for (let mi = 0; mi < layer.length; mi++) {
      const mon = layer[mi];
      if (!mon) { serialized.push(null); continue; }
      const out = { ...mon };
      // bondPartner → store as { layer, index } or null
      if (mon.bondPartner && mon.bondPartner !== mon) {
        const partnerIdx = layer.indexOf(mon.bondPartner);
        if (partnerIdx >= 0) {
          out._bondRef = { layer: li, index: partnerIdx };
        } else {
          out._bondRef = null;
        }
      } else {
        out._bondRef = null;
      }
      delete out.bondPartner;
      // Body map → save only zone runtime state
      if (mon.bodyMap) {
        out._zoneState = extractZoneState(mon.bodyMap);
      }
      delete out.bodyMap;
      // Prompt I-B: threatSource is an entity reference — save as ID string
      if (mon.threatSource && mon.threatSource.isPlayer) {
        out._threatSourceRef = 'player';
      } else {
        out._threatSourceRef = null;
      }
      // Prompt I-C: huntTarget is an entity reference — save as ID
      if (mon.huntTarget && mon.huntTarget.isPlayer) {
        out._huntTargetRef = 'player';
      } else {
        out._huntTargetRef = null; // NPC targets are transient — don't persist
      }
      // ── Prompt Q: defensive entity-reference clearing ──
      // detectionInfo entries contain entity references (info.entity = target).
      // If these survive into JSON.stringify they cascade into full creature trees.
      // Belt-and-suspenders: delete explicitly here AND via TRANSIENT_FIELDS below.
      delete out.detectionInfo;
      delete out.sensedCreatures;
      // Strip all transient per-turn fields (recomputed every turn, may contain
      // entity references that cause circular-ref errors in JSON.stringify)
      for (const field of TRANSIENT_FIELDS) {
        delete out[field];
      }
      serialized.push(out);
    }
    result[li] = serialized;
  }
  return result;
}

/** Deserialize monsters and reconnect bondPartner references. */
function deserializeMonsters(allLayers) {
  const result = {};
  for (const li of Object.keys(allLayers)) {
    const layer = allLayers[li];
    result[li] = layer ? layer.map(m => (m ? { ...m } : null)).filter(Boolean) : [];
  }
  // Second pass: reconnect bond partners
  for (const li of Object.keys(allLayers)) {
    const layer = allLayers[li];
    if (!layer) continue;
    for (let mi = 0; mi < layer.length; mi++) {
      const raw = layer[mi];
      if (!raw || !raw._bondRef) continue;
      const ref = raw._bondRef;
      if (result[ref.layer] && result[ref.layer][ref.index]) {
        if (result[li][mi]) {
          result[li][mi].bondPartner = result[ref.layer][ref.index];
        }
      }
    }
  }
  // Third pass: clean up markers, restore body maps and zone state
  for (const li of Object.keys(result)) {
    for (const mon of result[li]) {
      if (mon) {
        delete mon._bondRef;
        if (!mon.bondPartner) mon.bondPartner = null;
        for (const k of LEGACY_STAT_FIELDS) delete mon[k];
        mon.hp = mon.hp > 0 ? 1 : 0;
        // Ensure immobilized flag exists
        if (mon.immobilized == null) mon.immobilized = false;
        // Restore body map from template, then apply saved zone state
        const savedZoneState = mon._zoneState || null;
        const savedBlood = mon.blood;  // save before initBodyMap overwrites
        delete mon._zoneState;
        initBodyMap(mon);
        if (savedZoneState && mon.bodyMap) {
          restoreZoneState(mon.bodyMap, savedZoneState);
        }
        // Restore blood level (initBodyMap sets blood = bloodMax; override with saved value)
        if (savedBlood != null && mon.bloodMax > 0) {
          mon.blood = Math.min(savedBlood, mon.bloodMax);
          mon.bleedPenalty = computeBleedPenalty(mon);
        }
        // Prompt H: ensure originalNeural exists (recompute if missing from old saves)
        if (mon.originalNeural == null && mon.bodyMap) {
          mon.originalNeural = mon.bodyMap.reduce((sum, z) => sum + (z.neural || 0), 0);
        }
        // Prompt I-A: ensure drive/wander state exists (backward compat for old saves)
        if (!mon.drives) {
          mon.drives = {
            hunger: 0.15 + rand() * 0.30,
            safety: 0.0,
            rest: rand() * 0.15,
          };
        }
        if (!mon.wanderProfile) {
          const wp = (mon.key && WANDER_PROFILES[mon.key]) || DEFAULT_WANDER_PROFILE;
          mon.wanderProfile = { ...wp, homePosition: null };
          // Territorial creatures: set homePosition from homeX/homeY
          if (wp.homeRadius != null && wp.homeRadius > 0 && mon.homeX != null) {
            mon.wanderProfile.homePosition = { x: mon.homeX, y: mon.homeY };
          }
        }
        if (!mon.wander) {
          const wp = mon.wanderProfile || DEFAULT_WANDER_PROFILE;
          const [minP, maxP] = wp.persistenceRange;
          mon.wander = {
            direction: Math.floor(rand() * 8),
            persistence: minP + Math.floor(rand() * (maxP - minP + 1)),
            pauseTimer: 0,
          };
        }
        // Initialize all transient per-turn fields to safe defaults
        initTransientFields(mon);

        // Prompt I-B: restore threatSource from saved reference (overrides default null)
        if (mon._threatSourceRef === 'player') {
          mon.threatSource = state.player;  // reconnect to player entity
        }
        delete mon._threatSourceRef;
        // Ensure diet and fleeMode exist (backward compat for old saves)
        if (mon.diet == null) {
          const DIET_MAP = { hare: 'herbivore', cave_crab: 'herbivore', mushroom: 'herbivore' };
          mon.diet = DIET_MAP[mon.key] || 'predator';
        }
        if (mon.fleeMode == null) {
          const FLEE_MAP = { cave_crab: 'water', ambush_pred: 'home' };
          mon.fleeMode = FLEE_MAP[mon.key] || 'standard';
        }
        // Prompt I-C: restore huntTarget from saved reference (overrides default null)
        if (mon._huntTargetRef === 'player') {
          mon.huntTarget = state.player;
        }
        delete mon._huntTargetRef;
        // Prompt M-A1: ensure circulationType exists (backward compat for old saves)
        if (mon.circulationType == null) {
          const CIRC_MAP = {
            wolf: 'closed', dire_wolf: 'closed', cave_crab: 'closed',
            hare: 'open',   ambush_pred: 'open', mushroom: 'open',
          };
          mon.circulationType = CIRC_MAP[mon.key] || 'closed';
        }
      }
    }
  }
  return result;
}

/**
 * Serialize features. Features is an Object keyed by layerIndex,
 * each value is an Object keyed by "x,y".
 */
function serializeFeatures(allFeatures) {
  if (!allFeatures) return {};
  try {
    return JSON.parse(JSON.stringify(allFeatures));
  } catch (e) {
    console.warn('[Save] Features serialization warning:', e);
    return {};
  }
}

// ==================== SAVE ====================

export async function saveGame() {
  if (state.gameState !== 'play') return; // Only save during active play
  if (_saveInProgress) return;            // Prevent overlapping async saves
  _saveInProgress = true;

  try {
    // Serialize worlds and covers as Objects keyed by layerIndex
    const serializedWorlds = {};
    for (const li of Object.keys(worlds)) {
      serializedWorlds[li] = worlds[li] || null;
    }

    const serializedCovers = {};
    for (const li of Object.keys(covers)) {
      serializedCovers[li] = covers[li] || null;
    }

    const saveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),

      // Core state fields
      state: {
        player: serializePlayer(state.player),
        turnCount: state.turnCount,
        worldTick: state.worldTick,
        activeLayer: state.activeLayer,
        gameState: state.gameState,
        worldSeed: state.worldSeed,
        rngState: getRngState(),
        windDirection: state.windDirection,
        windSpeed: state.windSpeed,
        prevLayer: state.prevLayer,
        layerLeftTurn: { ...(state.layerLeftTurn || {}) },
      },

      // World grids — Object keyed by layerIndex, values are 2D arrays
      worlds: serializedWorlds,
      covers: serializedCovers,

      // All monsters per layer — Object keyed by layerIndex
      monsters: serializeMonsters(monsters),

      // Features per layer — Object keyed by layerIndex
      features: serializeFeatures(features),

      // Ground items per layer — Object keyed by layerIndex,
      // each value is a sparse map of "x,y" → array of item objects
      groundItems: serializeFeatures(groundItems),  // same plain-object structure

      // Layer metadata registry
      layerMeta: { ...LAYER_META },

      // Town cell → layer mappings
      cellKeyToLayer: _cellKeyToLayer ? { ..._cellKeyToLayer } : {},

      // FOV explored tiles per layer — Set<"x,y"> → array of strings
      explored: serializeExplored(state.explored),

      // World-map explored cells — Set<"cx,cy"> → array of strings
      exploredCells: state.exploredCells ? [...state.exploredCells] : [],

      // Texture picker selections — sprite name → variant index
      textureConfig: { ...textureConfig },
    };

    // Size measurement for diagnostics only — not used for storage.
    // IndexedDB stores the object directly via structured clone (faster, no stringify needed).
    // Threshold raised to 100 MB: with IndexedDB the 5 MB ceiling is gone; this is now
    // a "something went seriously wrong" detector, not a capacity warning.
    try {
      const json = JSON.stringify(saveData);
      if (json.length > 100 * 1024 * 1024) {
        console.warn(`[Save] Save data is ${(json.length / 1024).toFixed(0)} KB — extremely large! ` +
                     `Checking for entity reference leaks...`);
        const playerJson = JSON.stringify(saveData.state.player || {});
        console.warn(`[Save]   player: ${(playerJson.length / 1024).toFixed(1)} KB`);
        for (const li of Object.keys(saveData.monsters || {})) {
          const layerMons = saveData.monsters[li] || [];
          const layerJson = JSON.stringify(layerMons);
          if (layerJson.length > 500 * 1024) {
            console.warn(`[Save]   monsters layer ${li}: ${(layerJson.length / 1024).toFixed(1)} KB (${layerMons.length} creatures)`);
          }
        }
      }
    } catch (measureErr) {
      // JSON.stringify failure means circular references leaked through — this is a bug.
      console.error('[Save] JSON.stringify failed (likely circular reference leak):', measureErr);
      return;
    }

    // Snapshot NOW, before any await. saveData holds live references (worlds
    // by reference, monsters by shallow spread); a keydown during the
    // openDB() await would run a turn and the stored object would mix
    // turn N primitives with turn N+1 nested state.
    const snapshot = structuredClone(saveData);
    await saveToIDB(SAVE_KEY, snapshot);
  } catch (err) {
    console.error('[Save] Failed to save game:', err);
    if (!_saveFailWarned) {
      _saveFailWarned = true;
      log('Autosave failed; this run will not survive a reload. (Private window or storage full?)', LOG_CATEGORIES.SYSTEM);
    }
  } finally {
    _saveInProgress = false;
  }
}

// ==================== LOAD ====================

/** Check if a valid save exists in IndexedDB. */
export async function hasSave() {
  try {
    const data = await loadFromIDB(SAVE_KEY);
    if (!data) return false;
    // Accept current version AND previous versions (will be migrated on load)
    return !!(data && ACCEPTED_VERSIONS.includes(data.version) && data.state && data.state.player);
  } catch {
    return false;
  }
}

/** Delete saved game data from IndexedDB. */
export async function deleteSave() {
  try {
    await deleteFromIDB(SAVE_KEY);
  } catch (err) {
    console.error('[Save] Failed to delete save:', err);
  }
}

/**
 * Load a saved game from IndexedDB. Restores all state, grids, monsters, features.
 * Returns true on success, false on failure (caller should start fresh).
 */
export async function loadGame() {
  try {
    const data = await loadFromIDB(SAVE_KEY);
    if (!data) return false;

    // Version check — older accepted versions are migrated below
    if (!ACCEPTED_VERSIONS.includes(data.version)) {
      console.warn('[Save] Incompatible save version:', data.version);
      await keepAsBackup(data);
      return false;
    }

    if (data.version < SAVE_VERSION) {
      console.log(`[Save] Migrating v${data.version} save to v${SAVE_VERSION} (legacy player fields and the stat table dropped).`);
    }

    // Validate critical data
    if (!data.state || !data.state.player || !data.worlds) {
      console.warn('[Save] Corrupt save data.');
      await keepAsBackup(data);
      return false;
    }

    // --- Restore core state ---
    resetScent();   // scent maps are transient; never carry a stale plume into a loaded run
    const savedState = data.state;
    state.player     = deserializePlayer(savedState.player);
    state.turnCount   = savedState.turnCount  || 0;
    state.worldTick   = savedState.worldTick  || 0;
    state.activeLayer = savedState.activeLayer || 0;
    state.gameState   = 'play';
    state.inputLocked = false;
    if (savedState.worldSeed != null) state.worldSeed = savedState.worldSeed;
    if (savedState.rngState != null) setRngState(savedState.rngState);
    if (savedState.windDirection != null) state.windDirection = savedState.windDirection;
    if (savedState.windSpeed != null) state.windSpeed = savedState.windSpeed;
    state.prevLayer = savedState.prevLayer != null ? savedState.prevLayer : null;
    state.layerLeftTurn = savedState.layerLeftTurn ? { ...savedState.layerLeftTurn } : {};

    // --- Restore world grids (Object keyed by layerIndex) ---
    for (const key of Object.keys(worlds)) delete worlds[key];
    if (data.worlds) {
      for (const [key, value] of Object.entries(data.worlds)) {
        worlds[key] = value || null;
      }
    }

    for (const key of Object.keys(covers)) delete covers[key];
    if (data.covers) {
      for (const [key, value] of Object.entries(data.covers)) {
        covers[key] = value || null;
      }
    }

    // --- Restore monsters (Object keyed by layerIndex) ---
    for (const key of Object.keys(monsters)) delete monsters[key];
    if (data.monsters) {
      const restored = deserializeMonsters(data.monsters);
      for (const [key, value] of Object.entries(restored)) {
        monsters[key] = value;
      }
    }

    // --- Restore features (Object keyed by layerIndex) ---
    for (const key of Object.keys(features)) delete features[key];
    if (data.features) {
      for (const [key, value] of Object.entries(data.features)) {
        features[key] = value || {};
      }
    }

    // --- Restore ground items (Object keyed by layerIndex) ---
    for (const key of Object.keys(groundItems)) delete groundItems[key];
    if (data.groundItems) {
      for (const [key, value] of Object.entries(data.groundItems)) {
        groundItems[key] = value || {};
      }
    }

    // --- Restore LAYER_META ---
    if (data.layerMeta) {
      for (const key of Object.keys(LAYER_META)) delete LAYER_META[key];
      for (const [key, value] of Object.entries(data.layerMeta)) {
        LAYER_META[key] = value;
      }
    }

    // --- Restore cellKeyToLayer ---
    if (_cellKeyToLayer && data.cellKeyToLayer) {
      for (const key of Object.keys(_cellKeyToLayer)) delete _cellKeyToLayer[key];
      for (const [key, value] of Object.entries(data.cellKeyToLayer)) {
        _cellKeyToLayer[key] = value;
      }
    }

    // --- Restore FOV explored tiles ---
    state.explored = deserializeExplored(data.explored);
    // fovSet is recomputed on the first action (or by tryResume before render)

    // --- Restore world-map explored cells ---
    state.exploredCells = new Set(data.exploredCells || []);

    // --- Restore texture picker selections ---
    if (data.textureConfig) {
      // Reset to defaults first, then apply saved selections
      Object.keys(textureConfig).forEach(k => textureConfig[k] = 0);
      for (const [key, val] of Object.entries(data.textureConfig)) {
        if (SPRITE_LIBRARY[key]) {
          const idx = Math.floor(Number(val));
          if (!isNaN(idx) && idx >= 0) {
            textureConfig[key] = Math.min(idx, SPRITE_LIBRARY[key].length - 1);
          }
        }
      }
      // Rebuild all sprite caches to reflect loaded selections
      Object.keys(textureConfig).forEach(name => {
        if (textureConfig[name] !== 0) rebuildSpriteCache(name);
      });
    }

    return true;
  } catch (err) {
    console.error('[Save] Failed to load game:', err);
    // One deserialization bug used to wipe the run here. Keep the data.
    try { await keepAsBackup(await loadFromIDB(SAVE_KEY)); } catch (e2) { console.error('[Save] Backup failed:', e2); }
    return false;
  }
}

/**
 * A save that could not be loaded is copied to BACKUP_KEY instead of being
 * deleted (the title flow deletes the primary key when resume fails). The
 * player is told; a developer can recover it from IndexedDB
 * (overworld_zero / saves / overworld_zero_save_backup).
 */
async function keepAsBackup(data) {
  if (!data) return;
  try {
    await saveToIDB(BACKUP_KEY, data);
    log('Your save could not be loaded. It was kept as a backup, not deleted.', LOG_CATEGORIES.SYSTEM);
  } catch (err) {
    console.error('[Save] Could not write backup:', err);
  }
}

/**
 * Attempt to resume from save. Call from main.js after world-gen modules
 * are initialized. Returns true if a game was restored.
 */
export async function tryResume() {
  if (!(await hasSave())) return false;
  if (!(await loadGame())) return false;
  try {
    updatePlayerFOV();  // compute FOV before first render
    render();
    log('Game resumed.', LOG_CATEGORIES.SYSTEM);
  } catch (err) {
    console.error('[Save] Render after load failed:', err);
    return false;
  }
  return true;
}
