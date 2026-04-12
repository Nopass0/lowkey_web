#!/bin/bash
# Build jopad binary
set -e
cd "$(dirname "$0")"
mkdir -p bin
GOOS=linux GOARCH=amd64 go build -o bin/jopad ./cmd/jopad/
echo "Built: bin/jopad"
