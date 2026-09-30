// ==================== DETECTION — Sensing and Information Quality ====================
// Everything about what a creature knows and how it learns it.
// The sensory pipeline: per-zone detection, visual, SNR, uncertainty.
// Split from enemy-ai.js — zero behavior change.

import { state, worlds, groundItems } from './state.js';
import { getBodyMap,
         CHEM_RANGE_COEFF, VIB_GROUND_RANGE_COEFF, VIB_AIR_RANGE_COEFF, VIS_RANGE_COEFF,
         MAX_DETECTION_DISTANCE,
         CHEM_MASS_COEFF,
         SIZE_UNCERTAINTY_BASE,
         DIET_CONF_MIN, DIET_CONF_FULL, SPECIES_CONF_MIN, SPECIES_CONF_FULL,
         CONDITION_CONF_MIN, CONDITION_CONF_FULL, DIET_DECISION_THRESHOLD,
         ASSESS_INTEGRATION_THRESHOLD,
         SPECIES_DISPLAY_CONFIDENCE,
         computeBleedPenalty, getPathways,
         checkNeuralDeath, hasLocomotion,
         BURST_COEFF, BLOOD_DEATH_THRESHOLD, ARMOR_PER_STRUCTURAL_KG,
         selectHitZone,
         MOTION_CONCEALMENT_REDUCTION, BODY_PLAN_HEIGHT_COEFF,
         OCCLUSION_BUDGET_COEFF, BINOCULAR_DEPTH_BONUS, SCENT_FLOOR, SCENT_PROFILES, PERSISTENCE_SCALE,
         MOTION_ANCHOR_SPEED, MOTION_RADIAL_WEIGHT, SELF_FOOTFALL_DISTANCE,
         REFERENCE_SPEED, BASE_TICKS_PER_ACTION,
         VIS_RESOLVE_SNR, VIB_RESOLVE_SNR, CHEM_RESOLVE_SNR,
         VIS_BEARING_RES_DEG, VIB_BEARING_RES_DEG, CHEM_BEARING_RES_DEG, OLFACTORY_WEBER_FRACTION,
         ID_MASS_UNIT, ID_LIMB_UNIT, ID_BRIGHTNESS_UNIT, ID_PROFILE_UNIT, ID_MARGIN, BODY_MAPS,
         // Visual Detection Pass 1 — motion and contrast
         MOTION_SIGNAL_MOVING, MOTION_SIGNAL_STILL,
         CONTRAST_FLOOR, BRIGHTNESS_CONTRAST_WEIGHT, HUE_MISMATCH_PENALTY,
         BLEED_CONTRAST_BONUS, BLEED_VISUAL_SATURATION,
         getIntegument, getVisualAcuity, getVisualConfig,
       } from './constants.js';
import { getLightLevel } from './time-cycle.js';
import { referenceEmission } from './signals.js';
import { groundScentAt, airborneScentAt, upwindStep, ownAirborneLevel, MOLECULAR_CLASSES } from './scent.js';
import { MON } from './monsters.js';
import { hasLOS, EYE_OFFSETS, isInEyeField, sightlineOpacity } from './fov.js';
import { chebyshev, getCover } from './world-state.js';
import { tileConcealmentData, getTerrainVisual } from './terrain.js';
import { dist, directionToward, getCreatureMass, getPlayerDiet, WATER_TILES, isWaterTile,
         getNearbyCreatures, combatCapability } from './ai-utils.js';

// ==================== LIGHT LEVEL ====================
// Maps the day/night cycle phase to a 0.0–1.0 light multiplier.

// ==================== PER-ZONE DETECTION (Prompt P) ====================
// Each zone-channel pair independently computes detection range and SNR.
// No creature-level aggregation. A creature detects when ANY one zone detects.

// Coefficient map: channel name → range coefficient
const _CHANNEL_COEFF = {
  chemicalAirborne: CHEM_RANGE_COEFF,
  vibrationGround:  VIB_GROUND_RANGE_COEFF,
  vibrationAir:     VIB_AIR_RANGE_COEFF,
};

// Detection channel → the transducer path the body map's neural wiring uses
const _WIRING_PATH = {
  chemicalAirborne: 'chemical.airborne',
  vibrationGround:  'vibration.ground',
  vibrationAir:     'vibration.air',
  visual:           'visual',
};

// Emission map: extract target emission for a given channel
function _getTargetEmission(target, channel) {
  if (!target.signals) return 0;
  switch (channel) {
    case 'chemicalAirborne': return target.signals.chemical || 0;
    case 'vibrationGround':  return (target.signals.vibration && target.signals.vibration.ground) || 0;
    case 'vibrationAir':     return (target.signals.vibration && target.signals.vibration.air) || 0;
    case 'visual':           return target.signals.visual || 0;
    default: return 0;
  }
}

/**
 * Iterate transducers on a zone, yielding [channel, quality] pairs.
 * Only distance-detection channels: chemical.airborne, vibration.ground, vibration.air.
 * Skips contact/dissolved/water (touch-range or aquatic).
 * Skips visual (handled by FOV system).
 */
function* _iterZoneTransducers(zone) {
  if (!zone.transducers) return;
  // Smell is not here (perception pass 6b-2): airborne odour arrives as
  // anonymous plume percepts read off the scent field (readPlume), and is
  // tied to a detected animal only by integration (bindPlumes).
  // Vibration ground
  const vib = zone.transducers.vibration;
  if (vib) {
    if ((vib.ground || 0) > 0) yield ['vibrationGround', vib.ground];
    if ((vib.air || 0) > 0) yield ['vibrationAir', vib.air];
  }
}

/**
 * Per-zone detection: check whether observer detects target through non-visual channels.
 * Returns array of { zone, channel, quality, snr } or null if not detected.
 *
 * Performance: skips zero-quality channels immediately. Precomputes quality×coeff per
 * observer zone-channel pair (constant for the turn), skips targets with zero emission.
 */
function detectTargetPerZone(observer, target) {
  const bodyMap = getBodyMap(observer);
  if (!bodyMap) return null;
  if (!target.signals) return null;

  const d = dist(observer.x, observer.y, target.x, target.y);
  if (d > MAX_DETECTION_DISTANCE) return null;

  const detections = [];

  // Own footfalls in the listening channel: the observer's last steps reach
  // its own ground transducers as a neighbour's would from
  // SELF_FOOTFALL_DISTANCE, and add to the noise floor the target's signal
  // has to clear. Received signal goes as emission / d³ (the range law below:
  // range = cbrt(emission) × quality × coeff means the floor is
  // 1 / (quality × coeff)³), so the floor becomes floor + own / r³. A still
  // body listens at full range; a walking one is nearly deaf through the
  // ground. This is why animals stop to listen.
  const ownFootfalls = observer.signals && observer.signals.vibration
    ? (observer.signals.vibration.ground || 0) : 0;
  const selfNoise = ownFootfalls / (SELF_FOOTFALL_DISTANCE * SELF_FOOTFALL_DISTANCE * SELF_FOOTFALL_DISTANCE);

  for (const zone of bodyMap) {
    if (zone.destroyed) continue;

    for (const [channel, quality] of _iterZoneTransducers(zone)) {
      const emission = _getTargetEmission(target, channel);
      if (emission <= 0) continue;

      const coeff = _CHANNEL_COEFF[channel];
      const k = quality * coeff;
      const zoneRange = (channel === 'vibrationGround' && selfNoise > 0)
        ? Math.cbrt(emission / (1 / (k * k * k) + selfNoise))
        : Math.cbrt(emission) * k;
      if (d <= zoneRange) {
        const snr = d > 0 ? zoneRange / d : zoneRange * 10; // adjacent = very high SNR
        detections.push({ zone, channel, quality, snr });
      }
    }
  }

  // Near-field smell (perception pass 6b-2): within a tile, odour is steep
  // and localisable (the nose checks the tiles around it, as it does for
  // trails), so a scent hotspot on the next tile is an animal right there.
  // Its kind comes from the composition of that air, not from the animal.
  if (chebyshev(observer.x, observer.y, target.x, target.y) <= 1) {
    const near = _nearFieldSmell(observer, target, bodyMap);
    if (near) detections.push(near);
  }

  return detections.length > 0 ? detections : null;
}

function _nearFieldSmell(observer, target, bodyMap) {
  let zone = null, q = 0;
  for (const z of bodyMap) {
    if (z.destroyed) continue;
    const chem = z.transducers && z.transducers.chemical;
    const zq = (chem && typeof chem === 'object') ? (chem.airborne || 0) : 0;
    if (zq > q) { q = zq; zone = z; }
  }
  if (q <= 0) return null;
  const layer = observer.layer != null ? observer.layer : state.player.layer;
  const e = airborneScentAt(layer, target.x, target.y);
  if (!e) return null;
  const threshold = SCENT_FLOOR / q;
  const herb = _volatileSum(e, HERBIVORE_VOLATILES);
  const meat = Math.max(0, _volatileSum(e, MEAT_EATER_VOLATILES) - _PLANT_EATER_MEAT_RATIO * herb);
  const snr = (herb + meat) / threshold;
  if (snr < 1) return null;
  return { zone, channel: 'chemicalAirborne', quality: q, snr,
           kind: meat > herb ? 'predator' : 'herbivore', bloodSNR: (e.hemolymph || 0) / threshold };
}

// ==================== SENSE HELPERS ====================

/**
 * Helper: get the best chemical airborne quality from surviving zones.
 * Used by detectCorpses and movementCompromisesSense.
 */
function getBestChemicalAirborne(entity) {
  const bodyMap = getBodyMap(entity);
  if (!bodyMap) return 0;
  let best = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const chem = zone.transducers && zone.transducers.chemical;
    const val = (chem && typeof chem === 'object') ? (chem.airborne || 0) : 0;
    if (val > best) best = val;
  }
  return best;
}

