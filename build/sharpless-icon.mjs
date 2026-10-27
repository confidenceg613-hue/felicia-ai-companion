import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.argv[2] ?? 'public/gallery/portrait-soft-light.webp');
const OUT512 = path.resolve(process.argv[3] ?? 'public/icon-512.png');
const OUT192 = path.resolve(process.argv[4] ?? 'public/icon-192.png');
const INTERMEDIATE_PNG = 'public/icon-src.png';

const SRC_BUF = fs.readFileSync(SRC);
console.log('src size', SRC_BUF.length);

function pngChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  let crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function crc32(buf) {
  let c = 0xffffffff;
  const table = crc32._table ??= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let v = n;
      for (let k = 0; k < 8; k++) v = (v & 1) ? (0xedb88320 ^ (v >>> 1)) : (v >>> 1);
      t[n] = v;
    }
    return t;
  })();
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function toPng(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const raw = Buffer.alloc((w * h + 4) * h);
  let off = 0;
  for (let y = 0; y < h; y++) {
    raw[off++] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw[off++] = rgba[i];
      raw[off++] = rgba[i + 1];
      raw[off++] = rgba[i + 2];
      raw[off++] = rgba[i + 3];
    }
  }
  const zlib = require('zlib');
  const idat = zlib.createDeflateRawSync(raw);
  const chunks = [
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat([sig, ...chunks]);
}

// If a PNG intermediate already exists (from a previous jimp-based step), reuse it.
let srcImg;
if (fs.existsSync(INTERMEDIATE_PNG)) {
  srcImg = await require('jimp').Jimp.read(fs.readFileSync(INTERMEDIATE_PNG));
  console.log('used intermediate png', INTERMEDIATE_PNG);
} else {
  // Attempt jimp on the webp source. If jimp has no decoder for webp, this fails
  // and the caller should produce the intermediate png by another means first.
  try {
    srcImg = await require('jimp').Jimp.read(SRC_BUF);
    console.log('decoded webp directly');
  } catch (err) {
    console.log('webp decode failed:', err?.message);
    console.log('create an intermediate png first, e.g.:');
    console.log('  jimp read webp -> write png to', INTERMEDIATE_PNG);
    process.exit(2);
  }
}

console.log('decoded intermediate', srcImg.width, srcImg.height);

const max = 512;
const scale = Math.max(max / srcImg.width, max / srcImg.height, 1);
srcImg.scale({ w: Math.round(srcImg.width * scale), h: Math.round(srcImg.height * scale) });
srcImg.crop({
  x: Math.round((srcImg.width - max) / 2),
  y: Math.round((srcImg.height - max) / 2),
  w: max,
  h: max,
});

function rgbaFromJimp(jimp) {
  const w = jimp.width, h = jimp.height;
  const data = jimp.bitmap.data;
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    buf[j] = data[j];
    buf[j + 1] = data[j + 1];
    buf[j + 2] = data[j + 2];
    buf[j + 3] = 255;
  }
  return buf;
}

const srcRgba = rgbaFromJimp(srcImg);

const out = Buffer.alloc(max * max * 4);
const bgR = 26, bgG = 22, bgB = 37;
for (let i = 0; i < max * max; i++) {
  const o = i * 4;
  out[o] = bgR;
  out[o + 1] = bgG;
  out[o + 2] = bgB;
  out[o + 3] = 255;
}
for (let y = 0; y < max; y++) {
  for (let x = 0; x < max; x++) {
    const si = (y * max + x) * 4;
    out[si] = srcRgba[si];
    out[si + 1] = srcRgba[si + 1];
    out[si + 2] = srcRgba[si + 2];
    out[si + 3] = 255;
  }
}

for (let y = 0; y < max; y++) {
  for (let x = 0; x < max; x++) {
    const o = (y * max + x) * 4;
    const dx = (x - max / 2) / (max / 2);
    const dy = (y - max / 2) / (max / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.7) {
      const rim = Math.max(0.25, 0.9 - d * 0.5);
      out[o] = Math.min(255, out[o] + Math.round(18 * rim));
      out[o + 1] = Math.min(255, out[o + 1] + Math.round(6 * rim));
      out[o + 2] = Math.min(255, out[o + 2] + Math.round(22 * rim));
    }
  }
}

for (let y = 0; y < max; y++) {
  for (let x = 0; x < max; x++) {
    if (x < 10 || x > max - 11 || y < 10 || y > max - 11) {
      const o = (y * max + x) * 4;
      const dx = (x - max / 2) / (max / 2);
      const dy = (y - max / 2) / (max / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const rim = Math.max(0.4, 1 - d);
      out[o] = Math.min(255, out[o] + Math.round(40 * rim));
      out[o + 1] = Math.min(255, out[o + 1] + Math.round(20 * rim));
      out[o + 2] = Math.min(255, out[o + 2] + Math.round(70 * rim));
    }
  }
}

const png = toPng(out, max, max);
fs.writeFileSync(OUT512, png);
console.log('wrote', OUT512, png.length, 'bytes');

const thumb = Buffer.alloc(192 * 192 * 4);
for (let y = 0; y < 192; y++) {
  for (let x = 0; x < 192; x++) {
    const sx = Math.round((x / 192) * max);
    const sy = Math.round((y / 192) * max);
    const si = (sy * max + sx) * 4;
    const ti = (y * 192 + x) * 4;
    thumb[ti] = out[si];
    thumb[ti + 1] = out[si + 1];
    thumb[ti + 2] = out[si + 2];
    thumb[ti + 3] = out[si + 3];
  }
}
fs.writeFileSync(OUT192, toPng(thumb, 192, 192));
console.log('wrote', OUT192);
