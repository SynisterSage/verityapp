#!/bin/sh
set -e

echo "Running Xcode Cloud post-clone setup from frontend/ios..."

cd "$CI_WORKSPACE/frontend"

echo "Installing JavaScript dependencies..."
npm ci

echo "Installing CocoaPods dependencies..."
cd ios
pod install

echo "Validating generated CocoaPods xcconfig..."
test -f "Pods/Target Support Files/Pods-VerityProtect/Pods-VerityProtect.release.xcconfig"

echo "Xcode Cloud post-clone setup complete."
