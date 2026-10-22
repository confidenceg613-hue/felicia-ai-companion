#!/bin/bash
set -euo pipefail
FILE=/tmp/album.html
echo "=== sized photo tile urls (w544) ==="
grep -oE "https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]+=w544-h[0-9]+-[a-z0-9-]*" "$FILE" | sort -u
echo "=== all sized w<width>-h<height> urls ==="
grep -oE "https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]+=w[0-9]+-h[0-9]+-[a-z0-9-]*" "$FILE" | sort -u
echo "=== photo page links (/p/ or /photo/) ==="
grep -oE 'https://photos\.google\.com/[^"<> ]*photo[^"<> ]*' "$FILE" | sort -u | head -20
echo "=== share album links ==="
grep -oE 'https://photos\.google\.com/share/[^"<> ]*' "$FILE" | sort -u | head
echo "=== title ==="
grep -oE '<title>[^<]*</title>' "$FILE" | head
echo "=== og:image ==="
grep -oE '<meta[^>]*og:image[^>]*>' "$FILE" | head
echo "=== product/baseUrl/json photo fields ==="
grep -oE '"(photoId|mediaId|baseUrl|productUrl|photoUrl|imageUrl)":"[^"]*"' "$FILE" | sort -u | head -20
echo "=== count of p-w544 tiles ==="
grep -oE "/pw/[A-Za-z0-9_-]+=w544-h" "$FILE" | sort -u | wc -l
echo "done"
