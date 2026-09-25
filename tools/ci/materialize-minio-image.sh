#!/usr/bin/env bash
# Last-resort MinIO image materializer (added 2026-09-25).
#
# quay.io 401s anonymous GitHub-runner pulls, the GHCR mirror is empty until
# the first successful sync, and Docker Hub never published the 2025-09 tags.
# The pinned binaries ARE on GitHub Releases (same tag as the quay pin).
# This helper downloads the linux binary + verifies the published sha256, then
# `docker build`s a minimal image tagged as the requested ref so compose and
# `docker run` keep using the pin. Same tag, checksum-verified binary (M17).
#
# Sourced from tools/ci/retry.sh — do not `set -e` here (retry.sh is sourced
# into workflow steps and must keep its own `set -uo pipefail`).

# Pinned checksums from the GitHub Release `*.sha256sum` assets of the SAME
# tags ops/prod.yml pins. Fail closed if GitHub ever serves a different blob.
MINIO_SHA256_AMD64="7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f"
MINIO_SHA256_ARM64="5c83cd2cf151717ba0243f73e1c7802ff36e272b67144bdd7f1f7d684fd6f03d"
MC_SHA256_AMD64="01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891"
MC_SHA256_ARM64="14c8c9616cfce4636add161304353244e8de383b2e2752c0e9dad01d4c27c12c"

MINIO_RELEASE="${MINIO_RELEASE:-RELEASE.2025-09-07T16-13-09Z}"
MC_RELEASE="${MC_RELEASE:-RELEASE.2025-08-13T08-35-41Z}"

__minio_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo amd64 ;;
    aarch64|arm64) echo arm64 ;;
    *)
      echo "::error::unsupported arch $(uname -m) for MinIO materialize"
      return 1
      ;;
  esac
}

__minio_sha() {
  local kind="$1" arch="$2"
  case "${kind}:${arch}" in
    minio:amd64) echo "$MINIO_SHA256_AMD64" ;;
    minio:arm64) echo "$MINIO_SHA256_ARM64" ;;
    mc:amd64) echo "$MC_SHA256_AMD64" ;;
    mc:arm64) echo "$MC_SHA256_ARM64" ;;
    *) return 1 ;;
  esac
}

# materialize_minio_image <kind> <tag> <local-ref>
# kind is "minio" or "mc". local-ref is the docker tag to produce
# (typically the original quay.io pin so compose finds it locally).
materialize_minio_image() {
  local kind="$1" tag="$2" local_ref="$3"
  local arch url expected work bin expected_tag repo dockerfile

  case "$kind" in
    minio)
      expected_tag="$MINIO_RELEASE"
      repo="minio/minio"
      ;;
    mc)
      expected_tag="$MC_RELEASE"
      repo="minio/mc"
      ;;
    *)
      echo "::error::materialize_minio_image: unknown kind $kind"
      return 1
      ;;
  esac

  if [ "$tag" != "$expected_tag" ]; then
    echo "::error::refusing to materialize $kind:$tag (only the pinned $expected_tag is checksummed)"
    return 1
  fi

  arch="$(__minio_arch)" || return 1
  expected="$(__minio_sha "$kind" "$arch")" || return 1
  url="https://github.com/${repo}/releases/download/${tag}/${kind}.linux-${arch}.${tag}"

  work="$(mktemp -d "${TMPDIR:-/tmp}/scalpai-${kind}.XXXXXX")"
  bin="${work}/${kind}"
  echo "::notice::materializing $local_ref from GitHub Releases ${tag} (${arch})"
  if ! curl -fsSL --retry 4 --retry-delay 5 --retry-all-errors -o "$bin" "$url"; then
    echo "::error::download failed: $url"
    rm -rf "$work"
    return 1
  fi
  if ! printf '%s  %s\n' "$expected" "$bin" | sha256sum -c -; then
    echo "::error::checksum mismatch for $kind ${tag} ${arch}"
    rm -rf "$work"
    return 1
  fi
  chmod 0755 "$bin"

  dockerfile="${work}/Dockerfile"
  if [ "$kind" = "minio" ]; then
    cat > "$dockerfile" <<'DOCKER'
FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl
COPY minio /usr/bin/minio
RUN chmod 0755 /usr/bin/minio
EXPOSE 9000
ENTRYPOINT ["/usr/bin/minio"]
CMD ["server", "/data"]
DOCKER
  else
    cat > "$dockerfile" <<'DOCKER'
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY mc /usr/bin/mc
RUN chmod 0755 /usr/bin/mc
ENTRYPOINT ["/usr/bin/mc"]
DOCKER
  fi

  if ! docker build --network=host -t "$local_ref" "$work"; then
    echo "::error::docker build failed for $local_ref"
    rm -rf "$work"
    return 1
  fi
  rm -rf "$work"
  echo "::notice::materialized $local_ref from checksum-verified GitHub binary $kind.$tag"
  return 0
}
