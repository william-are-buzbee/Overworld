// ==================== PLAYER ====================
// The player is a creature: a body map, blood, substrate, senses. This file
// builds one from a species template and holds the player-only bits (the
// species-to-diet mapping, the view radius). There is no HP pool, no
// inventory, no stats: the body is the character. Dodge, stealth and
// accuracy are derived in combat-constants.js / combat.js from the body map
// and the attacker's senses, the same way for the player and every creature.
import { LAYER_SURFACE, LAYER_META, CREATURE_PATHWAYS, SPECIES_TEMPLATES,
         initBodyMap, getBestVisualAcuity } from './constants.js';
import { getTimePhase } from './time-cycle.js';
import { state } from './state.js';
import { MON_SPEED, WANDER_PROFILES, DEFAULT_WANDER_PROFILE } from './monsters.js';

// player object lives in state.js — functions here take player as parameter `p`

function freshPlayer(speciesKey, colorPalette){
  const species = SPECIES_TEMPLATES[speciesKey];
  if (!species) throw new Error('Unknown species: ' + speciesKey);

  const p = {
    layer: LAYER_SURFACE,
    x:0, y:0,
    returnLayer: LAYER_SURFACE, returnX:0, returnY:0,
    species: speciesKey,
    displayName: species.displayName,
    bodyType: species.bodyType,
    colorPalette: colorPalette || species.colorPalette,
    // hp is an alive flag only (1 = alive, 0 = dead). Death comes from the
    // body: a vital zone destroyed, neural mass below threshold, or blood
    // below threshold (applyZoneDamage / processBleed set it to 0).
    hp: 1,
    effects: [],          // only 'stealth' remains (the F-key placeholder)
    stealth:false,
    fed:100,              // food reserve, 0-100 (hunger; see turn-loop.js)
    isPlayer:true,
    hitFlash:0,
    bodyMapKey: species.creatureKey,
    pathways: CREATURE_PATHWAYS[species.creatureKey] || [],
    speed: MON_SPEED[species.creatureKey] || 60,
  };

  // ── Ecology fields (Prompt K-A) ──
  // Copy diet, fleeMode, wanderProfile from creature template so the AI drive
  // system (assessThreatLevel, isViablePrey, detectThreats, detectPrey) can
  // evaluate the player the same way it evaluates any NPC creature.
  const creatureKey = species.creatureKey;
  const PLAYER_DIET_MAP = {
    hare: 'herbivore', cave_crab: 'herbivore',
    wolf: 'predator',  dire_wolf: 'predator',
    ambush_pred: 'predator', mushroom: 'herbivore',
  };
  const PLAYER_FLEE_MAP = {
    cave_crab: 'water',
    ambush_pred: 'home',
  };
  p.diet = PLAYER_DIET_MAP[creatureKey] || 'predator';
  p.fleeMode = PLAYER_FLEE_MAP[creatureKey] || 'standard';
  p.wanderProfile = { ...(WANDER_PROFILES[creatureKey] || DEFAULT_WANDER_PROFILE) };
  // Prompt K-B: water movement — only cave_crab (shaleback) can enter water tiles
  const PLAYER_WATER_MAP = { cave_crab: true };
  p.canEnterWater = PLAYER_WATER_MAP[creatureKey] || false;

  // Initialize body map from creature template (Prompt F)
  initBodyMap(p);

  // Prompt H: store original neural mass for neural death threshold ratio
  if (p.bodyMap) {
    p.originalNeural = p.bodyMap.reduce((sum, z) => sum + (z.neural || 0), 0);
  }

  p.immobilized = false;
  return p;
}

// ==================== VISION RADIUS ====================
// Awareness radius — the small omnidirectional bubble around the player
// that is always visible regardless of facing direction. Always exactly
// 1 tile (the 8 adjacent squares). NOT reduced by night or underground.
function awarenessRadius(p){
  return 1;
}

// Vision radius from the best surviving eye.
// @param {number} acuity      — best visual acuity across the creature's zones (getBestVisualAcuity)
// @param {number} layer       — current map layer
// @param {object} [opts]
// @param {number} [opts.lightBonus=0]    — additive tiles from light sources
// @param {boolean} [opts.nightVision=false] — immune to darkness reduction
// @returns {number} effective vision depth in tiles
function creatureViewRadius(acuity, layer, opts) {
  const { lightBonus = 0, nightVision = false } = opts || {};
  // Acuity 1 sees 3 tiles by day, acuity 10 about 7 (the old 1-100 "Visual"
  // stat was acuity × 10; the curve is unchanged).
  const base = Math.round(3 + (acuity * 10 - 1) * (4 / 99));

  // Night-vision creatures ignore darkness entirely
  if (nightVision) return Math.max(2, base + lightBonus);

  // Determine if the current layer is "dark" (underground, lava, etc.)
  const meta = LAYER_META[layer];
  const layerType = meta ? meta.type : (layer === LAYER_SURFACE ? 'surface' : 'underground');
  const isDark = layerType !== 'surface';

  if (isDark) {
    // Underground / caves — hard limit: cone depth 1 tile.
    return 1;
  }

  // Surface — apply time-of-day scaling.
  const { phase } = getTimePhase(state.worldTick);

  switch (phase) {
    case 'day':
      return Math.max(3, base + lightBonus);

    case 'dawn':
    case 'dusk':
      return Math.max(3, base - 2 + lightBonus);

    case 'night':
      // Night surface — hard limit: cone depth 1 tile.
      return 1;

    default:
      return Math.max(3, base + lightBonus);
  }
}

function playerViewRadius(p, lightBonus){
  return creatureViewRadius(getBestVisualAcuity(p), p.layer, { lightBonus: lightBonus || 0 });
}

export { freshPlayer, playerViewRadius, awarenessRadius };
