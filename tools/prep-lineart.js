#!/usr/bin/env node
// Prepare a line-art PNG for the colouring canvas.
//
//   node tools/prep-lineart.js input.png [output.png] [--close 3] [--no-border] [--report-only]
//
// Bucket fill leaks wherever the drawing has hairline gaps, so this closes them before the asset
// ships: binarise the ink, morphologically close it (dilate then erode, which bridges gaps without
// fattening the lines), optionally frame the canvas so the background is a region and not a void,
// then report how large each region would be. Regions above REPORT_LIMIT are the ones that will
// feel like "it painted everything".
//
// Pure Node: no image libraries, so it runs anywhere the app builds.

const fs = require('fs');
const zlib = require('zlib');

const INK_THRESHOLD = 235; // anything not near-white counts as a printed line
const REPORT_LIMIT = 0.15; // a region over 15% of the canvas is flagged as leak-prone

function decodePng(file) {
  const data = fs.readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat = [];
  while (pos < data.length) {
    const len = data.readUInt32BE(pos);
    const type = data.toString('ascii', pos + 4, pos + 8);
    const body = data.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
    } else if (type === 'IDAT') {
      idat.push(body);
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`only 8-bit PNGs are supported (got ${bitDepth})`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType} — re-export as RGB`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[p];
    p += 1;
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const guess = a + b - c;
        const da = Math.abs(guess - a);
        const db = Math.abs(guess - b);
        const dc = Math.abs(guess - c);
        const pick = da <= db && da <= dc ? a : db <= dc ? b : c;
        line[i] = (line[i] + pick) & 255;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { width, height, channels, pixels: out };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

function encodePng(width, height, gray) {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // no per-row filter: written once, size is not the point
    for (let x = 0; x < width; x += 1) {
      const v = gray[y * width + x];
      const o = y * (stride + 1) + 1 + x * 3;
      raw[o] = v;
      raw[o + 1] = v;
      raw[o + 2] = v;
    }
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed) >>> 0);
    return Buffer.concat([len, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- morphology on a 0/1 mask ------------------------------------------------

function dilate(mask, w, h, radius) {
  let src = mask;
  for (let step = 0; step < radius; step += 1) {
    const next = Uint8Array.from(src);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (!src[i]) continue;
        if (x > 0) next[i - 1] = 1;
        if (x < w - 1) next[i + 1] = 1;
        if (y > 0) next[i - w] = 1;
        if (y < h - 1) next[i + w] = 1;
      }
    }
    src = next;
  }
  return src;
}

function erode(mask, w, h, radius) {
  let src = mask;
  for (let step = 0; step < radius; step += 1) {
    const next = Uint8Array.from(src);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (!src[i]) continue;
        const left = x > 0 ? src[i - 1] : 0;
        const right = x < w - 1 ? src[i + 1] : 0;
        const up = y > 0 ? src[i - w] : 0;
        const down = y < h - 1 ? src[i + w] : 0;
        if (!(left && right && up && down)) next[i] = 0;
      }
    }
    src = next;
  }
  return src;
}

// --- region report -----------------------------------------------------------

function regionSizes(wall, w, h) {
  const seen = new Uint8Array(w * h);
  const sizes = [];
  for (let start = 0; start < w * h; start += 1) {
    if (wall[start] || seen[start]) continue;
    let size = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      size += 1;
      const x = i % w;
      const neighbours = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (let n = 0; n < 4; n += 1) {
        const j = neighbours[n];
        if (j < 0 || j >= w * h || seen[j] || wall[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}

// --- main --------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--') && a.endsWith('.png'));
  const input = files[0];
  const output = files[1] || (input ? input.replace(/\.png$/i, '.closed.png') : null);
  if (!input) {
    console.error('usage: node tools/prep-lineart.js input.png [output.png] [--close 3] [--no-border] [--report-only]');
    process.exit(1);
  }
  const closeArg = args.indexOf('--close');
  const radius = closeArg >= 0 ? Number(args[closeArg + 1]) : 3;
  const border = !args.includes('--no-border');
  const reportOnly = args.includes('--report-only');

  const { width: w, height: h, channels, pixels } = decodePng(input);
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * channels;
    gray[i] = channels >= 3
      ? Math.round(pixels[o] * 0.299 + pixels[o + 1] * 0.587 + pixels[o + 2] * 0.114)
      : pixels[o];
  }

  const ink = new Uint8Array(w * h);
  let inkCount = 0;
  for (let i = 0; i < w * h; i += 1) {
    if (gray[i] < INK_THRESHOLD) {
      ink[i] = 1;
      inkCount += 1;
    }
  }

  const before = regionSizes(ink, w, h);
  // Closing = dilate then erode: gaps up to 2*radius are bridged, line weight is preserved.
  const closed = erode(dilate(ink, w, h, radius), w, h, radius);
  for (let i = 0; i < w * h; i += 1) if (ink[i]) closed[i] = 1; // never lose original detail
  if (border) {
    for (let x = 0; x < w; x += 1) {
      closed[x] = 1;
      closed[(h - 1) * w + x] = 1;
    }
    for (let y = 0; y < h; y += 1) {
      closed[y * w] = 1;
      closed[y * w + w - 1] = 1;
    }
  }
  const after = regionSizes(closed, w, h);

  const pct = (n) => `${((100 * n) / (w * h)).toFixed(1)}%`;
  const leaky = (list) => list.filter((n) => n / (w * h) > REPORT_LIMIT).length;
  console.log(`${input} — ${w}x${h}, ink ${pct(inkCount)}`);
  console.log(`  before: ${before.length} regions, biggest ${before.slice(0, 3).map(pct).join(' / ')}, over ${REPORT_LIMIT * 100}%: ${leaky(before)}`);
  console.log(`  after : ${after.length} regions, biggest ${after.slice(0, 3).map(pct).join(' / ')}, over ${REPORT_LIMIT * 100}%: ${leaky(after)}   (close=${radius}${border ? ', border' : ''})`);
  if (leaky(after)) {
    console.log(`  ⚠︎ ${leaky(after)} region(s) still cover more than ${REPORT_LIMIT * 100}% — those will read as "it filled everything".`);
  }

  if (reportOnly) return;
  // Keep the original grey where ink already was, so anti-aliasing survives; pixels the closing
  // added are drawn flat black because they are new line, not scanned detail.
  const out = new Uint8Array(w * h).fill(255);
  for (let i = 0; i < w * h; i += 1) {
    if (ink[i]) out[i] = gray[i];
    else if (closed[i]) out[i] = 0;
  }
  fs.writeFileSync(output, encodePng(w, h, out));
  console.log(`  wrote ${output}`);
}

main();
