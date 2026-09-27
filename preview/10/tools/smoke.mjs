#!/usr/bin/env node
// smoke.mjs — boots the game in headless Chromium and plays a few turns.
// Serves the repo root on a local port with node's http module (no dependency),
// drives the title → species → play flow by keyboard (waiting for play state AND a
// restored world grid, since loadGame sets gameState before the grids), checks that the world
// generated, the player can move, autosave survives a reload, and the same
// ?seed= gives the same world. Any page error or console error fails the run.
//
// Needs Playwright's browser. In CI:  npx playwright@1.56.1 install --with-deps chromium
// then:  node tools/smoke.mjs      (set PLAYWRIGHT_MODULE to a playwright install path if
//        it is not resolvable from the repo, e.g. a global one)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch (e) { console.error('playwright not resolvable; set PLAYWRIGHT_MODULE or run `npx playwright@1.56.1 install chromium` after `npm i -g playwright@1.56.1`'); process.exit(2); }
const { chromium } = playwright;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.md': 'text/plain' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); let p = path.join(root, decodeURIComponent(url.pathname));
  if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const problems = [];
const browser = await chromium.launch({ args: ['--no-sandbox'] });
async function newGame(seed) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_CERT|fonts\.g/.test(m.text())) problems.push(`console.error: ${m.text()}`); });
  await page.goto(`${base}/index.html?seed=${seed}`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter');      // NEW GAME (or CONTINUE if a save exists — fresh context, so none)
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown');  // select first species
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');      // begin
  await page.waitForFunction(async () => (async () => { const m = await import('./js/state.js'); return m.state.gameState === 'play' && !!m.state.player && Array.isArray(m.worlds[0]); })(), null, { timeout: 30000 });
  await page.waitForTimeout(300);
  return page;
}
const snap = (page) => page.evaluate(async () => {
  const { state, worlds, monsters } = await import('./js/state.js');
  let h = 0; for (const row of worlds[0]) for (const t of row) h = (Math.imul(h, 31) + t) | 0;
  const ms = (monsters[0] || []).map(m => `${m.key}@${m.x},${m.y}`).join(' ');
  let mh = 0; for (let i = 0; i < ms.length; i++) mh = (Math.imul(mh, 31) + ms.charCodeAt(i)) | 0;
  return { gs: state.gameState, turn: state.turnCount, x: state.player.x, y: state.player.y, n: (monsters[0] || []).length, world: h, mons: mh, seed: state.worldSeed };
});
const check = (cond, msg) => { if (!cond) problems.push(`check: ${msg}`); };

try {
  const a = await newGame(7);
  const s0 = await snap(a);
  check(s0.gs === 'play', `game did not start (state ${s0.gs})`);
  check(s0.n > 0, `no creatures on the surface (${s0.n})`);
  check(s0.seed === 7, `seed not recorded (${s0.seed})`);
  for (let i = 0; i < 12; i++) { await a.keyboard.press('ArrowRight'); await a.waitForTimeout(60); }
  for (let i = 0; i < 8; i++) { await a.keyboard.press(' '); await a.waitForTimeout(60); }
  const s1 = await snap(a);
  check(s1.turn >= 12, `turn counter did not advance (${s1.turn})`);
  check(s1.x !== s0.x || s1.y !== s0.y, 'player did not move in 12 attempts');
  await a.waitForTimeout(1200);                         // let the autosave land
  await a.reload({ waitUntil: 'load' }); await a.waitForTimeout(800);
  await a.keyboard.press('Enter');                      // CONTINUE
  await a.waitForFunction(async () => (async () => { const m = await import('./js/state.js'); return m.state.gameState === 'play' && !!m.state.player && Array.isArray(m.worlds[0]); })(), null, { timeout: 30000 });
  const s2 = await snap(a);
  check(s2.turn === s1.turn && s2.x === s1.x && s2.y === s1.y, `resume did not restore the run (turn ${s1.turn}→${s2.turn}, pos ${s1.x},${s1.y}→${s2.x},${s2.y})`);
  const b = await newGame(7);
  const s3 = await snap(b);
  check(s3.world === s0.world && s3.mons === s0.mons, 'same seed did not produce the same world and spawns');
  console.log(`smoke: ${s0.n} creatures, ${s1.turn} turns, resume ok=${s2.turn === s1.turn}, seed-deterministic=${s3.world === s0.world}`);
} catch (e) {
  problems.push(`exception: ${e.message}`);
} finally {
  await browser.close(); server.close();
}
if (problems.length) { console.error('SMOKE FAILED'); for (const p of [...new Set(problems)]) console.error(' - ' + p); process.exit(1); }
console.log('smoke passed');
