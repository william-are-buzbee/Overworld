// ==================== COGNITION — Decision Architecture ====================
// The reactive-deliberative system. Takes detection info as input,
// produces a behavioral decision as output.
// Split from enemy-ai.js — zero behavior change.

import { state } from './state.js';
import { getBodyMap,
         getNeuralArchitecture,
         DRIVE_COMPARE_THRESHOLD, PLANNING_THRESHOLD,
         SAFETY_THRESHOLD, HUNGER_THRESHOLD, REST_THRESHOLD,
         HERBIVORE_SAFETY_BONUS,
         OVERRIDE_SCALE, STIMULUS_RESISTANCE, CRITICAL_MAGNITUDE,
         REACTIVE_HUNGER_THRESHOLD,
         MIN_SEEK, SEEK_SCALE, PERSISTENCE_SCALE,
         ASSESS_INTEGRATION_THRESHOLD,
         DIET_DECISION_THRESHOLD,
         BASE_BOLT_THRESHOLD, BASE_FLEE_THRESHOLD, BASE_FREEZE_THRESHOLD,
         BASE_ALERT_THRESHOLD,
         CONFIDENCE_NORMALIZATION,
         THREAT_CONF_CHANNEL_CAP, THREAT_CONF_SIZE_MUCH_LARGER,
         THREAT_CONF_SIZE_LARGER, THREAT_CONF_SIZE_AMBIGUOUS,
         STRESS_NEURAL_SENSITIVITY, STRESS_MAX,
         LOOM_WINDOW_ACTIONS, REFERENCE_SPEED, BASE_TICKS_PER_ACTION } from './constants.js';
import { getBodyPTW } from './physiology.js';
import { chebyshev } from './world-state.js';
import { randi } from './rng.js';
import { dist, getCreatureMass, findNearestWaterTile, findNearestFoodTile,
         tileIsFood, getCorpseAt, directionAwayFrom, directionToward, combatCapability } from './ai-utils.js';
import { getDominantSenseChannel, getAdjacentPrey, getSpeciesKey } from './detection.js';

// ==================== COGNITIVE TIER SYSTEM (Prompt M-A1) ====================
// Integration capacity = total mass of integration-dedicated neural tissue across
// all surviving zones. Tier is derived from capacity vs two thresholds.
// Recomputed each turn so zone destruction updates tier in real time.

function computeIntegrationCapacity(creature) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return 0;
  let total = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;            // destroyed zone contributes nothing
    const neuralMass = zone.neural || 0;     // kg of neural tissue in this zone
    const integrationFrac = (zone.neuralAllocation && zone.neuralAllocation.integration) || 0;
    total += neuralMass * integrationFrac;
  }
  return total;
}

function getTier(integrationCapacity) {
  if (integrationCapacity >= PLANNING_THRESHOLD) return 3;
  if (integrationCapacity >= DRIVE_COMPARE_THRESHOLD) return 2;
  return 1;
}

// ==================== PHYSICAL QUERY FUNCTIONS (Prompt O) ====================
// Universal helpers called by reactive rules. Each reads from body map,
// detection results, and game state. No per-species profiles.


/** Does movement compromise the creature's dominant sense? */
function movementCompromisesSense(creature) {
  const dominant = getDominantSenseChannel(creature);
  // Ground vibration: own footsteps raise the listening channel's noise floor
  // (detection.js detectTargetPerZone, SELF_FOOTFALL_DISTANCE) AND emit
  // detectable signal
  return dominant.type === 'groundVibration';
}

/** Find nearest refuge. */
function findRefuge(creature) {
  // Water refuge
  if (creature.canEnterWater) {
    const water = findNearestWaterTile(creature.x, creature.y);
    if (water) return { type: 'water', target: water };
  }
  // Territory/home refuge
  const home = creature.wanderProfile && creature.wanderProfile.homePosition;
  if (home && creature.territoryRadius > 0) {
    const d = dist(creature.x, creature.y, home.x, home.y);
    if (d > 2) return { type: 'territory', target: home };
  }
  return { type: 'none', target: null };
}

/** Is this creature hungry enough for reactive food rules? */
function isReactivelyHungry(creature) {
  return creature.drives && creature.drives.hunger > REACTIVE_HUNGER_THRESHOLD;
}

/** Blood state category. */
function getBloodState(creature) {
  if (creature.blood == null || creature.bloodMax == null || creature.bloodMax <= 0) return 'healthy';
  const ratio = creature.blood / creature.bloodMax;
  if (ratio <= 0.25) return 'critical';
  if (ratio <= 0.50) return 'impaired';
  return 'healthy';
}

// ==================== DRIVE COMPARISON ====================

/** Get the dominant active drive. Highest urgency above threshold wins. */
function getDominantDrive(creature) {
  const drives = creature.drives;
  const active = [];

  if (drives.safety > SAFETY_THRESHOLD) {
    let safetyUrgency = drives.safety;
    // Herbivores weigh safety more heavily — survival over food
    if (creature.diet === 'herbivore') {
      safetyUrgency += HERBIVORE_SAFETY_BONUS;
    }
    active.push({ drive: 'safety', urgency: safetyUrgency });
  }
  if (drives.hunger > HUNGER_THRESHOLD) {
    active.push({ drive: 'hunger', urgency: drives.hunger });
  }
  if (drives.rest > REST_THRESHOLD) {
    active.push({ drive: 'rest', urgency: drives.rest });
  }

  if (active.length === 0) return { drive: 'none', urgency: 0 };

  // Highest urgency wins; ties favor safety
  active.sort((a, b) => {
    if (b.urgency !== a.urgency) return b.urgency - a.urgency;
    return a.drive === 'safety' ? -1 : 1;
  });
  return active[0];
}

