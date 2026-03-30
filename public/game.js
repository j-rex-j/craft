const statusEl = document.getElementById("status");
const destroyedEl = document.getElementById("destroyed");
const cashEl = document.getElementById("cash");
const toolEl = document.getElementById("tool");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x92c7ff);
scene.fog = new THREE.Fog(0x92c7ff, 45, 230);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 450);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xfff1c7, 1.0);
sun.position.set(55, 100, 35);
sun.castShadow = true;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(460, 460),
  new THREE.MeshStandardMaterial({ color: 0x3d6f42, roughness: 0.92 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const streetMaterial = new THREE.MeshStandardMaterial({ color: 0x353c44, roughness: 0.95 });
for (let i = -90; i <= 90; i += 18) {
  const roadA = new THREE.Mesh(new THREE.BoxGeometry(180, 0.05, 5), streetMaterial);
  roadA.position.set(0, 0.03, i);
  roadA.receiveShadow = true;
  scene.add(roadA);

  const roadB = new THREE.Mesh(new THREE.BoxGeometry(5, 0.05, 180), streetMaterial);
  roadB.position.set(i, 0.03, 0);
  roadB.receiveShadow = true;
  scene.add(roadB);
}

const materialSet = {
  concrete: new THREE.MeshStandardMaterial({ color: 0xa0a0a0, roughness: 0.9 }),
  brick: new THREE.MeshStandardMaterial({ color: 0xbe6f50, roughness: 0.92 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8698aa, roughness: 0.55, metalness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x8fd5ff, roughness: 0.2, metalness: 0.05 }),
  rubble: new THREE.MeshStandardMaterial({ color: 0x565656, roughness: 0.88 }),
  hammerHead: new THREE.MeshStandardMaterial({ color: 0x5f6978, roughness: 0.35, metalness: 0.65 }),
  hammerHandle: new THREE.MeshStandardMaterial({ color: 0x5a3f2b, roughness: 0.8 })
};

const worldBlocks = [];
const dynamicBlocks = [];
const buildings = [];

let totalValue = 0;
let destroyedValue = 0;
let cash = 0;
let won = false;

const keys = new Set();
let pointerLocked = false;
let yaw = 0;
let pitch = 0;
let hammerSwing = 0;
let hammerCooldown = 0;

const player = {
  position: new THREE.Vector3(0, 1.8, 70),
  radius: 0.32,
  halfHeight: 0.9,
  velocityY: 0
};

const moveDelta = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const cameraDir = new THREE.Vector3();

const hammer = new THREE.Group();
const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.24), materialSet.hammerHead);
hammerHead.position.set(0, 0.45, -0.05);
const hammerHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 10), materialSet.hammerHandle);
hammerHandle.position.set(0, 0.1, 0);
hammer.add(hammerHead);
hammer.add(hammerHandle);
camera.add(hammer);
scene.add(camera);

function updateHud() {
  const progress = totalValue === 0 ? 0 : Math.min(100, Math.round((destroyedValue / totalValue) * 100));
  destroyedEl.textContent = `${progress}%`;
  cashEl.textContent = `$${cash.toLocaleString()}`;
  toolEl.textContent = "Sledge Hammer";

  if (!won && progress >= 75) {
    won = true;
    statusEl.textContent = "Contract complete. Block reduced to rubble.";
  }
}

