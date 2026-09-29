# Neural Architecture Design — Structure Types

How a nervous system is built in the body map: the small set of structure types every creature's nervous system is assembled
from, what each one physically does, and what an animal gains from it. The theory is in Cognition-Design (layers, override,
memory), the motor side in Motor-System-Design (pathways, activation parameters, reflex / template / integration levels),
the senses in Sensory-Design, the chemistry in Endocrine-Design. This document is the parts list those are built from.

Include it alongside Design-Principles and Cognition-Design when designing or converting any creature's nervous system.

**Status (Sep 2026): draft for discussion with the person.** Nothing here is implemented beyond what the hare already has
(its `CREATURE_NEURAL` entry, `cognition.js processGanglionSystem`). The structure list in "The Structure Types" is the
load-bearing decision; the rest follows from it.

---

## Principle: Pipes and Pumps

There are very many ways to build a mind. Cephalopods and mammals reached comparable intelligence with no shared ancestor
that had any; similar parts arranged differently mean different things. So the code must not hold per-species behaviour. It
holds a few structure types, and a species is a wiring of them: which structures exist, in which zones, with how much
tissue, fed by which transducers and which other structures, driving which effectors, able to suppress which others.
Convergent behaviour then comes for free: two unrelated wirings that do the same job produce the same observable result.

Every structure, whatever its type:

- **lives in a zone** and dies with it (the hare already works this way: `_livingArchitecture`);
- **has neural mass**, taken from that zone's `neural` × the matching `neuralAllocation`; mass is its capacity (how many
  templates it holds, how many objects it keeps, how many independent outputs it times);
- **has wired inputs**: named transducers (`fore_l.vibration.ground`, `head.visual`) or other structures' outputs
  (`fore_ganglion_l.processed`); it hears nothing else;
- **has wired outputs**: effector zones, or other structures;
- may **suppress or modulate** named others, and only those (edges, below).

The test for any structure is the one in Design-Principles: point to it in the body map, destroy its zone and the behaviour it
produces stops, and a reader of the wiring can predict the behaviour without the code.

---

## What Flows Between Structures

- **Readings**: what a transducer delivers, per zone and channel (SNR and the features that channel resolves at that SNR,
  Sensory-Design). Already carried as `detectionInfo.zoneSNR` and the percept.
- **Matches**: a template matcher's output: which template, how confident (the margin over the runner-up), for which source.
- **Objects**: an integration workspace's held representation of one thing: where, what, how sure, since when, moving how.
  Traces (perception pass 8) are the first version.
- **Activation**: intensity, duration, pattern, down motor pathways to effector zones (Motor-System-Design). No named
  programs.
- **Suppression and modulation**: a signal that lowers another structure's output or scales its intensity.
- **Chemistry**: hormones, broadcast through the blood, shifting thresholds everywhere at once (Endocrine-Design). Not a
  wiring edge; every structure with receptors reads it.

**Timing is anatomy.** A short path acts before a long one. A reflex arc fires on the action its input arrives; a signal
that has to reach a hub, be held, compared and sent back arrives later, so the hub can only suppress what has not already
fired. The current override formula approximates this race (Cognition-Design, "The Physical Basis of Override").

---

## The Structure Types

Six structure types and one kind of link. The first five are in the hare's wiring already; memory and endocrine tissue are designed (Cognition-Design, Endocrine-Design) but not built.

### 1. Reflex arc (local ganglion)

One or a few inputs, one threshold, one fixed output. It does not compare anything. The hare's fore-limb ganglia (ground
vibration spike → bolt) and graze ganglia (edible contact → chew) are this. Cheap, fast, local: the first thing to fire and
the last thing to die, since each limb carries its own.

*Gains the animal:* speed. It acts before anything can think.

### 2. Template matcher (pattern library)

Compares an input's features against stored templates and outputs the best match and its confidence. This is the pattern
library, physically: templates are stored in the tissue of the zone that holds them, and how many it can hold is its mass ×
`patternLibrary` allocation. Destroy the zone and the templates are gone. The hare's `threat_classification` and
`food_identification` regions are this, and so is pass 7's identification (`detection.js _identify`), which matches mass,
limb count, brightness and volatile mix against one wired template per species.

A template is a point in the feature space of the channel(s) the matcher is wired to, with a tolerance. Matching is
distance in that space; confidence is the margin between the best and the second-best template (so look-alikes collide at
the margin, as decided for perception honesty). What each channel can offer as features:

| channel | features it resolves as SNR rises |
|---|---|
| ground vibration | footfall cadence and weight, limb count from the cadence, gait (walk / bolt), direction |
| air vibration | rhythm, size of the source, wingbeat or breath |
| vision | outline and size, limb count from the silhouette, brightness, motion across and toward, looming |
| airborne chemistry | volatile mix (diet, species, wound, condition), freshness, upwind bearing |
| contact chemistry | edible or not, meat-eater traces underfoot |

**Wired or learned.** Wired (crystallized) templates are fixed at birth: evolution put them there. Learned templates are
added and reshaped by experience, and need memory (type 6). All current templates are wired.