/**
 * Helper: get effective visual quality (max across surviving zones).
 * Used by visual detection in canDetect (visual remains max-based).
 * Handles both formats: visual: 0 (number) and visual: { acuity: 3, ... } (object).
 */
function getEffectiveVisual(creature) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return 0;
  let best = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const raw = zone.transducers && zone.transducers.visual;
    // Visual transducers are stored as either a plain number (0 for no visual)
    // or an object { acuity, placement, fieldAngle } on zones with eyes.
    const val = (raw && typeof raw === 'object') ? (raw.acuity || 0) : (raw || 0);
    if (val > best) best = val;
  }
  return best;
}

/** The surviving zone carrying the sharpest eyes, or null. The visual
 *  detection is credited to it, so the wiring that reads 'head.visual' reads
 *  the eyes that actually saw. */
function _bestEyeZone(creature) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return null;
  let best = null, bestAcuity = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const a = getVisualAcuity(zone);
    if (a > bestAcuity) { bestAcuity = a; best = zone; }
  }
  return best;
}

/**
 * Compute dominant sense channel for a creature (for movementCompromisesSense).
 * Returns { type, value } for the highest-quality non-visual sense.
 */
function getDominantSenseChannel(creature) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return { type: 'none', value: 0 };

  let bestChem = 0, bestVibG = 0, bestVibA = 0, bestVis = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    // Chemical airborne
    const chem = zone.transducers && zone.transducers.chemical;
    const chemVal = (chem && typeof chem === 'object') ? (chem.airborne || 0) : 0;
    if (chemVal > bestChem) bestChem = chemVal;
    // Vibration
    const vib = zone.transducers && zone.transducers.vibration;
    if (vib) {
      if ((vib.ground || 0) > bestVibG) bestVibG = vib.ground;
      if ((vib.air || 0) > bestVibA) bestVibA = vib.air;
    }
    // Visual
    const visVal = getVisualAcuity(zone);
    if (visVal > bestVis) bestVis = visVal;
  }

  const channels = [
    { type: 'groundVibration', value: bestVibG },
    { type: 'chemicalAirborne', value: bestChem },
    { type: 'visual', value: bestVis },
    { type: 'airVibration', value: bestVibA },
  ];
  let dominant = channels[0];
  for (const ch of channels) {
    if (ch.value > dominant.value) dominant = ch;
  }
  return dominant;
}

// ==================== VISUAL DETECTION ====================

// ── Motion & Contrast Helpers (Visual Detection Pass 1) ──

/**
 * Is the target currently moving? Checks movedThisTurn (NPC AI flag)
 * or prevX/prevY comparison (fallback, used by concealment system).
 */
function _isTargetMoving(target) {
  if (target.movedThisTurn != null) return target.movedThisTurn;
  if (target.prevX != null && target.prevY != null) {
    return target.prevX !== target.x || target.prevY !== target.y;
  }
  return false;
}

// ── Motion as velocity (perception pass 4) ──
// A body's velocity over its last action, in tiles per world tick: the step
// it took (turn-loop.js records it) times its speed, which is its
// force-to-weight at that gait times its acceleration: the same number that
// sets how many actions it gets per unit of world time. A tile per action at
// REFERENCE_SPEED takes BASE_TICKS_PER_ACTION ticks, so tiles per tick is
// speed / (REFERENCE_SPEED × BASE_TICKS_PER_ACTION). A diagonal step covers
// √2 tiles in the same time.
function _velocity(target) {
  if (!_isTargetMoving(target) || !target._step || !(target._speed > 0)) return null;
  const s = target._speed / (REFERENCE_SPEED * BASE_TICKS_PER_ACTION);
  return { vx: target._step.dx * s, vy: target._step.dy * s };
}

/** A target's velocity as this observer sees it: across the line of sight
 *  (the eye's angular motion) and closing along it (positive = approaching),
 *  both in tiles per world tick. Null if the target did not move. */
function _motionRelativeTo(detector, target) {
  const v = _velocity(target);
  if (!v) return null;
  const dx = target.x - detector.x, dy = target.y - detector.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return { across: Math.hypot(v.vx, v.vy), closing: 0 };
  const ux = dx / d, uy = dy / d;
  return { across: Math.abs(v.vx * uy - v.vy * ux), closing: -(v.vx * ux + v.vy * uy) };
}

/** How strongly this eye's change detection and pattern recognition together
 *  pick the target out (sensory-constants.js, "Motion as velocity"). A body
 *  that moved without a recorded step (should not happen) reads as a walker
 *  crossing the view, the old binary value. */
function _motionFactor(detector, target) {
  if (!_isTargetMoving(target)) return MOTION_SIGNAL_STILL;
  const m = _motionRelativeTo(detector, target);
  if (!m) return MOTION_SIGNAL_MOVING;
  return MOTION_SIGNAL_STILL + (MOTION_SIGNAL_MOVING - MOTION_SIGNAL_STILL) *
         (m.across + MOTION_RADIAL_WEIGHT * Math.abs(m.closing)) / MOTION_ANCHOR_SPEED;
}

/**
 * Compute background contrast factor for a target on its current tile.
 * Returns a multiplier: ~0.1 (perfect match) to ~1.0+ (maximum contrast).
 */
function _computeContrastFactor(target) {
  const integument = getIntegument(target);
  if (!integument) return 1.0;

  const layer = target.layer != null ? target.layer : state.player.layer;
  if (!worlds[layer]) return 1.0;

  const ground = worlds[layer][target.y]?.[target.x];
  if (ground == null) return 1.0;
  const cover = getCover(layer, target.x, target.y);
  const terrainVis = getTerrainVisual(ground, cover);

  const brightnessDiff = Math.abs(integument.brightness - terrainVis.brightness);
  const hueMatch = (integument.hue === terrainVis.hue) ? 0.0 : HUE_MISMATCH_PENALTY;

  let contrast = CONTRAST_FLOOR + brightnessDiff * BRIGHTNESS_CONTRAST_WEIGHT + hueMatch;

  // Bleed bonus: cyan blood against dark red flora is maximum contrast.
  if (target.blood != null && target.bloodMax != null && target.bloodMax > 0
      && target.blood < target.bloodMax) {
    const bleedFraction = 1.0 - (target.blood / target.bloodMax);
    contrast += BLEED_CONTRAST_BONUS * Math.min(1.0, bleedFraction / BLEED_VISUAL_SATURATION);
  }

  return contrast;
}

// How far this eye can pick this body out. Vision is not a spreading signal:
// nothing of the target thins out with distance, its angular size does, and
// that falls linearly. So the range is linear in everything that sets how
// big and how distinct the silhouette is: its linear dimension (the cube
// root of mass, signals.js), motion (the eye's change detection fires at a
// far lower contrast than its pattern recognition, and harder the faster the
// target moves across the view: _motionFactor), and contrast against the
// tile. Light enters as the square root: the eye's contrast threshold rises
// as photon noise does, with the root of the luminance. The old form took
// the cube root of the whole product, the law for smell and footfalls, and
// squashed a moving animal against a still one to 2× and a conspicuous one
// against a matched one to 2.3×.
function getVisualRange(detector, target) {
  const size = target.signals ? target.signals.visual : 0;
  const sensitivity = getEffectiveVisual(detector);
  const light = getLightLevel(state.player.layer);   // every active creature is on the player's layer
  if (size <= 0 || sensitivity <= 0 || light <= 0) return 0;
  const motion = _motionFactor(detector, target);
  const contrast = _computeContrastFactor(target);
  return size * motion * contrast * Math.sqrt(light) * sensitivity * VIS_RANGE_COEFF;
}

function facingToAngle(facing) {
  if (!facing) return 0;
  return Math.atan2(facing.dy, facing.dx) * (180 / Math.PI);
}

function isInVisionCone(detector, target) {
  return _eyeCoverage(detector, target) != null;
}

// Which eyes cover the target: { eyes, acuity } (how many eyes' arcs contain
// it, and the sharpest of those eyes), or null if none does. Two or more is
// binocular. Visual field from the body map (Per-Eye-Visual-Field-Design):
// every surviving zone with a visual transducer is a pair of eyes at
// ±EYE_OFFSETS[placement] from facing, each covering fieldAngle. This is the
// same geometry the player's FOV uses in fov.js, so a hare's lateral 170° eyes
// give it a ~330° field and a prowler's forward 120° eyes give it ~160°.
// Destroy the zone carrying the eyes and that part of the field is gone.
function _eyeCoverage(detector, target) {
  const bodyMap = getBodyMap(detector);
  // No facing data = omnidirectional: every eye counts
  const facing = detector.isPlayer ? state.facing : detector.facing;
  const facingAngleDeg = facing ? facingToAngle(facing) : null;

  let hasEyeZone = false;   // any zone with eyes, destroyed or not
  let eyes = 0, acuity = 0;
  if (bodyMap) {
    for (const zone of bodyMap) {
      const cfg = getVisualConfig(zone);
      if (!cfg || cfg.acuity <= 0) continue;
      hasEyeZone = true;
      if (zone.destroyed) continue;   // eyes gone with the zone
      let seen = 0;
      if (facingAngleDeg == null || cfg.fieldAngle >= 360) {
        seen = 2;
      } else {
        const offset = EYE_OFFSETS[cfg.placement] ?? EYE_OFFSETS.forward;
        const half = cfg.fieldAngle / 2;
        if (isInEyeField(detector.x, detector.y, target.x, target.y, facingAngleDeg + offset, half)) seen++;
        if (isInEyeField(detector.x, detector.y, target.x, target.y, facingAngleDeg - offset, half)) seen++;
      }
      if (seen > 0) { eyes += seen; if (cfg.acuity > acuity) acuity = cfg.acuity; }
    }
  }
  if (hasEyeZone) return eyes > 0 ? { eyes, acuity } : null;

  // No body-map eyes at all (legacy creature): single forward cone from the species
  // table, as before. (The old code read detector.visionConeWidth, which was
  // never assigned, so every creature got 120°.)
  const legacyAcuity = getEffectiveVisual(detector);
  if (facingAngleDeg == null) return { eyes: 1, acuity: legacyAcuity };
  const coneWidth = detector.coneAngle || 120;
  if (coneWidth >= 360) return { eyes: 1, acuity: legacyAcuity };
  const dx = target.x - detector.x;
  const dy = target.y - detector.y;
  const angleToTarget = Math.atan2(dy, dx) * (180 / Math.PI);
  let diff = Math.abs(angleToTarget - facingAngleDeg) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff <= coneWidth / 2 ? { eyes: 1, acuity: legacyAcuity } : null;
}

