// Plant geometry: reusable primitives, tree archetypes, grass tufts, ferns
// and ground litter. Trees are emitted as lists of transformed primitives so a
// whole chunk of forest can be merged into a single vertex-coloured mesh.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Every geometry that will ever be merged must agree on its attributes, so we
// strip uv and force non-indexed up front.
function prep(geo) {
  geo.deleteAttribute('uv');
  return geo.toNonIndexed();
}

export const G = {
  trunkSlim: prep(new THREE.CylinderGeometry(0.55, 1, 1, 7)),
  trunkEven: prep(new THREE.CylinderGeometry(0.8, 1, 1, 7)),
  branch: prep(new THREE.CylinderGeometry(0.3, 1, 1, 5)),
  cone: prep(new THREE.ConeGeometry(1, 1, 8)),
  blob: prep(new THREE.IcosahedronGeometry(1, 0)),
  dome: prep(new THREE.SphereGeometry(1, 8, 5)),
};

export function TRS(px, py, pz, rx, ry, rz, sx, sy, sz) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
}

// Bakes {geo, matrix, color} parts into one merged geometry carrying colour as
// a vertex attribute, optionally pre-multiplied by a placement matrix.
export function bakeParts(parts, placement) {
  const geos = parts.map((p) => {
    const g = p.geo.clone();
    const m = placement ? new THREE.Matrix4().multiplyMatrices(placement, p.matrix) : p.matrix;
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = p.color.r;
      arr[i * 3 + 1] = p.color.g;
      arr[i * 3 + 2] = p.color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

function barkColor(rnd) {
  const c = new THREE.Color(rnd() < 0.16 ? 0x6d6459 : 0x5b3a29);
  c.offsetHSL((rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.13);
  return c;
}
function leafColor(rnd) {
  return new THREE.Color().setHSL(
    0.21 + rnd() * 0.19,
    0.34 + rnd() * 0.4,
    0.16 + rnd() * 0.24
  );
}
function jitterLeaf(base, rnd) {
  return base.clone().offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.09);
}

function addBlobCluster(parts, rnd, cx, cy, cz, radius, color, count) {
  for (let i = 0; i < count; i++) {
    const r = radius * (0.5 + rnd() * 0.65);
    parts.push({
      geo: G.blob,
      matrix: TRS(
        cx + (rnd() - 0.5) * radius * 1.1,
        cy + (rnd() - 0.5) * radius * 0.6,
        cz + (rnd() - 0.5) * radius * 1.1,
        rnd() * 3, rnd() * 3, rnd() * 3,
        r, r * (0.72 + rnd() * 0.4), r
      ),
      color: jitterLeaf(color, rnd),
    });
  }
}

function addBranches(parts, rnd, atHeight, count, radius, color) {
  for (let i = 0; i < count; i++) {
    const angle = rnd() * Math.PI * 2;
    const len = radius * (2.4 + rnd() * 2.4);
    const tilt = 0.55 + rnd() * 0.55;
    parts.push({
      geo: G.branch,
      matrix: TRS(
        Math.sin(angle) * len * 0.35,
        atHeight + (rnd() - 0.35) * len * 0.35,
        Math.cos(angle) * len * 0.35,
        Math.cos(angle) * tilt, angle, -Math.sin(angle) * tilt,
        radius * 0.42, len, radius * 0.42
      ),
      color,
    });
  }
}

function addVine(parts, rnd, fromHeight) {
  const color = new THREE.Color(0x3d5a2c).offsetHSL(0, 0, (rnd() - 0.5) * 0.1);
  let x = (rnd() - 0.5) * 0.5;
  let z = (rnd() - 0.5) * 0.5;
  let y = fromHeight;
  const segments = 3 + Math.floor(rnd() * 2);
  const drop = fromHeight / (segments + 0.4);
  for (let i = 0; i < segments; i++) {
    const nx = x + (rnd() - 0.5) * 0.42;
    const nz = z + (rnd() - 0.5) * 0.42;
    const ny = y - drop;
    const dx = nx - x, dy = ny - y, dz = nz - z;
    const len = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.acos(Math.max(-1, Math.min(1, -dy / len)));
    parts.push({
      geo: G.branch,
      matrix: TRS((x + nx) / 2, (y + ny) / 2, (z + nz) / 2, Math.PI - pitch, yaw, 0, 0.035, len, 0.035),
      color,
    });
    x = nx; y = ny; z = nz;
  }
}

// ---------- tree archetypes ----------
// Each returns { parts, height, trunkR }. `s` is the size multiplier that
// decides whether this is an emergent giant or a sapling in the understory.

function conifer(rnd, s) {
  const parts = [];
  const trunkH = (3.4 + rnd() * 2.8) * s;
  const trunkR = (0.13 + rnd() * 0.09) * Math.pow(s, 0.85) * (0.75 + rnd() * 0.6);
  const bark = barkColor(rnd);
  parts.push({ geo: G.trunkSlim, matrix: TRS(0, trunkH / 2, 0, 0, 0, 0, trunkR, trunkH, trunkR), color: bark });

  const layers = 4 + Math.floor(rnd() * 3);
  const leaf = leafColor(rnd);
  const from = trunkH * 0.26;
  const to = trunkH * 1.0;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const y = from + t * (to - from);
    const r = (1.15 - t * 0.78) * (0.8 + rnd() * 0.35) * Math.pow(s, 0.9);
    const h = trunkH * 0.36 * (1 - t * 0.28);
    parts.push({
      geo: G.cone,
      matrix: TRS(0, y + h / 2, 0, 0, rnd() * 6.28, 0, r, h, r),
      color: jitterLeaf(leaf, rnd),
    });
  }
  return { parts, height: to + trunkH * 0.3, trunkR };
}

function broadleaf(rnd, s) {
  const parts = [];
  const trunkH = (2.0 + rnd() * 2.0) * s;
  const trunkR = (0.14 + rnd() * 0.1) * Math.pow(s, 0.85) * (0.75 + rnd() * 0.6);
  const bark = barkColor(rnd);
  parts.push({
    geo: G.trunkEven,
    matrix: TRS(0, trunkH / 2, 0, (rnd() - 0.5) * 0.08, 0, (rnd() - 0.5) * 0.08, trunkR, trunkH, trunkR),
    color: bark,
  });
  addBranches(parts, rnd, trunkH * 0.82, 2 + Math.floor(rnd() * 3), trunkR, bark);

  const leaf = leafColor(rnd);
  const canopyR = (1.1 + rnd() * 0.85) * Math.sqrt(s);
  addBlobCluster(parts, rnd, 0, trunkH + canopyR * 0.55, 0, canopyR, leaf, 4 + Math.floor(rnd() * 3));
  return { parts, height: trunkH + canopyR * 1.2, trunkR };
}

function emergent(rnd, s) {
  const parts = [];
  const trunkH = (5.5 + rnd() * 3.5) * s;
  const trunkR = (0.2 + rnd() * 0.12) * Math.pow(s, 0.85) * (0.8 + rnd() * 0.5);
  const bark = barkColor(rnd);
  parts.push({
    geo: G.trunkSlim,
    matrix: TRS(0, trunkH / 2, 0, 0, 0, (rnd() - 0.5) * 0.09, trunkR * 1.35, trunkH, trunkR * 1.35),
    color: bark,
  });
  // buttress roots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rnd() * 0.5;
    parts.push({
      geo: G.cone,
      matrix: TRS(Math.sin(a) * trunkR * 1.1, trunkH * 0.09, Math.cos(a) * trunkR * 1.1, 0, a, 0,
        trunkR * 0.85, trunkH * 0.2, trunkR * 0.85),
      color: bark,
    });
  }
  addBranches(parts, rnd, trunkH * 0.88, 3, trunkR, bark);

  const leaf = leafColor(rnd);
  const canopyR = (1.9 + rnd() * 1.3) * Math.sqrt(s);
  parts.push({
    geo: G.dome,
    matrix: TRS(0, trunkH + canopyR * 0.22, 0, 0, rnd() * 6.28, 0, canopyR, canopyR * 0.42, canopyR),
    color: leaf,
  });
  addBlobCluster(parts, rnd, 0, trunkH + canopyR * 0.34, 0, canopyR * 0.72, leaf, 3);
  return { parts, height: trunkH + canopyR * 0.7, trunkR: trunkR * 1.35 };
}

function gnarled(rnd, s) {
  const parts = [];
  const bark = barkColor(rnd);
  const h1 = (1.3 + rnd() * 1.0) * s;
  const r1 = (0.16 + rnd() * 0.09) * Math.pow(s, 0.85) * (0.75 + rnd() * 0.6);
  parts.push({ geo: G.trunkEven, matrix: TRS(0, h1 / 2, 0, 0, 0, 0, r1, h1, r1), color: bark });

  const lean = (rnd() - 0.5) * 0.95;
  const h2 = (1.6 + rnd() * 1.5) * s;
  const r2 = r1 * 0.72;
  const cx = Math.sin(lean) * h2 * 0.5;
  const cy = h1 + Math.cos(lean) * h2 * 0.5;
  parts.push({ geo: G.trunkSlim, matrix: TRS(cx, cy, 0, 0, 0, lean, r2, h2, r2), color: bark });

  const topX = Math.sin(lean) * h2;
  const topY = h1 + Math.cos(lean) * h2;
  const leaf = leafColor(rnd);
  const canopyR = (0.95 + rnd() * 0.6) * Math.sqrt(s);
  addBlobCluster(parts, rnd, topX, topY + canopyR * 0.4, 0, canopyR, leaf, 3 + Math.floor(rnd() * 3));
  return { parts, height: topY + canopyR, trunkR: r1 };
}

function treeFern(rnd, s) {
  const parts = [];
  const trunkH = (1.6 + rnd() * 1.8) * s;
  const trunkR = (0.09 + rnd() * 0.05) * Math.pow(s, 0.8);
  const bark = new THREE.Color(0x4a3b2c).offsetHSL(0, 0, (rnd() - 0.5) * 0.1);
  parts.push({ geo: G.trunkEven, matrix: TRS(0, trunkH / 2, 0, 0, 0, 0, trunkR, trunkH, trunkR), color: bark });

  const leaf = new THREE.Color().setHSL(0.27 + rnd() * 0.08, 0.45 + rnd() * 0.2, 0.2 + rnd() * 0.12);
  const fronds = 6 + Math.floor(rnd() * 4);
  const len = (0.95 + rnd() * 0.6) * Math.sqrt(s);
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rnd() * 0.35;
    const droop = 1.15 + rnd() * 0.45;
    parts.push({
      geo: G.cone,
      matrix: TRS(
        Math.sin(a) * len * 0.42, trunkH + 0.12 - rnd() * 0.1, Math.cos(a) * len * 0.42,
        Math.cos(a) * droop, a, -Math.sin(a) * droop,
        0.19, len, 0.06
      ),
      color: jitterLeaf(leaf, rnd),
    });
  }
  return { parts, height: trunkH + 0.5, trunkR };
}

