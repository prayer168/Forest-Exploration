// Endless world streaming. The forest is divided into square chunks that are
// generated on demand around the player and thrown away once they fall behind,
// so there is never an edge to walk into.

import * as THREE from 'three';
import { chunkRng } from './rng.js';
import {
  baseHeight, riverDistance, carveFromDistance, waterYAt, groundColorAt, BANK,
} from './terrain.js';
import {
  buildTree, bakeParts, makeTuftGeometry, makeFernGeometry,
  makeLeafGeometry, makeTwigGeometry, makePebbleGeometry,
} from './flora.js';

export const CHUNK = 40;
const SEG = 32;
const LOAD_R = 3;
const UNLOAD_R = 4;
const DETAIL_R = 2; // ground cover only near the player; fog hides the rest

const TREES_PER_CHUNK = 18;
const TUFTS_PER_CHUNK = 300;
const FERNS_PER_CHUNK = 55;
const LEAVES_PER_CHUNK = 260;
const TWIGS_PER_CHUNK = 55;
const PEBBLES_PER_CHUNK = 45;
const ROCKS_PER_CHUNK = 10;

// Shared materials — one per surface type for the whole world.
const MAT = {
  ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  water: new THREE.MeshStandardMaterial({
    color: 0x3c7f9c, roughness: 0.12, metalness: 0.15,
    transparent: true, opacity: 0.82,
  }),
  tree: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
  grass: new THREE.MeshStandardMaterial({
    color: 0x6d8a3c, roughness: 1, side: THREE.DoubleSide,
  }),
  fern: new THREE.MeshStandardMaterial({
    color: 0x35662c, roughness: 1, side: THREE.DoubleSide,
  }),
  leaf: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, side: THREE.DoubleSide,
  }),
  twig: new THREE.MeshStandardMaterial({ color: 0x6b5335, roughness: 1 }),
  pebble: new THREE.MeshStandardMaterial({ color: 0x8f8a7d, roughness: 1, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 1, flatShading: true }),
};

// A few tuft/fern shapes generated once and reused by every instance, so the
// undergrowth has variety without a geometry per plant.
const tuftRng = chunkRng(7, 13, 3);
const TUFT_GEOS = [
  makeTuftGeometry(tuftRng, 7, 1.0, 1.0),
  makeTuftGeometry(tuftRng, 9, 0.8, 1.15),
  makeTuftGeometry(tuftRng, 6, 1.35, 0.85),
];
const FERN_GEOS = [makeFernGeometry(tuftRng), makeFernGeometry(tuftRng)];
const LEAF_GEO = makeLeafGeometry();
const TWIG_GEO = makeTwigGeometry();
const PEBBLE_GEO = makePebbleGeometry();

const GRASS_TINTS = [0x6d8a3c, 0x7d9445, 0x5c7a33, 0x8a9550, 0x627f38];
const LEAF_TINTS = [0x8a6a35, 0xa07b3c, 0x6f5a2c, 0xb08a48, 0x7d6a3a, 0x94733a];

const _c = { r: 0, g: 0, b: 0 };
const _color = new THREE.Color();
const _dummy = new THREE.Object3D();

function instanced(geo, mat, count) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.count = 0;
  m.castShadow = false;
  m.receiveShadow = true;
  m.frustumCulled = true;
  return m;
}

