#!/bin/sh
set -e

echo "Running Xcode Cloud post-clone setup for Verity Protect..."

cd "$CI_WORKSPACE/frontend"

echo "Installing JavaScript dependencies..."
npm ci

echo "Installing CocoaPods dependencies..."
cd ios
pod install --repo-update

echo "Post-clone setup complete."
