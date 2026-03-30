#!/usr/bin/env node

const { spawn, spawnSync } = require("child_process");
const { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const ROOT_DIR = path.resolve(__dirname, "..");
const SITE_ROOT_DIR = path.resolve(ROOT_DIR, "..");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const LOGS_DIR = path.join(ROOT_DIR, ".logs");
const STATE_DIR = path.join(ROOT_DIR, ".dev");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const SITE_BACKEND_ENV_FILE = path.join(SITE_ROOT_DIR, ".env.backend");

const IS_WIN = process.platform === "win32";

const PORTS = {
  backend: Number.parseInt(process.env.BACKEND_PORT || "3002", 10),
  frontend: Number.parseInt(process.env.FRONTEND_PORT || "3003", 10),
};

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
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
    const transport = url.startsWith("https://") ? https : http;
    const request = transport.get(url, { timeout: timeoutMs }, (response) => {
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

function hasTool(command) {
  return run(command, ["--version"], { capture: true, allowFail: true }).status === 0;
}

function ensureTool(command, description) {
  if (!hasTool(command)) {
    throw new Error(`${description} is required but ${command} was not found in PATH.`);
  }
}

function ensureEnvFile(targetPath, examplePath) {
  if (!existsSync(targetPath)) {
    copyFileSync(examplePath, targetPath);
  }
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const values = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
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

function removeEnvKey(filePath, key) {
  if (!existsSync(filePath)) {
    return;
  }

  const pattern = new RegExp(`^${key}=.*$`);
  const next = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => !pattern.test(line))
    .join("\n")
    .replace(/\n+$/, "");

  writeFileSync(filePath, next ? `${next}\n` : "");
}

function resolveRuntimeConfig(backendEnvPath) {
  const siteEnv = parseEnvFile(SITE_BACKEND_ENV_FILE);
  const backendEnv = parseEnvFile(backendEnvPath);

  return {
    voiddb: {
      url: (process.env.VOIDDB_URL || siteEnv.VOIDDB_URL || "https://db.lowkey.su").replace(/\/$/, ""),
      database: process.env.VOIDDB_DATABASE || siteEnv.VOIDDB_DATABASE || "english",
      token: process.env.VOIDDB_TOKEN || siteEnv.VOIDDB_TOKEN || backendEnv.VOIDDB_TOKEN || "",
      username: process.env.VOIDDB_USERNAME || siteEnv.VOIDDB_USERNAME || backendEnv.VOIDDB_USERNAME || "",
      password: process.env.VOIDDB_PASSWORD || siteEnv.VOIDDB_PASSWORD || backendEnv.VOIDDB_PASSWORD || "",
    },
    openrouter: {
      url: (process.env.OPENROUTER_URL || siteEnv.OPENROUTER_URL || backendEnv.OPENROUTER_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
      apiKey: process.env.OPENROUTER_API_KEY || siteEnv.OPENROUTER_API_KEY || backendEnv.OPENROUTER_API_KEY || "",
      model: process.env.OPENROUTER_MODEL || siteEnv.OPENROUTER_MODEL || siteEnv.OPENROUTER_DEFAULT_MODEL || backendEnv.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      siteUrl: process.env.OPENROUTER_SITE_URL || backendEnv.OPENROUTER_SITE_URL || `http://localhost:${PORTS.frontend}`,
      siteName: process.env.OPENROUTER_SITE_NAME || backendEnv.OPENROUTER_SITE_NAME || "LowKey English",
      temperature: process.env.OPENROUTER_TEMPERATURE || backendEnv.OPENROUTER_TEMPERATURE || "0.7",
      maxTokens: process.env.OPENROUTER_MAX_TOKENS || backendEnv.OPENROUTER_MAX_TOKENS || "2048",
    },
  };
}

function hasVoidDbAuth(runtime) {
  return Boolean(runtime.voiddb.token || (runtime.voiddb.username && runtime.voiddb.password));
}

function ensureEnvFiles() {
  const backendEnvPath = path.join(BACKEND_DIR, ".env");
  const frontendEnvPath = path.join(FRONTEND_DIR, ".env.local");

  ensureEnvFile(backendEnvPath, path.join(BACKEND_DIR, ".env.example"));
  ensureEnvFile(frontendEnvPath, path.join(FRONTEND_DIR, ".env.local.example"));

  const runtime = resolveRuntimeConfig(backendEnvPath);

  upsertEnvValue(backendEnvPath, "HOST", "0.0.0.0");
  upsertEnvValue(backendEnvPath, "PORT", String(PORTS.backend));
  upsertEnvValue(backendEnvPath, "VOIDDB_URL", runtime.voiddb.url);
  upsertEnvValue(backendEnvPath, "VOIDDB_DATABASE", runtime.voiddb.database);
  upsertEnvValue(backendEnvPath, "VOIDDB_USERNAME", runtime.voiddb.username);
  upsertEnvValue(backendEnvPath, "VOIDDB_PASSWORD", runtime.voiddb.password);
  upsertEnvValue(backendEnvPath, "VOIDDB_TOKEN", runtime.voiddb.token);
  upsertEnvValue(backendEnvPath, "OPENROUTER_URL", runtime.openrouter.url);
  upsertEnvValue(backendEnvPath, "OPENROUTER_API_KEY", runtime.openrouter.apiKey);
  upsertEnvValue(backendEnvPath, "OPENROUTER_MODEL", runtime.openrouter.model);
  upsertEnvValue(backendEnvPath, "OPENROUTER_SITE_URL", runtime.openrouter.siteUrl);
  upsertEnvValue(backendEnvPath, "OPENROUTER_SITE_NAME", runtime.openrouter.siteName);
  upsertEnvValue(backendEnvPath, "OPENROUTER_TEMPERATURE", runtime.openrouter.temperature);
  upsertEnvValue(backendEnvPath, "OPENROUTER_MAX_TOKENS", runtime.openrouter.maxTokens);
  upsertEnvValue(backendEnvPath, "FRONTEND_URL", `http://localhost:${PORTS.frontend}`);
  upsertEnvValue(
    backendEnvPath,
    "CORS_ORIGINS",
    `http://localhost:${PORTS.frontend},http://127.0.0.1:${PORTS.frontend},https://english.lowkey.su`
  );
  removeEnvKey(backendEnvPath, "VOIDDB_API_KEY");
  removeEnvKey(backendEnvPath, "BITLLM_URL");
  removeEnvKey(backendEnvPath, "BITLLM_API_KEY");

  upsertEnvValue(frontendEnvPath, "NEXT_PUBLIC_API_URL", "/api");
  upsertEnvValue(frontendEnvPath, "BACKEND_URL", `http://localhost:${PORTS.backend}`);
  upsertEnvValue(frontendEnvPath, "NEXT_PUBLIC_SITE_URL", `http://localhost:${PORTS.frontend}`);

  return runtime;
}

function ensureDependencies() {
  ensureTool("node", "Node.js");
  ensureTool("npm", "npm");
  ensureTool("bun", "Bun");

  if (!existsSync(path.join(BACKEND_DIR, "node_modules"))) {
    logInfo("installing backend dependencies with bun install");
    run("bun", ["install"], { cwd: BACKEND_DIR });
  }

  if (!existsSync(path.join(FRONTEND_DIR, "node_modules"))) {
    logInfo("installing frontend dependencies with npm install --legacy-peer-deps");
    run("npm", ["install", "--legacy-peer-deps"], { cwd: FRONTEND_DIR });
  }
}

async function syncDb(runtime) {
  if (!hasVoidDbAuth(runtime)) {
    throw new Error(
      "VoidDB auth is missing. Set VOIDDB_TOKEN or VOIDDB_USERNAME/VOIDDB_PASSWORD in english/backend/.env, site/.env.backend, or the shell environment."
    );
  }

  logInfo(`syncing schema to ${runtime.voiddb.url} (database ${runtime.voiddb.database})`);

  run("bun", ["run", "scripts/sync-db.ts"], {
    cwd: BACKEND_DIR,
    env: {
      VOIDDB_URL: runtime.voiddb.url,
      VOIDDB_DATABASE: runtime.voiddb.database,
      VOIDDB_TOKEN: runtime.voiddb.token,
      VOIDDB_USERNAME: runtime.voiddb.username,
      VOIDDB_PASSWORD: runtime.voiddb.password,
    },
  });
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

async function stopAll() {
  const state = readState();
  if (!state) {
    logWarn("no running dev state found");
    return;
  }

  for (const pid of state.pids || []) {
    killPid(pid);
  }

  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }

  logOk("dev stack stopped");
}

async function status() {
  const runtime = resolveRuntimeConfig(path.join(BACKEND_DIR, ".env"));
  const checks = [
    ["VoidDB", `${runtime.voiddb.url}/health`],
    ["Backend", `http://localhost:${PORTS.backend}/health`],
    ["Frontend", `http://localhost:${PORTS.frontend}`],
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

function printBanner(runtime) {
  log("");
  log("LowKey English dev stack");
  log(`Frontend: http://localhost:${PORTS.frontend}`);
  log(`Backend:  http://localhost:${PORTS.backend}`);
  log(`VoidDB:   ${runtime.voiddb.url} (db: ${runtime.voiddb.database})`);
  log(`AI:       ${runtime.openrouter.model} via ${runtime.openrouter.url}`);
  log(`Logs:     ${LOGS_DIR}`);
  log("");
}

async function start() {
  ensureDir(LOGS_DIR);
  ensureDir(STATE_DIR);
  const runtime = ensureEnvFiles();
  ensureDependencies();

  await syncDb(runtime);

  const backend = spawnService("backend", "bun", ["run", "dev"], {
    cwd: BACKEND_DIR,
    env: {
      HOST: "0.0.0.0",
      PORT: String(PORTS.backend),
      VOIDDB_URL: runtime.voiddb.url,
      VOIDDB_DATABASE: runtime.voiddb.database,
      VOIDDB_TOKEN: runtime.voiddb.token,
      VOIDDB_USERNAME: runtime.voiddb.username,
      VOIDDB_PASSWORD: runtime.voiddb.password,
      OPENROUTER_URL: runtime.openrouter.url,
      OPENROUTER_API_KEY: runtime.openrouter.apiKey,
      OPENROUTER_MODEL: runtime.openrouter.model,
      OPENROUTER_SITE_URL: runtime.openrouter.siteUrl,
      OPENROUTER_SITE_NAME: runtime.openrouter.siteName,
      OPENROUTER_TEMPERATURE: runtime.openrouter.temperature,
      OPENROUTER_MAX_TOKENS: runtime.openrouter.maxTokens,
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
  });

  const cleanup = async () => {
    if (existsSync(STATE_FILE)) {
      const state = readState();
      for (const pid of state?.pids || []) {
        killPid(pid);
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

  printBanner(runtime);
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
