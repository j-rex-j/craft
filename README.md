# Mini Teardown 3D

A browser-first 3D destruction sandbox inspired by Teardown-style gameplay.

## Why this version

- **No setup required:** open `public/index.html` directly in a browser with internet access.
- **CodeHS-friendly architecture:** single HTML/CSS/JS front-end with no build step.
- **Teardown-like loop:** walk into structures with collisions, swing a hammer, and detach voxel chunks that fall with gravity.
- **Denser city map:** many building lots with mixed tower sizes and annexes.

## Controls

- Click game view: lock mouse
- `WASD`: move
- Mouse: look around
- Left click: swing hammer and detach nearby cubes

## Optional local server

If you prefer serving files from localhost:

```bash
npm install
npm start
```

Then open `http://localhost:3000`.
