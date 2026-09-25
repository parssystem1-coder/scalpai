#!/usr/bin/env bash
# CI network-flake helper (added 2026-09-25).
#
# Three consecutive PR runs (2026-09-25, and Nightly on main the night before)
# failed before any test executed:
#   - "Start MinIO" / compose `up`: `docker pull quay.io/minio/minio:...` died
#     with `unauthorized: access to the requested resource is not authorized`
#     (quay rate-limiting / blocking anonymous GitHub-runner pulls),
#   - restore-drill: the pgdg apt repo and github.com tool downloads timed out.
# None of these are code failures, so the gates must tolerate them.
#
# Two mechanisms, in escalating order:
#   retry_cmd       — exponential backoff around ANY command (transient 5xx,
#                     DNS blips, apt mirror hiccups).
#   retry_docker_pull — pull with the committed retry loop AND, on final
#                     failure, fall back to the mirror chain below.
#
# Mirror chain for MinIO images (first one that serves the digest wins):
#   1. ghcr.io/scalpai/mirror-minio/minio:<tag>  — server-side copy of the
#     SAME digest, synced by .github/workflows/mirror-images.yml (quay -> GHCR
#     with `docker buildx imagetools create`). GHCR serves it from GitHub's
#     own network — the exact path the runner already uses for every action.
#   2. docker.io/minio/minio:<tag> — upstream's Docker Hub archive; MinIO
#     stopped publishing there (the 2025-09 tags are absent) so this is
#     best-effort only, kept for resilience if Hub re-syncs.
#
# The tag stays the source of truth (M17-style pin); mirrors are copy-by-digest
# from the SAME tag, so a fallback can never yield a different image.
set -uo pipefail

RETRY_MAX_ATTEMPTS="${RETRY_MAX_ATTEMPTS:-4}"
RETRY_BASE_DELAY="${RETRY_BASE_DELAY:-5}" # seconds; doubles per attempt (5,10,20,40)

# The repo owner (ghcr.io/<owner>/mirror-minio/...). Workflows export
# GHCR_MIRROR_OWNER=${{ github.repository_owner }} so this default only
# matters for local/ad-hoc runs.
GHCR_MIRROR_OWNER="${GHCR_MIRROR_OWNER:-parssystem1-coder}"

# retry_cmd <label> <cmd...> — exponential backoff, then give up loudly.
retry_cmd() {
  local label="$1"; shift
  local attempt=1 delay="$RETRY_BASE_DELAY"
  while true; do
    if "$@"; then
      if [ "$attempt" -gt 1 ]; then echo "::notice::$label succeeded on attempt $attempt"; fi
      return 0
    fi
    if [ "$attempt" -ge "$RETRY_MAX_ATTEMPTS" ]; then
      echo "::error::$label failed after $attempt attempts"
      return 1
    fi
    echo "::warning::$label attempt $attempt failed — retrying in ${delay}s"
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

# __pull_with_mirrors <image...> — pulls each ref verbatim; a pull that fails
# on TRANSIENT grounds gets the mirror fallback; an explicit manifest/auth
# rejection of the ref itself does not (nothing mirrors would fix).
__pull_with_mirrors() {
  local image="$1"
  local repo="${image%%:*}"
  local tag="latest"
  case "$image" in *:*) tag="${image##*:}" ;; esac

  if docker pull "$image"; then return 0; fi

  case "$repo" in
  quay.io/minio/minio | minio/minio)
    echo "::warning::pull of $image failed — trying GHCR digest mirror"
    if docker pull "ghcr.io/${GHCR_MIRROR_OWNER}/mirror-minio/minio:${tag}"; then
      docker tag "ghcr.io/${GHCR_MIRROR_OWNER}/mirror-minio/minio:${tag}" "$image"
      return 0
    fi
    if docker pull "docker.io/minio/minio:${tag}" 2>/dev/null; then
      docker tag "docker.io/minio/minio:${tag}" "$image"
      return 0
    fi
    echo "::error::all registry sources failed for $image (quay, GHCR mirror, hub)"
    return 1
    ;;
  quay.io/minio/mc)
    echo "::warning::pull of $image failed — trying GHCR digest mirror"
    if docker pull "ghcr.io/${GHCR_MIRROR_OWNER}/mirror-minio/mc:${tag}"; then
      docker tag "ghcr.io/${GHCR_MIRROR_OWNER}/mirror-minio/mc:${tag}" "$image"
      return 0
    fi
    echo "::error::all registry sources failed for $image"
    return 1
    ;;
  *)
    # Unknown registry: plain pull already retried by the caller's loop.
    return 1
    ;;
  esac
}

# retry_docker_pull <image> — docker pull with backoff + mirror fallback.
retry_docker_pull() {
  retry_cmd "docker pull $1" __pull_with_mirrors "$1"
}
