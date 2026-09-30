// ==================== COGNITION — Decision Architecture ====================
// The reactive-deliberative system. Takes detection info as input,
// produces a behavioral decision as output.
// Split from enemy-ai.js — zero behavior change.

import { state } from './state.js';
import { getBodyMap,
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
         STRESS_NEURAL_SENSITIVITY, STRESS_MAX, SPECIES_DISPLAY_CONFIDENCE,
         LOOM_WINDOW_ACTIONS, REFERENCE_SPEED, BASE_TICKS_PER_ACTION,
         GROUND_EMISSION_BASE } from './constants.js';
import { getBodyPTW } from './physiology.js';
import { runNodes } from './nodes.js';
import { getWiring } from './wiring.js';
import { chebyshev } from './world-state.js';
import { randi } from './rng.js';
import { DIRECTION_DELTAS, canMoveTo, dist, dirFromDelta, getCreatureMass, findNearestWaterTile, findNearestFoodTile,
         tileIsFood, getCorpseAt, directionAwayFrom, directionToward, combatCapability } from './ai-utils.js';
import { getDominantSenseChannel, getAdjacentPrey, getSpeciesKey, perceivedPosition, perceptOf, traceOf,
         readPreyTrailStep, meatEaterUnderfoot } from './detection.js';

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


/** Is this entity perceived on a tile next to the creature? */
function _adjacentPerceived(creature, entity) {
  const pos = perceivedPosition(creature, entity);
  return !!pos && chebyshev(creature.x, creature.y, pos.x, pos.y) <= 1;
}

/**
 * Cornered is a physical fact: no step the body can take (terrain, water,
 * other bodies in the way) puts more distance between it and where it
 * perceives the threat. Having no refuge to run to is not being cornered;
 * it only means the flight has nowhere in particular to go. (Before this,
 * Rule 3 read "no refuge" as cornered, and a wolf near its own den opened
 * fights with any larger animal that wandered past: in the ecology harness
 * baseline, every predator death that was not predation was one of those.)
 */
