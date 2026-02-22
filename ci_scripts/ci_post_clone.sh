#!/bin/sh
set -eu

echo "Running Xcode Cloud post-clone setup for Verity Protect..."
echo "CI_WORKSPACE=${CI_WORKSPACE:-<unset>}"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@20/bin:/usr/local/opt/node@20/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -n "${CI_WORKSPACE:-}" ] && [ -d "$CI_WORKSPACE/frontend" ]; then
  REPO_ROOT="$CI_WORKSPACE"
fi

FRONTEND_DIR="$REPO_ROOT/frontend"
if [ ! -d "$FRONTEND_DIR" ]; then
  echo "Frontend directory not found at: $FRONTEND_DIR"
  exit 1
fi

echo "Using frontend directory: $FRONTEND_DIR"
cd "$FRONTEND_DIR"

# Ensure devDependencies are installed in CI. We rely on patch-package in postinstall.
export NPM_CONFIG_PRODUCTION=false
export NODE_ENV=development

find_executable() {
  for bin in "$@"; do
    if [ -n "$bin" ] && [ -x "$bin" ]; then
      echo "$bin"
      return 0
    fi
  done
  return 1
}

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ] || ! "$NODE_BIN" -v >/dev/null 2>&1; then
  echo "Node not found. Attempting install via Homebrew..."
  if command -v brew >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew install node@20 || HOMEBREW_NO_AUTO_UPDATE=1 brew install node || true
    export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@20/bin:/usr/local/opt/node@20/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
  fi
fi

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ] || ! "$NODE_BIN" -v >/dev/null 2>&1; then
  NODE_BIN="$(find_executable \
    /opt/homebrew/opt/node@20/bin/node \
    /usr/local/opt/node@20/bin/node \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    /usr/bin/node || true)"
fi

if [ -z "$NODE_BIN" ] || ! "$NODE_BIN" -v >/dev/null 2>&1; then
  echo "error: node binary not found after install attempt"
  exit 1
fi

NPM_BIN="$(command -v npm 2>/dev/null || true)"
if [ -z "$NPM_BIN" ] || ! "$NPM_BIN" -v >/dev/null 2>&1; then
  NODE_DIR="$(dirname "$NODE_BIN")"
  if [ -x "$NODE_DIR/npm" ]; then
    NPM_BIN="$NODE_DIR/npm"
  fi
fi

if [ -z "$NPM_BIN" ] || ! "$NPM_BIN" -v >/dev/null 2>&1; then
  echo "error: npm binary not found"
  exit 1
fi

echo "Node binary: $NODE_BIN"
echo "npm binary: $NPM_BIN"
echo "Node: $("$NODE_BIN" -v)"
echo "npm: $("$NPM_BIN" -v)"
echo "NPM_CONFIG_PRODUCTION=${NPM_CONFIG_PRODUCTION:-<unset>}"
echo "NODE_ENV=${NODE_ENV:-<unset>}"

echo "Installing JavaScript dependencies..."
if [ -f package-lock.json ]; then
  "$NPM_BIN" ci --include=dev --ignore-scripts --no-audit --no-fund || "$NPM_BIN" ci --ignore-scripts --no-audit --no-fund || "$NPM_BIN" install --include=dev --ignore-scripts --no-audit --no-fund || "$NPM_BIN" install --ignore-scripts --no-audit --no-fund
else
  "$NPM_BIN" install --include=dev --ignore-scripts --no-audit --no-fund || "$NPM_BIN" install --ignore-scripts --no-audit --no-fund
fi

if [ -d patches ] && [ -n "$(ls -A patches 2>/dev/null)" ]; then
  echo "Applying patch-package patches..."
  if [ -x "./node_modules/.bin/patch-package" ]; then
    ./node_modules/.bin/patch-package
  elif [ -f "./node_modules/patch-package/index.js" ]; then
    "$NODE_BIN" ./node_modules/patch-package/index.js
  elif [ -f "./node_modules/patch-package/dist/index.js" ]; then
    "$NODE_BIN" ./node_modules/patch-package/dist/index.js
  else
    echo "warning: patch-package binary not found; skipping patch application"
  fi
fi

echo "Installing CocoaPods dependencies..."
cd ios
POD_BIN="$(command -v pod 2>/dev/null || true)"
if [ -z "$POD_BIN" ] || ! "$POD_BIN" --version >/dev/null 2>&1; then
  echo "CocoaPods not found. Attempting brew install..."
  if command -v brew >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew install cocoapods || true
    export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
  fi
fi

POD_BIN="$(command -v pod 2>/dev/null || true)"
if [ -z "$POD_BIN" ] || ! "$POD_BIN" --version >/dev/null 2>&1; then
  echo "CocoaPods still not found. Attempting gem user install..."
  if command -v gem >/dev/null 2>&1; then
    gem install --user-install cocoapods --no-document || true
    if command -v ruby >/dev/null 2>&1; then
      GEM_USER_BIN="$(ruby -r rubygems -e 'puts Gem.user_dir')/bin"
      export PATH="$GEM_USER_BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
    fi
  fi
fi

POD_BIN="$(command -v pod 2>/dev/null || true)"
if [ -z "$POD_BIN" ] || ! "$POD_BIN" --version >/dev/null 2>&1; then
  for p in "$HOME"/.gem/ruby/*/bin/pod; do
    if [ -x "$p" ]; then
      POD_BIN="$p"
      break
    fi
  done
fi

if [ -z "$POD_BIN" ] || ! "$POD_BIN" --version >/dev/null 2>&1; then
  echo "error: pod binary not found after install attempt"
  exit 1
fi

echo "pod binary: $POD_BIN"
echo "CocoaPods: $("$POD_BIN" --version)"
"$POD_BIN" install --verbose

echo "Post-clone setup complete."
