#!/usr/bin/env bash
# Scan local Compose images without weakening the vulnerability gate.
# Usage: bash tools/ci/image-scan.sh [compose-service ...]
set -uo pipefail

TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:0.58.1}"
COMPOSE_FILE="${COMPOSE_FILE:-prod.yml}"
ENV_FILE="${ENV_FILE:-ci.env}"
CACHE_DIR="${TRIVY_CACHE_DIR:-/tmp/trivy-cache}"
BLOCKING_SEVERITY="${BLOCKING_SEVERITY:-CRITICAL}"
services=("$@")
if [ "${#services[@]}" -eq 0 ]; then services=(api web); fi

log() { printf '[image-scan] %s\n' "$*" >&2; }
compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }
image_exists() { [ -n "${1:-}" ] && docker image inspect "$1" >/dev/null 2>&1; }

compose_project() {
  local name=""
  # Never print rendered configuration: it contains interpolated secrets.
  name=$(compose config 2>/dev/null | sed -n 's/^name:[[:space:]]*//p')
  if [ -z "$name" ]; then
    name="${COMPOSE_PROJECT_NAME:-}"
    log "Compose project lookup unavailable; trying COMPOSE_PROJECT_NAME."
  fi
  [ -n "$name" ] || return 1
  printf '%s\n' "$name"
}

# Accept only one distinct local image ID. Never select an arbitrary first
# match or a similarly named image from another Compose project.
unique_image() {
  local candidates="$1" source="$2" ref id ids="" count
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    id=$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null) || continue
    [ -n "$id" ] || continue
    ids="${ids}${id}"$'\n'
  done <<< "$candidates"
  ids=$(printf '%s' "$ids" | sed '/^$/d' | sort -u)
  count=$(printf '%s\n' "$ids" | sed '/^$/d' | wc -l)
  if [ "$count" -gt 1 ]; then
    log "$source: ambiguous image IDs; refusing to guess."
    return 2
  fi
  [ "$count" -eq 1 ] || return 1
  log "$source: resolved $ids"
  printf '%s\n' "$ids"
}

resolve_image() {
  local service="$1" project="" candidates="" rc ref
  # Explicit image declarations take precedence over derived default tags.
  candidates=$(compose config --images "$service" 2>/dev/null) || candidates=""
  unique_image "$candidates" "$service: Compose config"
  rc=$?
  [ "$rc" -eq 1 ] || return "$rc"
  log "$service: no local image from Compose config; trying fallbacks."

  project=$(compose_project) || project=""
  if [ -n "$project" ]; then
    candidates=""
    for ref in "${project}-${service}:latest" "${project}_${service}:latest"; do
      if image_exists "$ref"; then candidates="${candidates}${ref}"$'\n'; fi
    done
    unique_image "$candidates" "$service: project tags"
    rc=$?
    [ "$rc" -eq 1 ] || return "$rc"

    candidates=$(docker image ls -q \
      --filter "label=com.docker.compose.project=$project" \
      --filter "label=com.docker.compose.service=$service" 2>/dev/null) || candidates=""
    unique_image "$candidates" "$service: Compose project/service labels"
    rc=$?
    [ "$rc" -eq 1 ] || return "$rc"
  fi

  candidates=$(compose images -q "$service" 2>/dev/null) || candidates=""
  unique_image "$candidates" "$service: Compose containers"
}

log "Compose file=$COMPOSE_FILE; services=${services[*]}; scanner=$TRIVY_IMAGE; blocking=$BLOCKING_SEVERITY"
if ! docker info >/dev/null 2>&1; then
  log "ERROR: Docker daemon unavailable."
  exit 1
fi
if ! mkdir -p "$CACHE_DIR"; then
  log "ERROR: cannot create scanner cache directory."
  exit 1
fi
if ! docker pull -q "$TRIVY_IMAGE"; then
  if image_exists "$TRIVY_IMAGE"; then
    log "WARNING: scanner pull failed; using the locally cached $TRIVY_IMAGE."
  else
    log "ERROR: scanner pull failed and no local scanner image exists."
    exit 1
  fi
fi

scan() {
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$CACHE_DIR":/root/.cache/ \
    "$TRIVY_IMAGE" image --image-src docker --scanners vuln --ignore-unfixed "$@"
}

fail=0
for service in "${services[@]}"; do
  if ! ref=$(resolve_image "$service"); then
    log "ERROR: cannot uniquely resolve a local image for '$service'."
    log "Available local image names and IDs (no environment values):"
    docker image ls --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}' >&2 || true
    fail=1
    continue
  fi
  log "$service ($ref): HIGH + CRITICAL report"
  scan --severity HIGH,CRITICAL --format table "$ref"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    log "ERROR: $service report failed (scanner exit=$rc)."
    fail=1
  fi

  log "$service ($ref): blocking gate on $BLOCKING_SEVERITY"
  # A dedicated findings code distinguishes vulnerabilities from tool errors.
  scan --severity "$BLOCKING_SEVERITY" --exit-code 10 --format table "$ref"
  rc=$?
  case "$rc" in
    0) log "$service: blocking scan passed." ;;
    10) log "ERROR: $service has fixable $BLOCKING_SEVERITY vulnerabilities."; fail=1 ;;
    *) log "ERROR: $service scanner failed (exit=$rc); vulnerability status unknown."; fail=1 ;;
  esac
done

if [ "$fail" -ne 0 ]; then
  echo "image scan: FAIL"
  exit 1
fi
echo "image scan: OK"
