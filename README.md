# Voxel Online (Browser-Only)

A browser-only multiplayer 3D voxel sandbox inspired by classic block-building gameplay.

## What changed

This version runs completely in the browser:

- No `npm install`
- No local Node.js server
- Multiplayer uses WebRTC data channels via PeerJS cloud signaling

## Run

Open either file in a browser:

- `public/index.html` (single client)
- `public/preview.html` (two side-by-side clients for quick host/join testing)

> If your browser blocks opening local files, serve the folder with any static host (for example GitHub Pages, Netlify, or any drag-and-drop static host).

## Multiplayer flow

1. In one tab/window click **Host Session**.
2. Copy the shown host ID.
3. In another tab/window enter that host ID and click **Join**.

## Controls

- Click game canvas: lock mouse
- `WASD`: move
- `Space` / `Shift`: up/down (free-fly)
- Left click: remove block
- Right click: place selected block
