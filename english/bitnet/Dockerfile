FROM ubuntu:24.04

ARG BITNET_REPO=https://github.com/microsoft/BitNet.git
ARG BITNET_REF=main
ARG BITNET_MODEL_REPO=1bitLLM/bitnet_b1_58-large
ARG BITNET_MODEL_DIR_NAME=bitnet_b1_58-large
ARG BITNET_QUANT_TYPE=i2_s
ARG BITNET_USE_PRETUNED=1

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    BITNET_MODEL_DIR_NAME=${BITNET_MODEL_DIR_NAME} \
    BITNET_QUANT_TYPE=${BITNET_QUANT_TYPE}

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      bash \
      build-essential \
      ca-certificates \
      cmake \
      curl \
      git \
      gnupg \
      python3 \
      python3-pip \
      software-properties-common \
      wget && \
    wget -O /tmp/llvm.sh https://apt.llvm.org/llvm.sh && \
    chmod +x /tmp/llvm.sh && \
    bash /tmp/llvm.sh 18 && \
    apt-get install -y --no-install-recommends clang-18 lld-18 && \
    ln -sf /usr/bin/clang-18 /usr/local/bin/clang && \
    ln -sf /usr/bin/clang++-18 /usr/local/bin/clang++ && \
    rm -f /tmp/llvm.sh && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone --depth 1 --branch ${BITNET_REF} --recursive ${BITNET_REPO} BitNet

WORKDIR /opt/BitNet
RUN python3 -m pip install --break-system-packages --no-cache-dir -r requirements.txt
RUN if [ "${BITNET_USE_PRETUNED}" = "1" ]; then \
      python3 setup_env.py \
        --hf-repo "${BITNET_MODEL_REPO}" \
        --model-dir /opt/BitNet/models \
        --log-dir /opt/BitNet/logs \
        -q "${BITNET_QUANT_TYPE}" \
        --use-pretuned; \
    else \
      python3 setup_env.py \
        --hf-repo "${BITNET_MODEL_REPO}" \
        --model-dir /opt/BitNet/models \
        --log-dir /opt/BitNet/logs \
        -q "${BITNET_QUANT_TYPE}"; \
    fi

COPY docker-entrypoint.sh /usr/local/bin/bitnet-entrypoint
RUN chmod +x /usr/local/bin/bitnet-entrypoint

EXPOSE 8080

ENTRYPOINT ["bitnet-entrypoint"]
