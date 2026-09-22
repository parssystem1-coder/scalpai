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
# ops/ci.env is where CI materializes the compose env (working-directory: ops
# for the earlier gates); the repo-root default keeps a manual repo-root run
# pointing at the same file.
compose_env="${COMPOSE_ENV_FILE:-ops/ci.env}"

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
channel="prod"
[ -n "${SCALPAI_RELEASE_CHANNEL:-}" ] && channel="$SCALPAI_RELEASE_CHANNEL"
build_args=(--build-arg "RELEASE_CHANNEL=$channel")
[ "${RELEASE_NO_CACHE:-0}" = "1" ] && build_args+=(--no-cache)
docker compose -f ops/prod.yml --env-file "$compose_env" \
  build "${build_args[@]}" api web

push_digest() {
  # The pushed digest comes from the registry's own response (the final
  # `<tag>: digest: sha256:...` line of docker push), never from
  # `docker image inspect .RepoDigests`: on the containerd image store that
  # list is unordered and can carry digests from unrelated repositories
  # (CI run 35711383690 recorded redis's digest for the api image).
  local image="$1"
  local out digest
  out=$(docker push "$image" 2>&1)
  printf '%s\n' "$out" >&2
  digest=$(printf '%s\n' "$out" | sed -n 's/.*: digest: \(sha256:[0-9a-f]\{64\}\).*/\1/p' | tail -n1)
  if ! printf '%s' "$digest" | grep -qE '^sha256:[0-9a-f]{64}$'; then
    echo "::error::release-promote: push of $image did not return a sha256 digest" >&2
    return 1
  fi
  printf '%s@%s\n' "${image%:*}" "$digest"
}

# Resolve a service's image from the compose config JSON. `config --images <svc>`
# does NOT filter by service on the compose version CI ships - it prints every
# service's image in randomized map order, so `head -n1` once promoted the
# redis image as the api digest and another run the minio image (CI runs
# 35711383690 / 35719441086 / 35728585510). Parse the JSON instead.
image_for() {
  local svc="$1" img
  img=$(docker compose -f ops/prod.yml --env-file "$compose_env" config --format json 2>/dev/null \
    | node -e '
        let raw = "";
        process.stdin.on("data", (c) => { raw += c; });
        process.stdin.on("end", () => {
          const cfg = JSON.parse(raw.slice(raw.indexOf("{")));
          const svc = cfg.services && cfg.services[process.argv[1]];
          const img = svc && svc.image;
          if (!img) { console.error("release-promote: no image for service " + process.argv[1]); process.exit(1); }
          console.log(img);
        });
      ' "$svc") || img=""
  if [ -z "$img" ]; then
    echo "::error::release-promote: could not resolve the image of service '$svc' from ops/prod.yml" >&2
    exit 1
  fi
  printf '%s\n' "$img"
}

api_image="${registry%/}/scalpai-api:$tag"
web_image="${registry%/}/scalpai-web:$tag"
api_src="$(image_for api)"
web_src="$(image_for web)"
if [ "$api_src" = "$web_src" ]; then
  echo "::error::release-promote: api and web resolve to the same image ($api_src)" >&2
  exit 1
fi
docker tag "$api_src" "$api_image"
docker tag "$web_src" "$web_image"

api_digest=$(push_digest "$api_image")
web_digest=$(push_digest "$web_image")
for ref in "$api_digest" "$web_digest"; do
  case "$ref" in *@sha256:*) ;; *)
    echo "::error::release-promote: registry did not return digest refs ($ref)" >&2
    exit 1 ;;
  esac
  if ! printf '%s' "$ref" | grep -qE '/[a-z0-9._-]+@sha256:[0-9a-f]{64}$'; then
    echo "::error::release-promote: digest ref '$ref' is not <repo>@sha256:<64hex> - refusing to write the ledger" >&2
    exit 1
  fi
done
case "$api_digest" in "${api_image%:*}"@*) ;; *)
  echo "::error::release-promote: api digest ref does not match the pushed api repository" >&2
  exit 1 ;;
esac
case "$web_digest" in "${web_image%:*}"@*) ;; *)
  echo "::error::release-promote: web digest ref does not match the pushed web repository" >&2
  exit 1 ;;
esac

line=$(printf '{"ts":"%s","kind":"promote","commit":"%s","tag":"%s","registry":"%s","api":"%s","web":"%s"}' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$commit" "$tag" "$registry" "$api_digest" "$web_digest")
printf '%s\n' "$line" >> "$LEDGER"
echo "release-promote: $line"
