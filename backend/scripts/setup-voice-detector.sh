#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv-voice-detector
.venv-voice-detector/bin/python3 -m pip install --upgrade pip setuptools wheel
.venv-voice-detector/bin/python3 -m pip install -r voice-detector/requirements-inference.txt
