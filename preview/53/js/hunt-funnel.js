// ==================== HUNT FUNNEL ====================
// Bookkeeping for tools/ecology.mjs, read by nothing in play (the same kind of
// record as physiology.js _noteBlow). It follows every animal a predator
// perceives through the stages that lead to a kill, per predator–prey pair:
//
//   1 detected   the predator perceives it (an episode opens)
//   2 viable     the predator judges it prey: isViablePrey (the deliberative
//                test) or a 'smaller' size reading (the reactive rules' test)
//   3 pursued    an action aimed at it (approach, chase, strike)
//   4 adjacent   the two bodies on neighbouring tiles
//   5 attacked   a strike thrown at it
//   6 hit        the strike connects (combat.js strikeContact)
//   7 killed     it dies with this predator the last to have struck it
//
// An episode closes when the predator neither perceives the animal nor holds
// a trace of it, when either dies, when either leaves the active radius, or
// at the end of the run; it records why. On every action the predator spends
// on a viable, perceived animal without pursuing it, the reactive rule (and
// any deliberative override) that sent it elsewhere is tallied.
//
// Transient fields on the predator (save-load.js strips them):
//   _hunts     Map<animal, episode>: open episodes
//   _huntLog   closed episodes
//   _huntStats hunger bands and trail-following bouts
import { state } from './state.js';
import { perceptOf, perceivedPosition, traceOf, isViablePrey } from './detection.js';
import { getCreatureMass } from './ai-utils.js';
import { REACTIVE_HUNGER_THRESHOLD, HUNGER_THRESHOLD, MIN_SEEK, SEEK_SCALE } from './constants.js';
import { DIET_DECISION_THRESHOLD } from './sensory-constants.js';
import { getDominantDrive } from './cognition.js';

const PURSUIT = new Set(['approach_food', 'hunt_chase', 'hunt_attack', 'attack_adjacent', 'retaliate']);
const STAGES = ['detected', 'viable', 'pursued', 'adjacent', 'attacked', 'hit', 'killed'];

function _who(e) { return !e ? 'none' : e.isPlayer ? 'player' : e.key; }
function _cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }
function _tally(obj, k) { obj[k] = (obj[k] || 0) + 1; }

/** Why the deliberative prey test turns this percept down, or null. */
function _notViableWhy(predator, info) {
  if (!info.sizeEstimate) return 'no size estimate';
  const ratio = info.sizeEstimate.estimated / getCreatureMass(predator);
  if (ratio > 1.5) return 'reads too big';
  const minRatio = predator.hormones.hunger > 0.85 ? 0.02 : 0.05;
  if (ratio < minRatio) return 'reads too small';
  return 'recognised as kin';
}

function _open(predator, prey, info) {
  return {
    prey: _who(prey), preyRef: prey, turn0: state.turnCount, lastTurn: state.turnCount,
    stage: 1, perceived: 0, viable: 0, viableDelib: 0, viableReactive: 0, pursuit: 0,
    hungerAtStart: +(predator.hormones ? predator.hormones.hunger : 0).toFixed(2),
    distAtStart: _cheb(predator.x, predator.y, prey.x, prey.y), minDist: Infinity,
    sizeCats: {}, notViable: {}, instead: {}, afterPursuit: {},
    pursuingLast: false, pursuedEver: false,
    preyFledBeforeContact: false, preyFledFromMe: false, preyFleeDist: null,
    predSpeedMax: 0, preyFleeSpeedMax: 0,
    blockedSteps: 0, blockedAtContact: 0, blockedPerceivedUnderfoot: 0, leashedSteps: 0,
    attacks: 0, misses: 0, airStrikes: 0, hits: [],
  };
}

/** Why the deliberative layer (cognition.js deliberativeEvaluation) did not
 *  send the predator after this animal. */
function _delibWhy(predator, prey, info) {
  const dom = getDominantDrive(predator).drive;
  if (dom !== 'hunger') return 'drive ' + dom;
  if (!(predator.detectedPrey || []).some(p => p.target === prey)) return 'fails isViablePrey';
  const seek = MIN_SEEK + (predator.integrationCapacity || 0) * SEEK_SCALE;
  if (info.distance > seek) return 'beyond seek range';
  if (info.threatAssessment === 'overwhelming' || info.threatAssessment === 'stronger') return 'assessed ' + info.threatAssessment;
  if (info.dietConfidence < DIET_DECISION_THRESHOLD) return 'diet unresolved';
  return 'chose another';
}

