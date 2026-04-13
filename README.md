# Local SNES Homebrew Runner

A fully local SNES emulator website for running **homebrew ROMs** in your browser.

## Features

- Works on `http://localhost` with no cloud services.
- Loads `.sfc`, `.smc`, and `.zip` ROM files.
- Keyboard controls mapped to SNES pad buttons.
- Includes pause, reset, and power-cycle controls.
- Drag-and-drop ROM loading.

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Notes

- Bring your own legal homebrew ROM files.
- The emulator core is based on the open-source SnesJs project by angelo_wf.