**Stacked patterns.** A matcher's inputs can be other matchers' outputs. That is how larger patterns are built without a
new mechanism: a multimodal package (this smell + this footfall = hare), a scene (this clearing looks as it did, or does
not), a sequence (freeze, then bolt). Each level costs tissue, which gives each species a natural ceiling.

*Gains the animal:* recognition: knowing what a signal is, not only that it is there.

### 3. Pattern generator (coordinating center)

Produces activation (intensity, duration, pattern) for a set of effector zones, and times them against each other
(Motor-System-Design "Coordinating Centers"). Its tissue limits how many independent outputs it can time: the hare's
0.01 kg `central_loco` has two patterns, all-at-once and alternating. There are no verbs in it. A handful of generator
kinds covers the repertoire:

| generator | what varying its parameters produces |
|---|---|
| rhythmic locomotion | creep, walk, trot, sprint (intensity); swim, climb (the substrate the limbs meet) |
| burst | leap, pounce, lunge, bolt from standing (all locomotion zones at once, one pulse) |
| orienting | turning head or body toward a source; sniffing is orienting plus breathing |
| strike / grasp | bite, claw, kick, hook (a pulse to one zone); hold (sustained) |
| posture | rest, crouch, brace, freeze (sustained low activation, or none) |

Build a basic version of each, apply it to every creature, then give clades their differences: ancestral Clade A times its
limbs from one central generator fed by the head; ancestral Clade B lets each limb run its own and coordinates loosely
(Cognition-Design, clade notes). Whether a creature can do something at all is whether it has a generator wired to zones
that can do it.

*Gains the animal:* coordinated movement. Without one, muscle is inert.

### 4. Integration workspace

Holds a few objects over time and works on them. Its capacity is mass × `integration` allocation (the existing
`integrationCapacity`). Integration is not one thing; each of its functions has to earn its place by what the animal does
differently with it:

| function | what it is | what the animal does with it | status |
|---|---|---|---|
| corroboration | two channels on one source raise confidence | commits on weaker single-channel evidence when two agree | partly (best-channel confidence) |
| binding | features from different channels tied to one object | knows this smell is that shape | pass 6b-2 (odour bound to a seen animal) |
| holding | an object kept after the senses lose it | goes to where the prey was; flees from where the threat was | pass 8 (traces, evidence summation) |
| prediction | where a moving object will be | runs to where the prey is going, not where it is (intercept) | new: the wolf's first |
| arbitration | holds a lower structure's output down, or scales it | does not bolt at a harmless shape; sets a hunt's pace | override (a formula standing in for the signal race) |
| comparison | self against other | declines fights it would lose | fight assessment (`assessFightOutcome`) |

Corroboration is the "accuracy" view of integration and it is real, but for a pursuit predator the larger gains are in time:
holding and prediction. A workspace too small for a function simply lacks it; the lurker's 0.014 holds almost nothing.

*Gains the animal:* context: acting on more than this instant's strongest input.

### 5. Suppression and modulation links

Not a structure: edges between structures. `canSuppress` lowers a named structure's output; `canModulate` scales its
intensity. They are physical inhibitory pathways: without one, the upper structure cannot touch the lower one, and the
lower one fires whatever the upper one "thinks" (why startled animals bolt at shadows). The hare's threat region can
suppress its bolt arcs; its workspace can modulate its locomotion.

### 6. Memory index (episodic)

Links activations of patterns in the order they happened: time as a highway. A cue (a smell, a place) matches a stored
fragment; the index reactivates what came with it and what came after. Replaying forward is prediction from experience
("last time this smell was on this bank, a hare came out of that thicket"). Clade A indexes centrally (the head's
`episodicMemory`, total amnesia if the head goes); ancestral Clade B remembers in its limbs' pattern libraries, loosely and
robustly (Cognition-Design, Memory Architecture). Learned templates (type 2) need it.

*Gains the animal:* a past to act on. Deferred: after the wolf's wiring works on wired templates.

### 7. Endocrine tissue

Releases hormones on neural command; the blood carries them; every structure with receptors shifts its thresholds
(Endocrine-Design). This is where drives live: hunger, alarm, rest are concentrations, not variables on the animal. It is
listed here so the wiring can say which structures command a release and which read which hormone.

---

## Where Today's Code Sits

| in the code | type | note |
|---|---|---|
| hare `fore_ganglion_*`, `graze_ganglion_*` | 1 reflex arc | as designed |
| hare `threat_classification`, `food_identification` | 2 template matcher | wired templates |
| `detection.js _identify` (pass 7) | 2 template matcher | wired, one per species; not yet housed in a structure |
| hare `central_loco` | 3 pattern generator | two patterns |
| hare `integration_workspace`, traces, binding, evidence summation | 4 workspace | holding, binding, corroboration |
| `canSuppress`, `canModulate` | 5 links | hare only |
| `evaluateReactiveRules` | 2 + 3, as a placeholder | universal templates wired to generators, written as code. Retired creature by creature |
| `canOverrideReactive`, `deliberativeEvaluation` | 4 arbitration | formula for the signal race; the drive comparison inside is endocrine (type 7) standing in |
| `getMovementIntensity` by behaviour label | 3, as a placeholder | intensity should come from the generator |
| `ai-utils.js stepRoundObstacles` | 6, as a placeholder | route memory; searches the true ground |
| drives (`creature.drives`) | 7, as a placeholder | Endocrine-Design |

