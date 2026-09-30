// ==================== SPECTRA — THE COLOUR PHYSICS ====================
// The one place a colour is computed. Notes/Spectral-Color-Design.md is its
// design. This file is the canon for Overworld and for the planet viewer,
// which is to carry a verbatim copy: change it here, then copy it there.
//
// Four steps, each a physical thing or a named convention:
//   1. what the surface is      reflectance R(λ), from the chromophores and
//                                scattering matrix it is made of (Kubelka–Munk)
//   2. what light reaches it    the star through the atmosphere, then canopy,
//                                shadow or water between the sky and the surface
//   3. what an eye makes of it  photon catch of each receptor class of one eye,
//                                through its lens; adaptation; contrast in
//                                just-noticeable differences (receptor noise)
//   4. what the screen shows    the player's eye's catches drawn in human colour
//                                (a convention, not physics — the only one)
//
// Pure: no imports, no game state. Not yet read by the game or the renderer
// (Spectral-Color-Design "Where the code is").
//
// Units: wavelength in nm on WL (300–800, 5 nm). Light is photon flux per nm,
// scaled so Earth's noon sun on a horizontal surface catches 1 over 400–700 nm
// ("noons"). Reflectance is 0–1. Absorption and scattering are per unit
// thickness of material (Kubelka–Munk K and S; only their ratio matters for a
// thick layer).

export const WL_MIN = 300, WL_MAX = 800, WL_STEP = 5;
export const WL = [];
for (let l = WL_MIN; l <= WL_MAX; l += WL_STEP) WL.push(l);
const N = WL.length;

// ---- small helpers on spectra (plain arrays aligned with WL) ----
export const flat = v => WL.map(() => v);
const fromFn = f => WL.map(f);
const mul = (a, b) => a.map((v, i) => v * b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, k) => a.map(v => v * k);
function integrate(a) { let s = 0; for (let i = 0; i < N; i++) s += a[i]; return s * WL_STEP; }
function integrateRange(a, lo, hi) {
  let s = 0; for (let i = 0; i < N; i++) if (WL[i] >= lo && WL[i] <= hi) s += a[i]; return s * WL_STEP;
}
// Linear interpolation of a sparse [[nm, value], …] table onto WL.
function table(pts) {
  return fromFn(l => {
    if (l <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (l <= pts[i][0]) {
        const [l0, v0] = pts[i - 1], [l1, v1] = pts[i];
        return v0 + (v1 - v0) * (l - l0) / (l1 - l0);
      }
    }
    return pts[pts.length - 1][1];
  });
}

// ==================== 1. MATERIALS ====================
// A chromophore is a molecule or mineral site that absorbs light: its
// absorption spectrum per unit concentration. Shapes are the physical kinds of
// absorber: a band (an electronic transition), an edge (charge transfer: absorbs
// everything shorter than it), and an exponential tail (degraded, mixed organic
// matter, the way humic stain and tannin absorb).
const band = (centre, width, k) => fromFn(l => k * Math.exp(-0.5 * ((l - centre) / width) ** 2));
const edge = (at, width, k) => fromFn(l => k / (1 + Math.exp((l - at) / width)));
const tail = (ref, slope, k) => fromFn(l => k * Math.exp(-slope * (l - ref)));

export const CHROMOPHORES = {
  // The photosynthetic pigment: absorbs violet-blue through yellow, where the
  // star gives the most photons, and reflects red, with a weak window near
  // 400 nm that gives the crimson its violet undertone.
  photosynthetic: add(add(band(470, 35, 1.0), band(560, 26, 1.2)), band(345, 30, 0.8)),
  // Degraded pigment and structural organics: brown stain.
  humic:          tail(440, 0.011, 1.0),
  // Iron(III) oxides. Hematite: charge-transfer edge near 575 nm, red.
  // Goethite: edge near 510 nm, yellow-ochre. Soils carry both.
  hematite:       add(edge(575, 14, 1.0), band(500, 35, 0.4)),
  goethite:       add(edge(505, 14, 1.0), band(440, 30, 0.3)),
  // Copper(II) in carbonate/hydroxide sites: a broad band in the red.
  copper:         add(band(700, 80, 1.0), edge(445, 18, 0.35)),
  // Manganese(III): a band in the green, so violet.
  manganese:      add(band(535, 50, 1.0), band(640, 60, 0.25)),
  // Oxygenated hemocyanin: a strong UV band and the copper–oxygen band in the
  // orange-red — blue-cyan blood.
  hemocyanin_oxy: add(band(345, 20, 2.0), band(650, 70, 1.0)),
  // Deoxygenated hemocyanin: the orange band is gone; nearly colourless.
  hemocyanin:     band(345, 20, 1.2),
  // Calcium carbonate (bone-like structure): a UV edge only.
  carbonate:      edge(320, 12, 0.5),
  // Carbonised or finely divided dark matter: grey absorber.
  black:          flat(1.0),
};