function shrub(rnd, s) {
  const parts = [];
  const localS = Math.min(s, 0.9);
  const stems = 3 + Math.floor(rnd() * 3);
  const leaf = leafColor(rnd);
  const bark = barkColor(rnd);
  let maxH = 0;
  for (let i = 0; i < stems; i++) {
    const h = (0.65 + rnd() * 0.8) * localS;
    maxH = Math.max(maxH, h);
    const ox = (rnd() - 0.5) * 0.6;
    const oz = (rnd() - 0.5) * 0.6;
    parts.push({
      geo: G.trunkEven,
      matrix: TRS(ox, h / 2, oz, 0, 0, (rnd() - 0.5) * 0.35, 0.035, h, 0.035),
      color: bark,
    });
    addBlobCluster(parts, rnd, ox, h + 0.18, oz, (0.3 + rnd() * 0.24) * Math.sqrt(localS), leaf, 2);
  }
  return { parts, height: maxH + 0.5, trunkR: 0.12 };
}

const ARCHETYPES = [
  { fn: conifer, weight: 3, vine: true },
  { fn: broadleaf, weight: 4, vine: true },
  { fn: emergent, weight: 1, vine: true, forceBig: true },
  { fn: gnarled, weight: 3, vine: true },
  { fn: treeFern, weight: 2, vine: false },
  { fn: shrub, weight: 3, vine: false, forceSmall: true },
];

