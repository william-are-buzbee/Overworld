// ==================== HUB — THE PLAYER IN THE BODY ====================
// The player plays the hub (Neural-Architecture-Design, "The hub and the
// player"): before each action the player's body runs its own wiring on its
// own percepts, with the hub firing. The hub holds back what its fibres reach
// in time; a reflex it cannot hold takes the body instead of what was pressed,
// and the log says so. A body with no wiring (every species but the grazer,
// for now) is played directly, as before.
//
// Holding gets easier with use: the hub's wires grow each action it fires
// against a driven reflex (nodes.js), and the log says so as a wire firms up.
//
// Also the body screen (B): what the hub can drive, which reflexes it can
// partly hold and which it cannot, how far each wire has formed and how much
// the hub can do at once, read off the wiring, the pathways and the body.

import { state, worlds } from './state.js';
import { getPathways, SPRINT_INTENSITY, HUB_KG_PER_OUTPUT } from './constants.js';
import { buildAllDetectionInfo } from './detection.js';
import { runNodes, compileWiring, hubStrength } from './nodes.js';
import { getWiring } from './wiring.js';
import { isWalkable } from './terrain.js';
import { inBounds, monsterAt, isImpassable, getCover } from './world-state.js';
import { log, LOG_CATEGORIES } from './log.js';
import { endStealth } from './combat.js';
import { endPlayerTurn } from './turn-loop.js';

const _DELTAS = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
const _DIR_NAMES = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

// What a held reflex feels like, the first action it is held
const HELD_LINES = {
  flee:   'Your legs gather to run. You hold them.',
  freeze: 'Your body wants to go still. You keep moving.',
};
// A wire firming up: said as its formed share crosses each tenth
const LEARN_LINES = {
  flee:   'Holding your legs from running comes a little easier.',
  freeze: 'Keeping moving through the urge to freeze comes a little easier.',
};

/**
 * Run the player's body before a deliberate action (`kind`: 'move', 'turn',
 * 'rest', 'eat'). Returns true if a reflex took the body (the turn is spent;
 * the pressed action does not happen), false if the action goes ahead.
 */
function bodyTakes(kind) {
  const p = state.player;
  const wiring = p && p.hp > 0 ? getWiring(p) : null;
  if (!wiring) return false;

  buildAllDetectionInfo(p);
  const before = { ...(p.hubStrength || {}) };
  const out = runNodes(p, wiring, { intent: true });
  for (const id of (out.hub && out.hub.engaged) || []) {
    const was = before[id], now = p.hubStrength[id];
    if (was != null && LEARN_LINES[id] && Math.floor(now * 10) > Math.floor(was * 10)) {
      log(LEARN_LINES[id], LOG_CATEGORIES.COMBAT);
    }
  }
  p.tookDamageThisTurn = false;            // the pain input has read this action's blows

  // Held reflexes: said once, when the hold begins
  const wasHeld = new Set(p._hubHeld || []);
  for (const id of out.held || []) {
    if (!wasHeld.has(id) && HELD_LINES[id]) log(HELD_LINES[id], LOG_CATEGORIES.COMBAT);
  }
  p._hubHeld = out.held || [];

  if (out.type === 'bolt' || out.type === 'flee') return _reflexRun(p, out);
  if (out.type === 'freeze' && kind !== 'rest') {
    log('You freeze. The body will not move.', LOG_CATEGORIES.COMBAT);
    endPlayerTurn('rest');
    return true;
  }
  return false;
}

// A bolt or a flee: the generator drives the legs at a sprint along the
// output's bearing, or the nearest open bearing beside it. With no bearing
// (a taste underfoot has no place), the way the body faces.
function _reflexRun(p, out) {
  let dir = out.direction;
  if (dir == null) dir = _DELTAS.findIndex(([dx, dy]) => dx === state.facing.dx && dy === state.facing.dy);
  if (dir < 0) dir = 0;
  const tries = [dir, (dir + 1) % 8, (dir + 7) % 8, (dir + 2) % 8, (dir + 6) % 8];
  const verb = out.type === 'bolt' ? 'bolts' : 'flees';
  for (const d of tries) {
    const [dx, dy] = _DELTAS[d];
    const nx = p.x + dx, ny = p.y + dy;
    if (!inBounds(p.layer, nx, ny) || isImpassable(p.layer, nx, ny)) continue;
    if (monsterAt(nx, ny, p.layer)) continue;
    if (!isWalkable(worlds[p.layer][ny][nx], getCover(p.layer, nx, ny))) continue;
    if (p.immobilized) break;
    state.facing.dx = dx; state.facing.dy = dy;
    if (p.stealth) endStealth('You break into a run.');
    p._lastMovementIntensity = SPRINT_INTENSITY;
    p.x = nx; p.y = ny;
    p.movedThisTurn = true;
    log(`Your body ${verb} ${_DIR_NAMES[d]} before you can stop it.`, LOG_CATEGORIES.COMBAT);
    endPlayerTurn('move');
    return true;
  }
  log(`Your body tries to ${out.type === 'bolt' ? 'bolt' : 'flee'}, but has nowhere to go.`, LOG_CATEGORIES.COMBAT);
  endPlayerTurn('rest');
  return true;
}

