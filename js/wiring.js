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
         STRESS_RELEASE_AMOUNT, REACTIVE_HUNGER_THRESHOLD, DIET_DECISION_THRESHOLD } from './constants.js';

// How far each of the hub's wires raises its reflex when fully formed, in the
// reflex's own input units (threat confidence; vibration SNR for the bolt
// arcs), and how much of it a hare is born with (HUB_INNATE). The rest is
// formed by use (nodes.js). Fully formed, a calm hare's hub holding a flee
// (and so the freeze under it: three outputs on tissue for two) holds it to
// 2.3 threat: not against a wolf seen, felt and closing within pouncing range
// (2.7, more with its scent underfoot), and alarm lowers the flee's threshold
// under it. Written by hand; they stand for how many synapses the hub's fibres
// can make on each circuit.
const HUB_HOLD_FLEE = 1.2, HUB_HOLD_FREEZE = 1.0, HUB_HOLD_BOLT = 2.0, HUB_INNATE = 0.5;
const ALARM = { alarm: STRESS_NEURAL_SENSITIVITY };     // receptors: alarm chemistry lowers these thresholds
const CHANNEL = 1 / (CONFIDENCE_NORMALIZATION * 2);      // SNR → template evidence, per channel

// ── The hare (small grazer, Clade B) ──
// Fore-limbs: hair-trigger ground-vibration sensors with their own bolt arcs.
// Graze limbs: feel the ground too, and taste it. Torso: the threat template,
// the locomotion generator and the alarm gland. Head: eyes, and the food
// template. No integration tissue: nothing here holds anything past the action.
// Head: the hub, the node a player plays (below).
const HARE = {
  // The map: 8 bearings × 4 distance bands (touching, near, mid, far; edges
  // in tiles). Nothing in the hare holds a place: it has no tissue for it.
  map: { bands: [1.5, 4, 8] },
  nodes: [
    // Fore-limb ganglia: pass on their limb's footfall signal, and fire the
    // bolt arc when it spikes past threshold
    // The hub: the player's will enters the body here (Neural-Architecture-
    // Design, "The hub and the player"). An NPC hare carries the tissue with
    // nothing driving it. Its descending fibres run to the torso's flee and
    // freeze circuits (one hop, in time) and to the fore-limb bolt arcs (two
    // hops, after the arcs have fired: a bolt cannot be held, and practice
    // cannot change that). 3 g: tissue for two outputs at full strength.
    { id: 'hub', zone: 'head', mass: 0.003, mode: 'pooled',
      inputs: [{ from: 'intent:act' }], fn: 'step', threshold: 0, strict: true },

    { id: 'fore_relay_l', zone: 'fore_l', mass: 0.004, mode: 'mapped',
      inputs: [{ from: 'sense:fore_l.vibration.ground' }], fn: 'ramp' },
    { id: 'fore_relay_r', zone: 'fore_r', mass: 0.004, mode: 'mapped',
      inputs: [{ from: 'sense:fore_r.vibration.ground' }], fn: 'ramp' },
    { id: 'bolt_arc_l', zone: 'fore_l', mass: 0.004, mode: 'mapped',
      inputs: [{ from: 'sense:fore_l.vibration.ground' }], fn: 'pass',
      threshold: BASE_BOLT_THRESHOLD, receptors: ALARM, inhibitedBy: [{ node: 'hub', weight: HUB_HOLD_BOLT, innate: HUB_INNATE }] },
    { id: 'bolt_arc_r', zone: 'fore_r', mass: 0.004, mode: 'mapped',
      inputs: [{ from: 'sense:fore_r.vibration.ground' }], fn: 'pass',
      threshold: BASE_BOLT_THRESHOLD, receptors: ALARM, inhibitedBy: [{ node: 'hub', weight: HUB_HOLD_BOLT, innate: HUB_INNATE }] },
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
    // Wired in per distance band as a body's image falls off with distance:
    // full out to pouncing range, then about 3 / distance (band middles 6 and
    // 12 tiles). A shaleback grazing far off reads as little; one near as much.
    { id: 'threat', zone: 'torso', mass: 0.002, mode: 'mapped', bands: [1, 1, 0.5, 0.25],
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
      inputs: [{ from: 'node:threat_level' }], fn: 'step', threshold: BASE_FLEE_THRESHOLD, receptors: ALARM,
      inhibitedBy: [{ node: 'hub', weight: HUB_HOLD_FLEE, innate: HUB_INNATE }] },
    { id: 'freeze', zone: 'torso', mass: 0.001, mode: 'pooled',
      inputs: [{ from: 'node:threat_level' }], fn: 'step', threshold: BASE_FREEZE_THRESHOLD, receptors: ALARM,
      inhibitedBy: [{ node: 'hub', weight: HUB_HOLD_FREEZE, innate: HUB_INNATE }] },
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
  // The hub's drive reaches the generator weaker than the reflexes' (it wins
  // over foraging, loses to a bolt or a flee that fires), and freeze, which
  // holds the generator still, shuts it.
  outputs: [
    { effect: 'gland', hormone: 'alarm', node: 'alarm_gland', zone: 'torso', release: STRESS_RELEASE_AMOUNT },
    { effect: 'locomotion', label: 'bolt',   act: 'flee', node: 'bolt', zone: 'torso', intensity: 1.0, bearing: 'away' },
    { effect: 'locomotion', label: 'flee',   act: 'flee', node: 'flee', zone: 'torso', intensity: 1.0, bearing: 'away' },
    { effect: 'locomotion', label: 'deliberate', node: 'hub', zone: 'torso', intensity: 0.5,
      vetoedBy: ['freeze'] },
    { effect: 'locomotion', label: 'forage', act: 'forage_approach', node: 'food_ahead', zone: 'torso', intensity: 0.3, bearing: 'toward',
      vetoedBy: ['alert'] },
    { effect: 'posture',    label: 'freeze', act: 'hold',   node: 'freeze', zone: 'torso' },
    { effect: 'orienting',  label: 'alert',  act: 'orient', node: 'alert',  zone: 'head', bearing: 'toward' },
    // Standing on food, hungry: the graze limbs' contact feeding
    { effect: 'feeding',    label: 'graze',  act: 'graze', node: 'food_underfoot', zone: 'mid_graze_l', vetoedBy: ['alert'] },
  ],
};

// ── The pursuit predator (Clade A: the wolf, the ravager) ──
// Centralised and nose-led: nearly all of it sits in the head, and everything
// reaches the limbs through the torso, two hops away (Neural-Architecture-
// Design, "First application: the wolf"). Built for a body: `hub` and
// `integration` are its head's tissue for the hub and for holding the prey,
// `patterns` and `episodic` its pattern library and episodic store (kg, the
// body map's neuralAllocation); the rest is the same circuit. Head:
// the templates (prey, larger animal, rival, carrion, trail, air), the map
// with its integration tissue holding and leading the prey, the bite, and the
// hub. Torso: the locomotion generator's drives and the alarm gland.
// Everything its reactive rules did is here as tissue, or gone: no territory
// return (the wander's home pull stays), no cast when the air loses the prey,
// no retreat to refuge, no blood-level rule (pain raises alarm, and alarm
// lowers the retreat's threshold).
function pursuitPredator({ hub, integration, patterns, episodic }) { return {
  map: { bands: [1.5, 4, 8] },
  nodes: [
    // Memory (Neural-Architecture-Design, Memory): the pattern library holds
    // what struck it and that it was dangerous; the episodic store holds the
    // ground it has stood on (the detour plans through it, behaviors.js)
    { id: 'patterns', zone: 'head', mass: patterns, store: 'pattern' },
    { id: 'ground', zone: 'head', mass: episodic, store: 'route' },
    { id: 'walk', zone: 'head', mass: 0.002, mode: 'pooled', inputs: [], fn: 'step', threshold: 0,
      writes: { store: 'ground' } },
    // What it has learned is dangerous, on the map
    { id: 'known_danger', zone: 'head', mass: 0.005, mode: 'mapped',
      inputs: [{ from: 'memory:patterns.danger' }], fn: 'pass', threshold: 0, strict: true },

    // The hub (the wolf's: 30 g of the head's integration tissue, tissue for
    // twenty outputs at once). Its drive reaches the generator as strongly as any
    // reflex's (below), so the chase, the carrion, giving way and the trail
    // never take a played wolf's legs; only a retreat can (it is listed first,
    // and wins the tie), and the hub has a wire onto that, in time, half
    // formed. Playing a wolf is deliberate.
    { id: 'hub', zone: 'head', mass: hub, mode: 'pooled',
      inputs: [{ from: 'intent:act' }], fn: 'step', threshold: 0, strict: true },

    // Blood: hunger (the gut's hormone) and pain (felt through every zone)
    { id: 'hungry', zone: 'head', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'blood:hunger' }], fn: 'step', threshold: REACTIVE_HUNGER_THRESHOLD, strict: true },
    { id: 'hurt', zone: 'head', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'feature:pain' }], fn: 'step', threshold: 0, strict: true },

    // Identity: its own kind, and a known plant-eater (odour bound to it)
    { id: 'kin', zone: 'head', mass: 0.005, mode: 'mapped',
      inputs: [{ from: 'feature:recognisedKin' }], fn: 'step', threshold: 1 },
    { id: 'plant_eater', zone: 'head', mass: 0.005, mode: 'mapped',
      inputs: [{ from: 'feature:herbivoreDietConfidence' }], fn: 'step', threshold: DIET_DECISION_THRESHOLD, strict: true },

    // Prey: anything reading smaller, not its own kind, and not what it has
    // learned is dangerous (a known danger past half takes it off the list).
    // Wired in by band as an image falls off, so the nearest wins the map
    { id: 'prey', zone: 'head', mass: 0.01, mode: 'mapped', bands: [1, 0.9, 0.7, 0.5],
      inputs: [{ from: 'feature:sizeSmaller' }], vetoedBy: ['kin'], fn: 'step', threshold: 0.5,
      inhibitedBy: [{ node: 'known_danger', weight: 1 }] },
    // The integration tissue: holds where the prey was (mass × 30 turns: the
    // wolf's 0.15 kg, 4.5) and leads it along the velocity the eyes resolve
    { id: 'prey_place', zone: 'head', mass: integration, mode: 'mapped', holds: true, predicts: true,
      inputs: [{ from: 'node:prey' }], fn: 'pass', threshold: 0, strict: true },
    // Prey in reach of the jaw, hungry
    { id: 'prey_in_reach', zone: 'head', mass: 0.005, mode: 'mapped', bands: [1, 0, 0, 0],
      inputs: [{ from: 'node:prey' }], gate: ['hungry'], fn: 'step', threshold: 0, strict: true },
    // Something in contact while a blow lands: bite back
    { id: 'struck_by', zone: 'head', mass: 0.005, mode: 'mapped', bands: [1, 0, 0, 0],
      inputs: [{ from: 'feature:present' }], gate: ['hurt'], fn: 'step', threshold: 0, strict: true },
    { id: 'bite', zone: 'head', mass: 0.005, mode: 'pooled', combine: 'max',
      inputs: [{ from: 'node:prey_in_reach' }, { from: 'node:struck_by' }], fn: 'step', threshold: 0, strict: true },
    // Struck: what was in reach is written, and written as dangerous
    { id: 'mark_struck', zone: 'head', mass: 0.002, mode: 'mapped',
      inputs: [{ from: 'node:struck_by' }], fn: 'step', threshold: 0, strict: true, writes: { store: 'patterns' } },
    { id: 'mark_danger', zone: 'head', mass: 0.002, mode: 'mapped',
      inputs: [{ from: 'node:struck_by' }], fn: 'step', threshold: 0, strict: true,
      writes: { store: 'patterns', assoc: 'danger', amount: 0.25 } },

    // The larger-animal template: heavy against this body (nothing at 1.5×
    // its mass, full at 3.5×), or known to be dangerous, and alive to it
    // (moving, a meat-eater, or much larger), not its own kind; falling off
    // with distance
    { id: 'heavy', zone: 'head', mass: 0.005, mode: 'mapped',
      inputs: [{ from: 'feature:sizeRatio' }], fn: 'ramp', threshold: 1.5, gain: 0.5, ceiling: 1 },
    { id: 'alive_to', zone: 'head', mass: 0.005, mode: 'mapped', combine: 'max',
      inputs: [{ from: 'feature:moving' }, { from: 'feature:sizeMuchLarger' },
               { from: 'feature:predatorDietConfidence' }], fn: 'step', threshold: 0.3 },
    { id: 'threat', zone: 'head', mass: 0.01, mode: 'mapped', bands: [1, 0.6, 0.3, 0.1],
      inputs: [{ from: 'node:heavy' }, { from: 'node:known_danger' }], gate: ['alive_to'], vetoedBy: ['kin'], fn: 'ramp' },
    { id: 'threat_level', zone: 'head', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:threat' }], fn: 'ramp' },
    { id: 'wary', zone: 'head', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:threat_level' }], fn: 'step', threshold: 0.2, receptors: ALARM },

    // Rivals: its own size and not a known plant-eater, or its own kind,
    // near (out to 4 tiles)
    { id: 'rival', zone: 'head', mass: 0.005, mode: 'mapped', combine: 'max', bands: [1, 1, 0, 0],
      inputs: [{ from: 'feature:sizeSimilar' }, { from: 'feature:recognisedKin' }],
      vetoedBy: ['plant_eater'], fn: 'step', threshold: 1 },

    // Carrion, trail and air: the nose (head chemical processing)
    { id: 'carrion_here', zone: 'head', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'feature:corpseUnderfoot' }], gate: ['hungry'], fn: 'step', threshold: 1 },
    { id: 'carrion_near', zone: 'head', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'feature:corpseNear' }], gate: ['hungry'], fn: 'step', threshold: 1 },
    { id: 'trail', zone: 'head', mass: 0.01, mode: 'pooled',
      inputs: [{ from: 'feature:preyTrail' }], gate: ['hungry'], fn: 'step', threshold: 1 },
    { id: 'air', zone: 'head', mass: 0.01, mode: 'pooled',
      inputs: [{ from: 'feature:preyUpwind' }], gate: ['hungry'], fn: 'step', threshold: 1 },

    // Torso: the drives on the locomotion generator, a hop from the head
    { id: 'retreat', zone: 'torso', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:threat_level' }], fn: 'step', threshold: 0.8, receptors: ALARM,
      inhibitedBy: [{ node: 'hub', weight: 1.0, innate: 0.5 }] },
    { id: 'chase', zone: 'torso', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:prey_place' }], gate: ['hungry'], fn: 'step', threshold: 0, strict: true },
    { id: 'to_carrion', zone: 'torso', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:carrion_near' }], fn: 'step', threshold: 0, strict: true },
    { id: 'give_way', zone: 'torso', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:rival' }], fn: 'step', threshold: 0, strict: true },
    { id: 'track', zone: 'torso', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:trail' }], fn: 'step', threshold: 0, strict: true },
    { id: 'upwind', zone: 'torso', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:air' }], fn: 'step', threshold: 0, strict: true },
    // The alarm gland answers the retreat and pain
    { id: 'alarm_gland', zone: 'torso', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'node:retreat' }, { from: 'feature:pain' }], fn: 'step', threshold: 0, strict: true },
  ],

  // The bite goes first: it is decided in the head, a hop before the retreat
  // in the torso could shut it (the race), so a wolf with prey or an attacker
  // in its jaws bites. Then the strongest drive at the
  // generator: a retreat, the hub, the chase (ties to the earlier listed),
  // then carrion, giving way, the trail and the air
  outputs: [
    { effect: 'gland', hormone: 'alarm', node: 'alarm_gland', zone: 'torso', release: STRESS_RELEASE_AMOUNT },
    { effect: 'strike', label: 'bite', act: 'hunt_attack', node: 'bite', zone: 'head', bearing: 'toward' },
    { effect: 'locomotion', label: 'retreat', act: 'flee', node: 'retreat', zone: 'torso', intensity: 1.0, bearing: 'away' },
    { effect: 'locomotion', label: 'deliberate', node: 'hub', zone: 'torso', intensity: 1.0 },
    { effect: 'locomotion', label: 'chase', act: 'hunt_chase', node: 'chase', zone: 'torso', intensity: 1.0, bearing: 'toward' },
    { effect: 'locomotion', label: 'carrion', act: 'approach_corpse', node: 'to_carrion', zone: 'torso', intensity: 0.6, bearing: 'toward' },
    { effect: 'locomotion', label: 'give way', act: 'maintain_distance', node: 'give_way', zone: 'torso', intensity: 0.25, bearing: 'away' },
    { effect: 'locomotion', label: 'track', act: 'follow_trail', node: 'track', zone: 'torso', intensity: 0.25, bearing: 'toward' },
    { effect: 'locomotion', label: 'upwind', act: 'follow_scent', node: 'upwind', zone: 'torso', intensity: 0.25, bearing: 'toward' },
    { effect: 'orienting', label: 'wary', act: 'orient', node: 'wary', zone: 'head', bearing: 'toward' },
    { effect: 'feeding', label: 'eat', act: 'eat_corpse', node: 'carrion_here', zone: 'head', vetoedBy: ['wary'] },
  ],
}; }

