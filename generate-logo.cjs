// Pure Node.js PNG generator - no external dependencies
// Generates a black rounded square with white "R" letter (ZCode style)

const { createHash } = require('crypto');
const { deflateSync } = require('zlib');

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

function createRoundedRectPath(size, radius) {
  const points = [];
  const cx = size / 2, cy = size / 2;
  const half = size / 2 - radius;
  // Generate a filled rounded rect as a set of scanlines
  const rows = [];
  for (let y = 0; y < size; y++) {
    let xStart = 0, xEnd = size - 1;
    // Top rounded corners
    if (y < radius) {
      const dy = radius - y;
      const dx = Math.sqrt(radius * radius - dy * dy);
      xStart = Math.ceil(cx - half - dx + radius);
      xEnd = Math.floor(cx + half + dx - radius);
    }
    // Bottom rounded corners
    else if (y >= size - radius) {
      const dy = y - (size - radius - 1);
      const dx = Math.sqrt(radius * radius - dy * dy);
      xStart = Math.ceil(cx - half - dx + radius);
      xEnd = Math.floor(cx + half + dx - radius);
    }
    rows.push({ xStart: Math.max(0, xStart), xEnd: Math.min(size - 1, xEnd) });
  }
  return rows;
}

// Draw a bold "R" letter using a bitmap approach
function drawR(canvas, size, color) {
  const cx = size / 2;
  const cy = size / 2;
  // R dimensions relative to canvas
  const rWidth = size * 0.55;
  const rHeight = size * 0.65;
  const startX = cx - rWidth / 2;
  const startY = cy - rHeight / 2 + size * 0.02;
  const strokeW = rWidth * 0.22; // thickness

  // Vertical stem
  for (let y = Math.floor(startY); y < Math.floor(startY + rHeight); y++) {
    for (let x = Math.floor(startX); x < Math.floor(startX + strokeW); x++) {
      if (y >= 0 && y < size && x >= 0 && x < size) canvas[y][x] = color;
    }
  }

  // Top bowl (P shape)
  const bowlTop = Math.floor(startY);
  const bowlBottom = Math.floor(startY + rHeight * 0.52);
  const bowlRight = Math.floor(startX + rWidth);
  const bowlInner = Math.floor(startX + strokeW + strokeW * 0.3);

  for (let y = bowlTop; y < bowlBottom; y++) {
    for (let x = Math.floor(startX + strokeW); x < bowlRight; x++) {
      if (y >= 0 && y < size && x >= 0 && x < size) {
        // Check if inside the bowl (rounded top-right)
        const relX = x - (startX + strokeW);
        const relY = y - bowlTop;
        const bowlW = bowlRight - startX - strokeW;
        const bowlH = bowlBottom - bowlTop;
        const cornerR = bowlH;
        if (relX < cornerR && relY < cornerR) {
          const dist = Math.sqrt((cornerR - 1 - relX) ** 2 + (cornerR - 1 - relY) ** 2);
          if (dist <= cornerR) canvas[y][x] = color;
        } else {
          canvas[y][x] = color;
        }
      }
    }
  }

  // Inner cutout of bowl
  const innerTop = bowlTop + Math.floor(strokeW * 0.7);
  const innerBottom = bowlBottom - Math.floor(strokeW * 0.5);
  const innerRight = bowlRight - Math.floor(strokeW * 0.7);
  for (let y = innerTop; y < innerBottom; y++) {
    for (let x = bowlInner; x < innerRight; x++) {
      if (y >= 0 && y < size && x >= 0 && x < size) {
        const relX = x - bowlInner;
        const relY = y - innerTop;
        const w = innerRight - bowlInner;
        const h = innerBottom - innerTop;
        const cornerR = h;
        if (relX < cornerR && relY < cornerR) {
          const dist = Math.sqrt((cornerR - 1 - relX) ** 2 + (cornerR - 1 - relY) ** 2);
          if (dist <= cornerR) canvas[y][x] = 0;
        } else {
          canvas[y][x] = 0;
        }
      }
    }
  }

  // Diagonal leg of R
  const legStartX = Math.floor(startX + strokeW * 0.5);
  const legStartY = Math.floor(startY + rHeight * 0.5);
  const legEndX = Math.floor(startX + rWidth);
  const legEndY = Math.floor(startY + rHeight);
  const legThickness = strokeW * 0.85;

  const dx = legEndX - legStartX;
  const dy = legEndY - legStartY;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len;
  const ny = dx / len;

  for (let t = 0; t <= len; t++) {
    const px = legStartX + (dx / len) * t;
    const py = legStartY + (dy / len) * t;
    for (let d = -legThickness / 2; d <= legThickness / 2; d++) {
      const x = Math.round(px + nx * d);
      const y = Math.round(py + ny * d);
      if (y >= 0 && y < size && x >= 0 && x < size) canvas[y][x] = color;
    }
  }
}

