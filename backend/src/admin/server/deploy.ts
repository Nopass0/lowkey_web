import { Client } from "ssh2";
import { config } from "../../config";

type MtprotoSettings = {
  enabled?: boolean | null;
  port?: number | null;
  secret?: string | null;
  adTag?: string | null;
  botUsername?: string | null;
  channelUsername?: string | null;
  addChannelOnConnect?: boolean | null;
};

type DeployServerInput = {
  ip: string;
  hostname: string;
  sshUsername: string;
  sshPassword: string;
  pm2ProcessName: string;
  serverId?: string | null;
};

function ensureProvisioningConfig() {
  if (!config.VOIDDB_URL) {
    throw new Error("VOIDDB_URL is required for VPN node provisioning");
  }
  if (!config.VOIDDB_TOKEN && (!config.VOIDDB_USERNAME || !config.VOIDDB_PASSWORD)) {
    throw new Error(
      "Set VOIDDB_TOKEN or VOIDDB_USERNAME/VOIDDB_PASSWORD for VPN node provisioning",
    );
  }
}

function buildEnvFile(server: DeployServerInput, mtproto: MtprotoSettings) {
  ensureProvisioningConfig();

  const env = new Map<string, string>([
    ["VOIDDB_URL", config.VOIDDB_URL],
    ["JWT_SECRET", config.JWT_SECRET],
    ["BACKEND_URL", "https://lowkey.su/api"],
    ["SERVER_IP", server.ip],
    ["SERVER_HOSTNAME", server.hostname],
    ["LISTEN_ADDR", ":443"],
    ["HTTP_ADDR", ":8080"],
    ["XRAY_PORT", "443"],
    ["PM2_APP_NAME", server.pm2ProcessName],
  ]);

  if (config.VOIDDB_TOKEN) {
    env.set("VOIDDB_TOKEN", config.VOIDDB_TOKEN);
  } else {
    env.set("VOIDDB_USERNAME", config.VOIDDB_USERNAME);
    env.set("VOIDDB_PASSWORD", config.VOIDDB_PASSWORD);
  }

  if (config.LETSENCRYPT_EMAIL && server.hostname) {
    env.set(
      "CERT_FILE",
      `/etc/letsencrypt/live/${server.hostname}/fullchain.pem`,
    );
    env.set("KEY_FILE", `/etc/letsencrypt/live/${server.hostname}/privkey.pem`);
  }

  if (config.TOCHKA_API_KEY) {
    env.set("TOCHKA_API_KEY", config.TOCHKA_API_KEY);
  }
  if (config.TOCHKA_MERCHANT_ID) {
    env.set("TOCHKA_MERCHANT_ID", config.TOCHKA_MERCHANT_ID);
  }
  if (config.TOCHKA_ACCOUNT_ID) {
    env.set("TOCHKA_ACCOUNT_ID", config.TOCHKA_ACCOUNT_ID);
  }

  const mtprotoEnabled = Boolean(mtproto.enabled && mtproto.secret);
  env.set("MTPROTO_ENABLED", mtprotoEnabled ? "true" : "false");
  env.set(
    "MTPROTO_PORT",
    String(
      typeof mtproto.port === "number" && Number.isFinite(mtproto.port)
        ? Math.max(1, Math.trunc(mtproto.port))
        : 8443,
    ),
  );

  if (mtproto.secret) {
    env.set("MTPROTO_SECRET", mtproto.secret);
  }
  if (mtproto.adTag) {
    env.set("MTPROTO_AD_TAG", mtproto.adTag);
  }
  if (mtproto.channelUsername) {
    env.set("MTPROTO_CHANNEL_USERNAME", mtproto.channelUsername);
  }
  if (mtproto.botUsername) {
    env.set("MTPROTO_BOT_USERNAME", mtproto.botUsername);
  }
  env.set(
    "MTPROTO_ADD_CHANNEL",
    mtproto.addChannelOnConnect ? "true" : "false",
  );

  return [...env.entries()]
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${escapeEnvValue(value)}`)
    .join("\n");
}

function escapeEnvValue(value: string) {
  return value.replace(/\r/g, "").replace(/\n/g, "\\n");
}

function buildRemoteScript(server: DeployServerInput, mtproto: MtprotoSettings) {
  const envFile = Buffer.from(buildEnvFile(server, mtproto), "utf8").toString(
    "base64",
  );
  const repoUrl = Buffer.from(config.VPN_NODE_REPO_URL, "utf8").toString(
    "base64",
  );
  const baseDir = Buffer.from(config.VPN_NODE_BASE_DIR, "utf8").toString(
    "base64",
  );
  const letsencryptEmail = Buffer.from(
    config.LETSENCRYPT_EMAIL || "",
    "utf8",
  ).toString("base64");
  const sshPassword = Buffer.from(server.sshPassword, "utf8").toString(
    "base64",
  );

  return `
set -euo pipefail
export PATH="/usr/local/go/bin:/usr/local/bin:$PATH"
export DEBIAN_FRONTEND=noninteractive

REPO_URL="$(printf '%s' '${repoUrl}' | base64 -d)"
BASE_DIR="$(printf '%s' '${baseDir}' | base64 -d)"
APP_DIR="$BASE_DIR"
BACKUP_DIR=""
PM2_NAME="${server.pm2ProcessName}"
HOSTNAME_VALUE="${server.hostname}"
LETSENCRYPT_EMAIL_VALUE="$(printf '%s' '${letsencryptEmail}' | base64 -d)"
SSH_PASSWORD_VALUE="$(printf '%s' '${sshPassword}' | base64 -d)"
GO_VERSION="1.25.0"

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required for non-root deployment" >&2
    exit 1
  fi

  printf '%s\\n' "$SSH_PASSWORD_VALUE" | sudo -S -p '' "$@"
}

