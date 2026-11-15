// Source for js/scene.js. Build with: npm run build (see package.json).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";

const MODEL_URL = "/assets/taycan.glb";
const PAINT = 0x8c0b16; // deep carmine
const CAR_LENGTH = 4.96; // metres

const canvas = document.getElementById("stage");
const loaderEl = document.getElementById("loader");
const loaderBar = document.getElementById("loader-bar");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isSmall = () => window.innerWidth < 720;

function fail() {
  document.body.classList.add("no-3d");
  if (loaderEl) loaderEl.hidden = true;
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (err) {
  fail();
}

if (renderer) start();

function start() {
  const dpr = () => Math.min(window.devicePixelRatio || 1, isSmall() ? 2 : 1.75);
  renderer.setPixelRatio(dpr());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const BG = new THREE.Color(0x070709);
  scene.background = BG;

  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 200);

  // ---------- Studio environment: black room with soft boxes and strip lights ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(buildStudio(), 0.03).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 1.0;

  // ---------- Floor ----------
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 96),
    new THREE.MeshStandardMaterial({
      color: 0x050506,
      roughness: 0.3,
      metalness: 0.0,
      envMapIntensity: 0.12,
      opacity: 0.93,
      transparent: true,
      alphaMap: radialTexture(),
      envMap,
      depthWrite: false,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = -2;
  scene.add(floor);

  // ---------- Camera path (azimuth deg, elevation deg, distance factor) ----------
  const keys = [
    { az: 38, el: 9, r: 1.0 },
    { az: 92, el: 3, r: 0.9 },
    { az: 148, el: 12, r: 0.95 },
    { az: 196, el: 24, r: 1.1 },
    { az: 268, el: 4, r: 0.88 },
    { az: 330, el: 2, r: 0.82 },
    { az: 398, el: 32, r: 1.18 },
  ];

  const state = {
    t: 0,
    goal: 0,
    side: 0,
    sideGoal: 0,
    px: 0,
    py: 0,
    pxGoal: 0,
    pyGoal: 0,
    intro: reduceMotion ? 1 : 0,
    baseDist: 9,
    target: new THREE.Vector3(0, 0.62, 0),
    ready: false,
  };

  function sample(t) {
    const n = keys.length - 1;
    const f = Math.min(Math.max(t, 0), 1) * n;
    const i = Math.min(Math.floor(f), n - 1);
    let u = f - i;
    u = u * u * (3 - 2 * u);
    const a = keys[i];
    const b = keys[i + 1];
    return {
      az: a.az + (b.az - a.az) * u,
      el: a.el + (b.el - a.el) * u,
      r: a.r + (b.r - a.r) * u,
    };
  }

  function placeCamera() {
    const k = sample(state.t);
    const introEase = 1 - Math.pow(1 - state.intro, 3);
    const az = THREE.MathUtils.degToRad(k.az - 26 * (1 - introEase) + state.px * 6);
    const el = THREE.MathUtils.degToRad(Math.max(1.5, k.el - state.py * 3));
    // Keep the car about as wide on a phone as on a laptop screen.
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const aspectBoost = Math.max(1, (0.43 / halfH) * 0.78);
    const dist = state.baseDist * k.r * aspectBoost * (1 + 0.25 * (1 - introEase));
    camera.position.set(
      state.target.x + Math.sin(az) * Math.cos(el) * dist,
      state.target.y + Math.sin(el) * dist,
      state.target.z + Math.cos(az) * Math.cos(el) * dist
    );
    camera.lookAt(state.target);

    // Shift the car away from the side the text sits on (desktop only).
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (isSmall()) camera.setViewOffset(w, h, 0, -h * 0.17, w, h);
    else camera.setViewOffset(w, h, state.side * w * 0.16, 0, w, h);
  }

  // ---------- Contact shadows (baked once, the car never moves) ----------
  function bakeShadows(car, size) {
    const make = (height, blur, darkness, scale) => {
      const w = size.x * scale;
      const d = size.z * scale;
      const res = 512;
      const rt = new THREE.WebGLRenderTarget(res, res);
      const rtBlur = new THREE.WebGLRenderTarget(res, res);
      rt.texture.generateMipmaps = false;
      const cam = new THREE.OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0, height);
      cam.rotation.x = Math.PI / 2;
      const depthMat = new THREE.MeshDepthMaterial();
      depthMat.onBeforeCompile = (shader) => {
        shader.uniforms.darkness = { value: darkness };
        shader.fragmentShader =
          "uniform float darkness;\n" +
          shader.fragmentShader.replace(
            "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
            "gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );"
          );
      };
      depthMat.depthTest = false;
      depthMat.depthWrite = false;

      const shadowScene = new THREE.Scene();
      shadowScene.add(car);
      shadowScene.overrideMaterial = depthMat;
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(shadowScene, cam);

      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
      const quadScene = new THREE.Scene();
      quadScene.add(quad);
      const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      quadCam.position.z = 0.5;
      const hb = new THREE.ShaderMaterial(HorizontalBlurShader);
      const vb = new THREE.ShaderMaterial(VerticalBlurShader);
      hb.depthTest = vb.depthTest = false;
      for (let pass = 0; pass < 3; pass++) {
        const amount = blur * (pass + 1) * 0.5;
        quad.material = hb;
        hb.uniforms.tDiffuse.value = rt.texture;
        hb.uniforms.h.value = amount / 256;
        renderer.setRenderTarget(rtBlur);
        renderer.render(quadScene, quadCam);
        quad.material = vb;
        vb.uniforms.tDiffuse.value = rtBlur.texture;
        vb.uniforms.v.value = amount / 256;
        renderer.setRenderTarget(rt);
        renderer.render(quadScene, quadCam);
      }
      renderer.setRenderTarget(null);
      rtBlur.dispose();
      hb.dispose();
      vb.dispose();

      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, depthWrite: false })
      );
      plane.rotation.x = -Math.PI / 2;
      plane.scale.y = -1;
      plane.position.y = 0.002;
      plane.renderOrder = -1;
      return plane;
    };

    scene.add(make(1.6, 4, 1.25, 2.0));
    scene.add(make(0.22, 1, 2.2, 1.35));
    scene.add(car);
  }

  // ---------- Materials ----------
  function tune(car, envMap) {
    const paint = new THREE.MeshPhysicalMaterial({
      color: PAINT,
      metalness: 0.45,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMap,
      envMapIntensity: 1.2,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x05070a,
      metalness: 0,
      roughness: 0.02,
      transparent: true,
      opacity: 0.72,
      envMap,
      envMapIntensity: 1.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    car.traverse((o) => {
      if (!o.isMesh) return;
      const name = (o.material && o.material.name) || "";
      if (/Paint_Material/.test(name)) {
        o.material = paint;
      } else if (/Window_Material/.test(name)) {
        o.material = glass;
        o.renderOrder = 2;
      }
    });
  }

  // ---------- Load ----------
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    MODEL_URL,
    (gltf) => {
      const car = gltf.scene;
      const box = new THREE.Box3().setFromObject(car);
      const size = box.getSize(new THREE.Vector3());
      const scale = CAR_LENGTH / Math.max(size.x, size.z);
      car.scale.setScalar(scale);
      box.setFromObject(car);
      const center = box.getCenter(new THREE.Vector3());
      car.position.x -= center.x;
      car.position.z -= center.z;
      car.position.y -= box.min.y;
      car.updateMatrixWorld(true);
      box.setFromObject(car);
      box.getSize(size);

      tune(car, envMap);
      if (!isSmall()) {
        // Mirror copy under the glossy floor: a cheap, convincing reflection.
        const mirror = car.clone();
        mirror.scale.y *= -1;
        mirror.position.y = -mirror.position.y;
        mirror.renderOrder = -3;
        scene.add(mirror);
      }
      bakeShadows(car, size);

      state.target.set(0, size.y * 0.42, 0);
      state.baseDist = CAR_LENGTH * 2.05;

      renderer.compile(scene, camera);
      state.ready = true;
      document.body.classList.add("car-ready");
      if (loaderEl) {
        loaderEl.classList.add("done");
        setTimeout(() => (loaderEl.hidden = true), 900);
      }
    },
    (event) => {
      if (loaderBar && event.total) {
        loaderBar.style.width = Math.round((event.loaded / event.total) * 100) + "%";
      }
    },
    fail
  );

  // ---------- Scroll / pointer ----------
  const panels = Array.from(document.querySelectorAll(".panel"));
  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    state.goal = max > 0 ? window.scrollY / max : 0;
    // Which side is the text on at the middle of the screen?
    const mid = window.innerHeight / 2;
    let side = 0;
    let best = Infinity;
    for (const p of panels) {
      const r = p.getBoundingClientRect();
      const c = r.top + r.height / 2;
      const d = Math.abs(c - mid);
      if (d < best) {
        best = d;
        side = p.classList.contains("right") ? 1 : -1;
      }
    }
    state.sideGoal = side;
  }
  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      state.pxGoal = (e.clientX / window.innerWidth) * 2 - 1;
      state.pyGoal = (e.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true }
  );
  window.addEventListener("resize", () => {
    renderer.setPixelRatio(dpr());
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = camera.aspect < 1 ? 40 : 30;
    camera.updateProjectionMatrix();
    readScroll();
    dirty = true;
  });
  readScroll();
  state.t = state.goal;
  state.side = state.sideGoal;

  // ---------- Render loop (only draws when something moved) ----------
  let dirty = true;
  let visible = true;
  document.addEventListener("visibilitychange", () => (visible = !document.hidden));
  const last = new THREE.Vector3();
  let prevTime = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - prevTime) / 1000, 0.1);
    prevTime = now;
    if (!visible || !state.ready) return;
    const k = 1 - Math.pow(0.0015, dt); // frame-rate independent easing
    state.t += (state.goal - state.t) * k;
    state.side += (state.sideGoal - state.side) * k * 0.7;
    state.px += (state.pxGoal - state.px) * k * 0.6;
    state.py += (state.pyGoal - state.py) * k * 0.6;
    if (state.intro < 1) state.intro = Math.min(1, state.intro + dt / 2.2);
    placeCamera();
    if (dirty || last.distanceToSquared(camera.position) > 1e-7 || state.intro < 1) {
      renderer.render(scene, camera);
      last.copy(camera.position);
      dirty = false;
    }
  }
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = camera.aspect < 1 ? 40 : 30;
  camera.updateProjectionMatrix();
  requestAnimationFrame(frame);
}

