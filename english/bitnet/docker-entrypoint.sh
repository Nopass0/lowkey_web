#!/usr/bin/env bash
set -euo pipefail

cd /opt/BitNet

model_dir_name="${BITNET_MODEL_DIR_NAME:?BITNET_MODEL_DIR_NAME is required}"
quant_type="${BITNET_QUANT_TYPE:-i2_s}"
model_path="/opt/BitNet/models/${model_dir_name}/ggml-model-${quant_type}.gguf"

if [[ ! -f "${model_path}" ]]; then
  echo "BitNet model was not prepared: ${model_path}" >&2
  exit 1
fi

threads="${BITNET_THREADS:-}"
if [[ -z "${threads}" ]]; then
  threads="$(nproc)"
fi

args=(
  python3
  run_inference_server.py
  -m "${model_path}"
  -t "${threads}"
  -c "${BITNET_CTX_SIZE:-4096}"
  -n "${BITNET_N_PREDICT:-1024}"
  --temperature "${BITNET_TEMPERATURE:-0.7}"
  --host 0.0.0.0
  --port "${BITNET_PORT:-8080}"
)

if [[ -n "${BITNET_SYSTEM_PROMPT:-}" ]]; then
  args+=(-p "${BITNET_SYSTEM_PROMPT}")
fi

exec "${args[@]}"