// The wolf (prowler, meso-predator): 0.85 kg of neural tissue in the head,
// 0.15 of it integration, 0.05 pattern library, 0.18 episodic memory
const WOLF = pursuitPredator({ hub: 0.03, integration: 0.15, patterns: 0.05, episodic: 0.18 });
// The ravager (apex predator): the same plan at four times the mass, 1.26 kg
// of neural tissue in the head, 0.20 of it integration (it holds a lost prey
// six turns). Its hub is 40 g. What it reads as prey is what reads smaller
// against its body: wolves too.
const DIRE_WOLF = pursuitPredator({ hub: 0.04, integration: 0.20, patterns: 0.06, episodic: 0.26 });

// ── The lurker (ambush predator, Clade B) ──
// Distributed and ground-led: its sensor limbs (vibration.ground 5, most of
// their tissue processing it) are local minds that read what walks near and
// decide the strike themselves (Cognition-Design, local processing). Its
// generator is held still by a tonic node in the torso, the listening posture:
// its own footfalls would deafen the limbs it hunts with (the old rule's
// "movement compromises sense", as tissue). Nothing drives it to approach:
// what comes into reach is struck; a heavy animal alive to it sends it home.
// Its hub is 10 g of the head's 50 g of integration.
function _lurkerSensor(side) {
  const z = 'sensor_' + side;
  return [
    // The limb's own template: something its size or smaller, not its kind,
    // felt through this limb, in reach of the strike (the touching band)
    { id: 'feel_' + side, zone: z, mass: 0.01, mode: 'mapped',
      inputs: [{ from: `sense:${z}.vibration.ground` }], fn: 'step', threshold: 1 },
    { id: 'kin_' + side, zone: z, mass: 0.005, mode: 'mapped',
      inputs: [{ from: 'feature:recognisedKin' }], fn: 'step', threshold: 1 },
    { id: 'prey_' + side, zone: z, mass: 0.02, mode: 'mapped', bands: [1, 0, 0, 0],
      inputs: [{ from: 'feature:sizeSmallerOrSimilar' }], gate: ['feel_' + side, 'hungry'],
      vetoedBy: ['kin_' + side], fn: 'step', threshold: 1 },
    // Struck while something is in reach: strike back at it
    { id: 'struck_' + side, zone: z, mass: 0.005, mode: 'mapped', bands: [1, 0, 0, 0],
      inputs: [{ from: 'feature:present' }], gate: ['hurt'], fn: 'step', threshold: 0, strict: true },
    { id: 'strike_' + side, zone: z, mass: 0.005, mode: 'pooled', combine: 'max',
      inputs: [{ from: 'node:prey_' + side }, { from: 'node:struck_' + side }], fn: 'step', threshold: 0, strict: true },
    // Carrion under it: the limb's contact chemistry
    { id: 'carrion_' + side, zone: z, mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'feature:corpseUnderfoot' }], gate: ['hungry'], fn: 'step', threshold: 1 },
  ];
}
const LURKER = {
  map: { bands: [1.5, 4, 8] },
  nodes: [
    { id: 'hub', zone: 'head', mass: 0.01, mode: 'pooled',
      inputs: [{ from: 'intent:act' }], fn: 'step', threshold: 0, strict: true },
    // Blood: the receptors are in every limb's tissue; these are the torso's
    { id: 'hungry', zone: 'torso', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'blood:hunger' }], fn: 'step', threshold: REACTIVE_HUNGER_THRESHOLD, strict: true },
    { id: 'hurt', zone: 'torso', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'feature:pain' }], fn: 'step', threshold: 0, strict: true },
    ..._lurkerSensor('l'),
    ..._lurkerSensor('r'),
    // Torso: the larger-animal template (as the wolf's), the listening
    // posture, the retreat and the alarm gland
    { id: 'kin', zone: 'torso', mass: 0.005, mode: 'mapped',
      inputs: [{ from: 'feature:recognisedKin' }], fn: 'step', threshold: 1 },
    { id: 'heavy', zone: 'torso', mass: 0.005, mode: 'mapped',
      inputs: [{ from: 'feature:sizeRatio' }], fn: 'ramp', threshold: 1.5, gain: 0.5, ceiling: 1 },
    { id: 'alive_to', zone: 'torso', mass: 0.005, mode: 'mapped', combine: 'max',
      inputs: [{ from: 'feature:moving' }, { from: 'feature:sizeMuchLarger' },
               { from: 'feature:predatorDietConfidence' }], fn: 'step', threshold: 0.3 },
    { id: 'threat', zone: 'torso', mass: 0.01, mode: 'mapped', bands: [1, 0.6, 0.3, 0.1],
      inputs: [{ from: 'node:heavy' }], gate: ['alive_to'], vetoedBy: ['kin'], fn: 'ramp' },
    { id: 'threat_level', zone: 'torso', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:threat' }], fn: 'ramp' },
    { id: 'retreat', zone: 'torso', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:threat_level' }], fn: 'step', threshold: 0.8, receptors: ALARM,
      inhibitedBy: [{ node: 'hub', weight: 1.0, innate: 0.5 }] },
    // Tonic: fires with no input, and holds the generator still
    { id: 'listen', zone: 'torso', mass: 0.005, mode: 'pooled', inputs: [], fn: 'step', threshold: 0 },
    { id: 'alarm_gland', zone: 'torso', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'node:retreat' }, { from: 'feature:pain' }], fn: 'step', threshold: 0, strict: true },
  ],
  // The strike arcs first (either limb); then the generator: a retreat home,
  // or the hub; failing both, the listening posture holds it still
  outputs: [
    { effect: 'gland', hormone: 'alarm', node: 'alarm_gland', zone: 'torso', release: STRESS_RELEASE_AMOUNT },
    { effect: 'strike', label: 'strike', act: 'hunt_attack', node: 'strike_l', zone: 'sensor_l', bearing: 'toward' },
    { effect: 'strike', label: 'strike', act: 'hunt_attack', node: 'strike_r', zone: 'sensor_r', bearing: 'toward' },
    { effect: 'locomotion', label: 'retreat', act: 'flee_home', node: 'retreat', zone: 'torso', intensity: 1.0, bearing: 'away' },
    { effect: 'locomotion', label: 'deliberate', node: 'hub', zone: 'torso', intensity: 1.0 },
    { effect: 'posture', label: 'listen', act: 'hold', node: 'listen', zone: 'torso' },
    { effect: 'feeding', label: 'eat', act: 'eat_corpse', node: 'carrion_l', zone: 'sensor_l' },
    { effect: 'feeding', label: 'eat', act: 'eat_corpse', node: 'carrion_r', zone: 'sensor_r' },
  ],
};

