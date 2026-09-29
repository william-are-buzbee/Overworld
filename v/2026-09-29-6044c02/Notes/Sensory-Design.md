# Sensory System Design — Sensitivity Windows, Signal Quality, and Operational Ranges

Design reference for the transducer and perception systems. Captures principles from extended discussion about how real sensory organs operate across signal ranges, how information quality degrades with signal-to-noise ratio, and how evolution produces multi-window sensor arrays. This document informs both the cognition system (what does the creature learn from what it detects?) and the future perception second pass (rich sensory modeling).

Include alongside Cognition-Design.md and Surface-Creatures.md when working on perception, cognition, AI behavior, or new creature body maps.

---

## Core Principle: Nothing Is Free

No information comes without a physical cost. Detection is not binary — it's a gradient of information quality that depends on the interaction between the signal's physical properties and the transducer's physical properties. A creature that detects something may learn almost nothing about it, or may learn everything, depending on how well the signal matches the sensor's operating characteristics.

---

## Signal-to-Noise Ratio (SNR)

Every transducer has a **noise floor** — the minimum signal amplitude it can distinguish from background noise. The noise floor is determined by the transducer's physical quality: receptor density, membrane sensitivity, neural wiring precision. Higher quality transducers have lower noise floors.

When a signal reaches a transducer, the amount of usable information depends on how far above the noise floor the signal is:

```
SNR = signalStrength / noiseFloor(transducerQuality)
```

**SNR determines information quality on a continuous gradient:**

- **SNR barely above 1.0 (just detected):** "Something is there." Direction (approximate). That's it. The signal emerged from the noise but carries no resolvable structure. The creature cannot tell size, speed, identity, or even whether the source is one entity or several.

