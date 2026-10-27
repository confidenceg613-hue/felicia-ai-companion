"use strict";
const fs = require('fs');
const buf = fs.readFileSync('public/gallery/portrait-soft-light.webp');
console.log('sig', buf.slice(12,16).toString('ascii'), buf.slice(12,16).toString('hex'));
let off = 16;
while (off + 8 <= buf.length) {
  const size = buf.readUInt32LE(off);
  const type = buf.subarray(off + 4, off + 8).toString('ascii');
  console.log('chunk', off, 'size', size, 'type', type, 'typeBytes', Array.from(buf.slice(off+4, off+8)).map(b=>b));
  off = off + 8 + size + 4;
  if (size === 0) break;
}
console.log('remaining', buf.length - 16);
