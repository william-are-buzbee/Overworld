// ==================== SIGNAL EMISSION SYSTEM (Prompt L-A) ====================
// Computes per-turn chemical, vibration, and visual emission values for every
// creature (including the player).  These values are stored on creature.signals
// and recomputed each turn from current state — nothing is cached across turns.
//
// Detection still uses the flat-range I-B system until L-B replaces it.

import {
  CHEM_MASS_COEFF, CHEM_PREDATOR_MULT, CHEM_ACTIVITY_MULT, CHEM_WOUND_COEFF,
  VIB_GROUND_COEFF, VIB_AIR_BASELINE_COEFF, VIB_AIR_ACTIVITY_COEFF, VIB_AIR_COMBAT_BONUS,
  VIB_WATER_COEFF, VIB_WATER_IDLE_COEFF,
  VIS_SIZE_COEFF,
  CREEP_INTENSITY, WALK_INTENSITY,
} from './constants.js';
import { getMovementIntensity } from './physiology.js';

// ==================== CHEMICAL EMISSION ====================

function computeChemicalEmission(creature) {
  const mass = creature.totalMass || 0;
  if (mass <= 0) return 0;

  // Base emission from metabolism — larger bodies emit more
  let emission = mass * CHEM_MASS_COEFF;

  // Diet modifier — predators emit more (protein metabolism byproducts)
  if (creature.diet === 'predator') {
    emission *= CHEM_PREDATOR_MULT;
  }

  // Activity modifier — moving increases respiration and volatile output
  if (creature.movedThisTurn) {
    emission *= CHEM_ACTIVITY_MULT;
  }

  // Wound modifier — bleeding broadcasts chemical signal
  if (creature.blood != null && creature.bloodMax != null && creature.bloodMax > 0) {
    const bloodFraction = creature.blood / creature.bloodMax;
    if (bloodFraction < 0.75) {
      const woundSeverity = 1.0 - bloodFraction;
      emission += mass * woundSeverity * CHEM_WOUND_COEFF;
    }
  }

  return emission;
}

// ==================== VIBRATION EMISSION ====================

function computeVibrationEmission(creature) {
  const mass = creature.totalMass || 0;
  if (mass <= 0) return { ground: 0, air: 0, water: 0 };

  // --- Ground --- the footfall impulse: the mass a moving body drops on the
  // substrate each step, times the energy of the step. Impact energy goes
  // with the square of the speed the foot comes down at, and that speed goes
  // with the locomotion intensity the body is driven at, so the emission is
  // mass × (intensity / walk)²: a creep at 0.1 puts 16% of a walk into the
  // ground, a sprint at 1.0 sixteen times as much. Still creatures put
  // nothing in. Motor-System-Design step 6.
  let ground = 0;
  if (creature.movedThisTurn && !creature.inWater) {
    const pace = Math.max(CREEP_INTENSITY, getMovementIntensity(creature)) / WALK_INTENSITY;
    ground = mass * VIB_GROUND_COEFF * pace * pace;
  }

  // --- Air ---
  let air = mass * VIB_AIR_BASELINE_COEFF;
  if (creature.movedThisTurn) {
    air += mass * VIB_AIR_ACTIVITY_COEFF;
  }
  if (creature.inCombatThisTurn) {
    air += VIB_AIR_COMBAT_BONUS;
  }

  // --- Water ---
  let water = 0;
  if (creature.inWater) {
    if (creature.movedThisTurn) {
      water = mass * VIB_WATER_COEFF;
    } else {
      water = mass * VIB_WATER_IDLE_COEFF;
    }
  }

  return { ground, air, water };
}

// ==================== VISUAL DETECTABILITY ====================

function computeVisualDetectability(creature) {
  const mass = creature.totalMass || 0;
  if (mass <= 0) return 0;

  // Size component — cube root of mass as proxy for visual cross-section.
  // This is the creature's passive visual profile — how large it appears.
  // Motion's effect on detectability is handled entirely by
  // MOTION_SIGNAL_MOVING / MOTION_SIGNAL_STILL in detection.js (Visual
  // Detection Pass 1), not here in the emission signal.
  let detectability = Math.pow(mass, 0.33) * VIS_SIZE_COEFF;

  return detectability;
}

// ==================== REFERENCE EMISSION ====================
// What this creature itself puts out on a channel, as the measuring stick it
// uses to size others (Sensory-Design "Size estimation"): its own smell at
// rest, its own footfalls and breathing as if moving, its own silhouette.
// A creature standing still still knows what its own footfalls sound like,
// so movement-dependent channels are computed as if moving, at a walk.
export function referenceEmission(creature, channel) {
  const mass = creature.totalMass || 0;
  if (mass <= 0) return 0;
  switch (channel) {
    case 'chemicalAirborne':
      return mass * CHEM_MASS_COEFF * (creature.diet === 'predator' ? CHEM_PREDATOR_MULT : 1);
    case 'vibrationGround':
      return mass * VIB_GROUND_COEFF;
    case 'vibrationAir':
      return mass * (VIB_AIR_BASELINE_COEFF + VIB_AIR_ACTIVITY_COEFF);
    case 'visual':
      return computeVisualDetectability(creature);
    default:
      return 0;
  }
}

// ==================== MASTER SIGNAL COMPUTATION ====================

/**
 * Compute all signal emission values for a creature and store them on
 * creature.signals.  Call once per creature per turn, AFTER movement
 * and combat, BEFORE detection.
 */
export function computeSignals(creature) {
  // Ensure the signals object exists
  if (!creature.signals) {
    creature.signals = {
      chemical: 0,
      vibration: { ground: 0, air: 0, water: 0 },
      visual: 0,
    };
  }

  creature.signals.chemical = computeChemicalEmission(creature);

  const vib = computeVibrationEmission(creature);
  creature.signals.vibration.ground = vib.ground;
  creature.signals.vibration.air = vib.air;
  creature.signals.vibration.water = vib.water;

  creature.signals.visual = computeVisualDetectability(creature);
}
