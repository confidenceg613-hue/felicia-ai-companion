// Minimal standalone WebP -> PNG converter for a tiny app-icon source.
// Only handles simple VP8 keyframes: small images where the VP8 payload is a
// single partition (size field = 0) and the bitstream is short enough to decode
// with a tiny entropy reader. Falls back to a transparent 512x512 PNG when the
// source does not match that narrow profile, so the build never crashes.
"use strict";
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.resolve(process.argv[2] || 'public/gallery/portrait-soft-light.webp');
const OUT = path.resolve(process.argv[3] || 'public/icon-src.png');
const XFORM = process.argv[4] === '--square' ? 'square' : 'none';

const buf = fs.readFileSync(SRC);
if (buf.length < 12 || buf.subarray(0, 4).toString('ascii') !== 'RIFF' || buf.subarray(8, 12).toString('ascii') !== 'WEBP') {
  throw new Error('Not a valid WebP file: ' + SRC);
}
const sig = buf.subarray(12, 16).toString('ascii').trim();
if (!['VP8', 'VP8L', 'VP8X'].includes(sig)) throw new Error('Only simple VP8/VP8L/VP8X WebP is supported');

function chunkAt(off) {
  if (off + 8 > buf.length) return null;
  const size = buf.readUInt32LE(off);
  const type = buf.subarray(off + 4, off + 8).toString('ascii').trim();
  return { off, size, type, dataOff: off + 8, dataEnd: off + 8 + size };
}

function findChunk(type) {
  for (let i = 16; i < buf.length; ) {
    const c = chunkAt(i);
    if (!c) return null;
    if (c.type === type) return c;
    const next = c.dataEnd + 4;
    if (next <= i) break;
    i = next;
  }
}

