// The living forest: ground mammals with a wander / forage / alert / flee state
// machine, birds and insects on the wing, crawlers underfoot, and fish in the
// streams. Animals are recycled around the player so the endless forest always
// has residents.

import * as THREE from 'three';
import { walkHeightAt, sampleTerrain } from './terrain.js';
import { G, TRS, bakeParts } from './flora.js';

const BODY_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.85, flatShading: true,
});

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function part(geo, matrix, hex) {
  return { geo, matrix, color: new THREE.Color(hex) };
}

function meshFrom(parts) {
  const geo = bakeParts(parts);
  const mesh = new THREE.Mesh(geo, BODY_MAT);
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.geo = geo;
  return group;
}

// ---------- four-legged bodies ----------

function quadruped(cfg) {
  const {
    bodyLen, bodyH, bodyW, legLen, legR, neck, headR, tail, snout,
    colorBody, colorLeg, colorHead, chestMark, faceMark, bushyTail, earLen = 0.7,
  } = cfg;
  const parts = [];
  const bodyY = legLen + bodyH * 0.5;
  parts.push(part(G.dome, TRS(0, bodyY, 0, 0, 0, 0, bodyW, bodyH, bodyLen), colorBody));

  const lx = bodyW * 0.62;
  const lz = bodyLen * 0.6;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(part(G.trunkEven, TRS(sx * lx, legLen * 0.5, sz * lz, 0, 0, 0, legR, legLen, legR), colorLeg));
    }
  }

  const headY = bodyY + neck * 0.75;
  const headZ = bodyLen * 0.85;
  parts.push(part(G.trunkEven, TRS(0, bodyY + neck * 0.35, bodyLen * 0.5, -0.6, 0, 0, legR * 1.5, neck, legR * 1.5), colorBody));
  parts.push(part(G.dome, TRS(0, headY, headZ, 0, 0, 0, headR, headR, headR * 1.25), colorHead));
  if (snout) {
    parts.push(part(G.dome, TRS(0, headY - headR * 0.25, headZ + headR * 1.1, 0, 0, 0, headR * 0.5, headR * 0.45, headR * 0.75), colorHead));
  }
  if (faceMark) {
    parts.push(part(G.dome, TRS(0, headY + headR * 0.35, headZ + headR * 0.5, 0, 0, 0, headR * 0.22, headR * 0.5, headR * 0.8), faceMark));
  }
  for (const sx of [-1, 1]) {
    parts.push(part(G.cone, TRS(sx * headR * 0.6, headY + headR * 0.85, headZ - headR * 0.15, 0, 0, sx * 0.25, headR * 0.3, headR * earLen, headR * 0.2), colorHead));
  }
  if (tail) {
    if (bushyTail) {
      parts.push(part(G.dome, TRS(0, bodyY + bodyH * 0.9, -bodyLen * 0.95, -0.5, 0, 0, bodyW * 0.5, tail, bodyW * 0.5), colorBody));
    } else {
      parts.push(part(G.trunkEven, TRS(0, bodyY + bodyH * 0.35, -bodyLen * 0.95, 0.8, 0, 0, legR * 0.7, tail, legR * 0.7), colorBody));
    }
  }
  if (chestMark) {
    parts.push(part(G.dome, TRS(0, bodyY + bodyH * 0.1, bodyLen * 0.72, 0, 0, 0, bodyW * 0.45, bodyH * 0.42, bodyLen * 0.16), chestMark));
  }
  return meshFrom(parts);
}

// ---------- birds ----------

// Ground-dwelling bird: upright body on two legs with a long trailing tail.
function groundBird(cfg) {
  const { bodyLen, bodyR, legLen, colorBody, colorHead, colorTail, beak, tailLen, crest } = cfg;
  const parts = [];
  const bodyY = legLen + bodyR;
  parts.push(part(G.dome, TRS(0, bodyY, 0, -0.25, 0, 0, bodyR, bodyR * 0.95, bodyLen), colorBody));
  for (const sx of [-1, 1]) {
    parts.push(part(G.trunkEven, TRS(sx * bodyR * 0.4, legLen * 0.5, 0, 0, 0, 0, 0.018, legLen, 0.018), 0x9a7a45));
  }
  const neckY = bodyY + bodyR * 0.9;
  const neckZ = bodyLen * 0.55;
  parts.push(part(G.trunkEven, TRS(0, bodyY + bodyR * 0.5, neckZ * 0.6, -0.45, 0, 0, 0.028, bodyR * 1.1, 0.028), colorHead));
  parts.push(part(G.dome, TRS(0, neckY, neckZ, 0, 0, 0, bodyR * 0.45, bodyR * 0.45, bodyR * 0.5), colorHead));
  parts.push(part(G.cone, TRS(0, neckY, neckZ + bodyR * 0.5, Math.PI / 2, 0, 0, 0.02, bodyR * 0.5, 0.02), beak));
  if (crest) {
    parts.push(part(G.cone, TRS(0, neckY + bodyR * 0.45, neckZ - bodyR * 0.1, -0.4, 0, 0, 0.02, bodyR * 0.6, 0.02), crest));
  }
  parts.push(part(G.cone, TRS(0, bodyY + bodyR * 0.3, -bodyLen - tailLen * 0.4, Math.PI / 2 - 0.25, 0, 0, bodyR * 0.9, tailLen, 0.02), colorTail));
  return meshFrom(parts);
}

