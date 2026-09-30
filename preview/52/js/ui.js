// ==================== UI REFRESH ====================
// The always-visible HUD (zone bars, blood, food, region label) and the
// region-name resolver. Everything it shows is read from the body: zone
// hp/maxHp, blood/bloodMax, the food reserve. There are no numbers for a
// creature-level HP, level, gold or carried weight because none exist.

import { state, worlds, covers } from './state.js';
import { LAYER_SURFACE, LAYER_UNDER } from './constants.js';
import { T } from './terrain.js';
import { inBounds } from './world-state.js';

// ───────────────────────────────────────────────────────
//  §1  HELPERS
// ───────────────────────────────────────────────────────

/** Blood status — qualitative word, not a number. */
function getBloodStatus(p) {
  if (!p || p.blood == null || p.bloodMax == null || p.bloodMax <= 0) return null;
  const ratio = p.blood / p.bloodMax;
  // Check if any zones are actively bleeding (below 50% HP, not fully clotted)
  const bodyMap = p.bodyMap || [];
  const activelyBleeding = bodyMap.some(z =>
    !z.destroyed && z.hp != null && z.maxHp != null &&
    z.hp < z.maxHp * 0.5 && (z.clotting || 0) < 1.0
  );

  if (ratio > 0.75) return activelyBleeding ? { label: 'bleeding', css: 'blood-bleeding' } : null;
  if (ratio > 0.50) return { label: 'weakened', css: 'blood-weakened' };
  if (ratio > 0.25) return { label: 'weakened', css: 'blood-weakened' };
  return { label: 'critical', css: 'blood-critical' };
}


// ───────────────────────────────────────────────────────
//  §2  DATA  (pure — no DOM access)
// ───────────────────────────────────────────────────────

/** Return a plain object with every computed display value. */
function computeUIData() {
  const p = state.player;
  if (!p) return null;
  return {
    bloodStatus: getBloodStatus(p),
    fedPct:   Math.max(0, p.fed),
    fedLabel: p.fed > 75 ? 'FULL' : p.fed > 40 ? 'FED' : p.fed > 15 ? 'HUNGRY' : 'STARVING',
    fedWarn:  p.fed <= 40,
    stealth:  p.stealth,
    regionName: getRegionName(),
    layerLabel: p.layer === LAYER_SURFACE ? 'Surface' : 'Underground',
  };
}


// ───────────────────────────────────────────────────────
//  §3  DOM WRITER
// ───────────────────────────────────────────────────────

function applyToDOM(d) {
  // Sidebar panels have been removed from the DOM.
  // Update the minimal always-visible HUD instead.
  updateHud(d);
}

// ───────────────────────────────────────────────────────
//  §3b  MINIMAL HUD  (zone HP + blood + food bars, top-right)
// ───────────────────────────────────────────────────────

// ── Status display mode toggle ──
// false = minimal (bars hidden when all zones full — "no news is good news")
// true  = full (all bars always visible regardless of health)
// Toggled by the T key. Not saved — resets on reload.
let statusFullMode = false;

function toggleStatusFullMode() {
  statusFullMode = !statusFullMode;
}

const _hudEl       = document.getElementById('hud');
const _hudZones    = document.getElementById('hud-zones');
const _hudFoodBar  = document.getElementById('hud-food');
const _hudFoodNum  = document.getElementById('hud-food-num');
const _hudBloodRow = document.getElementById('hud-blood-row');
const _hudBloodBar = document.getElementById('hud-blood');
const _hudBloodNum = document.getElementById('hud-blood-num');

/** Readable zone labels for the HUD. */
const _ZONE_NAMES = {
  head:'Head', torso:'Torso', tail:'Tail', maw:'Maw',
  left_arm:'Arm-L', right_arm:'Arm-R',
  left_leg:'Leg-L', right_leg:'Leg-R',
  left_forelimb:'Front-L', right_forelimb:'Front-R',
  left_hindlimb:'Hind-L', right_hindlimb:'Hind-R',
};
function zoneName(key) {
  return _ZONE_NAMES[key] || key.replace(/_/g, '-').replace(/^./, c => c.toUpperCase());
}

/** Cached zone DOM nodes — rebuilt only when the zone count changes. */
let _zoneBarCache = [];   // [{ row, fill, label, num }]
let _zoneCacheLen = -1;

function ensureZoneBars(count) {
  if (count === _zoneCacheLen) return;
  _zoneCacheLen = count;
  _zoneBarCache = [];
  _hudZones.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const row  = document.createElement('div');
    row.className = 'hud-row';

    const label = document.createElement('span');
    label.className = 'hud-zone-label';

    const barOuter = document.createElement('div');
    barOuter.className = 'hud-bar';

    const fill = document.createElement('div');
    fill.className = 'hud-bar-fill hp ok';
    fill.style.width = '100%';

    const num = document.createElement('span');
    num.className = 'hud-num';

    barOuter.appendChild(fill);
    row.appendChild(label);
    row.appendChild(barOuter);
    row.appendChild(num);
    _hudZones.appendChild(row);
    _zoneBarCache.push({ row, fill, label, num });
  }
}

