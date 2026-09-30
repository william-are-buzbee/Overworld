// ==================== WIRING — EACH SPECIES' NERVOUS SYSTEM ====================
// The nodes each species is built with, where they sit and what they are wired
// to (Neural-Architecture-Design). Run by nodes.js. A creature without a
// wiring here still runs the reactive rules (cognition.js), a placeholder
// retired creature by creature.
//
// Numbers: thresholds and channel scales are the constants the hare's
// ganglion slice used (constants.js, "Ganglion system"); masses are shares of
// each zone's neural tissue in the body map and must fit inside it
// (nodes.js validateWiring).

import { SPECIES_TEMPLATES,
         BASE_BOLT_THRESHOLD, BASE_FLEE_THRESHOLD, BASE_FREEZE_THRESHOLD, BASE_ALERT_THRESHOLD,
         STRESS_NEURAL_SENSITIVITY, CONFIDENCE_NORMALIZATION,
         THREAT_CONF_CHANNEL_CAP, THREAT_CONF_SIZE_MUCH_LARGER, THREAT_CONF_SIZE_LARGER,
         THREAT_CONF_SIZE_AMBIGUOUS, LOOM_WINDOW_ACTIONS, HUNGER_THRESHOLD,
         STRESS_RELEASE_AMOUNT } from './constants.js';

const ALARM = { alarm: STRESS_NEURAL_SENSITIVITY };     // receptors: alarm chemistry lowers these thresholds
const CHANNEL = 1 / (CONFIDENCE_NORMALIZATION * 2);      // SNR → template evidence, per channel

