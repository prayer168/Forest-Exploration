// The living forest: ground mammals with a wander / forage / alert / flee state
// machine, free-roaming flyers, and small crawlers. Animals are recycled around
// the player so the endless forest always has residents.

import * as THREE from 'three';
import { walkHeightAt } from './terrain.js';
import { G, TRS, bakeParts } from './flora.js';

const BODY_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.85, flatShading: true,
});

const _v = new THREE.Vector3();

function part(geo, matrix, hex) {
  return { geo, matrix, color: new THREE.Color(hex) };
}

// ---------- models ----------
// Each returns a THREE.Group whose body is a single merged mesh; limbs that
// need to animate (wings) stay separate.

function quadrupedMesh({ bodyLen, bodyH, bodyW, legLen, legR, neck, headR, tail, snout, colorBody, colorLeg, colorHead, chestMark }) {
  const parts = [];
  const bodyY = legLen + bodyH * 0.5;
  parts.push(part(G.dome, TRS(0, bodyY, 0, 0, 0, 0, bodyW, bodyH, bodyLen), colorBody));

  // legs at the four corners
  const lx = bodyW * 0.62;
  const lz = bodyLen * 0.6;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(part(G.trunkEven, TRS(sx * lx, legLen * 0.5, sz * lz, 0, 0, 0, legR, legLen, legR), colorLeg));
    }
  }

  // neck and head lean forward over the shoulders
  const headY = bodyY + neck * 0.75;
  const headZ = bodyLen * 0.85;
  parts.push(part(G.trunkEven, TRS(0, bodyY + neck * 0.35, bodyLen * 0.5, -0.6, 0, 0, legR * 1.5, neck, legR * 1.5), colorBody));
  parts.push(part(G.dome, TRS(0, headY, headZ, 0, 0, 0, headR, headR, headR * 1.25), colorHead));
  if (snout) {
    parts.push(part(G.dome, TRS(0, headY - headR * 0.25, headZ + headR * 1.1, 0, 0, 0, headR * 0.5, headR * 0.45, headR * 0.75), colorHead));
  }
  // ears
  for (const sx of [-1, 1]) {
    parts.push(part(G.cone, TRS(sx * headR * 0.6, headY + headR * 0.85, headZ - headR * 0.15, 0, 0, sx * 0.25, headR * 0.3, headR * 0.7, headR * 0.2), colorHead));
  }
  if (tail) {
    parts.push(part(G.trunkEven, TRS(0, bodyY + bodyH * 0.35, -bodyLen * 0.95, 0.8, 0, 0, legR * 0.7, tail, legR * 0.7), colorBody));
  }
  if (chestMark) {
    parts.push(part(G.dome, TRS(0, bodyY + bodyH * 0.1, bodyLen * 0.72, 0, 0, 0, bodyW * 0.45, bodyH * 0.42, bodyLen * 0.16), chestMark));
  }

  const geo = bakeParts(parts);
  const mesh = new THREE.Mesh(geo, BODY_MAT);
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.geo = geo;
  return group;
}

const MODELS = {
  boar: () => quadrupedMesh({
    bodyLen: 0.62, bodyH: 0.36, bodyW: 0.3, legLen: 0.34, legR: 0.06,
    neck: 0.16, headR: 0.2, tail: 0.16, snout: true,
    colorBody: 0x3b3129, colorLeg: 0x2a231d, colorHead: 0x322a23,
  }),
  muntjac: () => quadrupedMesh({
    bodyLen: 0.48, bodyH: 0.28, bodyW: 0.21, legLen: 0.42, legR: 0.037,
    neck: 0.24, headR: 0.14, tail: 0.12, snout: true,
    colorBody: 0x8a5a33, colorLeg: 0x6d4526, colorHead: 0x94643a,
  }),
  macaque: () => quadrupedMesh({
    bodyLen: 0.4, bodyH: 0.28, bodyW: 0.22, legLen: 0.3, legR: 0.045,
    neck: 0.14, headR: 0.16, tail: 0.42, snout: true,
    colorBody: 0x7d7263, colorLeg: 0x6a6055, colorHead: 0x8d8172,
  }),
  bear: () => quadrupedMesh({
    bodyLen: 0.95, bodyH: 0.62, bodyW: 0.5, legLen: 0.42, legR: 0.11,
    neck: 0.2, headR: 0.3, tail: 0.1, snout: true,
    colorBody: 0x191817, colorLeg: 0x131211, colorHead: 0x1d1c1a,
    chestMark: 0xd8d3c4,
  }),
};

