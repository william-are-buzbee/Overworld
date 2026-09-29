// ==================== COMBAT + STEALTH ====================
// The one hit roll, the player's strike, and the stealth toggle. A player
// attack resolves exactly like an NPC's (behaviors.js monsterMelee): one of
// the body map's available attacks is chosen, damage comes from the striking
// zone's tissue (computeStrikeDamage), the footprint from the attack's damage
// type, armor from the target zone's structural mass, and every hit goes
// through applyZoneDamage. There are no weapons, no armor items, no XP or
// levels, no stats: the body is the character.
import { render } from './rendering.js';
import { state, monsters } from './state.js';
import { getBodyMap, selectHitZone, getAvailableAttacks, ARMOR_PER_STRUCTURAL_KG,
         getAttackDirection, getExposedZones, selectContactedZones,
         computeStrikeDamage } from './constants.js';
import { randi } from './rng.js';
import { canDetect, applySafetyFromDamage, perceivedPosition } from './detection.js';
import { chebyshev } from './world-state.js';
import { log, LOG_CATEGORIES } from './log.js';
import { applyZoneDamage, getBodyPTW, getEntityTotalMass, spendBurst } from './physiology.js';
import { canMoveTo, DIRECTION_DELTAS } from './ai-utils.js';
import { placeItem, generateItemId } from './ground-items.js';

function monstersHere(){ return monsters[state.player.layer]; }

// ==================== CONTACT GEOMETRY ====================
// Whether a strike connects is geometry, not a roll (Stat-System-Design
// "Contact"). A strike is a zone driven at a point in space.
//
// Aim: it goes where the attacker perceives the target (its percept, or the
// trace its tissue holds); the player strikes the tile it moves into. If the
// target is not on that tile, the strike meets air.
//
// Getting clear: the defender slips the strike only if its senses deliver
// the attacker at that moment (a strike it does not sense always lands), it
// can move (not immobilized, a free tile beside it), and it clears its own
// body length faster than the striking zone covers the attacker's. Both are
// force-to-weight over a length: the defender's locomotion at a sprint
// (getBodyPTW at full intensity, so its fast-twitch fuel counts) over
// cbrt(its mass), against the striking zone's working muscle over the zone's
// mass over cbrt(the attacker's mass). Getting clear is a burst: it burns a
// sprint action's fuel (physiology.js spendBurst), so a tired body stops
// getting clear. Fresh bodies: a grazer (0.225) slips every current strike;
// a prowler (0.104) slips bites (0.056-0.081) but not claws (0.189); a
// ravager (0.063) only the slowest jaws.
//
// Replaces the hit roll (accuracy from SNR, dodge from mass, 5-95%): the
// same two things, perception and the target's body, without the dice.

/** A striking zone's rate: working muscle over the zone's mass, over the
 *  attacker's length. Infinity for a strike from no zone (nothing to time). */
function strikeRate(attacker, atkZone){
  if (!atkZone || !(atkZone.mass > 0)) return Infinity;
  const hpFrac = atkZone.maxHp > 0 ? atkZone.hp / atkZone.maxHp : 1;
  const muscle = (atkZone.muscle || 0) * hpFrac * (1 - (attacker.bleedPenalty || 0));
  return (muscle / atkZone.mass) / Math.cbrt(getEntityTotalMass(attacker));
}

/** How fast the defender's body gets clear of where it stands right now. */
function evasionRate(defender){
  return getBodyPTW(defender, 1.0) / Math.cbrt(getEntityTotalMass(defender));
}

/** 'hit', 'air' (aimed where the target is not) or 'clear' (it got clear).
 *  The caller has already checked that the target is on a neighbouring tile. */
function strikeContact(attacker, defender, atkZone){
  if (!attacker.isPlayer){
    const aim = perceivedPosition(attacker, defender);
    if (!aim || aim.x !== defender.x || aim.y !== defender.y) return 'air';
  }
  if (defender.immobilized) return 'hit';
  const sensed = canDetect(defender, attacker);
  if (!sensed || !sensed.detected) return 'hit';
  let room = false;
  for (const d of DIRECTION_DELTAS){
    if (canMoveTo(defender, defender.x + d.x, defender.y + d.y)) { room = true; break; }
  }
  if (!room) return 'hit';
  if (evasionRate(defender) <= strikeRate(attacker, atkZone)) return 'hit';
  spendBurst(defender);
  return 'clear';
}

