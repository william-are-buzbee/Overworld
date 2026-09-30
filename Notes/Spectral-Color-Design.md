# Spectral Color Design — what colour a thing is, what light does to it, what an eye makes of it

The canon for every colour question in Overworld and in the planet viewer. The code is `js/spectra.js`; the planet viewer
is to carry a verbatim copy of it (change it here, then copy it there). Include this document for any visual, palette, sprite,
rendering, camouflage or vision work, alongside Design-Principles.md and Ecology-Foundations.md. How materials are laid out on a
tile (texture profiles, the mixotroph growth form) is in `Material-Textures.md`.

This replaced the three-layer RGB system (material × star × adaptation as three per-channel multipliers) on 30 Sep 2026. That
system was the right idea in the wrong representation: with three numbers per colour, the star and the eye's adaptation
multiplied out to R×0.790, G×0.806, B×0.728 — a slight darkening — so neither layer did anything observable; it could not
say what any particular eye sees; material colours were tuned to hit a desired screen colour; detection never used it (it
compared hue *names*); and three copies of the numbers disagreed. Colour is now carried as a spectrum from the surface to the
receptor, and the only non-physical step is the last one, drawing the player's eye on a human's screen.

---

## The question this answers

"What colour is this, really?" has one physical answer: its **reflectance spectrum**, the fraction of light it sends back at
each wavelength. Everything else is that spectrum passing through things:

| step | what | physical or convention | where it lives |
|---|---|---|---|
| 1 | the surface's reflectance R(λ) | physical: what it is made of | material compositions (below); later the body map's integument |
| 2 | × the light reaching it, I(λ) | physical: star, atmosphere, canopy, shadow, water | the world and the time of day |
| 3 | × one eye's receptor classes | physical: that eye's opsins, lens, size | that species' body map |
| 4 | the player's eye's signals → screen RGB | **convention** | `DISPLAY` in `spectra.js` |

So every colour is filtered through exactly **one** eye, and you always know whose. Detection (can the wolf see the hare
against the mat?) stops at step 3 and measures contrast in that eye's own terms. Only the screen goes on to step 4, and only
ever through the player's eye. "What colour is it" as a *word* — the label an artist or a doc uses — is the reference
observer's answer: a human under Earth's noon sun (`referenceColor`). No creature on the planet has that eye.

Wavelengths run 300–800 nm at 5 nm (UV to near-infrared). Light is photon flux per nm, in "noons": Earth's noon sun on a
horizontal surface catches 1 over 400–700 nm.

---

## 1. Surfaces

### Chromophores

A chromophore is a molecule or mineral site that absorbs light. Each is an absorption spectrum per unit concentration, built
from the physical kinds of absorber: a **band** (an electronic transition), an **edge** (charge transfer: absorbs everything
shorter than it), a **tail** (degraded mixed organics, the way humic stain absorbs).

| chromophore | shape | what it does |
|---|---|---|
| `photosynthetic` | bands at 470 and 560 nm, and 345 nm | absorbs violet-blue through yellow, reflects red; a weak window near 400 nm gives the crimson its violet undertone |
| `humic` | tail from 440 nm | degraded pigment and structural organics: brown |
| `hematite` | edge at 575 nm | iron(III) oxide, red |
| `goethite` | edge at 505 nm | iron(III) oxyhydroxide, yellow-ochre |
| `copper` | broad band at 700 nm, edge at 445 | copper(II) sites: absorbs red, green-teal |
| `manganese` | band at 535 nm (and weakly 640) | manganese(III): absorbs green, violet |
| `hemocyanin_oxy` | bands at 345 and 650 nm | oxygenated blood: blue-cyan |
| `hemocyanin` | band at 345 nm | deoxygenated blood: nearly colourless |
| `carbonate` | UV edge at 320 nm | bone-like calcium structure: white |
| `black` | flat | carbonised or finely divided dark matter |

