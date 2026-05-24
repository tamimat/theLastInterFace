#!/usr/bin/env bash
# bump-version.sh — mark a new version of spine/content.js.
#
# Usage:
#   tools/bump-version.sh <N> "<message>"
#
# Example:
#   tools/bump-version.sh 1 "Lock in tailbone + first 5 chapters"
#
# What it does:
#   1. Updates spine/content.js: meta.version → N, meta.lastUpdated → today.
#   2. Commits the change with message "Spine v<N>: <message>".
#   3. Creates an annotated git tag spine-v<N> on the bump commit.
#   4. Pushes the commit and the tag.
#
# The displayed "vN" in the spine UI links to the tagged tree on GitHub,
# so each version's URL is immutable and shows the exact bytes for that v.

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: tools/bump-version.sh <N> \"<message>\"" >&2
  exit 1
fi

NEW_VERSION="$1"
MESSAGE="$2"

if ! [[ "$NEW_VERSION" =~ ^[0-9]+$ ]]; then
  echo "error: <N> must be a non-negative integer, got: $NEW_VERSION" >&2
  exit 1
fi

# Move to repo root regardless of where the script is invoked from.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

CONTENT="spine/content.js"
if [[ ! -f "$CONTENT" ]]; then
  echo "error: $CONTENT not found (run from inside the repo)" >&2
  exit 1
fi

# Read current version for the commit-message check and a friendlier log.
CURRENT_VERSION="$(grep -E '^\s*version:\s*[0-9]+,' "$CONTENT" | head -1 | grep -oE '[0-9]+')"
if [[ -z "$CURRENT_VERSION" ]]; then
  echo "error: couldn't find current version line in $CONTENT" >&2
  exit 1
fi

if [[ "$NEW_VERSION" -le "$CURRENT_VERSION" ]]; then
  echo "error: new version ($NEW_VERSION) must be greater than current ($CURRENT_VERSION)" >&2
  exit 1
fi

TAG="spine-v${NEW_VERSION}"
if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "error: tag ${TAG} already exists" >&2
  exit 1
fi

TODAY="$(date +%Y-%m-%d)"

# Edit the two lines in place. macOS sed needs `-i ''`; GNU sed needs `-i`.
# Detect and branch.
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(sed -i)
else
  SED_INPLACE=(sed -i '')
fi

"${SED_INPLACE[@]}" -E "s/(version:[[:space:]]*)[0-9]+,/\1${NEW_VERSION},/" "$CONTENT"
"${SED_INPLACE[@]}" -E "s/(lastUpdated:[[:space:]]*\")[0-9]{4}-[0-9]{2}-[0-9]{2}(\")/\1${TODAY}\2/" "$CONTENT"

# Sanity-check the rewrite landed.
if ! grep -qE "version:[[:space:]]*${NEW_VERSION}," "$CONTENT"; then
  echo "error: version rewrite did not land in $CONTENT" >&2
  exit 1
fi

echo "→ ${CONTENT}: version ${CURRENT_VERSION} → ${NEW_VERSION}, lastUpdated → ${TODAY}"

git add "$CONTENT"
git commit -m "Spine v${NEW_VERSION}: ${MESSAGE}"
git tag -a "${TAG}" -m "Spine v${NEW_VERSION}: ${MESSAGE}"
git push --follow-tags

echo "✓ Tagged ${TAG} and pushed."
echo "  Tree: $(git config --get remote.origin.url | sed 's/\.git$//')/tree/${TAG}/spine/content.js"
