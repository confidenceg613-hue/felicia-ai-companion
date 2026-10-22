#!/bin/bash
set -euo pipefail
FILE=/tmp/album.html
echo "=== file size ==="
wc -c "$FILE"
echo "=== title ==="
grep -oE '<title>[^<]*</title>' "$FILE" | head
echo "=== og tags ==="
grep -oE '<meta[^>]*(og:title|og:image|og:description|og:type|og:url)[^>]*>' "$FILE" | sed 's/\\u003d/=/g; s/\\u0026/\&/g' | head
echo "=== og:image url (clean) ==="
grep -oE 'https://lh3\.googleusercontent\.com[^"<> ]*\.jpg' "$FILE" | sort -u
grep -oE 'https://lh3\.googleusercontent\.com[^"<> ]*=w544-h[0-9]+' "$FILE" | sort -u
echo "=== any mp4 / video urls ==="
grep -oE "https?://[^"<> ]*\.mp4[^"<> ]*" "$FILE" | sort -u | head
grep -oiE "(video|mp4|mov|film)" "$FILE" | sort | uniq -c | head
echo "=== all sized lh3 image urls (w<width>-h<height>) ==="
grep -oE "https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]+=w[0-9]+-h[0-9]+-[a-z0-9-]*" "$FILE" | sort -u
echo "=== count of distinct sized image urls ==="
grep -oE "https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]+=w[0-9]+-h[0-9]+" "$FILE" | sort -u | wc -l
echo "=== distinct AP1Gcz media ids ==="
grep -oE "AP1Gcz[A-Za-z0-9_-]{20,}" "$FILE" | sort -u | wc -l
echo "=== any productURL / baseUrl in json ==="
grep -oE '"(productUrl|baseUrl|photoUrl|imageUrl|mediaUrl|contentUrl|thumbUrl)"[^:]*:[^,}\"]+' "$FILE" | sort -u | head -20
echo "=== any 'photo' page links ==="
grep -oE "https://photos\.google\.com/[^\"<> ]*photo[A-Za-z0-9_/-]*" "$FILE" | sort -u | head
echo "=== 'New video' occurrences ==="
grep -oE "New video[^,}\"]*" "$FILE" | sort -u | head
echo "=== html around og:image (context) ==="
grep -oE ".{60}og:image.{120}" "$FILE" | head -2
echo "done"