/** What sent the predator elsewhere this action. */
function _insteadLabel(predator, action, prey, info) {
  const d = predator.hormones || {};
  const tr = predator._lastTrace || {};
  if (action && action.target && action.target !== prey && PURSUIT.has(action.behavior)) return 'pursuing another';
  if (!(d.hunger > REACTIVE_HUNGER_THRESHOLD)) return 'not hungry';
  let label = tr.reactiveRule || ('? ' + (action ? action.behavior : ''));
  if (tr.overrideAttempted) {
    label += tr.overrideSucceeded ? ' → delib ' + tr.finalBehavior : ' (delib had nothing)';
    label += ' {' + _delibWhy(predator, prey, info) + '}';
  } else label += ' (no override)';
  if (action && action.target && action.target !== prey && action.target.key) label += ' @' + _who(action.target);
  if (info && info.distance > 4 && /^R(7|8|9)|^R\?/.test(label)) label += ' [prey >4 tiles]';
  return label;
}

function _close(predator, ep, end) {
  ep.end = end;
  ep.lastTurn = state.turnCount;
  predator._hunts.delete(ep.preyRef);
  (predator._huntLog || (predator._huntLog = [])).push(ep);
}

/** Why an episode whose animal has dropped out of mind ended. */
function _lostReason(ep) {
  if (ep.hits.length) return 'hit, then lost';
  if (ep.attacks) return 'got clear, then lost';
  if (ep.pursuingLast) {
    if (ep.preyFledBeforeContact) {
      return ep.preyFleeSpeedMax > ep.predSpeedMax ? 'lost: prey fled first, faster' : 'lost: prey fled first, not faster';
    }
    return 'lost while pursuing, prey not fleeing';
  }
  if (ep.pursuedEver) {
    const top = Object.entries(ep.afterPursuit).sort((a, b) => b[1] - a[1])[0];
    return 'broke off: ' + (top ? top[0] : '?');
  }
  if (ep.viable) {
    const top = Object.entries(ep.instead).sort((a, b) => b[1] - a[1])[0];
    return 'never pursued: ' + (top ? top[0] : '?');
  }
  const top = Object.entries(ep.notViable).sort((a, b) => b[1] - a[1])[0];
  return 'not viable: ' + (top ? top[0] : '?');
}

/**
 * After a predator's action (ai.js runCreatureAI). x0, y0: where it stood
 * before the action (the animal has not moved during it).
 */
function noteHuntAction(predator, action, x0, y0) {
  if (predator.diet !== 'predator' || predator.hp <= 0) return;
  const hunts = predator._hunts || (predator._hunts = new Map());
  const stats = predator._huntStats || (predator._huntStats = {
    actions: 0, hungry: 0, veryHungry: 0, trackActions: 0, trackBouts: 0,
    trackThen: {}, trackToViable: 0, inTrack: false,
  });
  const d = predator.hormones || {};
  stats.actions++;
  if (d.hunger > REACTIVE_HUNGER_THRESHOLD) stats.hungry++;
  if (d.hunger > HUNGER_THRESHOLD) stats.veryHungry++;

  let anyViable = false;
  const turn = state.turnCount;

  // Open episodes for what is perceived now, and update them
  for (const info of (predator.detectionInfo || [])) {
    const prey = info.entity;
    if (!prey || prey === predator || prey.hp <= 0) continue;
    let ep = hunts.get(prey);
    if (!ep) { ep = _open(predator, prey, info); hunts.set(prey, ep); }
    ep.perceived++;
    ep.lastTurn = turn;
    _tally(ep.sizeCats, info.sizeRelative || 'none');
    const delib = isViablePrey(predator, info);
    const react = info.sizeRelative === 'smaller' || info.sizeRelative === 'much_smaller';
    if (delib) ep.viableDelib++;
    if (react) ep.viableReactive++;
    if (delib || react) { ep.viable++; anyViable = true; if (ep.stage < 2) ep.stage = 2; }
    else _tally(ep.notViable, _notViableWhy(predator, info) + ', reads ' + (info.sizeRelative || 'unsized'));
  }

  for (const [prey, ep] of hunts) {
    const info = perceptOf(predator, prey);
    const pursuing = !!(action && action.target === prey && PURSUIT.has(action.behavior));
    if (pursuing) {
      ep.pursuit++;
      ep.pursuedEver = true;
      if (ep.stage < 3) ep.stage = 3;
      // A chase step that went nowhere: terrain, bodies, or the territory
      // leash (ai-utils.canMoveTo), the only leash on the live chase path
      if ((action.behavior === 'approach_food' || action.behavior === 'hunt_chase') &&
          predator.x === x0 && predator.y === y0) {
        ep.blockedSteps++;
        if (_cheb(x0, y0, prey.x, prey.y) <= 1) ep.blockedAtContact++;
        const pp = perceivedPosition(predator, prey);
        if (pp && pp.x === x0 && pp.y === y0) ep.blockedPerceivedUnderfoot++;
        if (predator.territoryRadius > 0 && predator.clade && predator.clade.territorial && !predator.threatSource &&
            _cheb(x0, y0, predator.homeX, predator.homeY) >= predator.territoryRadius) ep.leashedSteps++;
      }
    } else if (info && (ep.viable > 0)) {
      const label = _insteadLabel(predator, action, prey, info);
      if (ep.pursuedEver) _tally(ep.afterPursuit, label);
      else _tally(ep.instead, label);
    }
    if (info || pursuing) ep.pursuingLast = pursuing;

    // Contact: before this action (the animal did not move during it) or after
    const dNow = _cheb(predator.x, predator.y, prey.x, prey.y);
    const dBefore = _cheb(x0, y0, prey.x, prey.y);
    ep.minDist = Math.min(ep.minDist, dNow, dBefore);
    if (Math.min(dNow, dBefore) <= 1 && ep.stage < 4) ep.stage = 4;

    // The animal's own flight, and the speeds (turn-loop.js _recordStep: the
    // speed of each body's last step)
    if (prey.currentBehavior === 'flee' && prey.hp > 0) {
      if (ep.stage < 4 && !ep.preyFledBeforeContact) {
        ep.preyFledBeforeContact = true;
        ep.preyFleeDist = Math.min(dNow, dBefore);
      }
      if (prey.threatSource === predator) ep.preyFledFromMe = true;
      ep.preyFleeSpeedMax = Math.max(ep.preyFleeSpeedMax, prey._speed || 0);
    }
    if (pursuing) ep.predSpeedMax = Math.max(ep.predSpeedMax, predator._speed || 0);

    // Close
    if (prey.hp <= 0) {
      _close(predator, ep, prey._lastStruckBy === predator ? 'killed' : 'prey died: ' + (prey.deathCause || '?'));
    } else if (prey._dormant) {
      _close(predator, ep, 'prey left active radius');
    } else if (!info && !traceOf(predator, prey)) {
      _close(predator, ep, _lostReason(ep));
    }
  }

  // Trail and air following ('track'): what the bout ended in
  const tracking = predator.currentBehavior === 'track';
  if (tracking) {
    stats.trackActions++;
    if (!stats.inTrack) stats.trackBouts++;
  } else if (stats.inTrack) {
    _tally(stats.trackThen, action ? action.behavior : '?');
    if (anyViable) stats.trackToViable++;
  }
  stats.inTrack = tracking;
}