// Anything that flies: merged body, plus two wing planes that flap.
function flyer(cfg) {
  const {
    bodyLen, bodyR, colorBody, wingSpan, wingChord, colorWing,
    wingOpacity = 1, tailFan, head, beak, wingPairs = 1,
  } = cfg;
  const parts = [part(G.dome, TRS(0, 0, 0, 0, 0, 0, bodyR, bodyR, bodyLen), colorBody)];
  if (tailFan) {
    parts.push(part(G.cone, TRS(0, 0, -bodyLen * 1.15, Math.PI / 2, 0, 0, bodyR * 2.2, bodyLen * 0.8, bodyR * 0.35), colorBody));
  }
  if (head) {
    parts.push(part(G.dome, TRS(0, bodyR * 0.35, bodyLen * 0.85, 0, 0, 0, bodyR * 0.72, bodyR * 0.72, bodyR * 0.8), head));
    parts.push(part(G.cone, TRS(0, bodyR * 0.3, bodyLen * 1.15, Math.PI / 2, 0, 0, bodyR * 0.25, bodyR * 0.8, bodyR * 0.25), beak || 0xd8a03a));
  }
  const group = meshFrom(parts);

  const wingGeo = new THREE.PlaneGeometry(wingSpan, wingChord);
  wingGeo.translate(wingSpan / 2, 0, 0);
  wingGeo.rotateX(-Math.PI / 2);
  const wingMat = new THREE.MeshStandardMaterial({
    color: colorWing, side: THREE.DoubleSide, roughness: 0.9,
    transparent: wingOpacity < 1, opacity: wingOpacity,
  });
  const wings = [];
  for (let p = 0; p < wingPairs; p++) {
    const zOff = wingPairs > 1 ? (p - 0.5) * wingChord * 1.3 : 0;
    const l = new THREE.Mesh(wingGeo, wingMat);
    const r = new THREE.Mesh(wingGeo, wingMat);
    l.position.z = zOff;
    r.position.z = zOff;
    r.rotation.y = Math.PI;
    group.add(l, r);
    wings.push([l, r]);
  }
  group.userData.wings = wings;
  group.userData.wingGeo = wingGeo;
  group.userData.wingMat = wingMat;
  return group;
}

// ---------- small crawling things ----------

function snakeMesh() {
  const parts = [];
  const segs = 7;
  const skin = pick([0x4a5a2c, 0x5a4a2a, 0x3d4a33]);
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const r = 0.055 * (1 - t * 0.55);
    parts.push(part(G.dome, TRS(0, 0, -t * 0.85, 0, 0, 0, r, r * 0.75, 0.09), i === 0 ? 0x5c6b34 : skin));
  }
  return meshFrom(parts);
}

function spiderMesh() {
  const parts = [
    part(G.dome, TRS(0, 0.05, -0.03, 0, 0, 0, 0.045, 0.035, 0.055), 0x241f1a),
    part(G.dome, TRS(0, 0.05, 0.04, 0, 0, 0, 0.028, 0.024, 0.03), 0x2e2721),
  ];
  for (let i = 0; i < 4; i++) {
    const a = 0.5 + i * 0.42;
    for (const sx of [-1, 1]) {
      parts.push(part(G.trunkEven, TRS(
        sx * 0.05, 0.045, -0.02 + (i - 1.5) * 0.028,
        0.3, sx * a, sx * 1.1, 0.006, 0.11, 0.006
      ), 0x1c1815));
    }
  }
  return meshFrom(parts);
}