Pure water's absorption is measured data (Pope & Fry 1997, Smith & Baker 1981), not a shape.

### From chromophores to reflectance

A material is a scattering matrix carrying chromophores. Its reflectance comes from **Kubelka–Munk** theory: absorption K (the
chromophores) against scattering S (the matrix). Only K/S matters for a thick layer. Every surface also reflects about 2%
straight off its face (specular).

There are two ways to mix, and they are different physics:

- **Intimate mixing** (grains ground together, pigment in tissue, a mixotroph's crimson over its mineral base): K and S add.
  This is subtractive, like paint. `mixMaterials`.
- **Areal mixing** (mat patches with soil between, seen as one tile): reflectances average by area. This is additive, like
  pointillism. `mixSurfaces`.

The same two materials give different colours by the two routes. A tile's bg is usually areal (how much of the ground is
covered by what); a material's own colour is intimate.

**Wetting** fills the pores with water. Scattering at a grain face goes as the square of the refractive-index step: grain
(≈1.55) to air is 0.55, grain to water 0.22. So a soaked surface keeps (0.22/0.55)² ≈ 16% of its scattering and goes darker
and more saturated, with a little more specular. There's no tuned darkening constant.

**Water** seen from above is a column over a bottom: molecules and particles scatter some light back before absorption takes
it (the deep colour), and the bottom shows through, attenuated twice over the depth (`waterColumn`). Deep clear water is blue
because water absorbs red. The bottom disappears first in the red, so shallow water over iron sand goes from ochre (0.5 m) to
grey-green (3 m) to blue.

### The planet's materials

| material | composition |
|---|---|
| `photosynthetic_tissue` | photosynthetic 24, black 0.1 |
| `dead_organic` | humic 4.3, black 0.44 |
| `hemolymph` | hemocyanin_oxy 2.6, black 0.21 |
| `calcium_structure` | carbonate 0.1, humic 0.066 |

**Mineral-bearing materials.** A mineral brings the same chromophores into whatever takes it up (`MINERAL_LOADING`):

| mineral | per unit of the tile's field |
|---|---|
| iron | hematite 0.31, goethite 5.1, black 0.5 |
| copper | copper 3.4, black 0.13 |
| manganese | manganese 7.6, black 0.32 |

The unit is world-gen's iron, copper and manganese fields at 1.0. Each kind of material is its own matrix (`MATRICES`), set by
three things:

- what it is with no minerals;
- how strongly it scatters: fine soil scatters more than massive bedrock or ceramic trunk, so the same iron reads deeper in
  those;
- how strongly it takes minerals up: a chemotrophic colony concentrates them (uptake 1.5), sand barely does.

So `mineralMaterial('wood', { iron: 0.4, copper: 0.1 })` is a trunk in that soil. There are no endpoint colours blended by
concentration. Mixed chemistry mixes chromophores, which is how minerals actually mix.

**How the numbers were set.** Each composition is what the material is made of. The numbers were authored once so that the
reference observer (a human, white light) sees the colour the art direction already described for it: the old doc's white-light
table, from crimson-maroon tissue to violet manganese colonies. That's the legitimate use of a target, because it is what
"Layer 1" always meant. The old sin was different: tuning a source colour to hit a desired *screen* colour. Screen colours are
never targets now; they follow.

Two deliberate changes from the old table:

- **Bone** is aimed at the warm off-white it was meant to be (the old value was pushed pink to compensate for the pipeline).
- **Photosynthetic tissue** carries some grey absorber. Nothing organic sends back nearly all red light, and without it a
  long-wave eye saw the mat glow.

Reference colours (human, Earth noon; `node tools/spectra.mjs` prints these and everything below):