// A dark studio: big overhead soft box, long side strips and a rim light.
function buildStudio() {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x020203);
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(40, 20, 40),
    new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.BackSide })
  );
  room.position.y = 8;
  env.add(room);

  const add = (w, h, intensity, pos, look, tint = 0xffffff) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  add(12, 5, 2.4, [0, 9, 0], [0, 0, 0]); // overhead soft box
  for (const x of [-9, 9]) {
    add(16, 0.7, 7.0, [x, 2.0, 0], [0, 1.2, 0]); // long low strip
    add(16, 0.5, 5.0, [x, 4.6, 0], [0, 1.2, 0]); // long high strip
  }
  add(16, 1.2, 4.0, [0, 3, -11], [0, 1, 0]); // back rim
  add(16, 1.2, 4.0, [0, 3, 11], [0, 1, 0]); // front rim
  add(1.0, 8, 3.0, [-7, 4, 8], [0, 1, 0]); // vertical accents
  add(1.0, 8, 3.0, [7, 4, -8], [0, 1, 0]);
  add(3, 3, 1.4, [7, 5, 7], [0, 1, 0], 0xfff1dd); // warm kicker
  add(3, 3, 1.0, [-7, 5, -7], [0, 1, 0], 0xdde8ff); // cool kicker
  // floor bounce
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x0b0b0c }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  env.add(floor);
  return env;
}

function radialTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.22, "#bbbbbb");
  grad.addColorStop(0.55, "#333333");
  grad.addColorStop(1, "#000000");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
