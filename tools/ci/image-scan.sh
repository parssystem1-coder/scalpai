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

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

image_exists() {
  [ -n "${1:-}" ] && docker image inspect "$1" >/dev/null 2>&1
}

# The project name compose derives build-only image tags from: prod.yml pins
# name: scalpai, and compose config prints the resolved value.
compose_project() {
  local name=""
  # Two tries: first as if compose can render config (normal case), second as
  # a fallback for when env file has missing secrets (CI sometimes generates
  # placeholders that don't resolve). A safe fallback is the COMPOSE_PROJECT_NAME
  # env var, which docker compose itself checks.
  name=$(compose config 2>/dev/null | sed -n 's/^name:[[:space:]]*//p' | head -n 1)
  [ -n "$name" ] && printf '%s\n' "$name" && return 0
  name="${COMPOSE_PROJECT_NAME:-}"
  [ -n "$name" ] && printf '%s\n' "$name" && return 0
  return 1
}

# Resolution order: try compose's derived tag, then what compose reports,
# then any image matching the service name, then compose images as last resort.
# The grep patterns all use -- to stop option parsing, so a pattern can start
# with - without being swallowed as an option.
resolve_image() {
  local service="$1" project ref=""
  project=$(compose_project) || true

  # 1. The default tag for a service with build: and no image: key.
  if [ -n "$project" ]; then
    for ref in "${project}-${service}:latest" "${project}-${service}" "${project}_${service}:latest"; do
      if image_exists "$ref"; then
        printf '%s\n' "$ref"
        return 0
      fi
    done
  fi

  # 2. What compose itself reports for this service.
  ref=$(compose config --images "$service" 2>/dev/null | grep -v -- '^[[:space:]]*$' | head -n 1)
  if [ -n "$ref" ] && image_exists "$ref"; then
    printf '%s\n' "$ref"
    return 0
  fi

  # 3. Any image in docker images whose name ends in -<service> or _<service>.
  # Filter out <none> tags (dangling layers).
  ref=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
    | grep -E -- "[-_]${service}:[a-z0-9]" \
    | head -n 1)
  if [ -n "$ref" ] && image_exists "$ref"; then
    printf '%s\n' "$ref"
    return 0
  fi

  # 4. Last resort: an already-running stack.
  ref=$(compose images -q "$service" 2>/dev/null | grep -v -- '^[[:space:]]*$' | head -n 1)
  if [ -n "$ref" ] && image_exists "$ref"; then
    printf '%s\n' "$ref"
    return 0
  fi

  return 1
}

mkdir -p "$CACHE_DIR"
docker pull -q "$TRIVY_IMAGE"

fail=0
for service in $services; do
  ref=$(resolve_image "$service")
  if [ -z "$ref" ]; then
    echo "::error::no image was built for compose service '$service'"
    # A resolution failure has to be debuggable from the log alone.
    echo "--- debug: compose project: '$(compose_project || echo 'unresolvable')' ---"
    echo "--- debug: docker images on this runner ---"
    docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}' || true
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
