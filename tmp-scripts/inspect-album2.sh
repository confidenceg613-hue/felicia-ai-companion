#!/bin/bash
set -euo pipefail
FILE=/tmp/album.html
echo "=== title ==="
grep -oE '<title>[^<]*</title>' "$FILE" | head
echo "=== og tags ==="
grep -oE '<meta[^>]*(og:image|og:title|og:description)[^>]*>' "$FILE" | head
echo "=== any JSON photo object keys ==="
grep -oE '"(id|photoId|mediaId|baseUrl|productUrl|photoUrl|imageUrl|title|name|description|thumbUrl|tqThumb|ets|uploaded|width|height|cameraMake|cameraModel)"[^:]*:[^,}]+' "$FILE" | sort -u | head -40
echo "=== raw AP1Gcz media ids present ==="
grep -oE "AP1Gcz[A-Za-z0-9_-]{40,}" "$FILE" | sort -u
echo "=== album json blob? search for 'album' or 'items' or 'media' close to share id ==="
grep -oE '"(album|items|media|photos|productUrls|baseUrls|shareToken)"[^:]*:[^,}\[{]]{0,80}' "$FILE" | sort -u | head
echo "=== any url with '=w' counts ==="
grep -oE "=w[0-9]+" "$FILE" | sort | uniq -c | sort -rn | head
echo "=== count of og:image occurrence ==="
grep -c "og:image" "$FILE" || true
echo "=== lines containing 'GODWIN' (title appears in js?) ==="
grep -oE "GODWIN[^,}\"]*" "$FILE" | sort -u | head
echo "=== any script with cdn staging urls ==="
grep -oE "https://[a-z0-9.-]*googleusercontent\.com/[a-z0-9_./-]+/photo/[A-Za-z0-9_-]+" "$FILE" | sort -u | head
echo "=== div/img tags with data attributes holding media ==="
grep -oE '<img[^>]*data-[a-z-]+="[^"]*"' "$FILE" | head -20
echo "=== img src set ==="
grep -oE '<img[^>]*src="[^"]*lh3[^"]*"' "$FILE" | head -20
echo "=== how many 'photo' substring occurrences ==="
grep -oc "photo" "$FILE" || true
echo "done"
