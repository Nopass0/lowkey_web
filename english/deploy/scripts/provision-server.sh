#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Only apt-based Linux servers are supported by this provisioning script."
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release software-properties-common rsync

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin
fi

apt-get install -y nginx certbot python3-certbot-nginx

systemctl enable docker
systemctl restart docker
systemctl enable nginx
systemctl restart nginx

mkdir -p /var/www/certbot
