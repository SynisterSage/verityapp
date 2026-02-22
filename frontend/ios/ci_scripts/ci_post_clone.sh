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
  run npm ci --no-audit --no-fund
else
  run npm install --no-audit --no-fund
fi

cd ios
echo "Using iOS directory: $(pwd)"

if ! command -v bundle >/dev/null 2>&1; then
  if command -v gem >/dev/null 2>&1; then
    run gem install --user-install bundler --no-document
    if command -v ruby >/dev/null 2>&1; then
      GEM_USER_BIN="$(ruby -r rubygems -e 'puts Gem.user_dir')/bin"
      export PATH="$GEM_USER_BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
    fi
  fi
fi

if command -v bundle >/dev/null 2>&1; then
  run bundle config set path vendor/bundle
  run bundle install --jobs 4 --retry 3
  run bundle exec pod install --verbose
else
  if ! command -v pod >/dev/null 2>&1; then
    if command -v brew >/dev/null 2>&1; then
      run brew install cocoapods
      export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
    else
      echo "error: neither bundle nor pod is available"
      exit 1
    fi
  fi
  run pod --version
  run pod install --verbose
fi

test -f "Pods/Target Support Files/Pods-VerityProtect/Pods-VerityProtect.release.xcconfig"
echo "Xcode Cloud post-clone setup complete."
