#!/usr/bin/env node

const { spawn, spawnSync } = require("child_process");
const { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } = require("fs");
const path = require("path");
const http = require("http");

const ROOT_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const LOGS_DIR = path.join(ROOT_DIR, ".logs");
const STATE_DIR = path.join(ROOT_DIR, ".dev");
const STATE_FILE = path.join(STATE_DIR, "state.json");

const IS_WIN = process.platform === "win32";

const PORTS = {
  voiddb: Number.parseInt(process.env.VOIDDB_PORT || "7701", 10),
  backend: Number.parseInt(process.env.BACKEND_PORT || "3002", 10),
  frontend: Number.parseInt(process.env.FRONTEND_PORT || "3003", 10),
  bitllm: Number.parseInt(process.env.BITLLM_PORT || "8080", 10),
};

const VOIDDB_CONTAINER_NAME = process.env.VOIDDB_CONTAINER_NAME || "english-voiddb";
const VOIDDB_API_KEY = process.env.VOIDDB_API_KEY || "english-voiddb-key";

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  dim: "\x1b[2m",
};
const COMMAND_CACHE = new Map();

function resolveCommand(command) {
  if (!IS_WIN) {
    return command;
  }

  if (path.isAbsolute(command)) {
    return command;
  }

  const map = {
    bun: "bun.exe",
    docker: "docker.exe",
    node: "node.exe",
    npm: "npm.cmd",
    taskkill: "taskkill.exe",
  };

  if (COMMAND_CACHE.has(command)) {
    return COMMAND_CACHE.get(command);
  }

  const candidates = [map[command], command].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync("where.exe", [candidate], {
      shell: false,
      encoding: "utf8",
      stdio: "pipe",
    });

    if (result.status === 0) {
      const resolved = (result.stdout || "").split(/\r?\n/).find(Boolean)?.trim();
      if (resolved) {
        COMMAND_CACHE.set(command, resolved);
        return resolved;
      }
    }
  }

  return map[command] || command;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function logInfo(message) {
  log(`${COLORS.cyan}[dev]${COLORS.reset} ${message}`);
}

function logOk(message) {
  log(`${COLORS.green}[dev]${COLORS.reset} ${message}`);
}

function logWarn(message) {
  log(`${COLORS.yellow}[dev]${COLORS.reset} ${message}`);
}

function logError(message) {
  log(`${COLORS.red}[dev]${COLORS.reset} ${message}`);
}

function isCmdScript(command) {
  return IS_WIN && /\.(cmd|bat)$/i.test(command);
}