// Pure water absorption, per metre (Pope & Fry 1997 in the visible, Smith &
// Baker 1981 in the UV and near-IR).
export const WATER_ABSORPTION = table([
  [300, 0.141], [320, 0.080], [340, 0.050], [360, 0.030], [380, 0.020], [400, 0.0066],
  [420, 0.0045], [440, 0.0064], [460, 0.0098], [480, 0.0150], [500, 0.0204], [520, 0.0474],
  [540, 0.0521], [560, 0.0708], [580, 0.1080], [600, 0.2224], [620, 0.2755], [640, 0.3120],
  [660, 0.4100], [680, 0.4550], [700, 0.6500], [720, 1.169], [740, 2.47], [760, 2.55],
  [780, 2.36], [800, 2.07],
]);

// A material: a scattering matrix (S, and its own absorption K0) carrying
// chromophores at concentrations. Mixing materials intimately (grains ground
// together, pigment in tissue) adds their K and S; that is `mixMaterials`.
// Surfaces side by side in one view (mat patches over soil) average their
// reflectances; that is `mixSurfaces`. The two are different physics and give
// different colours: intimate mixing is subtractive, areal mixing additive.
export function material(spec) {
  const S = spec.scatter ?? 1.0;
  let K = flat(spec.matrixAbsorption ?? 0.002);
  for (const [name, conc] of Object.entries(spec.chromophores || {})) {
    const a = CHROMOPHORES[name];
    if (!a) throw new Error(`spectra: unknown chromophore ${name}`);
    K = add(K, scale(a, conc));
  }
  return { K, S: flat(S), specular: spec.specular ?? 0.02 };
}

export function mixMaterials(parts) {           // [[material, fraction], …]
  let K = flat(0), S = flat(0), spec = 0, tot = 0;
  for (const [m, f] of parts) { K = add(K, scale(m.K, f)); S = add(S, scale(m.S, f)); spec += m.specular * f; tot += f; }
  return { K: scale(K, 1 / tot), S: scale(S, 1 / tot), specular: spec / tot };
}

// Wetting: water fills the pores between grains and fibres, so less light is
// scattered back at each face and the surface darkens and saturates.
// Scattering at a face goes as the square of the refractive-index step: grain
// (≈1.55) to air is 0.55, grain to water 0.22, so a soaked surface keeps
// (0.22/0.55)² ≈ 16% of its scattering. The film adds a little specular.
const WET_SCATTER_KEPT = ((1.55 - 1.33) / (1.55 - 1.0)) ** 2;
export function wet(m, saturation) {
  const kept = 1 - saturation * (1 - WET_SCATTER_KEPT);
  return { K: m.K, S: scale(m.S, kept), specular: m.specular + 0.02 * saturation };
}

// Kubelka–Munk reflectance of an optically thick layer, plus surface specular.
export function reflectance(m) {
  return m.K.map((k, i) => {
    const r = k / m.S[i];
    const body = 1 + r - Math.sqrt(r * r + 2 * r);
    return m.specular + (1 - m.specular) * body;
  });
}

export function mixSurfaces(parts) {            // [[reflectance, area fraction], …]
  let R = flat(0), tot = 0;
  for (const [r, f] of parts) { R = add(R, scale(r, f)); tot += f; }
  return scale(R, 1 / tot);
}

