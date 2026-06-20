// Pure Node.js PNG generator - RGBA mode for explicit color control
// Black rounded square with white "R" letter (ZCode style)
const { deflateSync } = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function generatePNG(size) {
  // RGBA canvas: 4 bytes per pixel [R, G, B, A]
  const canvas = new Uint8Array(size * size * 4);
  const setPixel = (x, y, r, g, b, a) => {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      const i = (y * size + x) * 4;
      canvas[i] = r; canvas[i+1] = g; canvas[i+2] = b; canvas[i+3] = a;
    }
  };

  // Rounded rect parameters
  const pad = Math.round(size * 0.06);
  const rw = size - pad * 2;
  const rh = size - pad * 2;
  const cornerR = Math.round(rw * 0.20);

  const inRoundedRect = (x, y) => {
    const lx = x - pad, ly = y - pad;
    if (lx < 0 || lx >= rw || ly < 0 || ly >= rh) return false;
    if (lx < cornerR && ly < cornerR) return (lx - cornerR) ** 2 + (ly - cornerR) ** 2 <= cornerR ** 2;
    if (lx >= rw - cornerR && ly < cornerR) return (lx - (rw - cornerR)) ** 2 + (ly - cornerR) ** 2 <= cornerR ** 2;
    if (lx < cornerR && ly >= rh - cornerR) return (lx - cornerR) ** 2 + (ly - (rh - cornerR)) ** 2 <= cornerR ** 2;
    if (lx >= rw - cornerR && ly >= rh - cornerR) return (lx - (rw - cornerR)) ** 2 + (ly - (rh - cornerR)) ** 2 <= cornerR ** 2;
    return true;
  };

  // Fill: outside = transparent, inside = BLACK background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRoundedRect(x, y)) {
        setPixel(x, y, 0, 0, 0, 255); // BLACK inside
      } else {
        setPixel(x, y, 255, 255, 255, 0); // transparent outside
      }
    }
  }

  // R letter dimensions
  const m = Math.round(size * 0.14);
  const rL = m, rR = size - m;
  const rT = Math.round(size * 0.15);
  const rB = size - Math.round(size * 0.12);
  const stemW = Math.round((rR - rL) * 0.22);
  const bowlH = Math.round((rB - rT) * 0.48);

  const inRect = (x, y) => inRoundedRect(x, y);

  // 1. Vertical stem - WHITE
  for (let y = rT; y < rB; y++)
    for (let x = rL; x < rL + stemW; x++)
      if (inRect(x, y)) setPixel(x, y, 255, 255, 255, 255);

  // 2. Bowl (top arch) - WHITE
  const bR = rR;
  const bBot = rT + bowlH;
  const bIL = rL + stemW;
  const bIR = bR - Math.round(stemW * 0.75);
  const bIT = rT + Math.round(stemW * 0.65);
  const bIB = bBot - Math.round(stemW * 0.55);
  const bCornerR = Math.round((bBot - rT) * 0.42);

  for (let y = rT; y < bBot; y++) {
    for (let x = bIL; x < bR; x++) {
      if (!inRect(x, y)) continue;
      const ccx = bR - bCornerR, ccy = rT + bCornerR;
      if (x > ccx && y < ccy) {
        if ((x - ccx) ** 2 + (y - ccy) ** 2 <= bCornerR ** 2) setPixel(x, y, 255, 255, 255, 255);
      } else {
        setPixel(x, y, 255, 255, 255, 255);
      }
    }
  }

  // Cut out bowl inner - restore to BLACK
  for (let y = bIT; y < bIB; y++) {
    for (let x = bIL + Math.round(stemW * 0.45); x < bIR; x++) {
      if (!inRect(x, y)) continue;
      const icr = Math.round((bIB - bIT) * 0.5);
      const icx = bIR - icr, icy = bIT + icr;
      if (x > icx && y < icy) {
        if ((x - icx) ** 2 + (y - icy) ** 2 <= icr ** 2) setPixel(x, y, 0, 0, 0, 255);
      } else {
        setPixel(x, y, 0, 0, 0, 255);
      }
    }
  }

  // 3. Diagonal leg - WHITE
  const lSX = rL + Math.round(stemW * 0.25);
  const lSY = bBot - Math.round(stemW * 0.25);
  const lEX = rR - Math.round(stemW * 0.15);
  const lEY = rB;
  const lW = Math.round(stemW * 0.8);
  const ldx = lEX - lSX, ldy = lEY - lSY;
  const lLen = Math.sqrt(ldx * ldx + ldy * ldy);
  const lnx = -ldy / lLen, lny = ldx / lLen;

  for (let t = 0; t <= lLen; t += 0.5) {
    const px = lSX + (ldx / lLen) * t;
    const py = lSY + (ldy / lLen) * t;
    for (let d = -lW / 2; d <= lW / 2; d += 0.5) {
      const x = Math.round(px + lnx * d);
      const y = Math.round(py + lny * d);
      if (inRect(x, y)) setPixel(x, y, 255, 255, 255, 255);
    }
  }

  // Build PNG with RGBA color type (6)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw data: filter byte + RGBA pixels per row
  const bytesPerRow = size * 4 + 1;
  const rawData = Buffer.alloc(size * bytesPerRow);
  for (let y = 0; y < size; y++) {
    rawData[y * bytesPerRow] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const srcI = (y * size + x) * 4;
      const dstI = y * bytesPerRow + 1 + x * 4;
      rawData[dstI] = canvas[srcI];
      rawData[dstI+1] = canvas[srcI+1];
      rawData[dstI+2] = canvas[srcI+2];
      rawData[dstI+3] = canvas[srcI+3];
    }
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rawData, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, 'remi-app', 'public');
const tauriIconsDir = path.join(__dirname, 'remi-app', 'src-tauri', 'icons');

const sizes = [
  { file: path.join(outDir, 'remicode-new-logo.png'), size: 512 },
  { file: path.join(outDir, 'favicon-32x32.png'), size: 32 },
  { file: path.join(outDir, 'favicon-16x16.png'), size: 16 },
  { file: path.join(outDir, 'apple-touch-icon.png'), size: 180 },
  { file: path.join(outDir, 'favicon.ico'), size: 32 },
  { file: path.join(tauriIconsDir, '128x128.png'), size: 128 },
  { file: path.join(tauriIconsDir, '128x128@2x.png'), size: 256 },
];

for (const { file, size } of sizes) {
  fs.writeFileSync(file, generatePNG(size));
  console.log(`Generated ${path.basename(file)} (${size}x${size})`);
}
console.log('\nAll logos generated!');