| surface | ref | surface | ref | surface | ref |
|---|---|---|---|---|---|
| photosynthetic tissue | `#762A3E` | soil, plain | `#9F9179` | colony, iron | `#9F6938` |
| dead organic | `#8B6E4E` | soil, iron | `#92673E` | colony, copper | `#3E9280` |
| hemolymph | `#4A90B3` | soil, copper | `#5E7F6A` | colony, manganese | `#583E7A` |
| calcium structure | `#E1D7C7` | soil, manganese | `#594568` | mat, manganese | `#493860` |
| wood, iron | `#82522C` | sand, iron | `#A97949` | spire, manganese | `#6B508E` |
| wood, copper | `#2B7561` | sand, plain | `#B9B09F` | soil, iron, soaked | `#5A4537` |
| wood, manganese | `#44325D` | bedrock, iron | `#744E2F` | mixotroph (tissue + Mn colony) | `#5A364D` |
| water 0.5 m over iron sand | `#997B54` | water 3 m over iron sand | `#5E7260` | deep water | `#125E88` |

Known misses against the art direction:

- Hemolymph comes out blue rather than cyan. That is what hemocyanin does; the lore said "blue-cyan".
- Iron soil is a little yellower than the old rust.
- Copper matrices are softer than their old hexes.

**Integument.** A creature's skin, plates or shell is a material too, so its colour is a composition in its body map
(chromophores per zone, e.g. hemocyanin showing through thin skin, the Clade B layered plate). Today it is
`{ brightness, hue: 'amber-brown' }` per species (`body-maps.js`). Replacing that is a later pass (below).

---

## 2. Light

**The star.** A blackbody at 4800 K with 0.65 of Earth's photon flux at the top of the atmosphere. Ecology-Foundations says
yellow-orange, "slightly cooler than Sol" (5778 K), ~60–70% of Earth. The **atmosphere** is Rayleigh-scattering with an optical
depth of 0.118 at 550 nm: Earth's 0.098 scaled by the lore's ~1.2 atm.

**Daylight** (`daylight(elevation)`):

- **Direct beam.** It loses blue to scattering along its path (Kasten–Young airmass), so a low star is redder and dimmer.
- **The sky.** It is the scattered light, bluer than the beam. Shadow from an opaque thing (rock, trunk, burrow mouth) is lit
  by the sky alone.
- **Twilight.** Below the horizon the overhead sky stays lit, falling ~10× per 3° of depression.
- **Night sky.** After twilight, only the night sky: `NIGHT_SKY.flux` noons.

On the ground at noon (star at 60°) the planet gets about 0.53 noons, 7% of it from the sky. At 15° it gets 0.14, on the
horizon 0.0065, at −4° 3e-4.

**Canopy.** Fronds transmit what their pigment doesn't absorb (Kubelka–Munk for a thin layer). Under a crimson canopy with 15%
gaps the floor gets 0.15 noons, and what gets through the fronds is **red**. A grey stone on the forest floor, seen by a human
still adapted to open ground, is `#4C3537`; in a rock's shadow it is `#15263F`. The old doc's "full canopy ×0.55" said the forest floor was darker; physics says it
is darker and red-lit.

**Water.** Light at depth falls by water's absorption, red first (`underwater`).

**Underground.** Nothing here yet: no star means no light, which is what `getLightLevel` already says (0 underground). Light
sources — lava, bioluminescence, if the lore wants them — would be emitters with their own spectra, added to the light at a
tile.

### What a native sees of its star: nothing

An eye that evolved under this star adapts to it (step 3). Its white is the star's white. The amber tint the old Layer 2 put on
everything is real in the light but gone from the animal's experience, just as Earth's sunlight doesn't look yellow to us:

- A **human** stepping off a ship, still adapted to Earth light, would see the planet's noon as dim and amber (a grey card is
  `#6F6455`).
- A **native**, or the human after a few minutes, sees the grey card as grey.

What natives *do* see is **change** in the light before they adapt to it: the low star, the red forest floor, a blue-lit
shadow. The absolute level matters only once photons run short (dusk, night, the floor of a dense forest). At 0.53 noons, noon
is broad daylight to any eye, not dim.

