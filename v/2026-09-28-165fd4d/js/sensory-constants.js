// ==================== SENSORY CONSTANTS ====================
// Signal emission coefficients, detection range coefficients, confidence
// thresholds, rendering thresholds, and ambient sensing coefficients.
// Split from constants.js — pure data, no imports.

// ==================== SIGNAL EMISSION CONSTANTS (Prompt L-A) ====================
// Chemical emission
export const CHEM_MASS_COEFF     = 0.1;    // base emission per kg of mass
export const CHEM_PREDATOR_MULT  = 1.6;    // predators smell 60% stronger (protein metabolism)
export const CHEM_ACTIVITY_MULT  = 1.4;    // moving increases emission by 40%
export const CHEM_WOUND_COEFF    = 0.3;    // wound emission per kg per unit of blood loss severity

// Vibration emission
// Ground vibration is the footfall impulse a moving body puts into the
// substrate, proportional to the mass carried (Sensory-Design: a lurker's
// quality-5 sensor feels a moving 22 kg meso-predator at 10-12 tiles and a
// 200 kg herbivore at 15+; a quality-1 limb feels the meso at ~2). It used to
// be divided by foot contact area, which cancelled to a gait ratio and made a
// 200 kg wader quieter than a wolf.
export const VIB_GROUND_COEFF       = 0.08;  // ground vibration emission per kg of moving mass
export const VIB_AIR_BASELINE_COEFF = 0.005; // air vibration from breathing per kg (always on)
export const VIB_AIR_ACTIVITY_COEFF = 0.02;  // additional air vibration from movement per kg
export const VIB_AIR_COMBAT_BONUS   = 3.0;   // flat bonus during combat (impacts are loud in air)
export const VIB_WATER_COEFF        = 0.2;   // water vibration from movement per kg
export const VIB_WATER_IDLE_COEFF   = 0.02;  // water vibration from being still in water per kg

// Visual detectability
export const VIS_SIZE_COEFF    = 1.0;   // visual detectability per cube-root-kg
// DEPRECATED — motion's effect on visual detection is now handled entirely by
// MOTION_SIGNAL_MOVING / MOTION_SIGNAL_STILL in detection.js (Visual Detection
// Pass 1). Retained for reference only. Do not use.
// export const VIS_MOVEMENT_MULT = 3.0;

// --- Perception Range (Prompt P) — per-zone detection coefficients ---
// Retuned for per-zone quality (no aggregation). Range = cbrt(emission) × quality × coeff.
// Chemical: meso-pred nose (q6) detects 22kg meso at ~12-13 tiles.
// VibGround: lurker sensor (q5) detects 22kg meso at ~10-11 tiles; q1 limb at ~2 tiles.
// VibAir: meso-pred head (q2) detects combat at ~3-4 tiles.
export const CHEM_RANGE_COEFF        = 1.3;   // chemical airborne range coefficient
export const VIB_GROUND_RANGE_COEFF  = 1.75;  // ground vibration range coefficient
export const VIB_AIR_RANGE_COEFF     = 1.15;  // air vibration range coefficient
export const VIS_RANGE_COEFF         = 2.2;   // visual range = cbrt(mass) × motion × contrast × sqrt(light) × sensitivity × coeff (linear: vision does not spread)
export const MAX_DETECTION_DISTANCE  = 40;    // absolute ceiling — nothing detected beyond this

// ── Ambient terrain sensing ──
// Per-channel coefficients: tiles of ambient awareness per unit of transducer quality.
// These determine how far each sensory channel reveals terrain around the creature.
// Ambient sensing marks terrain as explored; it does NOT reveal entities.
export const AMBIENT_VISUAL_COEFF   = 5.0;   // tiles per unit visual transducer quality (before light modifier)
export const AMBIENT_CHEM_COEFF     = 4.0;   // tiles per unit chemical.airborne quality
export const AMBIENT_VIB_COEFF      = 3.0;   // tiles per unit vibration.ground quality

// --- Continuous Uncertainty (Prompt P) ---
// Replaces binary SNR thresholds with continuously narrowing ranges.
// Size uncertainty: range width = SIZE_UNCERTAINTY_BASE / bestSNR
export const SIZE_UNCERTAINTY_BASE   = 3.0;    // controls how wide size range is at low SNR

