// ==================== NODES — THE NERVOUS SYSTEM AS WIRED TISSUE ====================
// Runs a creature's wiring (Neural-Architecture-Design): nodes in zones, summing
// weighted inputs and firing past a threshold, and the output stage that turns
// what fired into motor activation and gland release. Nothing here knows any
// species: a species is its wiring (wiring.js).
//
// A node:
//   id, zone, mass           the tissue: where it is (destroy the zone and it is
//                            gone) and how much of the zone's neural tissue it is
//   mode                     'mapped': evaluated once per sensed source, its
//                            output belongs to that source (and so to that
//                            place); 'pooled': evaluated once
//   inputs [{from, weight}]  'sense:<zone>.<channel path>' a transducer's SNR on
//                            the source ('fore_l.vibration.ground', 'head.visual');
//                            'feature:<name>[@arg]' a feature the senses deliver
//                            (FEATURES below); 'node:<id>' another node;
//                            'blood:<hormone>' the level of a hormone, read by the
//                            node's own receptors for it
//   combine                  'sum' (default) or 'max' of the weighted inputs
//   gate [ids]               nodes whose outputs multiply this node's output
//                            (a modulating synapse: nothing passes if one is silent)
//   vetoedBy [ids]           nodes whose firing silences this one (shunting
//                            inhibition), if their signal arrives in time
//   fn                       'step':  gain if input ≥ threshold (> if strict)
//                            'ramp':  clamp(gain × (input − threshold), 0, ceiling)
//                            'pass':  input if input ≥ threshold, else 0
//   threshold, gain, ceiling, strict
//   receptors {alarm: s}     blood chemistry shifts the threshold: × (1 − level × s)
//
// A pooled node reading a mapped one takes its strongest place (lateral
// inhibition across the map picks one) and carries that source with it.
//
// Timing is anatomy: a signal takes one step per pathway hop between zones.
// Inhibition acts only if it arrives no later than what it inhibits; a late
// veto is inert. Within one action this is a property of the wiring, so it is
// worked out once per species (compile), not per action. PLACEHOLDER: percept
// features (size, identity, motion) count as local to the node that reads
// them until perception itself is wired as nodes.
//
// Nothing in here moves anything: runNodes returns what the output stage
// drives, in the shape ai.js _ganglionOutputToAction reads. Its glands release
// into the blood (physiology.js releaseHormone) as they fire.

import { getBodyMap, getPathways, SPECIES_DISPLAY_CONFIDENCE,
         REFERENCE_SPEED, BASE_TICKS_PER_ACTION, GROUND_EMISSION_BASE,
         GLAND_STORE_PER_KG, GLAND_SYNTHESIS_PER_KG } from './constants.js';
import { getSpeciesKey, meatEaterUnderfoot } from './detection.js';
import { getCreatureMass, findNearestFoodTile, dist, directionToward, directionAwayFrom } from './ai-utils.js';
import { getBodyPTW, releaseHormone } from './physiology.js';

// ── Features: what the senses deliver to a node ──
// Mapped features take (creature, percept); pooled ones (creature, arg) and may
// return { value, place } (a tile the value is about).
const FEATURES = {
  // The source's size as the channels read it (perception passes 6–8)
  sizeSmallerOrSimilar: (c, d) => (d.sizeRelative === 'smaller' || d.sizeRelative === 'much_smaller' ||
                                   d.sizeRelative === 'similar') ? 1 : 0,
  sizeMuchLarger: (c, d) => d.sizeRelative === 'much_larger' ? 1 : 0,
  sizeLarger:     (c, d) => d.sizeRelative === 'larger' ? 1 : 0,
  sizeAmbiguous:  (c, d) => d.sizeRelative === 'ambiguous' ? 1 : 0,
  // How heavy it reads against this body: estimated mass / own mass. An
  // unsized source reads as heavy as it can.
  sizeRatio: (c, d) => {
    const est = d.sizeEstimate && d.sizeEstimate.estimated;
    const self = getCreatureMass(c);
    return (!est || !(self > 0)) ? Infinity : est / self;
  },
  // Identified by the channels as this creature's own kind (pass 7)
  recognisedKin: (c, d) => (d.species && d.speciesConfidence >= SPECIES_DISPLAY_CONFIDENCE &&
                            d.species === getSpeciesKey(c)) ? 1 : 0,
  // Confidence that it eats meat (odour, or a recognised species' diet)
  predatorDietConfidence: (c, d) => d.dietType === 'predator' ? (d.dietConfidence || 0) : 0,
  // Looming: how many of this creature's own actions until a seen body closing
  // on it arrives (Infinity if nothing closes). Only the eyes resolve closing.
  contactActions: (c, d) => {
    if (!(d.closingSpeed > 0)) return Infinity;
    const ownActionsPerTick = getBodyPTW(c, null) / (REFERENCE_SPEED * BASE_TICKS_PER_ACTION);
    return (d.distance / d.closingSpeed) * ownActionsPerTick;
  },
};

