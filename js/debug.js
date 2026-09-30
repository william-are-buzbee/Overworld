// ==================== DEBUG ====================
// Debug and testing helper functions for console inspection.
// Split from enemy-ai.js.

import { state } from './state.js';
import { getBodyMap,
         VASCULARITY_MIN, REGEN_UPREGULATION, SUBSTRATE_REGEN_BASE } from './constants.js';
import { getDominantSenseChannel, getBestChemicalAirborne,
         getEffectiveVisual, getDetectionRange } from './detection.js';
import { getBodyPTW, getMovementIntensity, _getCirculatoryRegenEfficiency } from './physiology.js';
import { monstersHere } from './turn-loop.js';
import { getWiring, CREATURE_WIRING } from './wiring.js';
import { validateWiring } from './nodes.js';

// ==================== DEBUG / TESTING HELPERS ====================
// Call from console: import('./enemy-ai.js').then(m => m.debugEcology())
// Or assign to window in main.js: window.debugEcology = debugEcology

/** Dump drive state and behavior for all creatures on the active layer. */
function debugEcology() {
  const mons = monstersHere();
  const summary = [];
  for (const m of mons) {
    if (m.hp <= 0) continue;
    const dom = getDominantSenseChannel(m);
    const bestChem = getBestChemicalAirborne(m);
    const bestVis = getEffectiveVisual(m);
    summary.push({
      name: m.name,
      key: m.key,
      diet: m.diet,
      tier: m.tier || '?',
      pos: `${m.x},${m.y}`,
      behavior: m.currentBehavior,
      hunger: m.hormones.hunger.toFixed(3),
      alarm: m.hormones.alarm.toFixed(3),
      fatigue: m.hormones.fatigue.toFixed(3),
      corpses: m.detectedCorpses ? m.detectedCorpses.length : 0,
      huntTarget: m.huntTarget ? (m.huntTarget.name || m.huntTarget.key || 'player') : null,
      dominant: dom.type + '(' + dom.value + ')',
      detRange: Math.round(getDetectionRange(m)),
    });
  }
  console.table(summary);
  return summary;
}

/** Force all predators on the active layer to high hunger (for testing hunts). */
function debugForceHunger(value = 0.85) {
  const mons = monstersHere();
  let count = 0;
  for (const m of mons) {
    if (m.hp <= 0) continue;
    if (m.diet === 'predator') {
      m.hormones.hunger = value;
      count++;
    }
  }
  console.log(`Set hunger to ${value} on ${count} predators.`);
  return count;
}

/** Dump each creature's last decision: what its wiring drove (the output
 *  that won, and the executor's behaviour for it), and what SNR-based info
 *  it has about its detections.
 *  Call from console: window.debugCognition() */
function debugCognition() {
  const mons = monstersHere();
  const rows = [];

  for (const m of mons) {
    if (m.hp <= 0) continue;

    const t = m._lastTrace || {};
    const ic = (m.integrationCapacity || 0).toFixed(3);

    // Summarize best detection info (Prompt P: continuous uncertainty)
    let snrSummary = '—';
    if (m.detectionInfo && m.detectionInfo.length > 0) {
      const parts = [];
      for (const det of m.detectionInfo) {
        const who = det.entity ? (det.entity.name || det.entity.key || 'player') : '?';
        const sz = det.sizeRelative || '?';
        const snr = det.bestSNR ? det.bestSNR.toFixed(1) : '?';
        const dc = det.dietConfidence ? det.dietConfidence.toFixed(2) : '0';
        const dt = det.dietType || '?';
        const mv = det.isMoving != null ? (det.isMoving ? 'mv' : 'still') : '?';
        const asmt = det.threatAssessment || '';
        const d = det.distance ? det.distance.toFixed(1) : '?';
        let detail = `${who}(${d}t snr=${snr}): sz=${sz}`;
        if (det.sizeEstimate) detail += ` [${det.sizeEstimate.lower.toFixed(1)}-${det.sizeEstimate.upper.toFixed(1)}kg]`;
        if (dt !== '?' && dc !== '0') detail += ` diet=${dt}@${dc}`;
        if (mv !== '?') detail += ` ${mv}`;
        if (det.woundChemistry) detail += ' wound';
        if (det.gaitAnomaly) detail += ' limp';
        if (asmt) detail += ` [${asmt}]`;
        parts.push(detail);
      }
      snrSummary = parts.join(' | ');
    }

    // Dominant sense (Prompt P: computed from zones, not _senses cache)
    const dom = getDominantSenseChannel(m);

    rows.push({
      name: m.name,
      system: getWiring(m) ? 'NODES' : '—',
      IC: ic,
      domSense: dom.type,
      apRate: getBodyPTW(m, getMovementIntensity(m)).toFixed(4),
      accAP: (m._accumulatedAP || 0).toFixed(0),
      actions: m._actionsThisTurn != null ? m._actionsThisTurn : '—',
      output: t.output || '—',
      act: t.act || '',
      final: t.finalBehavior || '—',
      alarm: (m.hormones ? m.hormones.alarm : 0).toFixed(2),
      intensity: t.intensity != null ? t.intensity.toFixed(2) : '',
      detections: snrSummary,
    });
  }

  if (rows.length === 0) {
    console.log('No living creatures on the active layer.');
    return [];
  }

  console.table(rows);
  return rows;
}

