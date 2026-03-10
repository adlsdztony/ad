# Ad Simulator

Cross-platform annoying ad popup simulator built with Electron. Controlled entirely via CLI. For educational/demonstration purposes.

## Project Structure

```
cli.js        - CLI entry point (commander). Parses args, spawns Electron in background, manages PIDs.
main.js       - Electron main process. Window creation, movement logic, process disguise, IPC handlers.
preload.js    - Context bridge exposing IPC methods (realClose, dodge, multiply) to renderer.
popup.html    - Single HTML file containing all popup UI, themes, styles, and renderer JS (no bundler).
.ad-sim.pids  - Runtime file storing PIDs of running instances (auto-managed, gitignored).
.ad-sim.log   - Runtime log file for background mode stdout/stderr.
```

## Architecture

- **No bundler/framework** — vanilla HTML/CSS/JS in a single `popup.html`. All styles are inline `<style>`, all JS is inline `<script>`.
- **Single Electron app, multiple BrowserWindows** — `main.js` spawns N `BrowserWindow` instances, each loading `popup.html` with different query params (`theme`, `style`, `speed`, `fakeClose`, `index`, `sound`).
- **CLI spawns Electron detached** — `cli.js` uses `spawn(electron, args, { detached: true })` so the CLI exits immediately and ads run in background. PID is saved to `.ad-sim.pids` for later `kill`.
- **IPC flow**: renderer → `preload.js` (contextBridge) → `ipcMain` handlers in `main.js`.

## Key Features

### Movement Styles (per-window, set via `--style`)
- `bounce` — DVD screensaver style, bounces off screen edges
- `drift` — orbits around anchor point using sin/cos
- `teleport` — randomly jumps to new position
- `chase` — follows mouse cursor
- `mixed` — each window gets a random style

### Themes (per-window, set via `--theme`)
`casino`, `dating`, `virus`, `winner`, `mixed`

### Fake Close Buttons
- Big "Close" button at bottom of each popup — clicking triggers random troll behavior (dodge, multiply, fake loading, button runs away, troll message). Sometimes dodges on hover.
- Small fake close buttons (`.fake-close`) positioned absolutely — 4 visual styles (btn, x, text, tiny). Also troll on click/hover.
- Real close is the tiny low-opacity `✕` in the titlebar.

### Process Disguise (`--disguise`, default: `random`)
- Main process: sets `process.title`, `process.argv[0]`, `app.setName()`, writes `/proc/self/comm` on Linux.
- Each BrowserWindow gets a different `win.setTitle()` from the preset pool.
- 28 presets organized by platform (Linux system services, macOS daemons, Windows services, cross-platform apps).

### Background Execution
- Default: detached background mode. CLI prints PID and exits.
- `--foreground`: traditional foreground mode (ctrl+c kills).
- `node cli.js kill`: reads `.ad-sim.pids` + scans `ps aux` for rogue processes, sends SIGTERM then SIGKILL.

## CLI Usage

```bash
node cli.js                          # launch 3 popups in background (default)
node cli.js --chaos                  # full chaos: 8 popups, max speed, respawn, sound
node cli.js -c 5 --style bounce      # 5 bouncing popups
node cli.js --foreground             # run in foreground (ctrl+c kills)
node cli.js kill                     # stop all running instances
```

## Commands

- `node cli.js [start] [options]` — launch popups (start is the default command)
- `node cli.js kill` — kill all running ad-sim processes

## Dependencies

- `electron` — window management and rendering
- `commander` — CLI argument parsing
- `electron-builder` (devDep) — packaging (not currently configured)

## Conventions

- All renderer code lives in `popup.html` — no separate JS/CSS files.
- Query params on the popup URL are the sole interface between main and renderer config.
- IPC channel names: `real-close`, `dodge`, `multiply`.
- Window limit: max 20 popups (hardcoded in `multiply` handler).
- Movement runs at 16ms intervals (~60fps) via `setInterval` in main process using `win.setPosition()`.