const POOLED_FEATURES = {
  // Meat-eater volatiles on the tile underfoot, read through one zone's
  // contact chemistry, against what this body leaves per step (1 = its own level)
  meatUnderfoot: (c, zone) => {
    const meat = meatEaterUnderfoot(c, [zone + '.chemical.contact']);
    if (!(meat > 0)) return 0;
    return meat / (getCreatureMass(c) * GROUND_EMISSION_BASE);
  },
  // Pain: a blow landed on the body this action (felt through every zone's
  // nerve endings; PLACEHOLDER for per-zone nociceptors)
  pain: (c) => (c.tookDamageThisTurn ? 1 : 0),
  // Edible ground: PLACEHOLDER for a visual food template on the eyes (the old
  // food region read the nearest food tile, not what the eyes resolve).
  // foodNear: within 6 tiles and not underfoot; foodUnderfoot: on it.
  foodNear: (c) => {
    const t = findNearestFoodTile(c.x, c.y);
    if (!t) return 0;
    const d = dist(c.x, c.y, t.x, t.y);
    return (d >= 1 && d <= 6) ? { value: 1, place: t } : 0;
  },
  foodUnderfoot: (c) => {
    const t = findNearestFoodTile(c.x, c.y);
    return (t && dist(c.x, c.y, t.x, t.y) < 1) ? 1 : 0;
  },
};

function _parseRef(ref) {
  const i = ref.indexOf(':');
  const kind = ref.slice(0, i), rest = ref.slice(i + 1);
  const at = rest.indexOf('@');
  return at < 0 ? { kind, name: rest, arg: null } : { kind, name: rest.slice(0, at), arg: rest.slice(at + 1) };
}

// ── Compile: hops, arrival times, which vetoes arrive in time ──
const _compiled = new WeakMap();   // wiring → Map(speciesPathwaysKey → compiled)

function _hopTable(pathways) {
  const adj = new Map();
  const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (const p of pathways) { link(p.from, p.to); link(p.to, p.from); }
  const cache = new Map();
  return (a, b) => {
    if (a === b) return 0;
    const key = a + '>' + b;
    if (cache.has(key)) return cache.get(key);
    const seen = new Map([[a, 0]]), queue = [a];
    for (let q = 0; q < queue.length; q++) {
      const z = queue[q];
      for (const n of adj.get(z) || []) {
        if (seen.has(n)) continue;
        seen.set(n, seen.get(z) + 1);
        queue.push(n);
      }
    }
    const h = seen.has(b) ? seen.get(b) : Infinity;
    cache.set(key, h);
    return h;
  };
}