function beetleMesh() {
  const parts = [
    part(G.dome, TRS(0, 0.04, 0, 0, 0, 0, 0.05, 0.035, 0.075), 0x2b1d12),
    part(G.dome, TRS(0, 0.045, 0.06, 0, 0, 0, 0.032, 0.026, 0.035), 0x1f150d),
    part(G.cone, TRS(0, 0.07, 0.1, -0.9, 0, 0, 0.012, 0.075, 0.012), 0x191009),
  ];
  for (let i = 0; i < 3; i++) {
    for (const sx of [-1, 1]) {
      parts.push(part(G.trunkEven, TRS(sx * 0.045, 0.02, -0.03 + i * 0.045, 0.2, 0, sx * 0.9, 0.005, 0.05, 0.005), 0x140d07));
    }
  }
  return meshFrom(parts);
}

function grasshopperMesh() {
  const green = pick([0x6f8a33, 0x7d8f3c, 0x5c7a2e]);
  const parts = [
    part(G.dome, TRS(0, 0.03, 0, 0, 0, 0, 0.022, 0.024, 0.075), green),
    part(G.dome, TRS(0, 0.038, 0.07, 0, 0, 0, 0.018, 0.018, 0.022), green),
    // folded wing covers
    part(G.dome, TRS(0, 0.045, -0.01, 0, 0, 0, 0.024, 0.012, 0.07), 0x54682a),
  ];
  // long springing hind legs
  for (const sx of [-1, 1]) {
    parts.push(part(G.trunkEven, TRS(sx * 0.022, 0.03, -0.03, -0.6, 0, sx * 0.5, 0.006, 0.075, 0.006), green));
    parts.push(part(G.trunkEven, TRS(sx * 0.032, 0.012, -0.06, 0.7, 0, sx * 0.3, 0.004, 0.07, 0.004), green));
    for (let i = 0; i < 2; i++) {
      parts.push(part(G.trunkEven, TRS(sx * 0.02, 0.015, 0.02 + i * 0.03, 0.2, 0, sx * 1.0, 0.004, 0.04, 0.004), green));
    }
  }
  // antennae
  for (const sx of [-1, 1]) {
    parts.push(part(G.trunkEven, TRS(sx * 0.008, 0.05, 0.085, -0.5, 0, sx * 0.35, 0.002, 0.05, 0.002), 0x3d4a1e));
  }
  return meshFrom(parts);
}

function lizardMesh() {
  const skin = pick([0x5a6b3a, 0x6b5a3a, 0x47603f]);
  const parts = [
    part(G.dome, TRS(0, 0.03, 0, 0, 0, 0, 0.03, 0.024, 0.085), skin),
    part(G.dome, TRS(0, 0.033, 0.09, 0, 0, 0, 0.023, 0.02, 0.032), skin),
  ];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    parts.push(part(G.dome, TRS(0, 0.026, -0.09 - t * 0.16, 0, 0, 0, 0.016 * (1 - t * 0.7), 0.013 * (1 - t * 0.7), 0.03), skin));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(part(G.trunkEven, TRS(sx * 0.03, 0.015, sz * 0.05, 0.3, 0, sx * 1.1, 0.005, 0.045, 0.005), skin));
    }
  }
  return meshFrom(parts);
}

function frogMesh() {
  const skin = pick([0x4e6b32, 0x5f6b3a, 0x3f5c38]);
  const parts = [
    part(G.dome, TRS(0, 0.035, 0, 0, 0, 0, 0.045, 0.033, 0.05), skin),
    part(G.dome, TRS(0, 0.05, 0.035, 0, 0, 0, 0.033, 0.025, 0.028), skin),
  ];
  for (const sx of [-1, 1]) {
    parts.push(part(G.dome, TRS(sx * 0.018, 0.068, 0.04, 0, 0, 0, 0.012, 0.012, 0.012), 0xe8d24a));
    parts.push(part(G.trunkEven, TRS(sx * 0.042, 0.022, -0.028, -0.5, 0, sx * 0.7, 0.008, 0.055, 0.008), skin));
    parts.push(part(G.trunkEven, TRS(sx * 0.038, 0.016, 0.028, 0.3, 0, sx * 0.9, 0.006, 0.035, 0.006), skin));
  }
  return meshFrom(parts);
}

function snailMesh() {
  const parts = [
    part(G.dome, TRS(0, 0.014, 0, 0, 0, 0, 0.016, 0.012, 0.055), 0xbfae95),
    part(G.dome, TRS(0, 0.03, -0.01, 0, 0.6, 0, 0.032, 0.03, 0.032), 0x8a6a3c),
    part(G.dome, TRS(0, 0.032, -0.008, 0, 0.6, 0, 0.02, 0.02, 0.02), 0xa88a55),
  ];
  for (const sx of [-1, 1]) {
    parts.push(part(G.trunkEven, TRS(sx * 0.006, 0.026, 0.05, -0.35, 0, sx * 0.2, 0.0025, 0.026, 0.0025), 0xbfae95));
  }
  return meshFrom(parts);
}

