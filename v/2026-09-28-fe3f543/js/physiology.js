// ==================== PHYSIOLOGY ====================
// Body physics functions: power-to-weight computation, bleed processing,
// substrate depletion/regeneration, stress chemistry, zone healing.
// Split from enemy-ai.js — these are tissue physics, not AI.

import { getBodyMap, computeBleedPenalty, getPathways,
         checkNeuralDeath, hasLocomotion, checkSenseLoss, BURST_COEFF,
         SEEP_COEFF, CLOT_RATE, REGEN_FRACTION, BLOOD_DEATH_THRESHOLD,
         SUBSTRATE_DEPLETION_HIGH, SUBSTRATE_DEPLETION_MOD,
         SUBSTRATE_REGEN_BASE, CIRC_REGEN_EFF_CLOSED, CIRC_REGEN_EFF_OPEN, CIRC_REGEN_EFF_HYBRID,
         VASCULARITY_MIN, REGEN_UPREGULATION,
         FAST_TWITCH_RECRUIT_THRESHOLD, WALK_INTENSITY,
         CIRC_EFFICIENCY_CLOSED, CIRC_EFFICIENCY_OPEN, CIRC_EFFICIENCY_HYBRID,
         SPECIES_TEMPLATES,
         STRESS_RELEASE_AMOUNT, STRESS_CLEARANCE_BASE, STRESS_MAX,
         HEAL_BASE_RATE, HEAL_REST_MULTIPLIER } from './constants.js';
import { log, LOG_CATEGORIES } from './log.js';

/** Locomotion muscle / total mass — physics-derived power-to-weight ratio.
 *  Used by the speed system so player and NPCs of the same species are at parity.
 *  Only locomotion-tagged zones contribute muscle — head and torso muscle
 *  generates force for biting and twisting, not running. */
/**
 * Compute locomotion power-to-weight ratio from tissue state.
 * Each locomotion zone contributes force based on its fiber composition
 * and current substrate level. Speed is total locomotion force / total mass.
 *
 * If the creature has no fiberRatio data (not yet annotated), falls back
 * to static locomotion muscle / total mass.
 *
 * @param {object} entity — creature or player
 * @param {number} [intensity] — movement intensity (0-1). Sets how much of the
 *   locomotion muscle the motor neurons recruit (Motor-System-Design, How Tissue
 *   Responds; step 4). Slow-contracting units come first, by the size principle:
 *   below WALK_INTENSITY only that fraction of them fire, so a creep at 0.1
 *   produces 40% of a walk's force and covers ground at 40% of the pace. At a walk
 *   the whole slow pool is working. At or above FAST_TWITCH_RECRUIT_THRESHOLD the
 *   fast-contracting fibres add their force, in proportion to their substrate.
 *   null/undefined/0: the body is not moving; the rate returned is its walk, the
 *   rate the action economy (turn-loop.js) runs a standing body at. PLACEHOLDER
 *   until the action-point system (Motor-System-Design step 10) separates acting
 *   from locomoting.
 *   NPC callers pass getMovementIntensity(creature) so the same body under NPC
 *   and player control produces the same force-to-weight at the same intensity.
 */
function getBodyPTW(entity, intensity) {
  const bodyMap = getBodyMap(entity);
  if (!bodyMap) return 1;   // no body map: neutral power-to-weight

  let totalMass = 0;
  let totalLocoForce = 0;
  let hasFiberData = false;

  // Determine circulatory efficiency
  const circEff = _getCirculatoryEfficiency(entity);

  // Share of the slow-contracting pool the activation reaches
  const slowRecruited = (intensity == null || intensity <= 0)
    ? 1 : Math.min(1, intensity / WALK_INTENSITY);

  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    totalMass += zone.mass || 0;

    if (zone.locomotion && zone.muscle > 0) {
      if (zone.fiberRatio != null) {
        hasFiberData = true;
        const fastMass = zone.muscle * zone.fiberRatio;
        const slowMass = zone.muscle * (1 - zone.fiberRatio);

        // Slow-twitch: the recruited share of the aerobic pool
        const slowForce = slowMass * circEff * slowRecruited;

        // Fast-twitch only contributes when recruited (intensity above threshold)
        let fastForce = 0;
        if (intensity != null && intensity >= FAST_TWITCH_RECRUIT_THRESHOLD) {
          const substrateFraction = (zone.substrateMax > 0)
            ? (zone.substrate || 0) / zone.substrateMax : 0;
          fastForce = fastMass * substrateFraction;
        }
        // intensity < threshold (or not given) → fast-twitch not recruited →
        // fastForce stays 0. (An old NPC-only branch counted fast-twitch force
        // whenever intensity was omitted, making NPCs ~1.5× faster than the
        // same body walking under player control.)

        totalLocoForce += fastForce + slowForce;
      } else {
        // No fiber data — static fallback (locomotion muscle as-is)
        totalLocoForce += zone.muscle * slowRecruited;
      }
    }
  }

  if (totalMass <= 0) return 1;

  // If no zones had fiber data, fall back to static ratio
  if (!hasFiberData) return totalLocoForce / totalMass;

  return totalLocoForce / totalMass;
}