// ── The shaleback (wading grazer, Clade A) ──
// Centralised like the wolf, 200 kg, and nothing on the ground reads heavier
// than it. Head: the food template, the larger-animal template (it rarely
// fires: little is), a nose for meat-eaters on the air, and the hub. Front
// limbs: contact chemistry (grazing), and the shove. Torso: the drives and
// the alarm gland. Water is its refuge: its retreat runs there.
const SHALEBACK = {
  map: { bands: [1.5, 4, 8] },
  nodes: [
    { id: 'hub', zone: 'head', mass: 0.02, mode: 'pooled',
      inputs: [{ from: 'intent:act' }], fn: 'step', threshold: 0, strict: true },
    { id: 'hungry', zone: 'head', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'blood:hunger' }], fn: 'step', threshold: REACTIVE_HUNGER_THRESHOLD, strict: true },
    { id: 'hurt', zone: 'head', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'feature:pain' }], fn: 'step', threshold: 0, strict: true },
    { id: 'kin', zone: 'head', mass: 0.005, mode: 'mapped',
      inputs: [{ from: 'feature:recognisedKin' }], fn: 'step', threshold: 1 },
    // Larger animal (as the wolf's)
    { id: 'heavy', zone: 'head', mass: 0.005, mode: 'mapped',
      inputs: [{ from: 'feature:sizeRatio' }], fn: 'ramp', threshold: 1.5, gain: 0.5, ceiling: 1 },
    { id: 'alive_to', zone: 'head', mass: 0.005, mode: 'mapped', combine: 'max',
      inputs: [{ from: 'feature:moving' }, { from: 'feature:sizeMuchLarger' },
               { from: 'feature:predatorDietConfidence' }], fn: 'step', threshold: 0.3 },
    { id: 'threat', zone: 'head', mass: 0.01, mode: 'mapped', bands: [1, 0.6, 0.3, 0.1],
      inputs: [{ from: 'node:heavy' }], gate: ['alive_to'], vetoedBy: ['kin'], fn: 'ramp' },
    { id: 'threat_level', zone: 'head', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:threat' }], fn: 'ramp' },
    { id: 'wary', zone: 'head', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:threat_level' }], fn: 'step', threshold: 0.2, receptors: ALARM },
    // A meat-eater on the air: stop feeding, and face the wind (or hold
    // still, with no bearing)
    { id: 'meat_air', zone: 'head', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'feature:meatOnAir' }], fn: 'step', threshold: 1 },
    { id: 'meat_wind', zone: 'head', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'feature:meatUpwind' }], fn: 'step', threshold: 1 },
    // Food: the head's template, gated by hunger
    { id: 'food_ahead', zone: 'head', mass: 0.01, mode: 'pooled',
      inputs: [{ from: 'feature:foodNear' }], gate: ['hungry'], fn: 'step', threshold: 1 },
    { id: 'food_underfoot', zone: 'front_l', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'feature:foodUnderfoot' }], gate: ['hungry'], fn: 'step', threshold: 1 },
    // Struck while something is in reach: shove it (front limbs)
    { id: 'struck_by', zone: 'head', mass: 0.005, mode: 'mapped', bands: [1, 0, 0, 0],
      inputs: [{ from: 'feature:present' }], gate: ['hurt'], fn: 'step', threshold: 0, strict: true },
    { id: 'shove', zone: 'head', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:struck_by' }], fn: 'step', threshold: 0, strict: true },
    // Torso: the retreat to water, and the alarm gland
    { id: 'retreat', zone: 'torso', mass: 0.005, mode: 'pooled',
      inputs: [{ from: 'node:threat_level' }], fn: 'step', threshold: 0.8, receptors: ALARM,
      inhibitedBy: [{ node: 'hub', weight: 1.0, innate: 0.5 }] },
    { id: 'alarm_gland', zone: 'torso', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'node:retreat' }, { from: 'feature:pain' }], fn: 'step', threshold: 0, strict: true },
  ],
  outputs: [
    { effect: 'gland', hormone: 'alarm', node: 'alarm_gland', zone: 'torso', release: STRESS_RELEASE_AMOUNT },
    { effect: 'strike', label: 'shove', act: 'retaliate', node: 'shove', zone: 'front_l', bearing: 'toward' },
    { effect: 'locomotion', label: 'retreat', act: 'flee_water', node: 'retreat', zone: 'torso', intensity: 1.0, bearing: 'away' },
    { effect: 'locomotion', label: 'deliberate', node: 'hub', zone: 'torso', intensity: 1.0 },
    { effect: 'locomotion', label: 'forage', act: 'forage_approach', node: 'food_ahead', zone: 'torso', intensity: 0.3,
      bearing: 'toward', vetoedBy: ['wary', 'meat_air'] },
    { effect: 'feeding', label: 'graze', act: 'graze', node: 'food_underfoot', zone: 'front_l', vetoedBy: ['wary', 'meat_air'] },
    { effect: 'posture', label: 'still', act: 'hold', node: 'meat_air', zone: 'torso', vetoedBy: ['meat_wind'] },
    { effect: 'orienting', label: 'wary', act: 'orient', node: 'wary', zone: 'head', bearing: 'toward' },
    { effect: 'orienting', label: 'wind', act: 'orient', node: 'meat_wind', zone: 'head', bearing: 'toward' },
  ],
};

