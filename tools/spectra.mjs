// Prints what js/spectra.js makes of the planet's materials: the reference
// colour of each (a human under white light), what each proposed eye draws in
// each light, and how many just-noticeable differences apart some pairs are.
// No dependencies; plain node.
//
//   node tools/spectra.mjs              the tables, as markdown
//   node tools/spectra.mjs --calibrate  refit DISPLAY's chroma scale against
//                                       human colorimetry and print it
import * as S from '../js/spectra.js';
import { BODY_MAPS, getEye } from '../js/body-maps.js';

const args = process.argv.slice(2);

// ---- the surfaces ----
const SURFACES = [
  ['photosynthetic tissue', () => S.reflectance(S.namedMaterial('photosynthetic_tissue'))],
  ['dead organic', () => S.reflectance(S.namedMaterial('dead_organic'))],
  ['hemolymph', () => S.reflectance(S.namedMaterial('hemolymph'))],
  ['calcium structure', () => S.reflectance(S.namedMaterial('calcium_structure'))],
];
for (const kind of Object.keys(S.MATRICES)) {
  for (const [label, m] of [['plain', {}], ['iron', { iron: 1 }], ['copper', { copper: 1 }], ['manganese', { manganese: 1 }]]) {
    SURFACES.push([`${kind}, ${label}`, () => S.reflectance(S.mineralMaterial(kind, m))]);
  }
}
SURFACES.push(['soil, iron, soaked', () => S.reflectance(S.wet(S.mineralMaterial('soil', { iron: 1 }), 1))]);
SURFACES.push(['mixotroph (tissue + Mn colony)', () => S.reflectance(S.mixMaterials([
  [S.namedMaterial('photosynthetic_tissue'), 0.5], [S.mineralMaterial('colony', { manganese: 1 }), 0.5]]))]);
SURFACES.push(['water 0.5 m over iron sand', () => S.waterColumn(S.reflectance(S.mineralMaterial('sand', { iron: 1 })), 0.5)]);
SURFACES.push(['water 3 m over iron sand', () => S.waterColumn(S.reflectance(S.mineralMaterial('sand', { iron: 1 })), 3)]);
SURFACES.push(['deep water', () => S.waterColumn(S.flat(0.1), 100)]);
const R = Object.fromEntries(SURFACES.map(([n, f]) => [n, f()]));

// ---- the lights ----
const noon = S.daylight(60);
const LIGHTS = {
  'noon (60°)': S.total(noon),
  'low star (15°)': S.total(S.daylight(15)),
  'star on horizon': S.total(S.daylight(0)),
  'dusk (−4°)': S.total(S.daylight(-4)),
  'night (no moon)': S.total(S.daylight(-30)),
  'forest floor': S.underCanopy(noon, S.namedMaterial('photosynthetic_tissue'), 0.15),
  'rock shadow': S.inShadow(noon),
};

// Each species' head eyes, read from its body map (the eye with the best acuity).
const SPECIES = { prowler: 'wolf', ravager: 'dire_wolf', grazer: 'hare', shaleback: 'cave_crab', lurker: 'ambush_pred' };
const headEye = key => BODY_MAPS[key].map(getEye).filter(Boolean).sort((a, b) => b.acuity - a.acuity)[0];
const EYES = { human: S.HUMAN_EYE, ...Object.fromEntries(Object.entries(SPECIES).map(([name, key]) => [name, headEye(key)])) };

if (args.includes('--calibrate')) {
  calibrate();
} else {
  tables();
}

function tables() {
  const out = [];
  out.push('## Reference colour (human, Earth noon)\n');
  out.push('| surface | reference |', '|---|---|');
  for (const n of Object.keys(R)) out.push(`| ${n} | \`${S.hex(S.referenceColor(R[n]))}\` |`);

  for (const [en, eye] of Object.entries(EYES)) {
    const o = S.eyeOptics(eye);
    out.push(`\n## ${en} — cones ${eye.cones.map(r => r.lambdaMax).join(' / ')} nm${eye.rods ? `, rods ${eye.rods.lambdaMax}` : ''}${eye.tapetum ? `, tapetum ${eye.tapetum}` : ''}\n`);
    const lights = Object.keys(LIGHTS);
    out.push(`| surface | ${lights.join(' | ')} |`, `|---|${lights.map(() => '---').join('|')}|`);
    for (const n of Object.keys(R)) {
      out.push(`| ${n} | ${lights.map(l => '`' + S.hex(S.screenColor(o, R[n], LIGHTS[l])) + '`').join(' | ')} |`);
    }
  }

  out.push('\n## Contrast in JNDs (chromatic / achromatic), noon, dusk and night\n');
  const PAIRS = [
    ['calcium structure', 'soil, iron'],
    ['hemolymph', 'photosynthetic tissue'],
    ['photosynthetic tissue', 'soil, iron'],
    ['dead organic', 'soil, iron'],
    ['colony, manganese', 'mat, manganese'],
    ['soil, copper', 'soil, plain'],
  ];
  const eyes = Object.keys(EYES);
  out.push(`| pair | light | ${eyes.join(' | ')} |`, `|---|---|${eyes.map(() => '---').join('|')}|`);
  for (const [a, b] of PAIRS) {
    for (const l of ['noon (60°)', 'dusk (−4°)', 'night (no moon)']) {
      const cells = eyes.map(e => {
        const c = S.contrast(S.eyeOptics(EYES[e]), R[a], R[b], LIGHTS[l]);
        return `${c.chromatic.toFixed(1)} / ${c.achromatic.toFixed(1)}`;
      });
      out.push(`| ${a} vs ${b} | ${l} | ${cells.join(' | ')} |`);
    }
  }
  console.log(out.join('\n'));
}

// The display's chroma scale is the one fitted number pair in the pipeline:
// fit it so the human eye drawn through screenColor matches humanColor's chroma.
function calibrate() {
  const toLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const chroma = c => {
    const r = toLin(c.r), g = toLin(c.g), b = toLin(c.b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return Math.hypot(1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
  };
  const H = S.eyeOptics(S.HUMAN_EYE);
  const names = Object.keys(R).filter(n => !n.startsWith('water') && n !== 'deep water');
  const target = names.map(n => chroma(S.humanColor(R[n])));
  let best = [Infinity];
  for (let k = 0.010; k <= 0.080; k += 0.002) {
    for (const j of [0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5]) {
      S.DISPLAY.chromaPerLog = k; S.DISPLAY.chromaJND = j;
      const e = names.reduce((sum, n, i) => sum + (chroma(S.screenColor(H, R[n], S.EARTH_NOON)) - target[i]) ** 2, 0);
      if (e < best[0]) best = [e, k, j];
    }
  }
  console.log(`chromaPerLog ${best[1].toFixed(3)}, chromaJND ${best[2]}  (rms chroma error ${Math.sqrt(best[0] / names.length).toFixed(4)})`);
}
