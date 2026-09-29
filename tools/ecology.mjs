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
    const L = state.player.layer;
    const t = window.__eco = {
      start: {}, behaviour: {}, deaths: {}, seen: new Set(), killedBy: null, turns: 0,
    };
    for (const m of monsters[L]) {
      if (m.hp <= 0) continue;
      t.start[m.key] = (t.start[m.key] || 0) + 1;
      t.seen.add(m);
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
          t.seen.delete(m);
        }
      }
      for (const m of alive) t.seen.add(m);
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
    return { start: t.start, end, behaviour: t.behaviour, deaths: t.deaths, turns: t.turns,
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
if (report.pageErrors) console.log(`\n${report.pageErrors} page errors (see --json for details)`);
if (args.json) { fs.writeFileSync(args.json, JSON.stringify(report, null, 1)); console.log(`\nwrote ${args.json}`); }
