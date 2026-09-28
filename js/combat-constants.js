// ==================== COMBAT CONSTANTS ====================
// Damage formulas, derived combat values (dodge, stealth, accuracy), and blood system constants.
// Split from constants.js — self-contained, no imports from project modules.

// ==================== PHYSICS-BASED DAMAGE ====================
// Body-Sim-Design "Damage": a strike is the striking zone's muscle (force)
// plus its mass (momentum), scaled by the attack's geometry (a bite focuses
// through a point, a kick spreads across a surface). Linear in both, so a
// limb four times heavier hits about four times harder, not sixteen. The
// scale is set against zone HP (HP_PER_KG = 5): a 22 kg prowler's bite is
// about 8 against a prowler torso of 37, a 90 kg ravager's claw about 28,
// a 200 kg wader's kick about 63. A wounded zone strikes in proportion to
// its remaining HP; blood loss weakens every strike.
export const MUSCLE_FORCE_COEFF = 6.0;    // damage per kg of effective muscle in the striking zone
export const MOMENTUM_COEFF    = 0.6;     // damage per kg of the striking zone's mass

// attacker: the creature (for bleedPenalty)
// atkZone:  the zone performing the strike (from the attacker's body map)
// attack:   the attack definition on that zone (for damageModifier; 1 if omitted)
// Returns integer damage before armor and footprint distribution.
export function computeStrikeDamage(attacker, atkZone, attack) {
  if (!atkZone) return 1;

  const hpFrac = (atkZone.maxHp > 0) ? (atkZone.hp / atkZone.maxHp) : 1;
  const effMuscle = (atkZone.muscle || 0) * hpFrac;
  const effMass   = (atkZone.mass   || 0) * hpFrac;

  let damage = effMuscle * MUSCLE_FORCE_COEFF + effMass * MOMENTUM_COEFF;
  damage *= (attack && attack.damageModifier != null) ? attack.damageModifier : 1;

  // Blood loss penalty — less oxygen to muscles, less force output
  damage *= (1 - (attacker.bleedPenalty || 0));

  return Math.max(1, Math.round(damage));
}

// ==================== DERIVED COMBAT VALUES ====================
// Stat-System-Design "Derived Combat Values". Dodge and stealth are read from
// total mass: there is physically less of a small creature to connect with or
// to notice. Accuracy is read from the attacker's detection of the target at
// the moment of the strike (combat.js accuracyOf): the better it senses the
// target, the better it aims. There is no crit; damage noise is the randi(3)
// on the strike.
export const DODGE_REFERENCE_MASS   = 250;  // kg at which dodge reaches 0% (the design doc floats 2500; see Stat-System-Design)
export const MAX_DODGE_PERCENT      = 30;   // a weightless creature's dodge
export const STEALTH_REFERENCE_MASS = 250;  // kg at which the stealth profile reaches 0
export const MAX_STEALTH_PERCENT    = 40;
export const BASE_ACCURACY          = 70;   // hit chance with no sense of the target beyond contact
export const ACCURACY_PER_SNR       = 3;    // added per unit of the attacker's best SNR on the target
export const ACCURACY_SNR_CAP       = 10;   // SNR beyond this aims no better

export function dodgeChance(entity){
  const mass = entity.totalMass || 0;
  return Math.max(0, (DODGE_REFERENCE_MASS - mass) / DODGE_REFERENCE_MASS) * MAX_DODGE_PERCENT;
}

export function stealthProfile(entity){
  const mass = entity.totalMass || 0;
  return Math.max(0, (STEALTH_REFERENCE_MASS - mass) / STEALTH_REFERENCE_MASS) * MAX_STEALTH_PERCENT;
}

// ==================== BLOOD SYSTEM CONSTANTS ====================
export const BLOOD_FRACTION         = 0.07;   // blood volume as fraction of total mass
export const SEEP_COEFF             = 0.02;   // bleed rate multiplier per kg connective tissue
export const BURST_COEFF            = 0.03;   // burst multiplier per bandwidth point severed
export const CLOT_RATE              = 0.05;   // clotting progress per turn (1.0 = fully clotted)
export const REGEN_FRACTION         = 0.002;  // blood regeneration per turn as fraction of max
export const BLOOD_DEATH_THRESHOLD  = 0.10;   // die at 10% blood remaining
export const STARVATION_BLOOD_FRACTION = 0.008; // PLACEHOLDER: blood lost per turn at fed 0 (turn-loop.js); ~110 turns from full
export const BLOOD_WEAKENED_THRESHOLD = 0.50; // speed/damage penalty begins
export const BLOOD_CRITICAL_THRESHOLD = 0.25; // severe penalty, AI flee trigger

// Compute the bleed penalty multiplier from current blood level.
// Returns 0, 0.10, 0.25, or 0.45 — applied as (1 - penalty) to speed and damage.
export function computeBleedPenalty(entity) {
  if (!entity.bloodMax || entity.bloodMax <= 0) return 0;
  const ratio = entity.blood / entity.bloodMax;
  if (ratio > 0.75) return 0;
  if (ratio > 0.50) return 0.10;
  if (ratio > 0.25) return 0.25;
  return 0.45;
}