// Water seen from above: the water column over a bottom (Maritorena-style
// shallow-water model). Deep water's own colour is the light its molecules
// scatter back before absorption takes it; a bottom shows through by depth.
export function waterColumn(bottomR, depthM, turbidity = 0.02) {
  return WATER_ABSORPTION.map((a, i) => {
    const bb = 0.0019 * (500 / WL[i]) ** 4.3 + turbidity;   // backscatter: molecules + particles
    const Kd = a + bb;
    const deep = 0.33 * bb / (a + bb);
    const t = Math.exp(-2 * Kd * depthM);
    return 0.02 + 0.98 * (deep * (1 - t) + bottomR[i] * t);
  });
}

// ---- The planet's materials ----
// Compositions were authored so a human under white light would see the
// colours the art direction describes (Spectral-Color-Design "Materials");
// everything a creature sees follows from these and nothing else.
export const MATERIALS = {
  photosynthetic_tissue: { chromophores: { photosynthetic: 24, black: 0.1 } },
  dead_organic:          { chromophores: { humic: 4.3, black: 0.44 } },
  hemolymph:             { chromophores: { hemocyanin_oxy: 2.6, black: 0.21 } },
  calcium_structure:     { chromophores: { carbonate: 0.1, humic: 0.066 } },
};

// What one unit of a mineral brings into any material that takes it up.
// A unit is the tile's mineral field at 1.0 (world-gen's iron / copper /
// manganese, 0–1).
export const MINERAL_LOADING = {
  iron:      { hematite: 0.31, goethite: 5.1, black: 0.5 },
  copper:    { copper: 3.4, black: 0.13 },
  manganese: { manganese: 7.6, black: 0.32 },
};

// Mineral-bearing materials: each is its own matrix (what it is with no
// minerals, how strongly it scatters) and takes up the local minerals by
// `uptake` — chemotrophic colonies concentrate them, sand barely does.
// Coarse or massive matrices (bedrock, wood) scatter less, so the same
// mineral looks darker and deeper in them than in fine soil.
export const MATRICES = {
  soil:    { base: { humic: 0.57, black: 0.45, goethite: 0.22 },  scatter: 1.0, uptake: 1.0 },
  sand:    { base: { humic: 0.33, black: 0.24, goethite: 0.037 }, scatter: 1.5, uptake: 1.0 },
  bedrock: { base: { humic: 0.16, black: 0.45, goethite: 0.084 }, scatter: 0.5, uptake: 1.4 },
  wood:    { base: { humic: 0.075, black: 0.037, goethite: 0.11 }, scatter: 0.5, uptake: 1.5 },
  colony:  { base: { humic: 0.012, black: 0.042 },                scatter: 1.1, uptake: 1.5 },
  mat:     { base: { humic: 0.084, black: 0.45 },                 scatter: 0.5, uptake: 1.0 },
  spire:   { base: { humic: 0.035, black: 0.11 },                 scatter: 1.5, uptake: 1.0 },
};

export function mineralMaterial(kind, minerals = {}) {
  const mx = MATRICES[kind];
  if (!mx) throw new Error(`spectra: unknown matrix ${kind}`);
  const ch = { ...mx.base };
  for (const [mineral, load] of Object.entries(MINERAL_LOADING)) {
    const c = (minerals[mineral] || 0) * mx.uptake;
    if (c) for (const [name, k] of Object.entries(load)) ch[name] = (ch[name] || 0) + k * c;
  }
  return material({ chromophores: ch, scatter: mx.scatter });
}

export const namedMaterial = name => material(MATERIALS[name]);

// ==================== 2. LIGHT ====================
// Photon flux of a blackbody, relative shape only.
function planckPhotons(T) {
  const hc_k = 1.4388e7;                          // hc/k in nm·K
  return fromFn(l => l ** -4 / (Math.exp(hc_k / (l * T)) - 1));
}
const EARTH_SUN = planckPhotons(5778);
const EARTH_NORM = integrateRange(EARTH_SUN, 400, 700);

// The star and the atmosphere, from Ecology-Foundations: a yellow-orange star
// "slightly cooler than Sol" (4800 K; Sol is 5778 K) whose light is ~65% of
// Earth's (photons 400–700 nm, top of atmosphere), and an atmosphere of
// 1.1–1.3 Earth's (Rayleigh optical depth scales with pressure: 0.098 × 1.2).
export const STAR = { temperatureK: 4800, flux: 0.65 };
export const ATMOSPHERE = { rayleighDepth550: 0.118 };

