#!/usr/bin/env bash
# Evidence wrapper for every CI gate (WEAKNESSES L1/W23, ADR-0037).
#
#   bash tools/ci/run-gate.sh <gate-name> <command> [args...]
#
# Runs the command, streams its output to the job console AND to
# ${CI_EVIDENCE_DIR:-ci-evidence}/<gate-name>.log together with the exact
# command line, the commit and the exit code.
#
# The wrapped command's exit code is this script's exit code: the wrapper can
# never turn a red command green. tools/ci/gate-report.ts then refuses to report
# PASS unless every required gate has such a log with exit=0.
set -uo pipefail

name="${1:-}"
if [ -z "$name" ]; then
  echo "usage: run-gate.sh <gate-name> <command> [args...]" >&2
  exit 2
fi
shift
if [ "$#" -eq 0 ]; then
  echo "run-gate.sh: gate '$name' has no command" >&2
  exit 2
fi

dir="${CI_EVIDENCE_DIR:-ci-evidence}"
mkdir -p "$dir"
log="$dir/$name.log"
commit="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"

{
  echo "gate=$name"
  echo "command=$*"
  echo "commit=$commit"
  echo "workflow=${GITHUB_WORKFLOW:-local}"
  echo "job=${GITHUB_JOB:-local}"
  echo "started=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "--- output ---"
} > "$log"

echo "::group::gate $name"
"$@" 2>&1 | tee -a "$log"
code="${PIPESTATUS[0]}"
echo "::endgroup::"

{
  echo "--- end of output ---"
  echo "finished=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "exit=$code"
} >> "$log"

if [ "$code" -ne 0 ]; then
  echo "::error::gate $name failed (exit $code)"
fi
exit "$code"