function blockMesh(kind) {
  const material = kind === "glass" ? materialSet.glass : materialSet[kind] || materialSet.concrete;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addStaticBlock(x, y, z, kind, buildingId) {
  const mesh = blockMesh(kind);
  mesh.position.set(x, y, z);
  mesh.userData = {
    x,
    y,
    z,
    buildingId,
    kind,
    dynamic: false,
    value: kind === "glass" ? 18 : 24,
    velocity: new THREE.Vector3()
  };
  worldBlocks.push(mesh);
  scene.add(mesh);
  totalValue += mesh.userData.value;
}

function spawnBuilding(baseX, baseZ, width, depth, floors, palette, buildingId) {
  const height = floors * 3;
  const halfW = Math.floor(width / 2);
  const halfD = Math.floor(depth / 2);

  for (let y = 1; y <= height; y += 1) {
    for (let x = -halfW; x <= halfW; x += 1) {
      for (let z = -halfD; z <= halfD; z += 1) {
        const edge = Math.abs(x) === halfW || Math.abs(z) === halfD;
        if (!edge) continue;

        const globalX = baseX + x;
        const globalZ = baseZ + z;
        const windowStripe = y % 3 === 2 && (Math.abs(x) === halfW || Math.abs(z) === halfD);
        const kind = windowStripe && Math.random() < 0.58 ? "glass" : palette;
        addStaticBlock(globalX, y, globalZ, kind, buildingId);
      }
    }
  }

  for (let x = -halfW; x <= halfW; x += 1) {
    for (let z = -halfD; z <= halfD; z += 1) {
      addStaticBlock(baseX + x, height + 1, baseZ + z, "steel", buildingId);
    }
  }

  buildings.push({
    id: buildingId,
    center: new THREE.Vector3(baseX, height / 2, baseZ),
    radius: Math.max(width, depth) * 0.7,
    value: width * depth * floors * 110
  });
}

function generateDetailedCity() {
  let id = 1;
  for (let gx = -3; gx <= 3; gx += 1) {
    for (let gz = -3; gz <= 3; gz += 1) {
      if (Math.abs(gx) <= 1 && Math.abs(gz) <= 1) continue;
      const lotX = gx * 18 + Math.floor(Math.random() * 4 - 2);
      const lotZ = gz * 18 + Math.floor(Math.random() * 4 - 2);
      const w = 6 + Math.floor(Math.random() * 4);
      const d = 6 + Math.floor(Math.random() * 4);
      const floors = 3 + Math.floor(Math.random() * 7);
      const kind = ["concrete", "brick", "steel"][Math.floor(Math.random() * 3)];
      spawnBuilding(lotX, lotZ, w, d, floors, kind, id);
      id += 1;

      if (Math.random() < 0.35) {
        const annexFloors = 2 + Math.floor(Math.random() * 3);
        spawnBuilding(lotX + (w + 2), lotZ + 1, 4 + Math.floor(Math.random() * 3), 4 + Math.floor(Math.random() * 3), annexFloors, kind, id);
        id += 1;
      }
    }
  }

  updateHud();
}

function getNearbyStaticBlocks(position, radius) {
  const result = [];
  const r2 = radius * radius;
  for (const block of worldBlocks) {
    if (block.userData.dynamic) continue;
    if (block.position.distanceToSquared(position) <= r2) {
      result.push(block);
    }
  }
  return result;
}

function breakWithHammer() {
  if (!pointerLocked || hammerCooldown > 0 || won) return;

  hammerSwing = 1;
  hammerCooldown = 0.35;

  camera.getWorldDirection(cameraDir);
  raycaster.set(camera.position, cameraDir);
  const staticTargets = worldBlocks.filter((b) => !b.userData.dynamic);
  const hits = raycaster.intersectObjects(staticTargets, false);

  if (!hits.length || hits[0].distance > 5) {
    statusEl.textContent = "Swing missed. Get closer.";
    return;
  }

  const hitBlock = hits[0].object;
  const buildingId = hitBlock.userData.buildingId;
  const hitPosition = hitBlock.position;
  const localBreak = [];

  for (const candidate of getNearbyStaticBlocks(hitPosition, 1.9)) {
    if (candidate.userData.buildingId !== buildingId) continue;
    localBreak.push(candidate);
  }

  if (!localBreak.length) return;

  for (const block of localBreak) {
    block.userData.dynamic = true;
    block.userData.velocity.set(
      (Math.random() - 0.5) * 5,
      4 + Math.random() * 3,
      (Math.random() - 0.5) * 5
    );
    block.material = materialSet.rubble;
    dynamicBlocks.push(block);

    destroyedValue += block.userData.value;
    cash += block.userData.value;
  }

  statusEl.textContent = `Hammer impact: ${localBreak.length} blocks detached.`;
  updateHud();
}

function resolvePlayerCollision(nextPosition) {
  const r = player.radius;
  const minX = nextPosition.x - r;
  const maxX = nextPosition.x + r;
  const minY = nextPosition.y - player.halfHeight;
  const maxY = nextPosition.y + player.halfHeight;
  const minZ = nextPosition.z - r;
  const maxZ = nextPosition.z + r;

  for (const block of worldBlocks) {
    if (block.userData.dynamic) continue;

    const bx0 = block.position.x - 0.5;
    const bx1 = block.position.x + 0.5;
    const by0 = block.position.y - 0.5;
    const by1 = block.position.y + 0.5;
    const bz0 = block.position.z - 0.5;
    const bz1 = block.position.z + 0.5;

    const overlaps = maxX > bx0 && minX < bx1 && maxY > by0 && minY < by1 && maxZ > bz0 && minZ < bz1;
    if (!overlaps) continue;

    const pushX = Math.min(Math.abs(maxX - bx0), Math.abs(bx1 - minX));
    const pushZ = Math.min(Math.abs(maxZ - bz0), Math.abs(bz1 - minZ));

    if (pushX < pushZ) {
      if (nextPosition.x > block.position.x) nextPosition.x += pushX + 0.01;
      else nextPosition.x -= pushX + 0.01;
    } else {
      if (nextPosition.z > block.position.z) nextPosition.z += pushZ + 0.01;
      else nextPosition.z -= pushZ + 0.01;
    }
  }
}

function updateDynamicBlocks(dt) {
  for (let i = dynamicBlocks.length - 1; i >= 0; i -= 1) {
    const block = dynamicBlocks[i];
    block.userData.velocity.y -= 18 * dt;
    block.position.addScaledVector(block.userData.velocity, dt);
    block.rotation.x += dt * 2.4;
    block.rotation.y += dt * 1.8;

    if (block.position.y < 0.5) {
      block.position.y = 0.5;
      block.userData.velocity.y *= -0.2;
      block.userData.velocity.x *= 0.8;
      block.userData.velocity.z *= 0.8;

      if (Math.abs(block.userData.velocity.y) < 0.15) {
        block.userData.velocity.y = 0;
      }
    }
  }
}

function updateMovement(dt) {
  moveDelta.set(0, 0, 0);
  if (keys.has("KeyW")) moveDelta.z -= 1;
  if (keys.has("KeyS")) moveDelta.z += 1;
  if (keys.has("KeyA")) moveDelta.x -= 1;
  if (keys.has("KeyD")) moveDelta.x += 1;

  if (moveDelta.lengthSq() > 0) {
    moveDelta.normalize();
    moveDelta.multiplyScalar(7.6 * dt);
    moveDelta.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  }

  const next = player.position.clone().add(moveDelta);
  next.y = Math.max(1.8, next.y + player.velocityY * dt);
  resolvePlayerCollision(next);
  player.position.copy(next);

  camera.position.copy(player.position);
  camera.rotation.set(pitch, yaw, 0, "YXZ");
}

function updateHammerAnimation(dt) {
  hammerCooldown = Math.max(0, hammerCooldown - dt);
  hammerSwing = Math.max(0, hammerSwing - dt * 4.5);

  hammer.position.set(0.48, -0.56, -0.68);
  hammer.rotation.set(-0.4 + hammerSwing * 0.95, -0.2, 0.2 + hammerSwing * 0.6);
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  updateMovement(dt);
  updateDynamicBlocks(dt);
  updateHammerAnimation(dt);
  renderer.render(scene, camera);
}

document.addEventListener("keydown", (event) => keys.add(event.code));
document.addEventListener("keyup", (event) => keys.delete(event.code));

document.body.addEventListener("click", () => renderer.domElement.requestPointerLock());
document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (pointerLocked) {
    statusEl.textContent = "Sledge equipped. Smash support cubes to collapse structures.";
  }
});

document.addEventListener("mousemove", (event) => {
  if (!pointerLocked) return;
  yaw -= event.movementX * 0.0024;
  pitch -= event.movementY * 0.0021;
  pitch = Math.max(-1.25, Math.min(1.25, pitch));
});

window.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  breakWithHammer();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

generateDetailedCity();
animate();