function fishMesh() {
  const skin = pick([0x6b7a6a, 0x7a7358, 0x5c6b74]);
  const parts = [
    part(G.dome, TRS(0, 0, 0, 0, 0, 0, 0.035, 0.05, 0.11), skin),
    part(G.cone, TRS(0, 0, -0.14, Math.PI / 2, 0, 0, 0.06, 0.07, 0.012), skin),
    part(G.cone, TRS(0, 0.055, -0.01, 0, 0, 0, 0.05, 0.035, 0.012), skin),
  ];
  return meshFrom(parts);
}

function webMesh() {
  const pts = [];
  const R = 0.45;
  const spokes = 10;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    pts.push(0, 0, 0, Math.cos(a) * R, Math.sin(a) * R, 0);
  }
  for (let ring = 1; ring <= 4; ring++) {
    const r = (ring / 4) * R;
    for (let i = 0; i < spokes; i++) {
      const a1 = (i / spokes) * Math.PI * 2;
      const a2 = ((i + 1) / spokes) * Math.PI * 2;
      pts.push(Math.cos(a1) * r, Math.sin(a1) * r, 0, Math.cos(a2) * r, Math.sin(a2) * r, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xe8f0f2, transparent: true, opacity: 0.3 });
  const web = new THREE.LineSegments(geo, mat);
  web.userData.geo = geo;
  web.userData.mat = mat;
  return web;
}

// ---------- species tables ----------

const GROUND_SPECIES = [
  {
    key: 'boar', count: 4, wanderSpeed: 1.1, fleeSpeed: 6.2, detect: 16, panic: 9, forageBias: 0.55,
    model: () => quadruped({
      bodyLen: 0.62, bodyH: 0.36, bodyW: 0.3, legLen: 0.34, legR: 0.06,
      neck: 0.16, headR: 0.2, tail: 0.16, snout: true,
      colorBody: 0x3b3129, colorLeg: 0x2a231d, colorHead: 0x322a23,
    }),
  },
  {
    key: 'muntjac', count: 6, wanderSpeed: 1.0, fleeSpeed: 7.4, detect: 22, panic: 14, forageBias: 0.5,
    model: () => quadruped({
      bodyLen: 0.48, bodyH: 0.28, bodyW: 0.21, legLen: 0.42, legR: 0.037,
      neck: 0.24, headR: 0.14, tail: 0.12, snout: true,
      colorBody: 0x8a5a33, colorLeg: 0x6d4526, colorHead: 0x94643a,
    }),
  },
  {
    key: 'macaque', count: 7, wanderSpeed: 1.3, fleeSpeed: 4.6, detect: 14, panic: 5, forageBias: 0.45,
    troop: true, observe: true,
    model: () => quadruped({
      bodyLen: 0.4, bodyH: 0.28, bodyW: 0.22, legLen: 0.3, legR: 0.045,
      neck: 0.14, headR: 0.16, tail: 0.42, snout: true,
      colorBody: 0x7d7263, colorLeg: 0x6a6055, colorHead: 0x8d8172,
    }),
  },
  {
    key: 'bear', count: 1, wanderSpeed: 0.9, fleeSpeed: 3.2, detect: 26, panic: 0, forageBias: 0.6,
    safeDistance: 18,
    model: () => quadruped({
      bodyLen: 0.95, bodyH: 0.62, bodyW: 0.5, legLen: 0.42, legR: 0.11,
      neck: 0.2, headR: 0.3, tail: 0.1, snout: true,
      colorBody: 0x191817, colorLeg: 0x131211, colorHead: 0x1d1c1a,
      chestMark: 0xd8d3c4,
    }),
  },
  {
    key: 'squirrel', count: 6, wanderSpeed: 1.6, fleeSpeed: 5.5, detect: 12, panic: 7, forageBias: 0.6,
    model: () => quadruped({
      bodyLen: 0.14, bodyH: 0.1, bodyW: 0.08, legLen: 0.07, legR: 0.017,
      neck: 0.05, headR: 0.055, tail: 0.16, snout: true, bushyTail: true,
      colorBody: 0x7a4a2a, colorLeg: 0x633c22, colorHead: 0x84532f,
    }),
  },
  {
    key: 'civet', count: 2, wanderSpeed: 1.0, fleeSpeed: 5.0, detect: 15, panic: 8, forageBias: 0.55,
    model: () => quadruped({
      bodyLen: 0.36, bodyH: 0.18, bodyW: 0.15, legLen: 0.18, legR: 0.03,
      neck: 0.1, headR: 0.1, tail: 0.34, snout: true, faceMark: 0xe4dece,
      colorBody: 0x4a4038, colorLeg: 0x322b25, colorHead: 0x3d352e,
    }),
  },
  {
    key: 'hare', count: 4, wanderSpeed: 1.2, fleeSpeed: 7.8, detect: 18, panic: 11, forageBias: 0.65,
    model: () => quadruped({
      bodyLen: 0.22, bodyH: 0.15, bodyW: 0.11, legLen: 0.12, legR: 0.022,
      neck: 0.06, headR: 0.075, tail: 0.05, snout: true, earLen: 2.4,
      colorBody: 0x8a7a5f, colorLeg: 0x6f6250, colorHead: 0x93836a,
    }),
  },
  {
    key: 'pheasant', count: 3, wanderSpeed: 0.9, fleeSpeed: 5.2, detect: 17, panic: 9, forageBias: 0.7,
    model: () => groundBird({
      bodyLen: 0.2, bodyR: 0.12, legLen: 0.16, tailLen: 0.34,
      colorBody: 0x27384f, colorHead: 0x1d2c40, colorTail: 0x2f4a66,
      beak: 0xcbb46a, crest: 0xe8e2d0,
    }),
  },
];

