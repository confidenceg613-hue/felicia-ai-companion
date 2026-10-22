#!/bin/bash
set -euo pipefail
FILE=/tmp/album.html
echo "=== file size ==="
wc -c "$FILE"
echo "=== title ==="
grep -oE "<title>[^<]*</title>" "$FILE" | head
echo "=== og tags ==="
grep -oE "<meta[^>]*(og:title|og:image|og:description|og:type|og:url)[^>]*>" "$FILE" | head -10
echo "=== og:image jpg urls ==="
grep -oE "https://lh3\.googleusercontent\.com[^"<> ]*\.jpg" "$FILE" | sort -u || true
echo "=== og:image sized urls ==="
grep -oE "https://lh3\.googleusercontent\.com[^"<> ]*=w544-h[0-9]+" "$FILE" | sort -u || true
echo "=== mp4 / video ==="
grep -oE "https[^"<> ]*\.mp4[^"<> ]*" "$FILE" | sort -u | head || true
grep -oiE "video|mp4|mov|film" "$FILE" | sort | uniq -c | head || true
echo "=== all sized lh3 urls ==="
grep -oE "https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]+=w[0-9]+-h[0-9]+-[a-z0-9-]*" "$FILE" | sort -u || true
echo "=== count sized image urls ==="
grep -oE "https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]+=w[0-9]+-h[0-9]+" "$FILE" | sort -u | wc -l || true
echo "=== distinct AP1Gcz ids ==="
grep -oE "AP1Gcz[A-Za-z0-9_-]{20,}" "$FILE" | sort -u | wc -l || true
echo "=== product/baseUrl/json fields ==="
grep -oE '"(productUrl|baseUrl|photoUrl|imageUrl|mediaUrl|contentUrl|thumbUrl)"[^:]*:[^,}]+' "$FILE" | sort -u | head -20 || true
echo "=== photo page links ==="
grep -oE "https://photos\.google\.com/[^\"<> ]*photo[A-Za-z0-9_/-]*" "$FILE" | sort -u | head || true
echo "=== New video context ==="
grep -oE ".{40}New video.{40}" "$FILE" | head -2 || true
echo "done"