// ==================== UNIVERSAL REACTIVE RULE SET (Prompt O) ====================
// Evaluated in priority order. First matching rule fires.
// Every creature runs the same rules — body differences produce behavioral differences.

function evaluateReactiveRules(creature) {
  const cc = combatCapability(creature);
  const diet = creature.diet || 'predator';
  const bState = getBloodState(creature);
  const refuge = findRefuge(creature);
  const hungry = isReactivelyHungry(creature);
  const detections = creature.detectionInfo || [];

  // Find adjacent entities
  const adjacentDetections = detections.filter(d => d.distance <= 1.5);
  // Find nearby entities (short range, 3-5 tiles)
  const nearbyDetections = detections.filter(d => d.distance <= 5);

  // Was there damage from an undetected source (ambush)?
  let ambushed = false;
  if (creature.tookDamageThisTurn && creature.threatSource) {
    const sourceDetected = detections.find(d => d.entity === creature.threatSource);
    // If source was not detected BEFORE the damage, it's an ambush
    // Approximate: if creature didn't have the source in prior detections, treat as ambush
    if (!sourceDetected) ambushed = true;
  }

  // Torso damage this turn
  let torsoCritical = false;
  if (creature.tookDamageThisTurn) {
    const bodyMap = getBodyMap(creature);
    if (bodyMap) {
      const torso = bodyMap.find(z => z.vital && !z.destroyed);
      if (torso && torso.maxHp > 0 && torso.hp < torso.maxHp * 0.5) {
        torsoCritical = true;
      }
    }
  }

  // Blood crossed critical this turn?
  const bloodCrossedCritical = creature.tookDamageThisTurn && bState === 'critical';

  // RULE 1 — CRITICAL EMERGENCY
  if ((ambushed || bloodCrossedCritical || torsoCritical) && creature.tookDamageThisTurn) {
    // Adjacent attacker and can fight → retaliate
    if (cc.canFight && creature.threatSource &&
        chebyshev(creature.x, creature.y, creature.threatSource.x, creature.threatSource.y) <= 1) {
      return { behavior: 'retaliate', magnitude: 0.9, target: creature.threatSource };
    }
    // Flee toward refuge or away from damage source
    if (refuge.type !== 'none') {
      return { behavior: 'flee_refuge', magnitude: 0.9, target: refuge.target, refugeType: refuge.type };
    }
    return { behavior: 'flee', magnitude: 0.9 };
  }

  // RULE 2 — DAMAGE RESPONSE
  if (creature.tookDamageThisTurn) {
    if (!cc.canFight) {
      if (refuge.type !== 'none') {
        return { behavior: 'flee_refuge', magnitude: 0.7, target: refuge.target, refugeType: refuge.type };
      }
      return { behavior: 'flee', magnitude: 0.7 };
    }
    if (creature.threatSource &&
        chebyshev(creature.x, creature.y, creature.threatSource.x, creature.threatSource.y) <= 1) {
      if (bState === 'critical') {
        if (refuge.type !== 'none') {
          return { behavior: 'flee_refuge', magnitude: 0.7, target: refuge.target, refugeType: refuge.type };
        }
        return { behavior: 'flee', magnitude: 0.7 };
      }
      return { behavior: 'retaliate', magnitude: 0.7, target: creature.threatSource };
    }
    // Attacker not adjacent — disengage
    if (refuge.type !== 'none') {
      return { behavior: 'flee_refuge', magnitude: 0.7, target: refuge.target, refugeType: refuge.type };
    }
    return { behavior: 'flee', magnitude: 0.7 };
  }

  // RULE 3 — ADJACENT THREAT
  for (const det of adjacentDetections) {
    const size = det.sizeRelative || 'unknown';
    if (size === 'larger' || size === 'much_larger') {
      const isMovingOrPredator = det.isMoving || det.dietType === 'predator';
      if (isMovingOrPredator || size === 'much_larger') {
        if (!cc.canFight) {
          if (refuge.type !== 'none') {
            return { behavior: 'flee_refuge', magnitude: 0.6, target: refuge.target, refugeType: refuge.type };
          }
          return { behavior: 'flee', magnitude: 0.6 };
        }
        // Can fight but has escape route
        if (refuge.type !== 'none') {
          return { behavior: 'flee_refuge', magnitude: 0.6, target: refuge.target, refugeType: refuge.type };
        }
        // Cornered — fight
        return { behavior: 'retaliate', magnitude: 0.6, target: det.entity };
      }
    }
    // Ambiguous size — could be larger or smaller
    if (size === 'ambiguous') {
      if (diet === 'herbivore') {
        // Herbivores treat ambiguity as potentially larger — flee
        if (!cc.canFight) {
          if (refuge.type !== 'none') {
            return { behavior: 'flee_refuge', magnitude: 0.6, target: refuge.target, refugeType: refuge.type };
          }
          return { behavior: 'flee', magnitude: 0.6 };
        }
        if (refuge.type !== 'none') {
          return { behavior: 'flee_refuge', magnitude: 0.6, target: refuge.target, refugeType: refuge.type };
        }
        return { behavior: 'retaliate', magnitude: 0.6, target: det.entity };
      }
      // Predators treat ambiguous as caution — orient, don't commit
      if (cc.canFight) {
        return { behavior: 'orient', magnitude: 0.6, target: det.entity };
      }
    }
    // Similar size — orient toward (face potential threat)
    // Predators: fall through to Rule 4B for competitor spacing
    if (size === 'similar' && cc.canFight && diet !== 'predator') {
      return { behavior: 'orient', magnitude: 0.6, target: det.entity };
    }
  }

  // RULE 4 — NEARBY STRONG SIGNAL
  for (const det of nearbyDetections) {
    if (det.distance <= 1.5) continue; // already handled by Rule 3
    const size = det.sizeRelative || 'unknown';
    if (size === 'larger' || size === 'much_larger' || size === 'unknown' || size === 'ambiguous') {
      const isStrong = det.isMoving !== false; // moving or unknown movement = strong signal
      if (!isStrong && size !== 'unknown' && size !== 'ambiguous') continue;

      if (diet === 'herbivore') {
        if (refuge.type !== 'none') {
          return { behavior: 'flee_refuge', magnitude: 0.5, target: refuge.target, refugeType: refuge.type };
        }
        return { behavior: 'flee', magnitude: 0.5 };
      }
      if (diet === 'predator') {
        if (size === 'much_larger') {
          return { behavior: 'hold', magnitude: 0.5 };
        }
        // Ambiguous or larger: orient cautiously, don't commit
        return { behavior: 'orient', magnitude: 0.5, target: det.entity };
      }
    }
  }

  // RULE 4B — COMPETITOR SPACING
  // Predators maintain distance from similar-sized detected entities.
  // Not flee — spatial caution. Deliberative layer overrides when hungry.
  if (diet === 'predator' && cc.canFight) {
    // Check adjacent first (slightly higher magnitude)
    for (const det of adjacentDetections) {
      const size = det.sizeRelative || 'unknown';
      if (size === 'similar') {
        const knownHerbivore = det.dietConfidence > DIET_DECISION_THRESHOLD
                               && det.dietType === 'herbivore';
        if (!knownHerbivore) {
          return { behavior: 'maintain_distance', magnitude: 0.4, target: det.entity };
        }
      }
    }
    // Check nearby (3-5 tiles)
    for (const det of nearbyDetections) {
      if (det.distance <= 1.5) continue;
      const size = det.sizeRelative || 'unknown';
      if (size === 'similar') {
        const knownHerbivore = det.dietConfidence > DIET_DECISION_THRESHOLD
                               && det.dietType === 'herbivore';
        if (!knownHerbivore) {
          return { behavior: 'maintain_distance', magnitude: 0.35, target: det.entity };
        }
      }
    }
  }

  // RULE 5 — ADJACENT PREY / FOOD
  if (diet === 'predator' && cc.canFight && hungry) {
    for (const det of adjacentDetections) {
      const size = det.sizeRelative || 'unknown';
      if (size === 'smaller' || size === 'much_smaller') {
        return { behavior: 'attack_adjacent', magnitude: 0.3, target: det.entity };
      }
    }
    // Also check for corpse at current position
    const corpseHere = getCorpseAt(state.player.layer, creature.x, creature.y);
    if (corpseHere) {
      return { behavior: 'eat_corpse', magnitude: 0.3 };
    }
  }
  if (diet === 'herbivore' && hungry) {
    if (tileIsFood(creature.x, creature.y)) {
      return { behavior: 'graze', magnitude: 0.3 };
    }
  }

  // RULE 6 — NEARBY FOOD
  if (diet === 'predator' && cc.canFight && hungry) {
    // Check detected smaller entities within 4 tiles
    for (const det of detections) {
      if (det.distance > 4) continue;
      const size = det.sizeRelative || 'unknown';
      if (size === 'smaller' || size === 'much_smaller') {
        return { behavior: 'approach_food', magnitude: 0.2, target: det.entity };
      }
    }
    // Check for nearby corpses
    if (creature.detectedCorpses && creature.detectedCorpses.length > 0) {
      const nearCorpse = creature.detectedCorpses.find(c => c.distance <= 4);
      if (nearCorpse) {
        return { behavior: 'approach_corpse', magnitude: 0.2, corpse: nearCorpse };
      }
    }
  }
  if (diet === 'herbivore' && hungry) {
    const nearFood = findNearestFoodTile(creature.x, creature.y);
    if (nearFood && dist(creature.x, creature.y, nearFood.x, nearFood.y) <= 3) {
      return { behavior: 'approach_food_tile', magnitude: 0.2, target: nearFood };
    }
  }

  // RULE 7 — TERRITORY RETURN
  const home = creature.wanderProfile && creature.wanderProfile.homePosition;
  if (home && creature.territoryRadius > 0) {
    if (dist(creature.x, creature.y, home.x, home.y) > creature.territoryRadius) {
      return { behavior: 'return_home', magnitude: 0.2, target: home };
    }
  }

  // RULE 8 — REST
  if ((bState === 'impaired' || bState === 'critical') &&
      nearbyDetections.filter(d => {
        const sz = d.sizeRelative || 'unknown';
        return sz === 'larger' || sz === 'much_larger' || sz === 'unknown' || sz === 'ambiguous';
      }).length === 0) {
    return { behavior: 'rest', magnitude: 0.2 };
  }

  // RULE 9 — DEFAULT BEHAVIOR
  if (movementCompromisesSense(creature)) {
    return { behavior: 'hold', magnitude: 0.1 };
  }
  return { behavior: 'wander', magnitude: 0.1 };
}