const BIRD_COLORS = [
  { body: 0x4a6b3a, wing: 0x3f5c32, head: 0x5c7a45 },
  { body: 0x7a5a3a, wing: 0x63482e, head: 0x8a6a45 },
  { body: 0x3f5a6b, wing: 0x33495a, head: 0x4a6b7d },
  { body: 0x8a7a4a, wing: 0x6f6238, head: 0x9a8a5a },
  { body: 0x6b3f3f, wing: 0x5a3333, head: 0x7d4a4a },
];
const BUTTERFLY_COLORS = [0xe8913f, 0xf0d24a, 0x5a7fd8, 0xe86fa8, 0xf5f0e0, 0x8a4fd8];

const FLYER_SPECIES = [
  {
    key: 'eagle', count: 2, speed: 7.5, turn: 0.5, alt: [26, 46], range: 90, flap: 1.6, flapAmp: 0.22,
    model: () => flyer({
      bodyLen: 0.34, bodyR: 0.13, colorBody: 0x4a3a29,
      wingSpan: 1.05, wingChord: 0.33, colorWing: 0x5a4632, tailFan: true,
      head: 0x6a5540, beak: 0xd8b03a,
    }),
  },
  {
    key: 'smallbird', count: 10, speed: 4.2, turn: 2.2, alt: [3.5, 11], range: 34, flap: 7, flapAmp: 0.75,
    model: () => {
      const c = pick(BIRD_COLORS);
      return flyer({
        bodyLen: 0.1, bodyR: 0.045, colorBody: c.body,
        wingSpan: 0.24, wingChord: 0.1, colorWing: c.wing, tailFan: true,
        head: c.head, beak: 0xd8a03a,
      });
    },
  },
  {
    key: 'butterfly', count: 12, speed: 1.5, turn: 3.2, alt: [0.5, 2.0], range: 14, flap: 11, flapAmp: 1.1,
    model: () => flyer({
      bodyLen: 0.05, bodyR: 0.018, colorBody: 0x2b2620,
      wingSpan: 0.13, wingChord: 0.11, colorWing: pick(BUTTERFLY_COLORS), wingOpacity: 0.92,
    }),
  },
  {
    key: 'dragonfly', count: 7, speed: 3.4, turn: 4.0, alt: [0.8, 2.6], range: 18, flap: 26, flapAmp: 0.5,
    model: () => flyer({
      bodyLen: 0.13, bodyR: 0.017, colorBody: pick([0x2f6d5a, 0x6d2f3a, 0x2f4a6d]),
      wingSpan: 0.15, wingChord: 0.045, colorWing: 0xd8ecf5, wingOpacity: 0.45, wingPairs: 2,
    }),
  },
  {
    key: 'bee', count: 5, speed: 2.2, turn: 4.5, alt: [0.6, 2.2], range: 10, flap: 34, flapAmp: 0.55,
    model: () => flyer({
      bodyLen: 0.035, bodyR: 0.016, colorBody: 0xd8a82a,
      wingSpan: 0.05, wingChord: 0.03, colorWing: 0xeef4f7, wingOpacity: 0.5,
    }),
  },
];

