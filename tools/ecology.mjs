#!/usr/bin/env node
// ecology.mjs — runs the world headless over several seeds and reports what the
// animals did, as means and spreads across seeds. One seed is an anecdote: a small
// change anywhere reroutes the whole world, so single-run counts swing wildly (hare
// flight from shalebacks went 83 → 531 → 103 across three unrelated changes). Use
// this before and after a change to see whether it moved anything beyond the noise.
//
// The player is the camera: only creatures within the active radius are simulated,
// so it stands still (rests) for the whole run. A creature that kills it ends that
// run early; the report says how often and by what.
//
// Usage:
//   PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright node tools/ecology.mjs
//     [--seeds=1-8 | --seeds=3,7,11] [--turns=500] [--hunger=0.9] [--json=out.json]
//   --hunger sets every predator's hunger drive at the start (predation is rare in
//   short runs otherwise: hunger grows slowly with body mass).
//
// Besides behaviour and deaths it reports the hunt funnel (js/hunt-funnel.js):
// per predator–animal pair, how many episodes reached each stage from detection
// to kill and why each ended, what the predator did instead while the animal was
// viable and perceived, the strikes and their damage; how hungry the predators
// were and where trail-following led; body speed capacity per species; and how
// many creatures the active radius around the player simulates.
//   Compare two branches by running it on each and diffing the JSON.
//
// Needs Playwright's Chromium, like smoke.mjs. Not run in CI (it takes minutes).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch (e) { console.error('playwright not resolvable; set PLAYWRIGHT_MODULE (see smoke.mjs)'); process.exit(2); }
const { chromium } = playwright;

// ── Arguments ──
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
function parseSeeds(s) {
  if (!s) return [1, 2, 3, 4, 5, 6, 7, 8];
  if (/^\d+-\d+$/.test(s)) { const [a, b] = s.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
  return String(s).split(',').map(Number).filter(n => Number.isFinite(n));
}
const SEEDS = parseSeeds(args.seeds);
const TURNS = Number(args.turns || 500);
const HUNGER = args.hunger != null ? Number(args.hunger) : null;

// ── Static server (same as smoke.mjs) ──
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.md': 'text/plain' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); let p = path.join(root, decodeURIComponent(url.pathname));
  if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function waitForPlay(page, timeoutMs = 30000) {
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate(async () => { const m = await import('./js/state.js'); return m.state.gameState === 'play' && !!m.state.player && Array.isArray(m.worlds[0]); });
    if (ok) return;
    if (Date.now() - t0 > timeoutMs) throw new Error('game did not reach play state');
    await page.waitForTimeout(100);
  }
}

