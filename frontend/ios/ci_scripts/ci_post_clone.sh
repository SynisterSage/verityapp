#!/usr/bin/env bash
set -euo pipefail
trap 'echo "error: ci_post_clone failed at line $LINENO: $BASH_COMMAND"' ERR

echo "Running Xcode Cloud post-clone setup from frontend/ios..."
echo "CI_WORKSPACE=${CI_WORKSPACE:-<unset>}"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@20/bin:/usr/local/opt/node@20/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export NPM_CONFIG_PRODUCTION=false
export NODE_ENV=development

run() {
  echo "+ $*"
  "$@"
}

retry_run() {
  local max_attempts="$1"
  local sleep_seconds="$2"
  shift 2

  local attempt=1
  until run "$@"; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "error: command failed after ${attempt} attempts: $*"
      return 1
    fi
    echo "warn: attempt ${attempt}/${max_attempts} failed for: $*"
    echo "warn: retrying in ${sleep_seconds}s..."
    sleep "$sleep_seconds"
    attempt=$((attempt + 1))
    sleep_seconds=$((sleep_seconds * 2))
  done
}

install_ruby_gem() {
  local gem_name="$1"
  local gem_version="$2"
  if ! command -v gem >/dev/null 2>&1; then
    echo "error: gem is not available, cannot install ${gem_name}"
    return 1
  fi
  retry_run 3 8 gem install --user-install "${gem_name}" -v "${gem_version}" --no-document
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
if [ -n "${CI_WORKSPACE:-}" ] && [ -d "$CI_WORKSPACE/frontend" ]; then
  REPO_ROOT="$CI_WORKSPACE"
fi

FRONTEND_DIR="$REPO_ROOT/frontend"
if [ ! -d "$FRONTEND_DIR" ]; then
  echo "error: frontend directory not found at $FRONTEND_DIR"
  exit 1
fi

cd "$FRONTEND_DIR"
echo "Using frontend directory: $FRONTEND_DIR"

if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    run brew install node@20 || run brew install node
    export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@20/bin:/usr/local/opt/node@20/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
  fi
fi

run node -v
run npm -v

if [ -f package-lock.json ]; then
  retry_run 3 8 npm ci --no-audit --no-fund
else
  retry_run 3 8 npm install --no-audit --no-fund
fi

cd ios
echo "Using iOS directory: $(pwd)"

if command -v ruby >/dev/null 2>&1; then
  GEM_USER_BIN="$(ruby -r rubygems -e 'puts Gem.user_dir')/bin"
  export PATH="$GEM_USER_BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
fi

if ! command -v pod >/dev/null 2>&1; then
  install_ruby_gem cocoapods 1.16.2
fi

# Ensure xcodeproj parser supports current Xcode project format on CI.
install_ruby_gem xcodeproj 1.27.0

run pod --version
# CocoaPods CDN can intermittently fail DNS resolution on Xcode Cloud.
# Retry pod install a few times so transient network failures don't fail the build.
retry_run 4 10 pod install --verbose

test -f "Pods/Target Support Files/Pods-VerityProtect/Pods-VerityProtect.release.xcconfig"
echo "Xcode Cloud post-clone setup complete."