function updateHud(d) {
  if (!_hudEl) return;
  if (!d || state.gameState !== 'play') { _hudEl.classList.remove('show'); return; }

  _hudEl.classList.add('show');

  const p = state.player;

  // ── Zone HP bars ──
  const bodyMap = (p && p.bodyMap) || [];
  const zones = bodyMap.filter(z => z.hp != null && z.maxHp != null);
  ensureZoneBars(zones.length);

  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const c = _zoneBarCache[i];
    const pct = z.destroyed ? 0 : Math.max(0, Math.min(100, (z.hp / z.maxHp) * 100));
    c.fill.style.width = pct + '%';
    // Reuse existing HP bar color classes: ok (>50%), default (<50%), plus destroyed
    if (z.destroyed) {
      c.fill.className = 'hud-bar-fill hp';
      c.fill.style.background = '#444';
    } else if (pct > 50) {
      c.fill.className = 'hud-bar-fill hp ok';
      c.fill.style.background = '';
    } else if (pct > 25) {
      c.fill.className = 'hud-bar-fill hp';
      c.fill.style.background = '';
    } else {
      c.fill.className = 'hud-bar-fill hp';
      c.fill.style.background = '#d4a050';
    }
    c.label.textContent = zoneName(z.key);
    c.num.textContent = Math.round(pct) + '%';
  }

  // Hide zone bars when everything is healthy — no news is good news
  // In full mode (T key toggle), show all bars unconditionally.
  const anyDamaged = zones.some(z => z.destroyed || z.hp < z.maxHp);
  _hudZones.style.display = (statusFullMode || anyDamaged) ? '' : 'none';

  // Food bar
  const fedPct = Math.max(0, Math.min(100, d.fedPct));
  _hudFoodBar.style.width = fedPct + '%';
  _hudFoodBar.className = 'hud-bar-fill food' + (d.fedWarn ? ' warn' : '');
  _hudFoodNum.textContent = Math.round(state.player.fed) + '%';

  // Dim food bar when well-fed — it's only urgent information when low
  // In full mode, always show at full opacity.
  const foodRow = _hudFoodBar.closest('.hud-row');
  if (foodRow) {
    foodRow.style.opacity = (statusFullMode || d.fedWarn) ? '1.0' : '0.5';
  }

  // Blood bar (matches HP/food bar style)
  if (_hudBloodRow && _hudBloodBar && _hudBloodNum) {
    if (p && p.blood != null && p.bloodMax > 0 && (d.bloodStatus || statusFullMode)) {
      _hudBloodRow.style.display = '';
      const bloodPct = Math.max(0, Math.min(100, (p.blood / p.bloodMax) * 100));
      _hudBloodBar.style.width = bloodPct + '%';
      _hudBloodBar.className = 'hud-bar-fill hp' + (bloodPct > 50 ? ' ok' : '');
      _hudBloodNum.textContent = d.bloodStatus ? d.bloodStatus.label : 'stable';
    } else {
      _hudBloodRow.style.display = 'none';
    }
  }

  // Region label
  const regionEl = document.getElementById('region-label');
  if (regionEl) {
    let label = d.regionName || '';
    // Sprint indicator — appended to region label when sprinting
    if (p && p.sprintMode) {
      label += '  ⚡ SPRINT';
    } else if (p && p.stealth) {
      label += '  CREEP';
    }
    regionEl.textContent = label;
  }
}

function hideHud() {
  if (_hudEl) _hudEl.classList.remove('show');
  _zoneCacheLen = -1;
}


// ───────────────────────────────────────────────────────
//  §4  THROTTLED PUBLIC ENTRY POINT
// ───────────────────────────────────────────────────────

let _rafPending = false;

/**
 * Main UI refresh.  Safe to call at any frequency — successive
 * calls within the same frame are coalesced via requestAnimationFrame
 * so the browser only paints once.
 */
function updateUI() {
  if (_rafPending) return;
  _rafPending = true;

  requestAnimationFrame(() => {
    _rafPending = false;
    const data = computeUIData();
    if (!data) return;
    applyToDOM(data);
  });
}

/**
 * Synchronous variant for moments that must reflect immediately.
 */
function updateUISync() {
  const data = computeUIData();
  if (!data) return;
  applyToDOM(data);
}


// ───────────────────────────────────────────────────────
//  §5  REGION NAME RESOLVER
// ───────────────────────────────────────────────────────


function getRegionName() {
  const p = state.player;
  if (!p) return '';

  const row = worlds[p.layer]?.[p.y];
  if (!row) return 'unknown';
  const t = row[p.x];

  if (p.layer === LAYER_UNDER) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const nx = p.x + dx, ny = p.y + dy;
        if (!inBounds(LAYER_UNDER, nx, ny)) continue;
        const nt = worlds[LAYER_UNDER]?.[ny]?.[nx];
        if (nt === T.LAVA)   return 'lava caves';
        if (nt === T.UWATER) return 'dark deep';
      }
    }
    return 'stone caverns';
  }

  // Cover first (forest/mushroom forest live in the cover grid, not the ground
  // grid — the old table keyed them on ground and used ids that don't exist,
  // so it could only ever say plains, sea or coast).
  const cover = covers[p.layer]?.[p.y]?.[p.x] || 0;
  if (cover === T.FOREST)     return 'forest';
  if (cover === T.MUSHFOREST) return 'mushroom forest';
  const SURFACE_LABELS = {
    [T.WATER]:        'sea',
    [T.DEEP_WATER]:   'sea',
    [T.BEACH]:        'coast',
    [T.SAND]:         'sand flats',
    [T.ROCK]:         'rocky ground',
    [T.MUD]:          'marsh',
    [T.FUNGAL_GRASS]: 'fungal ground',
    [T.DIRT]:         'bare earth',
  };
  return SURFACE_LABELS[t] ?? 'plains';
}


// ───────────────────────────────────────────────────────
//  §6  EXPORTS
// ───────────────────────────────────────────────────────

export {
  updateUI,
  updateUISync,
  computeUIData,
  getRegionName,
  hideHud,
  toggleStatusFullMode,
};
