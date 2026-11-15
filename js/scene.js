import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#070709");
scene.fog = new THREE.Fog("#070709", 12, 28);

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 80);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const paint = new THREE.MeshPhysicalMaterial({
  color: "#e7e7ea",
  metalness: 0.85,
  roughness: 0.18,
  clearcoat: 1,
  clearcoatRoughness: 0.08,
});
const black = new THREE.MeshPhysicalMaterial({ color: "#111114", metalness: 0.4, roughness: 0.45 });
const glass = new THREE.MeshPhysicalMaterial({
  color: "#0c1218",
  metalness: 0.1,
  roughness: 0.05,
  transmission: 0.55,
  thickness: 0.2,
  transparent: true,
  opacity: 0.92,
});
const chrome = new THREE.MeshStandardMaterial({ color: "#d7d7dc", metalness: 1, roughness: 0.18 });
const rubber = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.9 });
const lamp = new THREE.MeshStandardMaterial({ color: "#fff6df", emissive: "#fff1c9", emissiveIntensity: 2.2 });
const tail = new THREE.MeshStandardMaterial({ color: "#ff2a3a", emissive: "#d5001c", emissiveIntensity: 1.6 });

import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const car = new THREE.Group();

function part(w, h, d, mat, x, y, z, radius) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, radius ?? 0.12), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const hull = part(4.55, 0.62, 1.92, paint, 0, 0.58, 0, 0.22);
const cabin = part(2.35, 0.4, 1.5, glass, 0.35, 0.95, 0, 0.14);
cabin.rotation.z = 0.14;
const hood = part(1.55, 0.16, 1.72, paint, -1.15, 0.82, 0, 0.08);
const deck = part(1.15, 0.12, 1.62, paint, 1.45, 0.84, 0, 0.06);
car.add(hull, cabin, hood, deck);

function wheel(x, z) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 32), rubber);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.26, 24), chrome);
  tire.rotation.x = Math.PI / 2;
  rim.rotation.x = Math.PI / 2;
  g.add(tire, rim);
  g.position.set(x, 0.38, z);
  return g;
}
const wheels = [
  wheel(-1.45, 0.98),
  wheel(-1.45, -0.98),
  wheel(1.45, 0.98),
  wheel(1.45, -0.98),
];
wheels.forEach((w) => car.add(w));

function dot(x, y, z) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), lamp);
  m.position.set(x, y, z);
  return m;
}
car.add(dot(-2.22, 0.62, 0.62), dot(-2.22, 0.62, -0.62), dot(-2.22, 0.5, 0.32), dot(-2.22, 0.5, -0.32));
const rear = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.45), tail);
rear.position.set(2.26, 0.72, 0);
car.add(rear);
[-1, 1].forEach((side) => {
  const mirror = part(0.18, 0.08, 0.22, black, -0.15, 0.95, side * 0.95, 0.03);
  car.add(mirror);
});

scene.add(car);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 64),
  new THREE.MeshStandardMaterial({ color: "#101014", metalness: 0.6, roughness: 0.35 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

scene.add(new THREE.AmbientLight("#ffffff", 0.35));
const key = new THREE.DirectionalLight("#ffffff", 2.4);
key.position.set(4, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
const rim = new THREE.DirectionalLight("#9ecbff", 1.4);
rim.position.set(-6, 3, -4);
scene.add(rim);
const warm = new THREE.PointLight("#ffd8a8", 8, 12);
warm.position.set(2, 2.2, 3);
scene.add(warm);

const keys = [
  { a: 0.9, e: 0.16, d: 6.4 },
  { a: 1.35, e: 0.18, d: 7.4 },
  { a: 2.15, e: 0.42, d: 6.6 },
  { a: Math.PI, e: 0.22, d: 8.4 },
  { a: 4.1, e: 0.72, d: 7.6 },
  { a: 5.2, e: 0.3, d: 7.2 },
  { a: 6.4, e: 0.24, d: 8.0 },
];

const pointer = { x: 0, y: 0 };
let scroll = 0;
let smooth = 0;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function sample(t) {
  const span = keys.length - 1;
  const x = Math.min(Math.max(t, 0), 1) * span;
  const i = Math.min(Math.floor(x), span - 1);
  const f = x - i;
  const k = (a, b) => a + (b - a) * f;
  return {
    a: k(keys[i].a, keys[i + 1].a),
    e: k(keys[i].e, keys[i + 1].e),
    d: k(keys[i].d, keys[i + 1].d),
  };
}

function frame() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const goal = max > 0 ? window.scrollY / max : 0;
  scroll += (goal - scroll) * (reduced ? 1 : 0.08);
  smooth += (scroll - smooth) * 0.12;
  const shot = sample(smooth);
  const azimuth = shot.a + pointer.x * 0.18;
  const elev = shot.e + pointer.y * 0.06;
  const dist = shot.d;
  camera.position.set(
    Math.sin(azimuth) * Math.cos(elev) * dist,
    Math.sin(elev) * dist + 0.35,
    Math.cos(azimuth) * Math.cos(elev) * dist
  );
  camera.lookAt(0, 0.62, 0);
  wheels.forEach((w) => {
    w.rotation.z = -smooth * 14;
  });
  tail.emissiveIntensity = 1.2 + Math.sin(performance.now() * 0.004) * 0.25;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

window.addEventListener("pointermove", (event) => {
  pointer.x += ((event.clientX / window.innerWidth) * 2 - 1 - pointer.x) * 0.08;
  pointer.y += ((event.clientY / window.innerHeight) * 2 - 1 - pointer.y) * 0.08;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
