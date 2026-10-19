// Usage: node store/imdb-ratings/make-icons.js imdb-ratings/icons
// Draws the extension icon (gold star on a dark rounded square) at several
// sizes and writes PNGs. Pure Node: zlib for deflate/crc, 4x supersampling.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const outDir = process.argv[2];
const SS = 4;
const bg = [0x1c, 0x23, 0x31], star = [0xff, 0xb7, 0x00], ring = [0x2a, 0x33, 0x45];

function insideRoundRect(x, y, s, r) {
  const cx = Math.min(Math.max(x, r), s - r), cy = Math.min(Math.max(y, r), s - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function starPoly(cx, cy, R, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}
function inPoly(x, y, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function render(size) {
  const S = size * SS, poly = starPoly(S / 2, S * 0.53, S * 0.36, S * 0.15);
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const X = x * SS + sx + 0.5, Y = y * SS + sy + 0.5;
      if (!insideRoundRect(X, Y, S, S * 0.22)) continue;
      const c = inPoly(X, Y, poly) ? star : (insideRoundRect(X, Y, S, S * 0.22) && !insideRoundRect(X - S*0.04, Y - S*0.04, S*0.92, S*0.19) ? ring : bg);
      r += c[0]; g += c[1]; b += c[2]; a += 255;
    }
    const n = SS * SS, i = (y * size + x) * 4;
    if (a) { px[i] = r / (a / 255); px[i + 1] = g / (a / 255); px[i + 2] = b / (a / 255); }
    px[i + 3] = a / n;
  }
  return px;
}
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(outDir, `icon${s}.png`), png(s, render(s)));
console.log('icons written');
