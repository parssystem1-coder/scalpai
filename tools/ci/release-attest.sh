#!/usr/bin/env bash
# ADR-0050 - gate 2 of the release path: SBOM + provenance for what was promoted.
#
#   bash tools/ci/release-attest.sh --tag <name> [--evidence-dir <dir>]
#
# Pulls the promoted digests, writes a CycloneDX SBOM (Trivy) and SLSA v0.2
# provenance (Attest) for each image, validates the JSON, and appends one
# attest record per service to the ledger. A release record without
# SBOM/provenance is not a release (P4-B06 / remediation plan C6).
set -euo pipefail

tag="" evidence_dir="${CI_EVIDENCE_DIR:-ci-evidence}"
TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:0.58.1}"
ATTEST_IMAGE="${ATTEST_IMAGE:-ghcr.io/testifysec/attest:v0.1.8}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag) tag="$2"; shift 2 ;;
    --evidence-dir) evidence_dir="$2"; shift 2 ;;
    *) echo "release-attest: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
if [ -z "$tag" ]; then
  echo "usage: release-attest.sh --tag <name>" >&2
  exit 2
fi

mkdir -p "$evidence_dir" docs/releases
LEDGER="docs/releases/releases-ledger.jsonl"
touch "$LEDGER"

promoted=$(grep '"kind":"promote"' "$LEDGER" | grep "\"tag\":\"$tag\"" | tail -n1 || true)
if [ -z "$promoted" ]; then
  echo "release-attest: no promote record for tag '$tag' - run release-promote.sh first" >&2
  exit 3
fi

api_ref=$(printf '%s' "$promoted" | sed -n 's/.*"api":"\([^"]*\)".*/\1/p')
web_ref=$(printf '%s' "$promoted" | sed -n 's/.*"web":"\([^"]*\)".*/\1/p')
case "$api_ref$web_ref" in *@sha256:*) ;; *)
  echo "release-attest: promote record for '$tag' has no digest image refs" >&2
  exit 3 ;;
esac

out_dir="$(cd "$evidence_dir" && pwd)"
for svc in api web; do
  ref="$api_ref"
  [ "$svc" = "web" ] && ref="$web_ref"
  docker pull --quiet "$ref" >/dev/null

  echo "release-attest: SBOM (CycloneDX) for $svc -> $evidence_dir/release-sbom-$svc.json"
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$out_dir":/output \
    "$TRIVY_IMAGE" image --format cyclonedx --scanners vuln \
    --output "/output/release-sbom-$svc.json" "$ref" >/dev/null
  node -e "JSON.parse(require('fs').readFileSync('$evidence_dir/release-sbom-$svc.json','utf8'))"

  echo "release-attest: SLSA provenance for $svc"
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$out_dir":/out \
    "$ATTEST_IMAGE" attest --type slsaprovenance --predicate /out/provenance-$svc.json "$ref" >/dev/null
  node -e "JSON.parse(require('fs').readFileSync('$evidence_dir/provenance-$svc.json','utf8'))"

  line=$(printf '{"ts":"%s","kind":"attest","tag":"%s","service":"%s","image":"%s"}' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$tag" "$svc" "$ref")
  printf '%s\n' "$line" >> "$LEDGER"
  echo "release-attest: $line"
done
