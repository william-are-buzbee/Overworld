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
//                            node's own receptors for it; 'intent:act' the
//                            player's will, 1 while the player acts through this
//                            body, else 0 (the hub below)
//   combine                  'sum' (default) or 'max' of the weighted inputs
//   gate [ids]               nodes whose outputs multiply this node's output
//                            (a modulating synapse: nothing passes if one is silent)
//   vetoedBy [ids]           nodes whose firing silences this one (shunting
//                            inhibition), if their signal arrives in time
//   inhibitedBy [{node, weight, innate}]
//                            graded inhibition: the source's output × weight is
//                            taken off this node's input (in the input's own
//                            units) before it fires, if it arrives in time; a
//                            late one is inert (compile lists it as such). From
//                            the hub, weight is the wire fully formed and
//                            innate the share of it formed at birth (below)
//   fn                       'step':  gain if input ≥ threshold (> if strict)
//                            'ramp':  clamp(gain × (input − threshold), 0, ceiling)
//                            'pass':  input if input ≥ threshold, else 0
//   threshold, gain, ceiling, strict
//   receptors {alarm: s}     blood chemistry shifts the threshold: × (1 − level × s)
//   bands [g…]               mapped: how strongly each distance band of the map
//                            (wiring.map.bands, edges in tiles) is wired in
//   holds                    mapped: keeps its activity at the place where it was
//                            for mass × PERSISTENCE_SCALE turns after the senses
//                            lose it (tissue that can sustain activity)
//   predicts                 mapped: reports its place moved along the seen
//                            velocity by the time this body needs to get there
//
// The hub: the node the player plays (Neural-Architecture-Design, "The hub
// and the player"). It reads 'intent:act', drives the locomotion generator
// through its own output, and holds back reflexes through the inhibitedBy
// wires the wiring gives it, only those that arrive in time. What it cannot
// reach, or reaches late, takes the body.
//   Its wires onto reflexes are plastic: each has a strength, the share of its
// synapses formed (creature.hubStrength, saved with the body; the wiring's
// `innate` until written). A wire grows by coincidence, each action the hub
// fires while its reflex is driven past threshold, HUB_LEARN_RATE of what is
// left to form; a late wire's signal lands after its reflex fired, never with
// it, and does not grow.
//   Its tissue is its limit per action: its firing is split across what it
// engages at once (the outputs it drives and each reflex driven against its
// wires), full strength for mass / HUB_KG_PER_OUTPUT of them and a share each
// beyond that. What is engaged is read from a first pass with the hub's
// inhibition off.
//
// The map: every percept lands on a place (a bearing and a distance band).
// A pooled node reading a mapped one takes its strongest place (lateral
// inhibition across the map picks one), held places included, and carries
// that place with it to the output stage.
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
// into the blood (physiology.js releaseHormone) as they fire. The output
// stage, in order: glands; a strike (a strike circuit firing on something in
// reach); the strongest drive at the locomotion generator; then posture,
// orienting, feeding. An output may name its `act`, the executor's name for
// it (behaviors.js), a bridge until the motor layer reads effects.

import { getBodyMap, getPathways, SPECIES_DISPLAY_CONFIDENCE,
         REFERENCE_SPEED, BASE_TICKS_PER_ACTION, GROUND_EMISSION_BASE,
         GLAND_STORE_PER_KG, GLAND_SYNTHESIS_PER_KG, PERSISTENCE_SCALE,
         HUB_KG_PER_OUTPUT, HUB_LEARN_RATE } from './constants.js';
import { state } from './state.js';
import { getSpeciesKey, meatEaterUnderfoot, readPreyTrailStep } from './detection.js';
import { getCreatureMass, findNearestFoodTile, dist, directionToward, directionAwayFrom,
         getCorpseAt, DIRECTION_DELTAS } from './ai-utils.js';
import { getBodyPTW, releaseHormone } from './physiology.js';