function flyerMesh({ bodyLen, bodyR, colorBody, wingSpan, wingChord, colorWing, wingOpacity = 1, tailFan }) {
  const group = new THREE.Group();
  const parts = [part(G.dome, TRS(0, 0, 0, 0, 0, 0, bodyR, bodyR, bodyLen), colorBody)];
  if (tailFan) {
    parts.push(part(G.cone, TRS(0, 0, -bodyLen * 1.1, Math.PI / 2, 0, 0, bodyR * 2.2, bodyLen * 0.7, bodyR * 0.35), colorBody));
  }
  const geo = bakeParts(parts);
  const body = new THREE.Mesh(geo, BODY_MAT);
  body.castShadow = true;
  group.add(body);
  group.userData.geo = geo;

  const wingGeo = new THREE.PlaneGeometry(wingSpan, wingChord);
  wingGeo.translate(wingSpan / 2, 0, 0);
  wingGeo.rotateX(-Math.PI / 2);
  const wingMat = new THREE.MeshStandardMaterial({
    color: colorWing, side: THREE.DoubleSide, roughness: 0.9,
    transparent: wingOpacity < 1, opacity: wingOpacity,
  });
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.rotation.y = Math.PI;
  group.add(wingL, wingR);
  group.userData.wings = [wingL, wingR];
  group.userData.wingGeo = wingGeo;
  group.userData.wingMat = wingMat;
  return group;
}

const FLYER_MODELS = {
  eagle: () => flyerMesh({
    bodyLen: 0.34, bodyR: 0.13, colorBody: 0x4a3a29,
    wingSpan: 1.05, wingChord: 0.33, colorWing: 0x5a4632, tailFan: true,
  }),
  butterfly: () => flyerMesh({
    bodyLen: 0.05, bodyR: 0.018, colorBody: 0x2b2620,
    wingSpan: 0.13, wingChord: 0.11, colorWing: 0xe8913f, wingOpacity: 0.92,
  }),
  dragonfly: () => flyerMesh({
    bodyLen: 0.13, bodyR: 0.017, colorBody: 0x2f6d5a,
    wingSpan: 0.15, wingChord: 0.045, colorWing: 0xd8ecf5, wingOpacity: 0.45,
  }),
};

function snakeMesh() {
  const parts = [];
  const segs = 7;
  const skin = 0x4a5a2c;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const r = 0.055 * (1 - t * 0.55);
    parts.push(part(G.dome, TRS(0, 0, -t * 0.85, 0, 0, 0, r, r * 0.75, 0.09), i === 0 ? 0x5c6b34 : skin));
  }
  const geo = bakeParts(parts);
  const mesh = new THREE.Mesh(geo, BODY_MAT);
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.geo = geo;
  return group;
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
        0.3, sx * a, sx * 1.1,
        0.006, 0.11, 0.006
      ), 0x1c1815));
    }
  }
  const geo = bakeParts(parts);
  const mesh = new THREE.Mesh(geo, BODY_MAT);
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.geo = geo;
  return group;
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
  const geo = bakeParts(parts);
  const mesh = new THREE.Mesh(geo, BODY_MAT);
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.geo = geo;
  return group;
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

// ---------- species behaviour ----------

const GROUND_SPECIES = [
  {
    key: 'boar', model: MODELS.boar, count: 4,
    wanderSpeed: 1.1, fleeSpeed: 6.2, detect: 16, panic: 9,
    forageBias: 0.55, eye: 0,
  },
  {
    key: 'muntjac', model: MODELS.muntjac, count: 5,
    wanderSpeed: 1.0, fleeSpeed: 7.4, detect: 22, panic: 14,
    forageBias: 0.5, eye: 0,
  },
  {
    key: 'macaque', model: MODELS.macaque, count: 6,
    wanderSpeed: 1.3, fleeSpeed: 4.6, detect: 14, panic: 5,
    forageBias: 0.45, eye: 0, troop: true, observe: true,
  },
  {
    key: 'bear', model: MODELS.bear, count: 1,
    wanderSpeed: 0.9, fleeSpeed: 3.2, detect: 26, panic: 0,
    forageBias: 0.6, eye: 0, safeDistance: 18,
  },
];

const FLYER_SPECIES = [
  { key: 'eagle', model: FLYER_MODELS.eagle, count: 2, speed: 7.5, turn: 0.5, alt: [26, 46], range: 90, flap: 1.6, flapAmp: 0.22, scale: 1 },
  { key: 'butterfly', model: FLYER_MODELS.butterfly, count: 16, speed: 1.5, turn: 3.2, alt: [0.5, 2.0], range: 14, flap: 11, flapAmp: 1.1, scale: 1 },
  { key: 'dragonfly', model: FLYER_MODELS.dragonfly, count: 9, speed: 3.4, turn: 4.0, alt: [0.8, 2.6], range: 18, flap: 26, flapAmp: 0.5, scale: 1 },
];