// ==================== GANGLION-BASED BEHAVIOR (Hare Vertical Slice) ====================
// Physical behavior system for creatures with CREATURE_NEURAL data.
// Replaces evaluateReactiveRules for these creatures only.
// Reads detection data through the creature's neural architecture.
// Produces { direction, intensity } motor output instead of { behavior, magnitude }.
//
// FIRST PASS — will be refined as more creatures are converted.

/**
 * Process the ganglion-based behavior system for creatures with CREATURE_NEURAL.
 * Reads detection data through the creature's neural architecture.
 * Produces { direction, intensity } motor output instead of { behavior, magnitude }.
 *
 * FIRST PASS — will be refined as more creatures are converted.
 * Currently handles: bolt reflex, threat-classification flee,
 * food-identification approach, and default hold.
 */
function processGanglionSystem(creature) {
  const architecture = getNeuralArchitecture(creature);
  if (!architecture) return null; // fallback to reactive rules
  const neural = _livingArchitecture(creature, architecture);

  const detectionInfo = creature.detectionInfo || [];
  const stress = creature.stressLevel || 0;

  // ── Phase 1: Compute effective thresholds from stress chemistry ──
  const thresholds = _computeEffectiveThresholds(neural, stress);

  // ── Phase 2: Check bolt reflex arcs ──
  // The bolt reflex fires on ANY single-channel signal exceeding the bolt
  // threshold. It does not require multi-channel confirmation.
  const boltResult = _checkBoltReflex(creature, neural, detectionInfo, thresholds);
  if (boltResult) {
    // Bolt fires: max intensity, direction may be crude or random
    // Also triggers stress release
    creature._ganglionTriggeredStress = true;
    return {
      intensity: 1.0,
      direction: boltResult.direction, // crude bearing or random
      source: boltResult.source,       // entity that triggered the bolt
      isBolt: true,
      type: 'bolt',
    };
  }

  // ── Phase 3: Threat-classification template matching ──
  // Templates fire on sufficient confidence from ANY channel or combination.
  // A single channel at high SNR fires the template.
  // Multiple channels at moderate SNR each contribute confidence —
  // the template fires on total confidence exceeding threshold.
  const threatResult = _matchThreatTemplates(creature, neural, detectionInfo, thresholds);

  // ── Phase 4: Food-identification template matching ──
  // Only runs if threat is not at alert level or above.
  let foodResult = null;
  if (!threatResult || threatResult.confidence < thresholds.alert) {
    foodResult = _matchFoodTemplates(creature, neural, detectionInfo);
  }

  // ── Phase 5: Resolve at central locomotion ganglion ──
  // Highest-intensity signal determines output. Not a priority system —
  // threat signals are physically stronger because threat-classification
  // produces higher-intensity output than food-identification.
  return _resolveLocomotionOutput(creature, threatResult, foodResult, thresholds);
}

