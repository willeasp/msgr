import { getPixel, type Bits } from '@msgr/media';

/**
 * 1-bit pixel art, drawn as SVG so it stays crisp at any size.
 * A bitmap is rows of characters: `#` is ink, anything else is clear.
 */
export type Bitmap = readonly string[];

/** One SVG path covering every run of ink, one unit per pixel. */
export function pixelPath(bitmap: Bitmap): string {
  let path = '';
  bitmap.forEach((row, y) => {
    for (const run of row.matchAll(/#+/g)) {
      path += `M${run.index} ${y}h${run[0].length}v1h-${run[0].length}z`;
    }
  });
  return path;
}

const SIZE = 5;

// FNV-1a: a small, well-spread hash, plenty for picking pixels.
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A 5×5 grid, mirrored left to right like a face, that a seed always maps to. */
export function identiconCells(seed: string): boolean[][] {
  const bits = hash(seed);
  const half = Math.ceil(SIZE / 2);
  const cells = Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      const column = x < half ? x : SIZE - 1 - x;
      return ((bits >>> (y * half + column)) & 1) === 1;
    })
  );
  // A seed that hashes to no ink still gets a mark: the centre pixel.
  const centre = cells[Math.floor(SIZE / 2)];
  if (centre && !cells.flat().includes(true))
    centre[Math.floor(SIZE / 2)] = true;
  return cells;
}

/** The two colours a 1-bit image is drawn in, as CSS colours. */
export interface Inks {
  readonly ink: string;
  readonly paper: string;
}

export const BLACK_ON_WHITE: Inks = { ink: '#000', paper: '#fff' };

/** A framed identicon as a data URI, for an <img> or background. */
export function identicon(
  seed: string,
  { ink, paper }: Inks = BLACK_ON_WHITE
): string {
  const bitmap = identiconCells(seed).map((row) =>
    row.map((ink) => (ink ? '#' : '.')).join('')
  );
  // The 5 cells sit centred in a 9-unit square inside a thin frame.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9" shape-rendering="crispEdges">` +
    `<rect width="9" height="9" fill="${paper}"/>` +
    `<path d="M0 0h9v9h-9zM.5 .5v8h8v-8z" fill="${ink}" fill-rule="evenodd"/>` +
    `<path d="${pixelPath(
      bitmap
    )}" fill="${ink}" transform="translate(2 2)"/>` +
    `</svg>`;
  return dataUri(svg);
}

/** A picture as a data URI for an <img> or background. */
export function pictureImage(
  bits: Bits,
  { ink, paper }: Inks = BLACK_ON_WHITE
): string {
  const { width, height } = bits;
  return dataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">` +
      `<rect width="${width}" height="${height}" fill="${paper}"/>` +
      `<path d="${pixelPath(bitmapOf(bits))}" fill="${ink}"/></svg>`
  );
}

// Escapes the parentheses too: Avatar puts this in an unquoted CSS url().
const dataUri = (svg: string) =>
  `data:image/svg+xml,${encodeURIComponent(svg).replace(
    /[()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )}`;

/** A packed picture as a Bitmap, row by row. */
export const bitmapOf = (bits: Bits): Bitmap =>
  Array.from({ length: bits.height }, (_, y) =>
    Array.from({ length: bits.width }, (_, x) =>
      getPixel(bits, x, y) ? '#' : '.'
    ).join('')
  );

/** A square bitmap as a CSS mask image: paint through it with currentColor. */
export function svgMask(bitmap: Bitmap): string {
  const size = bitmap.length;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<path d="${pixelPath(bitmap)}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