/**
 * True if the creature is actively fleeing and tracking this specific target
 * as its threat source. Represents head/eye rotation to maintain visual
 * contact with the threat during flight. Only applies to the tracked threat —
 * other entities still use the normal cone check.
 */
function _isActivelyTracking(detector, target) {
    if (!detector.threatSource) return false;
    const behavior = detector.currentBehavior;
    if (behavior !== 'flee' && behavior !== 'flee_refuge') return false;
    return detector.threatSource === target;
}

// ==================== LOCAL CONCEALMENT ====================
// Cover on the target's tile partially hides creatures standing on it.
// This reduces the visual signal before SNR computation. Does NOT affect
// terrain visibility (you see the tile, but the creature is harder to spot).
// Only applies to the VISUAL channel — chemical/vibration are unaffected.

/**
 * Compute effective concealment for a creature on its current tile.
 * Size-dependent: cover hides more of a small creature than a large one.
 * Motion-dependent: moving through cover disturbs it, reducing concealment.
 *
 * @param {object} target — the creature being observed
 * @returns {number} concealment factor 0–1 (0 = no concealment, 1 = fully hidden)
 */
function computeEffectiveConcealment(target) {
  const layer = target.layer != null ? target.layer : state.player.layer;
  if (!worlds[layer]) return 0;

  const ground = worlds[layer][target.y]?.[target.x];
  const cover = getCover(layer, target.x, target.y);
  const coverData = tileConcealmentData(ground, cover);
  if (!coverData || coverData.concealment <= 0) return 0;

  // Size-dependent: how much of the creature does the cover actually hide?
  const mass = getCreatureMass(target);
  const creatureHeight = Math.pow(mass, 1/3) * BODY_PLAN_HEIGHT_COEFF;
  const coverRatio = creatureHeight > 0
    ? Math.min(1.0, coverData.heightClass / creatureHeight)
    : 1.0;
  let concealment = coverData.concealment * coverRatio;

  // Motion reduces concealment: grass rustling, branches moving, etc.
  // (Was a prevX/prevY comparison; nothing ever set those, so it never fired.)
  if (_isTargetMoving(target)) {
    concealment *= MOTION_CONCEALMENT_REDUCTION;
  }

  return concealment;
}

// --- Line of Sight ---
// Walls only (hasLOS from fov.js with no per parameter). Cover along the way is
// charged against the eye's occlusion budget in _visualDetection.

function hasLineOfSight(detector, target) {
  const layer = detector.layer != null ? detector.layer : state.player.layer;
  return hasLOS(layer, detector.x, detector.y, target.x, target.y);
}

// ==================== VISUAL DETECTION (one path) ====================
// The visual channel for any detector: the eye's range on this target (size,
// motion, contrast, light), line of sight, the eyes' field (or an actively
// tracked threat, for NPCs), then the cover on the target's tile, which
// shrinks the effective range by the fraction of the body it hides
// (Visual-Occlusion-Design: the visible silhouette is what is left). Returns
// a detection entry { zone, channel: 'visual', quality, snr, moving, closing }
// or null (closing: how fast it approaches, tiles per world tick):
// zone is the eye zone credited with the sighting, moving whether the eye's
// change detection fired (the motion factor in the range) or only its
// pattern recognition did.
// canDetect (NPCs) and computePlayerPerception (the player) both use this,
// so the SNR the ganglia see is the SNR that decided the detection.
function _visualDetection(detector, target) {
  const d = dist(detector.x, detector.y, target.x, target.y);
  const visRange = getVisualRange(detector, target);
  if (visRange <= 0 || d > visRange) return null;
  if (!hasLineOfSight(detector, target)) return null;
  let coverage = _eyeCoverage(detector, target);
  if (!coverage && !detector.isPlayer && _isActivelyTracking(detector, target)) {
    // Head turned onto the tracked threat: both eyes on it
    coverage = { eyes: 2, acuity: getEffectiveVisual(detector) };
  }
  if (!coverage) return null;
  // Sightline cover (Visual-Occlusion-Design): every tile between the eye and
  // the target adds its opacity, and past the eye's occlusion budget the
  // target is lost in the foliage. The budget is the covering eye's acuity,
  // with the depth bonus when two eyes see it. The player's field already ran
  // this exact rule in its shadowcast (fov.js updatePlayerFOV), so only NPCs
  // are charged here; before, NPC eyes looked straight through forest.
  if (!detector.isPlayer) {
    const layer = detector.layer != null ? detector.layer : state.player.layer;
    const budget = coverage.acuity * OCCLUSION_BUDGET_COEFF *
                   (coverage.eyes >= 2 ? BINOCULAR_DEPTH_BONUS : 1);
    if (sightlineOpacity(layer, detector.x, detector.y, target.x, target.y) >= budget) return null;
  }
  const concealment = computeEffectiveConcealment(target);
  const effectiveVisRange = concealment > 0 ? visRange * (1.0 - concealment) : visRange;
  if (d > effectiveVisRange) return null;
  const snr = d > 0 ? effectiveVisRange / d : effectiveVisRange * 10;
  const rel = _motionRelativeTo(detector, target);
  // How many eyes are on it: the player's field says binocular or monocular
  // per tile (fov.js); an NPC's comes from its eye coverage
  const eyes = detector.isPlayer
    ? (state.fovSet && state.fovSet.has(`${target.x},${target.y}`) ? 2 : 1)
    : coverage.eyes;
  return { zone: _bestEyeZone(detector), channel: 'visual', quality: getEffectiveVisual(detector), snr,
           moving: _isTargetMoving(target), closing: rel ? rel.closing : 0, velocity: _velocity(target), eyes };
}

// ==================== MASTER DETECTION (Prompt P) ====================
// Per-zone detection for the non-visual channels plus the one visual path.
// Returns { detected, detections, senses, distance, bestSNR }; detections is
// every channel that detected, visual included, so callers never recompute.

function canDetect(detector, target) {

  const d = dist(detector.x, detector.y, target.x, target.y);

  // Early exit — nothing detects beyond absolute ceiling
  if (d > MAX_DETECTION_DISTANCE) return { detected: false, detections: [], senses: [], distance: d, bestSNR: 0 };

  const senses = [];
  let bestSNR = 0;

  // Non-visual: per-zone detection
  const detections = detectTargetPerZone(detector, target) || [];
  if (detections.length > 0) {
    // Collect which channel types were detected
    const channelsSeen = new Set();
    for (const det of detections) {
      channelsSeen.add(det.channel);
      if (det.snr > bestSNR) bestSNR = det.snr;
    }
    if (channelsSeen.has('chemicalAirborne')) senses.push('chemical');
    if (channelsSeen.has('vibrationGround')) senses.push('vibration_ground');
    if (channelsSeen.has('vibrationAir')) senses.push('vibration_air');
  }

  // Visual
  const vis = _visualDetection(detector, target);
  if (vis) {
    senses.push('visual');
    detections.push(vis);
    if (vis.snr > bestSNR) bestSNR = vis.snr;
  }

  return {
    detected: senses.length > 0,
    detections,
    senses:   senses,
    distance: d,
    bestSNR:  bestSNR,
  };
}

// --- Legacy helper for external callers / debug ---
// Returns the max detection range across all senses for a hypothetical average target.
function getDetectionRange(creature) {
  // Compute max quality per non-visual channel from zones
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return 0;
  let bestChem = 0, bestVibG = 0, bestVibA = 0, bestVis = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const chem = zone.transducers && zone.transducers.chemical;
    const chemVal = (chem && typeof chem === 'object') ? (chem.airborne || 0) : 0;
    if (chemVal > bestChem) bestChem = chemVal;
    const vib = zone.transducers && zone.transducers.vibration;
    if (vib) {
      if ((vib.ground || 0) > bestVibG) bestVibG = vib.ground;
      if ((vib.air || 0) > bestVibA) bestVibA = vib.air;
    }
    const visVal = getVisualAcuity(zone);
    if (visVal > bestVis) bestVis = visVal;
  }
  // Rough estimate using typical emission values — for debug display only
  const chemR  = bestChem > 0 ? Math.cbrt(2.0) * bestChem * CHEM_RANGE_COEFF : 0;
  const vibGR  = bestVibG > 0 ? Math.cbrt(1.0) * bestVibG * VIB_GROUND_RANGE_COEFF : 0;
  const vibAR  = bestVibA > 0 ? Math.cbrt(0.5) * bestVibA * VIB_AIR_RANGE_COEFF : 0;
  const visR   = bestVis > 0 ? 2.8 * MOTION_SIGNAL_MOVING * 0.6 * bestVis * VIS_RANGE_COEFF : 0;   // a moving 22 kg body at contrast 0.6
  return Math.max(chemR, vibGR, vibAR, visR);
}

// ==================== SNR AND UNCERTAINTY (Prompt P) ====================