// ── Wiring ──
// The body map's neural architecture names what each structure is wired to
// ('fore_l.vibration.ground', 'fore_ganglion_l.processed', 'head.visual').
// These are the only signals a structure receives, and a structure housed in
// a destroyed zone is gone with it: destroy both fore-limbs and the bolt
// reflex has no ganglion left to fire; destroy the head and the food region
// and the eyes feeding the threat region go too. (Before this the wiring was
// documentation: every template read the best SNR from any zone.)

/** The architecture with only the structures whose zone survives. */
function _livingArchitecture(creature, architecture) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return architecture;
  const intact = new Set(bodyMap.filter(z => !z.destroyed).map(z => z.key));
  return { ...architecture, intact,
           structures: architecture.structures.filter(s => !s.zone || intact.has(s.zone)) };
}

/** Transducer inputs reaching a structure: its own sensoryInputs, followed
 *  through every living structure it lists as '<id>.processed' or that
 *  forwards to it. A transducer on a destroyed zone delivers nothing. */
function _wiredInputs(neural, structure, seen = new Set()) {
  if (seen.has(structure.id)) return [];
  seen.add(structure.id);
  const out = [];
  for (const input of structure.sensoryInputs || []) {
    if (input.endsWith('.processed')) {
      const src = neural.structures.find(s => s.id === input.slice(0, -'.processed'.length));
      if (src) out.push(..._wiredInputs(neural, src, seen));
    } else if (!neural.intact || neural.intact.has(input.split('.')[0])) {
      out.push(input);
    }
  }
  for (const s of neural.structures) {
    if (s.forwardsTo && s.forwardsTo.includes(structure.id)) out.push(..._wiredInputs(neural, s, seen));
  }
  return out;
}

/** Best SNR a detection delivers on the wired inputs of one modality
 *  ('vibration', 'visual', 'chemical'). */
function _wiredSNR(det, inputs, modality) {
  let best = 0;
  for (const input of inputs) {
    if (input.split('.')[1] !== modality) continue;
    const snr = det.zoneSNR ? det.zoneSNR[input] : 0;
    if (snr > best) best = snr;
  }
  return best;
}

/**
 * Compute effective thresholds by modulating base thresholds with stress level.
 * Higher stress = lower thresholds = easier to trigger.
 * Stress modulates ALL thresholds uniformly — stress hormones in the hemolymph
 * reach all ganglia because the circulatory system is body-wide.
 */
