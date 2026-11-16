// Entry program for make.fun — ai-excited-01 ("Make the AI judge excited").
//
// The artwork, drawn from scratch by this program: a colossal teal
// octopus bursting out of a tiny porcelain teacup. One huge golden eye
// stares straight at the viewer, eight sucker-ringed arms flail in every
// direction, the cup cracks, brown tea arcs through the air, and shards
// of porcelain fly. The joke is the impossible scale — a monster of the
// deep that plainly cannot fit in a teacup, caught at the exact second
// it breaks free — and a speech bubble shouts "WOW!" at the judge.
//
// How it works: every pixel is painted procedurally into a 1024x1024
// RGB buffer (gradients, ellipses, bezier arms, a little bitmap font),
// then the buffer is encoded as a PNG by hand — raw scanlines,
// zlib deflate, CRC-checked chunks — using only the Node standard
// library. There is no network, no clock and no randomness anywhere:
// a fixed-seed generator drives every spot, bubble and droplet, so two
// runs always produce byte-identical output. The result is written to
// $MAKEFUN_OUTPUT_DIR/entry.png (/output when the variable is unset),
// read back, and checked byte for byte before the program reports it.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- canvas

const WIDTH = 1024;
const HEIGHT = 1024;

// One RGB byte triple per pixel, row by row.
const pixels = new Uint8Array(WIDTH * HEIGHT * 3);

type RGB = [number, number, number];

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function put(x: number, y: number, c: RGB): void {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= WIDTH || yi >= HEIGHT) return;
  const i = (yi * WIDTH + xi) * 3;
  pixels[i] = c[0];
  pixels[i + 1] = c[1];
  pixels[i + 2] = c[2];
}

// Paint over what is already there with an opacity from 0 to 1.
function wash(x: number, y: number, c: RGB, alpha: number): void {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= WIDTH || yi >= HEIGHT) return;
  const i = (yi * WIDTH + xi) * 3;
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  pixels[i] = clampByte(pixels[i] + (c[0] - pixels[i]) * a);
  pixels[i + 1] = clampByte(pixels[i + 1] + (c[1] - pixels[i + 1]) * a);
  pixels[i + 2] = clampByte(pixels[i + 2] + (c[2] - pixels[i + 2]) * a);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    clampByte(a[0] + (b[0] - a[0]) * t),
    clampByte(a[1] + (b[1] - a[1]) * t),
    clampByte(a[2] + (b[2] - a[2]) * t),
  ];
}

// Deterministic stand-in for randomness: the same seed always gives the
// same stream, so the picture never changes between runs.
function makeDice(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

const dice = makeDice(20261116);

// A filled disc, the workhorse for spots, bubbles and arm segments.
function disc(cx: number, cy: number, r: number, c: RGB, alpha = 1): void {
  if (r <= 0) return;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(WIDTH - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(HEIGHT - 1, Math.ceil(cy + r));
  const rr = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= rr) {
        if (alpha >= 1) put(x, y, c);
        else wash(x, y, c, alpha);
      }
    }
  }
}

function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: RGB,
  alpha = 1,
): void {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(WIDTH - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(HEIGHT - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        if (alpha >= 1) put(x, y, c);
        else wash(x, y, c, alpha);
      }
    }
  }
}

// A thick line, stamped as a chain of discs so the ends stay round.
function stroke(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thick: number,
  c: RGB,
  alpha = 1,
): void {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1, thick / 3)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thick / 2, c, alpha);
  }
}

// A polyline of thick segments, for cracks, arcs and splash curves.
function polyline(
  pts: Array<[number, number]>,
  thick: number,
  c: RGB,
  alpha = 1,
): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    stroke(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], thick, c, alpha);
  }
}

// Fill a polygon with the scanline rule: for each row, pair up the
// edge crossings and paint between them.
function fillPoly(pts: Array<[number, number]>, c: RGB, alpha = 1): void {
  let yMin = HEIGHT;
  let yMax = -1;
  for (const [, y] of pts) {
    yMin = Math.min(yMin, Math.floor(y));
    yMax = Math.max(yMax, Math.ceil(y));
  }
  yMin = Math.max(0, yMin);
  yMax = Math.min(HEIGHT - 1, yMax);
  for (let y = yMin; y <= yMax; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(WIDTH - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) {
        if (alpha >= 1) put(x, y, c);
        else wash(x, y, c, alpha);
      }
    }
  }
}