// A believable forest is mostly mid-storey and understory with a few giants.
const SIZE_CLASSES = [
  { weight: 5, range: [1.55, 2.15] },
  { weight: 22, range: [1.1, 1.5] },
  { weight: 44, range: [0.7, 1.05] },
  { weight: 29, range: [0.4, 0.68] },
];

function pickWeighted(list, rnd) {
  const total = list.reduce((s, item) => s + item.weight, 0);
  let r = rnd() * total;
  for (const item of list) {
    if (r < item.weight) return item;
    r -= item.weight;
  }
  return list[list.length - 1];
}

export function buildTree(rnd) {
  const arch = pickWeighted(ARCHETYPES, rnd);
  const cls = pickWeighted(SIZE_CLASSES, rnd);
  let s = cls.range[0] + rnd() * (cls.range[1] - cls.range[0]);
  if (arch.forceBig) s = Math.max(s, 1.5);
  if (arch.forceSmall) s = Math.min(s, 0.85);

  const tree = arch.fn(rnd, s);
  if (arch.vine && rnd() < 0.2) addVine(tree.parts, rnd, tree.height * 0.62);
  return tree;
}

// ---------- ground cover ----------

// A single curved, tapered blade that bends away from the vertical.
function bladeGeometry(width, height, bend) {
  const SEG = 3;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const y = t * height;
    const z = bend * t * t * height * 0.55;
    const w = width * (1 - t * 0.82) * 0.5;
    pos.push(-w, y, z, w, y, z);
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = g.toNonIndexed();
  g.dispose();
  return out;
}

