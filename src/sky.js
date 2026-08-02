// Sky dome, visible sun, drifting clouds, and the sunlight rig whose shadow
// camera follows the player so shadows stay crisp anywhere in the endless world.

import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(0.42, 0.68, 0.6).normalize();

const HORIZON = new THREE.Color(0xc9dff0);
const ZENITH = new THREE.Color(0x4d92d6);

function cloudTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, 'rgba(255,248,214,1)');
  g.addColorStop(0.18, 'rgba(255,240,190,0.55)');
  g.addColorStop(0.5, 'rgba(255,232,170,0.16)');
  g.addColorStop(1, 'rgba(255,225,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    // --- gradient dome, drawn behind everything and never fogged ---
    const domeGeo = new THREE.SphereGeometry(600, 24, 14);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        horizon: { value: HORIZON },
        zenith: { value: ZENITH },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 horizon;
        uniform vec3 zenith;
        varying vec3 vDir;
        void main() {
          float t = clamp(vDir.y * 1.15 + 0.08, 0.0, 1.0);
          gl_FragColor = vec4(mix(horizon, zenith, pow(t, 0.75)), 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(domeGeo, domeMat);
    this.dome.renderOrder = -2;
    scene.add(this.dome);

    // --- the sun itself: a bright disc plus a soft additive halo ---
    this.sunGroup = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(11, 32),
      new THREE.MeshBasicMaterial({ color: 0xfffdf0, fog: false, depthWrite: false, transparent: true })
    );
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
        transparent: true,
      })
    );
    halo.scale.set(150, 150, 1);
    this.sunGroup.add(halo, disc);
    this.sunGroup.renderOrder = -1;
    this.sunDisc = disc;
    scene.add(this.sunGroup);

    // --- clouds ---
    const tex = cloudTexture();
    this.cloudMat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.85,
    });
    this.clouds = new THREE.Group();
    this.clouds.renderOrder = -1;
    const rand = (a, b) => a + Math.random() * (b - a);
    this.cloudData = [];
    for (let i = 0; i < 26; i++) {
      const cluster = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 4);
      const w = rand(45, 105);
      for (let p = 0; p < puffs; p++) {
        const s = new THREE.Sprite(this.cloudMat);
        const sc = rand(w * 0.5, w);
        s.scale.set(sc, sc * rand(0.42, 0.62), 1);
        s.position.set(rand(-w * 0.7, w * 0.7), rand(-w * 0.08, w * 0.08), rand(-w * 0.35, w * 0.35));
        cluster.add(s);
      }
      cluster.position.set(rand(-460, 460), rand(120, 210), rand(-460, 460));
      this.clouds.add(cluster);
      this.cloudData.push({ cluster, speed: rand(0.9, 2.4) });
    }
    scene.add(this.clouds);

    // --- sunlight + ambient fill ---
    this.light = new THREE.DirectionalLight(0xfff2d2, 1.45);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.bias = -0.0009;
    this.light.shadow.normalBias = 0.035;
    const cam = this.light.shadow.camera;
    cam.left = -45; cam.right = 45; cam.top = 45; cam.bottom = -45;
    cam.near = 1; cam.far = 320;
    cam.updateProjectionMatrix();
    scene.add(this.light);
    scene.add(this.light.target);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x35461f, 0.62);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(this.ambient);
  }

  update(dt, player, camera) {
    this.time += dt;

    // Everything sky-side rides along with the player so it never runs out.
    this.dome.position.copy(player);

    this.sunGroup.position.copy(player).addScaledVector(SUN_DIR, 480);
    this.sunDisc.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));

    this.clouds.position.set(player.x, 0, player.z);
    for (const c of this.cloudData) {
      c.cluster.position.x += c.speed * dt;
      if (c.cluster.position.x > 480) c.cluster.position.x -= 960;
    }

    // Keep the shadow volume centred just ahead of the player.
    this.light.position.copy(player).addScaledVector(SUN_DIR, 130);
    this.light.target.position.copy(player);
    this.light.target.updateMatrixWorld();
  }
}