/** Estimate target mass from the channel that detected it, with the
 *  observer's own emission on that channel as the measuring stick
 *  (Sensory-Design "Size estimation"). Smell and air vibration scale with
 *  mass; a silhouette with its cube root, so that ratio is cubed back;
 *  ground vibration is footfall loudness, mass over foot contact, which says
 *  as much about gait as about weight, and the estimate is honestly rough.
 *  What the observer cannot know it does not correct for: a moving predator
 *  smells like a heavier animal to a resting grazer. */
function estimateMassFromSignal(target, observer, channel) {
  const observerMass = getCreatureMass(observer);
  const ref = referenceEmission(observer, channel);
  const sig = _getTargetEmission(target, channel);
  if (ref > 0 && sig > 0) {
    const ratio = sig / ref;
    return observerMass * (channel === 'visual' ? ratio * ratio * ratio : ratio);
  }
  return observerMass;   // no usable signal: assume something like itself
}

/** Compute relativeMagnitude from size uncertainty bounds.
 *  Returns a category string for the reactive layer. */
function relativeMagnitude(observer, info) {
  if (!info.sizeEstimate) return 'unknown';

  const selfMass = getCreatureMass(observer);
  const upper = info.sizeEstimate.upper;
  const lower = info.sizeEstimate.lower;

  // Worst-case interpretation for reactive layer
  if (lower > selfMass * 2.0) return 'much_larger';
  if (lower > selfMass * 1.3) return 'larger';
  if (upper < selfMass * 0.3) return 'much_smaller';
  if (upper < selfMass * 0.7) return 'smaller';

  // Both bounds inside the similar band: about my size
  if (lower >= selfMass * 0.7 && upper <= selfMass * 1.3) return 'similar';

  // Range spans "similar" — could be larger or smaller
  return 'ambiguous';
}

/** Check if any locomotion zone is destroyed on the target. */
function _hasDestroyedLocomotionZone(target) {
  const bodyMap = getBodyMap(target);
  if (!bodyMap) return false;
  return bodyMap.some(z => z.locomotion && z.destroyed);
}

// ==================== GROUND TRAILS (perception pass 6b) ====================
// Deposits on the substrate (scent.js ground layer) read through chemical
// transducers: contact ones on the tile underfoot, airborne ones on the
// evaporation layer over the tiles around it, nose down
// (Chemical-Scent-System-Design: 1-2 tiles; one here). A reading clears a
// transducer when the classes it matches exceed SCENT_FLOOR / quality. A
// trail names no animal: it is volatiles on the ground, read as kinds.
const HERBIVORE_VOLATILES  = ['greenLeaf'];           // plant digestion
const MEAT_EATER_VOLATILES = ['ketones', 'amines'];   // meat metabolism

function _volatileSum(entry, classes) {
  let s = 0;
  for (const c of classes) s += entry[c] || 0;
  return s;
}

/** Best surviving chemical transducer on a medium ('contact' | 'airborne'). */
function _bestChemical(creature, medium) {
  const bodyMap = getBodyMap(creature);
  let best = 0;
  if (bodyMap) for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const chem = zone.transducers && zone.transducers.chemical;
    const q = (chem && typeof chem === 'object') ? (chem[medium] || 0) : 0;
    if (q > best) best = q;
  }
  return best;
}

/** Where a prey trail leads from here: the direction (0-7) of the freshest
 *  tile around this creature carrying herbivore volatiles above what its nose
 *  resolves, or null. Freshness is the order of deposits, so the trail is
 *  followed toward where the animal went. If the tile underfoot is fresher
 *  than any around it, the trail ends here (water, or it went out of reach)
 *  and there is no step. */
function readPreyTrailStep(creature) {
  const airQ = _bestChemical(creature, 'airborne');
  if (airQ <= 0) return null;   // no nose to put to the ground around it
  const layer = creature.layer != null ? creature.layer : state.player.layer;
  const threshold = SCENT_FLOOR / airQ;
  const here = groundScentAt(layer, creature.x, creature.y);
  const hereSeq = (here && _volatileSum(here, HERBIVORE_VOLATILES) >= threshold) ? here.seq : -1;
  let bestSeq = -1, bestDx = 0, bestDy = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const e = groundScentAt(layer, creature.x + dx, creature.y + dy);
      if (!e || _volatileSum(e, HERBIVORE_VOLATILES) < threshold) continue;
      if (e.seq > bestSeq) { bestSeq = e.seq; bestDx = dx; bestDy = dy; }
    }
  }
  if (bestSeq < 0 || bestSeq < hereSeq) return null;
  return directionToward(creature.x, creature.y, creature.x + bestDx, creature.y + bestDy);
}

/** Meat-eater volatiles on the tile underfoot as read by the given contact
 *  transducers ('zone.chemical.contact' paths): the concentration, or 0 if
 *  it is under what the best of them resolves. */
function meatEaterUnderfoot(creature, contactInputs) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap || !contactInputs.length) return 0;
  let q = 0;
  for (const input of contactInputs) {
    const zone = bodyMap.find(z => z.key === input.split('.')[0]);
    if (!zone || zone.destroyed) continue;
    const chem = zone.transducers && zone.transducers.chemical;
    const zq = (chem && typeof chem === 'object') ? (chem.contact || 0) : 0;
    if (zq > q) q = zq;
  }
  if (q <= 0) return 0;
  const layer = creature.layer != null ? creature.layer : state.player.layer;
  const e = groundScentAt(layer, creature.x, creature.y);
  if (!e) return 0;
  const c = _volatileSum(e, MEAT_EATER_VOLATILES);
  return c >= SCENT_FLOOR / q ? c : 0;
}

// ==================== AIRBORNE PLUMES (perception pass 6b-2) ====================
// A nose reads the air on its own tile (the scent field, scent.js): what
// kinds of volatiles, how strong. The strength is confounded with distance and
// source size and names no animal. The bearing is not in the odour: it is the
// wind, felt by the body's air-flow transducers (vibration.air), so a body
// without them smells without knowing from where, and in still air nobody
// knows. Kinds are read by composition against wired templates (crystallized,
// Sensory-Design): plant digestion (greenLeaf) is herbivore; ketones + amines
// beyond what plant-eaters carry with their plant volatiles is meat-eater.
// The ratio plant-eaters carry comes from their emission profiles, which is
// also why a herbivore's own odour, and its herd's, never reads as a
// meat-eater.
const _PLANT_EATER_MEAT_RATIO = (() => {
  let r = 0;
  for (const key of ['hare', 'cave_crab']) {
    const p = SCENT_PROFILES[key];
    if (p && p.greenLeaf > 0) r = Math.max(r, ((p.ketones || 0) + (p.amines || 0)) / p.greenLeaf);
  }
  return r;
})();

/** What this creature's nose reads in the air on its tile:
 *  { herbSNR, meatSNR, bloodSNR, upwind } with each SNR = concentration over
 *  the nose's threshold (SCENT_FLOOR / quality), and upwind a step {dx, dy}
 *  or null; or null if nothing clears the nose. */
function readPlume(creature) {
  const q = _bestChemical(creature, 'airborne');
  if (q <= 0) return null;
  const layer = creature.layer != null ? creature.layer : state.player.layer;
  const e = airborneScentAt(layer, creature.x, creature.y);
  if (!e) return null;
  const threshold = SCENT_FLOOR / q;
  // The nose is adapted to its own odour (scent.js ownAirborneLevel): what
  // it reads is the excess over its own background, and that excess has to
  // clear a Weber fraction of the background as well as the nose's floor.
  const own = ownAirborneLevel(creature);
  const ownHerb = _volatileSum(own, HERBIVORE_VOLATILES), ownMeat = _volatileSum(own, MEAT_EATER_VOLATILES);
  const herb = Math.max(0, _volatileSum(e, HERBIVORE_VOLATILES) - ownHerb);
  const meatAll = Math.max(0, _volatileSum(e, MEAT_EATER_VOLATILES) - ownMeat);
  const meat = Math.max(0, meatAll - _PLANT_EATER_MEAT_RATIO * herb);
  const blood = Math.max(0, (e.hemolymph || 0) - (own.hemolymph || 0));
  const herbSNR = herb / Math.max(threshold, OLFACTORY_WEBER_FRACTION * ownHerb);
  const meatSNR = meat / Math.max(threshold, OLFACTORY_WEBER_FRACTION * ownMeat);
  const bloodSNR = blood / Math.max(threshold, OLFACTORY_WEBER_FRACTION * (own.hemolymph || 0));
  if (herbSNR < 1 && meatSNR < 1) return null;
  // Bearing from the wind, if anything on the body feels air move
  const feelsAir = _bestVibrationAir(creature) > 0;
  return { herbSNR, meatSNR, bloodSNR, upwind: feelsAir ? upwindStep() : null };
}

function _bestVibrationAir(creature) {
  const bodyMap = getBodyMap(creature);
  let best = 0;
  if (bodyMap) for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const v = zone.transducers && zone.transducers.vibration;
    if (v && (v.air || 0) > best) best = v.air;
  }
  return best;
}

/** Which modalities this creature can bind an odour to: those processed in a
 *  surviving zone that also holds integration tissue and chemical processing
 *  (the cross-modal coincidence happens where the streams converge). A
 *  meso-predator's head binds smell to sight; a lurker's head integrates
 *  sight and vibration but no chemistry, and a hare has no integration
 *  tissue: neither ties a smell to an animal. */
function _bindableModalities(creature) {
  const bodyMap = getBodyMap(creature);
  const out = new Set();
  if (bodyMap) for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const a = zone.neuralAllocation;
    if (!a || !(a.integration > 0) || !(a.chemicalProcessing > 0)) continue;
    if (a.visualProcessing > 0) out.add('visual');
    if (a.vibrationProcessing > 0) { out.add('vibration_ground'); out.add('vibration_air'); }
  }
  return out;
}

