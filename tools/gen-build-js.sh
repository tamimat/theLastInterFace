#!/usr/bin/env bash
# gen-build-js.sh — write site/build.js from current git state.
#
# Mirrors the deploy workflow so local dev sees the same `git #N` label.
# Safe to run any time. The post-commit hook runs it after every commit;
# you can also run it by hand if HEAD moved (pull, checkout, reset).

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# 0-indexed to match the [N] prefix the prepare-commit-msg hook writes.
N=$(($(git rev-list --count HEAD) - 1))
SHA=$(git rev-parse HEAD)

cat > site/build.js <<EOF
// Generated locally by tools/gen-build-js.sh (and at deploy time by
// .github/workflows/pages.yml). Gitignored — never commit this file.
window.SPINE_BUILD = { count: $N, sha: "$SHA" };
EOF

echo "wrote site/build.js → git #$N ($SHA)"
