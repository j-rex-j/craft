const statusEl = document.getElementById("status");
const destroyedEl = document.getElementById("destroyed");
const cashEl = document.getElementById("cash");
const toolEl = document.getElementById("tool");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7ec0ff);
scene.fog = new THREE.Fog(0x7ec0ff, 50, 210);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 450);
camera.position.set(0, 7, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xfff0cc, 0.95);
sun.position.set(60, 100, 30);
sun.castShadow = true;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(420, 420),
  new THREE.MeshStandardMaterial({ color: 0x3f6f3f, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const rubbleMaterial = new THREE.MeshStandardMaterial({ color: 0x4f4f4f, roughness: 0.85, metalness: 0.05 });
const chargeMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x333333, roughness: 0.5 });

const keys = new Set();
let pointerLocked = false;
let yaw = 0;
let pitch = 0;
const moveDir = new THREE.Vector3();
const velocity = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

let bulldozerMode = false;
const charges = [];
const rubble = [];
const buildings = [];
let totalValue = 0;
let destroyedValue = 0;
let cash = 0;
let won = false;

function blockTexture(a, b) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 64, 64);

  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      if ((x + y) % 16 === 0) {
        ctx.fillStyle = b;
        ctx.fillRect(x, y, 8, 8);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

const materials = {
  glass: new THREE.MeshStandardMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.55, roughness: 0.1 }),
  concrete: new THREE.MeshStandardMaterial({ map: blockTexture("#8c8c8c", "#707070"), roughness: 0.95 }),
  steel: new THREE.MeshStandardMaterial({ map: blockTexture("#8ba2b0", "#586f7e"), metalness: 0.35, roughness: 0.4 }),
  brick: new THREE.MeshStandardMaterial({ map: blockTexture("#c15f46", "#894634"), roughness: 0.9 }),
  roof: new THREE.MeshStandardMaterial({ map: blockTexture("#363942", "#22232a"), roughness: 0.65 })
};

function spawnBuilding(cx, cz, floors, style) {
  const building = new THREE.Group();
  const floorsHeight = floors * 2.5;
  const width = 6 + Math.floor(Math.random() * 4);
  const depth = 6 + Math.floor(Math.random() * 4);
  const value = floors * width * depth * 25;
  totalValue += value;

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(width, floorsHeight, depth),
    style === "industrial" ? materials.steel : materials.concrete
  );
  shell.position.y = floorsHeight / 2;
  shell.castShadow = true;
  shell.receiveShadow = true;

  const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.15, 0.8, depth + 0.15), materials.roof);
  roof.position.y = floorsHeight + 0.4;
  roof.castShadow = true;

  building.add(shell);
  building.add(roof);

  for (let y = 1.4; y < floorsHeight - 0.5; y += 2.3) {
    const windowStrip = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.5, 0.9, 0.2),
      materials.glass
    );
    windowStrip.position.set(0, y, depth / 2 + 0.08);
    building.add(windowStrip);

    const backStrip = windowStrip.clone();
    backStrip.position.z = -depth / 2 - 0.08;
    building.add(backStrip);
  }

  building.position.set(cx, 0, cz);
  building.userData = { destroyed: false, value, radius: Math.max(width, depth) * 0.72 };
  scene.add(building);
  buildings.push(building);
}

function generateMap() {
  const lots = [
    [-30, -25],
    [-8, -30],
    [18, -28],
    [35, -15],
    [-35, 10],
    [-10, 20],
    [15, 14],
    [35, 25]
  ];

  lots.forEach(([x, z], i) => {
    const floors = 3 + Math.floor(Math.random() * 7);
    spawnBuilding(x, z, floors, i % 2 === 0 ? "office" : "industrial");
  });

  updateHud();
}

function updateHud() {
  const progress = totalValue === 0 ? 0 : Math.min(100, Math.round((destroyedValue / totalValue) * 100));
  destroyedEl.textContent = `${progress}%`;
  cashEl.textContent = `$${cash.toLocaleString()}`;
  toolEl.textContent = bulldozerMode ? "Bulldozer Ram" : "Charge Launcher";

  if (progress >= 75 && !won) {
    won = true;
    statusEl.textContent = "Contract complete. City block cleared!";
  }
}

function spawnRubble(position, count = 12) {
  for (let i = 0; i < count; i += 1) {
    const size = 0.25 + Math.random() * 0.4;
    const piece = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), rubbleMaterial);
    piece.position.copy(position);
    piece.position.y += 1.5;
    piece.castShadow = true;

    piece.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      Math.random() * 8 + 3,
      (Math.random() - 0.5) * 10
    );
    piece.userData.life = 5 + Math.random() * 3;

    scene.add(piece);
    rubble.push(piece);
  }
}