// Points along a quadratic bezier curve.
function quad(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  t: number,
): [number, number] {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

// A filled rounded rectangle, built from a box plus four corner discs.
function roundRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  c: RGB,
): void {
  fillPoly(
    [
      [x0 + r, y0],
      [x1 - r, y0],
      [x1, y0 + r],
      [x1, y1 - r],
      [x1 - r, y1],
      [x0 + r, y1],
      [x0, y1 - r],
      [x0, y0 + r],
    ],
    c,
  );
  disc(x0 + r, y0 + r, r, c);
  disc(x1 - r, y0 + r, r, c);
  disc(x0 + r, y1 - r, r, c);
  disc(x1 - r, y1 - r, r, c);
}

// ---------------------------------------------------------------- PNG out

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let v = n;
    for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
    table[n] = v >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
  return Buffer.concat([head, data, tail]);
}

// Encode the painted buffer as a plain RGB PNG: filter byte 0 on every
// scanline, one IDAT block, all checksums computed here.
function encodePng(): Buffer {
  const stride = 1 + WIDTH * 3;
  const raw = Buffer.alloc(HEIGHT * stride);
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * stride] = 0;
    Buffer.from(pixels.buffer, y * WIDTH * 3, WIDTH * 3).copy(
      raw,
      y * stride + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 2; // truecolour RGB
  ihdr[10] = 0; // deflate compression
  ihdr[11] = 0; // filter method 0
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- palette

const DEEP: RGB = [7, 53, 77]; // dark outline navy-teal
const TEAL: RGB = [23, 184, 166]; // octopus mid teal
const TEAL_DARK: RGB = [10, 109, 124]; // octopus shadow teal
const TEAL_LIGHT: RGB = [63, 224, 200]; // octopus highlight
const GOLD: RGB = [247, 181, 0]; // eye, rim, glow
const TEA: RGB = [217, 138, 31]; // splashing tea
const TEA_DARK: RGB = [181, 119, 31];
const PORCELAIN: RGB = [251, 253, 255];
const PORCELAIN_SHADE: RGB = [223, 233, 245];
const BLUE_BAND: RGB = [29, 111, 209];
const NAVY: RGB = [11, 42, 107]; // bubble text
const ORANGE: RGB = [232, 80, 15];

// ------------------------------------------------------------ the scene

function paintBackground(): void {
  const top: RGB = [13, 42, 107];
  const bottom: RGB = [6, 26, 69];
  for (let y = 0; y < HEIGHT; y++) {
    const t = y / (HEIGHT - 1);
    const base = mix(top, bottom, t);
    for (let x = 0; x < WIDTH; x++) {
      const dx = x - 512;
      const dy = y - 470;
      const d = Math.sqrt(dx * dx + dy * dy) / 720;
      const glow = Math.max(0, 1 - d);
      const g = glow * glow * 0.55;
      const i = (y * WIDTH + x) * 3;
      pixels[i] = clampByte(base[0] + 255 * g);
      pixels[i + 1] = clampByte(base[1] + 190 * g);
      pixels[i + 2] = clampByte(base[2] + 80 * g);
    }
  }
  // Slanted shafts of light falling from the surface.
  fillPoly([[240, -10], [360, -10], [520, 560], [430, 560]], [255, 230, 150], 0.07);
  fillPoly([[700, -10], [790, -10], [640, 520], [580, 520]], [255, 230, 150], 0.06);
  fillPoly([[60, -10], [130, -10], [330, 420], [280, 420]], [190, 230, 255], 0.05);
}

// A ring of a bubble: small dots traced around a circle.
function bubble(cx: number, cy: number, r: number): void {
  const steps = Math.max(10, Math.floor(r * 2.4));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.6, [220, 240, 255], 0.55);
  }
  disc(cx - r * 0.35, cy - r * 0.35, Math.max(1.5, r * 0.18), [255, 255, 255], 0.8);
}