export function starlight(star = STAR) {
  const s = planckPhotons(star.temperatureK);
  return scale(s, star.flux / integrateRange(s, 400, 700));
}
const rayleigh = (atm = ATMOSPHERE) => fromFn(l => atm.rayleighDepth550 * (l / 550) ** -4.05);

// Light on a horizontal surface under open sky, for the star at `elevationDeg`
// above the horizon. The direct beam loses its blue to scattering on the long
// path; the scattered light is the sky, which is what lights a shadow. Below
// the horizon the sky overhead stays lit for a while (twilight: roughly ten
// times dimmer per 3° of depression), then only the night sky is left.
export const NIGHT_SKY = { flux: 1e-6 };        // noons; Earth's full moon is ~1e-6, a moonless sky ~1e-8

export function daylight(elevationDeg, star = STAR, atm = ATMOSPHERE, night = NIGHT_SKY) {
  const top = starlight(star);
  const tau = rayleigh(atm);
  const nightShape = scale(top, night.flux / star.flux);
  if (elevationDeg <= 0) {
    const tw = 0.01 * 10 ** (elevationDeg / 3);
    const skyShape = top.map((v, i) => v * (1 - Math.exp(-tau[i] * 10)));
    const k = tw * star.flux / integrateRange(skyShape, 400, 700);
    return { direct: flat(0), sky: add(scale(skyShape, k), nightShape) };
  }
  const sinE = Math.sin(elevationDeg * Math.PI / 180);
  const airmass = 1 / (sinE + 0.50572 * (elevationDeg + 6.07995) ** -1.6364);  // Kasten–Young
  const direct = top.map((v, i) => v * Math.exp(-tau[i] * airmass) * sinE);
  // Half the scattered light comes down; the low sky still lights the ground
  // when the star is on the horizon, hence the floor on the elevation factor.
  const sky = top.map((v, i) => v * (1 - Math.exp(-tau[i] * airmass)) * 0.5 * Math.max(sinE, 0.03) + nightShape[i]);
  return { direct, sky };
}
export const total = d => add(d.direct, d.sky);

// Transmittance of a thin layer of material (a frond, a leaf) of scattering
// thickness SX: Kubelka–Munk for a finite layer.
export function layerTransmittance(m, SX) {
  return m.K.map((k, i) => {
    const a = 1 + k / m.S[i], b = Math.sqrt(a * a - 1), x = b * m.S[i] * SX;
    return b / (a * Math.sinh(x) + b * Math.cosh(x));
  });
}

// Light under a canopy: gaps pass open daylight; the rest has passed through
// `layers` of frond (scattering thickness `leafSX` each), which transmits what
// its pigment doesn't absorb. A crimson canopy lets red through: the forest
// floor is lit red.
export function underCanopy(day, leafMaterial, gapFraction, layers = 1, leafSX = 0.8) {
  const t = layerTransmittance(leafMaterial, leafSX);
  const open = total(day);
  return open.map((v, i) => v * (gapFraction + (1 - gapFraction) * t[i] ** layers));
}

// Shade from an opaque structure (rock, trunk, burrow mouth): the sky only.
export const inShadow = day => day.sky;

// Light at depth under water.
export const underwater = (light, depthM) => light.map((v, i) => v * Math.exp(-(WATER_ABSORPTION[i] + 0.02) * depthM));

// ==================== 3. EYES ====================
// Visual pigment absorption, Govardovskii et al. 2000 A1 template: the shape of
// every known opsin's absorption given only its peak, λmax. Normalised to 1.
export function opsin(lambdaMax) {
  const a = 0.8795 + 0.0459 * Math.exp(-((lambdaMax - 300) ** 2) / 11940);
  const lb = 189 + 0.315 * lambdaMax, wb = -40.5 + 0.195 * lambdaMax;
  return fromFn(l => {
    const x = lambdaMax / l;
    const alpha = 1 / (Math.exp(69.7 * (a - x)) + Math.exp(28 * (0.922 - x)) + Math.exp(-14.9 * (1.104 - x)) + 0.674);
    const beta = 0.26 * Math.exp(-(((l - lb) / wb) ** 2));
    return alpha + beta;
  });
}

