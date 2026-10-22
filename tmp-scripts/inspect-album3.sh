#!/bin/bash
set -euo pipefail
FILE=/tmp/album.html
echo "=== og:title / og:image / og:description ==="
grep -oE '<meta[^>]*(og:title|og:image|og:description|og:type)[^>]*>' "$FILE" | sed 's/>$//' | head
echo "=== title tag ==="
grep -oE '<title>[^<]*</title>' "$FILE" | head
echo "=== all og:image url(s) ==="
grep -oE 'https://lh3\.googleusercontent\.com[^"<> ]*\.jpg' "$FILE" | sort -u
grep -oE 'https://lh3\.googleusercontent\.com[^"<> ]*=w544' "$FILE" | sort -u
echo "=== any mention of 'video' or 'MP4' or '.mp4' ==="
grep -oE "https?://[^"<> ]*\.mp4" "$FILE" | sort -u | head
grep -oiE "video[^,}\"]*" "$FILE" | sort -u | head
echo "=== count of og:image ==="
grep -c "og:image" "$FILE" || true
echo "=== any script json with media/productBaseUrl ==="
grep -oE '"(productBaseUrl|baseUrl|mediaUrl|imageUrl|thumbUrl|streamUrl|videoUrl|mp4Url|contentUrl)"[^:]*:[^,}\"]+' "$FILE" | sort -u | head -20
echo "=== search for 'New video' string ==="
grep -oE '"New video[^"]*"' "$FILE" | sort -u | head
grep -oE "New video[^,}\"]*" "$FILE" | sort -u | head
echo "=== any Array of media? search for 'media' near array brackets ==="
grep -oE '"media[^"]*":\s*\[' "$FILE" | head
grep -oE '\[[^{]*baseUrl[^]]*\]' "$FILE" | head
echo "=== sized image url count (all w<width> variants) ==="
grep -oE "https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]+=w[0-9]+" "$FILE" | sort -u | wc -l
echo "=== unique sized image urls ==="
grep -oE "https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]+=w[0-9]+-[a-z0-9-]*" "$FILE" | sort -u
echo "=== does the page reference more than one photo id? (AP1Gcz...) ==="
grep -oE "AP1Gcz[A-Za-z0-9_-]{20,}" "$FILE" | sort -u | wc -l
echo "=== any 'items' or 'contents' arrays with urls ==="
grep -oE '"[^"]*":[\[][^]{]*\.jpg[^]]*[]}]' "$FILE" | head -5
echo "=== raw html around og:image ==="
grep -oE '<meta[^>]*og:image[^>]*>' "$FILE" | head
echo "=== size ==="
wc -c "$FILE"
echo "done"