// Diet discrimination confidence curve (chemical airborne only)
export const DIET_CONF_MIN          = 2.0;     // SNR below this: diet unknown
export const DIET_CONF_FULL         = 6.0;     // SNR above this: diet certain

// Species identification confidence curve (any channel)
export const SPECIES_CONF_MIN       = 1.2;     // SNR below this: species unknown
export const SPECIES_CONF_FULL      = 2.2;    // SNR above this: species identified

// Wound/condition detection confidence curve
export const CONDITION_CONF_MIN     = 7.0;
export const CONDITION_CONF_FULL    = 14.0;

// Deliberative diet decision threshold — must have this confidence to commit
export const DIET_DECISION_THRESHOLD = 0.7;

// SNR-based player rendering (Phase 3)
export const SNR_FULL_RENDER        = 5.0;     // SNR at which sprite reaches full opacity

// --- Species-Confidence Gated Rendering (Prompt Q) ---
// Below this confidence, non-visual detections render as generic size-scaled blobs.
// Above it, the creature's actual sprite is shown.  Separate from the AI's
// DIET_DECISION_THRESHOLD (0.7) — the player "recognises" a species visually at
// a potentially different confidence than an AI creature commits to a diet classification.
export const SPECIES_DISPLAY_CONFIDENCE = 0.75;

// Unidentified creature marker sizing (Prompt Q)
// Cube-root mass scaling maps the biological range onto a manageable visual range.
export const MARKER_MIN_RADIUS = 0.15;   // fraction of tile size for smallest creatures
export const MARKER_MAX_RADIUS = 0.45;   // fraction of tile size for largest creatures
export const MARKER_MASS_MIN   = 3;      // kg — at or below this → minimum marker
export const MARKER_MASS_MAX   = 250;    // kg — at or above this → maximum marker

// ==================== VISUAL OCCLUSION CONSTANTS ====================
// Per-ray sightline opacity accumulation and local concealment modifiers.
// See Visual-Occlusion-Design.md for full specification.

// ── Visual Detection Pass 1: Motion & Background Contrast ──
// Motion factor: binary — did the creature change tiles this turn?
// A moving creature fires temporal change detection (fast, involuntary).
// A stationary creature requires spatial pattern recognition (slow, effortful).
// The asymmetry is compressed from biological reality (~10-100× on Earth)
// for playability, but must remain dramatic enough that stillness is a
// meaningful survival strategy. The ratio below (7.8×) is the ratio of
// ranges: the visual range is linear in it (detection.js getVisualRange).
export const MOTION_SIGNAL_MOVING        = 3.5;    // a prowler walking across the view (the anchor for the velocity law below)
export const MOTION_SIGNAL_STILL         = 0.45;   // stationary creature signal multiplier (was 0.25 — too harsh at short range)

// ── Motion as velocity (perception pass 4) ──
// The eye's change detection responds to how fast the target moves across
// its line of sight; motion straight toward or away from the eye (looming or
// shrinking) is detected at a fraction of that. The signal is
//   STILL + (MOVING − STILL) × (across + RADIAL_WEIGHT × |along|) / ANCHOR_SPEED
// with speeds in tiles per world tick, anchored so a prowler walking across
// the view (0.73 tiles/tick: one tile per 1.37 ticks, measured) reads MOVING
// as before. A creep crosses at 40% of that, a sprinting hare at ~2×, and a
// walker coming head-on reads at 0.35 of a crossing one: stalk straight in.
export const MOTION_ANCHOR_SPEED         = 0.73;   // tiles per world tick: a prowler at a walk
export const MOTION_RADIAL_WEIGHT        = 0.35;   // sensitivity to motion along the sightline, relative to across it

// A looming circuit on the eyes fires as a seen body closes, harder the
// sooner contact would come. It saturates at contact and falls to nothing
// when contact is this many of the observer's own actions away: the time it
// has to get out of the way. Wired into the hare's threat template.
export const LOOM_WINDOW_ACTIONS         = 4;