/** Dump substrate state for all creatures with fiber data on the active layer.
 *  Shows current substrate %, regen rate per turn, and turns to full.
 *  Call from console: window.debugSubstrate()
 *  Optional: window.debugSubstrate('hare') to filter by key. */
function debugSubstrate(filterKey) {
  const mons = monstersHere();
  const rows = [];

  // Helper: compute one zone's regen for display
  function zoneRegen(zone, circRegenEff) {
    const vasc = VASCULARITY_MIN + (1.0 - VASCULARITY_MIN) * (1.0 - zone.fiberRatio);
    const frac = (zone.substrate || 0) / zone.substrateMax;
    const boost = 1.0 + REGEN_UPREGULATION * (1.0 - frac);
    return zone.muscle * SUBSTRATE_REGEN_BASE * circRegenEff * vasc * boost;
  }

  for (const m of mons) {
    if (m.hp <= 0) continue;
    if (filterKey && m.key !== filterKey) continue;
    const bm = getBodyMap(m);
    if (!bm) continue;
    const circRegenEff = _getCirculatoryRegenEfficiency(m);

    for (const z of bm) {
      if (z.destroyed || z.fiberRatio == null) continue;
      if (z.substrateMax == null || z.substrateMax <= 0) continue;
      const pct = ((z.substrate || 0) / z.substrateMax * 100);
      const regen = zoneRegen(z, circRegenEff);
      // Estimate turns to full (rough — ignores the curve flattening)
      const deficit = z.substrateMax - (z.substrate || 0);
      const turnsToFull = deficit > 0 ? Math.ceil(deficit / regen) : 0;

      rows.push({
        name: m.name,
        key: m.key,
        circ: m.circulationType || '?',
        zone: z.key,
        loco: z.locomotion ? '✓' : '',
        fiberRatio: z.fiberRatio.toFixed(2),
        substrate: (z.substrate || 0).toFixed(3),
        max: z.substrateMax.toFixed(2),
        pct: pct.toFixed(1) + '%',
        regen: regen.toFixed(4),
        '~turnsToFull': turnsToFull,
      });
    }
  }

  // Also show player
  const p = state.player;
  const pbm = getBodyMap(p);
  if (pbm) {
    const pCirc = _getCirculatoryRegenEfficiency(p);
    for (const z of pbm) {
      if (z.destroyed || z.fiberRatio == null) continue;
      if (z.substrateMax == null || z.substrateMax <= 0) continue;
      const pct = ((z.substrate || 0) / z.substrateMax * 100);
      const regen = zoneRegen(z, pCirc);
      const deficit = z.substrateMax - (z.substrate || 0);
      const turnsToFull = deficit > 0 ? Math.ceil(deficit / regen) : 0;
      rows.push({
        name: '>>> PLAYER',
        key: p.species || 'player',
        circ: p.circulationType || '?',
        zone: z.key,
        loco: z.locomotion ? '✓' : '',
        fiberRatio: z.fiberRatio.toFixed(2),
        substrate: (z.substrate || 0).toFixed(3),
        max: z.substrateMax.toFixed(2),
        pct: pct.toFixed(1) + '%',
        regen: regen.toFixed(4),
        '~turnsToFull': turnsToFull,
      });
    }
  }

  if (rows.length === 0) {
    console.log('No creatures with fiber/substrate data found.');
    return [];
  }

  console.table(rows);
  return rows;
}