/** A strike thrown by a predator at an animal it has an episode on
 *  (behaviors.js performNPCAttack, monsterMelee). hit: 'air' for a lunge at a
 *  misplaced percept (the animal is not on the next tile), null when it got
 *  clear (combat.js strikeContact), else
 *  { why (combat.js strikeContact), zone, raw, armour, dealt, zoneHpBefore, zoneMaxHp, destroyed, died }. */
function noteStrike(attacker, defender, hit) {
  const ep = attacker._hunts && attacker._hunts.get(defender);
  if (!ep) return;
  if (hit === 'air') { ep.airStrikes++; return; }
  ep.attacks++;
  if (ep.stage < 5) ep.stage = 5;
  if (!hit) { ep.misses++; return; }
  if (ep.stage < 6) ep.stage = 6;
  ep.hits.push(hit);
  if (hit.died && ep.stage < 7) ep.stage = 7;
}

/** Close every open episode (the harness calls this when the predator goes
 *  dormant: it stops acting, so nothing else would close them). */
function closeHunts(predator, why) {
  if (!predator._hunts) return;
  for (const ep of [...predator._hunts.values()]) _close(predator, ep, why);
}

/** Plain copies of a predator's episodes, open ones closed as `why` (the
 *  harness calls this at the end of a run). An episode that ended with the
 *  animal wounded and lost, whose animal later bled out with this predator
 *  the last to have struck it, counts as a kill. */
function huntRecords(predator, why) {
  const out = [];
  const all = [...(predator._huntLog || []), ...[...(predator._hunts ? predator._hunts.values() : [])]
    .map(ep => ({ ...ep, end: predator.hp <= 0 ? 'predator died' : predator._dormant ? 'predator left active radius' : why }))];
  for (const ep of all) {
    const prey = ep.preyRef;
    const r = { ...ep };
    delete r.preyRef;
    if (prey && prey.hp <= 0 && prey._lastStruckBy === predator && r.stage >= 6 && r.end !== 'killed') {
      r.end = 'killed (bled out after: ' + r.end + ')';
      r.stage = 7;
    }
    r.predator = _who(predator);
    r.minDist = Number.isFinite(r.minDist) ? r.minDist : null;
    out.push(r);
  }
  return out;
}

export { noteHuntAction, noteStrike, closeHunts, huntRecords, STAGES };
