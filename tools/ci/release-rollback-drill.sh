#!/usr/bin/env bash
# ADR-0050 - gate 4 of the release path: the rollback drill, executed for real.
#
#   bash tools/ci/release-rollback-drill.sh --prod-tag <tag> --staging-tag <tag> \
#        [--compose-env ci.env] [--evidence-dir <dir>]
#
# The drill proves the rollback path the same way CI proves anything else: by
# running it and recording the evidence (ADR-0037). Both tags must already be
# promoted + attested (release-promote.sh, release-attest.sh). Steps, all
# mandatory:
#   1. boot the stack from the PROD tag's digests and pass health;
#   2. promote the STAGING tag's digests into the running stack and pass
#      health on them - the "bad" release that triggers the rollback;
#   3. ROLL BACK to the prod digests (down, re-up pinned to them), pass health
#      again - the rollback is only proven when prod is live and healthy on
#      the previous digests;
#   4. roll FORWARD to the staging digests (the documented post-incident path)
#      and pass health on them.
# The drill never rebuilds (`--no-build`): every boot must resolve the exact
# digests CI promoted, which is the whole point of digest promotion (P4-B06).
set -uo pipefail

prod_tag="" staging_tag=""
compose_env="${COMPOSE_ENV_FILE:-ci.env}"
evidence_dir="${CI_EVIDENCE_DIR:-ci-evidence}"
stack_dir="ops"
wait="${RELEASE_DRILL_WAIT:-240}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --prod-tag) prod_tag="$2"; shift 2 ;;
    --staging-tag) staging_tag="$2"; shift 2 ;;
    --compose-env) compose_env="$2"; shift 2 ;;
    --evidence-dir) evidence_dir="$2"; shift 2 ;;
    *) echo "release-rollback-drill: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
if [ -z "$prod_tag" ] || [ -z "$staging_tag" ]; then
  echo "usage: release-rollback-drill.sh --prod-tag <tag> --staging-tag <tag>" >&2
  exit 2
fi
if [ "$prod_tag" = "$staging_tag" ]; then
  echo "release-rollback-drill: the two tags must differ or the rollback proves nothing" >&2
  exit 3
fi

LEDGER="docs/releases/releases-ledger.jsonl"

digests_for() {
  local tag="$1" kind="$2" line api web
  line=$(grep '"kind":"'"$kind"'"' "$LEDGER" | grep "\"tag\":\"$tag\"" | tail -n1 || true)
  if [ -z "$line" ]; then
    echo "release-rollback-drill: no $kind record for tag '$tag'" >&2
    return 3
  fi
  api=$(printf '%s' "$line" | sed -n 's/.*"api":"\([^"]*\)".*/\1/p')
  web=$(printf '%s' "$line" | sed -n 's/.*"web":"\([^"]*\)".*/\1/p')
  case "$api$web" in *@sha256:*@sha256:*) ;; *)
    echo "release-rollback-drill: $kind record for '$tag' has no sha256 digests" >&2
    return 3 ;;
  esac
  printf '%s %s\n' "$api" "$web"
}

read -r prod_api prod_web < <(digests_for "$prod_tag" promote) || exit $?
read -r staging_api staging_web < <(digests_for "$staging_tag" promote) || exit $?
# Both tags must be ATTESTED too (SBOM + provenance exist before anything is
# deployed, even in a drill): the drill boots what the ledger says was scanned.
prod_attest_ref=$(grep '"kind":"attest"' "$LEDGER" | grep "\"tag\":\"$prod_tag\"" | tail -n1 || true)
staging_attest_ref=$(grep '"kind":"attest"' "$LEDGER" | grep "\"tag\":\"$staging_tag\"" | tail -n1 || true)
if [ -z "$prod_attest_ref" ] || [ -z "$staging_attest_ref" ]; then
  echo "release-rollback-drill: both tags must be attested before the drill boots them (ADR-0050)" >&2
  exit 3
fi
if [ "$prod_api" = "$staging_api" ] || [ "$prod_web" = "$staging_web" ]; then
  echo "release-rollback-drill: the two tags must point at different digests" >&2
  exit 3
fi

compose() {
  docker compose -f "$stack_dir/prod.yml" --env-file "$compose_env" "$@"
}

wait_for_health() {
  local label="$1" deadline=$(( $(date +%s) + wait ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if compose exec -T api node -e \
      "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      echo "drill: health OK ($label)"
      return 0
    fi
    sleep 3
  done
  echo "::error::drill: health never turned OK ($label)" >&2
  return 1
}

# Rewrites the two pin vars in the compose env file so the next `up` runs
# EXACTLY these digests (dotenv: last occurrence wins, so clean first).
pin() {
  local api_digest="$1" web_digest="$2"
  mkdir -p "$(dirname "$compose_env")"
  touch "$compose_env"
  grep -v -e '^SCALPAI_API_IMAGE=' -e '^SCALPAI_WEB_IMAGE=' "$compose_env" > "$compose_env.tmp" || true
  mv "$compose_env.tmp" "$compose_env"
  printf 'SCALPAI_API_IMAGE=%s\nSCALPAI_WEB_IMAGE=%s\n' "$api_digest" "$web_digest" >> "$compose_env"
}

boot() {
  local label="$1" api_digest="$2" web_digest="$3"
  echo "drill: boot $label (api=$api_digest web=$web_digest)"
  pin "$api_digest" "$web_digest" || return 1
  compose up -d --no-build --wait --wait-timeout "$wait" web api || return 1
  wait_for_health "$label" || return 1
}

set -e
boot "prod-digest" "$prod_api" "$prod_web"
echo "drill: promoting the staging digests into the running stack"
boot "staging-digest" "$staging_api" "$staging_web"

echo "drill: ROLLING BACK to the prod digests"
compose down --remove-orphans >/dev/null 2>&1 || true
boot "prod-rollback" "$prod_api" "$prod_web"

echo "drill: roll-forward to the staging digests (documented post-incident path)"
boot "rollforward" "$staging_api" "$staging_web"
set +e

line=$(printf '{"ts":"%s","kind":"rollback-drill","prod":"%s","staging":"%s","steps":["boot-prod","promote-staging","rollback","health","rollforward"],"result":"pass"}' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$prod_tag" "$staging_tag")
mkdir -p docs/releases
printf '%s\n' "$line" >> "$LEDGER"
echo "release-rollback-drill: $line"
exit 0
