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
# `name: scalpai`, and `compose config` prints the resolved value on a
# top-level `name:` line (an exported COMPOSE_PROJECT_NAME still wins there).
compose_project() {
  local name=""
  name=$(compose config 2>/dev/null | sed -n 's/^name:[[:space:]]*//p' | head -n 1)
  printf '%s\n' "${name:-${COMPOSE_PROJECT_NAME:-}}"
}

# The scan runs straight after `compose build`, BEFORE anything is booted, so
# `compose images` - which only knows the images of CREATED containers - is
# empty at this point and can only ever be a last-resort fallback.
#
# ROOT CAUSE of the repeated "no image was built" failures: the previous
# revision matched with `grep -E "-${service}:[^<]"`. A pattern beginning with
# `-` is swallowed by grep as an option bundle ("grep: invalid option -- 'p'",
# exit 2), so the match never ran against the images that had just been built.
# Every pattern below is passed after `--`, and resolution now starts from the
# project name compose itself reports instead of guessing at a tag.
resolve_image() {
  local service="$1" project ref=""
  project=$(compose_project)

  # 1. The tag compose gives a service that declares `build:` with no `image:`.
  if [ -n "$project" ]; then
    for ref in "${project}-${service}:latest" "${project}-${service}" "${project}_${service}:latest"; do
      if image_exists "$ref"; then
        printf '%s\n' "$ref"
        return 0
      fi
    done
  fi

  # 2. What compose itself reports as the image for the service.
  ref=$(compose config --images "$service" 2>/dev/null | grep -v -- '^[[:space:]]*$' | head -n 1)
  if image_exists "$ref"; then
    printf '%s\n' "$ref"
    return 0
  fi

  # 3. Any local image whose repository ends in -<service> / _<service>.
  ref=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
    | grep -E -- "[-_]${service}:" \
    | grep -v -- ':<none>$' \
    | head -n 1)
  if image_exists "$ref"; then
    printf '%s\n' "$ref"
    return 0
  fi

  # 4. An already-running stack (callers that scan a booted deployment).
  ref=$(compose images -q "$service" 2>/dev/null | grep -v -- '^[[:space:]]*$' | head -n 1)
  if image_exists "$ref"; then
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
    # A resolution failure has to be debuggable from the evidence log alone.
    echo "--- compose project: '$(compose_project)' / images on this runner ---"
    docker images --format '{{.Repository}}:{{.Tag}}  {{.ID}}  {{.CreatedSince}}' || true
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
