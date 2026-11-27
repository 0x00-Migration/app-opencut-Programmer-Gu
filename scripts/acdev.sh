#!/bin/sh
# Run acdev for this repo against a chosen runtime build, with the CLI from the same acdev-next checkout.
# Default: the Dopame workspace's OpenCut runtime (../build/bin/acdev-opencut-latest, built by build/build-opencut.sh).
# Usage: scripts/acdev.sh <acdev args…>      e.g. scripts/acdev.sh test e2e/import.e2e.ts
#        ACDEV_RUNTIME=/path/to/acdev scripts/acdev.sh dev
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
# The Dopame workspace is the nearest ancestor with build/build-opencut.sh (the repo may be a worktree deeper down).
ws=$here
while [ "$ws" != / ] && [ ! -x "$ws/build/build-opencut.sh" ]; do ws=$(dirname "$ws"); done
[ "$ws" != / ] || ws=$(cd "$here/.." && pwd)
runtime=${ACDEV_RUNTIME:-$ws/build/bin/acdev-opencut-latest}
[ -e "$runtime" ] || { echo "no runtime at $runtime: run $ws/build/build-opencut.sh" >&2; exit 1; }
prov="$(readlink -f "$runtime" 2>/dev/null || echo "$runtime").provenance"
cli=$(sed -n 's/^cli //p' "$prov" 2>/dev/null)
[ -n "$cli" ] || cli=$ws/build/src-opencut/acdev-next/npm/bin/acdev.mjs
[ -f "$ws/build/tools/env.sh" ] && . "$ws/build/tools/env.sh"
export ACDEV_RUNTIME="$runtime"
cd "$here"
exec "${ACDEV_BUN:-bun}" "$cli" "$@"