/** Get circulatory efficiency for an entity based on its circulationType. */
function _getCirculatoryEfficiency(entity) {
  const circType = entity.circulationType;
  if (circType === 'closed') return CIRC_EFFICIENCY_CLOSED;
  if (circType === 'open') return CIRC_EFFICIENCY_OPEN;
  if (circType === 'hybrid') return CIRC_EFFICIENCY_HYBRID;
  // Default: check species template
  if (entity.species) {
    const template = SPECIES_TEMPLATES[entity.species];
    if (template && template.circulationType) {
      return _getCirculatoryEfficiency({ circulationType: template.circulationType });
    }
  }
  return CIRC_EFFICIENCY_CLOSED; // safe default
}

/** Get circulatory efficiency for substrate regeneration (nutrient delivery at rest).
 *  Separate from _getCirculatoryEfficiency which governs aerobic force output.
 *  Open circulation is less penalized at rest because hemolymph bathing tissue
 *  directly is adequate for slow, steady nutrient uptake. */
function _getCirculatoryRegenEfficiency(entity) {
  const circType = entity.circulationType;
  if (circType === 'closed') return CIRC_REGEN_EFF_CLOSED;
  if (circType === 'open')   return CIRC_REGEN_EFF_OPEN;
  if (circType === 'hybrid') return CIRC_REGEN_EFF_HYBRID;
  if (entity.species) {
    const template = SPECIES_TEMPLATES[entity.species];
    if (template && template.circulationType) {
      return _getCirculatoryRegenEfficiency({ circulationType: template.circulationType });
    }
  }
  return CIRC_REGEN_EFF_CLOSED;
}

/**
 * Deplete substrate from locomotion zones based on movement intensity.
 * High intensity (flee, chase): fast-contracting fibers fully recruited.
 * Moderate intensity (wander, forage, maintain_distance): partial recruitment.
 * No depletion for hold, rest, orient, or if creature didn't move.
 */
/**
 * Movement intensity (0-1) of a creature's last action. The player's is the
 * gait it was driven at (player-actions.js). Ganglion creatures
 * report it directly. Reactive-rule creatures are read from their behaviour
 * label — a PLACEHOLDER for the motor layer (Motor-System-Design steps 3-5),
 * which will carry intensity on the pathway itself. One reading, used by
 * force-to-weight, substrate depletion and substrate regeneration alike.
 */
function getMovementIntensity(creature) {
  if (creature.isPlayer) return creature._lastMovementIntensity ?? WALK_INTENSITY;
  if (creature._lastGanglionIntensity != null) return creature._lastGanglionIntensity;
  const behavior = creature.currentBehavior;
  if (behavior === 'flee' || behavior === 'flee_refuge' || behavior === 'hunt') return 1.0;
  if (behavior === 'wander' || behavior === 'forage' || behavior === 'maintain_distance' ||
      behavior === 'track' || behavior === 'follow_trail') return WALK_INTENSITY;
  return 0;
}