This bears on Ecology-Foundations' "perpetual late afternoon — warm-toned, dim". Physically:

- The warmth is visible only to a visitor, or in changing light.
- The dimness is ~65% of Earth's daylight: a bright overcast day, well above where colour vision falters.

"Warm-toned" can still be a presentation choice (step 4), but it isn't what a native sees. The person decides.

---

## 3. Eyes

### The eye in the body map

An eye today is `{ acuity, placement, fieldAngle }` on a zone's visual transducer. Spectral vision adds the physical parts that
decide what light does to it. These fields go on the same visual transducer:

| field | what it is | what it does |
|---|---|---|
| `receptors[]` | receptor classes, each `{ lambdaMax, share, weber }` | `lambdaMax`: the opsin's peak (the whole absorption curve follows from it: Govardovskii 2000 template). `share`: the class's fraction of the receptors. `weber`: one receptor's noise as a Weber fraction (default 0.05) |
| `lensCutoffNm` | wavelength where the lens and cornea pass half the light | below it the eye is blind; a UV-seeing eye has a clear lens (~330) |
| `apertureMm` | pupil diameter | light gathered ∝ aperture² |
| `focalMm` | focal length | with receptor width, sets how much of the scene one receptor sees |
| `receptorUm` | receptor width | wider catches more photons, resolves less |
| `integrationMs` | how long a receptor sums photons | longer is more sensitive, worse at motion |
| `halfSaturationPhotons` | photons per integration at which a receptor gives half its response | below it the scene goes dim |

Photons per receptor come from Land's formula (N ∝ D²(d/f)² × radiance × Δt), so a big-eyed, wide-receptor, slow eye sees at
dusk where a small fast one doesn't. Destroy the zone and its eye is gone; nothing else in the body carries colour vision. That
is the Design-Principles test.

Later, `acuity` itself should follow from focal length and receptor spacing, but that is its own pass.

### What the eye computes