// Strike verb from the attack that lands (mirrors monsterMelee's table).
function strikeVerb(usedAttack){
  const atkName = usedAttack ? usedAttack.name.toLowerCase() : null;
  const dmgType = usedAttack ? usedAttack.damageType : 'blunt';
  if (dmgType === 'puncture') return atkName === 'bite' ? 'bite' : atkName === 'hook' ? 'hook' : 'pierce';
  if (dmgType === 'slashing') return atkName === 'claw' ? 'claw' : 'rake';
  return 'strike';
}

/** The player bump-attacks `mon`. Returns true on a hit (a turn's 'attack'), false on a miss. */
function playerAttack(mon){
  const player = state.player;
  // Zone destruction can leave nothing to strike with (same gate as monsterMelee).
  const playerBodyMap = getBodyMap(player);
  const availAtks = playerBodyMap ? getAvailableAttacks(playerBodyMap) : [];
  if (playerBodyMap && availAtks.length === 0){
    log('Nothing you could strike with remains.', LOG_CATEGORIES.COMBAT);
    return false;
  }

  // Pick the attack first: whether it connects depends on the zone that strikes.
  let usedAttack = null, attackingZone = null;
  if (availAtks.length > 0){
    usedAttack = availAtks[randi(availAtks.length)];
    attackingZone = playerBodyMap.find(z => z.key === usedAttack.sourceZone);
  }

  if (strikeContact(player, mon, attackingZone) !== 'hit'){
    log(`${mon.name} gets clear of your ${usedAttack ? usedAttack.name.toLowerCase() : 'strike'}.`, LOG_CATEGORIES.COMBAT);
    mon.wasAttacked = true;
    mon.alerted = true;
    mon.lastSeenX = player.x; mon.lastSeenY = player.y;
    return false;
  }

  const dmg = Math.max(1, computeStrikeDamage(player, attackingZone, usedAttack) + randi(3));

  // ─── Footprint-based zone resolution on the defender ───
  const monBodyMap = getBodyMap(mon);
  let contactedZones = null;
  if (monBodyMap){
    const defFacing = mon.facing || { dx: 0, dy: 1 };
    const attackDir = getAttackDirection({ x: player.x, y: player.y }, { x: mon.x, y: mon.y }, defFacing);
    const exposedZones = getExposedZones(monBodyMap, attackDir);
    if (exposedZones.length > 0){
      const bodyDmgType = (usedAttack && usedAttack.damageType) || 'blunt';
      const footprint = attackingZone
        ? attackingZone.mass * ((usedAttack && usedAttack.footprintModifier) || 0.3)
        : 0.5;
      contactedZones = selectContactedZones(exposedZones, footprint, bodyDmgType);
    }
  }
  if (!contactedZones || contactedZones.length === 0){
    const fallbackZone = monBodyMap ? selectHitZone(monBodyMap) : null;
    contactedZones = fallbackZone ? [fallbackZone] : [];
  }

  mon.hitFlash = 3;
  mon.damageTaken = (mon.damageTaken || 0) + dmg;

  // Naturalistic log line, no numbers.
  const verb = strikeVerb(usedAttack);
  if (contactedZones.length === 1){
    log(`You ${verb} ${mon.name}'s ${contactedZones[0].name}.`, LOG_CATEGORIES.COMBAT);
  } else if (contactedZones.length === 2){
    const names = contactedZones.map(z => z.name).join(' and ');
    log(`You ${verb} across ${mon.name}'s ${names}.`, LOG_CATEGORIES.COMBAT);
  } else if (contactedZones.length >= 3){
    const last = contactedZones[contactedZones.length - 1].name;
    const rest = contactedZones.slice(0, -1).map(z => z.name).join(', ');
    log(`Your ${verb} catches ${mon.name}'s ${rest}, and ${last}.`, LOG_CATEGORIES.COMBAT);
  } else {
    log(`You ${verb} ${mon.name}.`, LOG_CATEGORIES.COMBAT);
  }

  // ─── Distribute damage across contacted zones ───
  let died = false;
  if (contactedZones.length > 0 && monBodyMap){
    const totalContactedMass = contactedZones.reduce((sum, z) => sum + z.mass, 0);
    for (const zone of contactedZones){
      const share = (totalContactedMass > 0) ? (zone.mass / totalContactedMass) : (1 / contactedZones.length);
      const zoneArmor = (zone.structural || 0) * ARMOR_PER_STRUCTURAL_KG;
      const zoneDmg = Math.max(1, dmg * share - zoneArmor);
      if (applyZoneDamage(mon, zone, zoneDmg, { by: player }).died) died = true;
    }
  }

  // Prompt I-B: spike safety drive from damage taken
  if (!died) applySafetyFromDamage(mon, dmg, player);

  // Enemy bleed feedback, read at the depth the player's cognition allows:
  // tier 3 (planning) reads how badly, tier 2 that it bleeds, tier 1 only
  // that it is hurt. (player.tier is set each turn from integration capacity.)
  if (!died && mon.blood != null && mon.bloodMax > 0){
    const bloodRatio = mon.blood / mon.bloodMax;
    if (bloodRatio < 0.75){
      const tier = player.tier || 1;
      if (tier >= 3){
        if (bloodRatio < 0.25) log(`${mon.name}'s movements are sluggish. Blood loss.`, LOG_CATEGORIES.COMBAT);
        else if (bloodRatio < 0.50) log(`${mon.name} is bleeding heavily. It weakens.`, LOG_CATEGORIES.COMBAT);
        else log(`${mon.name} bleeds from its wounds.`, LOG_CATEGORIES.COMBAT);
      } else if (tier === 2){
        log(`${mon.name} bleeds from its wounds.`, LOG_CATEGORIES.COMBAT);
      } else {
        log(`The creature is wounded.`, LOG_CATEGORIES.COMBAT);
      }
    }
  }

  // Mark attacked — switches to chase state, records last seen.
  // Mushrooms don't react individually — swarm AI handles their behavior.
  mon.wasAttacked = true;
  if (mon.key !== 'mushroom'){
    mon.alerted = true;
    mon.aiState = 'chase';
    mon.chaseTurnsLeft = mon.chase;
    mon.lastSeenX = player.x; mon.lastSeenY = player.y;
  }
  // Treants: hitting one alerts nearby treants, but they don't chase unless
  // personally attacked.
  if (mon.key === 'treant'){
    for (const m of monstersHere()){
      if (m.hp <= 0 || m === mon) continue;
      if (m.key === 'treant' && chebyshev(m.x, m.y, mon.x, mon.y) <= 5) m.alerted = true;
    }
  } else {
    alertNearby(mon, 4);
  }

  if (died) killMonster(mon);
  return true;
}

