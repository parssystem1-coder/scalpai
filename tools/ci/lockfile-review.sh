#!/usr/bin/env bash
# H16 - the lockfile is the contract, and touching it is a review event.
#
# Enforced here:
#   1. npm is the only package manager: no foreign lockfile may be committed.
#   2. package-lock.json exists and uses the npm 10 format (lockfileVersion 3).
#   3. a package.json change without a package-lock.json change fails.
#   4. a lockfile change prints its diff stat and every newly resolved tarball,
#      so the reviewer sees what actually entered the tree, and any resolved URL
#      outside registry.npmjs.org fails the gate.
set -uo pipefail

fail=0

echo "--- 1. no foreign lockfile ---"
for foreign in pnpm-lock.yaml yarn.lock bun.lockb; do
  if [ -f "$foreign" ]; then
    echo "::error::$foreign is committed - npm is the only package manager (ADR-0036)"
    fail=1
  else
    echo "ok: $foreign absent"
  fi
done

echo "--- 2. lockfile format ---"
if [ ! -f package-lock.json ]; then
  echo "::error::package-lock.json is missing"
  fail=1
else
  version=$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('package-lock.json','utf8')).lockfileVersion))")
  echo "lockfileVersion=$version"
  if [ "$version" -lt 3 ]; then
    echo "::error::lockfileVersion $version is older than npm 7 format - regenerate with npm 10"
    fail=1
  fi
fi

echo "--- 3. manifest and lockfile move together ---"
base="${GITHUB_BASE_REF:-}"
if [ -n "$base" ]; then
  git fetch --no-tags --depth=200 origin "$base" >/dev/null 2>&1 || true
  range="origin/$base...HEAD"
else
  range="HEAD~1...HEAD"
fi
echo "diff range: $range"
changed=$(git diff --name-only "$range" 2>/dev/null || true)
if [ -z "$changed" ]; then
  echo "no file changes detected in range - nothing to review"
else
  echo "$changed"
fi
manifests=$(printf '%s\n' "$changed" | grep -E '(^|/)package\.json$' || true)
lockchange=$(printf '%s\n' "$changed" | grep -E '^package-lock\.json$' || true)
if [ -n "$manifests" ] && [ -z "$lockchange" ]; then
  echo "::error::a package.json changed without package-lock.json:"
  printf '%s\n' "$manifests"
  echo "run: npm install --package-lock-only --legacy-peer-deps && commit the lockfile"
  fail=1
else
  echo "ok: manifest and lockfile are consistent for this change"
fi

echo "--- 4. what entered the lockfile ---"
if [ -n "$lockchange" ]; then
  git diff --stat "$range" -- package-lock.json || true
  added=$(git diff "$range" -- package-lock.json | grep -E '^\+.*\"resolved\":' || true)
  if [ -n "$added" ]; then
    printf '%s\n' "$added"
    offsite=$(printf '%s\n' "$added" | grep -v 'registry\.npmjs\.org' || true)
    if [ -n "$offsite" ]; then
      echo "::error::lockfile resolves packages outside registry.npmjs.org:"
      printf '%s\n' "$offsite"
      fail=1
    fi
  fi
else
  echo "lockfile untouched in this range"
fi

if [ "$fail" -ne 0 ]; then
  echo "lockfile review: FAIL"
  exit 1
fi
echo "lockfile review: OK"
