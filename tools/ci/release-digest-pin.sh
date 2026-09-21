#!/usr/bin/env bash
# ADR-0050 - gate 3 of the release path: the prod compose file is digest-pinned.
#
#   bash tools/ci/release-digest-pin.sh --tag <name>
#
# Verifies that api/web/migrate in ops/prod.yml reference the exact digests
# that release-promote.sh recorded for this tag, i.e. prod deploys what CI
# built - never a locally rebuilt image, never a mutable tag (C6/P4-B06).
# The image refs are handed to compose through env (SCALPAI_API_IMAGE /
# SCALPAI_WEB_IMAGE, see ops/prod.yml), then `docker compose config` must
# resolve them to the recorded `...@sha256:...` strings. Fail-closed: any
# drift, any tag-only reference, any missing record stops the promotion.
set -euo pipefail

tag=""
compose_env="${COMPOSE_ENV_FILE:-ci.env}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag) tag="$2"; shift 2 ;;
    --env-file) compose_env="$2"; shift 2 ;;
    *) echo "release-digest-pin: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
if [ -z "$tag" ]; then
  echo "usage: release-digest-pin.sh --tag <name>" >&2
  exit 2
fi

LEDGER="docs/releases/releases-ledger.jsonl"
promoted=$(grep '"kind":"promote"' "$LEDGER" | grep "\"tag\":\"$tag\"" | tail -n1 || true)
if [ -z "$promoted" ]; then
  echo "release-digest-pin: no promote record for tag '$tag'" >&2
  exit 3
fi

api_digest=$(printf '%s' "$promoted" | sed -n 's/.*"api":"\([^"]*\)".*/\1/p')
web_digest=$(printf '%s' "$promoted" | sed -n 's/.*"web":"\([^"]*\)".*/\1/p')
case "$api_digest$web_digest" in *@sha256:*) ;; *)
  echo "release-digest-pin: promote record for '$tag' has no sha256 digests" >&2
  exit 3 ;;
esac

resolved=$(SCALPAI_API_IMAGE="$api_digest" SCALPAI_WEB_IMAGE="$web_digest" \
  docker compose -f ops/prod.yml --env-file "$compose_env" config --images api web)
for digest in "$api_digest" "$web_digest"; do
  if ! printf '%s\n' "$resolved" | grep -qx -- "$digest"; then
    echo "::error::release-digest-pin: prod.yml does not deploy $digest (ADR-0050)" >&2
    exit 1
  fi
done
echo "release-digest-pin: prod resolves api+web to the promoted digests"