function generatePNG(size) {
  const canvas = Array.from({ length: size }, () => new Uint8Array(size));
  const bgColor = 1; // white = 1, black bg = 0 in grayscale
  const fgColor = 0; // for R letter

  // Fill background black
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      canvas[y][x] = 0;

  // Draw rounded square (slightly smaller than full size for padding)
  const padding = Math.floor(size * 0.04);
  const innerSize = size - padding * 2;
  const radius = Math.floor(innerSize * 0.22);
  const rows = createRoundedRectPath(innerSize, radius);

  const bgCanvas = Array.from({ length: size }, () => new Uint8Array(size).fill(0));
  for (let y = 0; y < innerSize; y++) {
    const { xStart, xEnd } = rows[y];
    for (let x = xStart; x <= xEnd; x++) {
      const px = x + padding;
      const py = y + padding;
      if (py >= 0 && py < size && px >= 0 && px < size) {
        bgCanvas[py][px] = 1; // white area inside rounded rect
      }
    }
  }

  // Invert: we want black rounded rect on transparent/white background
  // Actually, let's do: black rounded rect, white R
  const finalCanvas = Array.from({ length: size }, () => new Uint8Array(size).fill(255)); // white bg

  // Draw black rounded rect
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (bgCanvas[y][x] === 1) {
        finalCanvas[y][x] = 26; // near-black (#1a1a1a)
      }
    }
  }

  // Draw white R
  const rCanvas = Array.from({ length: size }, () => new Uint8Array(size).fill(0));
  drawR(rCanvas, size, 1);

  // Composite R onto final canvas (only where R is drawn AND inside the rounded rect)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (rCanvas[y][x] === 1 && bgCanvas[y][x] === 1) {
        finalCanvas[y][x] = 255; // white
      }
    }
  }

  // Build PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - raw image data with filter bytes
  const rawData = Buffer.alloc(size * (size + 1));
  for (let y = 0; y < size; y++) {
    rawData[y * (size + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      rawData[y * (size + 1) + 1 + x] = finalCanvas[y][x];
    }
  }

  const compressed = deflateSync(rawData, { level: 9 });

  const chunks = [
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ];

  return Buffer.concat(chunks);
}

const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'remi-app', 'public');

// Generate main logo (512x512)
const logo512 = generatePNG(512);
fs.writeFileSync(path.join(outDir, 'remicode-new-logo.png'), logo512);
console.log('Generated remicode-new-logo.png (512x512)');

// Generate favicon 32x32
const logo32 = generatePNG(32);
fs.writeFileSync(path.join(outDir, 'favicon-32x32.png'), logo32);
console.log('Generated favicon-32x32.png (32x32)');

// Generate favicon 16x16
const logo16 = generatePNG(16);
fs.writeFileSync(path.join(outDir, 'favicon-16x16.png'), logo16);
console.log('Generated favicon-16x16.png (16x16)');

// Generate apple-touch-icon (180x180)
const logo180 = generatePNG(180);
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), logo180);
console.log('Generated apple-touch-icon.png (180x180)');

// Generate favicon.ico (use 32x32 as base)
fs.writeFileSync(path.join(outDir, 'favicon.ico'), logo32);
console.log('Generated favicon.ico');

// Generate tauri icons
const tauriIconsDir = path.join(__dirname, 'remi-app', 'src-tauri', 'icons');

// 128x128
const logo128 = generatePNG(128);
fs.writeFileSync(path.join(tauriIconsDir, '128x128.png'), logo128);
console.log('Generated 128x128.png');

// 128x128@2x (256x256)
const logo256 = generatePNG(256);
fs.writeFileSync(path.join(tauriIconsDir, '128x128@2x.png'), logo256);
console.log('Generated 128x128@2x.png (256x256)');

console.log('\nAll logos generated successfully!');
