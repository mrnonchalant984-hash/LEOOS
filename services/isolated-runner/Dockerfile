FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* && groupadd --gid 10001 runner && useradd --uid 10001 --gid 10001 --create-home runner
USER 10001:10001
WORKDIR /workspace
ENV HOME=/home/runner npm_config_cache=/tmp/npm-cache