const CRAWLER_SPECIES = [
  { key: 'snake', model: snakeMesh, count: 3, speed: 0.7, turn: 1.2, lift: 0.03 },
  { key: 'spider', model: spiderMesh, count: 4, speed: 0.45, turn: 2.5, lift: 0.0 },
  { key: 'beetle', model: beetleMesh, count: 5, speed: 0.35, turn: 2.0, lift: 0.0 },
];

const DESPAWN = 150;
const SPAWN_MIN = 45;
const SPAWN_MAX = 105;

function randomAround(px, pz, min, max) {
  const a = Math.random() * Math.PI * 2;
  const r = min + Math.random() * (max - min);
  return { x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r };
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

export class Fauna {
  constructor(scene) {
    this.scene = scene;
    this.ground = [];
    this.flyers = [];
    this.crawlers = [];
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
          x: 0, z: 0, t: Math.random() * 5, phase: Math.random() * 6, placed: false,
        });
      }
    }

    // a couple of orb weavers sitting on their webs
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
    const p = randomAround(px, pz, 6, 32);
    c.x = p.x; c.z = p.z;
    c.heading = Math.random() * Math.PI * 2;
    c.placed = true;
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
    const px = player.x;
    const pz = player.z;

    this.updateGround(dt, px, pz);
    this.updateFlyers(dt, px, pz);
    this.updateCrawlers(dt, px, pz);
    this.updateWebs(px, pz);
  }

  updateGround(dt, px, pz) {
    for (const a of this.ground) {
      const s = a.spec;
      if (!a.placed) this.relocateGround(a, px, pz);

      const dx = a.x - px;
      const dz = a.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > DESPAWN) {
        this.relocateGround(a, px, pz);
        continue;
      }

      a.stateT -= dt;

      // --- state machine ---
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

      // --- movement per state ---
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

      const groundY = walkHeightAt(a.x, a.z);
      a.bob += dt * (2 + a.speed * 2.4);
      const gait = a.speed > 0.15 ? Math.abs(Math.sin(a.bob)) * 0.05 : 0;
      const graze = a.state === 'forage' ? -0.06 : 0;

      a.group.position.set(a.x, groundY + gait + graze, a.z);
      a.group.rotation.y = a.heading;
      // a foraging animal dips its head, a fleeing one leans into the run
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

      const toT = Math.hypot(f.targetX - f.x, f.targetZ - f.z);
      if (toT < 2.5) this.pickFlyerTarget(f);

      f.heading = turnToward(f.heading, angleTo(f.x, f.z, f.targetX, f.targetZ), s.turn * dt);
      const speed = s.speed * (0.75 + 0.25 * Math.sin(this.time * 0.8 + f.phase));
      f.x += Math.sin(f.heading) * speed * dt;
      f.z += Math.cos(f.heading) * speed * dt;
      f.y += (f.targetY - f.y) * Math.min(1, dt * 0.9);

      // never let a flyer clip into the canopy or the ground
      const minY = walkHeightAt(f.x, f.z) + s.alt[0] * 0.6;
      if (f.y < minY) f.y = minY;

      f.group.position.set(f.x, f.y, f.z);
      f.group.rotation.y = f.heading;

      const flap = Math.sin(this.time * s.flap + f.phase) * s.flapAmp;
      const wings = f.group.userData.wings;
      wings[0].rotation.z = flap;
      wings[1].rotation.z = -flap;
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
      let speed = s.speed;
      if (dist < 3) {
        speed = s.speed * 4.5;
        c.heading = angleTo(px, pz, c.x, c.z);
      } else if (c.t <= 0) {
        c.heading += (Math.random() - 0.5) * 2.4;
        c.t = 2 + Math.random() * 4;
        if (Math.random() < 0.3) speed = 0;
      }

      c.x += Math.sin(c.heading) * speed * dt;
      c.z += Math.cos(c.heading) * speed * dt;
      c.phase += dt * (3 + speed * 5);

      c.group.position.set(c.x, walkHeightAt(c.x, c.z) + s.lift, c.z);
      // snakes weave as they travel; the others just skitter
      c.group.rotation.y = c.heading + Math.sin(c.phase) * (s.key === 'snake' ? 0.28 : 0.08);
    }
  }

  updateWebs(px, pz) {
    for (const w of this.webs) {
      if (!w.placed) this.relocateWeb(w, px, pz);
      if (Math.hypot(w.x - px, w.z - pz) > 70) {
        this.relocateWeb(w, px, pz);
      }
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
