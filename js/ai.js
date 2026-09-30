// ==================== AI ====================
// Per-creature AI tick: body chemistry, the senses, the creature's wiring
// (nodes.js) and the bridge from what it drove onto the action executor;
// legacy stubs.
// Split from enemy-ai.js.

import { state } from './state.js';
import { getBodyMap,
         MASS_HUNGER_COEFF, NEURAL_HUNGER_COEFF, REST_BASE_RATE,
         REST_BLOOD_IMPAIRED, REST_BLOOD_WEAKENED, REST_BLOOD_CRITICAL, REST_WOUND_COEFF,
         REST_THRESHOLD } from './constants.js';
import { computeIntegrationCapacity, getTier, processGanglionSystem, updateGoalPersistence } from './cognition.js';
import { buildAllDetectionInfo, detectThreats, applySafetyFromThreats, detectCorpses } from './detection.js';
import { executeAction, monsterMelee, executeWander } from './behaviors.js';
import { isWaterTile, canMoveTo } from './ai-utils.js';
import { computeSignals } from './signals.js';
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
 * What a creature's wiring drove this action, onto the action executor
 * (behaviors.js). A bridge until the motor layer reads effects directly:
 * each output names its `act`. When nothing fired, the locomotion
 * generator's own gait runs (the wander profile), unless the body's rest
 * drive holds it down.
 */
function _outputToAction(output, creature) {
  creature._lastGanglionIntensity = output ? output.intensity : null;
  if (output && output.act) return _actToAction(output, creature);
  return _gait(creature);
}

/** Nothing fired: the generator's ambient gait, or rest. */
function _gait(creature) {
  if (creature.hormones && creature.hormones.fatigue > REST_THRESHOLD) return { behavior: 'rest', magnitude: 0.1 };
  return { behavior: 'wander', magnitude: 0.1 };
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
      return _gait(creature);
  }
}

// ==================== UNIFIED AI LOOP ====================

/** Main AI entry point: once per creature per action. Every creature runs its
 *  wiring (wiring.js, nodes.js); what its nodes drive, the body does. */
function runCreatureAI(creature) {
  if (creature.hp <= 0) return;

  // ── Reset per-turn state flags (Prompt L-A) ──
  creature.movedThisTurn = false;
  creature.inCombatThisTurn = false;
  creature._lastGanglionIntensity = null;

  updateBodyChemistry(creature);
  // (substrate regenerates in endPlayerTurn, scaled by the ticks elapsed)
  creature.integrationCapacity = computeIntegrationCapacity(creature);
  creature.tier = getTier(creature.integrationCapacity);

  // The senses: percepts (with the continuous uncertainty of each channel),
  // what reads as a threat to flee from, carrion the nose places
  buildAllDetectionInfo(creature);
  detectThreats(creature);
  applySafetyFromThreats(creature);
  detectCorpses(creature);
  updateGoalPersistence(creature);

  // ── The wiring ──
  const output = processGanglionSystem(creature);
  let action = _outputToAction(output, creature);
  // No locomotion zone left: the legs cannot answer; a strike still can
  if (creature.immobilized && action.behavior !== 'hunt_attack' && action.behavior !== 'retaliate') {
    action = { behavior: 'hold', magnitude: 0.1 };
  }
  creature._lastTrace = {
    output: output ? output.type : 'none',
    act: output ? output.act : null,
    finalBehavior: action.behavior,
    intensity: output ? output.intensity : 0,
    alarm: creature.hormones ? creature.hormones.alarm : 0,
  };

  creature.currentBehavior = action.behavior;
  const x0 = creature.x, y0 = creature.y;
  executeAction(creature, action);
  _depleteLocomotionSubstrate(creature);
  noteHuntAction(creature, action, x0, y0);   // tools/ecology.mjs bookkeeping; nothing in play reads it

  // The blow has been felt (pain read it this action)
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
