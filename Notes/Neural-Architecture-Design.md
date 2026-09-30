# Neural Architecture Design — Nodes and Circuits

How a nervous system is built in the body map: one physical unit, the node, wired into circuits. A creature's behaviour is
read off its wiring. The theory is in Cognition-Design (layers, override, memory), the motor side in Motor-System-Design
(pathways, activation parameters), the senses in Sensory-Design, the chemistry in Endocrine-Design. This document is the
parts list and the ways parts are put together.

Include it alongside Design-Principles and Cognition-Design when designing or converting any creature's nervous system.

**Status (Sep 2026): settled in discussion with the person. Step 2 is in:** `nodes.js` runs a species' wiring, `wiring.js`
holds it, and the hare runs on it (its old `CREATURE_NEURAL` structure list and the bespoke ganglion code in cognition.js are
gone). What is built so far: nodes (step, ramp and pass firing; sum or max; gates; vetoes), mapped and pooled evaluation, a
pooled node reading a map takes its strongest place, blood chemistry shifting thresholds (the stress receptor), hop timing
for inhibition (worked out per species; a late veto is inert), and the output stage (locomotion, posture, orienting, feeding,
gland). Not yet: persistence and maps (step 4), plastic weights (memory), generators built from nodes (the output stage
stands in for them: the strongest drive reaching the locomotion generator wins). Inspect with `window.debugWiring('hare')`
(the wiring, checked against the body) and `window.debugNodes()` (what fired on each creature's last action).

---

## Principle: Physical First

There are very many ways to build a mind. Cephalopods and mammals reached comparable intelligence with no shared ancestor
that had any; similar parts arranged differently mean different things. So the code holds no per-species behaviour and no
cognitive concepts. There is no "object", no "decision", no "arbitration" in it. There is tissue, wired. What we call
recognising a predator is a node crossing its threshold; what we call deciding not to flee is a negative weight arriving
before the bolt fires; what we call remembering is a node that was written and still exists.

A species is a wiring: which nodes exist, in which zones, with how much tissue, fed by what, driving what. An animal can be
highly reactive in an intelligent way and know almost nothing about its world: many well-weighted nodes, almost none that
persist. Another can hold a map, remember, predict. Both are the same parts.

The test is the one in Design-Principles: point to the node, destroy its zone and what it did stops, and a reader of the
wiring can predict the behaviour without the code.

---

## The Node

The one neural unit. A node is a population of cells in one zone doing one physical thing: summing what arrives and firing
if the sum crosses its threshold. Not a neuron; a lump of tissue with one job.

| property | what it is physically |
|---|---|
| **zone** | where the tissue is. Destroy the zone and the node is gone. |
| **mass** | kg of neural tissue, drawn from that zone's `neural` × the relevant `neuralAllocation`. The zone's allocation must cover all its nodes. |
| **inputs** | wired sources, each with a **weight**: transducer features (`fore_l.vibration.ground.cadence`) or other nodes. A negative weight is inhibition. |
| **threshold** | how much summed input it takes to fire. |
| **gain** | how hard it fires once past threshold (its output level). |
| **persistence** | how long it keeps firing after its input stops, in actions. Zero for most tissue (a simple node fires while stimulated and stops). Non-zero only for tissue built to hold activity (recurrent wiring), and it costs mass. |
| **mode** | **mapped**: evaluated per source, laid out by bearing, and its output carries that bearing ("away from *there*"). **Pooled**: sums over everything sensed ("how threatening is it around here"). |
| **outputs** | other nodes, effector zones (activation: intensity, duration), or the blood (a hormone). |
| **plastic** | whether its weights, or the node itself, can be written by experience (Memory, below). Most nodes are not. |

Hormones reach every node with receptors for them and shift its threshold and gain (Endocrine-Design). That is the only
non-wired influence.

### What else is physical but not a node

- **Transducers**: already in the body map; they deliver features per zone and channel at some SNR (Sensory-Design).
- **Pathways**: the wires between zones, with bandwidth (how much gets through) and length in hops. **Timing is anatomy**:
  a signal crossing more hops arrives later, so a short circuit acts before a long one can inhibit it. This replaces the
  override formula's approximation of the signal race.
- **Effectors**: muscle zones, which respond to activation as Motor-System-Design and Muscle-Fiber-Design describe.
- **Blood**: carries hormones; its circulation sets how fast (Endocrine-Design, Circulatory-Immune-Design).

### Evaluation

Each action, signals flow from transducers through the wiring in hop order. A node fires when its weighted input (plus
whatever its persistence still carries) crosses its threshold, shifted by the hormones it has receptors for. Mapped nodes are
evaluated once per sensed source, on that source's bearing; pooled nodes once. Outputs reach effectors as activation and the
blood as hormone. Nothing else decides anything.

---

## Circuit Recipes

Named arrangements of nodes. These are for people reading and designing wirings; they are not code types. Any wiring can mix
them, copy them, or do something none of them describe.

### Reflex arc

One transducer feature → one node → one effector. Fast and local: the hare's fore-limb bolt, a limb pulled back from pain.

### Template, and the pattern library

A node whose inputs are features of one or more channels, weighted toward the values a thing has: meat-eater outline (+),
meat-eater odour (+), heavy footfall cadence (+). It fires when enough of the pattern is present. That node *is* a stored
pattern. A **pattern library** is many template nodes in one zone's tissue; its size is limited by that tissue's mass.
Wired templates are there from birth (the species' evolution; their weights are read from the bodies of the animals they
match, as `detection.js _identify` does now). Learned templates are written by experience (Memory).

**Stacking.** A template's inputs can be other templates: this odour template + this outline template = a hare. Scenes,
multimodal packages and sequences are built this way, each level costing tissue.

What each channel offers as features:

| channel | features it resolves as SNR rises |
|---|---|
| ground vibration | footfall cadence and weight, limb count from the cadence, gait, bearing |
| air vibration | rhythm, size of the source, breath or wingbeat |
| vision | outline and size, limb count from the silhouette, brightness, motion across and toward, looming |
| airborne chemistry | volatile mix (diet, species, wound), freshness, upwind bearing |
| contact chemistry | edible or not, meat-eater traces underfoot |

### Parallel responses

Several nodes on the same inputs with different weights, thresholds and outputs. The example the design is built around:

- **bolt node**: outline + odour + footfall, high threshold, output the locomotion generator at maximum, mapped (away from
  the source's bearing);
- **alarm gland node**: the same inputs weighted toward odour, low threshold, graded output of alarm chemistry into the blood
  (the adrenaline- and cortisol-like hormones of Endocrine-Design);
- **freeze node**: footfall at middling strength, output to posture, with a negative weight onto the gait.

A smell alone trips the gland, not the bolt: the animal is washed in alarm chemistry and grows jumpy. A sudden footfall or
looming outline trips all three. No rule says so: it falls out of the weights.

### Inhibition

A negative weight from one node onto another's input or output. "Holding a response down" is nothing more: a node that
recognises another hare, wired with a negative weight onto the bolt node, keeps a hare grazing when another hare thumps past.
Without that wire nothing can hold the bolt down, and the animal bolts at shadows.

### Priming

A pooled node that sums a general threat level while grazing, with some persistence, wired as a positive input onto other
nodes. A primed animal bolts on less. Alarm chemistry does the same through the blood, slower and body-wide.

### Pattern generator

Two nodes inhibiting each other, each with a little persistence (a half-centre oscillator), produce alternation: a gait. A
single node with a burst output produces a pounce or a bolt from standing. Driven harder, the same circuit produces a faster
gait (intensity); no named programs. The phase within one step is not simulated; each action the generator delivers an
intensity and a pattern (alternating, all at once) to the effectors it is wired to. How many independent outputs it can time
is its mass. Generator circuits a body needs, in some form:

| circuit | what varying its drive produces |
|---|---|
| rhythmic locomotion | creep, walk, trot, sprint; swim, climb (the substrate the limbs meet) |
| burst | leap, pounce, lunge, bolt |
| orienting | head or body turned toward a bearing; sniffing is orienting plus breathing |
| strike / grasp | bite, claw, kick, hook; hold (sustained) |
| posture | rest, crouch, brace, freeze |

### Gland

A node whose output is a hormone released into the blood. Endocrine tissue is wired like anything else: which nodes drive a
gland and which nodes have receptors for its hormone is the wiring.

### Maps: combining senses, holding, predicting

A **map** is a set of mapped nodes laid out around the body, as a real midbrain maps space: by **bearing**, and by
**distance bands** (touching, striking or pouncing range, near, far) as far as the tissue allows. How many bands a map has
is its mass; how sharp a band is depends on the senses feeding it (a nose gives bearing and little distance, eyes give
both). A small map may be bearing-only: it can turn toward or away but cannot tell near from far. Signals from vision,
vibration and smell that arrive from the same place land on the same node. There is no "object": combining senses is two
inputs arriving at the same place on the map, and the node fires on less evidence from each because they add.

- **Holding**: map nodes with persistence keep firing where something was after it drops out of the senses. How long is how
  much of that tissue there is (today's traces: integrationCapacity × PERSISTENCE_SCALE).
- **Working memory bank**: persistent map nodes written by something else, overwritten as the animal moves: where the exits
  are (passable ground on each bearing), read by the bolt to choose a direction.
- **Prediction**: a map node that also takes motion input (the eyes resolve velocity across and along the line of sight)
  and excites the neighbouring node in the direction of travel. The circuit fires ahead of the thing. A pursuit predator
  wired this way runs to where the prey is going.

### Memory

Memory is writing: nodes that create or change other nodes. Three writers, each a node (or small circuit) in some zone, each
with its own store:

| writer | what it writes | the animal gains | its store |
|---|---|---|---|
| **pattern writer** | a new template node from the current feature combination | recognition, familiarity: "seen this before" | a pattern library (plastic template nodes) |
| **association writer** | the weight from a stored template onto another circuit (bolt, alarm gland, approach) | what a pattern means: this smell is danger, this place has food | the weights themselves, in the template's tissue |
| **sequence writer** | links between templates in the order they fired | episodes; replaying forward is prediction from experience | a sequence store (the head's `episodicMemory` allocation, in Clade A) |

Writes are triggered physically: a writer fires when its inputs say something happened that matters (pain, food, a spike of
alarm chemistry). That is why frightening events stick.

Damage reads straight off the wiring:

| destroyed | result |
|---|---|
| a writer | no new memories of that kind; the stored ones still work (anterograde amnesia) |
| a store | those memories are gone; the writer can write new ones if it has tissue to write into |
| the association writer only | it learns to recognise new things but can never learn what they mean: familiar with a new predator's smell, and unafraid of it |
| the sequence writer only | it recognises and associates, but keeps no episodes |

Capacity is the store's mass; a full store overwrites what has fired least. Written nodes and weights are body state and are
saved with the body (unlike traces and percepts, which are stripped). Clade A ancestrally keeps its stores and writers in
the head (lose the head, lose everything); ancestral Clade B keeps pattern stores in its limbs, loosely indexed across the
body (Cognition-Design, Memory Architecture).

---

## Where the Numbers Come From

Weights, thresholds and gains are evolution's choices, authored per species like zone masses: visible in the wiring,
destroyable with their zone. They must not become the tuning levers Design-Principles forbids. Where a number can be read
from the body, it is:

- a template's target feature values come from the bodies it matches (as identification does now);
- how much a transducer feature contributes follows the transducer's quality and SNR;
- a node's mass is its capacity (templates held, actions of persistence, outputs timed);
- hormonal shifts come from Endocrine-Design's receptor model.

A number that cannot be traced to the body is written in the wiring with a comment saying what it stands for.

---

## Where Today's Code Sits

| in the code | in this design |
|---|---|
| the hare's wiring (`wiring.js`) | fore-limb bolt arcs and relays, graze-limb relays and taste, the torso threat template with looming, flee / freeze / alert, the stress gland, the head food template: nodes |
| `nodes.js` output stage | stands in for generators built from nodes: the strongest drive reaching the locomotion generator wins |
| `detection.js _identify` (pass 7) | a wired pattern library, not yet housed in nodes |
| traces, evidence summation, odour binding | map nodes with persistence; combining senses (step 4) |
| feature functions in `nodes.js` (size, identity, looming time) | percepts delivered as features; PLACEHOLDER until perception itself is nodes |
| `evaluateReactiveRules` | placeholder: universal templates wired to generators, written as code. Retired creature by creature |
| `canOverrideReactive`, `deliberativeEvaluation` | placeholder for timing by hops plus inhibition |
| `getMovementIntensity` by behaviour label | placeholder: intensity should come from the generator |
| `ai-utils.js stepRoundObstacles` | placeholder for a learned route store (sequence and pattern writers) |
| `creature.drives` | placeholder for glands and hormone levels |

---

## The Hub, and the Player

Every nervous system has nodes at the top of its wiring: the nodes in its integration tissue, the most connected, reached
last by the senses and reaching furthest into the body. That set is the **hub**. For a creature, what drives the hub is its
own wiring (glands, templates, the map). For the player, the player's intent drives it instead. **The player plays the
hub**: same wiring, same limits. The player's intent entering at the hub is the one non-physical input in the design, and
it enters at one well-defined place.

Everything about control follows from the wiring:

- **What can be done deliberately** is what the hub reaches through existing wires. A generator with a pathway from the hub
  is on the player's hotbar; one without is not. The hotbar is read off the wiring. Lose the pathway (a destroyed zone on its
  route) and the action is gone; grow a wire (a mutation) and one appears.
- **What can be stopped** is what the hub has an inhibitory wire onto. No wire, no stopping it: the body does it.
- **Who wins a conflict** is a race and a contest. A reflex a few hops from its transducer fires before the hub's signal
  arrives: a bolt already triggered by a close footfall cannot be stopped. A weaker or later-firing reflex can be held down
  if the hub's inhibitory weight beats its input. The game can say so: "your legs bolt before you can stop them."
- **Control is earned by rewiring.** Hub-to-node weights are plastic. Driving a node, or holding a reflex down, strengthens
  that wire each time it succeeds. A new grazer player cannot hold its bolt; one who has held it forty times can hold it
  against a moderate footfall, never against a looming predator. The strength lives in tissue and can be lost with it.
- **How much the hub can do at once is its mass.** Each action the hub drives as many independent outputs as its tissue
  allows: a small hub one generator at a time, a large one orienting, stalking and holding a flinch down together. The same
  limit binds creatures: a big-brained body does more at once because it has the tissue to.
- **Dedicating tissue to control is a build choice.** A larger hub, or more hub wiring, gives more reachable actions and
  stronger inhibition, paid for in mass and in the food neural tissue costs.

So species play differently from anatomy, not from a difficulty setting. A hare's hub is 0.01 kg with almost no wires out
of it: playing a hare is mostly steering while the body decides the important things. A wolf's hub reaches nearly all of its
body: playing a wolf feels deliberate.

---

## First Application: the Wolf

The prowler's nervous system from its body map:

| zone | neural (kg) | allocation |
|---|---|---|
| head | 0.85 | chemical processing 0.25, episodic memory 0.18, integration 0.15, visual processing 0.10, motor coordination 0.08, pattern library 0.05, threat assessment 0.04 |
| torso | 0.22 | motor relay 0.12, chemical processing 0.05, pattern library 0.05 |
| front limbs | 0.05 each | motor control 0.04, chemical processing 0.01 |
| mid and rear limbs | 0.04 each | motor control 0.04 |

Pathways: head → torso (bandwidth 0.9), torso → each limb (0.5–0.7). Centralized and nose-led: most of its mind is in its
head, and everything reaches the limbs through the torso, two hops away.

A draft of its circuits, to be settled before code:

| circuit | recipe | tissue | inputs | outputs |
|---|---|---|---|---|
| prey, carrion, predator, kin odours | templates | head chemical processing + pattern library | head airborne chemistry | the map; alarm gland (predator odour) |
| prey and threat outlines, motion | templates | head visual processing + pattern library | head eyes | the map |
| larger-animal template | template | head threat assessment | size and motion features | inhibits approach; drives retreat on the map |
| bearing map with holding and prediction | map | head integration | the templates above, eye motion | orienting, gait (toward or away from a bearing) |
| trail reader | template | forelimb + torso chemical processing | contact chemistry underfoot | orienting (the trail's fresher end) |
| gait | pattern generator | torso motor relay, timed from head motor coordination | the map, hunger chemistry | six locomotion limbs |
| pounce | burst | torso motor relay | the map (prey within reach) | all locomotion limbs at once |
| orienting | pattern generator | head | the map, odour templates | head and body |
| bite, claws | strike | head; forelimb motor control | the map (prey adjacent), contact | jaw; each foreleg |
| limb withdrawal | reflex arcs | each limb | that limb's pain | that limb |
| hunger, alarm | glands | torso (to place) | gut state; predator templates | blood |
| memory writers and stores | memory | head episodic memory + pattern library | the map, pain, food, alarm | deferred |

What its reactive rules become:

| rule | becomes |
|---|---|
| 1–2 damage | limb withdrawal arcs, the larger-animal template, alarm gland |
| 3–4 threats near and adjacent | larger-animal template on the map → gait away, or orienting; inhibition from prey templates when hungry |
| 4B competitor spacing | kin odour template → orienting and a weak gait-away |
| 5–6 prey adjacent and near | prey templates on the map → gait, pounce, strike |
| 6A where the prey was | holding on the map |
| 6B–6C trail, plume | trail reader and odour templates → orienting and gait |
| 7–9 territory, rest, default | glands (rest) and the gait generator's resting drive |

---

## Implementation Sequence

One pass per pull request. The order (the person, Sep 2026): the systemic work first, then one animal, then the whole cast,
before moving on to another system.

**The node system**

1. This document, settled with the person.
2. The node runner: nodes, weights, persistence, mapped and pooled evaluation, hop timing, generators built from nodes.
   Port the hare onto it with no behaviour change (harness tallies identical).
3. Glands and hunger: gland nodes, hormones in the blood, receptors shifting thresholds; hunger, alarm and rest as hormone
   levels replacing `creature.drives` (Endocrine-Design).
4. Maps: bearing and distance bands, holding (replacing traces), prediction.
5. The hub: hub nodes, reach, inhibition, the race, plastic hub weights, the hub's mass as its limit per action; the player
   driving the hub, the hotbar read off the wiring.
6. The wolf wired on the system; its reactive rules retired.
7. The whole cast: the ravager, the lurker, the shaleback, the chemotroph colonies, and the hare rewired to use the new parts.
   The reactive rules are then gone.

**Then memory**, the same way: writers and stores saved with the body (the detour placeholder replaced by a learned route
store), then one animal, then the cast.

The harness (`tools/ecology.mjs`) checks each step for regressions and for systems not doing what their doc says. It does
not set targets for the ecology.

---

## Open Questions

- Which nodes are hub nodes: every node in integration tissue, or the wiring names them?
- Does the player see why a reflex won (the log line), or only feel it?

## What NOT to Change

- Per-species behaviour code. A species is a wiring.
- Cognitive concepts in the code (objects, decisions, arbitration). Nodes, weights, persistence, hormones.
- Named motor programs. Generators deliver intensity and pattern.
- Nodes without a zone, or with capacity not drawn from that zone's neural tissue.