// ── Received-signal inference (perception pass 6) ──
// A channel measures only what arrives: an amplitude (smell, footfalls,
// breath) that goes as emission / d³, or an angular size that goes as
// cbrt(mass) / d. Either fixes size³ / distance³, not both, so every size
// estimate implies a distance: d_est = d × cbrt(m_est / m_apparent). With
// nothing else to go on the observer's only yardstick is its own body (what
// it would be if it were like me). What breaks the tie is the signal's
// structure, which resolves the source's size as SNR rises: footfall cadence
// and spectrum for ground vibration, the ground plane and parallax for the
// eyes, the compound mix for smell. The weight of that structure is
//   w = clamp((SNR − 1) / (RESOLVE_SNR − 1), 0, 1)
// and the size estimate slides from the yardstick to the signal:
//   m_est = m_self^(1 − w) × m_apparent^w.
// So below the resolving SNR a big distant animal reads as a smaller, nearer
// one and a small near one as a larger, farther one: systematic, not dice.
export const VIS_RESOLVE_SNR   = 2.0;   // eyes: ground-plane distance is a strong cue
export const VIB_RESOLVE_SNR   = 3.0;   // feet: a few footfalls clear of the noise give a cadence
export const CHEM_RESOLVE_SNR  = 6.0;   // nose: the compound mix, as for diet (DIET_CONF_FULL)
// Two eyes on it: parallax adds a distance cue, as the depth bonus does for cover.
// (BINOCULAR_DEPTH_BONUS multiplies the visual SNR for this purpose.)

// Bearing: each channel resolves direction to bins of this many degrees at
// SNR 1, narrowing as 1/SNR, laid out from the observer's facing. The
// perceived bearing is the centre of the bin the true one falls in. Eyes are
// sharp at tile scale; feet on the ground hear which side and roughly
// where; a nose without a gradient barely knows front from back.
export const VIS_BEARING_RES_DEG  = 0;
export const VIB_BEARING_RES_DEG  = 90;
export const CHEM_BEARING_RES_DEG = 180;

// Olfactory adaptation (perception pass 6b-2): a nose is adapted to its own
// odour, the constant background its body holds the air at on its own tile
// (scent.js ownAirborneLevel). An adapted sense detects an increment only
// above a fixed fraction of its background (Weber's law); olfaction's
// fraction is roughly a quarter. So a meat-eater's own reek raises its
// threshold for meat-eater volatiles and a grazer's for plant ones.
export const OLFACTORY_WEBER_FRACTION = 0.25;

// Own footfalls in the listening channel. A body's ground-vibration
// transducers hear its own steps as they would a neighbour of the same weight
// at this many tiles (every sensor on a 5-200 kg body is within a stride of
// its feet). Real coupling through the body is tighter; this is the
// conservative bound. Walking, a hare's fore-limbs feel a walking prowler at
// ~1.6 tiles instead of ~10.6; creeping, ~2.9; standing, the full range.
export const SELF_FOOTFALL_DISTANCE      = 1.0;

// Background contrast: how different the creature's integument looks
// from the terrain it's standing on.
export const CONTRAST_FLOOR              = 0.08;   // minimum contrast even at perfect match (was 0.10)
export const BRIGHTNESS_CONTRAST_WEIGHT  = 3.5;    // brightness difference weight — luminance dominates (was 1.5)
export const HUE_MISMATCH_PENALTY        = 0.50;   // additional contrast from categorical hue mismatch (was 0.30)

// Bleed contrast: cyan blood against dark red flora is maximum contrast.
// Wounds are beacons. More bleeding = more visible, up to saturation.
export const BLEED_CONTRAST_BONUS        = 0.40;   // max additional contrast from visible bleeding
export const BLEED_VISUAL_SATURATION     = 0.50;   // blood loss fraction at which bonus saturates

// Occlusion budget = acuity × OCCLUSION_BUDGET_COEFF.
// Tuned so acuity 3 → budget ~1.35 (2–3 dense forest tiles before cutoff),
//          acuity 5 → budget ~2.25 (4–5 dense forest tiles).
export const OCCLUSION_BUDGET_COEFF      = 0.45;

// Binocular zone rays get a depth bonus — stereoscopic separation of
// "cover at 3 tiles" from "target at 5 tiles."
export const BINOCULAR_DEPTH_BONUS       = 1.4;

// Motion reduces concealment: a moving creature retains only this fraction
// of its cover's concealment benefit (grass rustling reveals movement).
export const MOTION_CONCEALMENT_REDUCTION = 0.35;

// Creature height proxy: (totalMass)^(1/3) × this coefficient.
// Tuned so hare (5 kg) ≈ 0.31, meso-pred (22 kg) ≈ 0.50,
//        apex (90 kg) ≈ 0.81, cave-crab (200 kg) ≈ 1.05.
export const BODY_PLAN_HEIGHT_COEFF      = 0.18;