// Ocular media: the lens and cornea absorb short wavelengths below `cutoff`.
export const lens = (cutoff, width = 8) => fromFn(l => 1 / (1 + Math.exp(-(l - cutoff) / width)));

// Build the working form of one eye from its body-map record (the fields are
// listed in Spectral-Color-Design "The eye in the body map").
export function eyeOptics(eye) {
  const media = lens(eye.lensCutoffNm ?? 390);
  const classes = eye.receptors.map(r => ({
    lambdaMax: r.lambdaMax,
    share: r.share,
    weber: r.weber ?? 0.05,
    sens: mul(opsin(r.lambdaMax), media),
  }));
  // Photons one receptor absorbs in one integration time from a white surface
  // under Earth's noon sun, per unit catch (Land 1981: N = (π/4)² D² (d/f)² R Δt
  // × absorptance). R for a white Lambertian surface at Earth noon is
  // ~3.8e20 photons m⁻² s⁻¹ sr⁻¹ over 400–700 nm.
  const D = eye.apertureMm * 1e-3, f = eye.focalMm * 1e-3, d = eye.receptorUm * 1e-6;
  const photonsPerNoon = (Math.PI / 4) ** 2 * D * D * (d / f) ** 2 * 3.8e20 * (eye.integrationMs * 1e-3) * 0.5;
  return { classes, photonsPerNoon, halfSaturation: eye.halfSaturationPhotons ?? 50 };
}

// Quantum catch of each receptor class: ∫ R(λ) I(λ) S(λ) dλ.
export function catches(optics, R, light) {
  const RI = mul(R, light);
  return optics.classes.map(c => integrate(mul(RI, c.sens)));
}

// Von Kries adaptation: each class's gain set by the light the eye is bathed
// in, so a white surface under the adapting light gives 1 in every class.
// Adaptation to that light is instantaneous here; the tissue's real time
// course (Spectral-Color-Design "Adaptation takes time") is not yet held.
export function adapt(optics, Q, adaptingLight) {
  const white = catches(optics, flat(1), adaptingLight);
  return Q.map((q, i) => q / white[i]);
}

// Receptor noise of each class (Vorobyev & Osorio 1998; Vorobyev et al. 2001):
// the Weber fraction of one receptor divided among the class's share of the
// retina, plus photon shot noise, which is what takes colour away in dim light.
function noise(optics, Q) {
  return optics.classes.map((c, i) => {
    const photons = Math.max(1e-9, Q[i] * optics.photonsPerNoon);
    return Math.sqrt((c.weber ** 2 + 1 / photons) / c.share);
  });
}

// Contrast between two surfaces seen by one eye in one light, in
// just-noticeable differences. Chromatic: the receptor-noise-limited distance
// with the achromatic direction removed (general n-class form). Achromatic:
// the difference in summed catch against the noise of the summed channel.
export function contrast(optics, Ra, Rb, light) {
  const Qa = catches(optics, Ra, light), Qb = catches(optics, Rb, light);
  const df = Qa.map((q, i) => Math.log(Math.max(q, 1e-12) / Math.max(Qb[i], 1e-12)));
  const w = noise(optics, Qa.map((q, i) => (q + Qb[i]) / 2));
  const inv = w.map(x => 1 / (x * x));
  const sInv = inv.reduce((s, v) => s + v, 0);
  // ΔS² = Σ inv_i df_i² − (Σ inv_i df_i)² / Σ inv_i
  let a = 0, b = 0;
  for (let i = 0; i < df.length; i++) { a += inv[i] * df[i] * df[i]; b += inv[i] * df[i]; }
  const chromatic = df.length > 1 ? Math.sqrt(Math.max(0, a - b * b / sInv)) : 0;
  const lumA = Qa.reduce((s, q, i) => s + q * optics.classes[i].share, 0);
  const lumB = Qb.reduce((s, q, i) => s + q * optics.classes[i].share, 0);
  const lumNoise = Math.sqrt(1 / sInv);           // pooled channel is quieter than any one class
  const achromatic = Math.abs(Math.log(Math.max(lumA, 1e-12) / Math.max(lumB, 1e-12))) / lumNoise;
  return { chromatic, achromatic };
}

