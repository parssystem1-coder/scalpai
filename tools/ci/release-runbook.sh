#!/usr/bin/env bash
# ADR-0050 - the operator-facing release path. One command per gate, in the
# only legal order:
#
#   bash tools/ci/release-runbook.sh promote <tag>
#   bash tools/ci/release-runbook.sh attest  <tag>
#   bash tools/ci/release-runbook.sh deploy  <tag>   # staging or prod, same digest
#   bash tools/ci/release-runbook.sh rollback <tag>  # redigest prod to a previous tag
#
# `promote` builds once and pushes the digests; `attest` writes SBOM +
# provenance; `deploy` digest-pins prod.yml and records the deploy in the
# ledger; `rollback` records the redeploy of a previous tag (the drill in
# release-rollback-drill.sh exercises this path for real, nightly + PR).
set -euo pipefail

cmd="${1:-}" tag="${2:-}"
LEDGER="docs/releases/releases-ledger.jsonl"
mkdir -p docs/releases
touch "$LEDGER"

append() { printf '%s\n' "$1" >> "$LEDGER"; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
commit() { git rev-parse HEAD 2>/dev/null || echo unknown; }

lookup() {
  local tag="$1" kind="$2"
  grep '"kind":"'"$kind"'"' "$LEDGER" | grep "\"tag\":\"$tag\"" | tail -n1 || true
}

latest_promote() {
  grep '"kind":"promote"' "$LEDGER" | tail -n1 || true
}

case "$cmd" in
  promote)
    [ -n "$tag" ] || { echo "usage: release-runbook.sh promote <tag>" >&2; exit 2; }
    [ -z "$(lookup "$tag" promote)" ] || { echo "runbook: tag '$tag' already promoted (append-only ledger)" >&2; exit 3; }
    bash tools/ci/release-promote.sh --tag "$tag"
    ;;
  attest)
    [ -n "$tag" ] || { echo "usage: release-runbook.sh attest <tag>" >&2; exit 2; }
    [ -n "$(lookup "$tag" promote)" ] || { echo "runbook: tag '$tag' was never promoted" >&2; exit 3; }
    [ -z "$(lookup "$tag" attest)" ] || { echo "runbook: tag '$tag' already attested" >&2; exit 3; }
    bash tools/ci/release-attest.sh --tag "$tag"
    ;;
  deploy)
    [ -n "$tag" ] || { echo "usage: release-runbook.sh deploy <tag>" >&2; exit 2; }
    line=$(lookup "$tag" promote)
    [ -n "$line" ] || { echo "runbook: tag '$tag' was never promoted" >&2; exit 3; }
    [ -n "$(lookup "$tag" attest)" ] || { echo "runbook: tag '$tag' is not attested - deploy blocked (ADR-0050)" >&2; exit 3; }
    api=$(printf '%s' "$line" | sed -n 's/.*"api":"\([^"]*\)".*/\1/p')
    web=$(printf '%s' "$line" | sed -n 's/.*"web":"\([^"]*\)".*/\1/p')
    case "$api$web" in *@sha256:*) ;; *)
      echo "runbook: promoted refs for '$tag' are not digest-pinned" >&2; exit 3 ;;
    esac
    SCALPAI_API_IMAGE="$api" SCALPAI_WEB_IMAGE="$web" \
      docker compose -f ops/prod.yml --env-file "${COMPOSE_ENV_FILE:-ops/prod.env}" config -q
    append "$(printf '{"ts":"%s","kind":"deploy","tag":"%s","commit":"%s","api":"%s","web":"%s"}' \
      "$(now)" "$tag" "$(commit)" "$api" "$web")"
    echo "runbook: prod.yml digest-pinned to '$tag' - bring the stack up with docker compose up -d --no-build"
    ;;
  rollback)
    [ -n "$tag" ] || { echo "usage: release-runbook.sh rollback <tag>" >&2; exit 2; }
    current=$(latest_promote | sed -n 's/.*"tag":"\([^"]*\)".*/\1/p')
    [ -n "$current" ] || { echo "runbook: nothing has ever been promoted" >&2; exit 3; }
    [ "$tag" != "$current" ] || { echo "runbook: '$tag' is already the live release - nothing to roll back to" >&2; exit 3; }
    target=$(lookup "$tag" promote)
    [ -n "$target" ] || { echo "runbook: '$tag' was never promoted - can only roll back to a promoted release" >&2; exit 3; }
    api=$(printf '%s' "$target" | sed -n 's/.*"api":"\([^"]*\)".*/\1/p')
    web=$(printf '%s' "$target" | sed -n 's/.*"web":"\([^"]*\)".*/\1/p')
    append "$(printf '{"ts":"%s","kind":"rollback","from":"%s","to":"%s","commit":"%s","api":"%s","web":"%s"}' \
      "$(now)" "$current" "$tag" "$(commit)" "$api" "$web")"
    echo "runbook: rollback $current -> $tag recorded - redeploy with digest pinning, then run the drill"
    ;;
  *)
    cat >&2 <<'USAGE'
usage: release-runbook.sh promote|attest|deploy|rollback <tag>
ORDER IS MANDATORY: promote -> attest -> deploy (staging first, prod on the
same digest). Rollback redigests to any previously promoted tag; the nightly
release-rollback-drill proves that path by running it.
USAGE
    exit 2
    ;;
esac
