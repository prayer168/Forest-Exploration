// Infinite terrain field: height, meandering streams, swamps, and ground
// colour. All functions are pure functions of world (x, z) so the world can be
// generated and regenerated chunk by chunk without ever changing.

import { fbm } from './rng.js';

export const BANK = 7.0;        // how far a stream carves outward
export const CARVE = 2.4;       // max carve depth at the stream centre
export const WATER_FILL = 1.15; // how deep the channel is filled
const SWAMP_SINK = 1.05;        // how far swamp basins sit below the water table
const SWAMP_DEPTH = 0.62;       // standing water above the swamp floor

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function tableY(x, z) { return (fbm(x * 0.0055, z * 0.0055, 4, 11) - 0.5) * 20; }
function mediumY(x, z) { return (fbm(x * 0.022, z * 0.022, 3, 23) - 0.5) * 4.0; }
function fineY(x, z) { return (fbm(x * 0.09, z * 0.09, 2, 37) - 0.5) * 0.9; }

// Low, flat, waterlogged basins scattered through the forest — occasional, not
// the default state of the world.
export function swampAmount(x, z) {
  return smoothstep(0.66, 0.80, fbm(x * 0.0038 + 53, z * 0.0038 - 27, 3, 211));
}

// Three independent warped-noise fields. Their zero contours meander across the
// plane, so an endless branching network of streams comes out for free.
function riverFieldA(x, z) {
  const wx = x + (fbm(x * 0.0031 + 4.7, z * 0.0031 + 1.9, 2, 71) - 0.5) * 120;
  const wz = z + (fbm(x * 0.0031 - 2.3, z * 0.0031 + 8.1, 2, 83) - 0.5) * 120;
  return fbm(wx * 0.0028, wz * 0.0028, 3, 91) - 0.5;
}
function riverFieldB(x, z) {
  const wx = x + (fbm(x * 0.0052 + 11.3, z * 0.0052 - 6.4, 2, 131) - 0.5) * 70;
  const wz = z + (fbm(x * 0.0052 - 9.1, z * 0.0052 + 3.8, 2, 149) - 0.5) * 70;
  return fbm(wx * 0.0046, wz * 0.0046, 2, 167) - 0.5;
}
function riverFieldC(x, z) {
  const wx = x + (fbm(x * 0.0074 - 21.7, z * 0.0074 + 14.2, 2, 181) - 0.5) * 45;
  const wz = z + (fbm(x * 0.0074 + 6.9, z * 0.0074 - 18.5, 2, 193) - 0.5) * 45;
  return fbm(wx * 0.0069, wz * 0.0069, 2, 199) - 0.5;
}

// Value of a field divided by its local gradient ~= distance to its zero line.
function contourDistance(field, x, z, e = 2.0) {
  const s = field(x, z);
  const gx = (field(x + e, z) - field(x - e, z)) / (2 * e);
  const gz = (field(x, z + e) - field(x, z - e)) / (2 * e);
  return Math.abs(s / (Math.hypot(gx, gz) + 1e-7));
}

// Channels widen and narrow along their length instead of running at one width.
function widthMod(x, z) {
  return 0.55 + fbm(x * 0.004 + 7, z * 0.004 + 13, 2, 313) * 0.85;
}

export function riverDistance(x, z) {
  const a = contourDistance(riverFieldA, x, z);
  const b = contourDistance(riverFieldB, x, z) * 1.35;
  const c = contourDistance(riverFieldC, x, z) * 1.75;
  return Math.min(a, b, c) / widthMod(x, z);
}

// How crowded the forest is here. Rainforest is dense by default, so the curve
// is biased hard toward the top, but real light gaps and thin patches exist.
export function treeDensityAt(x, z) {
  const n = fbm(x * 0.0058 + 91, z * 0.0058 - 44, 2, 257);
  const t = Math.max(0, Math.min(1, (n - 0.26) / 0.46)); // stretch to the full range
  return 0.16 + Math.pow(t, 0.45) * 1.5;
}

const _sample = { ground: 0, water: 0, river: 0, swamp: 0 };

// One pass that yields everything about a spot, so callers never pay for the
// same noise twice.
export function sampleTerrain(x, z, out = _sample) {
  const L = tableY(x, z);
  const sw = swampAmount(x, z);

  let base = L + mediumY(x, z) + fineY(x, z);
  if (sw > 0) {
    // Flatten toward a sunken basin, but keep hummocks so the shoreline stays
    // ragged and tussocks of land poke out of the water.
    const hummock = (fbm(x * 0.16 + 3, z * 0.16 - 5, 2, 271) - 0.5) * 1.7;
    base += (L - SWAMP_SINK + hummock - base) * (sw * 0.92);
  }

  const d = riverDistance(x, z);
  let ground = base;
  if (d < BANK) {
    const t = 1 - d / BANK;
    ground = base - t * t * (3 - 2 * t) * CARVE;
  }

  const riverY = base - WATER_FILL;
  // Swamp pools fade out toward the edge of the basin rather than ending flat.
  const swampY = L - SWAMP_SINK + SWAMP_DEPTH - (1 - sw) * 1.6;

  out.ground = ground;
  out.water = sw > 0 ? Math.max(riverY, swampY) : riverY;
  out.river = d;
  out.swamp = sw;
  return out;
}

export function groundHeightAt(x, z) {
  return sampleTerrain(x, z).ground;
}

export function waterYAt(x, z) {
  return sampleTerrain(x, z).water;
}

export function isWaterAt(x, z) {
  const s = sampleTerrain(x, z);
  return s.ground < s.water;
}

// Height the player's feet rest at — they wade through water instead of
// sinking to the bed.
export function walkHeightAt(x, z) {
  const s = sampleTerrain(x, z);
  return Math.max(s.ground, s.water - 0.6);
}

const C_MOSS = { r: 0.29, g: 0.40, b: 0.19 };
const C_DEEP = { r: 0.16, g: 0.26, b: 0.12 };
const C_LITTER = { r: 0.34, g: 0.26, b: 0.15 };
const C_MUD = { r: 0.27, g: 0.23, b: 0.16 };
const C_SAND = { r: 0.72, g: 0.65, b: 0.48 };
const C_PEAT = { r: 0.18, g: 0.17, b: 0.11 };

function mix(out, c, t) {
  out.r += (c.r - out.r) * t;
  out.g += (c.g - out.g) * t;
  out.b += (c.b - out.b) * t;
}

export function groundColorAt(x, z, d, swamp, out) {
  const shade = fbm(x * 0.07, z * 0.07, 2, 301);
  out.r = C_MOSS.r; out.g = C_MOSS.g; out.b = C_MOSS.b;
  mix(out, C_DEEP, shade * 0.85);

  const litter = fbm(x * 0.045 + 17, z * 0.045 - 9, 2, 419);
  if (litter > 0.58) mix(out, C_LITTER, Math.min((litter - 0.58) * 2.6, 0.75));

  // wet soil, then a sandy margin as you approach running water
  if (d < 6.5) mix(out, C_MUD, (1 - d / 6.5) * 0.75);
  if (d < 4.0) mix(out, C_SAND, (1 - d / 4.0) * 0.65);

  // swamps read as dark peat and mud
  if (swamp > 0) mix(out, C_PEAT, swamp * 0.7);

  const grain = (fbm(x * 0.9, z * 0.9, 1, 523) - 0.5) * 0.07;
  out.r = Math.max(0, Math.min(1, out.r + grain));
  out.g = Math.max(0, Math.min(1, out.g + grain));
  out.b = Math.max(0, Math.min(1, out.b + grain));
  return out;
}
