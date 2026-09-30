// ==================== AI ====================
// Per-creature AI tick, reactive-deliberative decision making, drive updates,
// movement helpers, and legacy stubs.
// Split from enemy-ai.js.

import { state } from './state.js';
import { getBodyMap,
         MASS_HUNGER_COEFF, NEURAL_HUNGER_COEFF, REST_BASE_RATE,
         REST_BLOOD_IMPAIRED, REST_BLOOD_WEAKENED, REST_BLOOD_CRITICAL, REST_WOUND_COEFF,
         HUNGER_THRESHOLD, REST_THRESHOLD,
         OVERRIDE_SCALE, STIMULUS_RESISTANCE, CRITICAL_MAGNITUDE } from './constants.js';
import { computeIntegrationCapacity, getTier, evaluateReactiveRules,
         processGanglionSystem,
         canOverrideReactive, deliberativeEvaluation, updateGoalPersistence,
         _ruleLabel, getDominantDrive } from './cognition.js';
import { buildAllDetectionInfo, detectThreats, applySafetyFromThreats,
         detectPrey, detectCorpses } from './detection.js';
import { executeAction, adjacencyCombatCheck, monsterMelee, executeWander,
         executeFlee } from './behaviors.js';
import { isWaterTile, canMoveTo, getCorpseAt, combatCapability } from './ai-utils.js';
import { computeSignals } from './signals.js';
import { getWiring } from './wiring.js';
import { _depleteLocomotionSubstrate } from './physiology.js';
import { noteHuntAction } from './hunt-funnel.js';

// ==================== WATER STATE HELPER (Prompt L-A) ====================
// Update creature.inWater based on current tile. Called after movement.
function _updateInWater(creature) {
  const layer = creature.layer != null ? creature.layer : state.player.layer;
  creature.inWater = isWaterTile(layer, creature.x, creature.y);
}

// ==================== BODY CHEMISTRY (Endocrine-Design) ====================
// What used to be `creature.drives` is chemistry in the blood,
// `creature.hormones` (physiology.js owns it):
//   hunger   released by the gut as the body burns its reserves: a rate set by
//            living mass and, more steeply, neural mass. Eating suppresses it.
//   fatigue  the waste of activity building up (sleep pressure): a slow base
//            rate, faster with blood loss and wounds. Rest and food clear it.
//   alarm    released by glands (a wired creature's gland nodes; the reactive
//            rules' placeholder releases); cleared by the circulation once per
//            player input (physiology.js _clearStressChemistry).

/** The tissue-driven part of body chemistry, once per action. */
function updateBodyChemistry(creature) {
  const h = creature.hormones;
  if (!h) return;

  // Compute total mass and neural mass from surviving body zones
  const bodyMap = getBodyMap(creature);
  let totalMass = creature.totalMass || 0;
  let totalNeural = 0;

  if (bodyMap) {
    // Recalculate from surviving zones (destroyed zones lose their mass)
    totalMass = 0;
    for (const zone of bodyMap) {
      if (!zone.destroyed) {
        totalMass += zone.mass || 0;
        totalNeural += zone.neural || 0;
      }
    }
  }

  // Hunger: the gut releases as mass and neural tissue burn reserves
  h.hunger = Math.min(1.0, h.hunger + (totalMass * MASS_HUNGER_COEFF + totalNeural * NEURAL_HUNGER_COEFF));

  // Fatigue: base rate + wound acceleration + blood acceleration (I-D)
  const bloodAccel = getBloodRestAcceleration(creature);
  const woundAccel = getWoundRestAcceleration(creature);
  h.fatigue = Math.min(1.0, h.fatigue + REST_BASE_RATE + bloodAccel + woundAccel);
}

/** Rest acceleration from blood loss (I-D). Mirrors bleed penalty thresholds. */
function getBloodRestAcceleration(creature) {
  if (creature.blood == null || creature.bloodMax == null || creature.bloodMax <= 0) return 0;
  const bloodFraction = creature.blood / creature.bloodMax;

  if (bloodFraction > 0.75) return 0;
  if (bloodFraction > 0.50) return REST_BLOOD_IMPAIRED;
  if (bloodFraction > 0.25) return REST_BLOOD_WEAKENED;
  return REST_BLOOD_CRITICAL;
}

