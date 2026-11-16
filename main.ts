// Entry program for make.fun — ai-excited-01 ("Make the AI judge excited").
//
// The artwork: an enormous teal octopus erupting from a delicate little
// teacup. Porcelain shards fly, brown tea arcs through deep blue water,
// sucker-ringed arms curl in every direction, and a single huge golden
// eye locks onto the viewer. The whole point is the absurd mismatch of
// scale — a monster of the deep that plainly cannot fit in a teacup,
// caught mid-escape at the most dramatic split second.
//
// How this program works: the finished picture already lives beside this
// file as entry.png, and this script simply places an exact duplicate of
// it at $MAKEFUN_OUTPUT_DIR/entry.png (or /output/entry.png when that
// variable is unset). Before writing anything it sanity-checks the
// picture — right file type, inside the size caps, properly terminated —
// and after writing it reads the result back and insists on a perfect
// byte-for-byte match. It uses only the Node 22 standard library, never
// touches the network, and has no randomness or clock in it anywhere,
// so two runs always land on identical bytes. The picture is checked
// but never re-encoded, so nothing about it can drift between runs.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Where the source picture lives, and where the finished copy must go.
const repoDir = dirname(fileURLToPath(import.meta.url));
const sourceFile = resolve(repoDir, "entry.png");
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const outFile = resolve(outDir, "entry.png");

// The competition's caps: no more than 1 MiB, no side longer than 1024 px.
const BYTE_CAP = 1024 * 1024;
const EDGE_CAP = 1024;

const JPEG_MAGIC = [0xff, 0xd8];
const JPEG_TAIL = [0xff, 0xd9];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function die(message: string): never {
  throw new Error(message);
}

function startsWith(bytes: Buffer, magic: number[]): boolean {
  return magic.every((byte, i) => bytes[i] === byte);
}

type Size = { width: number; height: number };

// A PNG stores its width and height right after the 8-byte signature:
// bytes 16-19 are the width, 20-23 the height, both big-endian.
function pngSize(bytes: Buffer): Size {
  if (bytes.length < 24) die("entry.png is a PNG too short to hold a header");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// A JPEG is a chain of segments, each opening with 0xFF plus a marker
// byte and (usually) a 2-byte length. Walk the chain until a frame
// marker (SOF0-SOF15, skipping the ones that are not frames) turns up;
// it stores the height first, then the width.
function jpegSize(bytes: Buffer): Size {
  let cursor = 2;
  while (cursor + 9 < bytes.length) {
    if (bytes[cursor] !== 0xff) die("entry.png is a JPEG with a broken segment");
    const marker = bytes[cursor + 1];
    const noLength =
      marker === 0xd8 || marker === 0xd9 || marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7);
    if (noLength) {
      cursor += 2;
      continue;
    }
    const segLen = bytes.readUInt16BE(cursor + 2);
    if (segLen < 2) die("entry.png is a JPEG with a broken segment length");
    const isFrameMarker =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameMarker) {
      return {
        height: bytes.readUInt16BE(cursor + 5),
        width: bytes.readUInt16BE(cursor + 7),
      };
    }
    cursor += 2 + segLen;
  }
  die("entry.png is a JPEG with no frame segment");
  throw new Error("unreachable");
}

function run(): void {
  if (!existsSync(sourceFile)) {
    die(`entry.png is missing — expected it next to main.ts at ${sourceFile}`);
  }
  const picture = readFileSync(sourceFile);

  if (picture.length === 0) die("entry.png is empty");
  if (picture.length > BYTE_CAP) {
    die(`entry.png is ${picture.length} bytes, over the ${BYTE_CAP}-byte cap`);
  }

  const isJpeg = startsWith(picture, JPEG_MAGIC);
  const isPng = startsWith(picture, PNG_MAGIC);
  if (!isJpeg && !isPng) die("entry.png is neither JPEG nor PNG");

  if (isJpeg) {
    const tail = picture.subarray(picture.length - 2);
    if (!startsWith(tail, JPEG_TAIL)) {
      die("entry.png is a JPEG missing its closing end marker");
    }
  }

  const size: Size = isPng ? pngSize(picture) : jpegSize(picture);
  if (size.width > EDGE_CAP || size.height > EDGE_CAP) {
    die(
      `entry.png is ${size.width}x${size.height}px, over the ${EDGE_CAP}px cap`,
    );
  }
  if (size.width === 0 || size.height === 0) {
    die("entry.png reports a zero width or height");
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, picture);

  // Read the copy back and demand it match the source byte for byte.
  const shipped = readFileSync(outFile);
  if (!shipped.equals(picture)) {
    die("the entry.png written to the output folder does not match the source");
  }

  console.log(
    `wrote ${outFile} — ${shipped.length} bytes, ` +
      `${size.width}x${size.height}, ${isJpeg ? "JPEG" : "PNG"}`,
  );
}

run();
