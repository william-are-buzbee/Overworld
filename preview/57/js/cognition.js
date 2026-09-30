// ==================== COGNITION ====================
// Running a creature's wiring, its integration capacity (the tissue that
// holds traces and a hunt goal), and the hunt goal's persistence.

import { getBodyMap, DRIVE_COMPARE_THRESHOLD, PLANNING_THRESHOLD } from './constants.js';
import { runNodes } from './nodes.js';
import { getWiring } from './wiring.js';
import { perceivedPosition } from './detection.js';

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

// ==================== WIRED NERVOUS SYSTEMS (Neural-Architecture-Design) ====================
// Every creature runs its wiring (wiring.js): nodes in its zones, summing
// what its senses deliver and firing past their thresholds (nodes.js). The
// result is what the output stage drives ({ effect, act, intensity,
// direction, place, source, … }), not a behaviour label; ai.js
// _outputToAction bridges it onto the action executor until the motor layer
// reads effects directly. (The reactive rules and the deliberative override
// that stood in for wiring are gone: node sequence step 7, Sep 2026.)

/** Run the creature's wiring on this action's percepts, or null if it has none. */
function processGanglionSystem(creature) {
  const wiring = getWiring(creature);
  return wiring ? runNodes(creature, wiring) : null;
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

export {
  computeIntegrationCapacity, getTier,
  processGanglionSystem,
  updateGoalPersistence,
};
