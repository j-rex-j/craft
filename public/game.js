(() => {
  const WORLD_SIZE = 32;
  const WORLD_HEIGHT = 16;
  const ALLOWED_BLOCKS = ["grass", "dirt", "stone", "wood", "leaf", "sand", "brick"];

  const statusEl = document.getElementById("status");
  const roomStatusEl = document.getElementById("roomStatus");
  const blockSelect = document.getElementById("blockSelect");
  const skinSelect = document.getElementById("skinSelect");
  const hostBtn = document.getElementById("hostBtn");
  const joinBtn = document.getElementById("joinBtn");
  const roomInput = document.getElementById("roomInput");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 10, 110);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 3, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(20, 32, 10);
  sun.castShadow = true;
  scene.add(sun);

  const textureCache = new Map();
  const blockStyles = {
    grass: ["#4caf50", "#2e7d32"],
    dirt: ["#8d6e63", "#5d4037"],
    stone: ["#9e9e9e", "#616161"],
    wood: ["#a1887f", "#6d4c41"],
    leaf: ["#66bb6a", "#2e7d32"],
    sand: ["#f4d35e", "#e09f3e"],
    brick: ["#c0392b", "#922b21"]
  };

  function makePixelTexture(primary, secondary) {
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

  function materialFor(type) {
    if (!textureCache.has(type)) {
      const colors = blockStyles[type] || blockStyles.grass;
      textureCache.set(type, new THREE.MeshLambertMaterial({ map: makePixelTexture(colors[0], colors[1]) }));
    }
    return textureCache.get(type);
  }

  const skinColors = { blue: 0x4dabf7, red: 0xff6b6b, green: 0x69db7c, purple: 0xcc5de8 };

  const world = new Map();
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  function key(x, y, z) {
    return `${x},${y},${z}`;
  }

  function addBlock(x, y, z, type) {
    const k = key(x, y, z);
    const existing = world.get(k);
    if (existing) {
      worldGroup.remove(existing);
    }

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materialFor(type));
    mesh.position.set(x, y, z);
    mesh.userData = { grid: { x, y, z }, type };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.set(k, mesh);
    worldGroup.add(mesh);
  }

  function removeBlock(x, y, z) {
    const k = key(x, y, z);
    const mesh = world.get(k);
    if (!mesh) return;
    worldGroup.remove(mesh);
    world.delete(k);
  }

  function generateWorld() {
    for (let x = -WORLD_SIZE / 2; x < WORLD_SIZE / 2; x++) {
      for (let z = -WORLD_SIZE / 2; z < WORLD_SIZE / 2; z++) {
        addBlock(x, 0, z, "grass");
        addBlock(x, -1, z, "dirt");
        addBlock(x, -2, z, "stone");
      }
    }
  }
  generateWorld();

  const remotePlayers = new Map();
  const selfId = crypto.randomUUID();
  let selfTexture = "blue";

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
    if (!remotePlayers.has(player.id)) {
      const mesh = makePlayerMesh(skinColors[player.texture] || skinColors.blue);
      scene.add(mesh);
      remotePlayers.set(player.id, mesh);
    }
    const mesh = remotePlayers.get(player.id);
    mesh.position.set(player.x, player.y, player.z);
    mesh.rotation.y = player.yaw;
    mesh.material.color.setHex(skinColors[player.texture] || skinColors.blue);
  }

  function removeRemotePlayer(id) {
    const mesh = remotePlayers.get(id);
    if (!mesh) return;
    scene.remove(mesh);
    remotePlayers.delete(id);
  }

  // Browser-only networking via PeerJS public cloud
  const peer = new Peer();
  let isHost = false;
  let hostConnection = null;
  const peers = new Map();
  const hostWorld = new Map();
  const hostPlayers = new Map();

  function serializeWorld() {
    const blocks = [];
    for (const [k, mesh] of world.entries()) {
      const [x, y, z] = k.split(",").map(Number);
      blocks.push({ x, y, z, type: mesh.userData.type });
    }
    return blocks;
  }

  function setWorldFromBlocks(blocks) {
    for (const mesh of world.values()) {
      worldGroup.remove(mesh);
    }
    world.clear();
    blocks.forEach((b) => addBlock(b.x, b.y, b.z, b.type));
  }

  function broadcast(msg, exceptConn) {
    peers.forEach((conn) => {
      if (conn !== exceptConn && conn.open) conn.send(msg);
    });
  }

  function clampInt(v) {
    return Math.round(Number(v));
  }

  function validateBlockEdit(edit) {
    const x = clampInt(edit.x);
    const y = clampInt(edit.y);
    const z = clampInt(edit.z);
    const action = edit.action;
    const type = ALLOWED_BLOCKS.includes(edit.type) ? edit.type : "grass";

    if (
      !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) ||
      x < -WORLD_SIZE || x > WORLD_SIZE ||
      z < -WORLD_SIZE || z > WORLD_SIZE ||
      y < -8 || y > WORLD_HEIGHT + 8
    ) {
      return null;
    }

    return { x, y, z, action, type };
  }

  function applyEdit(edit) {
    if (edit.action === "remove") removeBlock(edit.x, edit.y, edit.z);
    else addBlock(edit.x, edit.y, edit.z, edit.type);
  }

  function onHostMessage(conn, msg) {
    if (msg.type === "move") {
      const p = {
        id: msg.id,
        x: Number(msg.x) || 0,
        y: Number(msg.y) || 0,
        z: Number(msg.z) || 0,
        yaw: Number(msg.yaw) || 0,
        pitch: Number(msg.pitch) || 0,
        texture: msg.texture || "blue"
      };
      hostPlayers.set(p.id, p);
      broadcast({ type: "playerMoved", player: p }, conn);
      return;
    }

    if (msg.type === "setTexture") {
      const p = hostPlayers.get(msg.id);
      if (p) p.texture = msg.texture;
      broadcast({ type: "playerTexture", id: msg.id, texture: msg.texture }, conn);
      return;
    }

    if (msg.type === "editBlock") {
      const safe = validateBlockEdit(msg.edit);
      if (!safe) return;
      const worldKey = key(safe.x, safe.y, safe.z);
      if (safe.action === "remove") hostWorld.delete(worldKey);
      else hostWorld.set(worldKey, safe.type);
      applyEdit(safe);
      broadcast({ type: "blockEdited", edit: safe }, null);
    }
  }

  function attachConn(conn) {
    conn.on("data", (msg) => {
      if (isHost) onHostMessage(conn, msg);
      else onGuestMessage(msg);
    });

    conn.on("close", () => {
      if (isHost) {
        peers.delete(conn.peer);
        hostPlayers.delete(conn.peer);
        broadcast({ type: "playerLeft", id: conn.peer }, null);
      }
      removeRemotePlayer(conn.peer);
    });
  }

  function startHost() {
    isHost = true;
    roomStatusEl.textContent = `Hosting room: ${peer.id}`;
    roomInput.value = peer.id;

    hostWorld.clear();
    for (const [k, mesh] of world.entries()) {
      hostWorld.set(k, mesh.userData.type);
    }

    hostPlayers.set(selfId, {
      id: selfId,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      yaw: 0,
      pitch: 0,
      texture: selfTexture
    });

    peer.on("connection", (conn) => {
      peers.set(conn.peer, conn);
      attachConn(conn);

      conn.on("open", () => {
        const initPlayers = Array.from(hostPlayers.values());
        const initBlocks = Array.from(hostWorld.entries()).map(([k, type]) => {
          const [x, y, z] = k.split(",").map(Number);
          return { x, y, z, type };
        });

        conn.send({
          type: "init",
          yourId: conn.peer,
          blocks: initBlocks,
          players: initPlayers
        });
      });
    });
  }

  function joinHost(hostId) {
    if (!hostId) return;
    const conn = peer.connect(hostId, { reliable: true });
    hostConnection = conn;
    attachConn(conn);
    conn.on("open", () => {
      roomStatusEl.textContent = `Connected to host: ${hostId}`;
    });
    conn.on("error", () => {
      roomStatusEl.textContent = "Connection error. Check host ID.";
    });
  }

  function onGuestMessage(msg) {
    if (msg.type === "init") {
      setWorldFromBlocks(msg.blocks || []);
      (msg.players || []).forEach(upsertRemotePlayer);
      return;
    }
    if (msg.type === "playerMoved") upsertRemotePlayer(msg.player);
    if (msg.type === "playerLeft") removeRemotePlayer(msg.id);
    if (msg.type === "playerTexture") {
      const mesh = remotePlayers.get(msg.id);
      if (mesh) mesh.material.color.setHex(skinColors[msg.texture] || skinColors.blue);
    }
    if (msg.type === "blockEdited") applyEdit(msg.edit);
  }

  peer.on("open", (id) => {
    roomStatusEl.textContent = `Your peer ID: ${id}`;
  });

  hostBtn.addEventListener("click", startHost);
  joinBtn.addEventListener("click", () => joinHost(roomInput.value.trim()));

  const keys = new Set();
  const velocity = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let yaw = 0;
  let pitch = 0;
  let pointerLocked = false;

  document.addEventListener("keydown", (e) => keys.add(e.code));
  document.addEventListener("keyup", (e) => keys.delete(e.code));
  document.body.addEventListener("click", () => renderer.domElement.requestPointerLock());
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
    selfTexture = skinSelect.value;
    if (isHost) {
      const me = hostPlayers.get(selfId);
      if (me) me.texture = selfTexture;
      broadcast({ type: "playerTexture", id: selfId, texture: selfTexture }, null);
    } else if (hostConnection && hostConnection.open) {
      hostConnection.send({ type: "setTexture", id: selfId, texture: selfTexture });
    }
  });

  const raycaster = new THREE.Raycaster();
  window.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("mousedown", (e) => {
    if (!pointerLocked) return;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersections = raycaster.intersectObjects(worldGroup.children, false);
    if (!intersections.length) return;

    const hit = intersections[0];
    const block = hit.object.userData.grid;
    let edit = null;

    if (e.button === 0) {
      edit = { action: "remove", x: block.x, y: block.y, z: block.z, type: "grass" };
    } else if (e.button === 2) {
      const n = hit.face.normal;
      edit = {
        action: "add",
        x: Math.round(block.x + n.x),
        y: Math.round(block.y + n.y),
        z: Math.round(block.z + n.z),
        type: blockSelect.value
      };
    }

    if (!edit) return;

    if (isHost) {
      const safe = validateBlockEdit(edit);
      if (!safe) return;
      applyEdit(safe);
      hostWorld.set(key(safe.x, safe.y, safe.z), safe.type);
      if (safe.action === "remove") hostWorld.delete(key(safe.x, safe.y, safe.z));
      broadcast({ type: "blockEdited", edit: safe }, null);
    } else if (hostConnection && hostConnection.open) {
      hostConnection.send({ type: "editBlock", id: selfId, edit });
    }
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
    velocity.copy(dir).multiplyScalar(8 * dt).applyEuler(camera.rotation);
    camera.position.add(velocity);

    const move = {
      type: "move",
      id: selfId,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      yaw,
      pitch,
      texture: selfTexture
    };

    if (isHost) {
      hostPlayers.set(selfId, move);
      broadcast({ type: "playerMoved", player: move }, null);
    } else if (hostConnection && hostConnection.open) {
      hostConnection.send(move);
    }

    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  statusEl.textContent = "Ready. Host or Join to play multiplayer.";
})();