function compileWiring(wiring, pathways) {
  let byPathways = _compiled.get(wiring);
  if (!byPathways) { byPathways = new Map(); _compiled.set(wiring, byPathways); }
  let c = byPathways.get(pathways);
  if (c) return c;

  const hops = _hopTable(pathways || []);
  const byId = new Map();
  const arrival = new Map();
  const issues = [];
  for (const n of wiring.nodes) {
    if (byId.has(n.id)) issues.push(`duplicate node ${n.id}`);
    let t = 0;
    for (const inp of n.inputs || []) {
      const r = _parseRef(inp.from);
      if (r.kind === 'node') {
        const src = byId.get(r.name);
        if (!src) { issues.push(`${n.id}: input ${r.name} is not an earlier node`); continue; }
        t = Math.max(t, arrival.get(r.name) + hops(src.zone, n.zone));
      } else if (r.kind === 'sense') {
        t = Math.max(t, hops(r.name.split('.')[0], n.zone));
      } else if (r.kind === 'feature') {
        if (r.arg) t = Math.max(t, hops(r.arg, n.zone));
        if (!FEATURES[r.name] && !POOLED_FEATURES[r.name]) issues.push(`${n.id}: unknown feature ${r.name}`);
      } else if (r.kind !== 'blood') {
        issues.push(`${n.id}: unknown input ${inp.from}`);
      }
    }
    for (const g of n.gate || []) {
      if (!byId.has(g)) { issues.push(`${n.id}: gate ${g} is not an earlier node`); continue; }
      t = Math.max(t, arrival.get(g) + hops(byId.get(g).zone, n.zone));
    }
    byId.set(n.id, n);
    arrival.set(n.id, t);
  }
  // Vetoes: in time or inert
  const liveVetoes = new Map();
  for (const n of wiring.nodes) {
    const ok = [];
    for (const v of n.vetoedBy || []) {
      const vn = byId.get(v);
      if (!vn) { issues.push(`${n.id}: veto ${v} is not a node`); continue; }
      if (arrival.get(v) + hops(vn.zone, n.zone) <= arrival.get(n.id)) ok.push(v);
      else issues.push(`${n.id}: veto from ${v} arrives too late (inert)`);
    }
    liveVetoes.set(n.id, ok);
  }
  const outVetoes = new Map();
  for (const out of wiring.outputs || []) {
    const src = byId.get(out.node);
    if (!src) { issues.push(`output ${out.label}: no node ${out.node}`); continue; }
    const t = arrival.get(out.node) + hops(src.zone, out.zone);
    const ok = [];
    for (const v of out.vetoedBy || []) {
      const vn = byId.get(v);
      if (!vn) { issues.push(`output ${out.label}: veto ${v} is not a node`); continue; }
      if (arrival.get(v) + hops(vn.zone, out.zone) <= t) ok.push(v);
      else issues.push(`output ${out.label}: veto from ${v} arrives too late (inert)`);
    }
    outVetoes.set(out, ok);
  }
  c = { byId, arrival, liveVetoes, outVetoes, issues, hops };
  byPathways.set(pathways, c);
  return c;
}

/** Problems with a species' wiring against its body: unknown references,
 *  vetoes that arrive too late, nodes over their zone's neural tissue. */
function validateWiring(entity, wiring) {
  const c = compileWiring(wiring, getPathways(entity));
  const issues = [...c.issues];
  const bodyMap = getBodyMap(entity) || [];
  const used = new Map();
  for (const n of wiring.nodes) used.set(n.zone, (used.get(n.zone) || 0) + (n.mass || 0));
  for (const [zone, m] of used) {
    const z = bodyMap.find(zz => zz.key === zone);
    if (!z) issues.push(`zone ${zone} is not in the body map`);
    else if (m > (z.neural || 0) + 1e-9) issues.push(`zone ${zone}: nodes ${m.toFixed(4)} kg > neural ${z.neural} kg`);
  }
  return issues;
}

// ── One evaluation ──

function _threshold(n, creature) {
  let t = n.threshold || 0;
  const h = creature.hormones;
  for (const hormone in (n.receptors || {})) {
    t *= 1 - Math.min(h ? (h[hormone] || 0) : 0, 1) * n.receptors[hormone];
  }
  return t;
}
const _blood = (creature, hormone) => (creature.hormones ? (creature.hormones[hormone] || 0) : 0);

function _fire(n, x, t) {
  switch (n.fn) {
    case 'step': return (n.strict ? x > t : x >= t) ? (n.gain != null ? n.gain : 1) : 0;
    case 'pass': return (n.strict ? x > t : x >= t) ? x : 0;
    case 'ramp':
    default: {
      const v = (n.gain != null ? n.gain : 1) * (x - t);
      return Math.max(0, Math.min(n.ceiling != null ? n.ceiling : Infinity, v));
    }
  }
}

/**
 * Run a creature's wiring on this action's percepts. Returns the output
 * stage's result ({ intensity, direction, source, type, isBolt, atFood }),
 * releases what its glands release, and leaves creature._nodeTrace (what
 * fired, for the inspector; transient).
 */