function _depleteLocomotionSubstrate(creature) {
  if (!creature.movedThisTurn) return;

  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return;

  const intensityFactor = getMovementIntensity(creature);
  if (intensityFactor <= 0) return;

  // Fast-twitch fibers only recruit above a minimum intensity.
  // Below this threshold, locomotion is fully aerobic — slow-twitch only, zero substrate cost.
  if (intensityFactor < FAST_TWITCH_RECRUIT_THRESHOLD) return;

  const excessIntensity = intensityFactor - FAST_TWITCH_RECRUIT_THRESHOLD;

  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    if (!zone.locomotion) continue;
    if (zone.fiberRatio == null) continue;

    const fastMass = zone.muscle * zone.fiberRatio;
    const cost = fastMass * excessIntensity * SUBSTRATE_DEPLETION_HIGH;
    zone.substrate = Math.max(0, (zone.substrate || 0) - cost);
  }
}

/**
 * Regenerate substrate on all zones that are at low activity.
 * Regen rate is proportional to the zone's slow-contracting mass
 * (which houses the aerobic regeneration machinery) and circulatory efficiency.
 *
 * Locomotion zones that were used at high intensity this turn do NOT regenerate.
 * All other zones with substrate below max regenerate.
 *
 * @param {object} creature
 * @param {number} [ticks=1] — world-time elapsed; scales regen proportionally.
 */
/**
 * Regenerate substrate on all zones that are at low activity.
 * 
 * Regen rate scales with:
 *   - total muscle mass (enzymatic capacity — every cell has glycogen synthase)
 *   - circulatory regen efficiency (nutrient delivery at rest)
 *   - vascularity factor (capillary density, correlated with oxidative fiber content)
 *   - depletion boost (enzymatic upregulation when stores are low — front-loaded curve)
 *
 * Locomotion zones that were used at high intensity this turn do NOT regenerate.
 * All other zones with substrate below max regenerate.
 *
 * @param {object} creature
 * @param {number} [ticks=1] — world-time elapsed; scales regen proportionally.
 */
function _regenerateSubstrate(creature, ticks) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return;

  const circRegenEff = _getCirculatoryRegenEfficiency(creature);
  const timeScale = ticks || 1.0;

  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    if (zone.fiberRatio == null) continue;
    if (zone.substrateMax == null || zone.substrateMax <= 0) continue;
    if (zone.substrate >= zone.substrateMax) continue; // already full

    // Only block locomotion-zone regen when movement intensity was high enough
    // to recruit fast-twitch fibers. Below the threshold the system is fully
    // aerobic — regen proceeds as if the zone were at rest.
    if (zone.locomotion && creature.movedThisTurn) {
      if (getMovementIntensity(creature) >= FAST_TWITCH_RECRUIT_THRESHOLD) continue;
    }

    // Vascularity: oxidative fibers correlate with capillary density.
    // Pure fast-twitch zones have fewer capillaries (reduced nutrient delivery).
    const vascularityFactor = VASCULARITY_MIN + (1.0 - VASCULARITY_MIN) * (1.0 - zone.fiberRatio);

    // Enzymatic upregulation: glycogen synthase is more active when stores are low.
    // Produces a front-loaded recovery curve — rapid initial refill, long tail to full.
    const substrateFraction = (zone.substrate || 0) / zone.substrateMax;
    const depletionBoost = 1.0 + REGEN_UPREGULATION * (1.0 - substrateFraction);

    const regen = zone.muscle * SUBSTRATE_REGEN_BASE * circRegenEff * vascularityFactor * depletionBoost * timeScale;
    zone.substrate = Math.min(zone.substrateMax, (zone.substrate || 0) + regen);
  }
}

// ==================== BLOOD SYSTEM — PER-TURN PROCESSING ====================
// Runs once per turn for each creature (player or monster).
// Handles wound seep, blood regeneration, clotting, and blood death.
// Returns true if the creature died from blood loss.

