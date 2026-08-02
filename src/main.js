import * as THREE from 'three';
import { walkHeightAt } from './terrain.js';
import { ChunkManager } from './chunks.js';
import { Sky } from './sky.js';
import { Fauna } from './fauna.js';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 4.5;
const LOOK_SENSITIVITY = 0.0025;
const PITCH_LIMIT = Math.PI / 2 - 0.05;
const TURN_DEADZONE = 0.35;
const EDGE_TURN_SPEED = 1.5;
const WHEEL_MAX = WALK_SPEED * 1.8;

const scene = new THREE.Scene();
// Dense forest closes in fast — the haze also hides the streaming boundary,
// which sits at 80m in the worst case.
scene.fog = new THREE.Fog(0xc9dff0, 22, 78);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1200);

const yawObject = new THREE.Object3D();
const pitchObject = new THREE.Object3D();
pitchObject.add(camera);
yawObject.add(pitchObject);
yawObject.position.set(0, EYE_HEIGHT, 0);
scene.add(yawObject);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const sky = new Sky(scene);
const chunks = new ChunkManager(scene);
const fauna = new Fauna(scene);

// ---------- controls ----------
const instructions = document.getElementById('instructions');
const dismiss = () => instructions.classList.add('hidden');
instructions.addEventListener('click', dismiss);

let isDragging = false;
let pointerNX = 0;
let wheelVelocity = 0;

renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  isDragging = true;
  dismiss();
  renderer.domElement.style.cursor = 'grabbing';
});
window.addEventListener('mouseup', () => {
  isDragging = false;
  renderer.domElement.style.cursor = 'grab';
});
window.addEventListener('mousemove', (e) => {
  if (isDragging) {
    yawObject.rotation.y -= e.movementX * LOOK_SENSITIVITY;
    pitchObject.rotation.x -= e.movementY * LOOK_SENSITIVITY;
    pitchObject.rotation.x = THREE.MathUtils.clamp(pitchObject.rotation.x, -PITCH_LIMIT, PITCH_LIMIT);
  } else {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNX = THREE.MathUtils.clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
  }
});
renderer.domElement.addEventListener('mouseleave', () => { pointerNX = 0; });
renderer.domElement.style.cursor = 'grab';

renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  dismiss();
  wheelVelocity = THREE.MathUtils.clamp(wheelVelocity - e.deltaY * 0.012, -WHEEL_MAX, WHEEL_MAX);
}, { passive: false });

const move = { forward: false, backward: false, left: false, right: false };
const KEYS = {
  ArrowUp: 'forward', ArrowDown: 'backward', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'forward', KeyS: 'backward', KeyA: 'left', KeyD: 'right',
};
document.addEventListener('keydown', (e) => {
  const k = KEYS[e.code];
  if (k) { move[k] = true; dismiss(); }
});
document.addEventListener('keyup', (e) => {
  const k = KEYS[e.code];
  if (k) move[k] = false;
});

// ---------- loop ----------
const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

function resolveCollisions(x, z) {
  const colliders = chunks.collidersNear(x, z);
  let nx = x;
  let nz = z;
  for (const c of colliders) {
    const dx = nx - c.x;
    const dz = nz - c.z;
    const d = Math.hypot(dx, dz);
    if (d < c.r && d > 1e-4) {
      const push = (c.r - d) / d;
      nx += dx * push;
      nz += dz * push;
    }
  }
  return [nx, nz];
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  // steer by nudging the cursor to the edges of the view
  if (!isDragging && Math.abs(pointerNX) > TURN_DEADZONE) {
    const t = (Math.abs(pointerNX) - TURN_DEADZONE) / (1 - TURN_DEADZONE);
    yawObject.rotation.y -= Math.sign(pointerNX) * t * t * EDGE_TURN_SPEED * dt;
  }

  forward.set(-Math.sin(yawObject.rotation.y), 0, -Math.cos(yawObject.rotation.y));
  right.set(-forward.z, 0, forward.x);

  if (move.forward) yawObject.position.addScaledVector(forward, WALK_SPEED * dt);
  if (move.backward) yawObject.position.addScaledVector(forward, -WALK_SPEED * dt);
  if (move.right) yawObject.position.addScaledVector(right, WALK_SPEED * dt);
  if (move.left) yawObject.position.addScaledVector(right, -WALK_SPEED * dt);

  if (Math.abs(wheelVelocity) > 0.01) {
    yawObject.position.addScaledVector(forward, wheelVelocity * dt);
    wheelVelocity *= Math.pow(0.12, dt);
  } else {
    wheelVelocity = 0;
  }

  const [cx, cz] = resolveCollisions(yawObject.position.x, yawObject.position.z);
  yawObject.position.x = cx;
  yawObject.position.z = cz;
  yawObject.position.y = walkHeightAt(cx, cz) + EYE_HEIGHT;

  chunks.update(cx, cz);
  fauna.update(dt, yawObject.position);
  sky.update(dt, yawObject.position, camera);

  renderer.render(scene, camera);
}

// Fill the first ring of chunks before the first frame so the player never
// spawns staring into the void.
chunks.update(0, 0, 64);
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