/** Tie the plume to the detected animals it could be coming from: those
 *  perceived within one compass step of upwind, through a modality this body
 *  can bind (above). They take the plume's kind (the stronger reading) as
 *  their diet, at the confidence its SNR gives, and blood in it as wound
 *  chemistry. Nothing else learns an animal's diet by smell. */
function bindPlumes(creature) {
  const plume = creature.plume;
  if (!plume || !plume.upwind) return;
  const modalities = _bindableModalities(creature);
  if (modalities.size === 0) return;
  const upAng = Math.atan2(plume.upwind.dy, plume.upwind.dx);
  const kind = plume.meatSNR >= plume.herbSNR ? 'predator' : 'herbivore';
  const snr = Math.max(plume.meatSNR, plume.herbSNR);
  for (const info of (creature.detectionInfo || [])) {
    if (!(info.senses || []).some(s => modalities.has(s))) continue;
    const ang = Math.atan2(info.y - creature.y, info.x - creature.x);
    let diff = Math.abs(ang - upAng);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > Math.PI / 4 + 1e-9) continue;
    if (snr > DIET_CONF_MIN) {
      const conf = Math.min(1.0, (snr - DIET_CONF_MIN) / (DIET_CONF_FULL - DIET_CONF_MIN));
      if (conf > info.dietConfidence) { info.dietConfidence = conf; info.dietType = kind; }
    }
    if (plume.bloodSNR > CONDITION_CONF_MIN) info.woundChemistry = true;
    // Fight assessment needs the diet it now has (buildDetectionInfo ran first)
    if (creature.integrationCapacity >= ASSESS_INTEGRATION_THRESHOLD &&
        info.sizeEstimate && info.dietConfidence > 0.5) {
      info.threatAssessment = assessFightOutcome(creature, info.entity, info);
    }
  }
}

// ==================== PERCEPTS (perception pass 5) ====================
// A percept is what an observer's senses deliver about one source on this
// action: the detection info below (size estimate, species and diet
// confidence, closing speed, ...) and the tile the source is perceived on.
// Every decision about another body reads its percept, never the body: where
// it is, how big, what kind. The entity reference rides along only as
// identity (to keep a goal on "that one") and for physical contact (a bite
// lands on whatever is actually on the tile; canMoveTo will not step onto an
// occupied one). The player's display draws from percepts too.

// ── Received-signal inference (perception pass 6) ──
// What the channels say about a source, from what arrived at them
// (sensory-constants.js, "Received-signal inference"): its size and the tile
// that size puts it on. The channel with the most resolved structure sets the
// size (and so the distance); the channel with the finest bearing sets the
// direction. Systematic, never random: the same geometry reads the same way.
const _RESOLVE_SNR = {
  visual: VIS_RESOLVE_SNR, vibrationGround: VIB_RESOLVE_SNR,
  vibrationAir: VIB_RESOLVE_SNR, chemicalAirborne: CHEM_RESOLVE_SNR,
};
const _BEARING_RES_DEG = {
  visual: VIS_BEARING_RES_DEG, vibrationGround: VIB_BEARING_RES_DEG,
  vibrationAir: VIB_BEARING_RES_DEG, chemicalAirborne: CHEM_BEARING_RES_DEG,
};

// ==================== IDENTIFICATION (perception pass 7) ====================
// Wired templates, one per species of the observer's world (sensory-
// constants.js "Identification"), built from the species' own template body:
// its mass, its locomotion limbs, its integument, its volatile mix, and the
// diet that goes with it (a plant-digestion volatile in the mix: herbivore).
const _templatesByLayer = new Map();
function _speciesTemplates(layer) {
  if (_templatesByLayer.has(layer)) return _templatesByLayer.get(layer);
  const list = [];
  for (const key of Object.keys(MON)) {
    if (MON[key].layer !== layer || !BODY_MAPS[key]) continue;
    const zones = BODY_MAPS[key];
    const profile = SCENT_PROFILES[key] || null;
    const integ = getIntegument({ key });
    list.push({
      key,
      mass: zones.reduce((s, z) => s + (z.mass || 0), 0),
      legs: zones.filter(z => z.locomotion).length,
      brightness: integ ? integ.brightness : null,
      profile: profile ? _normalisedMix(profile) : null,
      diet: profile && profile.greenLeaf > 0 ? 'herbivore' : 'predator',
    });
  }
  _templatesByLayer.set(layer, list);
  return list;
}

function _normalisedMix(v) {
  let total = 0;
  for (const c of MOLECULAR_CLASSES) total += v[c] || 0;
  const out = {};
  for (const c of MOLECULAR_CLASSES) out[c] = total > 0 ? (v[c] || 0) / total : 0;
  return out;
}

function _mixDistance(a, b) {
  let d = 0;
  for (const c of MOLECULAR_CLASSES) d += Math.abs((a[c] || 0) - (b[c] || 0));
  return d;
}

/** Match what the channels resolve of a source against the templates.
 *  chanW: the resolve weight each modality reached (visual, vibration,
 *  chemical); massEst: the size estimate so far. The features: mass (at the
 *  size weight), locomotion limbs (footfall pattern or silhouette: the
 *  better of feet and eyes), integument brightness (eyes), the volatile mix
 *  of the air on its tile (nose, near field). What the target's body is,
 *  its channels carry; what they resolve of it, their SNR sets.
 *  Returns { template, confidence }; confidence 0 when nothing is resolved. */
function _identify(observer, target, massEst, wMass, chanW) {
  const layer = observer.layer != null ? observer.layer : state.player.layer;
  const templates = _speciesTemplates(layer);
  if (!templates.length) return { template: null, confidence: 0 };
  const legsW = Math.max(chanW.visual, chanW.vibration);
  const briW = chanW.visual, chemW = chanW.chemical;
  const bodyMap = getBodyMap(target);
  const legs = (legsW > 0 && bodyMap) ? bodyMap.filter(z => z.locomotion && !z.destroyed).length : null;
  const integ = briW > 0 ? getIntegument(target) : null;
  const air = chemW > 0 ? airborneScentAt(layer, target.x, target.y) : null;
  const mix = air ? _normalisedMix(air) : null;
  let best = null, d1 = Infinity, d2 = Infinity;
  for (const t of templates) {
    let d = wMass * Math.abs(Math.log(massEst / t.mass)) / ID_MASS_UNIT;
    if (legs != null) d += legsW * Math.abs(legs - t.legs) / ID_LIMB_UNIT;
    if (integ && t.brightness != null) d += briW * Math.abs(integ.brightness - t.brightness) / ID_BRIGHTNESS_UNIT;
    if (mix && t.profile) d += chemW * _mixDistance(mix, t.profile) / ID_PROFILE_UNIT;
    if (d < d1) { d2 = d1; d1 = d; best = t; }
    else if (d < d2) { d2 = d; }
  }
  const confidence = Number.isFinite(d2) ? Math.max(0, Math.min(1, (d2 - d1) / ID_MARGIN)) : 1;
  return { template: best, confidence };
}

/** The percept of one source: { x, y, mass, sizeChannel, resolved, species,
 *  speciesConfidence, template }, where mass is the size estimate, (x, y)
 *  the tile it is perceived on, resolved the weight the signal's structure
 *  carried (0: only the yardstick of its own body; 1: the signal's own size),
 *  species the best-matching template's key (right or wrong) and its
 *  confidence. A recognised species sets the size expectation in place of
 *  the observer's own body, in proportion to the confidence. */
function _inferPercept(observer, target, detections) {
  const selfMass = getCreatureMass(observer);
  let sizeDet = null, w = -1, bearRes = Infinity;
  const chanW = { visual: 0, vibration: 0, chemical: 0 };
  for (const det of detections) {
    // Two eyes on it add parallax to the eyes' distance cues
    const snr = (det.channel === 'visual' && det.eyes >= 2) ? det.snr * BINOCULAR_DEPTH_BONUS : det.snr;
    const R = _RESOLVE_SNR[det.channel] || VIB_RESOLVE_SNR;
    const dw = Math.max(0, Math.min(1, (snr - 1) / (R - 1)));
    if (dw > w || (dw === w && det.snr > sizeDet.snr)) { w = dw; sizeDet = det; }
    const mod = det.channel === 'visual' ? 'visual' : det.channel === 'chemicalAirborne' ? 'chemical' : 'vibration';
    if (dw > chanW[mod]) chanW[mod] = dw;
    const res = (_BEARING_RES_DEG[det.channel] ?? VIB_BEARING_RES_DEG) / Math.max(1, det.snr);
    if (res < bearRes) bearRes = res;
  }
  if (!sizeDet) return { x: target.x, y: target.y, mass: getCreatureMass(target), sizeChannel: null, resolved: 1,
                         species: null, speciesConfidence: 0, template: null };

  // Size, first against its own body, then against what it is taken to be
  const apparent = estimateMassFromSignal(target, observer, sizeDet.channel);
  let mass = Math.pow(selfMass, 1 - w) * Math.pow(apparent, w);
  const id = _identify(observer, target, mass, w, chanW);
  if (id.template && id.confidence > 0) {
    const prior = Math.pow(selfMass, 1 - id.confidence) * Math.pow(id.template.mass, id.confidence);
    mass = Math.pow(prior, 1 - w) * Math.pow(apparent, w);
  }
  const dTrue = dist(observer.x, observer.y, target.x, target.y);
  const dEst = apparent > 0 ? dTrue * Math.cbrt(mass / apparent) : dTrue;

  // Bearing, to the centre of its resolution bin laid out from the facing
  let ang = Math.atan2(target.y - observer.y, target.x - observer.x);
  if (bearRes > 0) {
    const facing = observer.isPlayer ? state.facing : observer.facing;
    const face = facing ? Math.atan2(facing.dy, facing.dx) : 0;
    const bin = bearRes * Math.PI / 180;
    let rel = ang - face;
    while (rel > Math.PI) rel -= 2 * Math.PI;
    while (rel < -Math.PI) rel += 2 * Math.PI;
    ang = face + Math.round(rel / bin) * bin;
  }

  let x = Math.round(observer.x + Math.cos(ang) * dEst);
  let y = Math.round(observer.y + Math.sin(ang) * dEst);
  if (x === observer.x && y === observer.y) {
    // Perceived on top of itself: it is at least on the next tile that way
    x = observer.x + Math.round(Math.cos(ang));
    y = observer.y + Math.round(Math.sin(ang));
    if (x === observer.x && y === observer.y) x += Math.cos(ang) >= 0 ? 1 : -1;
  }
  return { x, y, mass, sizeChannel: sizeDet.channel, resolved: w,
           species: id.template ? id.template.key : null, speciesConfidence: id.confidence,
           template: id.template };
}