- **Low SNR (1.5–3):** Direction (better). Rough movement state for vibration (moving vs still — the signal fluctuates or doesn't). Still no useful magnitude — the amplitude is too close to the noise floor to distinguish a faint signal from a nearby small source versus a distant large source.

- **Moderate SNR (3–6):** Above plus rough size category. Amplitude rises clearly above the noise, and the creature can compare it to its own body's signals as a reference. "Bigger than me," "similar," "smaller." Movement speed becomes resolvable for vibration. Chemical concentration gradients become trackable for scent.

- **High SNR (6–12):** Precise magnitude estimation. Movement pattern structure becomes resolvable — gait, speed changes, pauses. Chemical compound discrimination becomes possible (predator-metabolism volatiles vs herbivore-metabolism volatiles). Visual detail resolves features beyond silhouette. This is where the signal is clean enough for pattern matching against stored references.

- **Very high SNR (12+):** Full detail extraction. Species identification from single-channel signature matching (given a pattern library). Wound chemistry detection in chemical signals. Gait anomalies (limping, favoring a limb) in vibration signals. Behavioral state classification from movement pattern analysis.

**The same creature provides different information to different observers.** A 22kg meso-predator approaching two different animals:

- Detected by a lurker's sensor limb (ground vibration quality 5, low noise floor): High SNR. The lurker reads gait pattern, estimates mass precisely, matches against its vibration pattern library, identifies species, assesses approach speed and intent.

- Detected by a meso-predator's locomotion limb (ground vibration quality 1, high noise floor): Low SNR. "Something is moving, that direction." No size estimate, no pattern match, no identification.

- Detected by the meso-predator's nose (airborne chemical quality 6, low noise floor in the chemical domain): High SNR in a different channel. Species identification from volatile profile, diet type from metabolic chemistry, rough health from wound chemistry if present.

Each observer builds a different picture of the same entity based on which channels have high SNR.

---

## Sensitivity Windows

### The Problem with Single-Range Sensors

A transducer tuned to detect 5kg grazer footfalls at ten tiles would be permanently saturated in any environment where 200kg herbivores walk nearby. A transducer tuned to detect 200kg herbivore footfalls at fifty tiles would never notice the 5kg grazer at three tiles. No single operating window covers a complex ecology's signal range.

### How Real Sensors Solve This

The mammalian cochlea contains hair cells of different physical lengths. Short stiff hairs resonate at high frequencies. Long flexible hairs resonate at low frequencies. Each cell is tuned to a specific frequency window. The ear doesn't hear "everything on one dial" — it hears through an array of overlapping windows, each with its own operating range, and the brain assembles a composite from the parallel outputs.

The same principle applies to amplitude ranges, not just frequency. Retinal rod cells detect dim light and saturate in brightness. Cone cells detect bright light and can't function in darkness. Different hardware for different operating windows in the same modality.

### Saturation

When a signal exceeds a sensor's maximum operating range, the sensor **saturates**. The output clips to maximum. Fine structure is lost. The sensor reports MAX MAX MAX MAX — it knows "something enormous" but can't distinguish 100kg from 200kg because both peg the receptor at the same ceiling.

Saturation is not damage. The sensor isn't harmed. It just can't extract information from a signal that exceeds its dynamic range. Between footfalls of a passing megafauna, the sensor recovers and resumes normal operation.

### Gain Control and Adaptation

Biological sensors adapt to sustained input:

**Receptor-level adaptation:** Sustained loud input causes the receptor to reduce its own sensitivity. Eyes adjust to bright light. Ears adjust to background noise. A vibration sensor on a limb standing on vibrating ground adapts out the constant background within a few cycles and begins listening for deviations from baseline.

**Neural-level adaptation:** Lateral inhibition and adaptation circuits in the local ganglion filter sustained signals and enhance transient changes. This is why you stop noticing a constant smell after a few minutes but immediately notice a new one — the adapted background is subtracted, and only changes pass through.

**Implications for gameplay:** A creature standing near a constant vibration source (waterfall, herd of grazing animals, geological activity) adapts it out and detects new signals relative to that baseline. A creature entering a new environment takes a few turns to adapt — during that window, its detection is impaired by the unfamiliar background. Territory familiarity isn't just cognitive — it's sensory. Your sensors are calibrated to your home territory's baseline signals.

---

## Multi-Window Sensor Arrays

### Evolutionary Inevitability

In a complex ecology spanning multiple orders of magnitude in body size, evolution produces multi-window sensor arrays. Different receptors on the same body, or different receptor populations within the same organ, tuned to different signal ranges. Each window serves a different ecological function.

### Operational Windows

Each sensitivity window isn't just a detection range — it's an **operational context** with its own ecological meaning:

**Large-signal window:** Tracks megafauna. For a small predator: avoidance information ("the herd is passing, stay still"). For a scavenger: opportunity tracking ("follow the herd, something will die"). For a parasite: host-finding. The pattern library for this window contains large-animal signatures, migration patterns, environmental-scale disturbances.

**Medium-signal window:** Tracks competitive threats and similar-sized prey. This is the moment-to-moment survival window — what's hunting me, what can I hunt, what's competing for my territory. The pattern library contains predator signatures, prey signatures, competitor signatures.

**Small-signal window:** Tracks fine environmental detail. Tiny organisms in the substrate, shifts in soil composition, underground water movement, atmospheric pressure changes affecting substrate tension. The pattern library contains environmental baselines and deviation signatures.

### Per-Limb Window Tuning

On a multi-limbed creature with contact-coupled sensors (Clade B), different limbs may evolve different receptor tuning based on their mechanical coupling to the substrate and their ecological role:

- **Sensor limbs (lurker):** Tuned for the medium-signal window. Maximum resolution in the prey-sized range (5-30kg). Signals above this range saturate (large herbivore reads as "something big, too big, ignore"). Signals below fall under the noise floor. Optimized for the ambush niche.

- **Rear limbs:** Cruder tuning, broader window. Pick up large signals as early warning ("big thing moving, be alert") without the fine discrimination of the sensor limbs. A background alarm system, not a precision instrument.

- **Contact-feeding limbs:** Tuned for substrate-level signals. Micro-vibrations from soil organisms, mineral settling, water flow. A completely different operational world than the locomotion-scale sensors.

### Pattern Libraries Are Physically Located

A pattern library is neural mass storing learned associations. It exists wherever the body map places patternLibrary allocation — in a zone's ganglion, in the head's centralized processing, or distributed across multiple zones. The library is not an abstract property of the creature. It's tissue in a specific place.

If a zone has both a transducer AND patternLibrary neural allocation (the ganglionic configuration from Cognition-Design.md), the zone does its own pattern matching locally. Destroying that zone destroys both the sensor and the library. The creature loses the sensor's detection AND the accumulated pattern knowledge that lived in that zone's neural mass.

If a zone has a transducer but NO local patternLibrary allocation (the long-wire configuration), the raw signal travels through pathways to wherever processing lives — maybe the head, maybe another zone. Destroying the transducer zone removes the sensor, but the pattern library survives wherever it physically is. The creature can't detect through that sensor anymore, but its learned patterns for that sense type still exist in the processing zone.

Where the pattern library lives is a body map fact, not a clade rule. Clade B creatures tend to have local pattern libraries in their limb ganglia (the lurker's sensor limbs have patternLibrary allocation). Clade A creatures tend to have centralized pattern libraries in the head. But these are tendencies from evolutionary history, not architectural requirements. A future Clade B creature could centralize some pattern processing. A future Clade A creature could have local limb ganglia with their own libraries.

---

## Connections to Existing Systems

### Detection Formula (Prompt L-B)
The current detection formula computes WHETHER something is detected:
```
range = cbrt(emission) × sensitivity × coefficient
```
This remains the detection gate for smell and vibration, the channels whose signal spreads through a volume. *Status
(Sep 2026):* vision does not spread, so its range is linear (`detection.js getVisualRange`): the silhouette's linear
dimension (cube root of mass) × motion (3.5 moving, 0.45 still) × contrast against the tile × sqrt(light) × acuity ×
`VIS_RANGE_COEFF`, and cover on the tile takes the fraction it hides off the range. Under the old cube root a moving
animal was seen only twice as far as a still one and a conspicuous one 2.3× as far as a matched one; now a still hare on
grass is seen by the prowler at ~5.5 tiles (as before) and a moving one at the 40-tile ceiling, and a hare sees a moving
prowler at ~14 instead of ~4. Note that no creature's integument hue matches any terrain hue except the ravager's in forest, so the hue-mismatch
penalty is on almost everywhere; the hare's "grassland camouflage" is not yet a match in the tables. SNR adds a second computation for HOW MUCH INFORMATION the detection provides. Both use the same transducer quality values.

### Signal Emission (Prompt L-A)
Emission values are the signal source. Signal strength at the observer = emission attenuated by distance. The attenuation model (currently implicit in the range formula) determines how signal strength relates to distance for each medium. Ground vibration attenuates differently than airborne chemical.

### Chemical Coupling Media (Prompt N)
Chemical transducers split into contact, airborne, and dissolved. Each coupling medium is a different operational context with potentially different sensitivity windows. Contact chemical at quality 6 operates in a completely different signal range (molecular concentration on a touched surface) than airborne chemical at quality 6 (volatile concentration in atmosphere). The quality number describes resolution within the operating window, not across windows.

### Cognition System (Prompt O)
The cognition system reads sensory output to make decisions. SNR determines what information is available to both the reactive layer (stimulus magnitude, threat/no-threat) and the deliberative layer (classification, assessment). The cognitive system doesn't care how the information was extracted — it works with whatever the sensory system provides. Richer sensory input enables richer decisions without changing the decision architecture.

---

## Current Implementation Specification

This section contains exact formulas and logic for the per-zone detection system. Prompts implementing or modifying the sensory system should reference this section directly. Everything here is concrete and implementable now. The sensitivity window system (designed, described above) comes in a later pass and will extend this specification — it will not replace it.

### Foundational Rule: Sensors Are Independent

There is no creature-level sensitivity. There are sensors. Each sensor is a physical organ on a specific zone, with its own quality on a specific channel and coupling medium. Detection, range, and information quality are all computed per-zone, per-channel. No summing. No averaging. No aggregation into a creature-wide number.

A creature "detects" a target when at least one of its zones detects that target on at least one channel. Which zone(s) detected it, through which channel(s), and at what SNR — all of this matters and is preserved, not collapsed.

### Per-Zone Detection

For each emitting creature on the map, for each zone on the observing creature that has a nonzero transducer quality on a given channel:

```
zoneRange = cbrt(emission) × zoneQuality × channelCoefficient
```

Where:
- `emission` is the target's emission value for that channel (already computed per turn by signal emission system from Prompt L-A)
- `zoneQuality` is the observing zone's transducer quality for that specific channel and coupling medium (e.g., `zone.transducers.vibration.ground` or `zone.transducers.chemical.airborne`)
- `channelCoefficient` is a per-channel tuning constant (CHEM_AIRBORNE_COEFF, VIB_GROUND_COEFF, VIB_AIR_COEFF)

If the distance from observer to target is less than or equal to `zoneRange`, this zone detects this target on this channel.

**Ground vibration special rule (unchanged):** Still creatures have zero ground vibration emission. A motionless target is invisible to ground vibration regardless of sensor quality or range.

**Chemical airborne special rule (unchanged):** All living creatures emit chemical signal constantly (from mass, metabolism, wounds). Chemical airborne detects moving and still targets.

### SNR Computation

When a zone detects a target, compute the signal-to-noise ratio for that specific detection:

```
SNR = zoneRange / distance
```

This is physically meaningful: at the edge of detection range, SNR = 1.0 (signal barely clears the noise floor). At half the detection range, SNR = 2.0 (signal is twice the noise floor). At one-fifth the range, SNR = 5.0. Close targets produce high SNR. Distant targets produce low SNR. Better sensors produce higher SNR at the same distance because their zoneRange is larger.

### SNR Determines Information Quality Through Narrowing Uncertainty

When multiple zones detect the same target (possibly through different channels), each produces its own SNR. Track the best SNR per channel type, because different channels provide different kinds of information.

```
bestVibrationSNR = max(SNR across all vibration zone detections for this target)
bestChemicalSNR = max(SNR across all chemical airborne zone detections for this target)
bestOverallSNR = max(bestVibrationSNR, bestChemicalSNR)
```

Information does not click on at thresholds. It resolves continuously from wide uncertainty to narrow certainty as SNR improves. The creature always has SOME information about a detected target — the question is how precise that information is.

**Size estimation — continuous range narrowing:**

Any channel that detects a target provides a size estimate derived from signal magnitude compared to the observer's own emissions as reference. The estimate has an uncertainty range that narrows with SNR:

```
uncertaintyFactor = SIZE_UNCERTAINTY_BASE / SNR
estimatedMass = deriveFromSignalMagnitude(emission, distance, observerMass)
lowerBound = estimatedMass / (1 + uncertaintyFactor)
upperBound = estimatedMass * (1 + uncertaintyFactor)
```

At SNR 1.0 (edge of detection): `uncertaintyFactor` is large. A 22kg creature might read as "somewhere between 5 and 90 kg." The observer knows something is there but the size is nearly unconstrained.

At SNR 3.0: range narrows significantly. "15 to 40 kg."

At SNR 6.0: "18 to 28 kg."

At SNR 12.0+: "approximately 20-25 kg." Near-exact.

`SIZE_UNCERTAINTY_BASE` is a tuning constant. Tune so that the ranges feel physical — at the edge of detection, size is genuinely ambiguous. At close range with good sensors, size is precise.

*Status (Sep 2026):* `deriveFromSignalMagnitude` is `detection.js estimateMassFromSignal(target, observer, channel)`, and the
channel is the one that produced the best SNR. The observer's reference is its own emission on that channel
(`signals.js referenceEmission`: its smell at rest, its footfalls and breathing as if moving, its silhouette). Smell and air
vibration scale with mass, and so does ground vibration, the footfall impulse a moving body puts into the substrate; a
silhouette scales with the cube root of mass, so that ratio is cubed back. What the observer cannot know it does not
correct for: a moving predator smells like a heavier animal to a resting grazer. Before this every estimate used the
chemical channel whatever sense had detected the target, and ground emission was mass over foot contact, which cancelled to
a gait ratio (a 200 kg wader put less into the ground than a wolf) and contradicted the ranges below. The visual SNR the
ganglia read is the one that decided the detection, cover and light included (`_visualDetection`, one path for NPCs and
the player). Ground emission is also scaled by the square of the emitter's locomotion intensity over a walk
(`signals.js`, Motor-System-Design step 6): impact energy goes with the square of the speed the foot comes down at, so a
creep (the player's F key, `CREEP_INTENSITY` 0.1) puts 16% of a walk into the ground and is felt from about half as far
(a 22 kg prowler at ~5 tiles by a hare instead of ~10), a flee or sprint at 1.0 sixteen times a walk. The observer's
reference is still its own walk, so a bolting hare reads to another hare as something far heavier walking: hares now
freeze and run more when other hares run. Cadence, which would tell a light fast gait from a heavy slow one, is the
gait-signature work under Future.

**Movement state — vibration, and the eye's change detection:**

*Status (Sep 2026, perception pass 1):* vision sets `isMoving` too. A visual detection records whether it came through the eye's change detection (the target moved: the ×3.5 motion factor) or pattern recognition alone; the first sets `isMoving = true`, and a target seen but not felt, with only pattern recognition firing, reads as still (`isMoving = false`). Before, a creature seen walking but not felt had `isMoving = null`, and reactive Rule 3's "moving or predator" branch ignored what the eyes saw. Visible wounds come from the eyes only (visual SNR above `CONDITION_CONF_MIN`), not from a nose or a footfall. The species label is the key a creature knows itself by (`getSpeciesKey`), so a prowler-bodied player and a wolf identify as kin. Prey choice goes through perception: `isViablePrey(predator, info)` reads the size estimate and rules a target out as kin only once the channels have identified it as such, and `getAdjacentPrey` picks among this action's detections; both used to read the target's true mass and species, and an adjacent animal the senses missed could still be attacked.

Ground vibration emission is zero for still creatures and nonzero for moving creatures. If a zone detected something through ground vibration, the target was moving — this is inherent in the physics, not a threshold. The movement information is binary and comes for free from the channel itself.

What improves with SNR is movement DETAIL: speed estimation, gait pattern resolution, directional changes. But the basic fact of "moving or not" is free from vibration detection. Chemical detections provide no movement information — a scent plume doesn't tell you if the source is moving or standing still.

*Status (Sep 2026, perception pass 4) — motion as velocity.* Every body records its last step and the speed it was taken at (`turn-loop.js _recordStep`: force-to-weight at the gait × acceleration, the rate the action economy runs it at; tiles per world tick = speed / (REFERENCE_SPEED × BASE_TICKS_PER_ACTION)). An eye splits that velocity into motion across its line of sight and motion along it (`detection.js _motionRelativeTo`), and the visual motion factor is `STILL + (MOVING − STILL) × (across + 0.35 × |along|) / 0.73`, anchored so a prowler walking across the view reads 3.5 as the old binary value did (`_motionFactor`). A wolf picks a prowler out at: still 4.8 tiles; walking across 37; walking head-on or away 16; creeping across 18; creeping head-on 9; sprinting across 55. Stalking is now geometry and gait: come in slow and straight. Detection info carries `closingSpeed` from the eyes, which feeds the hare's looming circuit (Cognition-Design). The concealment motion reduction is still binary (moved or not).

*Own footfalls (perception pass 4).* A body's own steps reach its own ground-vibration transducers as a same-weight neighbour's would from `SELF_FOOTFALL_DISTANCE` (1 tile, the conservative bound: every sensor on these bodies is within a stride of its feet). Received signal goes as emission / d³, so the noise floor `1/(quality × coeff)³` becomes `floor + own emission`, and the range becomes `cbrt(emission / (floor + own))` (`detectTargetPerZone`). A hare's fore-limbs feel a walking prowler at 10 tiles standing, 2 creeping, 1 walking, 0 bolting. Animals that listen through the ground have to stop to listen; the reactive rule `movementCompromisesSense` now has the mechanism it claimed. Air vibration and the eyes carry no self-noise yet: the eyes' version needs the background's optic flow, which nothing models.

**Diet type — chemical airborne only, confidence scaling:**

Predator and herbivore metabolisms produce different volatile compound profiles. Discriminating between them requires chemical receptor specificity. Confidence in the discrimination scales continuously with chemical airborne SNR:

```
dietConfidence = clamp((chemicalSNR - DIET_CONF_MIN) / (DIET_CONF_FULL - DIET_CONF_MIN), 0.0, 1.0)
```

Where `DIET_CONF_MIN` is the SNR below which no discrimination is possible (the compound profiles are indistinguishable from noise), and `DIET_CONF_FULL` is where discrimination is essentially certain.

Below `DIET_CONF_MIN`: diet unknown. The creature smells "organic compounds, something alive" but can't resolve the metabolic profile.

Between `DIET_CONF_MIN` and `DIET_CONF_FULL`: the AI has a confidence value. If confidence is below a decision threshold (e.g., 0.7), treat diet as unknown and default to conservative behavior (assume potential threat). If above, treat as identified.

Above `DIET_CONF_FULL`: diet is certain. Predator or herbivore, no ambiguity.

`DIET_CONF_MIN` and `DIET_CONF_FULL` are tuning constants. Only chemical airborne SNR drives this — vibration and visual cannot determine diet type (in this pass; future gait-from-body-map signatures could add vibration-based diet inference).

**Species identification — any channel at high SNR, confidence scaling:**

Species identification requires pattern matching against a stored library. The confidence scales with best SNR on any single channel that has sufficient signal quality:

```
speciesConfidence = clamp((bestChannelSNR - SPECIES_CONF_MIN) / (SPECIES_CONF_FULL - SPECIES_CONF_MIN), 0.0, 1.0)
```

Below `SPECIES_CONF_MIN`: species unknown. The signal lacks fine structure for pattern matching.

Above `SPECIES_CONF_FULL`: species identified with certainty.

The moment of recognition slides naturally with approach distance — as the target gets closer, SNR rises, confidence climbs, and at some point recognition clicks. Different sensors produce recognition at different distances. The lurker's quality 5 vibration sensor recognizes species from footfall at moderate range. The meso-predator's quality 6 nose recognizes species from scent at long range. The meso-predator's quality 1 vibration sensor never reaches species-level SNR for most targets.

Note: species identification currently assumes adult animals recognize common species (pattern library approximated by quality threshold). When the memory system is implemented, species identification will require actual learned patterns.

**Wound state, behavioral state — channel-specific, high SNR:**

Wound chemistry requires chemical airborne at high SNR. Gait anomaly (limping, favoring a limb) requires vibration at high SNR. Visible wounds and behavioral state require visual detection (handled by FOV, not this system). Contact chemical can detect wound chemistry at touch range (during combat).

These use the same confidence model: confidence scales with SNR from the relevant channel, below a minimum SNR they're unavailable, above a full-confidence SNR they're certain.

**Fight assessment — requires integration, uses uncertainty ranges:**

Fight assessment (Prompt O) requires integration capacity ≥ ASSESS_INTEGRATION_THRESHOLD (~0.15). It now works with uncertainty ranges rather than point estimates:

The assessor uses the worst-case interpretation of the size range when evaluating threat. If the upper bound of the target's size estimate includes "much larger than me," the assessment is conservative. As SNR improves and the size range narrows, the assessment becomes more precise. A high-integration creature with high SNR makes accurate fight assessments. A high-integration creature with low SNR (target at edge of detection) makes conservative assessments because the size uncertainty is too wide to commit to.

### How the AI Consumes Uncertainty Ranges

**Reactive layer — worst-case interpretation:**

The reactive rules from Prompt O use `relativeMagnitude` to determine threat response. Under the uncertainty model, the reactive layer uses the worst-case (most threatening) interpretation of the size range:

```
if upperBound > observerMass * LARGER_THRESHOLD:
    treat as potentially_larger (flee if herbivore, caution if predator)
else if lowerBound < observerMass * SMALLER_THRESHOLD:
    treat as potentially_smaller (possible prey if predator)
else:
    treat as similar
```

At low SNR (wide range), the upper bound is large and the lower bound is small. The creature may simultaneously assess the target as "potentially larger AND potentially smaller." The reactive layer resolves this conservatively: herbivores treat ambiguous targets as threats, predators treat ambiguous targets cautiously.

At high SNR (narrow range), the bounds converge and the assessment becomes specific: "this is a 20-25kg creature, smaller than me, prey."

For diet confidence: if below decision threshold, treat as unknown (conservative defaults from Prompt O apply — unknown diet = potential threat).

**Deliberative layer — range-aware decisions:**

The deliberative layer can reason about the uncertainty range itself. A creature with high integration evaluating a target at moderate SNR might decide: "size range 15-40kg, diet unknown, I can't commit to a hunt. Wait for it to get closer." At higher SNR: "size range 18-28kg, diet herbivore, commit to hunt."

The deliberative layer uses the full size range, diet confidence, and species confidence to modulate drive urgency. Uncertain targets reduce hunting drive urgency (don't commit without information) and increase safety drive urgency (unknown things are potentially dangerous).

### What This Replaces in Prompt O

The `buildDetectionInfo` function from Prompt O currently produces binary information flags (dietType present or absent, species present or absent, sizeRelative as a category). This changes to:

```js
// OLD (Prompt O):
info.sizeRelative = 'larger'   // or 'similar', 'smaller', 'unknown'
info.dietType = target.diet     // or absent
info.species = target.speciesId // or absent

// NEW:
info.sizeEstimate = { lower: 15, upper: 40, estimated: 24 }
info.dietConfidence = 0.62      // continuous 0-1
info.dietType = 'predator'      // best guess, only meaningful if confidence is high
info.speciesConfidence = 0.31   // continuous 0-1
info.species = 'meso-predator'  // best guess, only meaningful if confidence is high
```

The reactive layer's `relativeMagnitude` function reads `info.sizeEstimate.upper` and `info.sizeEstimate.lower` instead of a category. The deliberative layer reads the full info object including confidence values.

The SNR threshold constants from Prompt O (`SNR_MOVEMENT`, `SNR_MAGNITUDE`, `SNR_DISCRIMINATION`, `SNR_IDENTIFICATION`, `SNR_DETAIL`) are replaced by the confidence curve constants (`DIET_CONF_MIN`, `DIET_CONF_FULL`, `SPECIES_CONF_MIN`, `SPECIES_CONF_FULL`, `SIZE_UNCERTAINTY_BASE`). Remove the old threshold constants.

### AI Detection

The AI already runs sense-specific detection each turn. The change:

**Remove `cacheEffectiveSenses`.** This function computes creature-level aggregated sensitivity. It is replaced by per-zone computation.

**Remove `getEffectiveVibrationGround`, `getEffectiveVibrationAir`.** These sum and soft-cap. Gone.

**Keep `getEffectiveChemical` and `getEffectiveVisual` only if** they are used elsewhere and already use max. If they only served `cacheEffectiveSenses`, remove them too.

**Replace the AI detection loop.** For each potential target, for each zone on the observing creature, for each channel that zone has a nonzero transducer on: compute zoneRange, check distance, if detected compute SNR. Track the best SNR per target across all zone-channel pairs. The first zone to detect a target is sufficient for "detected = true." Continue checking other zones only to find the best SNR for information quality.

**Performance note:** This is more computation per creature than the old single-sensitivity-per-channel model. For each observing creature checking N targets, the old system ran 3 range checks per target (one per channel). The new system runs up to (zones × channels) range checks per target. Optimize by:
- Skip zones with quality 0 on a channel (most zones have 0 on most channels)
- Early-exit per target once detected — only continue to find best SNR, not to determine detection
- Cache zone ranges per observer per turn (zoneRange depends on target emission, but the `zoneQuality × channelCoefficient` part is constant per observer and can be cached)

### Player Detection

Player detection follows the exact same per-zone model. `computePlayerSensoryProfile` is replaced with per-zone detection against all creatures on the map. The player's zones, the player's transducer qualities, the same formula.

Visual FOV remains separate and unchanged — it already handles visual detection through the cone/LOS system.

### Player Rendering Gradient

Currently (Prompt N), non-visually detected creatures render as full sprites on dark tiles. This changes to an SNR-based rendering gradient.

**Visual FOV (unchanged):** Creatures inside the player's visual field of view render as full sprites on revealed tiles. Full information. This is sight — you see everything.

**Non-visual detection — SNR-based rendering:**

The best SNR across all player zones that detected a given creature determines how that creature renders.

**Low SNR (1.0 to 3.0) — Faint indicator.** The creature is barely detected. Render as a low-opacity presence at the target's tile. Not identifiable. The player knows "something is there, in that direction" but the shape is ghostly, indistinct. Opacity scales linearly from very faint at SNR 1.0 to moderately visible at SNR 3.0.

**Moderate SNR (3.0 to 6.0) — Visible but undetailed.** The creature is clearly detected. Render at moderate opacity. The sprite is visible and the player can tell it's a creature, can estimate size (the sprite silhouette gives mass impression). But fine detail is soft. Opacity scales from moderate to near-full.

**High SNR (6.0+) — Full rendering.** The creature is clearly sensed. Render as a full sprite, same as visual detection. The player's sensor is providing enough information that the creature is fully "known" through that sense. At very high SNR (12+), the player's senses are giving them everything — species, wounds, behavior.

**Implementation:** The simplest approach is opacity scaling. Compute a render opacity from SNR:

```
if (in visual FOV):
    opacity = 1.0 (full, unchanged)
else if (non-visually detected):
    opacity = clamp((bestSNR - 1.0) / (SNR_FULL_RENDER - 1.0), 0.1, 1.0)
```

Where `SNR_FULL_RENDER` is a constant (maybe 5.0 or 6.0) at which the sprite reaches full opacity. Below that, linear fade toward barely visible. The tile stays dark/fogged regardless — non-visual senses reveal entities, not terrain.

**The rendering gradient gives the player immediate physical intuition.** A faint ghost at the edge of chemical range tells them "my nose is picking up something far away." A solid sprite nearby through vibration tells them "I can clearly feel that thing moving." Different senses, different ranges, different confidence levels — all communicated through one visual variable (opacity) without needing labels or icons.

### Coefficient Tuning Targets

The channelCoefficients should be tuned so that the following approximate detection ranges hold for representative scenarios. These are not hard requirements — they're design targets for the feel of the game given an 18-tile viewport (9 tiles from player to screen edge).

**Chemical airborne:**
A meso-predator's nose (quality 6) detecting a 22kg meso-predator (moderate chemical emission) should have a range of roughly 12-15 tiles. The player can smell things approaching from screen edge. Larger creatures (200kg herbivore, high emission) are detectable further — maybe 18-20 tiles, just off screen. Small creatures (5kg grazer, low emission) are detectable closer — maybe 8-10 tiles. The nose is the primary sense and should cover most of the viewport, but not the entire map.

An apex predator's nose (quality 7) should exceed the meso-predator's range by a noticeable margin — roughly 15-20 tiles for a medium target.

**Ground vibration:**
A lurker's sensor limb (quality 5) detecting a moving 22kg meso-predator should have a range of roughly 10-12 tiles. The lurker feels prey approaching from meaningful distance. A moving 200kg herbivore (massive ground vibration emission) should be detectable at 15+ tiles.

A meso-predator's locomotion limb (quality 1) detecting the same moving 22kg creature should have a range of roughly 2-3 tiles. The meso-predator barely feels anything through its feet. A 200kg herbivore walking nearby might be detectable at 4-5 tiles from that same quality 1 limb — the signal is just enormous.

A small herbivore's fore-limb (quality 5) should match the lurker's sensor limb in range — same quality, same detection distance. The small herbivore is a vibration specialist, same as the lurker. Different cognition, same hardware.

**Air vibration:**
A meso-predator's head (quality 2) should detect combat sounds or large-animal-in-brush at roughly 3-4 tiles. This is marginal hearing from display organs that incidentally function as microphones.

An apex predator's head (quality 3) should be slightly better — roughly 4-6 tiles.

**These targets determine the coefficients.** Work backward from target ranges to coefficient values using the range formula with known emission values and quality numbers. The coefficients may differ from the current values. That's expected — the current coefficients were tuned for aggregated sensitivity, not per-zone quality.

### What Changes From Current Implementation

| Component | Current | New |
|---|---|---|
| AI sensitivity computation | `cacheEffectiveSenses` aggregates per creature (max for chemical/visual, sum-with-soft-cap for vibration) | Per-zone computation, no aggregation |
| Player sensitivity | `computePlayerSensoryProfile` aggregates same as AI | Per-zone computation, identical to AI |
| Detection range formula | `cbrt(emission) × aggregatedSensitivity × coeff` | `cbrt(emission) × zoneQuality × coeff` (per zone) |
| SNR computation | Computed in Prompt O's `buildDetectionInfo` using aggregated values | Computed per zone, best SNR per channel used for uncertainty ranges |
| Detection info structure | Binary flags: sizeRelative category, dietType present/absent, species present/absent | Uncertainty ranges: sizeEstimate {lower, upper, estimated}, dietConfidence 0-1, speciesConfidence 0-1 |
| SNR constants | Threshold-based: SNR_MOVEMENT, SNR_MAGNITUDE, SNR_DISCRIMINATION, SNR_IDENTIFICATION, SNR_DETAIL | Curve-based: SIZE_UNCERTAINTY_BASE, DIET_CONF_MIN, DIET_CONF_FULL, SPECIES_CONF_MIN, SPECIES_CONF_FULL |
| `buildDetectionInfo` | Produces binary flags from SNR thresholds | Produces uncertainty ranges and confidence values from continuous SNR |
| `relativeMagnitude` in reactive layer | Returns category from threshold comparison | Reads sizeEstimate bounds, worst-case interpretation |
| Player rendering of non-visual detections | Full sprite at target position, identical to visual | Opacity scaled by best SNR — faint at edge of range, solid up close |
| Channel coefficients | Tuned for aggregated sensitivity values | Retuned for per-zone quality values (will change numerically) |
| VIB_SUM_CAP constant | Used by sum-with-soft-cap | Removed entirely |
| `cacheEffectiveSenses` function | Central to AI detection | Removed |
| `computePlayerSensoryProfile` function | Central to player detection | Removed, replaced by per-zone loop |

### What Does NOT Change

- **Signal emission** (Prompt L-A) — how creatures emit is unchanged
- **Visual FOV** — the cone/LOS system for vision is unchanged
- **The reactive-deliberative architecture** (Prompt O) — the two-layer structure stays. `evaluateReactiveRules` and `deliberativeEvaluation` still run. What changes is the information they consume: `buildDetectionInfo` produces uncertainty ranges instead of binary flags, and `relativeMagnitude` reads size bounds instead of categories. The decision architecture (reactive → override check → deliberative) is untouched.
- **Chemical transducer structure** (Prompt N) — `{ contact, airborne, dissolved }` stays
- **Vibration transducer structure** (Prompt L-A) — `{ ground, air, water }` stays

---

## Implementation Status

**Implemented:**
- Transducer quality values on all creature zones (body map)
- Detection range formula (L-B) — being revised by this spec from aggregated to per-zone
- Coupling media for chemical (contact/airborne/dissolved) and vibration (ground/air/water)
- SNR computation and thresholds gating information quality (Prompt O)
- Reactive-deliberative AI consuming detection info (Prompt O)
- Player non-visual detection rendering (Prompt N) — being revised by this spec to add opacity gradient

**Implementing (this spec):**
- Per-zone independent detection replacing aggregated sensitivity
- SNR = zoneRange / distance, per zone per channel
- Continuous uncertainty ranges replacing binary information thresholds (size as narrowing range, diet/species as confidence curves)
- `buildDetectionInfo` revised to produce ranges and confidences
- Reactive layer reads worst-case size bounds; deliberative layer reads full uncertainty
- Player rendering gradient (opacity scaled by best SNR)
- Coefficient retuning for per-zone quality values
- Removal of sum-with-soft-cap, cacheEffectiveSenses, computePlayerSensoryProfile
- Removal of old SNR threshold constants, replaced by confidence curve constants

*Status (Sep 2026, perception pass 5) — percepts.* Every detection info is a percept: it carries the tile the source is perceived on (`info.x/y`, with distance and bearing to it), and every decision about another body reads it. `detection.js perceptOf(observer, entity)` returns this action's percept; `perceivedPosition(observer, entity)` its tile, or the true tile for a body no sense delivers (a threat that struck from outside the senses, a goal kept by persistence), marked as a placeholder for the last-known position of pass 8. Flee bearings, chase steps, orienting, spacing, the bolt's bearing, the threat bearing, adjacent-prey and adjacent-threat tests and the reactive retaliation test all read it. Physical contact still reads the world: a strike lands on what is actually on the next tile, and nothing steps onto an occupied tile. A creature only strikes an adjacent player it perceives there. The player's display draws from percepts too: sprites on the tile the eyes put a creature on (`player._perceivedAt`), blobs on the tile the other senses put it on. `_perceivedTile` is the one function pass 6 changes; for now it returns the true tile, and 120 turns on seed 7 render pixel-identical to before, with identical behaviour tallies. One display leak closed: ground and cover decorations used to be left off any tile a creature stood on, so a hidden animal showed as a bare patch; now only under a drawn sprite.

*Status (Sep 2026, perception pass 6) — received-signal inference.* `detection.js _inferPercept` replaces the true tile. A channel measures only what arrives (amplitude ∝ emission/d³, or angular size ∝ cbrt(mass)/d), which fixes size³/distance³ and not both: `d_est = d × cbrt(m_est / m_apparent)`, where `m_apparent` is what the received signal would mean at the true distance (`estimateMassFromSignal`, the old estimate). The signal's structure resolves the source's size as SNR rises (footfall cadence for the feet, ground plane and parallax for the eyes, the compound mix for the nose): `w = clamp((SNR−1)/(RESOLVE_SNR−1))`, `m_est = m_self^(1−w) × m_apparent^w`, with RESOLVE_SNR 2 (eyes; binocular SNR × 1.4), 3 (feet), 6 (nose). Below that the yardstick is the observer's own body: a big far animal reads smaller and nearer, a small near one larger and farther. Bearing snaps to bins of 0° (eyes), 90°/SNR (feet), 180°/SNR (nose) laid out from the facing. The best-resolved channel sets size and distance, the finest-bearing channel the direction. Seen on seed 7: a hare feeling a walking wolf 9 tiles behind perceives a 6 kg animal ~6 tiles back, resolving to 17 kg at 4 and 22 kg at 2; a shaleback 14 tiles off feels like 15 kg at 6; a wolf smelling a still hare 4 tiles behind puts it ~7 tiles off, a quadrant out, as something wolf-sized. Everything downstream reads it: size categories, threat and prey tests, flee and chase directions, the player's markers. A strike at a misplaced percept hits air (`performHuntAttack` checks contact). Effect on seed 7 over 300 turns: hare flee time 935 → 92 creature-turns. On main most flights were from shalebacks felt from afar (703 of the flee-ticks tallied, a 200 kg grazer read at its true size) and from other hares' bolts misread as heavy walkers (228); now distant ones read small and near until they resolve, so hares stop stampeding at range. (The inconsistency noted here, a creature knowing "wolf" while reading it hare-sized, was closed by pass 7.)

*Status (Sep 2026, perception pass 6b-2) — smell.* Airborne chemistry is no longer an entity channel at range: it is read off the scent field as anonymous plume percepts (Chemical-Scent-System-Design), bound to detected animals only by integration tissue. Within one tile the nose localises a scent hotspot as an animal (near-field detection, diet and wound chemistry from the air's composition, not from the animal). Diet confidence for anything farther comes only from binding.

*Status (Sep 2026, perception pass 7) — identification by features.* The species label is no longer copied from the animal once an SNR passes 2.2. `detection.js _identify` matches what the channels resolve against wired templates, one per species of the observer's world (every `MON` species on its layer), each built from that species' template body: mass, locomotion-limb count, integument brightness, volatile mix, and the diet that goes with the mix. Features count with the weight their channel resolves them at (the same w as for size): mass from the size estimate, limbs from footfall pattern or silhouette (the better of feet and eyes), brightness from the eyes, the mix of the air on the source's tile from the near-field nose. Differences are measured in units (a doubling of mass, two limbs, 0.1 brightness, 0.5 of mix distance); confidence is the margin between the best template and the runner-up, full at one unit (`ID_MARGIN`). A recognised species replaces the observer's own body as the size prior in proportion to the confidence, so the pass-6 inconsistency (knowing "wolf" and reading it hare-sized) is gone, and it brings its template's diet. Recognition (`SPECIES_DISPLAY_CONFIDENCE`, 0.75) gates the display's sprite and the kin tests. Seen on seed 7: a hare feeling a walking wolf 9 tiles behind takes it for a hare (0.05), at 6 a tentative wolf (0.18), recognised at 4 (0.77); a shaleback felt 14 tiles off is taken for a wolf (0.28), at 8 for a ravager (0.44), at 4 for a shaleback (1.0). A wolf missing a leg shows as five limbs to a sharp enough observer. The display draws a recognised creature as the species it is taken for (template sprite and tint), and look / right-click inspection names the perceived species, "something like a …" for a felt one, nothing for one no sense delivers. Not yet: combat log lines name the true species (contact).

*Status (Sep 2026, perception pass 8) — traces and evidence.* Every percept writes a trace into the observer's integration tissue (`detection.js _updateTraces`): tile, turn, and how many consecutive turns it has been perceived. The tissue holds a trace for integrationCapacity × PERSISTENCE_SCALE turns: ~3.8 for a prowler, ~7.6 for a ravager, ~4.6 for a shaleback, ~0.4 for a lurker, 0 for a hare. `perceivedPosition` falls back to the held trace, then to nothing: the true-position placeholder of pass 5 is gone. A strike writes a contact trace for the turn it lands (`recordContact`), tissue or not. Evidence summation: an observer that has kept a source in its senses over consecutive turns, as far back as it holds, has summed the looks; independent looks add in quadrature, so the SNR the inference works with (size, place, identity, the size bracket) grows as sqrt(1 + turns held). It does not make anything detectable that is not. The player sums too (its markers sharpen as it watches). Seen on seed 7: a wolf glancing at a still, part-hidden hare 3 tiles off makes out "hare?" (0.03) at 10.8 kg [3-40]; one turn of watching later a recognised hare at 5.8 kg, the bracket narrowing to [2-14] over the three turns its tissue holds. The runtime Maps (`_traces`, `_perceivedAt`, `_visuallyDetected`) and `plume`, `_scentTrace` are stripped from saves.

**Perception honesty (planned Sep 2026, passes in `Todo.md`):** perception becomes inference from received signal rather than the truth with error bars. Decided with the person: error is systematic, never dice (a quiet near thing reads as a small far thing; look-alike species collide at the margin); the player is not exempt, and the display lies (a creature is drawn on its single perceived tile, as its perceived species); identification starts from wired (crystallized) templates for the species a creature shares its spawn table with, learned templates later; retune after the passes land.

**Designed, not yet implementable:**
- Sensitivity windows with per-receptor tuning curves
- Saturation modeling (signal clipping above max operating range)
- Gain control and adaptation (baseline subtraction over turns). Self-noise from the body's own footfalls is in (pass 4); adaptation to external background is not.
- Per-limb window specialization
- Per-window pattern libraries (depends on memory system, Phase 4)
- Territory-based sensory calibration (adapted baselines in familiar territory)
- Gait signatures derived from body map (limb count, mass distribution, locomotion pattern) for vibration-based species identification — each species has a unique footfall pattern, making vibration identification physical rather than abstract
- Individual chemical signatures — each creature has a unique volatile compound "name" that distinguishes individuals of the same species through scent, enabling tracking of specific animals
- Visual silhouette identification — mass distribution and limb configuration produce a visual outline that allows species identification (and misidentification of similarly-shaped species) through visual detection
- Identification confusion for physically similar species — creatures with similar mass, similar gait, and similar outline can be mistaken for each other at marginal SNR, resolving only at high SNR when fine details distinguish them

---

## What This Document Constrains

| Decision | Constrained by |
|---|---|
| Whether a creature detects something | Per-zone range check: does any zone's transducer quality on any channel produce a range that reaches the target? |
| How much the creature learns from a detection | Best SNR across all detecting zones, checked against SNR thresholds |
| How a non-visual detection appears to the player | Opacity scaled by best SNR — faint at edge of range, solid up close |
| Whether a creature can identify species from detection | SNR on the detecting channel above SNR_IDENTIFICATION + pattern library (approximated by quality threshold until memory system exists) |
| Whether a creature knows how big something is | SNR above SNR_MAGNITUDE — low SNR gives no magnitude, moderate gives rough category, high gives precise estimate |
| Whether a sensor is "overwhelmed" by a huge signal | Sensitivity windows (future) — saturation when signal exceeds operating range |
| Whether different limbs detect different things | Per-zone detection (this spec) + sensitivity window tuning (future) |
| Whether a creature adapts to background noise | Gain control (future) — sustained signals adapted out over turns |
| Whether entering new territory impairs senses | Adaptation period (future) — sensors calibrated to old baseline need time to recalibrate |
| What information the cognitive system receives | SNR output from the per-zone sensory system — cognition works with whatever the senses provide |
