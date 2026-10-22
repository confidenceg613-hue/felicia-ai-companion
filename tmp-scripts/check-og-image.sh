#!/bin/bash
set -euo pipefail
echo "=== file ==="
ls -l /tmp/og.jpg
echo "=== imagemagick identify ==="
identify /tmp/og.jpg 2>/dev/null || echo "no imagemagick"
echo "=== python PIL dimensions ==="
python3 - <<'PY' 2>/dev/null || echo "no PIL"
from PIL import Image
im = Image.open("/tmp/og.jpg")
print("PIL", im.size, im.format, im.mode)
PY
echo "=== file type via head bytes ==="
head -c 16 /tmp/og.jpg | xxd | head -2 || true
echo "done"