function processBleed(creature, isPlayer) {
  if (creature.blood == null || creature.bloodMax == null || creature.bloodMax <= 0) return false;
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return false;

  const prevBloodRatio = creature.blood / creature.bloodMax;

  // 1. Seep from wounded zones (below 50% HP, not destroyed)
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    if (zone.hp == null || zone.maxHp == null) continue;
    if (zone.hp < zone.maxHp * 0.5) {
      const damageFraction = 1 - (zone.hp / zone.maxHp);
      const connective = zone.connective || 0;
      const clotting = zone.clotting || 0;
      const seep = connective * SEEP_COEFF * damageFraction * (1 - clotting);
      creature.blood -= seep;
      // Advance clotting (only if no new damage — clotting is reset on hit in combat.js)
      zone.clotting = Math.min((zone.clotting || 0) + CLOT_RATE, 1.0);
    }
  }

  // 2. Regeneration. A body with an empty food reserve makes no new blood
  //    (the player's `fed`; NPC hunger is a separate placeholder and never gates this).
  if (!(creature.fed != null && creature.fed <= 0)) {
    creature.blood = Math.min(creature.blood + creature.bloodMax * REGEN_FRACTION, creature.bloodMax);
  }

  // 3. Clamp
  creature.blood = Math.max(creature.blood, 0);

  // 4. Compute bleed penalty
  creature.bleedPenalty = computeBleedPenalty(creature);

  const newBloodRatio = creature.blood / creature.bloodMax;

  // 5. Player threshold-crossing log messages
  if (isPlayer) {
    if (prevBloodRatio >= 0.75 && newBloodRatio < 0.75) {
      log('Blood seeps from your wounds.', 'warn');
    }
    if (prevBloodRatio >= 0.50 && newBloodRatio < 0.50) {
      log('You feel lightheaded. Blood runs freely.', 'warn');
    }
    if (prevBloodRatio >= 0.25 && newBloodRatio < 0.25) {
      log('Your vision darkens at the edges. You\'re losing too much blood.', 'crit');
    }

    // Clotting feedback (player only)
    const woundedZones = bodyMap.filter(z => !z.destroyed && z.hp != null && z.maxHp != null && z.hp < z.maxHp * 0.5);
    if (woundedZones.length > 0) {
      const allNearlyClotted = woundedZones.every(z => (z.clotting || 0) > 0.8);
      const allFullyClotted = woundedZones.every(z => (z.clotting || 0) >= 1.0);
      if (allFullyClotted && newBloodRatio < 1.0 && !creature._bleedClotMsg) {
        log('The bleeding has stopped, but you feel drained.', 'muted');
        creature._bleedClotMsg = true;
      } else if (allNearlyClotted && !allFullyClotted && !creature._bleedClosingMsg) {
        log('Your wounds are closing.', 'muted');
        creature._bleedClosingMsg = true;
      }
      // Reset flags if new wounds open
      if (!allNearlyClotted) {
        creature._bleedClosingMsg = false;
        creature._bleedClotMsg = false;
      }
    }
  }

  // 6. Check death
  if (creature.blood <= creature.bloodMax * BLOOD_DEATH_THRESHOLD) {
    if (isPlayer) {
      log('Everything narrows. Fades. Goes still.', 'dead');
    } else {
      log(`The ${creature.name} collapses. Its wounds finally emptied it.`, 'dead');
    }
    creature.deathCause = 'blood';
    return true; // caller handles death
  }

  return false;
}

// ==================== ZONE HEALING — PER-TURN PROCESSING (Prompt J) ====================
// Wounded zones slowly recover HP each turn, gated by blood availability.
// Resting creatures heal 3× faster. Destroyed zones (0 HP) do not heal.

function getHealingRate(creature) {
  if (creature.blood == null || creature.bloodMax == null || creature.bloodMax <= 0) return 0;
  const bloodFraction = creature.blood / creature.bloodMax;

  // No healing below 50% blood
  if (bloodFraction <= 0.50) return 0;

  // Healing scales linearly from 50% to 100% blood
  const bloodScalar = (bloodFraction - 0.50) / 0.50;  // 0.0 at 50%, 1.0 at 100%
  let rate = HEAL_BASE_RATE * bloodScalar;

  // Resting creatures heal faster
  if (creature.currentBehavior === 'rest') {
    rate *= HEAL_REST_MULTIPLIER;
  }

  return rate;
}

function applyHealing(creature) {
  const rate = getHealingRate(creature);
  if (rate <= 0) return;

  const bodyMap = creature.bodyMap;
  if (!bodyMap) return;

  for (const zone of bodyMap) {
    // Skip destroyed zones — no healing at 0 HP
    if (zone.hp <= 0) continue;

    // Skip fully healed zones
    if (zone.hp >= zone.maxHp) continue;

    // Apply healing
    zone.hp = Math.min(zone.maxHp, zone.hp + rate);
  }
}

