#!/usr/bin/env node
// check-modules.mjs — static checks over js/*.js, no dependencies.
//   1. every module parses as an ES module (node --check)
//   2. every named import resolves to an export of its target (follows `export * from` barrels)
//   3. no module imports a file that does not exist
// Prints a summary and exits non-zero on any failure. Run: node tools/check-modules.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const dir = path.join(root, 'js');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL ' + msg); };

// 1. syntax — copy to .mjs in a temp dir so node parses ESM
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-check-'));
for (const f of files) {
  const t = path.join(tmp, f.replace(/\.js$/, '.mjs'));
  fs.copyFileSync(path.join(dir, f), t);
  try { execFileSync(process.execPath, ['--check', t], { stdio: 'pipe' }); }
  catch (e) { fail(`${f}: syntax error\n${String(e.stderr).split('\n').slice(0, 6).join('\n')}`); }
}
fs.rmSync(tmp, { recursive: true, force: true });

// 2/3. import graph
const src = {}, direct = {}, reexAll = {}, reexNamed = {}, imports = {};
for (const f of files) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8'); src[f] = s;
  const ex = new Set();
  for (const m of s.matchAll(/^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) ex.add(m[1]);
  // `export const A = 1, B = 2;`
  for (const m of s.matchAll(/^export\s+(?:const|let|var)\s+([^;]+);/gm))
    for (const part of m[1].split(',')) { const n = part.trim().match(/^([A-Za-z_$][\w$]*)/); if (n) ex.add(n[1]); }
  for (const m of s.matchAll(/^export\s*\{([^}]*)\}\s*;?\s*$/gm))
    for (const n of m[1].replace(/\/\/[^\n]*/g, '').split(',')) { const t = n.trim(); if (!t) continue; const as = t.split(/\s+as\s+/); ex.add((as[1] || as[0]).trim()); }
  reexAll[f] = [...s.matchAll(/^export\s*\*\s*from\s*['"]\.\/([^'"]+)['"]/gm)].map(m => m[1]);
  reexNamed[f] = [];
  for (const m of s.matchAll(/^export\s*\{([^}]*)\}\s*from\s*['"]\.\/([^'"]+)['"]/gm))
    for (const n of m[1].split(',')) { const t = n.trim(); if (!t) continue; const as = t.split(/\s+as\s+/); ex.add((as[1] || as[0]).trim()); }
  if (/^export\s+default/m.test(s)) ex.add('default');
  direct[f] = ex; imports[f] = [];
  for (const m of s.matchAll(/import\s*(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s+as\s+([\w$]+))?\s*from\s*['"]\.\/([^'"]+)['"]/g)) {
    const names = []; if (m[1]) names.push('default'); if (m[3]) names.push('*');
    if (m[2]) for (const n of m[2].replace(/\/\/[^\n]*/g, '').split(',')) { const t = n.trim(); if (!t) continue; names.push(t.split(/\s+as\s+/)[0].trim()); }
    imports[f].push({ target: m[4], names });
  }
}
const full = {};
function allEx(f, seen = new Set()) { if (full[f]) return full[f]; if (seen.has(f)) return new Set(); seen.add(f); const s = new Set(direct[f] || []); for (const t of reexAll[f] || []) for (const e of allEx(t, seen)) s.add(e); full[f] = s; return s; }
for (const f of files) allEx(f);
for (const f of files) for (const { target, names } of imports[f]) {
  if (!src[target]) { fail(`${f}: imports missing module ./${target}`); continue; }
  for (const n of names) { if (n === '*') continue; if (!full[target].has(n)) fail(`${f}: '${n}' is not exported by ${target}`); }
}

console.log(`${files.length} modules parsed; ${Object.values(imports).flat().length} import statements resolved; ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