// ── One run ──
async function runSeed(seed) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/index.html?seed=${seed}`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await waitForPlay(page);

  // Install the tally inside the page: one call per turn keeps the round trips small.
  await page.evaluate(async (hunger) => {
    const { state, monsters } = await import('./js/state.js');
    const { closeHunts } = await import('./js/hunt-funnel.js');
    const { getBodyPTW, turnsToFullSpeed, getEntityTotalMass } = await import('./js/physiology.js');
    const { WALK_INTENSITY } = await import('./js/constants.js');
    const L = state.player.layer;
    const t = window.__eco = {
      start: {}, behaviour: {}, deaths: {}, kills: {}, deathDetail: [], seen: new Set(), everyone: new Set(),
      killedBy: null, turns: 0,
      // Encounters: who is simulated (the active radius around the player),
      // and how far each active predator is from the nearest active animal it
      // could take (another species, at most 1.5× its mass: true masses).
      active: {}, dormant: {}, nearestPrey: {},
      speeds: {},
    };
    // Body speed capacity per species (fresh bodies, full substrate): the
    // force-to-weight a sprint and a walk produce, and actions to full speed.
    for (const m of monsters[L]) {
      if (m.hp <= 0 || t.speeds[m.key]) continue;
      const mass = getEntityTotalMass(m);
      t.speeds[m.key] = { mass: +mass.toFixed(1), sprint: +getBodyPTW(m, 1.0).toFixed(3),
        walk: +getBodyPTW(m, WALK_INTENSITY).toFixed(3), toFullSpeed: turnsToFullSpeed(mass) };
    }
    const who = (e) => !e ? 'none' : e.isPlayer ? 'player' : e.key;
    for (const m of monsters[L]) {
      if (m.hp <= 0) continue;
      t.start[m.key] = (t.start[m.key] || 0) + 1;
      t.seen.add(m); t.everyone.add(m);
      if (hunger != null && m.diet === 'predator' && m.drives) m.drives.hunger = hunger;
    }
    window.__ecoTick = () => {
      const all = monsters[L] || [];
      const alive = new Set();
      for (const m of all) {
        if (m.hp > 0) alive.add(m);
        if (m.hp > 0 && !m._dormant) {
          const k = m.key + ':' + (m.currentBehavior || '?');
          t.behaviour[k] = (t.behaviour[k] || 0) + 1;
        }
      }
      for (const m of t.seen) {
        if (!alive.has(m)) {
          const k = m.key + ':' + (m.deathCause || 'unknown');
          t.deaths[k] = (t.deaths[k] || 0) + 1;
          // Killer: the last creature to land a blow (physiology.js _noteBlow).
          const killer = m._lastStruckBy || null;
          const kk = m.key + '<-' + who(killer);
          t.kills[kk] = (t.kills[kk] || 0) + 1;
          const f = killer && m._fights && m._fights.get(killer);
          t.deathDetail.push({ victim: m.key, cause: m.deathCause || 'unknown', killer: who(killer), turn: t.turns,
            victimMass: +(m.totalMass || 0).toFixed(1), killerMass: killer ? +(killer.totalMass || 0).toFixed(1) : null,
            victimOpened: f ? f.opened : null, victimDoing: f ? f.doing : null,
            blowsDealt: f ? f.dealt : 0, blowsTaken: f ? f.taken : 0,
            killerDoing: killer && killer._fights && killer._fights.get(m) ? killer._fights.get(m).doing : null });
          t.seen.delete(m);
        }
      }
      for (const m of alive) { t.seen.add(m); t.everyone.add(m); }
      // A dormant predator stops acting: close its open hunt episodes
      const act = [];
      for (const m of alive) {
        const bucket = m._dormant ? t.dormant : t.active;
        bucket[m.key] = (bucket[m.key] || 0) + 1;
        if (m._dormant) { if (m.diet === 'predator') closeHunts(m, 'predator left active radius'); }
        else act.push(m);
      }
      for (const p of act) {
        if (p.diet !== 'predator') continue;
        let best = Infinity;
        for (const q of act) {
          if (q === p || q.key === p.key || (q.totalMass || 0) > 1.5 * (p.totalMass || 0)) continue;
          best = Math.min(best, Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)));
        }
        const b = best <= 5 ? '≤5' : best <= 10 ? '6-10' : best <= 20 ? '11-20' : best <= 40 ? '21-40' : best < Infinity ? '>40' : 'none active';
        const k = p.key + ' ' + b;
        t.nearestPrey[k] = (t.nearestPrey[k] || 0) + 1;
      }
      t.turns++;
      return state.player.hp > 0;
    };
  }, HUNGER);

  let turns = 0;
  for (; turns < TURNS; turns++) {
    await page.keyboard.press(' ');
    const alive = await page.evaluate(() => window.__ecoTick());
    if (!alive) break;
  }
  const out = await page.evaluate(async () => {
    const { state, monsters } = await import('./js/state.js');
    const t = window.__eco;
    const end = {};
    for (const m of monsters[state.player.layer]) if (m.hp > 0) end[m.key] = (end[m.key] || 0) + 1;
    // Fights, from the side that landed the first blow: 'opener(doing)>target' and
    // how it ended. A creature attacked by the player (never, while it rests) or
    // by several opponents appears once per opponent.
    const fights = {};
    const who = (e) => e.isPlayer ? 'player' : e.key;
    const everyone = new Set(t.everyone); if (state.player._fights) everyone.add(state.player);
    for (const a of everyone) {
      if (!a._fights) continue;
      for (const [b, f] of a._fights) {
        if (!f.opened) continue;
        const end = a.hp <= 0 && b.hp <= 0 ? 'both died' : a.hp <= 0 ? 'opener died' : b.hp <= 0 ? 'target died' : 'both lived';
        const k = `${who(a)}(${f.doing || '?'})>${who(b)}: ${end}`;
        fights[k] = (fights[k] || 0) + 1;
      }
    }
    // Hunt funnel (js/hunt-funnel.js): every episode of every predator, open
    // ones closed as 'open at end of run'; and hunger and trail-following.
    const { huntRecords } = await import('./js/hunt-funnel.js');
    const hunts = [], huntStats = {};
    for (const a of t.everyone) {
      if (a.diet !== 'predator') continue;
      hunts.push(...huntRecords(a, 'open at end of run'));
      const st = a._huntStats;
      if (!st) continue;
      const h = huntStats[a.key] || (huntStats[a.key] = { actions: 0, hungry: 0, veryHungry: 0, trackActions: 0,
        trackBouts: 0, trackToViable: 0, trackThen: {} });
      for (const k of ['actions', 'hungry', 'veryHungry', 'trackActions', 'trackBouts', 'trackToViable']) h[k] += st[k];
      for (const [k, n] of Object.entries(st.trackThen)) h.trackThen[k] = (h.trackThen[k] || 0) + n;
    }
    return { start: t.start, end, behaviour: t.behaviour, deaths: t.deaths, kills: t.kills, fights,
             hunts, huntStats, speeds: t.speeds, active: t.active, dormant: t.dormant, nearestPrey: t.nearestPrey,
             deathDetail: t.deathDetail, turns: t.turns,
             playerDeath: state.player.hp > 0 ? null : (state.player.deathCause || 'unknown') };
  });
  out.seed = seed; out.errors = errors;
  await page.context().close();
  return out;
}

// ── Aggregate ──
function stats(xs) {
  const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  return { mean, sd };
}

const runs = [];
try {
  for (const seed of SEEDS) {
    const t0 = Date.now();
    const r = await runSeed(seed);
    runs.push(r);
    console.error(`seed ${seed}: ${r.turns} turns in ${((Date.now() - t0) / 1000).toFixed(0)} s` +
      (r.playerDeath ? `, player killed (${r.playerDeath})` : '') + (r.errors.length ? `, ${r.errors.length} page errors` : ''));
  }
} finally {
  await browser.close(); server.close();
}

// Every metric key seen in any run, averaged over runs (missing = 0), normalised per
// 100 turns so runs that ended early still compare.
function table(field, perTurns) {
  const keys = [...new Set(runs.flatMap(r => Object.keys(r[field])))].sort();
  return keys.map(k => {
    const xs = runs.map(r => (r[field][k] || 0) * (perTurns ? 100 / Math.max(1, r.turns) : 1));
    return { key: k, ...stats(xs) };
  });
}
const report = {
  seeds: SEEDS, turns: TURNS, hunger: HUNGER,
  playerKilled: runs.filter(r => r.playerDeath).map(r => ({ seed: r.seed, turn: r.turns, cause: r.playerDeath })),
  behaviourPer100Turns: table('behaviour', true),
  deathsPerRun: table('deaths', false),
  killsPerRun: table('kills', false),
  fightsPerRun: table('fights', false),
  startCounts: table('start', false),
  endCounts: table('end', false),
  pageErrors: runs.reduce((a, r) => a + r.errors.length, 0),
  runs,
};

const f = (s) => `${s.mean.toFixed(1).padStart(8)} ±${s.sd.toFixed(1).padStart(6)}`;
console.log(`\nEcology over seeds ${SEEDS.join(',')} × ${TURNS} turns${HUNGER != null ? `, predators start at hunger ${HUNGER}` : ''}`);
console.log(`player killed in ${report.playerKilled.length}/${runs.length} runs` +
  (report.playerKilled.length ? ': ' + report.playerKilled.map(p => `seed ${p.seed} t${p.turn} (${p.cause})`).join(', ') : ''));
console.log('\nbehaviour, creature-turns per 100 turns (mean ± sd across seeds)');
for (const r of report.behaviourPer100Turns) console.log(`  ${r.key.padEnd(28)}${f(r)}`);
// Deaths are rare events: report them per run and in total, not per 100 turns.
console.log('\ndeaths per run (species:cause; mean ± sd across seeds, total)');
if (!report.deathsPerRun.length) console.log('  none');
for (const r of report.deathsPerRun) {
  const total = runs.reduce((a, run) => a + (run.deaths[r.key] || 0), 0);
  console.log(`  ${r.key.padEnd(28)}${f(r)}   total ${total}`);
}
// Who killed whom: the last creature to land a blow on the dead one ('none' is
// hunger, or a death with no blow landed).
const totals = (field) => report[field + 'PerRun'].map(r => [r.key, runs.reduce((a, run) => a + (run[field][r.key] || 0), 0)]);
console.log('\nkills, victim<-killer (total over runs)');
if (!report.killsPerRun.length) console.log('  none');
for (const [k, n] of totals('kills')) console.log(`  ${k.padEnd(40)}${String(n).padStart(4)}`);
console.log('\nfights, opener(what it was doing)>target: outcome (total over runs)');
if (!report.fightsPerRun.length) console.log('  none');
for (const [k, n] of totals('fights')) console.log(`  ${k.padEnd(56)}${String(n).padStart(4)}`);
const detail = runs.flatMap(r => r.deathDetail.map(d => ({ seed: r.seed, ...d })));
if (detail.length) {
  console.log('\neach death: seed turn victim(mass) cause <- killer(mass), victim opened?, doing, blows dealt/taken');
  for (const d of detail) console.log(`  s${d.seed} t${d.turn} ${d.victim}(${d.victimMass}) ${d.cause} <- ${d.killer}` +
    (d.killerMass != null ? `(${d.killerMass})` : '') +
    (d.victimOpened != null ? `, ${d.victimOpened ? 'opened' : 'was attacked'}, doing ${d.victimDoing}, killer doing ${d.killerDoing}, ${d.blowsDealt}/${d.blowsTaken}` : ''));
}

// ── Encounters: the active radius and density ──
console.log('\nsimulated around the resting player, creatures per turn (mean over runs): active / dormant');
{
  const keys = [...new Set(runs.flatMap(r => [...Object.keys(r.active), ...Object.keys(r.dormant)]))].sort();
  for (const k of keys) {
    const a = runs.reduce((s, r) => s + (r.active[k] || 0) / Math.max(1, r.turns), 0) / runs.length;
    const d = runs.reduce((s, r) => s + (r.dormant[k] || 0) / Math.max(1, r.turns), 0) / runs.length;
    console.log(`  ${k.padEnd(14)}${a.toFixed(1).padStart(6)} /${d.toFixed(1).padStart(6)}`);
  }
  console.log('active predator-turns by distance to the nearest active animal it could take (true positions, total)');
  const np = {};
  for (const r of runs) for (const [k, n] of Object.entries(r.nearestPrey)) np[k] = (np[k] || 0) + n;
  for (const k of Object.keys(np).sort()) console.log(`  ${k.padEnd(28)}${String(np[k]).padStart(7)}`);
}

// ── Speed capacity ──
console.log('\nbody speed capacity (force-to-weight; the action economy runs a body at this rate): sprint, walk, actions to full speed');
{
  const sp = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.speeds)) sp[k] = sp[k] || v;
  for (const [k, v] of Object.entries(sp)) console.log(`  ${k.padEnd(14)}${String(v.mass).padStart(6)} kg  sprint ${v.sprint.toFixed(3)}  walk ${v.walk.toFixed(3)}  ${v.toFullSpeed}`);
}

// ── Hunger and trail-following ──
console.log('\npredator actions: share hungry (>0.5 reactive, >0.6 deliberative); trail/air bouts and how they ended');
{
  const hs = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.huntStats)) {
    const h = hs[k] || (hs[k] = { actions: 0, hungry: 0, veryHungry: 0, trackActions: 0, trackBouts: 0, trackToViable: 0, trackThen: {} });
    for (const f of ['actions', 'hungry', 'veryHungry', 'trackActions', 'trackBouts', 'trackToViable']) h[f] += v[f];
    for (const [a, n] of Object.entries(v.trackThen)) h.trackThen[a] = (h.trackThen[a] || 0) + n;
  }
  const pc = (a, b) => b ? (100 * a / b).toFixed(0) + '%' : '-';
  for (const [k, h] of Object.entries(hs)) {
    console.log(`  ${k.padEnd(14)}${String(h.actions).padStart(6)} actions, hungry ${pc(h.hungry, h.actions)}, >0.6 ${pc(h.veryHungry, h.actions)};` +
      ` ${h.trackBouts} bouts (${h.trackActions} actions), ${h.trackToViable} ended with viable prey in the senses;` +
      ` then ${Object.entries(h.trackThen).sort((a, b) => b[1] - a[1]).map(([a, n]) => a + ' ' + n).join(', ') || '-'}`);
  }
}

// ── Hunt funnel ──
const STAGES = ['detected', 'viable', 'pursued', 'adjacent', 'attacked', 'hit', 'killed'];
const eps = runs.flatMap(r => r.hunts.map(h => ({ seed: r.seed, ...h })));
const byPair = {};
for (const e of eps) (byPair[e.predator + '>' + e.prey] || (byPair[e.predator + '>' + e.prey] = [])).push(e);
const top = (obj, n = 6) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
const sumTallies = (list, field) => {
  const o = {};
  for (const e of list) for (const [k, n] of Object.entries(e[field] || {})) o[k] = (o[k] || 0) + n;
  return o;
};
console.log('\nhunt funnel, predator>animal: episodes reaching each stage (total over runs)');
console.log('  ' + 'pair'.padEnd(24) + STAGES.map(s => s.padStart(9)).join(''));
const pairs = Object.keys(byPair).sort((a, b) => byPair[b].filter(e => e.stage >= 2).length - byPair[a].filter(e => e.stage >= 2).length);
for (const p of pairs) {
  const list = byPair[p];
  console.log('  ' + p.padEnd(24) + STAGES.map((_, i) => String(list.filter(e => e.stage >= i + 1).length).padStart(9)).join(''));
}
for (const p of pairs) {
  const list = byPair[p];
  if (!list.some(e => e.stage >= 2)) continue;
  console.log(`\n  ${p}: ${list.length} episodes`);
  const ends = {};
  for (const e of list) { const k = `[${STAGES[e.stage - 1]}] ${e.end}`; ends[k] = (ends[k] || 0) + 1; }
  console.log('    ended (furthest stage, why):');
  for (const [k, n] of top(ends, 12)) console.log(`      ${String(n).padStart(4)}  ${k}`);
  const viable = list.filter(e => e.stage >= 2);
  const inst = sumTallies(viable, 'instead');
  if (Object.keys(inst).length) {
    console.log('    predator-actions with the animal viable and perceived, not yet pursued; what it did instead:');
    for (const [k, n] of top(inst, 8)) console.log(`      ${String(n).padStart(5)}  ${k}`);
  }
  const aft = sumTallies(viable, 'afterPursuit');
  if (Object.keys(aft).length) {
    console.log('    ...and after pursuing it:');
    for (const [k, n] of top(aft, 8)) console.log(`      ${String(n).padStart(5)}  ${k}`);
  }
  const cats = sumTallies(list, 'sizeCats');
  console.log('    size read (percepts): ' + top(cats, 8).map(([k, n]) => `${k} ${n}`).join(', '));
  const nv = sumTallies(list, 'notViable');
  if (Object.keys(nv).length) console.log('    not viable (percepts): ' + top(nv, 4).map(([k, n]) => `${k} ${n}`).join('; '));
  const fled = list.filter(e => e.preyFledBeforeContact);
  const med = (xs) => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : '-'; };
  console.log(`    animal fled before contact in ${fled.length} (from this predator ${list.filter(e => e.preyFledFromMe).length}),` +
    ` median distance when first seen fleeing ${med(fled.map(e => e.preyFleeDist))}; closest approach median ${med(list.filter(e => e.stage >= 3).map(e => e.minDist))} (pursued episodes)`);
  const pursued = list.filter(e => e.stage >= 3);
  if (pursued.length) {
    const ps = pursued.map(e => e.predSpeedMax).filter(x => x > 0), qs = pursued.map(e => e.preyFleeSpeedMax).filter(x => x > 0);
    const mean = (xs) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : '-';
    console.log(`    top speed seen in pursued episodes: predator ${mean(ps)} (n ${ps.length}), fleeing animal ${mean(qs)} (n ${qs.length})`);
    const blocked = pursued.reduce((a, e) => a + (e.blockedSteps || 0), 0), leashed = pursued.reduce((a, e) => a + (e.leashedSteps || 0), 0);
    const steps = pursued.reduce((a, e) => a + e.pursuit, 0);
    const atContact = pursued.reduce((a, e) => a + (e.blockedAtContact || 0), 0);
    const underfoot = pursued.reduce((a, e) => a + (e.blockedPerceivedUnderfoot || 0), 0);
    console.log(`    pursuit actions ${steps}; chase steps that went nowhere ${blocked}: animal already adjacent ${atContact},` +
      ` perceived on the predator's own tile ${underfoot}, at the territory leash ${leashed}`);
  }
  const atk = list.reduce((a, e) => a + e.attacks, 0), miss = list.reduce((a, e) => a + e.misses, 0);
  const air = list.reduce((a, e) => a + (e.airStrikes || 0), 0);
  const hits = list.flatMap(e => e.hits);
  if (atk || air) {
    console.log(`    strikes: ${atk} thrown, ${miss} got clear of, ${air} at air (misplaced percept), ${hits.length} hit`);
  }
  if (hits.length) {
    const m = (f) => (hits.reduce((a, h) => a + (f(h) || 0), 0) / hits.length).toFixed(1);
    const zones = {};
    for (const h of hits) zones[h.zone] = (zones[h.zone] || 0) + 1;
    console.log(`    per hit: raw ${m(h => h.raw)}, armour ${m(h => h.armour)}, dealt ${m(h => h.dealt)}, ` +
      `share of struck zone's max hp ${(hits.reduce((a, h) => a + (h.zoneMaxHp ? h.dealt / h.zoneMaxHp : 0), 0) / hits.length).toFixed(2)}; ` +
      `${hits.filter(h => h.destroyed).length} zones destroyed, ${hits.filter(h => h.vital).length} on vital zones, ${hits.filter(h => h.died).length} killing blows`);
    console.log('    zones hit: ' + top(zones, 8).map(([k, n]) => `${k} ${n}`).join(', '));
    const whys = {};
    for (const h of hits) if (h.why) whys[h.why] = (whys[h.why] || 0) + 1;
    if (Object.keys(whys).length) console.log('    why it landed: ' + top(whys, 6).map(([k, n]) => `${k} ${n}`).join(', '));
  }
}

if (report.pageErrors) console.log(`\n${report.pageErrors} page errors (see --json for details)`);
if (args.json) { fs.writeFileSync(args.json, JSON.stringify(report, null, 1)); console.log(`\nwrote ${args.json}`); }