const CRAWLER_SPECIES = [
  { key: 'snake', count: 3, model: snakeMesh, speed: 0.7, lift: 0.03, weave: 0.28 },
  { key: 'spider', count: 4, model: spiderMesh, speed: 0.45, lift: 0 },
  { key: 'beetle', count: 4, model: beetleMesh, speed: 0.35, lift: 0 },
  { key: 'grasshopper', count: 7, model: grasshopperMesh, speed: 0.8, lift: 0, hop: 0.28 },
  { key: 'lizard', count: 4, model: lizardMesh, speed: 1.1, lift: 0, darty: true },
  { key: 'frog', count: 5, model: frogMesh, speed: 0.6, lift: 0, hop: 0.22, nearWater: true },
  { key: 'snail', count: 3, model: snailMesh, speed: 0.06, lift: 0 },
];

const FISH_COUNT = 8;

const DESPAWN = 150;
const SPAWN_MIN = 40;
const SPAWN_MAX = 100;

function randomAround(px, pz, min, max) {
  const a = Math.random() * Math.PI * 2;
  const r = min + Math.random() * (max - min);
  return { x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r };
}

// Rejection-sample a spot the predicate is happy with; null if none turns up.
function findSpot(px, pz, min, max, predicate, tries = 26) {
  for (let i = 0; i < tries; i++) {
    const p = randomAround(px, pz, min, max);
    if (predicate(p.x, p.z)) return p;
  }
  return null;
}