// ==================== STRESS CHEMISTRY (Hare Vertical Slice) ====================

/**
 * Update stress chemical level — RELEASE portion only.
 * Called per creature action (inside runCreatureAI).
 * Release: triggered by ganglion threat detection (flagged during processing).
 */
function _releaseStressChemistry(creature) {
  // Released only when the threat ganglion fires (flee) or the bolt reflex
  // fires. Freeze and alert release nothing (Endocrine-Design). A per-action
  // "mild" release on alert used to ratchet stress to STRESS_MAX under any
  // steady sub-threshold stimulus, since clearance runs once per input.
  if (creature._ganglionTriggeredStress === true) {
    creature.stressLevel = Math.min(
      STRESS_MAX,
      (creature.stressLevel || 0) + STRESS_RELEASE_AMOUNT
    );
  }
  // Clear the trigger flag
  creature._ganglionTriggeredStress = false;
}

/**
 * Clear stress chemicals — time-scaled, called once per player input.
 * Clearance is gated by circulatory efficiency and scales with world-time elapsed.
 * @param {object} creature
 * @param {number} ticksElapsed — world-time that passed this player input.
 */
function _clearStressChemistry(creature, ticksElapsed) {
  const circEff = _getCirculatoryEfficiency(creature);
  creature.stressLevel = Math.max(
    0,
    (creature.stressLevel || 0) - STRESS_CLEARANCE_BASE * circEff * (ticksElapsed || 1.0)
  );
}


// ==================== MASS-DEPENDENT ACCELERATION (Speed Overhaul) ====================

/**
 * Turns needed to reach full stride from rest.
 * Smaller animals have shorter muscle fibers that cycle faster and lower inertia.
 * 5 kg → 1 turn, 22 kg → 2 turns, 90 kg → 3 turns, 200 kg → 4 turns.
 */
function turnsToFullSpeed(totalMass) {
  return Math.max(1, Math.ceil(Math.log(totalMass / 3) / Math.log(4)));
}

/**
 * Compute total body mass from surviving zones.
 * Used by acceleration and turning cost systems.
 */
function getEntityTotalMass(entity) {
  const bodyMap = getBodyMap(entity);
  if (!bodyMap) return entity.totalMass || 10;
  let total = 0;
  for (const zone of bodyMap) {
    if (!zone.destroyed) total += zone.mass || 0;
  }
  return total;
}

/**
 * Apply turning cost to a creature's momentum when it changes facing.
 * Heavier creatures lose more speed on direction changes.
 * @param {object} creature — entity with _consecutiveMoveTurns
 * @param {number} facingStepsChanged — 0-4 (number of 45° increments turned)
 */
function applyTurningCost(creature, facingStepsChanged) {
  if (!creature._consecutiveMoveTurns || creature._consecutiveMoveTurns <= 0) return;
  if (facingStepsChanged === 0) return;

  const totalMass = getEntityTotalMass(creature);
  // Heavier creatures lose more momentum on turns
  // 1 facing step (45°) = minor correction, 4 steps (180°) = full reversal
  const massScalar = Math.max(0, 1.0 - (totalMass / 200)); // 0 at 200kg, 1 at 0kg
  const retained = Math.max(0, 1.0 - (facingStepsChanged / 4) * (1 - massScalar));
  // Keep the fraction. Flooring turned a 3% momentum cost at 1 consecutive
  // move into a full reset, so any turn cost a whole acceleration turn.
  creature._consecutiveMoveTurns = creature._consecutiveMoveTurns * retained;
}

// ==================== ZONE DAMAGE — THE ONE RESOLVER ====================
/**
 * Apply damage to one zone of an entity and resolve every physical
 * consequence in one place: clotting torn open, zone destruction, the
 * zone's blood share dumped plus a severance burst through its pathways,
 * death (vital → neural → blood, first met is the cause), immobilization
 * when the last locomotion zone goes, attack loss and sense loss.
 *
 * Every strike in the game comes through here — player on creature,
 * creature on player, creature on creature — so the death rules exist once.
 * (There used to be three copies, and the creature-on-creature one had no
 * sense-loss or attack-loss consequences at all.)
 *
 * On death sets entity.hp = 0 (the alive flag the turn loop reads) and
 * entity.deathCause. Corpses and the player's death screen are the
 * caller's business. Messages are second person for the player, third
 * person otherwise; pass { quiet: true } for fights the player is not part
 * of (the caller logs the kill itself).
 *
 * @returns {{ destroyed: boolean, died: boolean, cause: string|null }}
 */
