// ==================== DAY / NIGHT CYCLE ====================
// Pure functions for time-of-day phase calculation and visual tinting.
//
// Cycle length: 200 ticks (one full day).
//   Dawn  :   0 – 29   (30 ticks, 15%)
//   Day   :  30 – 119  (90 ticks, 45%)
//   Dusk  : 120 – 149  (30 ticks, 15%)
//   Night : 150 – 199  (50 ticks, 25%)

import { state } from './state.js';

export const CYCLE_LENGTH = 200;

const PHASES = [
  { name: 'dawn',  start: 0,   len: 30  },
  { name: 'day',   start: 30,  len: 90  },
  { name: 'dusk',  start: 120, len: 30  },
  { name: 'night', start: 150, len: 50  },
];

/**
 * Given the current world tick, return { phase, progress }.
 *   phase    — 'dawn' | 'day' | 'dusk' | 'night'
 *   progress — 0.0–1.0 within that phase (0 = just entered, 1 = about to leave)
 */
export function getTimePhase(tick) {
  const t = ((tick % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH; // handle negatives
  for (const p of PHASES) {
    if (t >= p.start && t < p.start + p.len) {
      return { phase: p.name, progress: (t - p.start) / p.len };
    }
  }
  // Shouldn't reach here, but fallback
  return { phase: 'day', progress: 0.5 };
}

/** Convenience — calls getTimePhase with the current state tick. */
export function currentTimePhase() {
  return getTimePhase(state.worldTick);
}

/** Advance the world clock by 1 tick. Called from endPlayerTurn. */
export function advanceTick() {
  state.worldTick++;
}

// ==================== VISUAL TINT ====================
// Returns { r, g, b, a } for the overlay colour at the given tick.
// Day → fully transparent (a ≈ 0).
// Dusk → warm orange, dims slightly.
// Night → cool dark blue, much darker.
// Dawn → transitions from night darkness back to neutral with a warm tinge.

/**
 * Compute the RGBA tint for the viewport overlay.
 * @param {number} tick - the world tick (defaults to state.worldTick)
 * @returns {{ r:number, g:number, b:number, a:number }}
 */
export function getTint(tick) {
  if (tick === undefined) tick = state.worldTick;
  const { phase, progress } = getTimePhase(tick);

  switch (phase) {
    case 'day':
      // No tint
      return { r: 0, g: 0, b: 0, a: 0 };

    case 'dusk': {
      // Warm orange tint fading in, darkening gradually
      // progress 0 → barely tinted, progress 1 → near-night
      const a = lerp(0.0, 0.45, progress);
      const r = lerp(40, 15, progress);
      const g = lerp(20, 10, progress);
      const b = lerp(5, 30, progress);
      return { r, g, b, a };
    }

    case 'night': {
      // Deep cool blue-black, mostly constant with subtle pulse
      const a = lerp(0.45, 0.50, Math.sin(progress * Math.PI) * 0.5 + 0.5);
      return { r: 10, g: 10, b: 30, a };
    }

    case 'dawn': {
      // Transition from dark/cool back to warm then neutral
      // progress 0 → like late night, progress 1 → nearly clear
      const a = lerp(0.45, 0.0, progress);
      const r = lerp(10, 40, progress);   // warm up
      const g = lerp(10, 25, progress);
      const b = lerp(30, 10, progress);   // lose the blue
      return { r, g, b, a };
    }

    default:
      return { r: 0, g: 0, b: 0, a: 0 };
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Draw the time-of-day tint overlay onto a canvas 2D context.
 * Call this AFTER all tiles, sprites, monsters, and the player have been drawn.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x       - left edge of the tinted region (px)
 * @param {number} y       - top edge of the tinted region (px)
 * @param {number} w       - width  of the tinted region (px)
 * @param {number} h       - height of the tinted region (px)
 * @param {number} layer   - current layer index
 */
export function drawTimeTint(ctx, x, y, w, h, layer) {
  // Surface only for now — easy to expand later
  if (layer !== 0) return;

  const { r, g, b, a } = getTint();
  if (a <= 0) return;

  ctx.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a.toFixed(3)})`;
  ctx.fillRect(x, y, w, h);
}