function quoteCmdArg(value) {
  if (!value) {
    return '""';
  }

  if (!/[\s"&^|<>]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function createSpawnSpec(command, args) {
  const resolved = resolveCommand(command);

  if (isCmdScript(resolved)) {
    const cmd = process.env.ComSpec || "cmd.exe";
    const script = [path.basename(resolved), ...args.map(quoteCmdArg)].join(" ");
    return {
      command: cmd,
      args: ["/d", "/s", "/c", script],
    };
  }

  return {
    command: resolved,
    args,
  };
}

function run(command, args, options = {}) {
  const spec = createSpawnSpec(command, args);
  const result = spawnSync(spec.command, spec.args, {
    cwd: options.cwd || ROOT_DIR,
    env: { ...process.env, ...(options.env || {}) },
    shell: false,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (!options.allowFail && result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    throw new Error(stderr || stdout || `${command} ${args.join(" ")} failed`);
  }

  return result;
}

function ensureDir(directory) {
  mkdirSync(directory, { recursive: true });
}

function checkHttp(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode && response.statusCode < 500);
    });

    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForHttp(url, label, timeoutSeconds = 120) {
  for (let second = 0; second < timeoutSeconds; second += 1) {
    if (await checkHttp(url)) {
      logOk(`${label} is ready at ${url}`);
      return true;
    }

    if (second > 0 && second % 15 === 0) {
      logInfo(`waiting for ${label}... ${second}s`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

function dockerPath(filePath) {
  const resolved = path.resolve(filePath);

  if (!IS_WIN) {
    return resolved;
  }

  return resolved
    .replace(/\\/g, "/")
    .replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
}

function hasTool(command) {
  return run(command, ["--version"], { capture: true, allowFail: true }).status === 0;
}

function ensureTool(command, description) {
  if (!hasTool(command)) {
    throw new Error(`${description} is required but ${command} was not found in PATH.`);
  }
}

function ensureDockerDaemon() {
  const result = run("docker", ["info"], { capture: true, allowFail: true });
  if (result.status !== 0) {
    throw new Error("Docker daemon is not running. Start Docker Desktop (or the Docker service) and try again.");
  }
}

function ensureEnvFile(targetPath, examplePath) {
  if (!existsSync(targetPath)) {
    copyFileSync(examplePath, targetPath);
  }
}

function upsertEnvValue(filePath, key, value) {
  const content = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;

  if (pattern.test(content)) {
    writeFileSync(filePath, content.replace(pattern, line));
    return;
  }

  const suffix = content.endsWith("\n") || content.length === 0 ? "" : "\n";
  writeFileSync(filePath, `${content}${suffix}${line}\n`);
}

function ensureEnvFiles() {
  const backendEnv = path.join(BACKEND_DIR, ".env");
  const frontendEnv = path.join(FRONTEND_DIR, ".env.local");

  ensureEnvFile(backendEnv, path.join(BACKEND_DIR, ".env.example"));
  ensureEnvFile(frontendEnv, path.join(FRONTEND_DIR, ".env.local.example"));

  upsertEnvValue(backendEnv, "HOST", "0.0.0.0");
  upsertEnvValue(backendEnv, "PORT", String(PORTS.backend));
  upsertEnvValue(backendEnv, "VOIDDB_URL", `http://localhost:${PORTS.voiddb}`);
  upsertEnvValue(backendEnv, "VOIDDB_API_KEY", VOIDDB_API_KEY);
  upsertEnvValue(backendEnv, "BITLLM_URL", `http://localhost:${PORTS.bitllm}`);
  upsertEnvValue(backendEnv, "FRONTEND_URL", `http://localhost:${PORTS.frontend}`);
  upsertEnvValue(
    backendEnv,
    "CORS_ORIGINS",
    `http://localhost:${PORTS.frontend},http://127.0.0.1:${PORTS.frontend},https://english.lowkey.su`
  );

  upsertEnvValue(frontendEnv, "NEXT_PUBLIC_API_URL", "/api");
  upsertEnvValue(frontendEnv, "BACKEND_URL", `http://localhost:${PORTS.backend}`);
  upsertEnvValue(frontendEnv, "NEXT_PUBLIC_SITE_URL", `http://localhost:${PORTS.frontend}`);
}

function ensureDependencies() {
  ensureTool("node", "Node.js");
  ensureTool("npm", "npm");
  ensureTool("bun", "Bun");
  ensureTool("docker", "Docker");
  ensureDockerDaemon();

  if (!existsSync(path.join(BACKEND_DIR, "node_modules"))) {
    logInfo("installing backend dependencies with bun install");
    run("bun", ["install"], { cwd: BACKEND_DIR });
  }

  if (!existsSync(path.join(FRONTEND_DIR, "node_modules"))) {
    logInfo("installing frontend dependencies with npm install --legacy-peer-deps");
    run("npm", ["install", "--legacy-peer-deps"], { cwd: FRONTEND_DIR });
  }
}

async function startVoidDb() {
  const healthUrl = `http://localhost:${PORTS.voiddb}/health`;
  if (await checkHttp(healthUrl)) {
    logOk(`VoidDB already available at ${healthUrl}`);
    return false;
  }

  ensureDir(path.join(BACKEND_DIR, ".voiddb", "schema"));
  ensureDir(path.join(BACKEND_DIR, ".voiddb", "data"));

  const schemaMount = dockerPath(path.join(BACKEND_DIR, ".voiddb", "schema"));
  const dataMount = dockerPath(path.join(BACKEND_DIR, ".voiddb", "data"));

  run("docker", ["rm", "-f", VOIDDB_CONTAINER_NAME], { allowFail: true, capture: true });
  run("docker", [
    "run",
    "-d",
    "--name",
    VOIDDB_CONTAINER_NAME,
    "--restart",
    "unless-stopped",
    "-p",
    `${PORTS.voiddb}:7700`,
    "-v",
    `${schemaMount}:/app/.voiddb/schema`,
    "-v",
    `${dataMount}:/app/data`,
    "-e",
    `VOIDDB_API_KEY=${VOIDDB_API_KEY}`,
    "-e",
    "VOIDDB_PORT=7700",
    "nopass0/voiddb:latest",
  ]);

  const ready = await waitForHttp(healthUrl, "VoidDB", 90);
  if (!ready) {
    throw new Error("VoidDB did not start successfully.");
  }

  return true;
}

async function syncDb(shouldRestartContainer) {
  logInfo("verifying database schema");

  const args = ["run", "scripts/sync-db.ts"];
  if (shouldRestartContainer) {
    args.push("--", "--restart-container");
  }

  run("bun", args, {
    cwd: BACKEND_DIR,
    env: {
      VOIDDB_URL: `http://localhost:${PORTS.voiddb}`,
      VOIDDB_API_KEY: VOIDDB_API_KEY,
      VOIDDB_CONTAINER_NAME: VOIDDB_CONTAINER_NAME,
    },
  });
}

async function startBitllm() {
  const ready = await checkHttp(`http://localhost:${PORTS.bitllm}/v1/models`);
  if (ready) {
    logOk(`BitLLM already available at http://localhost:${PORTS.bitllm}`);
    return false;
  }

  run(process.execPath, [path.join(ROOT_DIR, "scripts", "bitllm.js"), "start"], {
    env: { BITLLM_PORT: String(PORTS.bitllm) },
  });

  return true;
}

function prefixStream(service, stream, logFile, color) {
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    const lines = text.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      log(`${color}[${service}]${COLORS.reset} ${line}`);
    }

    writeFileSync(logFile, text, { flag: "a" });
  });
}

function spawnService(name, command, args, options) {
  const logFile = path.join(LOGS_DIR, `${name}.log`);
  const spec = createSpawnSpec(command, args);
  const child = spawn(spec.command, spec.args, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
    shell: false,
    detached: !IS_WIN,
    stdio: ["ignore", "pipe", "pipe"],
  });

  prefixStream(name, child.stdout, logFile, COLORS.blue);
  prefixStream(name, child.stderr, logFile, COLORS.red);

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      logWarn(`${name} exited with code ${code}`);
    }
  });

  return child;
}