function applyZoneDamage(entity, hitZone, dmg, opts = {}) {
  const result = { destroyed: false, died: false, cause: null };
  // The entity's own body map only: getBodyMap falls back to the shared
  // template for anything without one, and damage must never land there.
  const bodyMap = entity.bodyMap;
  if (!hitZone || !bodyMap || hitZone.hp == null) return result;

  const isPlayer = !!entity.isPlayer;
  const name = entity.name || 'creature';
  const poss = isPlayer ? 'Your' : `${name}'s`;
  const say = (msg) => { if (!opts.quiet) log(msg, LOG_CATEGORIES.COMBAT); };

  hitZone.hp = Math.max(0, hitZone.hp - Math.round(dmg));
  // New damage tears open any clotting progress
  if (hitZone.clotting > 0) hitZone.clotting = 0;
  if (hitZone.hp > 0 || hitZone.destroyed) return result;

  // ── Zone newly destroyed ──
  hitZone.hp = 0;
  hitZone.destroyed = true;
  result.destroyed = true;
  say(`${poss} ${hitZone.name} is destroyed.`);

  // Blood: the zone's share is lost, and every pathway through it bursts
  if (entity.blood != null && entity.bloodMax > 0) {
    let severedBandwidth = 0;
    for (const pw of getPathways(entity)) {
      if (pw.from === hitZone.key || pw.to === hitZone.key) severedBandwidth += pw.bandwidth;
    }
    entity.blood -= (hitZone.bloodShare || 0) + severedBandwidth * BURST_COEFF * entity.bloodMax;
    entity.blood = Math.max(0, entity.blood);
    entity.bleedPenalty = computeBleedPenalty(entity);
  }

  const die = (cause, msg) => {
    entity.deathCause = cause;
    entity.hp = 0;
    result.died = true;
    result.cause = cause;
    say(msg);
    return result;
  };

  // Death checks — first condition met is the cause
  if (hitZone.vital) {
    return die('vital', isPlayer
      ? 'Something vital tears loose inside you. Everything stops.'
      : `The ${name}'s body gives out. It collapses.`);
  }
  if (checkNeuralDeath(bodyMap)) {
    const head = hitZone.key === 'head';
    return die('neural', isPlayer
      ? (head ? 'A flash of nothing. Then nothing.' : 'Your limbs stop answering. The world blurs. Silence.')
      : (head ? `The ${name}'s body seizes and falls. It does not get up.`
              : `The ${name} shudders, limbs twitching without coordination. It goes still.`));
  }
  if (entity.blood != null && entity.blood <= entity.bloodMax * BLOOD_DEATH_THRESHOLD) {
    return die('blood', isPlayer
      ? 'Everything narrows. Fades. Goes still.'
      : `The ${name} collapses. Its wounds finally emptied it.`);
  }

  // Survived the destruction: what the body can no longer do
  if (hitZone.locomotion && !hasLocomotion(bodyMap)) {
    entity.immobilized = true;
    say(isPlayer ? 'You collapse, unable to move.' : `${name} collapses, unable to move.`);
  }
  for (const atk of (hitZone.attacks || [])) say(`${poss} ${atk.name} is gone.`);
  for (const sl of checkSenseLoss(bodyMap, hitZone)) {
    if (sl.type === 'lost') say(isPlayer ? `You can no longer ${sl.verb}.` : `${name} can no longer ${sl.verb}.`);
    else                    say(`${poss} ${sl.sense} weakens.`);
  }
  return result;
}

// ==================== EXPORTS ====================
export { getBodyPTW, applyZoneDamage, getMovementIntensity, _getCirculatoryEfficiency, _getCirculatoryRegenEfficiency,
         _depleteLocomotionSubstrate, _regenerateSubstrate,
         processBleed, getHealingRate, applyHealing,
         _releaseStressChemistry, _clearStressChemistry,
         turnsToFullSpeed, getEntityTotalMass, applyTurningCost };