function _computeEffectiveThresholds(neural, stress) {
  const sensitivity = STRESS_NEURAL_SENSITIVITY;
  const factor = 1.0 - Math.min(stress, 1.0) * sensitivity;
  return {
    bolt:   BASE_BOLT_THRESHOLD   * factor,
    flee:   BASE_FLEE_THRESHOLD   * factor,
    freeze: BASE_FREEZE_THRESHOLD * factor,
    alert:  BASE_ALERT_THRESHOLD  * factor,
  };
}

/**
 * Check bolt reflex arcs on local ganglia.
 * Fires if ANY single vibration detection exceeds the effective bolt threshold.
 * The bolt is fast and crude — direction is estimated from the strongest
 * vibration bearing if available, otherwise random.
 */
// What the wired threat templates return low-threat for: "light rapid
// vibration + small visual" activates nothing, and neither does a signal the
// channels have fully resolved as this creature's own kind. Read by the
// threat template (it accumulates no confidence from these) and by the bolt
// reflex (the template suppresses the arc for them, per canSuppress).
// How heavy a signal reads against this body: 0 at its own mass or below,
// 1 at three times its mass and beyond. An unsized signal counts in full.
function _massWeight(det, selfMass) {
  const est = det.sizeEstimate && det.sizeEstimate.estimated;
  if (!est || !(selfMass > 0)) return 1;
  return Math.max(0, Math.min(1, (est / selfMass - 1) / 2));
}

function _isLowThreat(det, ownSpecies) {
  if (det.sizeRelative === 'smaller' || det.sizeRelative === 'much_smaller' || det.sizeRelative === 'similar') return true;
  if (det.species && det.speciesConfidence >= 1.0 && det.species === ownSpecies) return true;
  return false;
}

function _checkBoltReflex(creature, neural, detectionInfo, thresholds) {
  // Find the bolt reflex structures
  const boltStructures = neural.structures.filter(s =>
    s.reflexArcs && s.reflexArcs.some(r => r.trigger === 'vibration_magnitude_spike')
  );
  if (boltStructures.length === 0) return null;

  // Check each detection against bolt threshold
  // Bolt fires on raw signal magnitude, not template confidence
  let strongestMagnitude = 0;
  let strongestSource = null;
  let strongestDet = null;

  // Each arc hears only its own ganglion's transducers (the fore-limb
  // ganglia: that limb's ground vibration). No other channel reaches it: a
  // large stationary object in view is a high visual SNR, not a bolt trigger.
  const arcInputs = boltStructures.flatMap(b => (b.sensoryInputs || [])
    .filter(i => !neural.intact || neural.intact.has(i.split('.')[0])));
  for (const det of detectionInfo) {
    // Closer + stronger = higher magnitude
    const magnitude = _wiredSNR(det, arcInputs, 'vibration');
    if (magnitude > strongestMagnitude) {
      strongestMagnitude = magnitude;
      strongestSource = det.entity;
      strongestDet = det;
    }
  }

  if (strongestMagnitude < thresholds.bolt) return null;

  // The threat-classification region can suppress the fore-limb reflex arcs
  // (CREATURE_NEURAL.hare canSuppress): when its templates return low-threat
  // for the source of the spike, the arc does not fire. Without this every
  // hare bolted from every other hare's footfalls.
  const threatRegion = neural.structures.find(s => s.templates === 'threat');
  const suppressible = threatRegion && Array.isArray(threatRegion.canSuppress) &&
    boltStructures.every(b => threatRegion.canSuppress.includes(b.id + '.reflexArcs'));
  if (suppressible && strongestDet && _isLowThreat(strongestDet, getSpeciesKey(creature))) return null;

  // Bolt fires. Direction: crude bearing away from source, or random if unknown
  let direction = null;
  if (strongestSource) {
    direction = directionAwayFrom(creature.x, creature.y,
                                  strongestSource.x, strongestSource.y);
  } else {
    direction = randi(8); // random bolt — no bearing information
  }

  return { direction, magnitude: strongestMagnitude, source: strongestSource };
}

/**
 * Threat-classification template matching.
 *
 * Key principle: templates fire on sufficient total confidence from
 * ANY channel or combination. A single channel at high SNR can fire
 * the template alone. Multiple channels at moderate SNR each contribute
 * to total confidence. Integration improves accuracy (fewer false
 * positives) but is not required for activation.
 *
 * Confidence from each channel is based on what that channel reveals:
 * - Vibration: something is there, estimated size, whether it's moving
 * - Visual: something is there, estimated size, bearing, shape
 * - Chemical: clade, diet, stress state (future)
 * Combined confidence is higher than any single channel because
 * corroborating evidence narrows uncertainty.
 *
 * FIRST PASS — confidence normalization uses a fixed constant.
 * Transducer output does not depend on ganglion thresholds — the signal
 * is what it is, ganglia fire or don't. Channel caps and size weights
 * are placeholders for proper transducer sensitivity modeling.
 */