- **Catch** of each receptor class: ∫ R(λ) I(λ) S(λ) dλ, where S is the opsin through the lens.
- **Adaptation** (von Kries): each class's gain is set so white under the adapting light gives 1. Here it happens at once, to
  the light at the eye. In tissue it takes time (photopigment bleaching and regeneration: seconds in bright light, many minutes
  into the dark). That is state held in the receptors, which the Design-Principles allow ("persistence needs tissue that can
  hold it"), and it is what makes walking into the forest or a cave go dark and red and then recover. The time course isn't
  held yet: see "Next passes".
- **Contrast** (`contrast(eye, Ra, Rb, light)`), in just-noticeable differences (JNDs). This uses the receptor-noise-limited
  model (Vorobyev & Osorio 1998; Vorobyev et al. 2001):
  - Each class's noise is its Weber fraction shared over its receptors, plus photon shot noise.
  - **Chromatic contrast**: the distance between the two catches with brightness removed (the general n-class form).
  - **Achromatic contrast**: the brightness difference against the pooled channel's noise.
  - Below ~1 JND the eye cannot tell them apart. In dim light shot noise grows, colour goes first, and brightness contrast
    holds longer. That is why dusk is colourless, and here it follows from the eye's photon count, not a light-level constant.

`contrast` is the interface detection should read. It replaces the categorical hue test (`HUE_MISMATCH_PENALTY` if two strings
differ), `TERRAIN_VISUAL`'s brightness/hue pairs, and the brightness-difference weight. It gives the number of JNDs between an
integument and what is behind it, *for that observer, in that light*. Camouflage then becomes a fact about two bodies and a
place, not a tag.

### Proposed eyes

No doc says what the founder lineages' eyes are made of (Ecology-Foundations gives only their number and placement). These are
proposals, in `PROPOSED_EYES`, a marked placeholder that nothing in play reads. **They are the person's to accept or change**
before any of them moves into a body map:

| species | classes (nm) | lens | eye | reasoning |
|---|---|---|---|---|
| prowler (Clade A) | 455, 570 | 400 | 6 mm aperture, 14 mm focal, 3 µm, 30 ms | Clade A's vision is secondary to smell: ancestrally two classes, like most mammals |
| ravager (Clade A) | 470, 595 | 410 | 9, 18, 3.5 µm, 40 ms | forest-interior hunter: long class moved into the red light under the canopy; big slow eyes for the dim floor |
| grazer (Clade B) | 365, 470, 575 | 330 | 5, 9, 3 µm, 20 ms | Clade B's four eyes are for motion and pattern: fast integration; ancestrally three classes with UV |
| shaleback (Clade B) | 370, 455, 525, 600 | 340 | 10, 20, 2.5 µm, 30 ms | "the best vision on the surface": a fourth class; big eyes |
| lurker (Clade B) | 490, 580 | 400 | 7, 12, 4 µm, 50 ms | waits in the substrate: lost UV, wide receptors, long integration for dim ground |

What they imply. Chromatic / achromatic JNDs; below ~1 means "can't tell". From `node tools/spectra.mjs`:

| pair | light | human | prowler | ravager | grazer | shaleback | lurker |
|---|---|---|---|---|---|---|---|
| hemolymph vs crimson mat | noon | 7.6 / 26 | 9.7 / 21 | 13 / 6.7 | 12 / 21 | 18 / 16 | 14 / 18 |
| hemolymph vs crimson mat | dusk (−4°) | 1.0 / 5.1 | 3.9 / 14 | 7.7 / 9.5 | 5.2 / 14 | 7.9 / 12 | 9.7 / 20 |
| crimson mat vs iron soil | noon | 4.4 / 19 | 1.4 / 15 | 2.9 / 6.2 | 2.6 / 13 | 9.0 / 8.3 | 3.4 / 12 |
| dead organic vs iron soil | noon | 1.4 / 1.0 | 2.7 / 0.8 | 2.2 / 0.8 | 3.0 / 1.0 | 2.6 / 1.4 | 2.3 / 1.1 |

Read off:

- **Wounds are beacons** (Ecology-Foundations) to every eye, even at dusk.
- **The prowler, a dichromat, can barely tell the crimson mat from iron soil by colour** (1.4 JND): to it they differ in
  brightness. The four-class shaleback sees them 9 JND apart.
- **Everyone sees brown detritus on brown soil as nearly the same** (1–3 JND): a hunting ground for anything the colour of
  dead mat.

These are the kinds of fact camouflage should come from.

---

## 4. The screen

The one convention. The player's eye is drawn so that **what it can tell apart looks apart on screen, by as much as it can tell
them apart** (`screenColor(eye, R, light, adaptingLight)`):

- **Lightness**: the eye's share-weighted catch relative to white in the light it is adapted to, dimmed as its receptors fall
  below half-saturation (the eye's own photon numbers).
- **Chroma**: the eye's chromatic distance from grey in JNDs, on a log scale (Fechner). Two numbers set the scale
  (`DISPLAY.chromaPerLog`, `chromaJND`). They are **calibrated once** so the human eye, drawn this way, matches exact human
  colorimetry (`humanColor`). `node tools/spectra.mjs --calibrate` refits them and should print the values in the file.
- **Hue**: the **dominant wavelength**, the way colorimetry defines hue for us. Take the pure spectral light (or, past both
  ends, a mix of the two ends: purple) that this eye would see in the same direction from grey, and draw it in the hue a human
  sees that light as.
  - Ultraviolet gets a violet deeper than any human's (`uvHueStep`).
  - A dichromat, which sees all long wavelengths alike, draws their mean hue.

Consequences, all without hand-set colours:

- **A dichromat draws on one blue–yellow axis.** The prowler sees the crimson mat as olive-brown (`#6C4508`), blood as blue.
- **Dusk and night lose colour, then brightness,** at rates set by the player's eye.
- **An eye whose middle class sits at 470 nm (the grazer) draws hue-shifted.** Brown detritus comes out green (`#417E4D`),
  because what it catches most is short of its long class and long of its UV class. That is the dominant wavelength for that
  eye.
- **Walking from open ground into the forest shifts the screen red** until the eye adapts. Only when adaptation holds a time
  course (below); today it adapts at once.

Only the player's eye is ever drawn. NPC eyes are never rendered, only read through `contrast`. The human reference observer
is used for labels, for authoring materials, and for the calibration.

**The person's call.** Drawing the world through the player species' eye is a large change of look: a prowler's world is
blue–yellow, a grazer's is hue-shifted. The alternative is to draw everything in reference colours and let the eye act only
through contrast (what is dim, what is noticed). `Utils/spectra.html` shows every material through every proposed eye in each
light, so the choice can be made by looking.

---

## Where the code is

| file | what |
|---|---|
| `js/spectra.js` | the pipeline, the chromophores, materials, star and atmosphere, eye template and contrast, the display convention, the reference observer, and the proposed eyes (placeholder). Pure: no imports, no state. **Not yet read by the game or the renderer** |
| `tools/spectra.mjs` | plain node: reference colours, every proposed eye in seven lights, contrast pairs; `--calibrate` refits the display's chroma scale |
| `Utils/spectra.html` | swatches: every surface through every proposed eye, with a light and adaptation selector and a spectrum plot (on the preview at `…/Utils/spectra.html`) |
| `js/palette-compute.js` | the old three-layer tile palette. Superseded, still the planet viewer's (via its own copy). Retired when the renderer draws from `spectra.js` |

What the game draws today is unchanged: hand-set biome palettes (`ecology-data.js`), creature tints (`monsters.js`), the
day/night overlay (`time-cycle.js`). Detection still reads hue strings.

## Next passes (one pull request each)

1. **Eyes into the body maps**, once the person settles the receptor sets. Delete `PROPOSED_EYES`.
2. **Integument as material.** Each species' integument becomes a composition per zone. Detection's contrast factor becomes
   `contrast()` against the tile's surface in the tile's light. Retire `TERRAIN_VISUAL` hue strings, `HUE_MISMATCH_PENALTY`,
   `BRIGHTNESS_CONTRAST_WEIGHT` and the bleed bonus: blood is hemolymph on the integument, an areal mix. Run
   `tools/ecology.mjs` before and after.
3. **Light from the sky.**
   - The day cycle gives a star elevation; `getLightLevel` and the tint overlay give way to `daylight()`.
   - Canopy and shadow come from the tile.
   - The receptors' adaptation state is held in the eye, with a time course.
4. **The renderer.** Tile palettes and creature colours come from `screenColor` with the player's eye (or reference colours:
   the person's call above), cached per material × light × eye. Tile compositions come from the tile body map
   (tile-body-map-spec). `palette-compute.js` retires.
5. **The planet viewer** takes a copy of `spectra.js` and drops its `computeTilePalette` transform.

## Open questions for the person

- **Star temperature**: 4800 K fits "slightly cooler than Sol" and "yellow-orange". Cooler (~4300 K) is more orange.
- **The night sky**: `NIGHT_SKY.flux` is 1e-6 noons (Earth's full moon). Moons, a bright galaxy or airglow would raise it.
  Today's game draws night at 0.1 of day, far brighter than any natural night sky. Physically only big, slow eyes (the proposed
  ravager and lurker) see anything at 1e-6.
- **The receptor sets** above.
- **Screen**: the player's eye's colours, or reference colours with the eye acting through contrast only.
- **Ecology-Foundations' "warm-toned, dim"**: it is invisible to an adapted native. Keep it as a presentation choice, or let
  it go.
