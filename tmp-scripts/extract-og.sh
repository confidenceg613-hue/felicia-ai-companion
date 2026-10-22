#!/bin/bash
set -euo pipefail
FILE=/tmp/album.html
echo "=== og:image (raw meta) ==="
grep -oE '<meta property="og:image" content="[^"]*"' "$FILE" | head
echo "=== og:image url (decoded) ==="
grep -oE '<meta property="og:image" content="[^"]*"' "$FILE" | head -1 | sed 's/.*content="//; s/"$//; s/\\u003d/=/g; s/\\u0026/\&/g'
echo "=== download og:image to /tmp/og.jpg ==="
URL=$(grep -oE '<meta property="og:image" content="[^"]*"' "$FILE" | head -1 | sed 's/.*content="//; s/"$//; s/\\u003d/=/g; s/\\u0026/\&/g')
echo "URL=$URL"
curl -sSL -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" "$URL" -o /tmp/og.jpg -w "HTTP %{http_code} size=%{size_download} type=%{content_type}\n"
echo "=== file type ==="
file /tmp/og.jpg 2>/dev/null || true
echo "=== dimensions (if imagemagick) ==="
identify /tmp/og.jpg 2>/dev/null || true
echo "=== count of DISTINCT media ids (AP1Gcz...) in page ==="
grep -oE "AP1Gcz[A-Za-z0-9_-]{20,}" "$FILE" | sort -u | wc -l
echo "=== any other AP1Gcz (diff) ids? search broader ==="
grep -oE "AP1Gcz[A-Za-z0-9_-]{40}" "$FILE" | sort -u
echo "done"