function _matchThreatTemplates(creature, neural, detectionInfo, thresholds) {
  const threatRegion = neural.structures.find(s => s.templates === 'threat');
  if (!threatRegion) return null;

  let highestConfidence = 0;
  let threatSource = null;
  let threatBearing = null;

  const ownSpecies = getSpeciesKey(creature);
  const selfMass = getCreatureMass(creature);
  const inputs = _wiredInputs(neural, threatRegion);
  for (const det of detectionInfo) {
    // The wired templates (CREATURE_NEURAL.hare threat_classification) are
    // "heavy rhythmic vibration + large moving visual" and "heavy single
    // impact"; "light rapid vibration + small visual" returns low-threat and
    // activates nothing. So anything smaller than or about the size of this
    // body does not reach the template, and neither does something the
    // channels have resolved as its own kind (a hare beside a hare). Before
    // this any adjacent creature at high SNR froze a hare, hares included.
    if (_isLowThreat(det, ownSpecies)) continue;

    // Accumulate confidence from each available channel. The templates are
    // "heavy rhythmic vibration" and "large moving visual": a channel's
    // confidence is its SNR scaled by how heavy the signal reads against this
    // body (the size estimate the channel produced). A footfall that reads
    // hare-sized contributes nothing to a hare; one that reads four times its
    // mass contributes in full. Before this any vibration at all was worth
    // the channel cap, so a hare three tiles from another hare froze.
    // The region learns of a source only through its wiring. A detection
    // that reaches none of its inputs (felt only through the unwired rear
    // limbs, say) never arrives here, size and all.
    const vibSNR = _wiredSNR(det, inputs, 'vibration');
    const visSNR = _wiredSNR(det, inputs, 'visual');
    if (vibSNR <= 0 && visSNR <= 0) continue;

    let confidence = 0;
    const heavy = _massWeight(det, selfMass);

    // Vibration contribution
    // FIRST PASS — transducer output scaled by fixed normalization constant,
    // not by ganglion threshold. Real transducers have nonlinear response
    // curves, adaptation, and channel-specific scaling.
    // Only what the region's wiring delivers: the fore-limb (and graze-limb)
    // ganglia's vibration and the head's eyes.
    if (vibSNR > 0) {
      const vibConf = Math.min(vibSNR / (CONFIDENCE_NORMALIZATION * 2), THREAT_CONF_CHANNEL_CAP);
      confidence += vibConf * heavy;
    }

    // Visual contribution
    if (visSNR > 0) {
      const visConf = Math.min(visSNR / (CONFIDENCE_NORMALIZATION * 2), THREAT_CONF_CHANNEL_CAP);
      confidence += visConf * heavy;
    }

    // Looming: the wired looming circuit on the head's eyes fires as a seen
    // body closes on this one, harder the sooner contact would come (in the
    // hare's own actions: the time it has to get out of the way), full at
    // contact and nothing beyond LOOM_WINDOW_ACTIONS. Something walking
    // straight in is barely moving across the view (little change detection)
    // but it looms.
    if (visSNR > 0 && det.closingSpeed > 0) {
      const ownActionsPerTick = getBodyPTW(creature, null) / (REFERENCE_SPEED * BASE_TICKS_PER_ACTION);
      const contactActions = (det.distance / det.closingSpeed) * ownActionsPerTick;
      const loom = Math.max(0, 1 - contactActions / LOOM_WINDOW_ACTIONS);
      confidence += THREAT_CONF_CHANNEL_CAP * loom * heavy;
    }

    // Size contribution — larger things relative to self are more threatening
    // FIRST PASS — placeholder for pattern library matching. Real size
    // assessment comes from vibration amplitude patterns and visual angular
    // size, not a category label.
    if (det.sizeRelative === 'much_larger') confidence += THREAT_CONF_SIZE_MUCH_LARGER;
    else if (det.sizeRelative === 'larger') confidence += THREAT_CONF_SIZE_LARGER;
    else if (det.sizeRelative === 'ambiguous') confidence += THREAT_CONF_SIZE_AMBIGUOUS;

    // Diet contribution (if chemical detection available — hare has none airborne)
    if (det.dietType === 'predator' && det.dietConfidence > 0.3) {
      confidence += 0.3;
    }

    if (confidence > highestConfidence) {
      highestConfidence = confidence;
      threatSource = det.entity;
      threatBearing = det.entity ?
        directionAwayFrom(creature.x, creature.y, det.entity.x, det.entity.y) : null;
    }
  }

  if (highestConfidence <= 0) return null;

  return {
    confidence: highestConfidence,
    source: threatSource,
    fleeBearing: threatBearing,
  };
}

/**
 * Food-identification template matching.
 * Visual only for the hare. Produces approach signal if food is visible.
 */
function _matchFoodTemplates(creature, neural, detectionInfo) {
  const foodRegion = neural.structures.find(s => s.templates === 'food_visual');
  if (!foodRegion) return null;

  // The food-identification region only drives the locomotion ganglion when
  // the body is hungry: its gain rides on the hunger chemistry. PLACEHOLDER
  // for the hormonal gain in Endocrine-Design; the hunger drive is the
  // signal for now. A fed hare on grass used to approach food, arrive, and
  // hold there for good (resting, at triple healing) instead of moving on.
  if (!creature.drives || creature.drives.hunger <= HUNGER_THRESHOLD) return null;

  // Check for food tiles visible from current position
  // This reads from the existing food-detection system
  const foodTarget = findNearestFoodTile(creature.x, creature.y);
  if (!foodTarget) return null;

  // Check if food is within visual range (food-identification uses head visual)
  const d = dist(creature.x, creature.y, foodTarget.x, foodTarget.y);

  // At the food tile — no approach needed, signal graze
  if (d < 1) {
    return {
      target: foodTarget,
      approachBearing: null,
      intensity: 0, // no locomotion — creature is at the food
      atFood: true,
    };
  }

  // Use a simple range check — food identification doesn't need SNR,
  // just "can the head visual see this tile"
  const maxFoodRange = 6; // rough visual food-identification range
  if (d > maxFoodRange) return null;

  return {
    target: foodTarget,
    approachBearing: directionToward(creature.x, creature.y, foodTarget.x, foodTarget.y),
    intensity: 0.3, // moderate approach intensity
  };
}

