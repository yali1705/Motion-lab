#!/usr/bin/env bash
set -euo pipefail
python3 "$(dirname "$0")/qa.py" "${1:-out/opening_shot.mp4}"
