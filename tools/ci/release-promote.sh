#!/usr/bin/env bash
# ADR-0050 - gate 1 of the release path: promote the images CI built.
#
#   bash tools/ci/release-promote.sh --registry <host/repo> --tag <name> \
#        [--commit <sha>] [--evidence-dir <dir>]
#
# Builds api+web through ops/prod.yml (the ONE supported topology, ADR-0036),
# pushes BOTH digests to the registry, and records them under the release tag
# in docs/releases/releases-ledger.jsonl (append-only; a re-run for the same
# tag is allowed but never rewrites an existing line).
#
# This script touches the local docker daemon, so there is no local run here:
# CI is the only caller that has a daemon, and the policy spec
# (tools/ops/release-promotion.phase5.spec.ts) asserts its contract textually.
set -euo pipefail

registry="${SCALPAI_RELEASE_REGISTRY:-}" tag="" commit="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
evidence_dir="${CI_EVIDENCE_DIR:-ci-evidence}"
compose_env="${COMPOSE_ENV_FILE:-ci.env}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --registry) registry="$2"; shift 2 ;;
    --tag) tag="$2"; shift 2 ;;
    --commit) commit="$2"; shift 2 ;;
    --evidence-dir) evidence_dir="$2"; shift 2 ;;
    *) echo "release-promote: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
if [ -z "$registry" ] || [ -z "$tag" ]; then
  echo "usage: release-promote.sh --registry <host/repo> --tag <name> [--commit <sha>]" >&2
  exit 2
fi

mkdir -p "$evidence_dir" docs/releases
LEDGER="docs/releases/releases-ledger.jsonl"
touch "$LEDGER"

if grep -q '"tag":"'"$tag"'"' "$LEDGER"; then
  echo "release-promote: tag '$tag' already promoted - refusing to rewrite history (ADR-0050)" >&2
  exit 3
fi

echo "release-promote: building api+web (build once, promote the digest)"
cache_flag=""
[ "${RELEASE_NO_CACHE:-0}" = "1" ] && cache_flag="--no-cache"
channel="prod"
if [ -n "${SCALPAI_RELEASE_CHANNEL:-}" ]; then
  channel="$SCALPAI_RELEASE_CHANNEL"
fi
docker compose -f ops/prod.yml --env-file "$compose_env" \
  $( [ -n "$cache_flag" ] && printf '%s' "$cache_flag" ) \
  build --build-arg RELEASE_CHANNEL="$channel" api web

push_digest() {
  local image="$1"
  local digest
  digest=$(docker image inspect --format '{{index .RepoDigests 0}}' "$image" 2>/dev/null | head -n1 || true)
  if [ -z "$digest" ]; then
    # freshly built images carry no RepoDigests entry yet: push, then re-read
    docker push "$image"
    digest=$(docker image inspect --format '{{index .RepoDigests 0}}' "$image" | head -n1)
  fi
  printf '%s\n' "$digest"
}

api_image="${registry%/}/scalpai-api:$tag"
web_image="${registry%/}/scalpai-web:$tag"
docker tag "$(docker compose -f ops/prod.yml --env-file "$compose_env" config --images api | head -n1)" "$api_image"
docker tag "$(docker compose -f ops/prod.yml --env-file "$compose_env" config --images web | head -n1)" "$web_image"

api_digest=$(push_digest "$api_image")
web_digest=$(push_digest "$web_image")
case "$api_digest$web_digest" in *@sha256:*@sha256:*) ;; *)
  echo "::error::release-promote: registry did not return digest refs" >&2
  exit 1 ;;
esac

line=$(printf '{"ts":"%s","kind":"promote","commit":"%s","tag":"%s","registry":"%s","api":"%s","web":"%s"}' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$commit" "$tag" "$registry" "$api_digest" "$web_digest")
printf '%s\n' "$line" >> "$LEDGER"
echo "release-promote: $line"