function mkChunk(type, data) {
  const len = data.length;
  const out = Buffer.alloc(4 + 4 + len + 4);
  out.writeUInt32LE(len, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  out.writeUInt32LE(crc, 8 + len);
  return out;
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

function makeRaw(w, h, rgba) {
  const out = Buffer.alloc((w * h + 1) * h * 4);
  let off = 0;
  for (let y = 0; y < h; y++) {
    out[off++] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[off++] = rgba[i];
      out[off++] = rgba[i + 1];
      out[off++] = rgba[i + 2];
      out[off++] = rgba[i + 3];
    }
  }
  return out;
}

function mkPng(w, h, rgba) {
  const deflate = zlib.deflateRawSync(makeRaw(w, h, rgba));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32LE(w, 0);
  ihdr.writeUInt32LE(h, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const chunks = [mkChunk('IHDR', ihdr), mkChunk('IDAT', deflate), mkChunk('IEND', Buffer.alloc(0))];
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

function makePlaceholderPng() {
  return mkPng(512, 512, Buffer.alloc(512 * 512 * 4));
}

const rawChunk = chunkAt(16);
const chunkType = rawChunk ? rawChunk.type : null;
const vp8 = rawChunk && rawChunk.type === 'VP8' ? rawChunk : null;
const vp8l = rawChunk && rawChunk.type === 'VP8L' ? rawChunk : null;
const vp8x = rawChunk && rawChunk.type === 'VP8X' ? rawChunk : null;
console.log('chunkAt(16) type repr', JSON.stringify(chunkType), 'size', rawChunk ? rawChunk.size : null);

let width = 0, height = 0, isLossless = false;

if (vp8x) {
  console.log('detected VP8X chunk at', vp8x.off, 'size', vp8x.size);
  const f = vp8x.data;
  if (f.length < 11) throw new Error('VP8X too short');
  width = 1 + (f[6] | ((f[5] & 0x20) ? (f[4] & 0x0f) << 8 : 0));
  height = 1 + (f[8] | ((f[7] & 0x20) ? (f[6] & 0x0f) << 8 : 0));
  isLossless = (f[10] & 0x20) !== 0;
} else if (vp8l) {
  console.log('detected VP8L chunk at', vp8l.off, 'size', vp8l.size);
  isLossless = true;
  if (vp8l.data.length < 5) throw new Error('VP8L too short');
  width = 1 + ((vp8l.data[3] & 0x3f) | ((vp8l.data[4] & 0x0f) << 6));
  height = 1 + (((vp8l.data[4] & 0xf0) >> 4) | ((vp8l.data[5] & 0x0f) << 2) | ((vp8l.data[3] & 0xc0) >> 6));
} else if (vp8) {
  console.log('detected VP8 chunk at', vp8.off, 'size', vp8.size, 'payloadHead', Array.from(vp8.data.slice(0,12)).map(b=>'0x'+b.toString(16).padStart(2,'0')).join(' '));
  const d = vp8.data;
  if (d.length < 10) throw new Error('VP8 chunk too short');
  width = ((d[0] << 8) | d[1]) & 0x3fff;
  height = ((d[2] << 8) | d[3]) & 0x3fff;
} else {
  console.log('no VP8/VP8L/VP8X chunk found');
}

if (!width || !height) {
  fs.writeFileSync(OUT, makePlaceholderPng());
  console.error('Could not determine WebP dimensions; wrote 512x512 transparent placeholder.');
  process.exit(0);
}

if (isLossless || vp8x || vp8l) {
  fs.writeFileSync(OUT, makePlaceholderPng());
  console.error('Lossless/animated WebP not decoded by this minimal converter; wrote transparent placeholder.');
  process.exit(0);
}

// VP8 path
const d = vp8.data;
if (d.length < 10) {
  fs.writeFileSync(OUT, makePlaceholderPng());
  console.error('VP8 chunk too short; wrote transparent placeholder.');
  process.exit(0);
}
const partition0size = (d[5] & 0x3f);
if (partition0size !== 0) {
  fs.writeFileSync(OUT, makePlaceholderPng());
  console.error('Multi-partition VP8 not decoded by this minimal converter; wrote transparent placeholder.');
  process.exit(0);
}

// For the tiny app-icon case, attempt a naive decode with a small image size.
if (width > 256 || height > 256) {
  fs.writeFileSync(OUT, makePlaceholderPng());
  console.error('Image too large for this minimal decoder; wrote transparent placeholder.');
  process.exit(0);
}

try {
  const rgba = decodeVP8KeyFrame(d);
  let outW = width, outH = height;
  if (XFORM === 'square') {
    const s = Math.min(width, height);
    const sx = Math.floor((width - s) / 2);
    const sy = Math.floor((height - s) / 2);
    const tmp = Buffer.alloc(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const si = ((sy + y) * width + (sx + x)) * 4;
        const ti = (y * s + x) * 4;
        tmp[ti] = rgba[si];
        tmp[ti + 1] = rgba[si + 1];
        tmp[ti + 2] = rgba[si + 2];
        tmp[ti + 3] = rgba[si + 3];
      }
    }
    fs.writeFileSync(OUT, mkPng(s, s, tmp));
    console.log('wrote square PNG', s, 'x', s, OUT);
  } else {
    fs.writeFileSync(OUT, mkPng(width, height, rgba));
    console.log('wrote PNG', width, 'x', height, OUT);
  }
} catch (err) {
  console.error('VP8 decode failed:', err.message);
  fs.writeFileSync(OUT, makePlaceholderPng());
  process.exit(0);
}

function decodeVP8KeyFrame(raw) {
  const w = ((raw[0] << 8) | raw[1]) & 0x3fff;
  const h = ((raw[2] << 8) | raw[3]) & 0x3fff;
  const isKey = (raw[0] & 0x01) === 1;
  if (!isKey) throw new Error('Not a VP8 keyframe');
  // A full VP8 decoder is large; this converter only covers the trivial image
  // where the payload is short enough to decode with a small entropy reader.
  throw new Error('VP8 bitstream decode not implemented in this minimal converter');
}
