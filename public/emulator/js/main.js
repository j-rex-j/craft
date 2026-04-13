let c = el("output");
c.width = 512;
c.height = 480;
let ctx = c.getContext("2d");
let imgData = ctx.getImageData(0, 0, 512, 480);

let loopId = 0;
let loaded = false;
let paused = false;
let pausedInBg = false;

let romArr = new Uint8Array([]);

let snes = new Snes();

let audioHandler = new AudioHandler();

let logging = false;
let noPpu = false;

const statusEl = el("status");
const romInputEl = el("rom");
const romLabelEl = document.querySelector(".file-input");

zip.workerScriptsPath = "emulator/lib/";
zip.useWebWorkers = false;

let controlsP1 = {
  z: 0,
  a: 1,
  shift: 2,
  enter: 3,
  arrowup: 4,
  arrowdown: 5,
  arrowleft: 6,
  arrowright: 7,
  x: 8,
  s: 9,
  d: 10,
  c: 11
};

romInputEl.onchange = function(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  romLabelEl.textContent = `ROM: ${file.name}`;
  loadFile(file);
};

el("pause").onclick = function() {
  if (paused && loaded) {
    loopId = requestAnimationFrame(update);
    audioHandler.start();
    paused = false;
    el("pause").textContent = "Pause";
    statusEl.textContent = "Running.";
  } else {
    cancelAnimationFrame(loopId);
    audioHandler.stop();
    paused = true;
    el("pause").textContent = "Continue";
    statusEl.textContent = "Paused.";
  }
};

el("reset").onclick = function() {
  snes.reset(false);
  statusEl.textContent = "Soft reset completed.";
};

el("hardreset").onclick = function() {
  snes.reset(true);
  statusEl.textContent = "Power cycle completed.";
};

el("runframe").onclick = function() {
  if (loaded) runFrame();
};

el("ishirom").onchange = function() {
  if (loaded) loadRom(romArr);
};

document.onvisibilitychange = function() {
  if (document.hidden) {
    pausedInBg = false;
    if (!paused && loaded) {
      el("pause").click();
      pausedInBg = true;
    }
  } else if (pausedInBg && loaded) {
    el("pause").click();
    pausedInBg = false;
  }
};

window.addEventListener("dragover", (event) => {
  event.preventDefault();
});

window.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  romLabelEl.textContent = `ROM: ${file.name}`;
  loadFile(file);
});

function loadFile(file) {
  let freader = new FileReader();
  freader.onload = function() {
    let buf = freader.result;
    if (file.name.toLowerCase().endsWith(".zip")) {
      let blob = new Blob([buf]);
      zip.createReader(new zip.BlobReader(blob), function(reader) {
        reader.getEntries(function(entries) {
          if (!entries.length) {
            log("Zip file was empty");
            statusEl.textContent = "ZIP was empty.";
            return;
          }
          let found = false;
          for (let i = 0; i < entries.length; i++) {
            let name = entries[i].filename.toLowerCase();
            if (!name.endsWith(".smc") && !name.endsWith(".sfc")) continue;
            found = true;
            log("Loaded \"" + entries[i].filename + "\" from zip");
            entries[i].getData(new zip.BlobWriter(), function(blobFile) {
              let breader = new FileReader();
              breader.onload = function() {
                romArr = new Uint8Array(breader.result);
                loadRom(romArr);
                reader.close(function() {});
              };
              breader.readAsArrayBuffer(blobFile);
            });
            break;
          }
          if (!found) {
            log("No .smc or .sfc file found in zip");
            statusEl.textContent = "No SNES ROM found in ZIP.";
          }
        });
      }, function(err) {
        log("Failed to read zip: " + err);
        statusEl.textContent = "Failed to open ZIP.";
      });
    } else {
      romArr = new Uint8Array(buf);
      loadRom(romArr);
    }
  };
  freader.readAsArrayBuffer(file);
}

function loadRom(rom) {
  let hiRom = el("ishirom").checked;
  if (snes.loadRom(rom, hiRom)) {
    snes.reset(true);
    if (!loaded && !paused) {
      loopId = requestAnimationFrame(update);
      audioHandler.start();
    }
    loaded = true;
    statusEl.textContent = "ROM loaded. Running locally in your browser.";
    log("ROM loaded successfully.");
  } else {
    statusEl.textContent = "Failed to load ROM.";
    log("ROM failed to load.");
  }
}

function runFrame() {
  if (logging) {
    do {
      snes.cycle();
    } while (
      snes.cpuCyclesLeft > 0 ||
      (snes.xPos >= 536 && snes.xPos < 576) ||
      snes.hdmaTimer > 0
    );
    log(getTrace(snes.cpu, snes.frames * 1364 * 262 + snes.yPos * 1364 + snes.xPos));
  } else {
    snes.runFrame(noPpu);
  }

  snes.setPixels(imgData.data);
  ctx.putImageData(imgData, 0, 0);
  snes.setSamples(audioHandler.sampleBufferL, audioHandler.sampleBufferR, audioHandler.samplesPerFrame);
  audioHandler.nextBuffer();
}

function update() {
  runFrame();
  loopId = requestAnimationFrame(update);
}

window.onkeydown = function(e) {
  switch (e.key) {
    case "l":
    case "L": {
      logging = !logging;
      statusEl.textContent = `Trace mode ${logging ? "enabled" : "disabled"}.`;
      break;
    }
    case "p":
    case "P": {
      noPpu = !noPpu;
      statusEl.textContent = `No-PPU mode ${noPpu ? "enabled" : "disabled"}.`;
      break;
    }
  }
  if (controlsP1[e.key.toLowerCase()] !== undefined) {
    e.preventDefault();
    snes.setPad1ButtonPressed(controlsP1[e.key.toLowerCase()]);
  }
};

window.onkeyup = function(e) {
  if (controlsP1[e.key.toLowerCase()] !== undefined) {
    e.preventDefault();
    snes.setPad1ButtonReleased(controlsP1[e.key.toLowerCase()]);
  }
};

function log(text) {
  el("log").textContent += text + "\n";
  el("log").scrollTop = el("log").scrollHeight;
}

function el(id) {
  return document.getElementById(id);
}