// ── The chemotroph colony (Clade B) ──
// A handful of grams of neural tissue spread through seven zones, a
// ganglion in each; the central body reads the ground through all of them.
// A footfall felt anywhere on it (not its own kind's) moves it away; hungry,
// it grazes where it stands or creeps to food near. (The old colony
// synchrony is gone; nothing here stands in for it.)
const COLONY_ZONES = ['head', 'central_body', 'front_sensory', 'second_limbs', 'rear_limbs_a', 'rear_limbs_b', 'integument'];
const COLONY = {
  map: { bands: [1.5, 4, 8] },
  nodes: [
    { id: 'felt', zone: 'central_body', mass: 0.002, mode: 'mapped', combine: 'max', bands: [1, 1, 0, 0],
      inputs: COLONY_ZONES.map(z => ({ from: `sense:${z}.vibration.ground` })), fn: 'step', threshold: 1 },
    { id: 'kin', zone: 'central_body', mass: 0.001, mode: 'mapped',
      inputs: [{ from: 'feature:recognisedKin' }], fn: 'step', threshold: 1 },
    { id: 'tremor', zone: 'central_body', mass: 0.001, mode: 'mapped',
      inputs: [{ from: 'node:felt' }], vetoedBy: ['kin'], fn: 'step', threshold: 1 },
    { id: 'withdraw', zone: 'central_body', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'node:tremor' }], fn: 'step', threshold: 0, strict: true },
    { id: 'hungry', zone: 'central_body', mass: 0.001, mode: 'pooled',
      inputs: [{ from: 'blood:hunger' }], fn: 'step', threshold: REACTIVE_HUNGER_THRESHOLD, strict: true },
    { id: 'food_ahead', zone: 'head', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'feature:foodNear' }], gate: ['hungry'], fn: 'step', threshold: 1 },
    { id: 'food_underfoot', zone: 'front_sensory', mass: 0.002, mode: 'pooled',
      inputs: [{ from: 'feature:foodUnderfoot' }], gate: ['hungry'], fn: 'step', threshold: 1 },
  ],
  outputs: [
    { effect: 'locomotion', label: 'withdraw', act: 'flee', node: 'withdraw', zone: 'central_body', intensity: 1.0, bearing: 'away' },
    { effect: 'locomotion', label: 'forage', act: 'forage_approach', node: 'food_ahead', zone: 'central_body', intensity: 0.3, bearing: 'toward' },
    { effect: 'feeding', label: 'graze', act: 'graze', node: 'food_underfoot', zone: 'front_sensory' },
  ],
};

const CREATURE_WIRING = { hare: HARE, wolf: WOLF, dire_wolf: DIRE_WOLF, ambush_pred: LURKER,
                          cave_crab: SHALEBACK, mushroom: COLONY };

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
