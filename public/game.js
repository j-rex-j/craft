import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const socket = io();
const statusEl = document.getElementById("status");
const blockSelect = document.getElementById("blockSelect");
const skinSelect = document.getElementById("skinSelect");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 10, 110);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 3, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(20, 32, 10);
sun.castShadow = true;
scene.add(sun);

const textureCache = new Map();
function makePixelTexture(primary, secondary = "#111") {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, 64, 64);

  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      if ((x + y) % 16 === 0) {
        ctx.fillStyle = secondary;
        ctx.fillRect(x, y, 8, 8);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

const blockStyles = {
  grass: ["#4caf50", "#2e7d32"],
  dirt: ["#8d6e63", "#5d4037"],
  stone: ["#9e9e9e", "#616161"],
  wood: ["#a1887f", "#6d4c41"],
  leaf: ["#66bb6a", "#2e7d32"],
  sand: ["#f4d35e", "#e09f3e"],
  brick: ["#c0392b", "#922b21"]
};

function materialFor(type) {
  if (!textureCache.has(type)) {
    const [a, b] = blockStyles[type] || blockStyles.grass;
    const tex = makePixelTexture(a, b);
    textureCache.set(type, new THREE.MeshLambertMaterial({ map: tex }));
  }
  return textureCache.get(type);
}

const skinColors = {
  blue: 0x4dabf7,
  red: 0xff6b6b,
  green: 0x69db7c,
  purple: 0xcc5de8
};

const world = new Map();
const worldGroup = new THREE.Group();
scene.add(worldGroup);

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
}

function addBlock(x, y, z, type) {
  const key = blockKey(x, y, z);
  if (world.has(key)) {
    removeBlock(x, y, z);
  }

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materialFor(type));
  mesh.position.set(x, y, z);
  mesh.userData = { type, grid: { x, y, z } };
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  world.set(key, mesh);
  worldGroup.add(mesh);
}

function removeBlock(x, y, z) {
  const key = blockKey(x, y, z);
  const block = world.get(key);
  if (!block) return;
  worldGroup.remove(block);
  world.delete(key);
}

const others = new Map();
let selfId = null;

function makePlayerMesh(color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.8, 0.8),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.castShadow = true;
  return mesh;
}

function upsertRemotePlayer(player) {
  if (player.id === selfId) return;
  if (!others.has(player.id)) {
    const mesh = makePlayerMesh(skinColors[player.texture] || 0x4dabf7);
    scene.add(mesh);
    others.set(player.id, mesh);
  }

  const mesh = others.get(player.id);
  mesh.position.set(player.x, player.y, player.z);
  mesh.rotation.y = player.yaw;
}

const keys = new Set();
const velocity = new THREE.Vector3();
const dir = new THREE.Vector3();
let yaw = 0;
let pitch = 0;
let pointerLocked = false;

document.addEventListener("keydown", (e) => keys.add(e.code));
document.addEventListener("keyup", (e) => keys.delete(e.code));

document.body.addEventListener("click", () => {
  renderer.domElement.requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});

document.addEventListener("mousemove", (e) => {
  if (!pointerLocked) return;
  yaw -= e.movementX * 0.0025;
  pitch -= e.movementY * 0.0025;
  pitch = Math.max(-1.5, Math.min(1.5, pitch));
});

skinSelect.addEventListener("change", () => {
  socket.emit("setTexture", skinSelect.value);
});

const raycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector2(0, 0);

window.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("mousedown", (e) => {
  if (!pointerLocked) return;
  raycaster.setFromCamera(rayOrigin, camera);
  const intersections = raycaster.intersectObjects(worldGroup.children, false);
  if (!intersections.length) return;

  const hit = intersections[0];
  const block = hit.object.userData.grid;

  if (e.button === 0) {
    socket.emit("editBlock", { action: "remove", ...block });
  }

  if (e.button === 2) {
    const normal = hit.face.normal;
    const nx = Math.round(block.x + normal.x);
    const ny = Math.round(block.y + normal.y);
    const nz = Math.round(block.z + normal.z);
    socket.emit("editBlock", { action: "add", x: nx, y: ny, z: nz, type: blockSelect.value });
  }
});

socket.on("connect", () => {
  statusEl.textContent = `Connected (${socket.id.slice(0, 6)})`;
});

socket.on("init", (payload) => {
  selfId = payload.selfId;
  payload.blocks.forEach((b) => addBlock(b.x, b.y, b.z, b.type));
  payload.players.forEach((p) => upsertRemotePlayer(p));
});

socket.on("playerJoined", (player) => upsertRemotePlayer(player));
socket.on("playerMoved", (player) => upsertRemotePlayer(player));
socket.on("playerTexture", ({ id, texture }) => {
  if (!others.has(id)) return;
  others.get(id).material.color.setHex(skinColors[texture] || 0x4dabf7);
});
socket.on("playerLeft", (id) => {
  const mesh = others.get(id);
  if (!mesh) return;
  scene.remove(mesh);
  others.delete(id);
});

socket.on("blockEdited", ({ action, x, y, z, type }) => {
  if (action === "remove") removeBlock(x, y, z);
  else addBlock(x, y, z, type);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  camera.rotation.set(pitch, yaw, 0, "YXZ");

  dir.set(0, 0, 0);
  if (keys.has("KeyW")) dir.z -= 1;
  if (keys.has("KeyS")) dir.z += 1;
  if (keys.has("KeyA")) dir.x -= 1;
  if (keys.has("KeyD")) dir.x += 1;
  if (keys.has("Space")) dir.y += 1;
  if (keys.has("ShiftLeft") || keys.has("ShiftRight")) dir.y -= 1;

  dir.normalize();
  const speed = 8;
  velocity.copy(dir).multiplyScalar(speed * dt).applyEuler(camera.rotation);
  camera.position.add(velocity);

  if (selfId) {
    socket.emit("move", {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      yaw,
      pitch
    });
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