/** Rest acceleration from zone damage (I-D). Proportional to fraction of zones wounded. */
function getWoundRestAcceleration(creature) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return 0;

  let damagedZones = 0;
  let totalZones = 0;

  for (const zone of bodyMap) {
    totalZones++;
    if (zone.hp != null && zone.maxHp != null && zone.hp < zone.maxHp) {
      damagedZones++;
    } else if (zone.destroyed) {
      damagedZones++;
    }
  }

  if (totalZones === 0) return 0;
  return (damagedZones / totalZones) * REST_WOUND_COEFF;
}

/**
 * Translate ganglion motor output into an action the existing execution
 * system can handle. This is a bridge — eventually the execution system
 * will read intensity directly. For now, map to existing behavior labels.
 */
function _ganglionOutputToAction(output, creature) {
  if (!output) return { behavior: 'hold', magnitude: 0.1 };

  // Store ganglion intensity for substrate depletion
  creature._lastGanglionIntensity = output.intensity;

  // An output that names its act (the wolf's wiring): straight onto the executor
  if (output.act) return _actToAction(output, creature);

  if (output.intensity <= 0) {
    // No locomotion signal — hold still or check feeding
    if (output.type === 'alert') {
      // Face the threat while holding still. output.direction already points
      // at the source (it was reversed twice before, so the hare faced away).
      return {
        behavior: 'orient',
        magnitude: 0.4,
        direction: output.direction,
      };
    }
    // At food tile — graze (mid-graze local ganglion contact-chemical reflex)
    if (output.atFood && creature.hormones && creature.hormones.hunger > HUNGER_THRESHOLD) {
      return { behavior: 'graze', magnitude: 0.3 };
    }
    // Check mid-graze contact feeding on corpses
    const corpse = getCorpseAt(state.player.layer, creature.x, creature.y);
    if (corpse && creature.hormones && creature.hormones.hunger > HUNGER_THRESHOLD) {
      return { behavior: 'eat_corpse', magnitude: 0.3 };
    }
    if (output.type === 'forage' && output.direction != null) {
      return {
        behavior: 'forage_approach',
        magnitude: 0.3,
        direction: output.direction,
      };
    }
    if (output.type === 'freeze') return { behavior: 'hold', magnitude: 0.1 };
    // Nothing fired. The locomotion ganglion's normal gait (its
    // alternating_variable pattern) runs the ambient motor program, the
    // wander profile, unless the body's rest drive holds it down. Before
    // this the hare held still, and held-still was scored as resting.
    if (creature.hormones && creature.hormones.fatigue > REST_THRESHOLD) return { behavior: 'rest', magnitude: 0.1 };
    return { behavior: 'wander', magnitude: 0.1 };
  }

  // Locomotion signal present
  if (output.intensity >= 0.7) {
    // High intensity — flee equivalent
    creature.threatSource = output.source || creature.threatSource;
    return {
      behavior: 'flee',
      magnitude: output.intensity,
      direction: output.direction,    // bolt/flee bearing for fallback
      _ganglionIntensity: output.intensity,
    };
  } else if (output.intensity >= 0.3) {
    // Moderate intensity — directed movement (approach food, cautious movement)
    return {
      behavior: 'wander',
      magnitude: output.intensity,
      direction: output.direction,
      _ganglionIntensity: output.intensity,
    };
  } else {
    // Low intensity — slow approach
    return {
      behavior: 'wander',
      magnitude: output.intensity,
      direction: output.direction,
      _ganglionIntensity: output.intensity,
    };
  }
}

/**
 * A wired output's `act` onto the action executor (behaviors.js), with the
 * place and body its circuit fired about. A bridge, as above.
 */