// ==================== 4. THE SCREEN ====================
// The one convention. The player's eye is drawn so that what it can tell apart
// looks apart on screen, by as much as it can tell them apart:
//   lightness  its share-weighted catch, relative to white in the light it is
//              adapted to, dimmed as its receptors run short of photons;
//   chroma     its chromatic distance from grey in just-noticeable differences
//              (the receptor-noise space `contrast` measures), on a log scale;
//   hue        the dominant wavelength: the spectral light this eye would see
//              in the same direction from grey, drawn in the hue a human sees
//              that light as (ultraviolet: a violet deeper than any human's).
// So a dichromat draws on one blue–yellow axis, a dim scene loses its colour
// because shot noise grows, and nothing about the player's eye is hand-set.
// The chroma scale is calibrated once so the human eye, drawn through this,
// matches how humans see (`humanColor`; `node tools/spectra.mjs --calibrate`).
// Only the player's eye is ever drawn.

export const DISPLAY = {
  exposure: 0.85,          // white draws just under full scale
  chromaPerLog: 0.030,     // OKLab chroma per e-fold of (1 + JNDs / chromaJND): Fechner's law
  chromaJND: 0.3,          // JNDs from grey at which chroma starts to grow logarithmically
  uvHueStep: 0.6,          // degrees of hue per nm below 400: UV draws as a deeper violet
  hueMatchWidth: 0.003,    // how close (cosine) a spectral light must be to share in the hue
};

// Receptor-noise coordinates of a set of adapted catches: x_i = (f_i − f̄)/ω_i
// with f = ln q and f̄ the noise-weighted mean. |x| is JNDs from grey.
function rnl(q, w) {
  const f = q.map(v => Math.log(Math.max(v, 1e-6)));
  const inv = w.map(v => 1 / (v * v)), sInv = inv.reduce((s, v) => s + v, 0);
  const fbar = f.reduce((s, v, i) => s + v * inv[i], 0) / sInv;
  return f.map((v, i) => (v - fbar) / w[i]);
}

// Direction from white in this eye's chromaticity (catches over their sum, so
// brightness drops out), each class weighted by its reliability. A surface
// and the spectral light it mixes from with white lie on one straight line
// from white here, whatever the weighting.
function chromaDir(optics, q) {
  const sum = q.reduce((s, v) => s + v, 0);
  if (sum <= 0) return null;
  const n = q.length;
  const x = q.map((v, i) => (v / sum - 1 / n) * Math.sqrt(optics.classes[i].share) / optics.classes[i].weber);
  const len = Math.hypot(...x);
  return len > 1e-9 ? x.map(v => v / len) : null;
}

// Hue: the dominant wavelength, the way colorimetry defines hue for humans —
// the pure spectral light (or, past both ends, a mix of the two ends: purple)
// that this eye would see as the same direction from grey — drawn in the hue a
// human sees that light as. Built once per eye.
function spectralLocus(optics) {
  const band = c => WL.map(l => Math.exp(-0.5 * ((l - c) / 6) ** 2));
  const eqWhite = flat(1);
  const loc = [];
  const lo = Math.max(WL_MIN + 20, Math.min(...optics.classes.map(c => c.lambdaMax)) - 40);
  const hi = Math.min(WL_MAX - 20, Math.max(...optics.classes.map(c => c.lambdaMax)) + 80);
  const push = (spec, hue) => {
    const x = chromaDir(optics, adapt(optics, catches(optics, spec, eqWhite), eqWhite));
    if (x) loc.push({ x, hue });
  };
  const humanHue = l => {
    if (l < 400) return humanHue(400) + (400 - l) * DISPLAY.uvHueStep;
    const c = humanOklab(band(l));
    return Math.atan2(c[2], c[1]) * 180 / Math.PI;
  };
  for (let l = lo; l <= hi; l += 5) push(band(l), humanHue(l));
  const hLo = humanHue(lo), hHi = humanHue(hi);
  for (let k = 1; k < 10; k++) {                 // the purple line
    const t = k / 10;
    const mix = add(scale(band(lo), t), scale(band(hi), 1 - t));
    push(mix, circularMix(hLo, hHi, t));
  }
  return loc;
}
function circularMix(h1, h2, t) {
  const a = t * Math.cos(h1 * Math.PI / 180) + (1 - t) * Math.cos(h2 * Math.PI / 180);
  const b = t * Math.sin(h1 * Math.PI / 180) + (1 - t) * Math.sin(h2 * Math.PI / 180);
  return Math.atan2(b, a) * 180 / Math.PI;
}
function hueFor(optics, q) {
  if (!optics.locus) optics.locus = spectralLocus(optics);
  const x = chromaDir(optics, q);
  if (!x) return 0;
  const cos = p => p.x.reduce((s, v, i) => s + v * x[i], 0);
  let best = -2;
  for (const p of optics.locus) best = Math.max(best, cos(p));
  // Every locus point close to the best counts, weighted by how close: a
  // dichromat sees all long wavelengths alike, and its hue is their mean.
  let a = 0, b = 0;
  for (const p of optics.locus) {
    const wgt = Math.exp((cos(p) - best) / DISPLAY.hueMatchWidth);
    a += wgt * Math.cos(p.hue * Math.PI / 180); b += wgt * Math.sin(p.hue * Math.PI / 180);
  }
  return Math.atan2(b, a);
}

