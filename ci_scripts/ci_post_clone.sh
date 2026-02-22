#!/bin/sh
set -eu

echo "Running Xcode Cloud post-clone setup for Verity Protect..."
echo "CI_WORKSPACE=${CI_WORKSPACE:-<unset>}"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@20/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

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

if ! command -v node >/dev/null 2>&1; then
  echo "Node not found. Attempting install via Homebrew..."
  if command -v brew >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew install node@20 || HOMEBREW_NO_AUTO_UPDATE=1 brew install node || true
    export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@20/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node command not found after install attempt"
  exit 127
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm command not found"
  exit 127
fi

echo "Node: $(node -v)"
echo "npm: $(npm -v)"
echo "NPM_CONFIG_PRODUCTION=${NPM_CONFIG_PRODUCTION:-<unset>}"
echo "NODE_ENV=${NODE_ENV:-<unset>}"

echo "Installing JavaScript dependencies..."
if [ -f package-lock.json ]; then
  npm ci --include=dev --no-audit --no-fund || npm ci --no-audit --no-fund || npm install --include=dev --no-audit --no-fund || npm install --no-audit --no-fund
else
  npm install --include=dev --no-audit --no-fund || npm install --no-audit --no-fund
fi

echo "Installing CocoaPods dependencies..."
cd ios
if ! command -v pod >/dev/null 2>&1; then
  echo "CocoaPods not found. Attempting gem user install..."
  if command -v gem >/dev/null 2>&1; then
    gem install --user-install cocoapods --no-document || true
    GEM_USER_BIN="$(ruby -r rubygems -e 'puts Gem.user_dir')/bin"
    export PATH="$GEM_USER_BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
  fi
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "error: pod command not found after install attempt"
  exit 127
fi

echo "CocoaPods: $(pod --version)"
pod install --verbose

echo "Post-clone setup complete."