function _actToAction(output, creature) {
  const m = output.intensity;
  switch (output.act) {
    case 'flee':
      creature.threatSource = output.source || creature.threatSource;
      return { behavior: 'flee', magnitude: m, direction: output.direction, _ganglionIntensity: m };
    case 'hunt_chase':
      return { behavior: 'hunt_chase', magnitude: m, target: output.source, place: output.place };
    case 'hunt_attack':
      return { behavior: 'hunt_attack', magnitude: 0.3, target: output.source };
    case 'retaliate':
      return { behavior: 'retaliate', magnitude: 0.7, target: output.source };
    case 'eat_corpse':
      return { behavior: 'eat_corpse', magnitude: 0.3 };
    case 'approach_corpse':
      return { behavior: 'approach_corpse', magnitude: m, corpse: output.place };
    case 'follow_trail':
    case 'follow_scent':
      return { behavior: output.act, magnitude: m, direction: output.direction };
    case 'maintain_distance':
      return { behavior: 'maintain_distance', magnitude: m, target: output.source };
    case 'orient':
      return { behavior: 'orient', magnitude: m, direction: output.direction };
    // Flight to where the body knows: home ground (its wander's home), or water
    case 'flee_home':
    case 'flee_water':
      creature.threatSource = output.source || creature.threatSource;
      return { behavior: 'flee_refuge', magnitude: m, refugeType: output.act === 'flee_home' ? 'territory' : 'water',
               direction: output.direction, _ganglionIntensity: m };
    // Held still: at rest (fatigue clears)
    case 'hold':
      return { behavior: 'rest', magnitude: 0.1 };
    case 'graze':
      return { behavior: 'graze', magnitude: 0.3 };
    case 'forage_approach':
      return { behavior: 'forage_approach', magnitude: m, direction: output.direction };
    default:
      return { behavior: 'wander', magnitude: 0.1 };
  }
}

// ==================== UNIFIED AI LOOP ====================

/** Main AI entry point — called once per creature per turn. */
function runCreatureAI(creature) {
  if (creature.hp <= 0) return;

  // ── Reset per-turn state flags (Prompt L-A) ──
  creature.movedThisTurn = false;
  creature.inCombatThisTurn = false;
  // Reset ganglion transient fields
  creature._lastGanglionIntensity = null;

  // Immobilized creatures can't move but can still attack adjacently
  if (creature.immobilized) {
    updateBodyChemistry(creature);
    creature.integrationCapacity = computeIntegrationCapacity(creature);
    creature.tier = getTier(creature.integrationCapacity);
    buildAllDetectionInfo(creature);
    detectThreats(creature);
    applySafetyFromThreats(creature);
    detectPrey(creature);
    detectCorpses(creature);
    adjacencyCombatCheck(creature);
    _updateInWater(creature);
    computeSignals(creature);
    return;
  }

  // Update body chemistry
  updateBodyChemistry(creature);
  // NOTE: _regenerateSubstrate is now called from endPlayerTurn, scaled by ticksElapsed

  // ── Cognitive tier (Prompt M-A1) ──
  creature.integrationCapacity = computeIntegrationCapacity(creature);
  creature.tier = getTier(creature.integrationCapacity);

  // ── Build continuous-uncertainty detection info (Prompt P) ──
  // Must run before detectThreats so threat assessment can use detection-derived info
  buildAllDetectionInfo(creature);

  // Threat detection — uses detection info for honest threat assessment
  detectThreats(creature);
  applySafetyFromThreats(creature);

  // Prey and corpse detection (I-C) — still used by deliberative layer
  detectPrey(creature);
  detectCorpses(creature);

  // ── Goal persistence check ──
  updateGoalPersistence(creature);

  // ══════════════════════════════════════════════════════════════
  // ── Behavior Decision ──
  const neural = getWiring(creature);
  let action;
  let reactiveAction = null;

  if (neural) {
    // ── Wired nervous system (nodes.js) ──
    // Creature has a wiring: its nodes decide, not the reactive rules. Its
    // glands are nodes too, and release as they fire (pain included: a gland
    // input, felt through the body, not a special case here).
    const ganglionOutput = processGanglionSystem(creature);
    action = _ganglionOutputToAction(ganglionOutput, creature);

    // ── Store decision trace for debugCognition() ──
    creature._lastTrace = {
      reactiveRule: 'GANGLION ' + (ganglionOutput ? ganglionOutput.type : 'null'),
      reactiveBehavior: action.behavior,
      reactiveMagnitude: action.magnitude || 0,
      overrideRatio: 0,
      overrideAttempted: false,
      overrideSucceeded: false,
      finalBehavior: action.behavior,
      fromDeliberate: false,
      ganglionIntensity: ganglionOutput ? ganglionOutput.intensity : 0,
      alarm: creature.hormones ? creature.hormones.alarm : 0,
    };
  } else {
    // ── Reactive-Deliberative Architecture (Prompt O) ──
    // Step 1: Reactive layer always runs — produces recommendation + magnitude
    reactiveAction = evaluateReactiveRules(creature);

    // Step 2: Deliberative override attempt
    action = reactiveAction;
    let overrideAttempted = false;
    let overrideSucceeded = false;
    const overrideCapacity = creature.integrationCapacity * OVERRIDE_SCALE;
    const overrideThreshold = reactiveAction.magnitude * STIMULUS_RESISTANCE;
    const overrideRatio = (reactiveAction.magnitude >= CRITICAL_MAGNITUDE) ? 0
      : (overrideThreshold > 0 ? overrideCapacity / overrideThreshold : Infinity);

    if (canOverrideReactive(creature, reactiveAction.magnitude)) {
      overrideAttempted = true;
      const deliberateAction = deliberativeEvaluation(creature);
      if (deliberateAction) {
        overrideSucceeded = true;
        action = deliberateAction;
      }
    }

    // ── Store decision trace for debugCognition() ──
    creature._lastTrace = {
      reactiveRule: _ruleLabel(reactiveAction),
      reactiveBehavior: reactiveAction.behavior,
      reactiveMagnitude: reactiveAction.magnitude,
      overrideRatio: overrideRatio,
      overrideAttempted: overrideAttempted,
      overrideSucceeded: overrideSucceeded,
      finalBehavior: action.behavior,
      fromDeliberate: !!action.fromDeliberate,
    };
  }

  // Step 3: Execute the selected action
  creature.currentBehavior = action.behavior;
  const x0 = creature.x, y0 = creature.y;
  let moved = executeAction(creature, action);
  _depleteLocomotionSubstrate(creature);
  // ══════════════════════════════════════════════════════════════

  // Adjacency combat: skip if fleeing cleanly or if action already attacked
  const behavior = creature.currentBehavior;
  // (not for a wired creature: its own strike circuits decide what it strikes)
  const fleeingCleanly = (behavior === 'flee' && moved && !creature.tookDamageThisTurn);
  const alreadyAttacked = (action.behavior === 'retaliate' || action.behavior === 'attack_adjacent' ||
                           action.behavior === 'hunt_attack');
  if (!neural && !fleeingCleanly && !alreadyAttacked) {
    adjacencyCombatCheck(creature);
  }
  noteHuntAction(creature, action, x0, y0);   // tools/ecology.mjs bookkeeping; nothing in play reads it

  // Prompt K-B: reset per-turn damage flag AFTER combat check
  creature.tookDamageThisTurn = false;

  // ── Signal emission (Prompt L-A) ──
  _updateInWater(creature);
  computeSignals(creature);
}

