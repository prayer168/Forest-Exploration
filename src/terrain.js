// Infinite terrain field: height, meandering streams, and ground colour.
// All functions are pure functions of world (x, z) so the world can be
// generated and regenerated chunk by chunk without ever changing.

import { fbm } from './rng.js';

export const BANK = 7.0;      // how far the stream carves outward
export const CARVE = 2.4;     // max carve depth at the stream centre
export const WATER_FILL = 1.15; // how deep the channel is filled with water

export function baseHeight(x, z) {
  let h = 0;
  h += (fbm(x * 0.0055, z * 0.0055, 4, 11) - 0.5) * 20; // large landforms
  h += (fbm(x * 0.022, z * 0.022, 3, 23) - 0.5) * 4.0;  // medium undulation
  h += (fbm(x * 0.09, z * 0.09, 2, 37) - 0.5) * 0.9;    // small bumps
  return h;
}

// Two independent warped-noise fields. Their zero contours meander across the
// plane, which gives an endless branching network of streams for free.
function riverFieldA(x, z) {
  const wx = x + (fbm(x * 0.0031 + 4.7, z * 0.0031 + 1.9, 2, 71) - 0.5) * 120;
  const wz = z + (fbm(x * 0.0031 - 2.3, z * 0.0031 + 8.1, 2, 83) - 0.5) * 120;
  return fbm(wx * 0.0028, wz * 0.0028, 3, 91) - 0.5;
}
function riverFieldB(x, z) {
  const wx = x + (fbm(x * 0.0052 + 11.3, z * 0.0052 - 6.4, 2, 131) - 0.5) * 70;
  const wz = z + (fbm(x * 0.0052 - 9.1, z * 0.0052 + 3.8, 2, 149) - 0.5) * 70;
  return fbm(wx * 0.0046, wz * 0.0046, 3, 167) - 0.5;
}

// Convert a scalar field into an approximate distance to its zero contour by
// dividing the value by the local gradient magnitude.
function contourDistance(field, x, z, e = 2.0) {
  const s = field(x, z);
  const gx = (field(x + e, z) - field(x - e, z)) / (2 * e);
  const gz = (field(x, z + e) - field(x, z - e)) / (2 * e);
  const g = Math.hypot(gx, gz) + 1e-7;
  return Math.abs(s / g);
}

export function riverDistance(x, z) {
  const a = contourDistance(riverFieldA, x, z);
  const b = contourDistance(riverFieldB, x, z) * 1.35; // secondary creeks read narrower
  return Math.min(a, b);
}

export function carveFromDistance(base, d) {
  if (d >= BANK) return base;
  const t = 1 - d / BANK;
  return base - t * t * (3 - 2 * t) * CARVE;
}

export function groundHeightAt(x, z) {
  return carveFromDistance(baseHeight(x, z), riverDistance(x, z));
}

export function waterYAt(x, z) {
  return baseHeight(x, z) - WATER_FILL;
}

// Height the player's feet rest at — they wade through streams instead of
// sinking to the bed.
export function walkHeightAt(x, z) {
  const g = groundHeightAt(x, z);
  const w = waterYAt(x, z);
  return Math.max(g, w - 0.6);
}

const C_MOSS = { r: 0.29, g: 0.40, b: 0.19 };
const C_DEEP = { r: 0.16, g: 0.26, b: 0.12 };
const C_LITTER = { r: 0.34, g: 0.26, b: 0.15 };
const C_MUD = { r: 0.27, g: 0.23, b: 0.16 };
const C_SAND = { r: 0.72, g: 0.65, b: 0.48 };

function mix(out, c, t) {
  out.r += (c.r - out.r) * t;
  out.g += (c.g - out.g) * t;
  out.b += (c.b - out.b) * t;
}

// Writes an {r,g,b} ground colour for this world position.
export function groundColorAt(x, z, d, out) {
  const shade = fbm(x * 0.07, z * 0.07, 2, 301);
  out.r = C_MOSS.r; out.g = C_MOSS.g; out.b = C_MOSS.b;
  mix(out, C_DEEP, shade * 0.85);

  // patches of fallen-leaf litter
  const litter = fbm(x * 0.045 + 17, z * 0.045 - 9, 2, 419);
  if (litter > 0.58) mix(out, C_LITTER, Math.min((litter - 0.58) * 2.6, 0.75));

  // wet soil then a sandy/gravel margin as you approach the water
  if (d < 6.5) mix(out, C_MUD, (1 - d / 6.5) * 0.75);
  if (d < 4.0) mix(out, C_SAND, (1 - d / 4.0) * 0.65);

  const grain = (fbm(x * 0.9, z * 0.9, 1, 523) - 0.5) * 0.07;
  out.r = Math.max(0, Math.min(1, out.r + grain));
  out.g = Math.max(0, Math.min(1, out.g + grain));
  out.b = Math.max(0, Math.min(1, out.b + grain));
  return out;
}