function alertNearby(src, radius){
  const player = state.player;
  for (const m of monstersHere()){
    if (m.hp <= 0) continue;
    // Treants only respond when personally attacked, not when nearby allies are hit
    if (m.key === 'treant' && m !== src) continue;
    // Mushrooms use pack coordination, not standard alert
    if (m.key === 'mushroom') continue;
    if (chebyshev(m.x, m.y, src.x, src.y) <= radius){
      m.alerted = true;
      if (m.aiState === 'idle'){
        m.aiState = 'chase';
        m.chaseTurnsLeft = m.chase;
        m.lastSeenX = player.x; m.lastSeenY = player.y;
      }
    }
  }
}

// A creature killed by the player leaves a corpse. Nothing else: no XP, no
// gold. (applyZoneDamage has already set hp = 0 and deathCause.)
function killMonster(mon){
  placeItem(state.player.layer, mon.x, mon.y, {
    id:       generateItemId(),
    kind:     'corpse',
    type:     'corpse',
    name:     `${mon.name} Corpse`,
    desc:     `${mon.name} Corpse — could be butchered or examined.`,
    sprite:   'CORPSE',
    weight:   2,
    quantity: 1,
    source:   mon.key,
    mass:     mon.totalMass || 1,  // what there is to eat, in kg
  });
  log(`${mon.name} falls.`, LOG_CATEGORIES.COMBAT);
}

// ==================== STEALTH ====================
// The F key: creep. A gait, not a concealment state — the body is driven at
// CREEP_INTENSITY (player-actions.js), so each step recruits less muscle: it
// covers ground at 40% of a walk's pace (physiology.js getBodyPTW) and drops
// less energy into the ground (signals.js), felt from less far. It ends when the player
// sprints or presses F again; being struck or striking does not change a gait.
function toggleStealth(){
  const player = state.player;
  if (player.stealth){ endStealth('You stop creeping.'); return; }
  player.stealth = true;
  if (!player.effects.find(e => e.type === 'stealth')){
    player.effects.push({ type: 'stealth', turns: 999 });
  }
  log('You creep.', LOG_CATEGORIES.MOVEMENT);
  render();
}
function endStealth(msg){
  const player = state.player;
  player.stealth = false;
  player.effects = player.effects.filter(e => e.type !== 'stealth');
  if (msg) log(msg, LOG_CATEGORIES.COMBAT);
}

export { strikeContact, strikeRate, evasionRate, playerAttack, alertNearby, killMonster,
         toggleStealth, endStealth };
