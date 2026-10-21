#!/usr/bin/env bash
# Build upload-ready portal zips: dist/crazygames/tiny-print-shop.zip (CrazyGames Basic Launch, SDK v3) and dist/itchio/tiny-print-shop.zip.
# Optional: --portals crazygames   (see tools/portal-build.py). Test with: node tools/portal-test.js
set -euo pipefail
cd "$(dirname "$0")/.."
python3 tools/portal-build.py tiny-print-shop style.css js fonts icons "$@"
