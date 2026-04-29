// ==================== SEEDED RNG ====================
let rngState = 12345;

export function srand(seed){ rngState = (seed>>>0) || 1; }

export function rand(){
  rngState |= 0; rngState = rngState + 0x6D2B79F5 | 0;
  let t = Math.imul(rngState ^ rngState >>> 15, 1 | rngState);
  t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

export function randi(n){ return Math.floor(rand()*n); }
export function randRange(a,b){ return a + randi(b-a+1); }
export function choice(arr){ return arr[randi(arr.length)]; }
export function roll100(){ return randi(100)+1; }

export function randomRound(x){
  const f = Math.floor(x);
  const frac = x - f;
  return (frac > 0 && rand() < frac) ? f + 1 : f;
}