// A clump of blades splaying out from one point — reads as a tuft of grass
// rather than a single spike.
export function makeTuftGeometry(rnd, bladeCount, heightScale, widthScale) {
  const geos = [];
  for (let i = 0; i < bladeCount; i++) {
    const g = bladeGeometry(
      (0.05 + rnd() * 0.035) * widthScale,
      (0.42 + rnd() * 0.4) * heightScale,
      0.35 + rnd() * 0.8
    );
    const yaw = (i / bladeCount) * Math.PI * 2 + rnd() * 0.9;
    const tilt = 0.08 + rnd() * 0.3;
    g.applyMatrix4(
      new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(tilt))
    );
    g.translate((rnd() - 0.5) * 0.14, 0, (rnd() - 0.5) * 0.14);
    geos.push(g);
  }
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

export function makeFernGeometry(rnd) {
  const geos = [];
  const fronds = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < fronds; i++) {
    const g = bladeGeometry(0.2 + rnd() * 0.1, 0.6 + rnd() * 0.35, 1.0 + rnd() * 0.7);
    const yaw = (i / fronds) * Math.PI * 2 + rnd() * 0.5;
    const tilt = 0.35 + rnd() * 0.35;
    g.applyMatrix4(
      new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(tilt))
    );
    geos.push(g);
  }
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

export function makeLeafGeometry() {
  const g = new THREE.PlaneGeometry(0.17, 0.12);
  g.rotateX(-Math.PI / 2);
  return prep(g);
}

export function makeTwigGeometry() {
  const g = new THREE.CylinderGeometry(0.016, 0.022, 1, 4);
  g.rotateZ(Math.PI / 2);
  return prep(g);
}

export function makePebbleGeometry() {
  return prep(new THREE.IcosahedronGeometry(1, 0));
}
