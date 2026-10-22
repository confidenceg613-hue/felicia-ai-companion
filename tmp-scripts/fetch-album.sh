#!/bin/bash
set -euo pipefail
cd /home/daytona/codebase
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
curl -sSL -A "$UA" "https://photos.app.goo.gl/NzhhrykYjuoDiokU9" -o /tmp/album.html -w "final HTTP %{http_code} size=%{size_download}\n"
echo "=== lh3 urls ==="
grep -oE 'https://lh3\.googleusercontent\.com[^"<> )]*' /tmp/album.html | sort -u | head -30 || true
echo "=== photo id fragments ==="
grep -oE 'AF1Qip[A-Za-z0-9_-]{15,}' /tmp/album.html | sort -u | head || true
echo "=== wc ==="
wc -c /tmp/album.html