detect_go_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *)
      echo "Unsupported CPU architecture for Go bootstrap: $(uname -m)" >&2
      return 1
      ;;
  esac
}

ensure_go_toolchain() {
  local current_version arch archive_path

  current_version="$(go env GOVERSION 2>/dev/null || true)"
  if [ "$current_version" = "go\${GO_VERSION}" ]; then
    return
  fi

  arch="$(detect_go_arch)"
  archive_path="/tmp/go\${GO_VERSION}.linux-\${arch}.tar.gz"

  curl -fsSL "https://go.dev/dl/go\${GO_VERSION}.linux-\${arch}.tar.gz" -o "$archive_path"
  run_root rm -rf /usr/local/go
  run_root tar -C /usr/local -xzf "$archive_path"
  run_root ln -sf /usr/local/go/bin/go /usr/local/bin/go
  run_root ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
  rm -f "$archive_path"
  export PATH="/usr/local/go/bin:/usr/local/bin:$PATH"
}

run_root apt-get update
run_root apt-get install -y ca-certificates curl git certbot libcap2-bin tar unzip iptables iproute2
ensure_go_toolchain

run_root mkdir -p "$(dirname "$BASE_DIR")"

if [ -d "$BASE_DIR" ] && [ ! -d "$BASE_DIR/.git" ] && [ -n "$(ls -A "$BASE_DIR" 2>/dev/null)" ]; then
  BACKUP_DIR="$BASE_DIR.backup-$(date +%Y%m%d%H%M%S)"
  run_root mv "$BASE_DIR" "$BACKUP_DIR"
fi

if [ -d "$BASE_DIR/.git" ] && [ -n "$(git -C "$BASE_DIR" status --porcelain 2>/dev/null)" ]; then
  BACKUP_DIR="$BASE_DIR.backup-$(date +%Y%m%d%H%M%S)"
  run_root mv "$BASE_DIR" "$BACKUP_DIR"
fi

run_root mkdir -p "$BASE_DIR"
run_root chown -R "$(id -u):$(id -g)" "$BASE_DIR"

if [ ! -d "$BASE_DIR/.git" ]; then
  git clone "$REPO_URL" "$BASE_DIR"
else
  git -C "$BASE_DIR" fetch origin main --tags
  if git -C "$BASE_DIR" rev-parse --verify main >/dev/null 2>&1; then
    git -C "$BASE_DIR" checkout main
  else
    git -C "$BASE_DIR" checkout -b main origin/main
  fi
  git -C "$BASE_DIR" pull --ff-only origin main
fi

cd "$APP_DIR"
go mod download

if [ -n "$LETSENCRYPT_EMAIL_VALUE" ] && [ -n "$HOSTNAME_VALUE" ]; then
  if command -v ufw >/dev/null 2>&1; then
    run_root ufw allow 80/tcp || true
  fi
  if command -v firewall-cmd >/dev/null 2>&1; then
    run_root firewall-cmd --permanent --add-port=80/tcp || true
    run_root firewall-cmd --reload || true
  fi
  run_root iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
  run_root certbot certonly --standalone \\
    --non-interactive \\
    --agree-tos \\
    --keep-until-expiring \\
    -m "$LETSENCRYPT_EMAIL_VALUE" \\
    -d "$HOSTNAME_VALUE"
fi

printf '%s' '${envFile}' | base64 -d > .env
run_root env PM2_APP_NAME="$PM2_NAME" bash ./scripts/pm2_start.sh
run_root pm2 status "$PM2_NAME"
`;
}

function execRemote(client: Client, command: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      let stdout = "";
      let stderr = "";

      stream.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      stream.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      stream.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        reject(
          new Error(
            stderr.trim() ||
              stdout.trim() ||
              `Remote deploy failed with exit code ${code ?? "unknown"}`,
          ),
        );
      });
    });
  });
}

export async function deployHysteriaNode(
  server: DeployServerInput,
  mtproto: MtprotoSettings,
) {
  ensureProvisioningConfig();

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const client = new Client();

    client
      .on("ready", async () => {
        try {
          const result = await execRemote(client, buildRemoteScript(server, mtproto));
          client.end();
          resolve(result);
        } catch (error) {
          client.end();
          reject(error);
        }
      })
      .on("error", (error) => {
        reject(error);
      })
      .connect({
        host: server.ip,
        port: 22,
        username: server.sshUsername,
        password: server.sshPassword,
        readyTimeout: 20_000,
      });
  });
}
