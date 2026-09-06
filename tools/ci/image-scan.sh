#!/usr/bin/env bash
# M17 - the images CI just built are scanned, never assumed clean.
#
#   bash tools/ci/image-scan.sh <compose-service> [more services...]
#
# Resolves the image compose actually built for each service (so the scan can
# never target a stale or unrelated tag), prints the full HIGH+CRITICAL report
# for the reviewer, and FAILS the gate on any fixable CRITICAL finding.
# Raising the blocking severity to HIGH is the documented ratchet (ADR-0037).
set -uo pipefail

TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:0.58.1}"
COMPOSE_FILE="${COMPOSE_FILE:-prod.yml}"
ENV_FILE="${ENV_FILE:-ci.env}"
CACHE_DIR="${TRIVY_CACHE_DIR:-/tmp/trivy-cache}"
BLOCKING_SEVERITY="${BLOCKING_SEVERITY:-CRITICAL}"
services="${*:-api web}"

mkdir -p "$CACHE_DIR"
docker pull -q "$TRIVY_IMAGE"

fail=0
for service in $services; do
  ref=$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" images -q "$service" | head -n 1)
  if [ -z "$ref" ]; then
    echo "::error::no image was built for compose service '$service'"
    fail=1
    continue
  fi
  echo "=== $service ($ref): HIGH + CRITICAL report ==="
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$CACHE_DIR":/root/.cache/ \
    "$TRIVY_IMAGE" image --scanners vuln --ignore-unfixed \
    --severity HIGH,CRITICAL --format table "$ref" || true

  echo "=== $service ($ref): blocking gate on $BLOCKING_SEVERITY ==="
  if ! docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$CACHE_DIR":/root/.cache/ \
    "$TRIVY_IMAGE" image --scanners vuln --ignore-unfixed \
    --severity "$BLOCKING_SEVERITY" --exit-code 1 --format table "$ref"; then
    echo "::error::$service image has fixable $BLOCKING_SEVERITY vulnerabilities"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "image scan: FAIL"
  exit 1
fi
echo "image scan: OK"