function angleTo(fromX, fromZ, toX, toZ) {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

function turnToward(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + THREE.MathUtils.clamp(diff, -maxStep, maxStep);
}

const _s = { ground: 0, water: 0, river: 0, swamp: 0 };
const isDeepEnough = (x, z) => {
  sampleTerrain(x, z, _s);
  return _s.water - _s.ground > 0.3;
};
const isNearWater = (x, z) => {
  sampleTerrain(x, z, _s);
  return _s.ground >= _s.water && _s.ground - _s.water < 1.2;
};

export class Fauna {
  constructor(scene) {
    this.scene = scene;
    this.ground = [];
    this.flyers = [];
    this.crawlers = [];
    this.fish = [];
    this.webs = [];
    this.time = 0;

    for (const spec of GROUND_SPECIES) {
      for (let i = 0; i < spec.count; i++) {
        const group = spec.model();
        scene.add(group);
        this.ground.push({
          spec, group, state: 'wander', stateT: Math.random() * 4,
          heading: Math.random() * Math.PI * 2, speed: 0, bob: Math.random() * 6,
          x: 0, z: 0, placed: false,
        });
      }
    }

    for (const spec of FLYER_SPECIES) {
      for (let i = 0; i < spec.count; i++) {
        const group = spec.model();
        scene.add(group);
        this.flyers.push({
          spec, group, heading: Math.random() * Math.PI * 2,
          x: 0, z: 0, y: 0, targetX: 0, targetZ: 0, targetY: 0,
          phase: Math.random() * 10, placed: false,
        });
      }
    }

    for (const spec of CRAWLER_SPECIES) {
      for (let i = 0; i < spec.count; i++) {
        const group = spec.model();
        scene.add(group);
        this.crawlers.push({
          spec, group, heading: Math.random() * Math.PI * 2,
          x: 0, z: 0, t: Math.random() * 5, phase: Math.random() * 6,
          speed: 0, placed: false,
        });
      }
    }

    for (let i = 0; i < FISH_COUNT; i++) {
      const group = fishMesh();
      group.visible = false;
      scene.add(group);
      this.fish.push({
        group, heading: Math.random() * Math.PI * 2, x: 0, z: 0,
        t: Math.random() * 3, phase: Math.random() * 6, placed: false,
      });
    }

    for (let i = 0; i < 3; i++) {
      const web = webMesh();
      const spider = spiderMesh();
      spider.scale.setScalar(1.2);
      scene.add(web, spider);
      this.webs.push({ web, spider, x: 0, z: 0, y: 0, yaw: 0, phase: Math.random() * 6, placed: false });
    }
  }

  relocateGround(a, px, pz) {
    const p = randomAround(px, pz, SPAWN_MIN, SPAWN_MAX);
    a.x = p.x; a.z = p.z;
    a.heading = Math.random() * Math.PI * 2;
    a.state = 'wander';
    a.placed = true;
  }

  relocateFlyer(f, px, pz) {
    const p = randomAround(px, pz, SPAWN_MIN * 0.4, SPAWN_MAX);
    f.x = p.x; f.z = p.z;
    f.y = walkHeightAt(f.x, f.z) + f.spec.alt[0];
    this.pickFlyerTarget(f);
    f.placed = true;
  }

  pickFlyerTarget(f) {
    const s = f.spec;
    const a = Math.random() * Math.PI * 2;
    const r = s.range * (0.35 + Math.random() * 0.65);
    f.targetX = f.x + Math.cos(a) * r;
    f.targetZ = f.z + Math.sin(a) * r;
    f.targetY = walkHeightAt(f.targetX, f.targetZ) + s.alt[0] + Math.random() * (s.alt[1] - s.alt[0]);
  }

  relocateCrawler(c, px, pz) {
    const p = c.spec.nearWater
      ? (findSpot(px, pz, 6, 45, isNearWater) || randomAround(px, pz, 6, 32))
      : randomAround(px, pz, 6, 32);
    c.x = p.x; c.z = p.z;
    c.heading = Math.random() * Math.PI * 2;
    c.placed = true;
  }

  relocateFish(f, px, pz) {
    const p = findSpot(px, pz, 4, 55, isDeepEnough, 36);
    if (!p) {
      f.group.visible = false;
      f.placed = false;
      return;
    }
    f.x = p.x; f.z = p.z;
    f.heading = Math.random() * Math.PI * 2;
    f.group.visible = true;
    f.placed = true;
  }

  relocateWeb(w, px, pz) {
    const p = randomAround(px, pz, 8, 28);
    w.x = p.x; w.z = p.z;
    w.y = walkHeightAt(w.x, w.z) + 1.1 + Math.random() * 0.7;
    w.yaw = Math.random() * Math.PI * 2;
    w.placed = true;
  }

  update(dt, player) {
    this.time += dt;
    this.updateGround(dt, player.x, player.z);
    this.updateFlyers(dt, player.x, player.z);
    this.updateCrawlers(dt, player.x, player.z);
    this.updateFish(dt, player.x, player.z);
    this.updateWebs(player.x, player.z);
  }

  updateGround(dt, px, pz) {
    for (const a of this.ground) {
      const s = a.spec;
      if (!a.placed) this.relocateGround(a, px, pz);

      const dist = Math.hypot(a.x - px, a.z - pz);
      if (dist > DESPAWN) {
        this.relocateGround(a, px, pz);
        continue;
      }

      a.stateT -= dt;

      if (s.safeDistance) {
        // The bear is not afraid, but it keeps its distance rather than
        // letting the player walk right up to it.
        if (dist < s.safeDistance) {
          a.state = 'retreat';
          a.heading = angleTo(px, pz, a.x, a.z);
        } else if (a.state === 'retreat') {
          a.state = 'wander';
          a.stateT = 3 + Math.random() * 4;
        }
      } else if (dist < s.panic) {
        a.state = 'flee';
        a.heading = angleTo(px, pz, a.x, a.z) + (Math.random() - 0.5) * 0.6;
        a.stateT = 2.5 + Math.random() * 2;
      } else if (dist < s.detect) {
        if (a.state !== 'flee') {
          a.state = s.observe ? 'observe' : 'alert';
          a.heading = turnToward(a.heading, angleTo(a.x, a.z, px, pz), 3 * dt);
        }
      } else if (a.stateT <= 0) {
        a.state = Math.random() < s.forageBias ? 'forage' : 'wander';
        a.stateT = 3 + Math.random() * 6;
        if (a.state === 'wander') a.heading += (Math.random() - 0.5) * 2.2;
      }

      let target = 0;
      switch (a.state) {
        case 'flee':
          target = s.fleeSpeed;
          if (a.stateT <= 0 && dist > s.detect) { a.state = 'alert'; a.stateT = 2; }
          break;
        case 'retreat':
          target = s.fleeSpeed * 0.75;
          break;
        case 'observe':
          target = dist < 6 ? s.wanderSpeed * 1.4 : 0;
          if (dist < 6) a.heading = angleTo(px, pz, a.x, a.z);
          break;
        case 'alert':
          target = 0;
          if (a.stateT <= 0) { a.state = 'wander'; a.stateT = 3 + Math.random() * 4; }
          break;
        case 'forage':
          target = s.wanderSpeed * 0.25;
          a.heading += (Math.random() - 0.5) * dt;
          break;
        default:
          target = s.wanderSpeed;
          a.heading += (Math.random() - 0.5) * dt * 0.8;
      }

      a.speed += (target - a.speed) * Math.min(1, dt * 3.5);
      a.x += Math.sin(a.heading) * a.speed * dt;
      a.z += Math.cos(a.heading) * a.speed * dt;

      a.bob += dt * (2 + a.speed * 2.4);
      const gait = a.speed > 0.15 ? Math.abs(Math.sin(a.bob)) * 0.05 : 0;
      const graze = a.state === 'forage' ? -0.06 : 0;

      a.group.position.set(a.x, walkHeightAt(a.x, a.z) + gait + graze, a.z);
      a.group.rotation.y = a.heading;
      a.group.rotation.x = a.state === 'forage' ? 0.16 : -Math.min(a.speed * 0.02, 0.1);
    }
  }

  updateFlyers(dt, px, pz) {
    for (const f of this.flyers) {
      const s = f.spec;
      if (!f.placed) this.relocateFlyer(f, px, pz);

      if (Math.hypot(f.x - px, f.z - pz) > DESPAWN) {
        this.relocateFlyer(f, px, pz);
        continue;
      }

      if (Math.hypot(f.targetX - f.x, f.targetZ - f.z) < 2.5) this.pickFlyerTarget(f);

      f.heading = turnToward(f.heading, angleTo(f.x, f.z, f.targetX, f.targetZ), s.turn * dt);
      const speed = s.speed * (0.75 + 0.25 * Math.sin(this.time * 0.8 + f.phase));
      f.x += Math.sin(f.heading) * speed * dt;
      f.z += Math.cos(f.heading) * speed * dt;
      f.y += (f.targetY - f.y) * Math.min(1, dt * 0.9);

      const minY = walkHeightAt(f.x, f.z) + s.alt[0] * 0.6;
      if (f.y < minY) f.y = minY;

      f.group.position.set(f.x, f.y, f.z);
      f.group.rotation.y = f.heading;

      const flap = Math.sin(this.time * s.flap + f.phase) * s.flapAmp;
      for (const [l, r] of f.group.userData.wings) {
        l.rotation.z = flap;
        r.rotation.z = -flap;
      }
    }
  }

  updateCrawlers(dt, px, pz) {
    for (const c of this.crawlers) {
      const s = c.spec;
      if (!c.placed) this.relocateCrawler(c, px, pz);

      const dist = Math.hypot(c.x - px, c.z - pz);
      if (dist > 60) {
        this.relocateCrawler(c, px, pz);
        continue;
      }

      c.t -= dt;
      // startled by a close approach, otherwise a slow aimless crawl
      if (dist < 3) {
        c.speed = s.speed * (s.darty ? 6 : 4.5);
        c.heading = angleTo(px, pz, c.x, c.z);
      } else if (c.t <= 0) {
        c.heading += (Math.random() - 0.5) * 2.4;
        c.t = 2 + Math.random() * 4;
        c.speed = Math.random() < 0.3 ? 0 : s.speed;
      }

      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      c.phase += dt * (3 + c.speed * 5);

      // hoppers arc off the ground instead of gliding along it
      const hop = s.hop && c.speed > 0.05
        ? Math.max(0, Math.sin(c.phase * 1.6)) * s.hop
        : 0;
      c.group.position.set(c.x, walkHeightAt(c.x, c.z) + s.lift + hop, c.z);
      c.group.rotation.y = c.heading + (s.weave ? Math.sin(c.phase) * s.weave : Math.sin(c.phase) * 0.08);
      if (s.hop) c.group.rotation.x = -hop * 0.9;
    }
  }

  updateFish(dt, px, pz) {
    for (const f of this.fish) {
      if (!f.placed) {
        this.relocateFish(f, px, pz);
        if (!f.placed) continue;
      }
      if (Math.hypot(f.x - px, f.z - pz) > 70) {
        this.relocateFish(f, px, pz);
        continue;
      }

      f.t -= dt;
      if (f.t <= 0) {
        f.heading += (Math.random() - 0.5) * 1.6;
        f.t = 1 + Math.random() * 2.5;
      }

      const speed = 0.9 + Math.sin(this.time * 2 + f.phase) * 0.3;
      const nx = f.x + Math.sin(f.heading) * speed * dt;
      const nz = f.z + Math.cos(f.heading) * speed * dt;
      // turn back rather than beaching itself
      if (isDeepEnough(nx, nz)) {
        f.x = nx;
        f.z = nz;
      } else {
        f.heading += 2.2;
      }

      sampleTerrain(f.x, f.z, _s);
      f.group.position.set(f.x, _s.water - 0.18, f.z);
      f.group.rotation.y = f.heading + Math.sin(this.time * 6 + f.phase) * 0.18;
    }
  }

  updateWebs(px, pz) {
    for (const w of this.webs) {
      if (!w.placed) this.relocateWeb(w, px, pz);
      if (Math.hypot(w.x - px, w.z - pz) > 70) this.relocateWeb(w, px, pz);

      w.web.position.set(w.x, w.y, w.z);
      w.web.rotation.y = w.yaw;
      const sway = Math.sin(this.time * 1.3 + w.phase) * 0.035;
      w.spider.position.set(
        w.x + Math.cos(w.yaw) * sway,
        w.y + Math.sin(this.time * 0.9 + w.phase) * 0.03,
        w.z - Math.sin(w.yaw) * sway
      );
      w.spider.rotation.y = w.yaw;
    }
  }
}
