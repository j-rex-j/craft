# Voxel Online

A lightweight browser-based multiplayer 3D voxel sandbox inspired by classic block-building gameplay loops.

## Features

- Real-time multiplayer movement synced with Socket.IO
- Place and remove voxel blocks with mouse clicks
- Procedurally generated starter map with terrain + trees
- Custom block textures generated as pixel-art style materials
- Selectable player color/"skin" texture profile

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:3000` in multiple browser tabs/windows.

To preview two clients side-by-side in one browser window, open `http://localhost:3000/preview.html`.

## Controls

- Click game window: lock mouse
- `WASD`: move
- `Space` / `Shift`: up/down (free-fly)
- Left click: remove block
- Right click: place selected block
