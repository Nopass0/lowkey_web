#!/usr/bin/env node

const { spawnSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");
const http = require("http");

const ROOT_DIR = path.resolve(__dirname, "..");
const BITNET_DIR = path.join(ROOT_DIR, "bitnet");
const IS_WIN = process.platform === "win32";

const BITLLM_PORT = Number.parseInt(process.env.BITLLM_PORT || "8080", 10);
const BITLLM_URL = (process.env.BITLLM_URL || `http://localhost:${BITLLM_PORT}`).replace(/\/$/, "");
const CONTAINER_NAME = process.env.BITLLM_CONTAINER_NAME || "english-bitllm";
const IMAGE_NAME = process.env.BITLLM_IMAGE || "lowkey-english-bitnet:latest";

const MODEL_DIR_NAME = process.env.BITNET_MODEL_DIR_NAME || "bitnet_b1_58-large";
const MODEL_REPO = process.env.BITNET_MODEL_REPO || "1bitLLM/bitnet_b1_58-large";
const QUANT_TYPE = process.env.BITNET_QUANT_TYPE || "i2_s";
const USE_PRETUNED = process.env.BITNET_USE_PRETUNED || "1";
const THREADS = process.env.BITNET_THREADS || "4";
const CTX_SIZE = process.env.BITNET_CTX_SIZE || "4096";
const TEMPERATURE = process.env.BITNET_TEMPERATURE || "0.7";
const N_PREDICT = process.env.BITNET_N_PREDICT || "1024";
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

  const candidates = [command, map[command]].filter(Boolean);
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

function run(command, args, options = {}) {
  const result = spawnSync(resolveCommand(command), args, {
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

function hasDocker() {
  return run("docker", ["info"], { capture: true, allowFail: true }).status === 0;
}

function containerExists() {
  const result = run(
    "docker",
    ["ps", "-a", "--filter", `name=^/${CONTAINER_NAME}$`, "--format", "{{.Names}}"],
    { capture: true, allowFail: true }
  );

  return (result.stdout || "").trim() === CONTAINER_NAME;
}

function imageExists() {
  return run("docker", ["image", "inspect", IMAGE_NAME], { capture: true, allowFail: true }).status === 0;
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

async function isReady() {
  return (
    await checkHttp(`${BITLLM_URL}/health`) ||
    await checkHttp(`${BITLLM_URL}/v1/models`)
  );
}

async function waitForReady(timeoutSeconds = 900) {
  for (let second = 0; second < timeoutSeconds; second += 1) {
    if (await isReady()) {
      return true;
    }

    if (second > 0 && second % 30 === 0) {
      console.log(`[bitllm] waiting... ${second}s`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

function buildImage() {
  if (!existsSync(path.join(BITNET_DIR, "Dockerfile"))) {
    throw new Error(`BitNet build context not found: ${BITNET_DIR}`);
  }

  console.log("[bitllm] building Docker image, this may take a while...");

  run("docker", [
    "build",
    "-t",
    IMAGE_NAME,
    "--build-arg",
    `BITNET_MODEL_REPO=${MODEL_REPO}`,
    "--build-arg",
    `BITNET_MODEL_DIR_NAME=${MODEL_DIR_NAME}`,
    "--build-arg",
    `BITNET_QUANT_TYPE=${QUANT_TYPE}`,
    "--build-arg",
    `BITNET_USE_PRETUNED=${USE_PRETUNED}`,
    BITNET_DIR,
  ]);
}

function runContainer() {
  if (containerExists()) {
    run("docker", ["rm", "-f", CONTAINER_NAME], { allowFail: true });
  }

  console.log(`[bitllm] starting container ${CONTAINER_NAME} on port ${BITLLM_PORT}`);

  run("docker", [
    "run",
    "-d",
    "--name",
    CONTAINER_NAME,
    "--restart",
    "unless-stopped",
    "-p",
    `${BITLLM_PORT}:8080`,
    "-e",
    `BITNET_MODEL_DIR_NAME=${MODEL_DIR_NAME}`,
    "-e",
    `BITNET_QUANT_TYPE=${QUANT_TYPE}`,
    "-e",
    `BITNET_THREADS=${THREADS}`,
    "-e",
    `BITNET_CTX_SIZE=${CTX_SIZE}`,
    "-e",
    `BITNET_TEMPERATURE=${TEMPERATURE}`,
    "-e",
    `BITNET_N_PREDICT=${N_PREDICT}`,
    IMAGE_NAME,
  ]);
}

async function start() {
  if (await isReady()) {
    console.log(`[bitllm] already available at ${BITLLM_URL}`);
    return;
  }

  if (!hasDocker()) {
    throw new Error("Docker daemon is not running. Start Docker Desktop (or the Docker service) and try again.");
  }

  if (containerExists()) {
    console.log(`[bitllm] starting existing container ${CONTAINER_NAME}`);
    run("docker", ["start", CONTAINER_NAME]);
  } else {
    if (!imageExists()) {
      buildImage();
    }

    runContainer();
  }

  const ready = await waitForReady();
  if (!ready) {
    throw new Error(`BitLLM did not become healthy at ${BITLLM_URL}`);
  }

  console.log(`[bitllm] ready at ${BITLLM_URL}`);
}

function stop() {
  if (!containerExists()) {
    console.log("[bitllm] container is not running");
    return;
  }

  run("docker", ["rm", "-f", CONTAINER_NAME], { allowFail: true });
  console.log("[bitllm] stopped");
}

async function status() {
  const ready = await isReady();
  console.log(ready ? `[bitllm] ready at ${BITLLM_URL}` : "[bitllm] not running");
  process.exit(ready ? 0 : 1);
}

function logs() {
  if (!containerExists()) {
    throw new Error(`Container ${CONTAINER_NAME} was not found.`);
  }

  run("docker", ["logs", "-f", CONTAINER_NAME]);
}

async function main() {
  const command = process.argv[2] || "start";

  switch (command) {
    case "start":
      await start();
      return;
    case "stop":
      stop();
      return;
    case "status":
      await status();
      return;
    case "download":
      if (!hasDocker()) {
        throw new Error("Docker daemon is not running. Start Docker Desktop (or the Docker service) and try again.");
      }
      buildImage();
      return;
    case "logs":
      logs();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(`[bitllm] ${error.message}`);
  process.exit(1);
});