/** This observer's percept of an entity on its current action, or null if no
 *  sense delivers it. */
function perceptOf(observer, entity) {
  const infos = observer.detectionInfo;
  if (!infos || !entity) return null;
  for (const info of infos) if (info.entity === entity) return info;
  return null;
}

/** Where this observer perceives an entity to be: its percept's tile, or,
 *  for a body no sense delivers this action, where its integration tissue
 *  holds it was last perceived (traces, below), or null: out of mind. */
function perceivedPosition(observer, entity) {
  const p = perceptOf(observer, entity);
  if (p) return { x: p.x, y: p.y };
  const t = traceOf(observer, entity);
  return t ? { x: t.x, y: t.y } : null;
}

// ==================== TRACES (perception pass 8) ====================
// Persistence needs tissue that can hold it (Design-Principles). A percept
// leaves a trace in the observer's integration tissue: the tile it was
// perceived on, the turn, and how many consecutive turns it has been
// perceived. The tissue holds a trace for integrationCapacity ×
// PERSISTENCE_SCALE turns, the scale goal persistence uses: about four turns
// for a meso-predator, eight for an apex predator, none for a hare, whose
// threat and food circuits hold nothing. A strike is felt where it lands:
// contact writes a trace for the turn it happens, tissue or not.

/** Turns this creature's integration tissue holds a trace. */
function traceHoldTurns(creature) {
  return (creature.integrationCapacity || 0) * PERSISTENCE_SCALE;
}

/** The trace this creature holds of an entity, or null: one written this
 *  turn (a percept or a contact), or one no older than its tissue holds. */
function traceOf(creature, entity) {
  const traces = creature._traces;
  const t = traces && traces.get(entity);
  if (!t) return null;
  const age = state.turnCount - t.turn;
  return (age <= 0 || age <= traceHoldTurns(creature)) ? t : null;
}

/** Write this action's percepts into the tissue and let go of what it can no
 *  longer hold. */
function _updateTraces(creature, infos) {
  if (!creature._traces) creature._traces = new Map();
  const traces = creature._traces;
  const turn = state.turnCount;
  for (const info of infos) {
    const prev = traces.get(info.entity);
    let streak = 1;
    if (prev) streak = prev.turn === turn ? prev.streak : (prev.turn === turn - 1 ? prev.streak + 1 : 1);
    traces.set(info.entity, { x: info.x, y: info.y, turn, streak,
      dietType: info.dietType, dietConfidence: info.dietConfidence, species: info.species });
  }
  const hold = traceHoldTurns(creature);
  for (const [entity, t] of traces) {
    if (entity.hp <= 0 || turn - t.turn > hold) traces.delete(entity);
  }
}

/** A strike felt: the attacker is where the blow came from, this turn. */
function recordContact(creature, attacker) {
  if (!attacker) return;
  if (!creature._traces) creature._traces = new Map();
  const prev = creature._traces.get(attacker);
  creature._traces.set(attacker, { ...(prev || { streak: 0 }), x: attacker.x, y: attacker.y, turn: state.turnCount });
}

/** Evidence summation: an observer that has kept a source in its senses over
 *  consecutive turns, and has the tissue to hold what it saw, has summed the
 *  looks. Independent looks add their signal in quadrature, so the SNR the
 *  inference works with grows as sqrt(1 + turns held). It sharpens size, place
 *  and identity; it does not make anything detectable that is not. */
function _evidenceGain(observer, target) {
  const t = observer._traces && observer._traces.get(target);
  if (!t) return 1;
  const turn = state.turnCount;
  const prior = (t.turn === turn || t.turn === turn - 1) ? t.streak - (t.turn === turn ? 1 : 0) : 0;
  const n = Math.min(Math.max(0, prior), Math.floor(traceHoldTurns(observer)));
  return Math.sqrt(1 + n);
}

function _gained(detections, g) {
  return g === 1 ? detections : detections.map(d => ({ ...d, snr: d.snr * g }));
}

/** Build continuous-uncertainty detection info from per-zone detections.
 *  Produces narrowing size ranges and confidence curves instead of binary flags. */
function buildDetectionInfo(observer, target, detections) {
  const gain = _evidenceGain(observer, target);
  const tile = _inferPercept(observer, target, _gained(detections, gain));
  const info = {
    detected: true,
    // Perceived tile, and distance and bearing to it
    x: tile.x,
    y: tile.y,
    distance: dist(observer.x, observer.y, tile.x, tile.y),
    direction: directionToward(observer.x, observer.y, tile.x, tile.y),
    bestSNR: 0,

    // Size: narrowing range
    sizeEstimate: null,  // { lower, upper, estimated }
    sizeRelative: null,  // category for reactive rules compatibility

    // Movement: vibration (a footfall is movement) or the eye's change
    // detection; a sighting by pattern recognition alone reads as still
    isMoving: null,

    // How fast a seen body closes on the observer (tiles per world tick,
    // positive = approaching); only the eyes resolve it
    closingSpeed: 0,
    velocity: null,

    // Best SNR per zone and channel, keyed as the neural wiring names its
    // inputs ('fore_l.vibration.ground', 'head.visual'), so a ganglion reads
    // only the transducers it is wired to
    zoneSNR: {},

    // Diet: confidence curve from chemical airborne
    dietConfidence: 0,
    dietType: null,

    // Species: confidence curve from best channel
    speciesConfidence: 0,
    species: null,

    // Condition: confidence curve from high-SNR channels
    conditionConfidence: 0,
    woundChemistry: false,
    visibleWounds: false,
    gaitAnomaly: false,

    // Fight assessment
    threatAssessment: null,
  };

  let bestSNR = 0, bestChannel = null;
  let bestChemSNR = 0, bestChemDet = null;
  let bestVibSNR = 0;
  let bestVisSNR = 0;

  for (const det of detections) {
    if (det.snr > bestSNR) { bestSNR = det.snr; bestChannel = det.channel; }

    if (det.channel === 'chemicalAirborne' && det.snr > bestChemSNR) {
      bestChemSNR = det.snr;
      bestChemDet = det;
    }
    if ((det.channel === 'vibrationGround' || det.channel === 'vibrationAir')
        && det.snr > bestVibSNR) {
      bestVibSNR = det.snr;
    }
    if (det.channel === 'visual' && det.snr > bestVisSNR) {
      bestVisSNR = det.snr;
    }

    // Movement is inherent in vibration detection — if vibration detected, target was moving
    if (det.channel === 'vibrationGround' || det.channel === 'vibrationAir') {
      info.isMoving = true;
    }
    if (det.channel === 'visual' && det.moving) info.isMoving = true;
    if (det.channel === 'visual' && det.closing > info.closingSpeed) info.closingSpeed = det.closing;
    // Its velocity as the eyes resolve it (tiles per world tick): motion across
    // the view and along it; only the eyes give it (prediction reads it)
    if (det.channel === 'visual' && det.velocity) info.velocity = det.velocity;

    if (det.zone) {
      const key = `${det.zone.key}.${_WIRING_PATH[det.channel]}`;
      if (!(info.zoneSNR[key] >= det.snr)) info.zoneSNR[key] = det.snr;
    }
  }
  // Seen, not felt, and the eye's change detection did not fire: still.
  if (info.isMoving === null && bestVisSNR > 0) info.isMoving = false;

  info.bestSNR = bestSNR;

  // Per-channel best SNR — used by ganglion template matching
  info.vibrationSNR = bestVibSNR;
  info.visualSNR    = bestVisSNR;
  info.chemicalSNR  = bestChemSNR;

  // Size estimate: the inferred size (pass 6), its bracket narrowing with
  // the best SNR from any channel, summed over the turns watched (pass 8)
  if (bestSNR > 0) {
    const uncertaintyFactor = SIZE_UNCERTAINTY_BASE / (bestSNR * gain);
    const rawEstimate = tile.mass;
    info.sizeEstimate = {
      estimated: rawEstimate,
      lower: rawEstimate / (1 + uncertaintyFactor),
      upper: rawEstimate * (1 + uncertaintyFactor),
    };
    // Compute category for reactive layer compatibility
    info.sizeRelative = relativeMagnitude(observer, info);
  }

  // Diet: chemical airborne only
  if (bestChemSNR > DIET_CONF_MIN) {
    info.dietConfidence = Math.min(1.0,
      (bestChemSNR - DIET_CONF_MIN) / (DIET_CONF_FULL - DIET_CONF_MIN));
    info.dietType = bestChemDet ? bestChemDet.kind : null;   // read off the air's composition
  }

  // Species: the best-matching template (pass 7), right or wrong. A
  // recognised species brings the diet that goes with it: the template knows
  // what that kind of animal eats.
  info.species = tile.species;
  info.speciesConfidence = tile.speciesConfidence;
  if (tile.template && tile.speciesConfidence > info.dietConfidence) {
    info.dietType = tile.template.diet;
    info.dietConfidence = tile.speciesConfidence;
  }

  // Condition: requires high SNR
  if (bestChemSNR > CONDITION_CONF_MIN) {
    info.conditionConfidence = Math.min(1.0,
      (bestChemSNR - CONDITION_CONF_MIN) / (CONDITION_CONF_FULL - CONDITION_CONF_MIN));
    info.woundChemistry = !!bestChemDet && bestChemDet.bloodSNR > CONDITION_CONF_MIN;
  }
  if (bestVibSNR > CONDITION_CONF_MIN) {
    const vibCondConf = Math.min(1.0,
      (bestVibSNR - CONDITION_CONF_MIN) / (CONDITION_CONF_FULL - CONDITION_CONF_MIN));
    if (vibCondConf > info.conditionConfidence) {
      info.conditionConfidence = vibCondConf;
    }
    info.gaitAnomaly = _hasDestroyedLocomotionZone(target);
  }
  // Visible wounds: the eyes, at condition-level SNR. (Was any channel, so a
  // nose or a footfall could "see" a missing limb.)
  if (bestVisSNR > CONDITION_CONF_MIN) {
    const targetBodyMap = getBodyMap(target);
    if (targetBodyMap) {
      info.visibleWounds = targetBodyMap.some(z => z.destroyed);
    }
  }

  // Fight assessment requires integration capacity above threshold AND useful info
  if (observer.integrationCapacity >= ASSESS_INTEGRATION_THRESHOLD) {
    if (info.sizeEstimate && info.dietConfidence > 0.5) {
      info.threatAssessment = assessFightOutcome(observer, target, info);
    }
  }

  return info;
}