function runNodes(creature, wiring) {
  const bodyMap = getBodyMap(creature);
  const intact = bodyMap ? new Set(bodyMap.filter(z => !z.destroyed).map(z => z.key)) : null;
  const alive = (zone) => !intact || intact.has(zone);
  const c = compileWiring(wiring, getPathways(creature));
  const dets = creature.detectionInfo || [];
  const S = dets.length;

  // value: mapped → Float64Array per source; pooled → { v, src (index|-1), place }
  const val = new Map();
  const pooledRead = (id) => {
    const x = val.get(id);
    if (!x) return { v: 0, src: -1, place: null };
    if (x instanceof Float64Array) {          // strongest place on the map
      let best = 0, src = -1;
      for (let i = 0; i < x.length; i++) if (x[i] > best) { best = x[i]; src = i; }
      return { v: best, src, place: null };
    }
    return x;
  };
  // A node's value as seen by a mapped node evaluating source i: its value on
  // that source if it is mapped too, its one value if pooled
  const at = (id, i) => {
    const x = val.get(id);
    return x instanceof Float64Array ? x[i] : (x ? x.v : 0);
  };

  for (const n of wiring.nodes) {
    if (!alive(n.zone)) { val.set(n.id, n.mode === 'mapped' ? new Float64Array(S) : { v: 0, src: -1, place: null }); continue; }
    const t = _threshold(n, creature);
    const vetoes = c.liveVetoes.get(n.id) || [];
    if (n.mode === 'mapped') {
      const out = new Float64Array(S);
      for (let i = 0; i < S; i++) {
        const d = dets[i];
        let x = n.combine === 'max' ? -Infinity : 0, any = false;
        for (const inp of n.inputs || []) {
          const r = _parseRef(inp.from);
          let v = 0;
          if (r.kind === 'sense') v = alive(r.name.split('.')[0]) && d.zoneSNR ? (d.zoneSNR[r.name] || 0) : 0;
          else if (r.kind === 'feature') v = FEATURES[r.name] ? FEATURES[r.name](creature, d, r.arg) : 0;
          else if (r.kind === 'node') v = at(r.name, i);
          else if (r.kind === 'blood') v = _blood(creature, r.name);
          const w = inp.weight != null ? inp.weight : 1;
          const wv = v === 0 ? 0 : w * v;          // 0 × Infinity is no signal
          if (n.combine === 'max') { if (wv > x) x = wv; } else x += wv;
          any = true;
        }
        if (!any) x = 0;
        const vetoed = vetoes.some(v => at(v, i) > 0);
        let y = vetoed ? 0 : _fire(n, x, t);
        for (const g of n.gate || []) y = y === 0 ? 0 : y * at(g, i);
        out[i] = y;
      }
      val.set(n.id, out);
    } else {
      let x = n.combine === 'max' ? -Infinity : 0, any = false;
      let src = -1, place = null, srcWeight = -Infinity;
      for (const inp of n.inputs || []) {
        const r = _parseRef(inp.from);
        let v = 0, s = -1, p = null;
        if (r.kind === 'feature') {
          const f = POOLED_FEATURES[r.name];
          const got = f ? f(creature, r.arg) : 0;
          if (got && typeof got === 'object') { v = got.value; p = got.place || null; } else v = got || 0;
        } else if (r.kind === 'node') {
          const pr = pooledRead(r.name); v = pr.v; s = pr.src; p = pr.place;
        } else if (r.kind === 'blood') {
          v = _blood(creature, r.name);
        }
        const w = inp.weight != null ? inp.weight : 1;
        const wv = v === 0 ? 0 : w * v;
        if (n.combine === 'max') { if (wv > x) x = wv; } else x += wv;
        any = true;
        // The place this node is about: that of its largest input carrying one
        if ((s >= 0 || p) && wv > srcWeight) { srcWeight = wv; src = s; place = p; }
      }
      if (!any) x = 0;
      const vetoed = vetoes.some(v => pooledRead(v).v > 0);
      let v = vetoed ? 0 : _fire(n, x, t);
      for (const g of n.gate || []) v = v === 0 ? 0 : v * pooledRead(g).v;
      val.set(n.id, { v, src: v > 0 ? src : -1, place: v > 0 ? place : null });
    }
  }

  // ── Trace for the inspector: what fired, and about what ──
  const trace = [];
  for (const n of wiring.nodes) {
    const pr = pooledRead(n.id);
    if (pr.v > 0) trace.push({ id: n.id, zone: n.zone, value: pr.v,
      about: pr.src >= 0 && dets[pr.src].entity ? (dets[pr.src].entity.isPlayer ? 'player' : dets[pr.src].entity.key) : null });
  }
  creature._nodeTrace = trace;

  // ── Output stage ──
  const firing = (id) => pooledRead(id);
  const outVetoed = (out) => (c.outVetoes.get(out) || []).some(v => firing(v).v > 0);
  const where = (pr) => pr.src >= 0 ? { x: dets[pr.src].x, y: dets[pr.src].y, entity: dets[pr.src].entity } : pr.place;
  const bearing = (out, pr) => {
    const p = where(pr);
    if (!p) return null;
    return out.bearing === 'away' ? directionAwayFrom(creature.x, creature.y, p.x, p.y)
                                  : directionToward(creature.x, creature.y, p.x, p.y);
  };

  // Glands: a firing gland node releases its hormone into the blood, the
  // amount per firing its `release`, but no more than the gland holds
  // (tissue that is gone releases nothing)
  for (const out of wiring.outputs || []) {
    if (out.effect !== 'gland' || !alive(out.zone)) continue;
    const pr = firing(out.node);
    if (!(pr.v > 0) || outVetoed(out)) continue;
    const stores = creature.glandStores || (creature.glandStores = {});
    const held = stores[out.node] != null ? stores[out.node] : _glandMax(c.byId.get(out.node));
    const amount = Math.min((out.release || 0) * pr.v, held);
    stores[out.node] = held - amount;
    releaseHormone(creature, out.hormone, amount);
  }

  // Locomotion: the strongest drive reaching the generator (earliest listed on a tie)
  let loco = null;
  for (const out of wiring.outputs || []) {
    if (out.effect !== 'locomotion' || !alive(out.zone)) continue;
    const pr = firing(out.node);
    if (!(pr.v > 0) || outVetoed(out)) continue;
    if (!loco || out.intensity > loco.out.intensity) loco = { out, pr };
  }
  if (loco) {
    const p = where(loco.pr);
    return { intensity: loco.out.intensity, direction: bearing(loco.out, loco.pr),
             source: p && p.entity ? p.entity : null, type: loco.out.label,
             isBolt: loco.out.label === 'bolt', atFood: false };
  }
  // Then posture (holding still), orienting, feeding contact, in that order
  for (const effect of ['posture', 'orienting', 'feeding']) {
    for (const out of wiring.outputs || []) {
      if (out.effect !== effect || !alive(out.zone)) continue;
      const pr = firing(out.node);
      if (!(pr.v > 0) || outVetoed(out)) continue;
      return { intensity: 0, direction: effect === 'orienting' ? bearing(out, pr) : null,
               type: out.label, atFood: effect === 'feeding' };
    }
  }
  return { intensity: 0, direction: null, type: 'hold' };
}

