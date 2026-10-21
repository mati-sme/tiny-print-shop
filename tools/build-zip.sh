#!/usr/bin/env bash
# Zip the playable game (no tests / sims / node_modules) to /workspace/out/tiny-print-shop.zip (or $1).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/workspace/out/tiny-print-shop.zip}"
mkdir -p "$(dirname "$OUT")"
python3 - "$OUT" <<'PY'
import sys, os, zipfile
out = sys.argv[1]
files = ['index.html', 'style.css', 'README.md']
for d in ('js', 'icons', 'fonts'):
    for root, _, fs in os.walk(d):
        files += [os.path.join(root, f) for f in sorted(fs)]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, os.path.join('tiny-print-shop', f))
print(out, os.path.getsize(out), 'bytes,', len(files), 'files')
PY