// ── Features: what the senses deliver to a node ──
// Mapped features take (creature, percept); pooled ones (creature, arg) and may
// return { value, place } (a tile the value is about).
const FEATURES = {
  // The source's size as the channels read it (perception passes 6–8)
  sizeSmallerOrSimilar: (c, d) => (d.sizeRelative === 'smaller' || d.sizeRelative === 'much_smaller' ||
                                   d.sizeRelative === 'similar') ? 1 : 0,
  sizeMuchLarger: (c, d) => d.sizeRelative === 'much_larger' ? 1 : 0,
  sizeSmaller:    (c, d) => (d.sizeRelative === 'smaller' || d.sizeRelative === 'much_smaller') ? 1 : 0,
  sizeSimilar:    (c, d) => d.sizeRelative === 'similar' ? 1 : 0,
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
  // Confidence that it eats meat, or plants (odour, or a recognised species' diet)
  predatorDietConfidence: (c, d) => d.dietType === 'predator' ? (d.dietConfidence || 0) : 0,
  herbivoreDietConfidence: (c, d) => d.dietType === 'herbivore' ? (d.dietConfidence || 0) : 0,
  // Moving: felt (a footfall is movement), or the eye's change detection, or
  // closing. Only a body the senses read as still is not (unknown is moving).
  moving: (c, d) => (d.isMoving === false && !(d.closingSpeed > 0)) ? 0 : 1,
  // Something is there (any channel)
  present: () => 1,
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
  // Carrion: a corpse underfoot (the mouth on it), or the nearest one the
  // nose places within 4 tiles (detection.js detectCorpses, PLACEHOLDER for
  // a carrion odour template on the map)
  corpseUnderfoot: (c) => (getCorpseAt(c.layer != null ? c.layer : state.player.layer, c.x, c.y) ? 1 : 0),
  corpseNear: (c) => {
    const k = (c.detectedCorpses || []).find(k => k.distance >= 1 && k.distance <= 4);
    return k ? { value: 1, place: { x: k.x, y: k.y } } : 0;
  },
  // A prey trail on the ground: the fresher neighbouring tile of plant-eater
  // volatiles, read with the nose put to the ground (detection.js readPreyTrailStep)
  preyTrail: (c) => {
    const dir = readPreyTrailStep(c);
    if (dir == null) return 0;
    const d = DIRECTION_DELTAS[dir];
    return { value: 1, place: { x: c.x + d.x, y: c.y + d.y } };
  },
  // Plant-eater volatiles on the air, and the wind to face them: a place a
  // few tiles upwind (the plume, detection.js readPlume)
  preyUpwind: (c) => {
    const p = c.plume;
    if (!p || !(p.herbSNR >= 1) || !p.upwind) return 0;
    return { value: 1, place: { x: c.x + p.upwind.dx * 3, y: c.y + p.upwind.dy * 3 } };
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
      } else if (r.kind !== 'blood' && r.kind !== 'intent') {
        issues.push(`${n.id}: unknown input ${inp.from}`);
      }
    }
    for (const g of n.gate || []) {
      if (!byId.has(g)) { issues.push(`${n.id}: gate ${g} is not an earlier node`); continue; }
      t = Math.max(t, arrival.get(g) + hops(byId.get(g).zone, n.zone));
    }
    if (n.bands && !(wiring.map && wiring.map.bands)) issues.push(`${n.id}: band gains but the wiring has no map`);
    if (n.bands && wiring.map && n.bands.length !== wiring.map.bands.length + 1)
      issues.push(`${n.id}: ${n.bands.length} band gains for ${wiring.map.bands.length + 1} bands`);
    if ((n.holds || n.predicts) && n.mode !== 'mapped') issues.push(`${n.id}: only a mapped node holds or predicts a place`);
    if (n.holds && !(n.mass > 0)) issues.push(`${n.id}: holds with no tissue`);
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
  // Graded inhibition: in time or inert. A late wire is anatomy, not a
  // mistake (descending fibres onto a reflex arc too fast for them), so it is
  // listed, not an issue.
  const liveInhibits = new Map(), lateInhibits = new Map();
  for (const n of wiring.nodes) {
    const ok = [], late = [];
    for (const w of n.inhibitedBy || []) {
      const src = byId.get(w.node);
      if (!src) { issues.push(`${n.id}: inhibition from ${w.node} is not a node`); continue; }
      const lag = arrival.get(w.node) + hops(src.zone, n.zone) - arrival.get(n.id);
      if (lag <= 0) ok.push(w); else late.push({ ...w, lag });
    }
    liveInhibits.set(n.id, ok);
    lateInhibits.set(n.id, late);
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
  // The hub: the node the player's intent enters at (one per wiring)
  const hubs = wiring.nodes.filter(n => (n.inputs || []).some(i => i.from.startsWith('intent:')));
  if (hubs.length > 1) issues.push(`${hubs.length} hub nodes (one reads intent)`);
  const hub = hubs.length ? hubs[0] : null;
  c = { byId, arrival, liveVetoes, liveInhibits, lateInhibits, outVetoes, issues, hops, hub };
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
 * fired, for the inspector; transient). opts.intent: the player is acting
 * through this body (the hub's input). The result's `held` lists the nodes
 * the hub's inhibition kept from firing this action.
 */
function runNodes(creature, wiring, opts = {}) {
  const bodyMap = getBodyMap(creature);
  const intact = bodyMap ? new Set(bodyMap.filter(z => !z.destroyed).map(z => z.key)) : null;
  const alive = (zone) => !intact || intact.has(zone);
  const c = compileWiring(wiring, getPathways(creature));
  const dets = creature.detectionInfo || [];
  const S = dets.length;

  // ── The map: where each percept lands ──
  // A bearing (one of 8, from the creature) and a distance band (the wiring's
  // `map.bands` edges, in tiles; beyond the last edge is the far band).
  const edges = (wiring.map && wiring.map.bands) || [];
  const bandOf = (d) => { let b = 0; while (b < edges.length && d > edges[b]) b++; return b; };
  const places = dets.map(d => ({ x: d.x, y: d.y, entity: d.entity, velocity: d.velocity || null,
    distance: d.distance, band: bandOf(d.distance),
    bearing: (d.x !== creature.x || d.y !== creature.y) ? directionToward(creature.x, creature.y, d.x, d.y) : null }));
  const turn = state.turnCount;
  const stamp = creature._actionStamp = (creature._actionStamp || 0) + 1;   // this action
  // How far a node that predicts leads a moving place: the world ticks this
  // body needs to get there at a sprint, plus how long ago it was perceived
  const ownSpeed = getBodyPTW(creature, 1.0) / (REFERENCE_SPEED * BASE_TICKS_PER_ACTION);
  const reported = (n, pl, age) => {
    if (!n.predicts || !pl.velocity) return pl;
    const lead = (ownSpeed > 0 ? pl.distance / ownSpeed : 0) + (age || 0) * BASE_TICKS_PER_ACTION;
    return { ...pl, x: Math.round(pl.x + pl.velocity.vx * lead), y: Math.round(pl.y + pl.velocity.vy * lead), predicted: true };
  };

  // value: mapped → Float64Array per percept; pooled → { v, place }
  const val = new Map();
  const heldNow = new Map();   // node id → held places not perceived this action
  const pooledRead = (id) => {
    const x = val.get(id);
    if (!x) return { v: 0, place: null };
    if (x instanceof Float64Array) {          // strongest place on the map
      const n = c.byId.get(id);
      let best = 0, place = null;
      for (let i = 0; i < x.length; i++) if (x[i] > best) { best = x[i]; place = reported(n, places[i], 0); }
      for (const h of heldNow.get(id) || []) if (h.v > best) { best = h.v; place = reported(n, { ...h, held: true }, turn - h.turn); }
      return { v: best, place };
    }
    return x;
  };
  // A node's value as seen by a mapped node evaluating percept i: its value on
  // that percept if it is mapped too, its one value if pooled
  const at = (id, i) => {
    const x = val.get(id);
    return x instanceof Float64Array ? x[i] : (x ? x.v : 0);
  };

  // The hub's wires: their strength (formed share) and, this action, the
  // share of the hub's firing each gets; off for the first pass
  const hubId = c.hub ? c.hub.id : null;
  let share = 1, hubOff = false;
  const wOf = (targetId, w) => {
    const base = w.weight != null ? w.weight : 1;
    if (w.node !== hubId) return base;
    return hubOff ? 0 : base * hubStrength(creature, targetId, w) * share;
  };

  // One pass over the wiring. Returns what the hub held, and which nodes its
  // wires reach were driven past threshold (they would fire without it). A
  // dry pass holds nothing (no places written).
  const evaluate = (dry) => {
    val.clear();
    const held = [], driven = [];
    for (const n of wiring.nodes) {
      if (!alive(n.zone)) {
        val.set(n.id, n.mode === 'mapped' ? new Float64Array(S) : { v: 0, place: null });
        if (creature._held) delete creature._held[n.id];   // the tissue holding it is gone
        continue;
      }
      const t = _threshold(n, creature);
      const vetoes = c.liveVetoes.get(n.id) || [];
      const inhibits = c.liveInhibits.get(n.id) || [];
      const hubbed = hubId != null && inhibits.some(w => w.node === hubId);
      let wasHeld = false, wasDriven = false;
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
            else if (r.kind === 'intent') v = opts.intent ? 1 : 0;
            const w = inp.weight != null ? inp.weight : 1;
            const wv = v === 0 ? 0 : w * v;          // 0 × Infinity is no signal
            if (n.combine === 'max') { if (wv > x) x = wv; } else x += wv;
            any = true;
          }
          if (!any) x = 0;
          const vetoed = vetoes.some(v => at(v, i) > 0);
          let inh = 0;
          for (const w of inhibits) inh += wOf(n.id, w) * at(w.node, i);
          let y = vetoed ? 0 : _fire(n, x - inh, t);
          for (const g of n.gate || []) y = y === 0 ? 0 : y * at(g, i);
          const drive = !vetoed && _fire(n, x, t) > 0 && (n.gate || []).every(g => at(g, i) > 0);
          if (drive) wasDriven = true;
          if (inh > 0 && y === 0 && drive) wasHeld = true;
          // How strongly each distance band of the map is wired in
          if (n.bands && y > 0) y *= n.bands[Math.min(places[i].band, n.bands.length - 1)];
          out[i] = y;
        }
        val.set(n.id, out);
        if (n.holds && !dry) _hold(creature, n, out, places, turn, stamp, heldNow);
      } else {
        let x = n.combine === 'max' ? -Infinity : 0, any = false;
        let place = null, placeWeight = -Infinity;
        for (const inp of n.inputs || []) {
          const r = _parseRef(inp.from);
          let v = 0, p = null;
          if (r.kind === 'feature') {
            const f = POOLED_FEATURES[r.name];
            const got = f ? f(creature, r.arg) : 0;
            if (got && typeof got === 'object') { v = got.value; p = got.place || null; } else v = got || 0;
          } else if (r.kind === 'node') {
            const pr = pooledRead(r.name); v = pr.v; p = pr.place;
          } else if (r.kind === 'blood') {
            v = _blood(creature, r.name);
          } else if (r.kind === 'intent') {
            v = opts.intent ? 1 : 0;
          }
          const w = inp.weight != null ? inp.weight : 1;
          const wv = v === 0 ? 0 : w * v;
          if (n.combine === 'max') { if (wv > x) x = wv; } else x += wv;
          any = true;
          // The place this node is about: that of its largest input carrying one
          if (p && wv > placeWeight) { placeWeight = wv; place = p; }
        }
        if (!any) x = 0;
        const vetoed = vetoes.some(v => pooledRead(v).v > 0);
        let inh = 0;
        for (const w of inhibits) inh += wOf(n.id, w) * pooledRead(w.node).v;
        let v = vetoed ? 0 : _fire(n, x - inh, t);
        for (const g of n.gate || []) v = v === 0 ? 0 : v * pooledRead(g).v;
        const drive = !vetoed && _fire(n, x, t) > 0 && (n.gate || []).every(g => pooledRead(g).v > 0);
        if (drive) wasDriven = true;
        if (inh > 0 && v === 0 && drive) wasHeld = true;
        val.set(n.id, { v, place: v > 0 ? place : null });
      }
      if (wasHeld) held.push(n.id);
      if (hubbed && wasDriven) driven.push(n.id);
    }
    return { held, driven };
  };

  // With the player acting: a first pass with the hub's inhibition off finds
  // what it engages; its firing is split across that; then the real pass,
  // and each engaged wire grows (coincidence: the hub firing, its reflex driven)
  let hubInfo = null, pass;
  if (opts.intent && c.hub && alive(c.hub.zone)) {
    hubOff = true;
    const engaged = evaluate(true).driven;
    hubOff = false;
    const drives = (wiring.outputs || []).filter(o => o.node === hubId).length;
    const capacity = (c.hub.mass || 0) / HUB_KG_PER_OUTPUT;
    share = Math.min(1, capacity / Math.max(1, drives + engaged.length));
    pass = evaluate(false);
    const st = creature.hubStrength || (creature.hubStrength = {});
    for (const id of engaged) {
      const w = (c.liveInhibits.get(id) || []).find(ww => ww.node === hubId);
      const s = hubStrength(creature, id, w);
      st[id] = s + HUB_LEARN_RATE * (1 - s);
    }
    hubInfo = { share, engaged, capacity };
  } else {
    pass = evaluate(false);
  }
  const held = pass.held;

  // ── Trace for the inspector: what fired, and about what ──
  const trace = [];
  for (const n of wiring.nodes) {
    const pr = pooledRead(n.id);
    const e = pr.place && pr.place.entity;
    if (pr.v > 0) trace.push({ id: n.id, zone: n.zone, value: pr.v,
      about: e ? (e.isPlayer ? 'player' : e.key) : null,
      held: pr.place && pr.place.held ? true : undefined });
  }
  creature._nodeTrace = trace;

  // ── Output stage ──
  const firing = (id) => pooledRead(id);
  const outVetoed = (out) => (c.outVetoes.get(out) || []).some(v => firing(v).v > 0);
  const where = (pr) => pr.place;
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

  // What the output stage returns: the effect, the output's label and `act`
  // (the executor's name for it, ai.js; a bridge until the motor layer reads
  // effects directly), and the place and body it is about
  const result = (out, pr, extra) => {
    const p = pr ? where(pr) : null;
    return { intensity: 0, direction: null, source: p && p.entity ? p.entity : null,
             place: p ? { x: p.x, y: p.y } : null, type: out ? out.label : 'hold',
             effect: out ? out.effect : null, act: out ? out.act || null : null,
             isBolt: false, atFood: false, held, hub: hubInfo, ...extra };
  };

  // Strikes first: a strike circuit firing on something in reach throws the
  // strike (a jaw, a limb) at where it is
  for (const out of wiring.outputs || []) {
    if (out.effect !== 'strike' || !alive(out.zone)) continue;
    const pr = firing(out.node);
    if (!(pr.v > 0) || outVetoed(out) || !where(pr)) continue;
    return result(out, pr, { direction: bearing(out, pr) });
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
    return result(loco.out, loco.pr, { intensity: loco.out.intensity, direction: bearing(loco.out, loco.pr),
                                       isBolt: loco.out.label === 'bolt' });
  }
  // Then posture (holding still), orienting, feeding contact, in that order
  for (const effect of ['posture', 'orienting', 'feeding']) {
    for (const out of wiring.outputs || []) {
      if (out.effect !== effect || !alive(out.zone)) continue;
      const pr = firing(out.node);
      if (!(pr.v > 0) || outVetoed(out)) continue;
      return result(out, pr, { direction: effect === 'orienting' ? bearing(out, pr) : null,
                               source: effect === 'feeding' ? null : _entityOf(pr), atFood: effect === 'feeding' });
    }
  }
  return result(null, null);
}
const _entityOf = (pr) => (pr.place && pr.place.entity) || null;