function _cornered(creature, threat) {
  const tp = perceivedPosition(creature, threat);
  if (!tp) return false;
  const here = dist(creature.x, creature.y, tp.x, tp.y);
  for (const d of DIRECTION_DELTAS) {
    const tx = creature.x + d.x, ty = creature.y + d.y;
    if (dist(tx, ty, tp.x, tp.y) > here && canMoveTo(creature, tx, ty)) return false;
  }
  return true;
}

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
        _adjacentPerceived(creature, creature.threatSource)) {
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
    if (creature.threatSource && _adjacentPerceived(creature, creature.threatSource)) {
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
        // This is what it flees from (or turns on): flight steers away from
        // the threat source, which fleeing also frees from the territory leash
        creature.threatSource = det.entity;
        // Fight only when it can and no step leads away
        if (cc.canFight && _cornered(creature, det.entity)) {
          return { behavior: 'retaliate', magnitude: 0.6, target: det.entity };
        }
        if (refuge.type !== 'none') {
          return { behavior: 'flee_refuge', magnitude: 0.6, target: refuge.target, refugeType: refuge.type };
        }
        return { behavior: 'flee', magnitude: 0.6 };
      }
    }
    // Ambiguous size — could be larger or smaller
    if (size === 'ambiguous') {
      if (diet === 'herbivore') {
        // Herbivores treat ambiguity as potentially larger — flee (as above)
        creature.threatSource = det.entity;
        if (cc.canFight && _cornered(creature, det.entity)) {
          return { behavior: 'retaliate', magnitude: 0.6, target: det.entity };
        }
        if (refuge.type !== 'none') {
          return { behavior: 'flee_refuge', magnitude: 0.6, target: refuge.target, refugeType: refuge.type };
        }
        return { behavior: 'flee', magnitude: 0.6 };
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
  // A strong signal is one that moves or closes: footfalls, the eye's change
  // detection, or a closing speed the eyes resolve. A source the senses read
  // as still, whatever its size reading, and one the channels have
  // recognised as the creature's own kind, set nothing off. (A still source
  // of ambiguous size used to count: a wolf beside a motionless lurker, or
  // among its own kind, stood orienting at it for hundreds of actions while
  // a hare grazed in view; the harness hunt funnel, Sep 2026.)
  const ownKind = getSpeciesKey(creature);
  for (const det of nearbyDetections) {
    if (det.distance <= 1.5) continue; // already handled by Rule 3
    const size = det.sizeRelative || 'unknown';
    if (size === 'larger' || size === 'much_larger' || size === 'unknown' || size === 'ambiguous') {
      const still = det.isMoving === false && !(det.closingSpeed > 0);   // unknown movement is not still
      if (still) continue;
      if (det.species === ownKind && det.speciesConfidence >= SPECIES_DISPLAY_CONFIDENCE) continue;

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
        // Something known to eat plants (its odour bound to it, pass 6b-2)
        // and not clearly bigger is no threat to a predator: no caution, as
        // Rule 4B does not space from it either.
        const knownHerbivore = det.dietConfidence > DIET_DECISION_THRESHOLD && det.dietType === 'herbivore';
        if (knownHerbivore && size !== 'larger') continue;
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

  // RULE 4C — MEAT-EATER ON THE AIR
  // A grazer whose nose reads meat-eater volatiles turns to face where the
  // wind comes from, bringing its eyes to bear, and stops feeding; without a
  // bearing (nothing feels the air move, or still air) it holds still.
  if (diet === 'herbivore' && creature.plume && creature.plume.meatSNR >= 1) {
    const up = creature.plume.upwind;
    if (up) return { behavior: 'orient', magnitude: 0.3, direction: dirFromDelta(up.dx, up.dy) };
    return { behavior: 'hold', magnitude: 0.3 };
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

  // RULE 6A — WHERE THE PREY WAS
  // A hungry predator that has lost its prey from its senses, and whose
  // integration tissue still holds where it was (pass 8), goes there. If it
  // arrives and nothing is there it lets go, and trail and air take over.
  if (diet === 'predator' && cc.canFight && hungry && creature.huntTarget &&
      !perceptOf(creature, creature.huntTarget)) {
    const t = traceOf(creature, creature.huntTarget);
    if (t && (t.x !== creature.x || t.y !== creature.y)) {
      return { behavior: 'approach_food', magnitude: 0.2, target: creature.huntTarget };
    }
    if (creature._traces) creature._traces.delete(creature.huntTarget);
    creature.huntTarget = null;
  }

  // RULE 6B — PREY TRAIL
  // A hungry predator whose nose, put to the ground, reads plant-digestion
  // volatiles on the tiles around it steps toward the freshest of them: it
  // follows the trail the way the animal went (detection.js
  // readPreyTrailStep). The trail names no animal; a grazer too big to take
  // leaves one too, and is found at the end of it.
  if (diet === 'predator' && cc.canFight && hungry) {
    const step = readPreyTrailStep(creature);
    if (step != null) {
      return { behavior: 'follow_trail', magnitude: 0.15, direction: step };
    }
  }

  // RULE 6C — PREY ON THE AIR: SURGE AND CAST
  // A hungry predator whose nose reads plant-digestion volatiles heads
  // upwind (surge). When it loses the odour it sweeps across the wind,
  // alternating sides every two turns, to find the plume again (cast). The
  // memory that it had the odour, and which way was upwind, is held in its
  // integration tissue for integrationCapacity × PERSISTENCE_SCALE turns (the
  // scale goal persistence uses): a meso-predator casts for about four turns,
  // an apex predator for about eight, a body without integration not at all.
  if (diet === 'predator' && cc.canFight && hungry) {
    const plume = creature.plume;
    if (plume && plume.herbSNR >= 1 && plume.upwind) {
      const dir = dirFromDelta(plume.upwind.dx, plume.upwind.dy);
      creature._scentTrace = { upwind: dir, turn: state.turnCount };
      return { behavior: 'follow_scent', magnitude: 0.15, direction: dir };
    }
    const trace = creature._scentTrace;
    if (trace) {
      const age = state.turnCount - trace.turn;
      if (age <= (creature.integrationCapacity || 0) * PERSISTENCE_SCALE) {
        const side = Math.floor(age / 2) % 2 ? 2 : 6;   // right, then left, of upwind
        return { behavior: 'follow_scent', magnitude: 0.12, direction: (trace.upwind + side) % 8 };
      }
      creature._scentTrace = null;
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

// ==================== WIRED NERVOUS SYSTEMS (Neural-Architecture-Design) ====================
// A creature with a wiring (wiring.js) runs it: nodes in its zones, summing
// what its senses deliver and firing past their thresholds (nodes.js). It
// replaces evaluateReactiveRules for that creature. The result is motor output
// ({ intensity, direction, source, type, atFood }), not a behaviour label;
// ai.js _ganglionOutputToAction bridges it onto the action executor until the
// motor layer reads intensity directly.

/** Run the creature's wiring on this action's percepts, or null if it has none. */
function processGanglionSystem(creature) {
  const wiring = getWiring(creature);
  return wiring ? runNodes(creature, wiring) : null;
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

// A hunt goal lasts as long as the integration tissue holds where the prey
// was (detection.js traces, pass 8): perceived now, or held. It used to count
// turns with a floor of one, so a body with no integration kept its goal too.
function updateGoalPersistence(creature) {
  if (creature.huntTarget && (creature.huntTarget.hp <= 0 || !perceivedPosition(creature, creature.huntTarget))) {
    creature.huntTarget = null;
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