function paintBubbles(): void {
  for (let i = 0; i < 46; i++) {
    const x = 24 + dice() * 976;
    const y = 40 + dice() * 940;
    // Keep the middle of the picture clear for the octopus itself.
    if (Math.hypot(x - 512, y - 470) < 300) continue;
    bubble(x, y, 4 + dice() * 15);
  }
}

// One tapering arm along a bezier, with a row of pale suckers on the
// side that faces the head.
function paintArm(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  r0: number,
  r1: number,
  colour: RGB,
): void {
  const steps = 96;
  let prev: [number, number] = p0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pos = quad(p0, p1, p2, t);
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    // Lay the arm down as overlapping discs, widest at its base.
    disc(pos[0], pos[1], r, colour);
    if (i > 0) {
      const mid: [number, number] = [(prev[0] + pos[0]) / 2, (prev[1] + pos[1]) / 2];
      disc(mid[0], mid[1], r, colour);
    }
    // Suckers: pale dots on the inner edge, spaced along the arm.
    if (i % 9 === 4 && i < steps - 6) {
      const ahead = quad(p0, p1, p2, Math.min(1, t + 0.02));
      let nx = -(ahead[1] - pos[1]);
      let ny = ahead[0] - pos[0];
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      // Face the suckers toward the middle of the head.
      if (nx * (512 - pos[0]) + ny * (470 - pos[1]) < 0) {
        nx = -nx;
        ny = -ny;
      }
      disc(pos[0] + nx * r * 0.45, pos[1] + ny * r * 0.45, Math.max(3, r * 0.26), [216, 245, 238]);
      disc(pos[0] + nx * r * 0.45, pos[1] + ny * r * 0.45, Math.max(1.5, r * 0.12), [140, 190, 185]);
    }
    prev = pos;
  }
}

function paintHead(): void {
  // Dark rim first, then the dome itself, so the head has a clean edge.
  ellipse(512, 470, 270, 254, DEEP);
  ellipse(512, 468, 256, 240, TEAL);
  // Soft light from above, soft shadow underneath.
  ellipse(500, 372, 205, 128, TEAL_LIGHT, 0.45);
  ellipse(512, 612, 224, 108, TEAL_DARK, 0.5);
  ellipse(300, 480, 90, 170, TEAL_DARK, 0.35);
  // Freckle spots, kept clear of the eye.
  for (let i = 0; i < 26; i++) {
    const a = dice() * Math.PI * 2;
    const u = 0.25 + dice() * 0.7;
    const x = 512 + Math.cos(a) * 225 * u;
    const y = 468 + Math.sin(a) * 210 * u;
    if (Math.hypot(x - 512, y - 420) < 135) continue;
    disc(x, y, 8 + dice() * 16, TEAL_DARK, 0.5);
  }
  for (let i = 0; i < 60; i++) {
    const a = dice() * Math.PI * 2;
    const u = 0.2 + dice() * 0.75;
    disc(
      512 + Math.cos(a) * 230 * u,
      468 + Math.sin(a) * 215 * u,
      2 + dice() * 2.5,
      [159, 245, 230],
      0.6,
    );
  }
}

function paintEye(): void {
  // One enormous golden eye, wide with shock, locked on the viewer.
  ellipse(512, 420, 114, 96, DEEP);
  ellipse(512, 420, 104, 86, [255, 255, 255]);
  disc(512, 420, 64, GOLD);
  disc(512, 420, 46, [255, 207, 61]);
  ellipse(512, 420, 28, 42, [12, 12, 18]);
  disc(488, 392, 15, [255, 255, 255]);
  disc(532, 448, 7, [255, 255, 255], 0.85);
  // A single raised brow arched high above it.
  const brow: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    brow.push(quad([414, 336], [512, 288], [610, 336], i / 24));
  }
  polyline(brow, 15, DEEP);
  // A small open "o" of a mouth, mid-gasp.
  ellipse(512, 588, 28, 34, DEEP);
  ellipse(512, 590, 20, 26, [20, 20, 28]);
  ellipse(512, 600, 15, 13, [255, 143, 163]);
}

