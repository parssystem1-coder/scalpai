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
# Pull order for MinIO images (2026-09-25, after quay 401'd even a GitHub
# runner during its sync):
#   1. ghcr.io/<owner>/mirror-minio/... — OUR copy in this repo's GHCR,
#     synced from the quay pin by mirror-images.yml (server-side
#     `imagetools create`: identical layer/config digests, tag written only
#     from that pin). GHCR sits on GitHub's own network and never rate-limits
#     our runners, so it is the PRIMARY source.
#   2. quay.io/<upstream> — the original pin; fallback for the window before
#     the mirror is first populated (or if GHCR is unavailable).
#   3. docker.io/minio/minio — best-effort only: MinIO stopped publishing
#     there (the 2025-09 tags are absent); kept in case Hub re-syncs.
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

  case "$repo" in
  quay.io/minio/minio | minio/minio)
    # PRIMARY: our GHCR mirror (GitHub's network, no anonymous-pull limits).
    if docker pull "ghcr.io/${GHCR_MIRROR_OWNER}/mirror-minio/minio:${tag}"; then
      echo "::notice::served $image from the GHCR digest mirror"
      docker tag "ghcr.io/${GHCR_MIRROR_OWNER}/mirror-minio/minio:${tag}" "$image"
      return 0
    fi
    # FALLBACK 1: the original pin (works whenever quay is healthy).
    if docker pull "$image"; then return 0; fi
    # FALLBACK 2: upstream hub archive (best-effort; 2025-09 tags absent).
    if docker pull "docker.io/minio/minio:${tag}" 2>/dev/null; then
      docker tag "docker.io/minio/minio:${tag}" "$image"
      return 0
    fi
    echo "::error::all registry sources failed for $image (GHCR mirror, quay, hub)"
    return 1
    ;;
  quay.io/minio/mc)
    if docker pull "ghcr.io/${GHCR_MIRROR_OWNER}/mirror-minio/mc:${tag}"; then
      echo "::notice::served $image from the GHCR digest mirror"
      docker tag "ghcr.io/${GHCR_MIRROR_OWNER}/mirror-minio/mc:${tag}" "$image"
      return 0
    fi
    if docker pull "$image"; then return 0; fi
    echo "::error::all registry sources failed for $image (GHCR mirror, quay)"
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
