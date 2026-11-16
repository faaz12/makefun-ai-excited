// makefun-ai-excited — ai-excited-01 entry.
// Copies the pre-rendered image (assets/entry.png) to the output
// directory as entry.png. Deterministic: byte-for-byte copy, no
// network, no randomness, no timestamps in the output.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = join(import.meta.dirname, "assets", "entry.png");
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const TARGET = join(OUTPUT_DIR, "entry.png");

// The asset is a JPEG in a .png name on purpose: the competition
// tells PNG and JPEG apart by their first bytes, and the name stays
// entry.png either way. Refuse anything that is neither, and enforce
// the competition's own limits (<= 1 MiB, <= 1024x1024) here, so a
// bad asset fails loudly instead of shipping an invalid entry.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const MAX_BYTES = 1048576;
const MAX_DIMENSION = 1024;

function isImage(bytes: Buffer): boolean {
  return bytes.subarray(0, 4).equals(PNG_MAGIC) || bytes.subarray(0, 3).equals(JPEG_MAGIC);
}

// Read width/height straight from the image header: PNG's IHDR chunk
// (bytes 16..24) or a JPEG Start-Of-Frame marker (SOF0/SOF2).
function dimensions(bytes: Buffer): [number, number] {
  if (bytes.subarray(0, 4).equals(PNG_MAGIC)) {
    if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR") {
      throw new Error("PNG is missing a valid IHDR chunk");
    }
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  // JPEG: walk segments until a Start-Of-Frame marker (0xC0-0xCF
  // except 0xC4, 0xC8, 0xCC) gives height then width.
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      throw new Error(`JPEG segment at offset ${offset} is malformed`);
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
    }
    offset += 2 + length;
  }
  throw new Error("JPEG has no Start-Of-Frame marker");
}

const bytes = readFileSync(SOURCE);
if (bytes.length === 0 || bytes.length > MAX_BYTES) {
  throw new Error(`assets/entry.png is ${bytes.length} bytes; must be 1..${MAX_BYTES}`);
}
if (!isImage(bytes)) {
  throw new Error("assets/entry.png is neither PNG nor JPEG");
}
const [width, height] = dimensions(bytes);
if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
  throw new Error(`assets/entry.png is ${width}x${height}; must be at most ${MAX_DIMENSION}x${MAX_DIMENSION}`);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
copyFileSync(SOURCE, TARGET);

const written = readFileSync(TARGET);
if (!written.equals(bytes)) {
  throw new Error("output differs from source; copy failed");
}
console.log(`wrote ${TARGET} (${written.length} bytes, ${width}x${height})`);