// ==================== LEGACY STUBS ====================
// These functions are exported for backward compatibility with modules
// that may import them. They are no-ops in the new drive-based AI.
function playerInTerritory(mon){ return true; }
function monInOwnTerritory(mon){ return true; }
function syncSwarmAI(mon){ /* removed — I-A */ }
const mushroomPackAI = syncSwarmAI;
function mushroomTouch(mon){ /* removed — I-A */ }
function wanderInTerritory(mon){ executeWander(mon); }
function moveMonsterToward(mon, tx, ty, movementOnly){
  // Simple step-toward — kept for any external callers
  const dx = Math.sign(tx - mon.x);
  const dy = Math.sign(ty - mon.y);
  const attempts = [];
  if (dx !== 0 && dy !== 0) attempts.push([dx,dy],[dx,0],[0,dy]);
  else if (dx !== 0) attempts.push([dx,0],[dx,1],[dx,-1]);
  else attempts.push([0,dy],[1,dy],[-1,dy]);
  for (const [ax,ay] of attempts){
    const nx = mon.x+ax, ny = mon.y+ay;
    if (canMoveTo(mon, nx, ny)){
      if (nx === state.player.x && ny === state.player.y){
        if (movementOnly) return;
        monsterMelee(mon); return;
      }
      mon.x = nx; mon.y = ny;
      if (mon.facing) { mon.facing.dx = ax; mon.facing.dy = ay; }
      return;
    }
  }
}
function wanderMonster(mon){ executeWander(mon); }
function moveMonsterTowardPlayer(mon){ moveMonsterToward(mon, state.player.x, state.player.y); }
// enemyAct is replaced by runCreatureAI — kept as alias for any external callers
function enemyAct(mon){ runCreatureAI(mon); }

// ==================== EXPORTS ====================
export { runCreatureAI, updateBodyChemistry, _updateInWater,
         playerInTerritory, monInOwnTerritory,
         syncSwarmAI, mushroomPackAI, mushroomTouch,
         wanderInTerritory, moveMonsterToward, wanderMonster, moveMonsterTowardPlayer,
         enemyAct };