/**
 * Resolve competing signals at the central locomotion ganglion.
 *
 * Two ganglion circuits on the locomotion pathway:
 *   Freeze ganglion — lower threshold, inhibitory. Suppresses all motor output.
 *   Flee ganglion — higher threshold, excitatory. Overcomes freeze inhibition.
 *
 * The transition from freeze to flee is NOT a decision. It happens because
 * the transducer signal increased (threat closer) or the threshold decreased
 * (stress chemistry), and the flee ganglion's threshold was crossed.
 *
 * The bolt reflex (checked earlier in processGanglionSystem) is a separate,
 * faster circuit that fires on raw vibration magnitude before template matching.
 */
function _resolveLocomotionOutput(creature, threatResult, foodResult, thresholds) {
  if (threatResult) {
    // ── Flee ganglion (excitatory, high threshold) ──
    // Fires when accumulated confidence exceeds flee threshold.
    // Output: maximum locomotion intensity, direction away from threat.
    // This is a binary circuit — it fires or it doesn't. When it fires,
    // the output is always maximum intensity.
    if (threatResult.confidence >= thresholds.flee) {
      creature._ganglionTriggeredStress = true;
      return {
        intensity: 1.0,                    // binary — flee ganglion fires at full
        direction: threatResult.fleeBearing,
        source: threatResult.source,
        type: 'flee',
      };
    }

    // ── Freeze ganglion (inhibitory, lower threshold) ──
    // Fires when confidence exceeds freeze threshold but is below flee.
    // Output: zero locomotion. Suppresses food-seeking, wandering, everything.
    // The hare is actively holding still, not passively idle.
    // Freeze releases no stress chemistry: the inhibitory circuit fired, not
    // the threat (flee) ganglion the endocrine tissue is wired to.
    if (threatResult.confidence >= thresholds.freeze) {
      return {
        intensity: 0,
        direction: null,
        type: 'freeze',
      };
    }

    // ── Alert (below freeze threshold, above alert threshold) ──
    // Orient toward signal source. No motor suppression — the hare might
    // still graze if hungry. Alert is "something is there" without the
    // confidence to trigger freeze.
    // Alert releases no stress chemistry either. direction is TOWARD the
    // source (fleeBearing reversed); the action bridge faces it as given.
    // Direction 0 (north) is a valid bearing, hence the null check.
    if (threatResult.confidence >= thresholds.alert) {
      return {
        intensity: 0,
        direction: threatResult.fleeBearing != null ? (threatResult.fleeBearing + 4) % 8 : null,
        type: 'alert',
      };
    }
  }

  // ── No threat above alert — check food ──
  if (foodResult) {
    return {
      intensity: foodResult.intensity,
      direction: foodResult.approachBearing,
      type: 'forage',
      atFood: foodResult.atFood || false,
    };
  }

  // ── Nothing — hold still ──
  return { intensity: 0, direction: null, type: 'hold' };
}

// ==================== DELIBERATIVE OVERRIDE (Prompt O) ====================
// After reactive layer produces a recommendation, the deliberative layer
// attempts to override it based on integration capacity.

function canOverrideReactive(creature, reactiveMagnitude) {
  // Critical stimuli bypass deliberation regardless of integration
  if (reactiveMagnitude >= CRITICAL_MAGNITUDE) return false;

  const overrideCapacity = creature.integrationCapacity * OVERRIDE_SCALE;
  const threshold = reactiveMagnitude * STIMULUS_RESISTANCE;
  if (threshold <= 0) return true;

  // Deterministic, as Cognition-Design writes it: the suppression signal
  // either completes its round trip before the reactive output executes or
  // it does not. (It was rand() < capacity/threshold, so a wolf beside a
  // much larger predator had a 75% chance to talk itself out of fleeing.)
  return overrideCapacity > threshold;
}

/** Run deliberative evaluation when override succeeds. Returns null when
 *  deliberation has nothing to add and the reactive recommendation stands;
 *  it never invents a wander. */