/** What a gland node can hold: its tissue × GLAND_STORE_PER_KG. */
function _glandMax(node) {
  return (node && node.mass ? node.mass : 0) * GLAND_STORE_PER_KG;
}

/**
 * Gland synthesis: every living gland in the creature's wiring makes hormone
 * into its store, its tissue × GLAND_SYNTHESIS_PER_KG per world tick, up to
 * what it can hold. Once per player input (turn-loop.js), and for the time
 * away when a dormant creature wakes. A store never written is full.
 */
function refillGlands(creature, wiring, ticks) {
  if (!wiring || !creature.glandStores) return;
  const bodyMap = getBodyMap(creature);
  const c = compileWiring(wiring, getPathways(creature));
  for (const out of wiring.outputs || []) {
    if (out.effect !== 'gland') continue;
    const node = c.byId.get(out.node);
    if (!node || creature.glandStores[out.node] == null) continue;
    const zone = bodyMap && bodyMap.find(z => z.key === node.zone);
    if (zone && zone.destroyed) continue;
    creature.glandStores[out.node] = Math.min(_glandMax(node),
      creature.glandStores[out.node] + node.mass * GLAND_SYNTHESIS_PER_KG * (ticks || 1));
  }
}

export { runNodes, refillGlands, compileWiring, validateWiring, FEATURES, POOLED_FEATURES };
