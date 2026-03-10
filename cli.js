#!/usr/bin/env node

const { Command } = require("commander");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PID_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || __dirname,
  ".ad-sim.pids"
);

function isPackaged() {
  // In packaged Electron app, process.resourcesPath exists and there's no node_modules/electron
  try {
    require.resolve("electron");
    return false;
  } catch (_) {
    return true;
  }
}

function getElectronCommand() {
  if (isPackaged()) {
    // Packaged: the executable itself is the Electron binary
    return { cmd: process.argv[0], args: [path.join(__dirname, "main.js")] };
  } else {
    // Dev mode: use electron from node_modules
    const electronPath = require("electron");
    return { cmd: electronPath, args: [path.join(__dirname, "main.js")] };
  }
}

function savePid(pid) {
  const pids = loadPids();
  pids.push(pid);
  fs.writeFileSync(PID_FILE, pids.join("\n"), "utf8");
}

function loadPids() {
  try {
    return fs
      .readFileSync(PID_FILE, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(Number);
  } catch (_) {
    return [];
  }
}

function clearPidFile() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch (_) {}
}

const program = new Command();

program
  .name("ad-sim")
  .description("Annoying ad popup simulator - for educational purposes only")
  .version("1.0.2");

// Kill subcommand
program
  .command("kill")
  .description("Kill all running ad-sim popups")
  .action(() => {
    const { cmd, args } = getElectronCommand();
    const child = spawn(cmd, [...args, "kill"], { stdio: "inherit" });
    child.on("close", (code) => process.exit(code));
  });

// Default start command
program
  .command("start", { isDefault: true })
  .description("Launch ad popups")
  .option("-c, --popup-count <number>", "number of popup windows", "3")
  .option(
    "-s, --style <type>",
    "popup behavior: bounce | drift | chase | mixed",
    "mixed"
  )
  .option("--speed <number>", "movement speed 1-10", "5")
  .option(
    "--fake-close <number>",
    "number of fake close buttons per popup (0-5)",
    "2"
  )
  .option("--respawn", "popups respawn when closed", false)
  .option(
    "--spawn-interval <ms>",
    "interval between spawning popups in ms",
    "800"
  )
  .option(
    "--chaos",
    "enable full chaos mode (overrides other settings)",
    false
  )
  .option(
    "--duration <seconds>",
    "auto-quit after N seconds (0 = manual quit)",
    "0"
  )
  .option(
    "--theme <type>",
    "ad theme: casino | dating | virus | winner | mixed",
    "mixed"
  )
  .option(
    "--size <type>",
    "popup size: small | medium | large | random",
    "random"
  )
  .option("--sound", "enable annoying sounds", false)
  .option(
    "--disguise <name>",
    "disguise process name in task manager (presets: systemd, chrome, vscode, svchost, teams, slack, updater, random; or any custom name)",
    "random"
  )
  .option("--foreground", "run in foreground instead of background", false)
  .action((opts) => {
    if (opts.chaos) {
      opts.popupCount = "8";
      opts.style = "mixed";
      opts.speed = "10";
      opts.fakeClose = "5";
      opts.respawn = true;
      opts.theme = "mixed";
      opts.size = "random";
      opts.sound = true;
      opts.disguise = "random";
    }

    const { cmd, args } = getElectronCommand();
    const electronArgs = [
      ...args,
      `--popup-count=${opts.popupCount}`,
      `--style=${opts.style}`,
      `--speed=${opts.speed}`,
      `--fake-close=${opts.fakeClose}`,
      `--respawn=${opts.respawn}`,
      `--spawn-interval=${opts.spawnInterval}`,
      `--duration=${opts.duration}`,
      `--theme=${opts.theme}`,
      `--size=${opts.size}`,
      `--sound=${opts.sound}`,
      `--disguise=${opts.disguise}`,
    ];

    if (opts.foreground) {
      const child = spawn(cmd, electronArgs, { stdio: "inherit" });
      savePid(child.pid);
      child.on("close", (code) => {
        const remaining = loadPids().filter((p) => p !== child.pid);
        if (remaining.length > 0) {
          fs.writeFileSync(PID_FILE, remaining.join("\n"), "utf8");
        } else {
          clearPidFile();
        }
        process.exit(code);
      });
    } else {
      const logFile = path.join(__dirname, ".ad-sim.log");
      const out = fs.openSync(logFile, "a");
      const child = spawn(cmd, electronArgs, {
        detached: true,
        stdio: ["ignore", out, out],
      });
      savePid(child.pid);
      child.unref();
      console.log(`Ad simulator launched in background (PID: ${child.pid})`);
      console.log(`Use "ad-sim kill" to stop all ads.`);
      process.exit(0);
    }
  });

program.parse();