/** Fight assessment — uses size uncertainty range for conservative evaluation. */
function assessFightOutcome(observer, target, info) {
  const cc = combatCapability(observer);
  const observerMass = getCreatureMass(observer);
  const selfPower = observerMass * cc.maxDamage *
                    ((observer.blood != null && observer.bloodMax > 0) ?
                     (observer.blood / observer.bloodMax) : 1.0);

  // Use worst-case (upper bound) for assessing target danger
  const estimatedTargetMass = info.sizeEstimate ? info.sizeEstimate.upper : observerMass;

  let targetConditionModifier = 1.0;
  if (info.woundChemistry) targetConditionModifier *= 0.7;
  if (info.visibleWounds) targetConditionModifier *= 0.7;
  if (info.gaitAnomaly) targetConditionModifier *= 0.8;

  const estimatedTargetPower = estimatedTargetMass * targetConditionModifier;
  if (estimatedTargetPower <= 0) return 'weaker';
  const ratio = selfPower / estimatedTargetPower;

  if (ratio > 2.0) return 'weaker';       // target is weaker
  if (ratio > 1.2) return 'comparable';
  if (ratio > 0.5) return 'stronger';
  return 'overwhelming';                   // target is overwhelming
}

// ==================== DETECTION AGGREGATORS ====================

/** Build continuous-uncertainty detection info for all detected entities each turn. */
function buildAllDetectionInfo(creature) {
  creature.detectionInfo = [];
  const player = state.player;

  // Prompt R: spatial grid narrows candidate list
  const nearby = getNearbyCreatures(creature.x, creature.y);

  // Build info for all entities in detection range
  const allTargets = [];
  if (player && player.hp > 0 && player !== creature) allTargets.push(player);
  for (const m of nearby) {
    if (m === creature || m.hp <= 0) continue;
    allTargets.push(m);
  }

  for (const target of allTargets) {
    const result = canDetect(creature, target);
    if (!result.detected) continue;

    // result.detections carries every channel that detected, visual included,
    // at the SNR that decided the detection (concealment and light applied).
    const info = buildDetectionInfo(creature, target, result.detections);
    info.entity = target;
    info.senses = result.senses;
    creature.detectionInfo.push(info);
  }

  // The air on its tile, and what integration can tie it to
  creature.plume = readPlume(creature);
  bindPlumes(creature);
  _updateTraces(creature, creature.detectionInfo);
}

/** Assess how threatening a target is to the creature. Returns 0 if not threatening. */
function assessThreatLevel(creature, target, detInfo) {
  const creatureMass = creature.totalMass || 1;

  // Use detection-derived size if available, otherwise direct read
  let targetMass = creatureMass;
  if (detInfo && detInfo.sizeEstimate) {
    targetMass = detInfo.sizeEstimate.upper; // worst-case for threat assessment
  } else {
    const targetBodyMap = getBodyMap(target);
    if (targetBodyMap) {
      targetMass = 0;
      for (const zone of targetBodyMap) {
        if (!zone.destroyed) targetMass += zone.mass || 0;
      }
    } else if (target.totalMass) {
      targetMass = target.totalMass;
    }
  }
  const massRatio = targetMass / creatureMass;

  // Use detection-derived diet if available, otherwise direct read
  let targetDiet = null;
  if (detInfo && detInfo.dietConfidence > DIET_DECISION_THRESHOLD) {
    targetDiet = detInfo.dietType;
  } else if (!detInfo) {
    // No detection info passed — legacy fallback (direct read)
    targetDiet = target.diet || (target.isPlayer ? getPlayerDiet() : null);
  }
  // If detInfo exists but diet confidence is too low, targetDiet stays null (unknown)

  // Herbivores: fear predators and large unknowns
  if (creature.diet === 'herbivore') {
    if (targetDiet === 'predator') return Math.max(0.4, massRatio);
    // Unknown diet + large = cautious threat (can't determine what it eats)
    if (targetDiet === null && massRatio > 0.8) return Math.max(0.3, massRatio * 0.6);
    if (massRatio > 1.5) return massRatio * 0.5;
    return 0;
  }

  // Predators: fear significantly larger predators
  if (creature.diet === 'predator') {
    if (targetDiet === 'predator' && massRatio > 1.5) return massRatio;
    // Unknown diet + much larger = cautious
    if (targetDiet === null && massRatio > 2.0) return massRatio * 0.3;
    return 0;
  }

  return 0;
}

/** Detect threats in range using already-built detectionInfo (Prompt P).
 *  Reuses results from buildAllDetectionInfo — no duplicate canDetect calls. */
function detectThreats(creature) {
  const threats = [];

  for (const info of (creature.detectionInfo || [])) {
    const target = info.entity;
    if (!target || target.hp <= 0) continue;

    const threatLevel = assessThreatLevel(creature, target, info);
    if (threatLevel > 0) {
      threats.push({
        source: target,
        distance: info.distance,
        threatLevel: threatLevel,
        senses: info.senses || [],
        bestSNR: info.bestSNR || 0,
      });
    }
  }

  creature.detectedThreats = threats;

  // The threat source is whatever the transducers are delivering now. If the
  // entity that set it is no longer among the detected threats and no pain
  // signal arrived this action, it is gone. The reactive ganglia have no
  // tissue that holds a representation, so nothing persists here: any
  // lingering jumpiness comes from the stress chemistry. (Before
  // this, threatSource was never cleared, so the territory leash in
  // ai-utils.canMoveTo stayed off for good after a creature's first scare.)
  // Since pass 8 a creature whose integration tissue still holds where the
  // threat was keeps it as the threat source (and flees from that spot).
  if (creature.threatSource && !creature.tookDamageThisTurn &&
      !threats.some(t => t.source === creature.threatSource) &&
      !traceOf(creature, creature.threatSource)) {
    creature.threatSource = null;
  }
  return threats;
}

/** The threat source: the most threatening detected animal, which flight
 *  steers away from. (Alarm comes from each creature's own gland nodes,
 *  nodes.js; the placeholder release for creatures on the reactive rules went
 *  with them.) */
function applySafetyFromThreats(creature) {
  if (!creature.detectedThreats || creature.detectedThreats.length === 0) return;
  const worst = creature.detectedThreats.reduce((a, b) =>
    a.threatLevel > b.threatLevel ? a : b);
  if (worst.threatLevel <= 0) return;
  creature.threatSource = worst.source;
}

/** A blow landed: mark it (tookDamageThisTurn, which the pain input of a
 *  creature's wiring reads), and name the attacker as the threat, felt where
 *  the blow landed. Called from combat resolution. */
function applySafetyFromDamage(creature, damageAmount, attacker) {
  if (!creature.hormones) return;
  creature.tookDamageThisTurn = true;
  creature.inCombatThisTurn = true;
  if (attacker) {
    creature.threatSource = attacker;
    recordContact(creature, attacker);
  }
}

// ==================== PREY / CORPSE DETECTION ====================

/** Get a creature's species key for same-species check. */
function getSpeciesKey(entity) {
  if (entity.isPlayer) {
    // Player's species maps to a creature key
    const sp = entity.species;
    if (sp) {
      const SPECIES_CREATURE_MAP = {
        prowler: 'wolf', ravager: 'dire_wolf', grazer: 'hare',
        shaleback: 'cave_crab', lurker: 'ambush_pred',
      };
      return SPECIES_CREATURE_MAP[sp] || sp;
    }
    return '__player__';
  }
  return entity.key || '__unknown__';
}

/** Is a detected entity prey to this predator, as the predator perceives it?
 *  Reads the detection, not the target: the size is the estimate the channels
 *  produced, and it is ruled out as its own kind only once the channels have
 *  identified it as such. Anything prey-sized and not recognised as kin reads
 *  as prey. (It used to read the target's true mass and species key.) */
function isViablePrey(predator, info) {
  if (!info || !info.sizeEstimate) return false;
  const predMass = getCreatureMass(predator);
  const massRatio = info.sizeEstimate.estimated / predMass;

  // Too big to hunt — don't try to eat something 1.5x+ your mass
  if (massRatio > 1.5) return false;

  // Too small to bother — below 5% (or 2% if starving)
  const minRatio = predator.hormones.hunger > 0.85 ? 0.02 : 0.05;
  if (massRatio < minRatio) return false;

  // Don't hunt what the channels have recognised as your own species
  if (info.species && info.speciesConfidence >= SPECIES_DISPLAY_CONFIDENCE && info.species === getSpeciesKey(predator)) return false;

  return true;
}