function paintCup(): void {
  // Saucer.
  ellipse(512, 920, 272, 46, [185, 207, 230]);
  ellipse(512, 917, 242, 37, PORCELAIN);
  ellipse(512, 906, 192, 26, PORCELAIN_SHADE, 0.8);
  // The cup itself: a wide bowl, white with a blue band and gold rim.
  fillPoly(
    [[330, 742], [694, 742], [660, 872], [620, 892], [404, 892], [364, 872]],
    PORCELAIN,
  );
  fillPoly(
    [[560, 742], [694, 742], [660, 872], [620, 892], [560, 892]],
    PORCELAIN_SHADE,
    0.55,
  );
  fillPoly([[352, 786], [672, 786], [664, 818], [360, 818]], BLUE_BAND, 0.92);
  for (let x = 372; x <= 652; x += 28) {
    disc(x, 802, 6, [255, 255, 255], 0.9);
    disc(x + 14, 802, 3, GOLD, 0.9);
  }
  // Handle: a dark ring first, then white over it, on the right side.
  for (let a = -78; a <= 78; a += 4) {
    const rad = (a * Math.PI) / 180;
    disc(706 + Math.cos(rad) * 54, 812 + Math.sin(rad) * 54, 13, DEEP);
  }
  for (let a = -78; a <= 78; a += 4) {
    const rad = (a * Math.PI) / 180;
    disc(706 + Math.cos(rad) * 54, 812 + Math.sin(rad) * 54, 8, PORCELAIN);
  }
  // Steaming tea showing at the rim, and the gold lip of the cup.
  ellipse(512, 746, 168, 24, [122, 74, 18]);
  ellipse(512, 744, 140, 18, TEA_DARK);
  ellipse(512, 743, 96, 11, TEA, 0.85);
  stroke(330, 742, 694, 742, 8, GOLD);
  stroke(340, 736, 684, 736, 3, [255, 255, 255], 0.8);
  // A jagged crack running down the left wall of the cup.
  polyline(
    [[420, 745], [408, 770], [424, 795], [404, 825], [416, 855], [400, 880]],
    4,
    [51, 65, 92],
  );
}

function paintSplashAndShards(): void {
  // Two arcs of tea thrown clear of the cup, left and right.
  const leftArc: Array<[number, number]> = [];
  const rightArc: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    leftArc.push(quad([352, 742], [128, 630], [148, 468], i / 24));
    rightArc.push(quad([676, 742], [912, 630], [892, 470], i / 24));
  }
  polyline(leftArc, 17, TEA);
  polyline(leftArc, 6, [242, 182, 76]);
  polyline(rightArc, 17, TEA);
  polyline(rightArc, 6, [242, 182, 76]);
  // Droplets flung off the arcs.
  for (let i = 0; i < 26; i++) {
    const onLeft = dice() < 0.5;
    const t = 0.15 + dice() * 0.8;
    const base = onLeft
      ? quad([352, 742], [128, 630], [148, 468], t)
      : quad([676, 742], [912, 630], [892, 470], t);
    disc(
      base[0] + (dice() - 0.5) * 70,
      base[1] + (dice() - 0.5) * 70 - 20,
      5 + dice() * 9,
      dice() < 0.5 ? TEA : TEA_DARK,
    );
  }
  // Porcelain shards: white triangles with a dark edge, bursting outward.
  for (let i = 0; i < 10; i++) {
    const a = dice() * Math.PI * 2;
    const dist = 260 + dice() * 150;
    const cx = 512 + Math.cos(a) * dist;
    const cy = 700 + Math.sin(a) * dist * 0.7;
    const s = 16 + dice() * 26;
    const rot = dice() * Math.PI * 2;
    const tri: Array<[number, number]> = [0, 1, 2].map((k) => {
      const ang = rot + (k * 2 * Math.PI) / 3;
      return [cx + Math.cos(ang) * s, cy + Math.sin(ang) * s] as [number, number];
    });
    fillPoly(tri, PORCELAIN);
    polyline([tri[0], tri[1], tri[2], tri[0]], 3, DEEP);
  }
  // Short white speed lines near the tips, for the feeling of motion.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const x0 = 512 + Math.cos(a) * 330;
    const y0 = 470 + Math.sin(a) * 330;
    const x1 = 512 + Math.cos(a) * 385;
    const y1 = 470 + Math.sin(a) * 385;
    stroke(x0, y0, x1, y1, 4, [255, 255, 255], 0.7);
  }
}