function destroyBuilding(building, hitPoint) {
  if (building.userData.destroyed) return;

  building.userData.destroyed = true;
  destroyedValue += building.userData.value;
  cash += Math.round(building.userData.value * 1.35);

  spawnRubble(hitPoint || building.position, 20);
  scene.remove(building);
  updateHud();
}

function fireCharge() {
  if (!pointerLocked || won) return;

  const charge = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), chargeMaterial);
  const direction = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).normalize();
  charge.position.copy(camera.position).addScaledVector(direction, 1.5);
  charge.userData.velocity = direction.multiplyScalar(40);
  charge.userData.life = 2.4;
  charge.castShadow = true;

  scene.add(charge);
  charges.push(charge);
}

function tryBulldozer() {
  if (!bulldozerMode || won) return;
  for (const building of buildings) {
    if (building.userData.destroyed) continue;
    const dist = camera.position.distanceTo(building.position);
    if (dist < building.userData.radius + 3) {
      destroyBuilding(building, camera.position);
      statusEl.textContent = "Bulldozer hit!";
      return;
    }
  }
}

function updateCharges(dt) {
  for (let i = charges.length - 1; i >= 0; i -= 1) {
    const charge = charges[i];
    charge.userData.life -= dt;
    charge.position.addScaledVector(charge.userData.velocity, dt);

    if (charge.userData.life <= 0) {
      scene.remove(charge);
      charges.splice(i, 1);
      continue;
    }

    raycaster.set(charge.position, charge.userData.velocity.clone().normalize());
    const aliveBuildings = buildings.filter((b) => !b.userData.destroyed);
    const hits = raycaster.intersectObjects(aliveBuildings, true);

    if (hits.length > 0 && hits[0].distance < 1.5) {
      const root = hits[0].object.parent;
      const target = root.type === "Group" ? root : root.parent;
      destroyBuilding(target, hits[0].point);
      statusEl.textContent = "Direct hit!";
      scene.remove(charge);
      charges.splice(i, 1);
    }
  }
}

function updateRubble(dt) {
  for (let i = rubble.length - 1; i >= 0; i -= 1) {
    const piece = rubble[i];
    piece.userData.life -= dt;
    piece.userData.velocity.y -= 18 * dt;
    piece.position.addScaledVector(piece.userData.velocity, dt);
    piece.rotation.x += dt * 3;
    piece.rotation.y += dt * 2;

    if (piece.position.y < 0.15) {
      piece.position.y = 0.15;
      piece.userData.velocity.y *= -0.35;
      piece.userData.velocity.x *= 0.85;
      piece.userData.velocity.z *= 0.85;
    }

    if (piece.userData.life <= 0) {
      scene.remove(piece);
      rubble.splice(i, 1);
    }
  }
}

document.addEventListener("keydown", (event) => {
  keys.add(event.code);

  if (event.code === "KeyE") {
    bulldozerMode = !bulldozerMode;
    statusEl.textContent = bulldozerMode ? "Bulldozer mode enabled." : "Charge launcher enabled.";
    updateHud();
  }
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

document.body.addEventListener("click", () => {
  renderer.domElement.requestPointerLock();
});

window.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  fireCharge();
});

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (pointerLocked) {
    statusEl.textContent = "Breach contract active. Tear the city down.";
  }
});

document.addEventListener("mousemove", (event) => {
  if (!pointerLocked) return;
  yaw -= event.movementX * 0.0025;
  pitch -= event.movementY * 0.0025;
  pitch = Math.max(-1.3, Math.min(1.3, pitch));
});

const clock = new THREE.Clock();

function updateMovement(dt) {
  moveDir.set(0, 0, 0);

  if (keys.has("KeyW")) moveDir.z -= 1;
  if (keys.has("KeyS")) moveDir.z += 1;
  if (keys.has("KeyA")) moveDir.x -= 1;
  if (keys.has("KeyD")) moveDir.x += 1;

  moveDir.normalize();
  const speed = bulldozerMode ? 18 : 10;
  velocity.set(moveDir.x * speed * dt, 0, moveDir.z * speed * dt);
  velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  camera.position.add(velocity);
  camera.position.y = bulldozerMode ? 4.5 : 7;

  camera.rotation.set(pitch, yaw, 0, "YXZ");

  tryBulldozer();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  updateMovement(dt);
  updateCharges(dt);
  updateRubble(dt);

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

generateMap();
animate();
