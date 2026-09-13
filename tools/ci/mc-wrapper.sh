#!/usr/bin/env bash
set -euo pipefail

MC_IMAGE="${MC_IMAGE:-quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z}"
args=()
for name in MC_HOST_local MC_HOST_offsite; do
  if [[ -n "${!name:-}" ]]; then
    args+=(-e "${name}=${!name}")
  fi
done

exec docker run --rm --network host --user "$(id -u):$(id -g)" -v /tmp:/tmp "${args[@]}" "$MC_IMAGE" "$@"