// A tiny 5x7 bitmap font, just the four glyphs the bubble needs.
const GLYPHS: Record<string, string[]> = {
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "01010"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
};

function paintWord(
  word: string,
  x0: number,
  y0: number,
  cell: number,
  colours: RGB[],
): void {
  let x = x0;
  for (let ci = 0; ci < word.length; ci++) {
    const glyph = GLYPHS[word[ci]];
    const colour = colours[ci] ?? NAVY;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "1") {
          for (let dy = 0; dy < cell; dy++) {
            for (let dx = 0; dx < cell; dx++) {
              put(x + col * cell + dx, y0 + row * cell + dy, colour);
            }
          }
        }
      }
    }
    x += 6 * cell + 10;
  }
}

function paintBubble(): void {
  // A white speech bubble in the top-left corner, tail pointing down
  // at the octopus, shouting straight at the judge.
  roundRect(56, 56, 448, 204, 28, NAVY);
  roundRect(62, 62, 442, 198, 24, [255, 255, 255]);
  fillPoly([[300, 198], [368, 198], [436, 306]], [255, 255, 255]);
  stroke(300, 198, 436, 306, 6, NAVY);
  stroke(368, 198, 436, 306, 6, NAVY);
  paintWord("WOW!", 104, 88, 13, [NAVY, NAVY, NAVY, ORANGE]);
}

// Darken the corners a touch so the middle of the picture pops.
function paintVignette(): void {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const d = Math.hypot(x - 512, y - 512) / 720;
      const f = 1 - 0.3 * Math.max(0, d - 0.55) * Math.max(0, d - 0.55) * 2.2;
      if (f >= 1) continue;
      const i = (y * WIDTH + x) * 3;
      pixels[i] = clampByte(pixels[i] * f);
      pixels[i + 1] = clampByte(pixels[i + 1] * f);
      pixels[i + 2] = clampByte(pixels[i + 2] * f);
    }
  }
}

function paintScene(): void {
  paintBackground();
  paintBubbles();
  // Arms behind the head first, so the dome sits on top of them.
  paintArm([330, 560], [140, 290], [205, 148], 52, 9, TEAL_DARK);
  paintArm([694, 560], [890, 290], [825, 148], 52, 9, TEAL_DARK);
  paintArm([640, 360], [800, 170], [878, 84], 46, 8, TEAL_DARK);
  paintHead();
  paintEye();
  // Arms in front of the head, wrapping low around the cup.
  paintArm([300, 620], [150, 630], [92, 762], 50, 9, TEAL);
  paintArm([724, 620], [880, 640], [948, 782], 50, 9, TEAL);
  paintArm([400, 700], [300, 852], [222, 942], 54, 10, TEAL);
  paintArm([624, 700], [730, 856], [818, 942], 54, 10, TEAL);
  paintCup();
  // One arm drapes over the cup's rim toward the viewer, in front.
  paintArm([512, 660], [500, 820], [560, 950], 58, 10, TEAL);
  paintSplashAndShards();
  paintBubble();
  paintVignette();
}

// ------------------------------------------------------------------ entry

const BYTE_CAP = 1024 * 1024;

function run(): void {
  paintScene();
  const png = encodePng();
  if (png.length === 0) throw new Error("the picture came out empty");
  if (png.length > BYTE_CAP) {
    throw new Error(`the picture is ${png.length} bytes, over the 1 MiB cap`);
  }
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  const outFile = resolve(outDir, "entry.png");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, png);
  const shipped = readFileSync(outFile);
  if (!shipped.equals(png)) {
    throw new Error("the entry.png written out does not match the picture");
  }
  console.log(
    `wrote ${outFile} — ${shipped.length} bytes, ${WIDTH}x${HEIGHT}, PNG`,
  );
}

run();