// Screen colour {r,g,b} (0–255) of a surface seen by the player's eye.
// `light` is what falls on the surface; `adaptingLight` what the eye is
// adapted to (usually the light where the player stands).
export function screenColor(optics, R, light, adaptingLight = light) {
  const q = adapt(optics, catches(optics, R, light), adaptingLight);
  const whiteQ = catches(optics, flat(1), adaptingLight);
  const w = noise(optics, whiteQ.map((v, i) => v * Math.max(q[i], 1e-6)));
  // Lightness: share-weighted catch; dimmed below the receptors' half-saturation.
  const shares = optics.classes.reduce((s, c) => s + c.share, 0);
  const Y = optics.classes.reduce((s, c, i) => s + c.share * q[i], 0) / shares;
  const photons = optics.classes.reduce((s, c, i) => s + c.share * whiteQ[i], 0) / shares * optics.photonsPerNoon;
  const bright = photons / (photons + optics.halfSaturation);
  const L = Math.cbrt(Math.max(0, Y * bright * DISPLAY.exposure));
  if (optics.classes.length < 2) return oklabToSrgb(L, 0, 0);
  const x = rnl(q, w);
  const jnd = Math.hypot(...x);
  const C = DISPLAY.chromaPerLog * Math.log(1 + jnd / DISPLAY.chromaJND);
  const h = jnd > 1e-9 ? hueFor(optics, q) : 0;
  return oklabToSrgb(L, C * Math.cos(h), C * Math.sin(h));
}

// OKLab → 8-bit sRGB, shrinking chroma (keeping lightness and hue) until the
// colour fits on the screen.
function oklabToSrgb(L, a, b) {
  const lin = (L, a, b) => {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  };
  let rgb = lin(L, a, b);
  if (rgb.some(v => v < -1e-4 || v > 1 + 1e-4)) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) {
      const k = (lo + hi) / 2, t = lin(L, a * k, b * k);
      if (t.some(v => v < -1e-4 || v > 1 + 1e-4)) hi = k; else lo = k;
    }
    rgb = lin(L, a * lo, b * lo);
  }
  return srgb8(rgb);
}
function srgb8(rgb) {
  const enc = v => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
  return { r: enc(rgb[0]), g: enc(rgb[1]), b: enc(rgb[2]) };
}
export const hex = c => '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();

// ==================== THE REFERENCE OBSERVER ====================
// "What colour is this really" has one physical answer — the reflectance
// spectrum — and one conventional label: how a human sees it under white
// (Earth noon) light. The human eye exists only for that label, for checking
// authored materials, and for calibrating DISPLAY; no creature has it.
// `humanColor` is exact colorimetry (human cone catches → sRGB), not the
// display convention above.
export const HUMAN_EYE = {
  receptors: [
    { lambdaMax: 420, share: 0.06 },
    { lambdaMax: 534, share: 0.32 },
    { lambdaMax: 564, share: 0.62 },
  ],
  lensCutoffNm: 400, apertureMm: 3, focalMm: 17, receptorUm: 2.5, integrationMs: 20,
};
export const EARTH_NOON = scale(EARTH_SUN, 1 / EARTH_NORM);