/**
 * What the hub reaches, from the wiring and the pathways: the generators it
 * drives, and for each reflex that can take the body, whether its fibres
 * reach the reflex in time (and how far they raise it) or late, or not at all.
 */
function hubReport(entity) {
  const wiring = getWiring(entity);
  if (!wiring) return null;
  const c = compileWiring(wiring, getPathways(entity));
  const hubNode = wiring.nodes.find(n => (n.inputs || []).some(i => i.from.startsWith('intent:')));
  if (!hubNode) return null;
  const drives = (wiring.outputs || []).filter(o => o.node === hubNode.id)
    .map(o => ({ label: o.label, effect: o.effect, zone: o.zone, shutBy: o.vetoedBy || [] }));
  // Everything a reflex output's drive passes through, back to the senses
  const upstream = (id, seen = new Set()) => {
    if (seen.has(id)) return seen;
    seen.add(id);
    const n = c.byId.get(id);
    for (const inp of (n && n.inputs) || []) {
      if (inp.from.startsWith('node:')) upstream(inp.from.slice(5), seen);
    }
    return seen;
  };
  const reflexes = [];
  for (const o of wiring.outputs || []) {
    if (o.node === hubNode.id || (o.effect !== 'locomotion' && o.effect !== 'posture')) continue;
    if (o.label === 'forage') continue;    // below the hub's drive at the generator
    const holds = [], late = [];
    for (const id of upstream(o.node)) {
      const n = c.byId.get(id);
      for (const w of c.liveInhibits.get(id) || []) if (w.node === hubNode.id) {
        const formed = hubStrength(entity, id, w);
        holds.push({ node: id, zone: n.zone, weight: w.weight * formed, full: w.weight, formed });
      }
      for (const w of c.lateInhibits.get(id) || []) if (w.node === hubNode.id) late.push({ node: id, zone: n.zone, lag: w.lag });
    }
    reflexes.push({ label: o.label, node: o.node, holds, late });
  }
  return { hub: hubNode, drives, reflexes, capacity: (hubNode.mass || 0) / HUB_KG_PER_OUTPUT };
}

/** The body screen's HTML. */
function bodyScreenHTML(entity) {
  const r = hubReport(entity);
  let html = `<h2>Body</h2>`;
  if (!r) {
    html += `<div class="dialogue" style="font-style:normal;font-size:10px;">This body is not yet wired as nodes. You drive it directly.</div>`;
    return html + `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;
  }
  const alarm = entity.hormones ? entity.hormones.alarm || 0 : 0;
  const cap = Math.floor(r.capacity + 1e-9);
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;">You are the hub: ${(r.hub.mass * 1000).toFixed(0)} g of tissue in the ${r.hub.zone}, enough to drive or hold ${cap} thing${cap === 1 ? '' : 's'} at once at full strength; more, and each gets a share. What your fibres reach, you drive; what they reach in time, you can hold, and holding it strengthens the wire. Alarm in the blood: ${alarm.toFixed(2)}.</div>`;
  const row = (name, sub) => `<div class="row"><div class="lbl"><b>${name}</b><div class="sub">${sub}</div></div></div>`;
  for (const d of r.drives) {
    const shut = d.shutBy.length ? `; shut by ${d.shutBy.join(', ')}` : '';
    html += row(`Drive: ${d.label}`, `${d.effect} generator in the ${d.zone}${shut}`);
  }
  for (const x of r.reflexes) {
    let sub;
    if (x.holds.length) {
      sub = 'Partly held: ' + x.holds.map(h => `your fibres reach ${h.node} (${h.zone}) in time and raise it by ${h.weight.toFixed(2)} of ${h.full} (${Math.round(h.formed * 100)}% formed)`).join('; ') +
            '. Past that, it takes the body.';
    } else if (x.late.length) {
      sub = 'Cannot be held: ' + x.late.map(h => `your fibres reach ${h.node} (${h.zone}) ${h.lag} hop${h.lag > 1 ? 's' : ''} after it fires`).join('; ') + '. Practice cannot change that.';
    } else {
      sub = 'Cannot be held: nothing from the hub reaches it.';
    }
    html += row(`Reflex: ${x.label}`, sub);
  }
  return html + `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;
}

export { bodyTakes, hubReport, bodyScreenHTML };