function deliberativeEvaluation(creature) {
  // Compare drive urgencies (existing drive comparison)
  const dominant = getDominantDrive(creature);
  const detections = creature.detectionInfo || [];

  // Compute deliberative seeking range
  const seekRange = MIN_SEEK + creature.integrationCapacity * SEEK_SCALE;

  switch (dominant.drive) {
    case 'safety': {
      // Deliberative safety: evaluate threat using full detection info
      // If threat has assessment 'weaker', suppress flee
      for (const det of detections) {
        if (det.threatAssessment === 'weaker' && det.distance > 2) {
          // Threat is assessed as weaker — hold ground or ignore
          return { behavior: 'wander', fromDeliberate: true };
        }
      }
      return null;   // nothing to add: the reactive layer's flee stands
    }
    case 'hunger': {
      if (creature.diet === 'predator') {
        // Deliberative hunting: long-range pursuit with full info
        // Check for corpses first
        const corpseHere = getCorpseAt(state.player.layer, creature.x, creature.y);
        if (corpseHere) return { behavior: 'eat_corpse', fromDeliberate: true };

        // Check for adjacent prey
        const adjPrey = getAdjacentPrey(creature);
        if (adjPrey) return { behavior: 'hunt_attack', target: adjPrey, fromDeliberate: true };

        // Seek detected prey within deliberative range
        if (creature.detectedCorpses && creature.detectedCorpses.length > 0) {
          const nearest = creature.detectedCorpses[0];
          if (nearest.distance <= seekRange) {
            return { behavior: 'approach_corpse', corpse: nearest, fromDeliberate: true };
          }
        }
        if (creature.detectedPrey && creature.detectedPrey.length > 0) {
          // Use fight assessment if available to avoid costly fights
          for (const prey of creature.detectedPrey) {
            if (prey.distance > seekRange) continue;
            // Find detection info for this prey
            const pInfo = detections.find(d => d.entity === prey.target);
            if (pInfo && pInfo.threatAssessment === 'overwhelming') continue; // skip dangerous targets
            if (pInfo && pInfo.threatAssessment === 'stronger') continue;      // too risky
            // Require minimum diet confidence before committing to a hunt (Prompt P)
            if (pInfo && pInfo.dietConfidence < DIET_DECISION_THRESHOLD) continue;
            return { behavior: 'hunt_chase', target: prey.target, fromDeliberate: true };
          }
        }
        return null;   // no viable prey: nothing to add
      } else {
        // Deliberative foraging: seek food at range
        if (tileIsFood(creature.x, creature.y)) {
          return { behavior: 'graze', fromDeliberate: true };
        }
        const nearestFood = findNearestFoodTile(creature.x, creature.y);
        if (nearestFood) {
          const foodDist = dist(creature.x, creature.y, nearestFood.x, nearestFood.y);
          if (foodDist <= seekRange) {
            return { behavior: 'approach_food_tile', target: nearestFood, fromDeliberate: true };
          }
        }
        return null;   // no food in reach: nothing to add
      }
    }
    case 'rest':
      return { behavior: 'rest', fromDeliberate: true };
    default:
      return null;
  }
}

// ==================== GOAL PERSISTENCE (Prompt O) ====================
// Deliberative goals expire if target leaves detection for too long.

function updateGoalPersistence(creature) {
  if (!creature.huntTarget) {
    creature._goalLostTurns = 0;
    return;
  }
  // Check if hunt target is still detected
  const detections = creature.detectionInfo || [];
  const found = detections.find(d => d.entity === creature.huntTarget);
  if (found) {
    creature._goalLostTurns = 0;
  } else {
    creature._goalLostTurns = (creature._goalLostTurns || 0) + 1;
    const maxPersistence = Math.max(1, Math.round(creature.integrationCapacity * PERSISTENCE_SCALE));
    if (creature._goalLostTurns > maxPersistence) {
      creature.huntTarget = null;
      creature._goalLostTurns = 0;
    }
  }
}

// ==================== DEBUG: RULE LABEL MAPPER ====================
// Maps reactive action outputs back to human-readable rule names.
const _RULE_LABELS = {
  // magnitude 0.9 — Rule 1
  'retaliate:0.9': 'R1 CRITICAL retaliate',
  'flee_refuge:0.9': 'R1 CRITICAL flee_refuge',
  'flee:0.9': 'R1 CRITICAL flee',
  // magnitude 0.7 — Rule 2
  'retaliate:0.7': 'R2 DAMAGE retaliate',
  'flee_refuge:0.7': 'R2 DAMAGE flee_refuge',
  'flee:0.7': 'R2 DAMAGE flee',
  // magnitude 0.6 — Rule 3
  'retaliate:0.6': 'R3 ADJ_THREAT retaliate',
  'flee_refuge:0.6': 'R3 ADJ_THREAT flee_refuge',
  'flee:0.6': 'R3 ADJ_THREAT flee',
  'orient:0.6': 'R3 ADJ_THREAT orient',
  // magnitude 0.5 — Rule 4
  'flee_refuge:0.5': 'R4 NEARBY_STRONG flee',
  'flee:0.5': 'R4 NEARBY_STRONG flee',
  'hold:0.5': 'R4 NEARBY_STRONG hold',
  'orient:0.5': 'R4 NEARBY_STRONG orient',
  // magnitude 0.35/0.4 — Rule 4B
  'maintain_distance:0.35': 'R4B COMPETITOR space',
  'maintain_distance:0.4': 'R4B COMPETITOR space_adj',
  // magnitude 0.3 — Rule 5
  'attack_adjacent:0.3': 'R5 ADJ_FOOD attack',
  'eat_corpse:0.3': 'R5 ADJ_FOOD eat_corpse',
  'graze:0.3': 'R5 ADJ_FOOD graze',
  // magnitude 0.2 — Rule 6/7/8
  'approach_food:0.2': 'R6 NEARBY_FOOD approach',
  'approach_corpse:0.2': 'R6 NEARBY_FOOD corpse',
  'approach_food_tile:0.2': 'R6 NEARBY_FOOD forage',
  'return_home:0.2': 'R7 TERRITORY return',
  'rest:0.2': 'R8 REST rest',
  // magnitude 0.1 — Rule 9
  'hold:0.1': 'R9 DEFAULT hold',
  'wander:0.1': 'R9 DEFAULT wander',
};

function _ruleLabel(action) {
  const key = action.behavior + ':' + action.magnitude;
  return _RULE_LABELS[key] || ('R? ' + action.behavior + ' @' + action.magnitude);
}

export {
  computeIntegrationCapacity, getTier,
  movementCompromisesSense, findRefuge,
  isReactivelyHungry, getBloodState,
  getDominantDrive,
  evaluateReactiveRules,
  processGanglionSystem,
  canOverrideReactive, deliberativeEvaluation,
  updateGoalPersistence,
  _RULE_LABELS, _ruleLabel,
};