const RGB_TO_LMS = [                             // linear sRGB → human LMS (Viénot et al. 1999)
  [17.8824, 43.5161, 4.11935],
  [3.45565, 27.1554, 3.86714],
  [0.0299566, 0.184309, 1.46709],
];
const LMS_TO_RGB = invert3(RGB_TO_LMS);
const LMS_WHITE = RGB_TO_LMS.map(r => r[0] + r[1] + r[2]);
function invert3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
const HUMAN_OPTICS = eyeOptics(HUMAN_EYE);

// A human's view of a surface in a light, adapted to `adaptingLight` (by
// default the same light).
export function humanColor(R, light = EARTH_NOON, adaptingLight = light) {
  const [s, m, l] = adapt(HUMAN_OPTICS, catches(HUMAN_OPTICS, R, light), adaptingLight);
  const rgb = LMS_TO_RGB.map(r => (r[0] * l * LMS_WHITE[0] + r[1] * m * LMS_WHITE[1] + r[2] * s * LMS_WHITE[2]) * DISPLAY.exposure);
  return srgb8(rgb);
}
export const referenceColor = R => humanColor(R, EARTH_NOON);

// OKLab [L, a, b] of what a human sees (unclipped), for hue lookups.
function humanOklab(R, light = EARTH_NOON) {
  const [s, m, l] = adapt(HUMAN_OPTICS, catches(HUMAN_OPTICS, R, light), light);
  const [r, g, b] = LMS_TO_RGB.map(row => row[0] * l * LMS_WHITE[0] + row[1] * m * LMS_WHITE[1] + row[2] * s * LMS_WHITE[2]);
  const cl = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const cm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const cs = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * cl + 0.7936177850 * cm - 0.0040720468 * cs,
          1.9779984951 * cl - 2.4285922050 * cm + 0.4505937099 * cs,
          0.0259040371 * cl + 0.7827717662 * cm - 0.8086757660 * cs];
}

// ==================== PROPOSED EYES — PLACEHOLDER ====================
// Stand-ins for the eye records the body maps do not have yet (today an eye is
// { acuity, placement, fieldAngle }). Each is a proposal for the person to
// accept or change (Spectral-Color-Design "Proposed eyes"); the replacement
// path is to move these fields onto the visual transducer of each species'
// head zone in body-maps.js, after which this table is deleted. Nothing in
// play reads it.
export const PROPOSED_EYES = {
  // Clade A: vision secondary to smell; ancestrally two classes.
  prowler:   { receptors: [{ lambdaMax: 455, share: 0.15 }, { lambdaMax: 570, share: 0.85 }],
               lensCutoffNm: 400, apertureMm: 6, focalMm: 14, receptorUm: 3, integrationMs: 30 },
  // The forest-interior hunter: long class shifted into the red light that
  // comes through the canopy; bigger eyes for the dim floor.
  ravager:   { receptors: [{ lambdaMax: 470, share: 0.12 }, { lambdaMax: 595, share: 0.88 }],
               lensCutoffNm: 410, apertureMm: 9, focalMm: 18, receptorUm: 3.5, integrationMs: 40 },
  // Clade B: four eyes, motion and pattern; ancestrally three classes with UV.
  grazer:    { receptors: [{ lambdaMax: 365, share: 0.1 }, { lambdaMax: 470, share: 0.25 }, { lambdaMax: 575, share: 0.65 }],
               lensCutoffNm: 330, apertureMm: 5, focalMm: 9, receptorUm: 3, integrationMs: 20 },
  // The shore grazer, the best eyes on the surface: a fourth class.
  shaleback: { receptors: [{ lambdaMax: 370, share: 0.08 }, { lambdaMax: 455, share: 0.17 }, { lambdaMax: 525, share: 0.35 }, { lambdaMax: 600, share: 0.4 }],
               lensCutoffNm: 340, apertureMm: 10, focalMm: 20, receptorUm: 2.5, integrationMs: 30 },
  // The ambush hunter in the substrate: lost UV, long integration for the dim
  // ground it waits in.
  lurker:    { receptors: [{ lambdaMax: 490, share: 0.3 }, { lambdaMax: 580, share: 0.7 }],
               lensCutoffNm: 400, apertureMm: 7, focalMm: 12, receptorUm: 4, integrationMs: 50 },
};
