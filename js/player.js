// ==================== PLAYER ====================
// The player is a creature: a body map, blood, substrate, senses. This file
// builds one from a species template and holds the few player-only formulas
// (accuracy, dodge, crit, stealth, view radius). There is no HP pool, no
// inventory, no equipment, no XP, no gold: the body is the character.
//
// PLACEHOLDER (Design-Principles): the seven derived stats (siz, strength,
// chem, vib, vis, central, distributed) are still computed here from the
// body map for the readers that predate it (dodge, accuracy, crit, stealth,
// bleed-message gating, the MON table). They are creature-level aggregates
// and are the next thing to retire; every reader should move to the zone.
import { LAYER_SURFACE, LAYER_META, STAT_MAX,
         MAX_DODGE_CHANCE, BASE_ACCURACY, ACC_PER_VISUAL, STEALTH_SIZE_COEFF,
         CREATURE_PATHWAYS, SPECIES_TEMPLATES, initBodyMap, getVisualAcuity } from './constants.js';
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
    // Derived stats — overwritten from the body map below (see PLACEHOLDER above)
    siz: 1, strength: 1, chem: 1, vib: 1, vis: 1, central: 1, distributed: 1,
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

  deriveLegacyStats(p);
  p.immobilized = false;
  return p;
}

// PLACEHOLDER — see the file header. Aggregates over the body map for the
// readers that still want a single number per creature.
function deriveLegacyStats(p){
  if (!p.bodyMap) return;
  const totalMuscle = p.bodyMap.reduce((s, z) => s + (z.muscle || 0), 0);
  const totalSensory = p.bodyMap.reduce((s, z) => s + (z.sensory || 0), 0);
  const totalNeural = p.bodyMap.reduce((s, z) => s + (z.neural || 0), 0);
  const totalMass = p.totalMass || p.bodyMap.reduce((s, z) => s + z.mass, 0);

  p.siz = Math.max(1, Math.min(100, Math.round(totalMass)));
  p.strength = Math.max(1, Math.min(100, Math.round((totalMuscle / totalMass) * 100)));

  let bestChem = 0, bestVib = 0, bestVis = 0;
  for (const z of p.bodyMap) {
    if (!z.transducers) continue;
    const chem = z.transducers.chemical;
    const chemVal = (chem && typeof chem === 'object') ? (chem.airborne || 0) : (chem || 0);
    if (chemVal > bestChem) bestChem = chemVal;
    const vib = z.transducers.vibration;
    const vibVal = (vib && typeof vib === 'object') ? Math.max(vib.ground || 0, vib.air || 0, vib.water || 0) : (vib || 0);
    if (vibVal > bestVib) bestVib = vibVal;
    const visAcuity = getVisualAcuity(z);
    if (visAcuity > bestVis) bestVis = visAcuity;
  }
  p.chem = Math.max(1, bestChem * 10);
  p.vib = Math.max(0, bestVib * 10);
  p.vis = Math.max(1, bestVis * 10);
  p.central = Math.max(1, Math.min(100, Math.round(totalNeural * 20)));
  p.distributed = Math.max(0, Math.min(100, Math.round(totalSensory * 20)));
}

// ==================== COMBAT FORMULAS (stat-based placeholders) ====================
// Accuracy: BASE_ACCURACY + floor(Visual * ACC_PER_VISUAL)
function playerAcc(p){
  return BASE_ACCURACY + Math.floor(p.vis * ACC_PER_VISUAL);
}
// Dodge: smaller creatures dodge more.
function playerDodge(p){
  return Math.max(0, Math.floor(((STAT_MAX + 1 - p.siz) / STAT_MAX) * MAX_DODGE_CHANCE));
}
// Crit: scales linearly with Size (temporary shim).
function playerCritChance(p){
  const raw = (p.siz / 10 - 1) * 4.5;  // Size 10=0%, Size 100=40.5%
  return Math.min(60, raw);
}
function playerCritMult(p){ return 1.5 + p.strength*0.002 + p.central*0.002; }

// Stealth effectiveness — smaller creatures hide better
function stealthBonus(p){
  return Math.max(0, Math.floor((STAT_MAX + 1 - p.siz) * STEALTH_SIZE_COEFF));
}

// ==================== VISION RADIUS ====================
// Awareness radius — the small omnidirectional bubble around the player
// that is always visible regardless of facing direction. Always exactly
// 1 tile (the 8 adjacent squares). NOT reduced by night or underground.
function awarenessRadius(p){
  return 1;
}

// Shared vision radius for any creature (player or enemy).
// @param {number} vis         — creature's Visual stat
// @param {number} layer       — current map layer
// @param {object} [opts]
// @param {number} [opts.lightBonus=0]    — additive tiles from light sources
// @param {boolean} [opts.nightVision=false] — immune to darkness reduction
// @returns {number} effective vision depth in tiles
function creatureViewRadius(vis, layer, opts) {
  const { lightBonus = 0, nightVision = false } = opts || {};
  const base = Math.round(3 + (vis - 1) * (4 / 99));

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
  return creatureViewRadius(p.vis, p.layer, { lightBonus: lightBonus || 0 });
}

export {
  freshPlayer, deriveLegacyStats,
  playerAcc, playerDodge, playerCritChance, playerCritMult, stealthBonus,
  playerViewRadius, awarenessRadius, creatureViewRadius,
};
