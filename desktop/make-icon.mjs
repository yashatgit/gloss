// Generate desktop/build/icon.png (1024²) from scratch — a Liquid Glass tile
// with a white "branch" motif (one root node → two children). No image deps:
// signed-distance fields for anti-aliasing, manual PNG encoding via zlib.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const S = 1024;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
// distance to a rounded box centered in the canvas
function sdRoundRect(px, py, halfW, halfH, r) {
  const qx = Math.abs(px - S / 2) - (halfW - r);
  const qy = Math.abs(py - S / 2) - (halfH - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdSegment(px, py, ax, ay, bx, by, th) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy));
  return dist(px, py, ax + t * vx, ay + t * vy) - th;
}

// brand gradient stops
const c1 = [10, 108, 255]; // #0a6cff
const c2 = [124, 92, 255]; // #7c5cff

// branch nodes
const root = [388, 512, 78];
const childA = [684, 360, 54];
const childB = [684, 664, 54];

const buf = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;

    // tile shape + diagonal gradient with a top-left specular lift
    const tile = sdRoundRect(x, y, 462, 462, 228);
    const g = clamp01((x + y) / (2 * S));
    let r = lerp(c1[0], c2[0], g);
    let gg = lerp(c1[1], c2[1], g);
    let b = lerp(c1[2], c2[2], g);
    const spec = smooth(620, 0, dist(x, y, 300, 250)) * 0.5;
    r = lerp(r, 255, spec);
    gg = lerp(gg, 255, spec);
    b = lerp(b, 255, spec);

    // white branch glyph (union of disks + connectors)
    const dGlyph = Math.min(
      dist(x, y, root[0], root[1]) - root[2],
      dist(x, y, childA[0], childA[1]) - childA[2],
      dist(x, y, childB[0], childB[1]) - childB[2],
      sdSegment(x, y, root[0], root[1], childA[0], childA[1], 22),
      sdSegment(x, y, root[0], root[1], childB[0], childB[1], 22),
    );
    const glyph = smooth(1.5, -1.5, dGlyph); // 1 inside glyph
    r = lerp(r, 255, glyph);
    gg = lerp(gg, 255, glyph);
    b = lerp(b, 255, glyph);

    const alpha = smooth(1.5, -1.5, tile); // anti-aliased tile edge
    buf[i] = Math.round(r);
    buf[i + 1] = Math.round(gg);
    buf[i + 2] = Math.round(b);
    buf[i + 3] = Math.round(alpha * 255);
  }
}

// ---- PNG encode (8-bit RGBA) ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
// raw = filter byte (0) + row
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.mkdirSync(path.join(here, 'build'), { recursive: true });
fs.writeFileSync(path.join(here, 'build', 'icon.png'), png);
console.log('✓ wrote desktop/build/icon.png', `(${(png.length / 1024).toFixed(0)} KB)`);