/** Get adjacent prey (within 1 tile) among what this creature detects this
 *  action. Returns the smallest-seeming viable prey or null. An adjacent
 *  animal the senses miss is not attacked. */
function getAdjacentPrey(creature) {
  let best = null;
  let bestMass = Infinity;
  for (const info of (creature.detectionInfo || [])) {
    const other = info.entity;
    if (!other || other.hp <= 0) continue;
    if (chebyshev(creature.x, creature.y, info.x, info.y) > 1) continue;
    if (!isViablePrey(creature, info)) continue;
    const m = info.sizeEstimate.estimated;
    if (m < bestMass) { bestMass = m; best = other; }
  }
  return best;
}

/** Detect prey using already-built detectionInfo. Predators only.
 *  Reuses results from buildAllDetectionInfo — no duplicate canDetect calls. */
function detectPrey(creature) {
  if (creature.diet !== 'predator') return;

  creature.detectedPrey = [];

  for (const info of (creature.detectionInfo || [])) {
    const target = info.entity;
    if (!target || target.hp <= 0) continue;
    if (!isViablePrey(creature, info)) continue;

    creature.detectedPrey.push({
      target: target,
      distance: info.distance,
      senses: info.senses || [],
    });
  }

  // Sort by distance (nearest first)
  creature.detectedPrey.sort((a, b) => a.distance - b.distance);
}

/** Detect corpses within chemical detection range. Predators only.
 *  Corpses are detected primarily by smell — uses best chemical airborne quality
 *  per zone with range formula. */
function detectCorpses(creature) {
  if (creature.diet !== 'predator') return;

  creature.detectedCorpses = [];

  // Corpse chemical emission estimate: mass × base coeff (stationary, no activity)
  // Use chemical range formula: cbrt(emission) × quality × coeff
  const bestChemQuality = getBestChemicalAirborne(creature);
  if (bestChemQuality <= 0) {
    // Fall back to a minimal detection range of 2 tiles (adjacent + 1)
    // for creatures with no chemical sense — they can still stumble on corpses
    const fallbackRange = 2;
    const layer = state.player.layer;
    const items = groundItems[layer];
    if (!items) return;
    for (const posKey of Object.keys(items)) {
      const arr = items[posKey];
      if (!arr) continue;
      for (const item of arr) {
        if (item.kind !== 'corpse' && item.type !== 'corpse') continue;
        const [ix, iy] = posKey.split(',').map(Number);
        const d = dist(creature.x, creature.y, ix, iy);
        if (d > fallbackRange) continue;
        creature.detectedCorpses.push({ target: item, distance: d, x: ix, y: iy });
      }
    }
    creature.detectedCorpses.sort((a, b) => a.distance - b.distance);
    return;
  }

  const layer = state.player.layer;
  const items = groundItems[layer];
  if (!items) return;

  for (const posKey of Object.keys(items)) {
    const arr = items[posKey];
    if (!arr) continue;
    for (const item of arr) {
      if (item.kind !== 'corpse' && item.type !== 'corpse') continue;

      const [ix, iy] = posKey.split(',').map(Number);
      const d = dist(creature.x, creature.y, ix, iy);
      if (d > MAX_DETECTION_DISTANCE) continue;

      // Estimate corpse chemical emission from its mass
      const corpseMass = item.mass || 1;
      const corpseEmission = corpseMass * CHEM_MASS_COEFF;
      const range = Math.cbrt(corpseEmission) * bestChemQuality * CHEM_RANGE_COEFF;

      if (d <= range) {
        creature.detectedCorpses.push({ target: item, distance: d, x: ix, y: iy });
      }
    }
  }

  creature.detectedCorpses.sort((a, b) => a.distance - b.distance);
}

// ==================== PLAYER PERCEPTION (Prompt P) ====================

/**
 * Compute which creatures the player detects through all senses.
 * Uses per-zone detection (Prompt P) for non-visual channels.
 *
 * Visual Detection Pass 1: also computes visual detection for creatures ON
 * FOV tiles. Motion × contrast × concealment modifiers determine whether a
 * creature in the player's field of view is actually detectable.
 * Populates player._visuallyDetected (Set of creature refs for full-sprite
 * rendering) and adds low-confidence detections to sensedCreatures for blob
 * rendering.
 */
function computePlayerPerception() {
  const player = state.player;
  if (!player || player.hp <= 0) return;

  // Percepts for the display: every creature the player's senses deliver,
  // on the tile it is perceived on. _visuallyDetected maps an identified
  // sighting to that tile and _perceivedAt maps the tile back to the creature
  // (rendering.js draws sprites from it); sensedCreatures carry their tile.
  player.sensedCreatures = [];
  player._visuallyDetected = new Map();
  player._perceivedAt = new Map();
  const seenNow = [];   // this turn's percepts, for the player's traces (pass 8)

  const fovSet = state.fovSet;
  const monocularSet = state.monocularSet;

  const nearby = getNearbyCreatures(player.x, player.y);
  if (!nearby || nearby.length === 0) { _updateTraces(player, []); return; }

  for (const creature of nearby) {
    if (creature.hp <= 0) continue;
    if (!creature.signals) continue;

    const creatureKey = `${creature.x},${creature.y}`;
    const inBinocularFOV = fovSet && fovSet.has(creatureKey);
    const inMonocularFOV = !inBinocularFOV && monocularSet && monocularSet.has(creatureKey);
    const inAnyFOV = inBinocularFOV || inMonocularFOV;

    // ── Visual detection for FOV creatures: the same path NPCs use ──
    if (inAnyFOV) {
      const vis = _visualDetection(player, creature);
      if (vis) {
        const gain = _evidenceGain(player, creature);
        const visSNR = vis.snr * gain;
        const tile = _inferPercept(player, creature, _gained([vis], gain));
        seenNow.push({ entity: creature, x: tile.x, y: tile.y, species: tile.species });
        const speciesConfidence = tile.speciesConfidence;

        if (speciesConfidence >= SPECIES_DISPLAY_CONFIDENCE) {
          // Recognised — drawn via drawEntityAtTile as the species it is
          // taken to be (pass 7: right or wrong), on its perceived tile
          player._visuallyDetected.set(creature, tile);
          player._perceivedAt.set(`${tile.x},${tile.y}`, { creature, species: tile.species });
        } else {
          // Low confidence — route through sensedCreatures for blob rendering
          const uncertaintyFactor = SIZE_UNCERTAINTY_BASE / visSNR;
          const rawEstimate = tile.mass;
          const sizeEstimate = {
            estimated: rawEstimate,
            lower: rawEstimate / (1 + uncertaintyFactor),
            upper: rawEstimate * (1 + uncertaintyFactor),
          };
          player.sensedCreatures.push({
            creature, x: tile.x, y: tile.y, bestSNR: visSNR, speciesConfidence, species: tile.species, sizeEstimate,
            _visualFOV: true,
          });
        }
        continue;  // visual detection handled — skip non-visual for FOV creatures
      }
      // Visual detection failed — creature blends into background on this FOV
      // tile. Not added to _visuallyDetected (the renderer will not draw it),
      // but it can still be felt: fall through to the non-visual senses exactly
      // as a creature outside the field of view would be.
    }

    // ── Non-visual detection (creatures outside FOV, or unseen inside it) ──
    const detections = detectTargetPerZone(player, creature);
    if (!detections) continue;

    let bestSNR = 0, bestChannel = null;
    for (const det of detections) {
      if (det.channel === 'chemicalAirborne') continue;
      if (det.snr > bestSNR) { bestSNR = det.snr; bestChannel = det.channel; }
    }

    if (bestSNR <= 0) continue;

    // Smell is the scent field's (scent.js), not a marker: infer from the rest
    const gain = _evidenceGain(player, creature);
    const tile = _inferPercept(player, creature, _gained(detections.filter(d => d.channel !== 'chemicalAirborne'), gain));
    seenNow.push({ entity: creature, x: tile.x, y: tile.y, species: tile.species });
    const speciesConfidence = tile.speciesConfidence;
    const uncertaintyFactor = SIZE_UNCERTAINTY_BASE / (bestSNR * gain);
    const rawEstimate = tile.mass;
    const sizeEstimate = {
      estimated: rawEstimate,
      lower: rawEstimate / (1 + uncertaintyFactor),
      upper: rawEstimate * (1 + uncertaintyFactor),
    };

    player.sensedCreatures.push({ creature, x: tile.x, y: tile.y, bestSNR, speciesConfidence, species: tile.species, sizeEstimate });
  }
  _updateTraces(player, seenNow);
}

export {
  // Light
  // Per-zone detection
  detectTargetPerZone,
  // Sense helpers
  getBestChemicalAirborne, getEffectiveVisual, getDominantSenseChannel,
  // Visual detection
  getVisualRange, facingToAngle, isInVisionCone, hasLineOfSight,
  // Local concealment
  computeEffectiveConcealment,
  // Visual detection helpers (Pass 1)
  _isTargetMoving, _computeContrastFactor,
  // Master detection
  canDetect, getDetectionRange,
  // SNR and uncertainty
  estimateMassFromSignal, relativeMagnitude, buildDetectionInfo, assessFightOutcome,
  // Detection aggregators
  buildAllDetectionInfo, detectThreats, applySafetyFromThreats, applySafetyFromDamage,
  assessThreatLevel,
  // Prey/corpse detection
  isViablePrey, getSpeciesKey, detectPrey, detectCorpses, getAdjacentPrey,
  // Player perception
  computePlayerPerception,
  // Percepts and traces
  perceptOf, perceivedPosition, traceOf, traceHoldTurns, recordContact,
  // Ground trails and plumes
  readPreyTrailStep, meatEaterUnderfoot, readPlume,
};
