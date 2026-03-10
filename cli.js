#!/usr/bin/env node

const { Command } = require("commander");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const PID_FILE = path.join(__dirname, ".ad-sim.pids");

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

function killAll() {
  let killed = 0;

  // 1. Kill PIDs from PID file
  const pids = loadPids();
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
      killed++;
    } catch (_) {}
  }

  // 2. Also scan for any rogue electron ad-sim processes (covers disguised ones)
  try {
    const platform = process.platform;
    let cmd;
    if (platform === "win32") {
      cmd = 'wmic process where "commandline like \'%ad/main.js%\' or commandline like \'%ad\\\\main.js%\'" get processid /format:list 2>nul';
    } else {
      cmd = "ps aux";
    }
    const out = execSync(cmd, { encoding: "utf8", timeout: 3000 });

    if (platform === "win32") {
      const winPids = out.match(/ProcessId=(\d+)/g) || [];
      for (const m of winPids) {
        const pid = parseInt(m.split("=")[1]);
        if (pid && !pids.includes(pid)) {
          try {
            process.kill(pid, "SIGTERM");
            killed++;
          } catch (_) {}
        }
      }
    } else {
      // Match lines containing our electron + main.js
      for (const line of out.split("\n")) {
        if (
          line.includes("ad/main.js") &&
          line.includes("electron") &&
          !line.includes("grep")
        ) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[1]);
          if (pid && !pids.includes(pid)) {
            try {
              process.kill(pid, "SIGTERM");
              killed++;
            } catch (_) {}
          }
        }
      }
    }
  } catch (_) {}

  clearPidFile();

  // 3. Wait briefly, then force kill any survivors
  setTimeout(() => {
    try {
      const platform = process.platform;
      if (platform === "win32") {
        execSync(
          'wmic process where "commandline like \'%ad/main.js%\' or commandline like \'%ad\\\\main.js%\'" call terminate 2>nul',
          { encoding: "utf8", timeout: 3000 }
        );
      } else {
        const out = execSync("ps aux", { encoding: "utf8", timeout: 3000 });
        for (const line of out.split("\n")) {
          if (
            line.includes("ad/main.js") &&
            line.includes("electron") &&
            !line.includes("grep")
          ) {
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[1]);
            if (pid) {
              try {
                process.kill(pid, "SIGKILL");
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}

    console.log(
      killed > 0
        ? `Killed ${killed} ad-sim process(es). All ads stopped.`
        : "No running ad-sim processes found."
    );
    process.exit(0);
  }, 500);
}

const program = new Command();

program
  .name("ad-sim")
  .description("Annoying ad popup simulator - for educational purposes only")
  .version("1.0.0");

// Kill subcommand
program
  .command("kill")
  .description("Kill all running ad-sim popups")
  .action(() => {
    killAll();
  });

// Default start command
program
  .command("start", { isDefault: true })
  .description("Launch ad popups")
  .option("-c, --popup-count <number>", "number of popup windows", "3")
  .option(
    "-s, --style <type>",
    "popup behavior: bounce | drift | teleport | chase | mixed",
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

    const electronPath = require("electron");
    const args = [
      path.join(__dirname, "main.js"),
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
      // Foreground mode: stdio inherited, ctrl+c kills it
      const child = spawn(electronPath, args, { stdio: "inherit" });
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
      // Background mode (default): detach and exit CLI immediately
      const logFile = path.join(__dirname, ".ad-sim.log");
      const out = fs.openSync(logFile, "a");
      const child = spawn(electronPath, args, {
        detached: true,
        stdio: ["ignore", out, out],
      });
      savePid(child.pid);
      child.unref();
      console.log(`Ad simulator launched in background (PID: ${child.pid})`);
      console.log(`Use "node cli.js kill" to stop all ads.`);
      process.exit(0);
    }
  });

program.parse();