/**
 * Holding: a node whose tissue can sustain activity keeps it at the place
 * where it was, for its mass × PERSISTENCE_SCALE turns (the rule traces use:
 * integration tissue holds ~30 turns per kg). What the senses deliver now
 * overwrites it: a source perceived again moves its activity to where it is
 * now, and one perceived where the node does not fire is let go. Held places
 * not perceived this action are added to the map for this action (heldNow).
 * Stored on the creature (`_held`, transient: a reload is a fresh mind).
 */
function _hold(creature, n, out, places, turn, stamp, heldNow) {
  const holdTurns = (n.mass || 0) * PERSISTENCE_SCALE;
  const all = creature._held || (creature._held = {});
  const held = all[n.id] || (all[n.id] = []);
  const perceived = new Set();
  for (let i = 0; i < places.length; i++) {
    const e = places[i].entity;
    if (e) perceived.add(e);
  }
  const kept = held.filter(h => !(h.entity && perceived.has(h.entity)) && turn - h.turn <= holdTurns &&
                                !(h.entity && h.entity.hp <= 0));
  for (let i = 0; i < places.length; i++) {
    if (out[i] > 0) kept.push({ ...places[i], v: out[i], turn, stamp });
  }
  all[n.id] = kept;
  heldNow.set(n.id, kept.filter(h => h.stamp < stamp));
}

/** How much of a hub wire has formed (0–1): written by use and saved with the
 *  body (creature.hubStrength, by target node); the wiring's innate share until
 *  then; a wire with no innate share given is fully formed. */
function hubStrength(creature, targetId, wire) {
  const st = creature.hubStrength;
  if (st && st[targetId] != null) return st[targetId];
  return wire && wire.innate != null ? wire.innate : 1;
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

export { runNodes, refillGlands, compileWiring, validateWiring, hubStrength, FEATURES, POOLED_FEATURES };
