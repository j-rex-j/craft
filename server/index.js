import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;
const WORLD_SIZE = 32;
const WORLD_HEIGHT = 16;
const worldBlocks = new Map();
const players = new Map();

function key(x, y, z) {
  return `${x},${y},${z}`;
}

function generateWorld() {
  for (let x = -WORLD_SIZE / 2; x < WORLD_SIZE / 2; x += 1) {
    for (let z = -WORLD_SIZE / 2; z < WORLD_SIZE / 2; z += 1) {
      worldBlocks.set(key(x, 0, z), { x, y: 0, z, type: "grass" });
      worldBlocks.set(key(x, -1, z), { x, y: -1, z, type: "dirt" });
      worldBlocks.set(key(x, -2, z), { x, y: -2, z, type: "stone" });

      if ((x + z) % 11 === 0) {
        for (let y = 1; y <= 3; y += 1) {
          worldBlocks.set(key(x, y, z), { x, y, z, type: "wood" });
        }
        for (let lx = -2; lx <= 2; lx += 1) {
          for (let lz = -2; lz <= 2; lz += 1) {
            for (let ly = 3; ly <= 5; ly += 1) {
              if (Math.abs(lx) + Math.abs(lz) < 4) {
                const tx = x + lx;
                const tz = z + lz;
                worldBlocks.set(key(tx, ly, tz), { x: tx, y: ly, z: tz, type: "leaf" });
              }
            }
          }
        }
      }
    }
  }
}

generateWorld();

app.use(express.static(path.join(__dirname, "..", "public")));

io.on("connection", (socket) => {
  const spawn = {
    id: socket.id,
    x: 0,
    y: 3,
    z: 0,
    yaw: 0,
    pitch: 0,
    texture: "blue"
  };

  players.set(socket.id, spawn);

  socket.emit("init", {
    selfId: socket.id,
    worldSize: WORLD_SIZE,
    worldHeight: WORLD_HEIGHT,
    blocks: Array.from(worldBlocks.values()),
    players: Array.from(players.values())
  });

  socket.broadcast.emit("playerJoined", spawn);

  socket.on("setTexture", (texture) => {
    const player = players.get(socket.id);
    if (!player) return;
    player.texture = texture;
    io.emit("playerTexture", { id: socket.id, texture });
  });

  socket.on("move", (update) => {
    const player = players.get(socket.id);
    if (!player) return;

    player.x = Number(update.x) || 0;
    player.y = Number(update.y) || 0;
    player.z = Number(update.z) || 0;
    player.yaw = Number(update.yaw) || 0;
    player.pitch = Number(update.pitch) || 0;

    socket.broadcast.emit("playerMoved", player);
  });

  socket.on("editBlock", (edit) => {
    const { x, y, z, type, action } = edit;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(z) ||
      x < -WORLD_SIZE ||
      x > WORLD_SIZE ||
      z < -WORLD_SIZE ||
      z > WORLD_SIZE ||
      y < -8 ||
      y > WORLD_HEIGHT + 8
    ) {
      return;
    }

    const posKey = key(x, y, z);

    if (action === "remove") {
      worldBlocks.delete(posKey);
      io.emit("blockEdited", { action: "remove", x, y, z });
      return;
    }

    const safeType = ["grass", "dirt", "stone", "wood", "leaf", "sand", "brick"].includes(type)
      ? type
      : "grass";

    worldBlocks.set(posKey, { x, y, z, type: safeType });
    io.emit("blockEdited", { action: "add", x, y, z, type: safeType });
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("playerLeft", socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Voxel server running on http://localhost:${PORT}`);
});