export class ChunkManager {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.queue = [];
    this.center = { cx: NaN, cz: NaN };
  }

  key(cx, cz) {
    return cx + ':' + cz;
  }

  update(px, pz, maxBuildsPerFrame = 1) {
    const cx = Math.floor(px / CHUNK);
    const cz = Math.floor(pz / CHUNK);

    if (cx !== this.center.cx || cz !== this.center.cz) {
      this.center.cx = cx;
      this.center.cz = cz;
      this.rebuildQueue(cx, cz);
      this.unloadFar(cx, cz);
    }

    let built = 0;
    while (this.queue.length && built < maxBuildsPerFrame) {
      const item = this.queue.shift();
      const k = this.key(item.cx, item.cz);
      const existing = this.chunks.get(k);
      if (existing) {
        if (!item.upgrade) continue;
        this.discard(k, existing);
      }
      this.chunks.set(k, this.buildChunk(item.cx, item.cz));
      built++;
    }
  }

  rebuildQueue(cx, cz) {
    const wanted = [];
    for (let dz = -LOAD_R; dz <= LOAD_R; dz++) {
      for (let dx = -LOAD_R; dx <= LOAD_R; dx++) {
        const existing = this.chunks.get(this.key(cx + dx, cz + dz));
        const d = dx * dx + dz * dz;
        if (existing) {
          // A chunk generated while it was far away has no undergrowth. Now
          // that the player is close, rebuild it with the full detail pass —
          // generation is deterministic, so only the ground cover changes.
          const ring = Math.max(Math.abs(dx), Math.abs(dz));
          if (ring <= DETAIL_R && !existing.detailed) {
            wanted.push({ cx: cx + dx, cz: cz + dz, d, upgrade: true });
          }
          continue;
        }
        wanted.push({ cx: cx + dx, cz: cz + dz, d, upgrade: false });
      }
    }
    wanted.sort((a, b) => a.d - b.d);
    this.queue = wanted;
  }

  discard(k, chunk) {
    this.scene.remove(chunk.group);
    chunk.owned.forEach((g) => g.dispose());
    this.chunks.delete(k);
  }

  unloadFar(cx, cz) {
    for (const [k, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - cx) > UNLOAD_R || Math.abs(chunk.cz - cz) > UNLOAD_R) {
        this.discard(k, chunk);
      }
    }
  }

  // Trunk positions the player should not walk through.
  collidersNear(x, z) {
    const out = [];
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(this.key(cx + dx, cz + dz));
        if (chunk) out.push(...chunk.colliders);
      }
    }
    return out;
  }

  buildChunk(cx, cz) {
    const rnd = chunkRng(cx, cz, 1);
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;
    const ring = Math.max(Math.abs(cx - this.center.cx), Math.abs(cz - this.center.cz));
    const detailed = ring <= DETAIL_R;

    const group = new THREE.Group();
    group.position.set(ox, 0, oz);
    const owned = [];
    const colliders = [];

    // --- sample the terrain field once, reuse for ground, water and scatter ---
    const stride = SEG + 1;
    const heights = new Float32Array(stride * stride);
    const dists = new Float32Array(stride * stride);
    const step = CHUNK / SEG;
    for (let j = 0; j < stride; j++) {
      for (let i = 0; i < stride; i++) {
        const wx = ox + i * step;
        const wz = oz + j * step;
        const d = riverDistance(wx, wz);
        dists[j * stride + i] = d;
        heights[j * stride + i] = carveFromDistance(baseHeight(wx, wz), d);
      }
    }

    // --- ground ---
    const gGeo = new THREE.PlaneGeometry(CHUNK, CHUNK, SEG, SEG);
    gGeo.rotateX(-Math.PI / 2);
    gGeo.translate(CHUNK / 2, 0, CHUNK / 2);
    const gPos = gGeo.attributes.position;
    const gCol = new Float32Array(gPos.count * 3);
    for (let n = 0; n < gPos.count; n++) {
      const i = n % stride;
      const j = Math.floor(n / stride);
      const h = heights[j * stride + i];
      gPos.setY(n, h);
      groundColorAt(ox + i * step, oz + j * step, dists[j * stride + i], _c);
      gCol[n * 3] = _c.r;
      gCol[n * 3 + 1] = _c.g;
      gCol[n * 3 + 2] = _c.b;
    }
    gGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
    gGeo.computeVertexNormals();
    const groundMesh = new THREE.Mesh(gGeo, MAT.ground);
    groundMesh.receiveShadow = true;
    group.add(groundMesh);
    owned.push(gGeo);

    // --- water surface, only over cells the channel actually floods ---
    const wPos = [];
    const wIdx = [];
    const cellIndex = new Int32Array(stride * stride).fill(-1);
    for (let j = 0; j < stride; j++) {
      for (let i = 0; i < stride; i++) {
        const wx = ox + i * step;
        const wz = oz + j * step;
        const wy = waterYAt(wx, wz);
        if (heights[j * stride + i] < wy) {
          cellIndex[j * stride + i] = wPos.length / 3;
          wPos.push(i * step, wy, j * step);
        }
      }
    }
    for (let j = 0; j < SEG; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = cellIndex[j * stride + i];
        const b = cellIndex[j * stride + i + 1];
        const c = cellIndex[(j + 1) * stride + i];
        const d = cellIndex[(j + 1) * stride + i + 1];
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        wIdx.push(a, c, b, b, c, d);
      }
    }
    if (wIdx.length) {
      const wGeo = new THREE.BufferGeometry();
      wGeo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
      wGeo.setIndex(wIdx);
      wGeo.computeVertexNormals();
      const waterMesh = new THREE.Mesh(wGeo, MAT.water);
      waterMesh.receiveShadow = true;
      group.add(waterMesh);
      owned.push(wGeo);
    }

    // sample helpers in chunk-local space
    const heightLocal = (lx, lz) => {
      const fi = THREE.MathUtils.clamp(lx / step, 0, SEG);
      const fj = THREE.MathUtils.clamp(lz / step, 0, SEG);
      const i = Math.min(Math.floor(fi), SEG - 1);
      const j = Math.min(Math.floor(fj), SEG - 1);
      const tx = fi - i;
      const tz = fj - j;
      const h00 = heights[j * stride + i];
      const h10 = heights[j * stride + i + 1];
      const h01 = heights[(j + 1) * stride + i];
      const h11 = heights[(j + 1) * stride + i + 1];
      return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
    };
    const distLocal = (lx, lz) => {
      const i = THREE.MathUtils.clamp(Math.round(lx / step), 0, SEG);
      const j = THREE.MathUtils.clamp(Math.round(lz / step), 0, SEG);
      return dists[j * stride + i];
    };
    const slopeLocal = (lx, lz) => {
      const e = step;
      const hx = heightLocal(Math.min(lx + e, CHUNK), lz) - heightLocal(Math.max(lx - e, 0), lz);
      const hz = heightLocal(lx, Math.min(lz + e, CHUNK)) - heightLocal(lx, Math.max(lz - e, 0));
      return Math.hypot(hx, hz) / (2 * e);
    };

    // --- trees ---
    const treeParts = [];
    let placed = 0;
    let attempts = 0;
    while (placed < TREES_PER_CHUNK && attempts < TREES_PER_CHUNK * 12) {
      attempts++;
      const lx = rnd() * CHUNK;
      const lz = rnd() * CHUNK;
      if (distLocal(lx, lz) < 4.5) continue;      // keep the stream bed open
      if (slopeLocal(lx, lz) > 0.75) continue;    // nothing clings to cliffs

      const tree = buildTree(rnd);
      const placement = new THREE.Matrix4().compose(
        new THREE.Vector3(lx, heightLocal(lx, lz) - 0.05, lz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0)),
        new THREE.Vector3(1, 1, 1)
      );
      for (const p of tree.parts) {
        treeParts.push({
          geo: p.geo,
          matrix: new THREE.Matrix4().multiplyMatrices(placement, p.matrix),
          color: p.color,
        });
      }
      colliders.push({ x: ox + lx, z: oz + lz, r: tree.trunkR + 0.35 });
      placed++;
    }
    if (treeParts.length) {
      const treeGeo = bakeParts(treeParts);
      const treeMesh = new THREE.Mesh(treeGeo, MAT.tree);
      treeMesh.castShadow = true;
      treeMesh.receiveShadow = true;
      group.add(treeMesh);
      owned.push(treeGeo);
    }

    // --- undergrowth and litter (near chunks only) ---
    if (detailed) {
      // grass tufts, split across the tuft shape variants
      const perGeo = Math.ceil(TUFTS_PER_CHUNK / TUFT_GEOS.length);
      TUFT_GEOS.forEach((geo) => {
        const mesh = instanced(geo, MAT.grass, perGeo);
        let n = 0;
        for (let k = 0; k < perGeo * 3 && n < perGeo; k++) {
          const cxp = rnd() * CHUNK;
          const czp = rnd() * CHUNK;
          if (distLocal(cxp, czp) < 2.0) continue;
          const clump = 2 + Math.floor(rnd() * 3);
          for (let q = 0; q < clump && n < perGeo; q++) {
            const lx = cxp + (rnd() - 0.5) * 1.6;
            const lz = czp + (rnd() - 0.5) * 1.6;
            if (lx < 0 || lz < 0 || lx > CHUNK || lz > CHUNK) continue;
            _dummy.position.set(lx, heightLocal(lx, lz) - 0.03, lz);
            _dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
            const s = 0.75 + rnd() * 0.75;
            _dummy.scale.set(s, s * (0.8 + rnd() * 0.6), s);
            _dummy.updateMatrix();
            mesh.setMatrixAt(n, _dummy.matrix);
            _color.setHex(GRASS_TINTS[Math.floor(rnd() * GRASS_TINTS.length)]);
            _color.offsetHSL(0, 0, (rnd() - 0.5) * 0.12);
            mesh.setColorAt(n, _color);
            n++;
          }
        }
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (n) group.add(mesh);
      });

      // ferns, happiest in the damp ground near water
      const fernPer = Math.ceil(FERNS_PER_CHUNK / FERN_GEOS.length);
      FERN_GEOS.forEach((geo) => {
        const mesh = instanced(geo, MAT.fern, fernPer);
        let n = 0;
        for (let k = 0; k < fernPer * 6 && n < fernPer; k++) {
          const lx = rnd() * CHUNK;
          const lz = rnd() * CHUNK;
          const d = distLocal(lx, lz);
          if (d < 2.5) continue;
          if (d > BANK * 1.6 && rnd() < 0.55) continue;
          _dummy.position.set(lx, heightLocal(lx, lz) - 0.03, lz);
          _dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
          const s = 0.75 + rnd() * 0.7;
          _dummy.scale.set(s, s, s);
          _dummy.updateMatrix();
          mesh.setMatrixAt(n, _dummy.matrix);
          _color.setHex(0x35662c).offsetHSL((rnd() - 0.5) * 0.05, 0, (rnd() - 0.5) * 0.14);
          mesh.setColorAt(n, _color);
          n++;
        }
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (n) group.add(mesh);
      });

      // fallen leaves
      const leafMesh = instanced(LEAF_GEO, MAT.leaf, LEAVES_PER_CHUNK);
      let ln = 0;
      for (let k = 0; k < LEAVES_PER_CHUNK * 2 && ln < LEAVES_PER_CHUNK; k++) {
        const cxp = rnd() * CHUNK;
        const czp = rnd() * CHUNK;
        if (distLocal(cxp, czp) < 1.6) continue;
        const clump = 2 + Math.floor(rnd() * 4);
        for (let q = 0; q < clump && ln < LEAVES_PER_CHUNK; q++) {
          const lx = cxp + (rnd() - 0.5) * 2.2;
          const lz = czp + (rnd() - 0.5) * 2.2;
          if (lx < 0 || lz < 0 || lx > CHUNK || lz > CHUNK) continue;
          _dummy.position.set(lx, heightLocal(lx, lz) + 0.015, lz);
          _dummy.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5);
          const s = 0.7 + rnd() * 0.8;
          _dummy.scale.set(s, s, s);
          _dummy.updateMatrix();
          leafMesh.setMatrixAt(ln, _dummy.matrix);
          _color.setHex(LEAF_TINTS[Math.floor(rnd() * LEAF_TINTS.length)]);
          _color.offsetHSL(0, 0, (rnd() - 0.5) * 0.12);
          leafMesh.setColorAt(ln, _color);
          ln++;
        }
      }
      leafMesh.count = ln;
      leafMesh.instanceMatrix.needsUpdate = true;
      if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
      if (ln) group.add(leafMesh);

      // twigs and small debris
      const twigMesh = instanced(TWIG_GEO, MAT.twig, TWIGS_PER_CHUNK);
      let tn = 0;
      for (let k = 0; k < TWIGS_PER_CHUNK * 2 && tn < TWIGS_PER_CHUNK; k++) {
        const lx = rnd() * CHUNK;
        const lz = rnd() * CHUNK;
        if (distLocal(lx, lz) < 1.6) continue;
        _dummy.position.set(lx, heightLocal(lx, lz) + 0.03, lz);
        _dummy.rotation.set((rnd() - 0.5) * 0.3, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.25);
        const len = 0.3 + rnd() * 0.75;
        _dummy.scale.set(len, 1, 1);
        _dummy.updateMatrix();
        twigMesh.setMatrixAt(tn, _dummy.matrix);
        _color.setHex(0x6b5335).offsetHSL(0, 0, (rnd() - 0.5) * 0.14);
        twigMesh.setColorAt(tn, _color);
        tn++;
      }
      twigMesh.count = tn;
      twigMesh.instanceMatrix.needsUpdate = true;
      if (twigMesh.instanceColor) twigMesh.instanceColor.needsUpdate = true;
      if (tn) group.add(twigMesh);

      // pebbles, gathering along the stream bed
      const pebMesh = instanced(PEBBLE_GEO, MAT.pebble, PEBBLES_PER_CHUNK);
      let pn = 0;
      for (let k = 0; k < PEBBLES_PER_CHUNK * 3 && pn < PEBBLES_PER_CHUNK; k++) {
        const lx = rnd() * CHUNK;
        const lz = rnd() * CHUNK;
        const d = distLocal(lx, lz);
        if (d > 5 && rnd() < 0.7) continue;
        _dummy.position.set(lx, heightLocal(lx, lz) + 0.02, lz);
        _dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        const s = 0.05 + rnd() * 0.1;
        _dummy.scale.set(s, s * 0.6, s * (0.8 + rnd() * 0.5));
        _dummy.updateMatrix();
        pebMesh.setMatrixAt(pn, _dummy.matrix);
        _color.setHex(0x8f8a7d).offsetHSL(0, 0, (rnd() - 0.5) * 0.16);
        pebMesh.setColorAt(pn, _color);
        pn++;
      }
      pebMesh.count = pn;
      pebMesh.instanceMatrix.needsUpdate = true;
      if (pebMesh.instanceColor) pebMesh.instanceColor.needsUpdate = true;
      if (pn) group.add(pebMesh);
    }

    // --- boulders (kept on every chunk so the far view has silhouettes) ---
    const rockMesh = instanced(PEBBLE_GEO, MAT.rock, ROCKS_PER_CHUNK);
    rockMesh.castShadow = true;
    let rn = 0;
    for (let k = 0; k < ROCKS_PER_CHUNK * 3 && rn < ROCKS_PER_CHUNK; k++) {
      const lx = rnd() * CHUNK;
      const lz = rnd() * CHUNK;
      const d = distLocal(lx, lz);
      if (d > 6 && rnd() < 0.55) continue;
      _dummy.position.set(lx, heightLocal(lx, lz) + 0.1, lz);
      _dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      _dummy.scale.set(0.3 + rnd() * 0.9, 0.25 + rnd() * 0.6, 0.3 + rnd() * 0.9);
      _dummy.updateMatrix();
      rockMesh.setMatrixAt(rn, _dummy.matrix);
      _color.setHex(0x8a8578).offsetHSL(0, 0, (rnd() - 0.5) * 0.14);
      rockMesh.setColorAt(rn, _color);
      rn++;
    }
    rockMesh.count = rn;
    rockMesh.instanceMatrix.needsUpdate = true;
    if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
    if (rn) group.add(rockMesh);

    this.scene.add(group);
    return { cx, cz, group, owned, colliders, detailed };
  }
}
