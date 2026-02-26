#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -n "${CI_WORKSPACE:-}" ] && [ -d "$CI_WORKSPACE/frontend/ios/ci_scripts" ]; then
  REPO_ROOT="$CI_WORKSPACE"
fi

DELEGATE_SCRIPT="$REPO_ROOT/frontend/ios/ci_scripts/ci_post_clone.sh"
if [ ! -x "$DELEGATE_SCRIPT" ]; then
  echo "error: delegate post-clone script not found or not executable at $DELEGATE_SCRIPT"
  exit 1
fi

exec "$DELEGATE_SCRIPT"
