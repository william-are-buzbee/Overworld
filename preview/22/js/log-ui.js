// ==================== LOG UI ====================
// The log panel's chrome: tab filtering, per-category muting, font size,
// resize drag handles, and click-through suppression.
//
// log.js owns the entries and appends one <div data-category> per message;
// this module hands it a filter so each new entry is shown or hidden on
// insertion (no MutationObserver). Filter and font state are session-only.

import { logEl, setLogEntryFilter } from './log.js';

const FONT_SIZES = [10, 12, 14, 16, 19];
const TAB_CATS = {              // tab → categories it shows (null = all)
  all:    null,
  combat: ['combat'],
  senses: ['sensing', 'environment'],
  events: ['interaction', 'movement'],
};

let fontIndex = 0;              // default 10px (matches .log CSS)
let activeTab = 'all';
const muted = { combat: false, movement: false, sensing: false, environment: false, interaction: false, system: false };

function shouldShow(cat) {
  if (muted[cat]) return false;
  if (activeTab === 'all') return true;
  const allowed = TAB_CATS[activeTab];
  return !allowed || allowed.includes(cat);
}

/** Re-apply the current tab + mute filter to every entry already in the log. */
function applyFilter() {
  if (!logEl) return;
  for (const child of logEl.children) {
    child.style.display = shouldShow(child.dataset.category || 'unknown') ? '' : 'none';
  }
  logEl.scrollTop = logEl.scrollHeight;
}

function setFontSize(idx) {
  fontIndex = Math.max(0, Math.min(FONT_SIZES.length - 1, idx));
  if (logEl) logEl.style.fontSize = FONT_SIZES[fontIndex] + 'px';
}

function uiZoom() {
  const z = getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom');
  return parseFloat(z) || 1;
}

/** Drag a handle to resize the wrapper along one axis. */
function bindDrag(handle, wrapper, axis) {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const start = axis === 'y' ? e.clientY : e.clientX;
    const startSize = axis === 'y' ? wrapper.offsetHeight : wrapper.offsetWidth;
    const zoom = uiZoom();
    function onMove(ev) {
      // Top handle: dragging up makes it taller. Right handle: dragging right makes it wider.
      const delta = (axis === 'y' ? start - ev.clientY : ev.clientX - start) / zoom;
      if (axis === 'y') wrapper.style.height = Math.max(80, Math.min(window.innerHeight * 0.6, startSize + delta)) + 'px';
      else              wrapper.style.width  = Math.max(200, Math.min(window.innerWidth * 0.7, startSize + delta)) + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/** Wire the log panel. Call once at startup, after the DOM exists. */
export function initLogUI() {
  const wrapper    = document.getElementById('log-wrapper');
  const tabsCont   = document.getElementById('log-tabs');
  const filterBtn  = document.getElementById('log-filter-btn');
  const filterDrop = document.getElementById('log-filter-dropdown');
  const fontMinus  = document.getElementById('log-font-minus');
  const fontPlus   = document.getElementById('log-font-plus');
  const dragTop    = document.getElementById('log-drag-top');
  const dragRight  = document.getElementById('log-drag-right');
  if (!wrapper || !logEl) return;

  setLogEntryFilter(shouldShow);

  // Clicks on the log must not reach the canvas (which treats clicks as moves).
  wrapper.addEventListener('mousedown', (e) => e.stopPropagation());
  wrapper.addEventListener('click',     (e) => e.stopPropagation());

  if (dragTop)   bindDrag(dragTop, wrapper, 'y');
  if (dragRight) bindDrag(dragRight, wrapper, 'x');

  if (tabsCont) {
    tabsCont.addEventListener('click', (e) => {
      const tab = e.target.closest('.log-tab');
      if (!tab) return;
      activeTab = tab.dataset.tab;
      for (const t of tabsCont.querySelectorAll('.log-tab')) t.classList.remove('active');
      tab.classList.add('active');
      if (filterDrop) filterDrop.style.display = 'none';
      applyFilter();
    });
  }

  if (filterBtn && filterDrop) {
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      filterDrop.style.display = filterDrop.style.display === 'none' ? '' : 'none';
    });
    filterDrop.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox' && e.target.dataset.cat) {
        muted[e.target.dataset.cat] = !e.target.checked;
        applyFilter();
      }
    });
    filterDrop.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('mousedown', (e) => {
      if (filterDrop.style.display !== 'none' && !filterDrop.contains(e.target) && e.target !== filterBtn) {
        filterDrop.style.display = 'none';
      }
    });
  }

  if (fontMinus) fontMinus.addEventListener('click', () => setFontSize(fontIndex - 1));
  if (fontPlus)  fontPlus.addEventListener('click',  () => setFontSize(fontIndex + 1));
  // Ctrl + wheel over the log adjusts font size; plain wheel scrolls it.
  wrapper.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    setFontSize(fontIndex + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });
}
