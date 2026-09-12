#!/usr/bin/env bash
# M14a fixture (ADR-0037): an ops script with no strict mode.
#
# Without `set -euo pipefail` a failed step is ignored and the script exits 0,
# which is how a half-finished restore reports success. Broken on purpose.
echo "restoring snapshot"
rm -rf "${1}"
