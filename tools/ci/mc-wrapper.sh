#!/usr/bin/env bash
set -euo pipefail

MC_IMAGE="${MC_IMAGE:-quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z}"

# 2026-09-25: quay.io anonymous pulls are rate-limit flaky in CI (three
# consecutive PR runs + a Nightly run died on `unauthorized` during pull).
# Before exec-ing through docker, make sure the image is present: retry with
# backoff, then fall back to the GHCR digest mirror synced by
# .github/workflows/mirror-images.yml. Same tag everywhere = same digest.
# The wrapper is also installed as /usr/local/bin/mc by restore-drill.yml,
# so resolve retry.sh next to the script, falling back to the repo checkout.
_retry_src="$(dirname "${BASH_SOURCE[0]}")/retry.sh"
[[ -f "$_retry_src" ]] || _retry_src="tools/ci/retry.sh"
source "$_retry_src"
retry_docker_pull "$MC_IMAGE"

args=()
for name in MC_HOST_local MC_HOST_offsite; do
  if [[ -n "${!name:-}" ]]; then
    args+=(-e "${name}=${!name}")
  fi
done

exec docker run --rm --network host --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e MC_CONFIG_DIR=/tmp/mc-config -v /tmp:/tmp \
  "${args[@]}" "$MC_IMAGE" "$@"
