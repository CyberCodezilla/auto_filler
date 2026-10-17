const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, drawFn) {
  // RGBA buffer
  const buffer = Buffer.alloc(width * height * 4);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = a;
    }
  }

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  let scanIdx = 0;
  for (let y = 0; y < height; y++) {
    scanlines[scanIdx++] = 0; // Filter None
    const rowStart = y * width * 4;
    buffer.copy(scanlines, scanIdx, rowStart, rowStart + width * 4);
    scanIdx += width * 4;
  }

  const deflated = zlib.deflateSync(scanlines);

  // PNG header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    
    // Calculate CRC32
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // CRC32 table
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return c ^ 0xffffffff;
  }

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function iconDrawer(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;

  // Background: dark zinc rounded rectangle
  const cx = 0.5, cy = 0.5;
  const radius = 0.18;
  const dx = Math.max(0, Math.abs(nx - cx) - (0.5 - radius));
  const dy = Math.max(0, Math.abs(ny - cy) - (0.5 - radius));
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > radius) {
    return [0, 0, 0, 0]; // Transparent outside
  }

  // Emerald theme inside
  // Base dark: #09090b
  let r = 16;
  let g = 20;
  let b = 24;
  let a = 255;

  // Border: #27272a
  if (dist > radius - 0.05) {
    r = 39; g = 39; b = 42;
  }

  // Draw an F / Bolt symbol in Emerald (#10b981)
  // Lightning bolt / checkmark coords:
  // Segment 1: (0.28, 0.52) to (0.42, 0.70)
  // Segment 2: (0.42, 0.70) to (0.75, 0.28)
  const isLine = (x0, y0, x1, y1, thickness) => {
    const l2 = (x1 - x0) ** 2 + (y1 - y0) ** 2;
    if (l2 === 0) return false;
    let t = ((nx - x0) * (x1 - x0) + (ny - y0) * (y1 - y0)) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = x0 + t * (x1 - x0);
    const py = y0 + t * (y1 - y0);
    const d = Math.sqrt((nx - px) ** 2 + (ny - py) ** 2);
    return d <= thickness;
  };

  const thick = w <= 16 ? 0.11 : 0.07;
  if (isLine(0.24, 0.50, 0.42, 0.70, thick) || isLine(0.42, 0.70, 0.76, 0.28, thick)) {
    // Emerald: 16, 185, 129
    r = 16;
    g = 185;
    b = 129;
  }

  return [r, g, b, a];
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 32, 48, 128].forEach(size => {
  const png = createPng(size, size, iconDrawer);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`Generated icon${size}.png (${size}x${size})`);
});
