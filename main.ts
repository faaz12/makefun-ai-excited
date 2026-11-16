// makefun-ai-excited — entry for make.fun bounty ai-excited-01.
//
// The picture this program ships: a gigantic teal octopus exploding out
// of a tiny blue-patterned porcelain teacup. The cup shatters at the
// bottom of the frame, tea spraying in a brown-gold arc, while the
// octopus fills the whole scene with curling, sucker-lined arms and one
// huge golden eye staring straight at the viewer. The joke is the
// impossible scale — a sea monster that could never fit in a teacup,
// caught at the exact instant it refuses to.
//
// What this file does: it takes the finished image sitting next to it
// (entry.png) and drops an exact copy into the output folder, checking
// along the way that the file is a real image inside the competition's
// limits. Node 22, standard library only, no network, no randomness,
// no timestamps — run it twice and the output is identical both times.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(HERE, "entry.png");
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const TARGET_PATH = join(OUTPUT_DIR, "entry.png");

// Competition limits: the image must be at most 1 MiB and at most
// 1024 pixels on each side.
const MAX_BYTES = 1048576;
const MAX_SIDE = 1024;

// First bytes of a JPEG file and last bytes of a JPEG file.
const JPEG_START = Buffer.from([0xff, 0xd8]);
const JPEG_END = Buffer.from([0xff, 0xd9]);
// First bytes of a PNG file.
const PNG_START = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Pull the width and height out of the image header so we can enforce
// the size limit without decoding any pixels. PNG keeps them in the
// IHDR chunk; JPEG keeps them in the first Start-Of-Frame segment.
function readDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.subarray(0, PNG_START.length).equals(PNG_START)) {
    if (bytes.length < 24) {
      throw new Error("entry.png is a truncated PNG");
    }
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.subarray(0, 2).equals(JPEG_START)) {
    // Walk the JPEG segments (each starts with 0xFF and carries its own
    // length) until we reach a Start-Of-Frame marker, which stores
    // height first and then width.
    let pos = 2;
    while (pos + 9 < bytes.length) {
      if (bytes[pos] !== 0xff) {
        throw new Error("entry.png is a malformed JPEG");
      }
      const marker = bytes[pos + 1];
      // Standalone markers (SOI, EOI, TEM, RST0–RST7) carry no length
      // field, so step past them instead of reading a length that
      // isn't there.
      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        pos += 2;
        continue;
      }
      const segmentLength = bytes.readUInt16BE(pos + 2);
      if (segmentLength < 2) {
        throw new Error("entry.png is a malformed JPEG");
      }
      const isFrame =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isFrame) {
        return {
          width: bytes.readUInt16BE(pos + 7),
          height: bytes.readUInt16BE(pos + 5),
        };
      }
      pos += 2 + segmentLength;
    }
    throw new Error("entry.png is a JPEG with no frame marker");
  }
  throw new Error("entry.png is neither a PNG nor a JPEG");
}

if (!existsSync(SOURCE_PATH)) {
  throw new Error(`entry.png is missing next to main.ts (${SOURCE_PATH})`);
}

const source = readFileSync(SOURCE_PATH);

if (source.length === 0 || source.length > MAX_BYTES) {
  throw new Error(
    `entry.png is ${source.length} bytes; it must be between 1 and ${MAX_BYTES} bytes`,
  );
}

const isJpeg = source.subarray(0, 2).equals(JPEG_START);
const isPng = source.subarray(0, PNG_START.length).equals(PNG_START);
if (isJpeg) {
  // A well-formed JPEG opens with SOI and closes with EOI; if either
  // end is wrong the file is damaged, so refuse to ship it.
  if (!source.subarray(source.length - 2).equals(JPEG_END)) {
    throw new Error("entry.png is a JPEG missing its end marker");
  }
} else if (!isPng) {
  throw new Error("entry.png is neither a PNG nor a JPEG");
}

const { width, height } = readDimensions(source);
if (width > MAX_SIDE || height > MAX_SIDE) {
  throw new Error(
    `entry.png is ${width}x${height}; each side must be at most ${MAX_SIDE}px`,
  );
}

mkdirSync(OUTPUT_DIR, { recursive: true });
copyFileSync(SOURCE_PATH, TARGET_PATH);

// Prove the copy is exact: read it back and demand every byte match.
const written = readFileSync(TARGET_PATH);
if (written.length !== source.length || !written.equals(source)) {
  throw new Error("the copied entry.png does not match the source");
}

console.log(
  `wrote ${TARGET_PATH} (${written.length} bytes, ${width}x${height}, ${isJpeg ? "JPEG" : "PNG"})`,
);
