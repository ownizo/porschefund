const iframe = document.getElementById("stage");
const client = new Sketchfab(iframe);
let apiRef = null;
let base = null;
let scroll = 0;
const pointer = { x: 0, y: 0 };

client.init("8568d9d14a994b9cae59499f0dbed21e", {
  success: function (api) {
    apiRef = api;
    api.start();
    api.addEventListener("viewerready", function () {
      api.getCameraLookAt(function (err, camera) {
        if (err || !camera) return;
        const position = camera.position;
        const target = camera.target;
        const dx = position[0] - target[0];
        const dy = position[1] - target[1];
        const dz = position[2] - target[2];
        base = {
          target: target,
          dist: Math.hypot(dx, dy, dz) || 1,
          start: Math.atan2(dx, dz),
        };
      });
    });
  },
  error: function () {
    document.body.classList.add("no-3d");
  },
  autostart: 1,
  preload: 1,
  ui_controls: 0,
  ui_infos: 0,
  ui_inspector: 0,
  ui_stop: 0,
  ui_help: 0,
  ui_settings: 0,
  ui_vr: 0,
  ui_fullscreen: 0,
  ui_annotations: 0,
  ui_watermark: 0,
  camera: 0,
  scrollwheel: 0,
  transparent: 0,
  autospin: 0,
  max_texture_size: 1024,
});

function pose(t) {
  const angle = base.start + t * Math.PI * 1.65 + pointer.x * 0.25;
  const lift = 0.18 + Math.sin(t * Math.PI) * 0.22 - pointer.y * 0.08;
  const dist = base.dist * (0.92 + Math.sin(t * Math.PI) * 0.08);
  const target = base.target;
  return {
    position: [
      target[0] + Math.sin(angle) * Math.cos(lift) * dist,
      target[1] + Math.sin(lift) * dist * 0.55,
      target[2] + Math.cos(angle) * Math.cos(lift) * dist,
    ],
    target: target,
  };
}

let lastSent = -1;
function frame() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const goal = max > 0 ? window.scrollY / max : 0;
  scroll += (goal - scroll) * 0.08;
  if (apiRef && base && Math.abs(scroll - lastSent) > 0.004) {
    const shot = pose(scroll);
    apiRef.setCameraLookAt(shot.position, shot.target, 0);
    lastSent = scroll;
  }
  requestAnimationFrame(frame);
}
frame();

window.addEventListener("pointermove", function (event) {
  pointer.x += ((event.clientX / window.innerWidth) * 2 - 1 - pointer.x) * 0.08;
  pointer.y += ((event.clientY / window.innerHeight) * 2 - 1 - pointer.y) * 0.08;
});
