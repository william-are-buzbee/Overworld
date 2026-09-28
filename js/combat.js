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
         computeStrikeDamage, dodgeChance,
         BASE_ACCURACY, ACCURACY_PER_SNR, ACCURACY_SNR_CAP } from './constants.js';
import { randi, roll100 } from './rng.js';
import { canDetect, applySafetyFromDamage } from './detection.js';
import { chebyshev } from './world-state.js';
import { log, LOG_CATEGORIES } from './log.js';
import { applyZoneDamage } from './physiology.js';
import { placeItem, generateItemId } from './ground-items.js';

function monstersHere(){ return monsters[state.player.layer]; }

// Accuracy is how well the attacker senses the target right now: the best
// signal-to-noise ratio any of its zones has on the target, on any channel
// (Stat-System-Design "Accuracy"). Something it cannot sense at all is struck
// blind at BASE_ACCURACY.
function accuracyOf(attacker, target){
  const det = canDetect(attacker, target);
  const snr = det && det.detected ? Math.min(det.bestSNR || 0, ACCURACY_SNR_CAP) : 0;
  return BASE_ACCURACY + ACCURACY_PER_SNR * snr;
}

// The one hit roll for every strike: attacker's accuracy against the
// defender's mass-derived dodge, clamped to 5..95%.
function rollHit(attacker, defender){
  const c = Math.max(5, Math.min(95, accuracyOf(attacker, defender) - dodgeChance(defender)));
  return roll100() <= c;
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

  if (!rollHit(player, mon)){
    log(`You miss ${mon.name}.`, LOG_CATEGORIES.COMBAT);
    mon.wasAttacked = true;
    mon.alerted = true;
    mon.lastSeenX = player.x; mon.lastSeenY = player.y;
    return false;
  }

  // Pick the attack first so damage comes from the zone that actually strikes.
  let usedAttack = null, attackingZone = null;
  if (availAtks.length > 0){
    usedAttack = availAtks[randi(availAtks.length)];
    attackingZone = playerBodyMap.find(z => z.key === usedAttack.sourceZone);
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
      if (applyZoneDamage(mon, zone, zoneDmg).died) died = true;
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
// CREEP_INTENSITY (player-actions.js), so each step drops less energy into
// the ground (signals.js) and is felt from less far. It ends when the player
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

export { rollHit, accuracyOf, playerAttack, alertNearby, killMonster,
         toggleStealth, endStealth };
