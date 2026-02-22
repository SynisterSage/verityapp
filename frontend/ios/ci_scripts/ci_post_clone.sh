#!/bin/sh
set -eu

echo "Running Xcode Cloud post-clone setup from frontend/ios..."
echo "CI_WORKSPACE=${CI_WORKSPACE:-<unset>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ -n "${CI_WORKSPACE:-}" ] && [ -d "$CI_WORKSPACE/frontend" ]; then
  REPO_ROOT="$CI_WORKSPACE"
fi

FRONTEND_DIR="$REPO_ROOT/frontend"
if [ ! -d "$FRONTEND_DIR" ]; then
  echo "Frontend directory not found at: $FRONTEND_DIR"
  echo "Current dir: $(pwd)"
  echo "Script dir: $SCRIPT_DIR"
  exit 1
fi

echo "Using frontend directory: $FRONTEND_DIR"
cd "$FRONTEND_DIR"

echo "Node: $(node -v)"
echo "npm: $(npm -v)"

echo "Installing JavaScript dependencies..."
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

echo "Installing CocoaPods dependencies..."
cd ios
echo "CocoaPods: $(pod --version)"
pod install --verbose

echo "Validating generated CocoaPods xcconfig..."
test -f "Pods/Target Support Files/Pods-VerityProtect/Pods-VerityProtect.release.xcconfig"

echo "Xcode Cloud post-clone setup complete."