// ==================== EXPORTS ====================
/** What each wired creature's nodes did on its last action: which fired, how
 *  strongly, and about which source (the place on its map). Nodes that did
 *  not fire are left out. Optional filter by creature key.
 *  Call from console: window.debugNodes() or window.debugNodes('hare') */
function debugNodes(filterKey) {
  const rows = [];
  for (const m of monstersHere()) {
    if (m.hp <= 0 || !getWiring(m) || (filterKey && m.key !== filterKey)) continue;
    const fired = (m._nodeTrace || []).map(n => `${n.id}=${+n.value.toFixed(2)}${n.about ? '@' + n.about : ''}`);
    rows.push({ name: m.name, at: `${m.x},${m.y}`, did: m.currentBehavior || '—',
                alarm: (m.hormones ? m.hormones.alarm : 0).toFixed(2), fired: fired.join('  ') || '(nothing)' });
  }
  if (!rows.length) { console.log('No wired creatures on the active layer.'); return []; }
  console.table(rows);
  return rows;
}

/** A species' wiring, zone by zone: each node's inputs, function and
 *  threshold, and what its outputs drive; then anything wrong with it
 *  against the body (late inhibition, nodes over their zone's tissue).
 *  Call from console: window.debugWiring('hare') */
function debugWiring(key = 'hare') {
  const wiring = CREATURE_WIRING[key];
  if (!wiring) { console.log(`No wiring for ${key}. Wired: ${Object.keys(CREATURE_WIRING).join(', ')}`); return null; }
  const rows = wiring.nodes.map(n => ({
    zone: n.zone, node: n.id, kg: n.mass, mode: n.mode,
    inputs: (n.inputs || []).map(i => i.from.replace(/^(node|sense|feature):/, '') +
      (i.weight != null && i.weight !== 1 ? `×${+i.weight.toFixed(3)}` : '')).join(n.combine === 'max' ? ' | ' : ' + '),
    fn: `${n.fn || 'ramp'}${n.threshold ? ' ≥' + n.threshold : ''}${n.receptors ? ' (stress)' : ''}`,
    gate: (n.gate || []).join(','), vetoedBy: (n.vetoedBy || []).join(','),
  }));
  console.table(rows);
  console.table((wiring.outputs || []).map(o => ({ effect: o.effect, label: o.label || o.hormone,
    node: o.node, zone: o.zone, intensity: o.intensity, bearing: o.bearing, vetoedBy: (o.vetoedBy || []).join(',') })));
  const issues = validateWiring({ key }, wiring);
  console.log(issues.length ? 'Issues:\n  ' + issues.join('\n  ') : 'Wiring fits the body; all inhibition arrives in time.');
  return rows;
}

/** What each creature's stores hold (nodes.js, Memory): patterns with how
 *  often they were written and their associations, and ground known.
 *  Call from console: window.debugMemory() or window.debugMemory('wolf') */
function debugMemory(filterKey) {
  const rows = [];
  for (const m of monstersHere()) {
    if (m.hp <= 0 || !m.memory || (filterKey && m.key !== filterKey)) continue;
    for (const [id, st] of Object.entries(m.memory)) {
      if (st.patterns) {
        const top = [...st.patterns].sort((a, b) => b.n - a.n).slice(0, 6).map(p =>
          `${p.species || '?'}/${p.size || '?'}/${p.diet || '?'}×${p.n}` +
          (p.assoc ? ' ' + Object.entries(p.assoc).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' ') : ''));
        rows.push({ who: m.key, at: `${m.x},${m.y}`, store: id, holds: `${st.patterns.length} patterns`, top: top.join(' | ') });
      } else if (st.tiles) {
        rows.push({ who: m.key, at: `${m.x},${m.y}`, store: id, holds: `${st.count} tiles`, top: '' });
      }
    }
  }
  if (rows.length) console.table(rows); else console.log('No creature here remembers anything yet.');
  return rows;
}

export { debugEcology, debugForceHunger, debugCognition, debugSubstrate, debugNodes, debugWiring, debugMemory };