function saveState(state) {
  ensureDir(STATE_DIR);
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function readState() {
  if (!existsSync(STATE_FILE)) {
    return null;
  }

  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

function killPid(pid) {
  if (IS_WIN) {
    run("taskkill", ["/PID", String(pid), "/T", "/F"], { allowFail: true, capture: true });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // ignore
    }
  }
}

function stopContainer(name) {
  run("docker", ["rm", "-f", name], { allowFail: true, capture: true });
}

async function stopAll() {
  const state = readState();
  if (!state) {
    logWarn("no running dev state found");
    return;
  }

  for (const pid of state.pids || []) {
    killPid(pid);
  }

  for (const container of state.ownedContainers || []) {
    stopContainer(container);
  }

  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }

  logOk("dev stack stopped");
}

async function status() {
  const checks = [
    ["VoidDB", `http://localhost:${PORTS.voiddb}/health`],
    ["Backend", `http://localhost:${PORTS.backend}/health`],
    ["Frontend", `http://localhost:${PORTS.frontend}`],
    ["BitLLM", `http://localhost:${PORTS.bitllm}/v1/models`],
  ];

  let failed = false;
  for (const [label, url] of checks) {
    const ok = await checkHttp(url);
    log(`${ok ? "OK " : "ERR"} ${label}: ${url}`);
    if (!ok) {
      failed = true;
    }
  }

  process.exit(failed ? 1 : 0);
}

function printBanner() {
  log("");
  log("LowKey English dev stack");
  log(`Frontend: http://localhost:${PORTS.frontend}`);
  log(`Backend:  http://localhost:${PORTS.backend}`);
  log(`VoidDB:   http://localhost:${PORTS.voiddb}`);
  log(`BitLLM:   http://localhost:${PORTS.bitllm}`);
  log(`Logs:     ${LOGS_DIR}`);
  log("");
}

async function start() {
  ensureDir(LOGS_DIR);
  ensureDir(STATE_DIR);
  ensureEnvFiles();
  ensureDependencies();

  const ownedContainers = [];

  const voidDbWasStarted = await startVoidDb();
  if (voidDbWasStarted) {
    ownedContainers.push(VOIDDB_CONTAINER_NAME);
  }

  await syncDb(!voidDbWasStarted);

  const bitllmWasStarted = await startBitllm();
  if (bitllmWasStarted) {
    ownedContainers.push("english-bitllm");
  }

  const backend = spawnService("backend", "bun", ["run", "dev"], {
    cwd: BACKEND_DIR,
    env: {
      HOST: "0.0.0.0",
      PORT: String(PORTS.backend),
      VOIDDB_URL: `http://localhost:${PORTS.voiddb}`,
      VOIDDB_API_KEY: VOIDDB_API_KEY,
      BITLLM_URL: `http://localhost:${PORTS.bitllm}`,
      FRONTEND_URL: `http://localhost:${PORTS.frontend}`,
      CORS_ORIGINS: `http://localhost:${PORTS.frontend},http://127.0.0.1:${PORTS.frontend},https://english.lowkey.su`,
    },
  });

  const backendReady = await waitForHttp(`http://localhost:${PORTS.backend}/health`, "backend", 120);
  if (!backendReady) {
    throw new Error("Backend did not become healthy.");
  }

  const frontend = spawnService("frontend", "npm", ["run", "dev", "--", "--hostname", "0.0.0.0", "--port", String(PORTS.frontend)], {
    cwd: FRONTEND_DIR,
    env: {
      NEXT_PUBLIC_API_URL: "/api",
      BACKEND_URL: `http://localhost:${PORTS.backend}`,
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORTS.frontend}`,
    },
  });

  const frontendReady = await waitForHttp(`http://localhost:${PORTS.frontend}`, "frontend", 180);
  if (!frontendReady) {
    throw new Error("Frontend did not become healthy.");
  }

  saveState({
    pids: [backend.pid, frontend.pid],
    ownedContainers,
  });

  const cleanup = async () => {
    if (existsSync(STATE_FILE)) {
      const state = readState();
      for (const pid of state?.pids || []) {
        killPid(pid);
      }

      for (const container of state?.ownedContainers || []) {
        stopContainer(container);
      }

      unlinkSync(STATE_FILE);
    }
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });

  printBanner();
  await new Promise(() => {});
}

async function main() {
  const command = process.argv[2] || "start";

  switch (command) {
    case "start":
      await start();
      return;
    case "stop":
      await stopAll();
      return;
    case "status":
      await status();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  logError(error.message);
  process.exit(1);
});