// ── The hare (small grazer, Clade B) ──
// Fore-limbs: hair-trigger ground-vibration sensors with their own bolt arcs.
// Graze limbs: feel the ground too, and taste it. Torso: the threat template,
// the locomotion generator and the alarm gland. Head: eyes, and the food
// template. No integration tissue: nothing here holds anything past the action.
const HARE = {
  nodes: [
    // Fore-limb ganglia: pass on their limb's footfall signal, and fire the
    // bolt arc when it spikes past threshold
    { id: 'fore_relay_l', zone: 'fore_l', mass: 0.004, mode: 'mapped',
      inputs: [{ from: 'sense:fore_l.vibration.ground' }], fn: 'ramp' },
    { id: 'fore_relay_r', zone: 'fore_r', mass: 0.004, mode: 'mapped',
      inputs: [{ from: 'sense:fore_r.vibration.ground' }], fn: 'ramp' },
    { id: 'bolt_arc_l', zone: 'fore_l', mass: 0.004, mode: 'mapped',
      inputs: [{ from: 'sense:fore_l.vibration.ground' }], fn: 'pass',
      threshold: BASE_BOLT_THRESHOLD, receptors: ALARM },
    { id: 'bolt_arc_r', zone: 'fore_r', mass: 0.004, mode: 'mapped',
      inputs: [{ from: 'sense:fore_r.vibration.ground' }], fn: 'pass',
      threshold: BASE_BOLT_THRESHOLD, receptors: ALARM },
    // Graze-limb ganglia: pass on their ground vibration; read meat-eater
    // volatiles underfoot through their contact chemistry
    { id: 'graze_relay_l', zone: 'mid_graze_l', mass: 0.003, mode: 'mapped',
      inputs: [{ from: 'sense:mid_graze_l.vibration.ground' }], fn: 'ramp' },
    { id: 'graze_relay_r', zone: 'mid_graze_r', mass: 0.003, mode: 'mapped',
      inputs: [{ from: 'sense:mid_graze_r.vibration.ground' }], fn: 'ramp' },
    { id: 'meat_taste_l', zone: 'mid_graze_l', mass: 0.003, mode: 'pooled',
      inputs: [{ from: 'feature:meatUnderfoot@mid_graze_l' }], fn: 'ramp' },
    { id: 'meat_taste_r', zone: 'mid_graze_r', mass: 0.003, mode: 'pooled',
      inputs: [{ from: 'feature:meatUnderfoot@mid_graze_r' }], fn: 'ramp' },

    // Torso: the threat template. "Heavy rhythmic footfall + large moving
    // shape + looming", nothing for what reads small, hare-sized or as a hare.
    { id: 'low_threat', zone: 'torso', mass: 0.001, mode: 'mapped',
      inputs: [{ from: 'feature:sizeSmallerOrSimilar' }, { from: 'feature:recognisedKin' }],
      fn: 'step', threshold: 1 },
    { id: 'bolt', zone: 'torso', mass: 0.001, mode: 'mapped', combine: 'max',
      inputs: [{ from: 'node:bolt_arc_l' }, { from: 'node:bolt_arc_r' }],
      vetoedBy: ['low_threat'], fn: 'ramp' },
    { id: 'felt', zone: 'torso', mass: 0.001, mode: 'mapped', combine: 'max',
      inputs: [{ from: 'node:fore_relay_l' }, { from: 'node:fore_relay_r' },
               { from: 'node:graze_relay_l' }, { from: 'node:graze_relay_r' }],
      fn: 'ramp' },
    { id: 'felt_evidence', zone: 'torso', mass: 0.001, mode: 'mapped',
      inputs: [{ from: 'node:felt', weight: CHANNEL }], fn: 'ramp', ceiling: THREAT_CONF_CHANNEL_CAP },
    { id: 'seen_evidence', zone: 'torso', mass: 0.001, mode: 'mapped',
      inputs: [{ from: 'sense:head.visual', weight: CHANNEL }], fn: 'ramp', ceiling: THREAT_CONF_CHANNEL_CAP },
    { id: 'seen', zone: 'torso', mass: 0.0005, mode: 'mapped',
      inputs: [{ from: 'sense:head.visual' }], fn: 'step', threshold: 0, strict: true },
    { id: 'sensed', zone: 'torso', mass: 0.0005, mode: 'mapped',
      inputs: [{ from: 'node:felt' }, { from: 'sense:head.visual' }], fn: 'step', threshold: 0, strict: true },
    // Looming: a seen body closing on the hare, full at contact, nothing once
    // contact is more than LOOM_WINDOW_ACTIONS of its own actions away
    { id: 'loom', zone: 'torso', mass: 0.001, mode: 'mapped',
      inputs: [{ from: 'feature:contactActions', weight: -1 / LOOM_WINDOW_ACTIONS }], gate: ['seen'],
      fn: 'ramp', threshold: -1, gain: THREAT_CONF_CHANNEL_CAP, ceiling: THREAT_CONF_CHANNEL_CAP },
    // How heavy the source reads against this body: nothing at its own mass,
    // full at three times it
    { id: 'heavy', zone: 'torso', mass: 0.001, mode: 'mapped',
      inputs: [{ from: 'feature:sizeRatio' }], fn: 'ramp', threshold: 1, gain: 0.5, ceiling: 1 },
    { id: 'heavy_evidence', zone: 'torso', mass: 0.001, mode: 'mapped',
      inputs: [{ from: 'node:felt_evidence' }, { from: 'node:seen_evidence' }, { from: 'node:loom' }],
      gate: ['heavy'], fn: 'ramp' },
    { id: 'meat_eater', zone: 'torso', mass: 0.0005, mode: 'mapped',
      inputs: [{ from: 'feature:predatorDietConfidence' }], fn: 'step', threshold: 0.3, strict: true, gain: 0.3 },
    { id: 'threat', zone: 'torso', mass: 0.002, mode: 'mapped',
      inputs: [{ from: 'node:heavy_evidence' },
               { from: 'feature:sizeMuchLarger', weight: THREAT_CONF_SIZE_MUCH_LARGER },
               { from: 'feature:sizeLarger', weight: THREAT_CONF_SIZE_LARGER },
               { from: 'feature:sizeAmbiguous', weight: THREAT_CONF_SIZE_AMBIGUOUS },
               { from: 'node:meat_eater' }],
      gate: ['sensed'], vetoedBy: ['low_threat'], fn: 'ramp' },
    // Meat-eater volatiles underfoot, read against the hare's own deposit:
    // nothing at its own level, the channel cap at three times it
    { id: 'meat_underfoot', zone: 'torso', mass: 0.001, mode: 'pooled', combine: 'max',
      inputs: [{ from: 'node:meat_taste_l' }, { from: 'node:meat_taste_r' }],
      fn: 'ramp', threshold: 1, gain: THREAT_CONF_CHANNEL_CAP / 2, ceiling: THREAT_CONF_CHANNEL_CAP },
    // The strongest threat on the map, plus what the feet taste
    { id: 'threat_level', zone: 'torso', mass: 0.001, mode: 'pooled',
      inputs: [{ from: 'node:threat' }, { from: 'node:meat_underfoot' }], fn: 'ramp' },
    { id: 'flee', zone: 'torso', mass: 0.001, mode: 'pooled',
      inputs: [{ from: 'node:threat_level' }], fn: 'step', threshold: BASE_FLEE_THRESHOLD, receptors: ALARM },
    { id: 'freeze', zone: 'torso', mass: 0.001, mode: 'pooled',
      inputs: [{ from: 'node:threat_level' }], fn: 'step', threshold: BASE_FREEZE_THRESHOLD, receptors: ALARM },
    { id: 'alert', zone: 'torso', mass: 0.001, mode: 'pooled',
      inputs: [{ from: 'node:threat_level' }], fn: 'step', threshold: BASE_ALERT_THRESHOLD, receptors: ALARM },
    // The alarm gland answers the bolt, the flee circuit and pain; not freeze
    // or alert (Endocrine-Design)
    { id: 'alarm_gland', zone: 'torso', mass: 0.001, mode: 'pooled',
      inputs: [{ from: 'node:bolt' }, { from: 'node:flee' }, { from: 'feature:pain' }],
      fn: 'step', threshold: 0, strict: true },

    // Head: food. The template's gain rides on hunger: receptors for the
    // gut's hunger hormone in the blood
    { id: 'hungry', zone: 'head', mass: 0.001, mode: 'pooled',
      inputs: [{ from: 'blood:hunger' }], fn: 'step', threshold: HUNGER_THRESHOLD, strict: true },
    { id: 'food_ahead', zone: 'head', mass: 0.004, mode: 'pooled',
      inputs: [{ from: 'feature:foodNear' }], gate: ['hungry'], fn: 'step', threshold: 1 },
    { id: 'food_underfoot', zone: 'head', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'feature:foodUnderfoot' }], gate: ['hungry'], fn: 'step', threshold: 1 },
  ],

  // Where the firing lands. Locomotion: the central generator in the torso
  // drives the four locomotion limbs; the strongest drive reaching it wins.
  // Alert inhibits the food drive there (and freeze is always above alert).
  outputs: [
    { effect: 'gland', hormone: 'alarm', node: 'alarm_gland', zone: 'torso', release: STRESS_RELEASE_AMOUNT },
    { effect: 'locomotion', label: 'bolt',   node: 'bolt',       zone: 'torso', intensity: 1.0, bearing: 'away' },
    { effect: 'locomotion', label: 'flee',   node: 'flee',       zone: 'torso', intensity: 1.0, bearing: 'away' },
    { effect: 'locomotion', label: 'forage', node: 'food_ahead', zone: 'torso', intensity: 0.3, bearing: 'toward',
      vetoedBy: ['alert'] },
    { effect: 'posture',    label: 'freeze', node: 'freeze',     zone: 'torso' },
    { effect: 'orienting',  label: 'alert',  node: 'alert',      zone: 'head', bearing: 'toward' },
    // Standing on food, hungry: the graze limbs' contact feeding
    { effect: 'feeding',    label: 'forage', node: 'food_underfoot', zone: 'mid_graze_l', vetoedBy: ['alert'] },
  ],
};

const CREATURE_WIRING = { hare: HARE };

/** A creature's wiring (the player's through its species' creature), or null
 *  for one still on the reactive rules. */
function getWiring(entity) {
  if (entity.isPlayer) {
    const t = entity.species && SPECIES_TEMPLATES[entity.species];
    return t ? (CREATURE_WIRING[t.creatureKey] || null) : null;
  }
  return entity.key ? (CREATURE_WIRING[entity.key] || null) : null;
}

export { CREATURE_WIRING, getWiring };