---

## The Player

The player is the integration layer. Reflex arcs and wired templates in the player's body fire on their own, as in any
creature's: a grazer body bolts when its forelimbs feel a heavy footfall, whatever the player intended. The player's
actions are what a workspace would send down: they can only use generators the body has, wired to zones that survive. A
hotbar of the body's generators (and, later, learned patterns) is the natural interface: the keys are the body's motor
repertoire, read from its wiring. How far a player's intent can suppress its own reflexes is set by the same suppression
links as for anything else.

---

## First Application: the Wolf

The prowler's nervous system from its body map:

| zone | neural (kg) | allocation |
|---|---|---|
| head | 0.85 | chemical processing 0.25, episodic memory 0.18, integration 0.15, visual processing 0.10, motor coordination 0.08, pattern library 0.05, threat assessment 0.04 |
| torso | 0.22 | motor relay 0.12, chemical processing 0.05, pattern library 0.05 |
| front limbs | 0.05 each | motor control 0.04, chemical processing 0.01 |
| mid and rear limbs | 0.04 each | motor control 0.04 |

Pathways: head → torso (bandwidth 0.9), torso → each limb (0.5–0.7). A centralized, nose-led, Clade A body: most of its
mind is in its head, and everything reaches the limbs through the torso.

A draft wiring, to be settled before code:

| structure | type | zone | wired from | drives / effect |
|---|---|---|---|---|
| odour matcher | 2 | head (chemical processing, pattern library) | head airborne and contact chemistry | prey / carrion / predator / kin odour, with upwind bearing |
| shape and motion matcher | 2 | head (visual processing, pattern library) | head eyes | outline, size, limb count, motion |
| threat matcher | 2 | head (threat assessment) | the two matchers above | larger predator, larger animal closing |
| workspace | 4 | head (integration) | all matchers, traces | corroboration, binding, holding, prediction, arbitration, comparison |
| gait generator | 3 | torso (motor relay), timed from head (motor coordination) | workspace, threat matcher | rhythmic locomotion and burst to all six limbs |
| orienting generator | 3 | head | odour matcher, workspace | head and body toward a source; sniffing |
| bite generator | 3 | head | workspace, contact | a strike pulse to the jaw |
| claw generators | 3 | front limbs (motor control) | workspace via torso | strike pulses to each foreleg |
| limb withdrawal arcs | 1 | each limb | that limb's contact / pain | pull the limb in |
| trail reader | 2 | front limbs + torso (chemical processing) | contact chemistry underfoot | the trail's fresher end |
| memory index | 6 | head (episodic memory) | the workspace | deferred |

What the wolf's reactive rules become:

| rule | becomes |
|---|---|
| 1–2 damage responses | limb withdrawal arcs, threat matcher, workspace arbitration |
| 3–4 threats near and adjacent | threat matcher → gait generator (away) or orienting; workspace can hold it down |
| 4B competitor spacing | threat matcher on kin odour + orienting |
| 5–6 prey adjacent and near | odour / shape matchers → workspace → gait and strike generators |
| 6A where the prey was | workspace holding |
| 6B–6C trail, plume | trail reader, odour matcher → orienting and gait |
| 7–9 territory, rest, default | endocrine (rest) and the gait generator's resting state |

Prediction, the wolf's new function: the eyes already resolve a seen body's velocity across and along the line of sight
(perception pass 4). The workspace holds that velocity on the object and sends the gait generator toward where the object
will be after the steps it takes to get there, rather than where it is. Its reach is limited by how long the workspace holds
the object and how well the eyes resolve the motion; a nose-only percept gives no velocity and so no prediction.

---

## Implementation Sequence

One pass per pull request.

1. This document, settled with the person.
2. A generic structure runner: the types above as code, read from a creature's wiring. Port the hare onto it with no
   behaviour change (harness tallies identical).
3. The wolf's wiring on the runner. Its reactive rules retired (the other predators keep them until their turns).
4. Prediction in the wolf's workspace.
5. Later: memory index and learned templates; the other predators and the shaleback; endocrine drives replacing
   `creature.drives`; the player's generators on a hotbar.

The harness (`tools/ecology.mjs`) checks each step for regressions and for systems not doing what their doc says. It does not
set targets for the ecology.

---

## Open Questions (the person's)

- Is this the right list of types? In particular: is prediction a workspace function, or its own structure?
- One pattern library per zone per channel (the hare's per-limb libraries), or one per matcher (the wolf's head library)?
  Both are physical; the first suits Clade B, the second Clade A.
- How much can a player's intent suppress its body's reflexes?
- Hunger, alarm and rest become endocrine (type 7) when? Before or after the wolf?

## What NOT to Change

- Per-species behaviour code. A species is a wiring.
- Named motor programs. Generators take intensity, duration and pattern.
- Structures without a zone, or with capacity not drawn from that zone's neural tissue.
