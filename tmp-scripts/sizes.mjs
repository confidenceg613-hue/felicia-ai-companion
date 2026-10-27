import { readFileSync } from "node:fs";

function pngSize(buf) {
  // IHDR width/height at bytes 16..24
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function webpSize(buf) {
  const format = buf.toString("ascii", 12, 16);
  if (format === "VP8X") {
    const w = 1 + buf.readUIntLE(24, 3);
    const h = 1 + buf.readUIntLE(27, 3);
    return { w, h };
  }
  if (format === "VP8 ") {
    const w = buf.readUInt16LE(26) & 0x3fff;
    const h = buf.readUInt16LE(28) & 0x3fff;
    return { w, h };
  }
  if (format === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { w: 0, h: 0 };
}

const local = [
  "public/gallery/portrait-soft-light.webp",
  "public/gallery/portrait-natural-light.webp",
];
for (const file of local) {
  try {
    const buf = readFileSync(file);
    console.log(file, webpSize(buf), buf.byteLength, "bytes");
  } catch (error) {
    console.log(file, "unreadable:", String(error).slice(0, 80));
  }
}

const hosted = [
  ["grid copy", "https://i.postimg.cc/TYVChk7j/1113447a-e7a9-41f7-b426-cc81e34f04e1.png"],
  [
    "original",
    "https://i.postimg.cc/nZ55RgqW/1113447a-e7a9-41f7-b426-cc81e34f04e1.png?dl=1",
  ],
  ["soft light grid", "https://i.postimg.cc/PLACEHOLDER"],
];
for (const [label, url] of hosted.slice(0, 2)) {
  try {
    const r = await fetch(url);
    const buf = Buffer.from(await r.arrayBuffer());
    console.log(label, r.status, pngSize(buf), buf.byteLength, "bytes");
  } catch (error) {
    console.log(label, "failed", String(error).slice(0, 100));
  }
}
