/**
 * A 1-bit picture: rows top to bottom, each padded to whole bytes, 8 pixels a
 * byte with the leftmost in the high bit, 1 for ink. The one layout used by
 * Paint, the wire, the database and link thumbnails.
 */
export interface Bits {
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
}

/** The longest side a picture may have. */
export const MAX_SIDE = 320;

export const rowBytes = (width: number): number => Math.ceil(width / 8);
export const byteLength = (width: number, height: number): number =>
  rowBytes(width) * height;

export const isValidSize = (width: number, height: number): boolean =>
  [width, height].every(
    (side) => Number.isInteger(side) && side >= 1 && side <= MAX_SIDE
  );

export const blank = (width: number, height: number): Bits => ({
  width,
  height,
  bytes: new Uint8Array(byteLength(width, height)),
});

const onCanvas = ({ width, height }: Bits, x: number, y: number) =>
  x >= 0 && x < width && y >= 0 && y < height;

export function getPixel(bits: Bits, x: number, y: number): boolean {
  if (!onCanvas(bits, x, y)) return false;
  const byte = bits.bytes[y * rowBytes(bits.width) + (x >> 3)] ?? 0;
  return (byte & (0x80 >> (x & 7))) !== 0;
}

/** Off the canvas, does nothing. */
export function setPixel(bits: Bits, x: number, y: number, ink: boolean): void {
  if (!onCanvas(bits, x, y)) return;
  const i = y * rowBytes(bits.width) + (x >> 3);
  const mask = 0x80 >> (x & 7);
  const byte = bits.bytes[i] ?? 0;
  bits.bytes[i] = ink ? byte | mask : byte & ~mask;
}

export const isBlank = ({ bytes }: Bits): boolean =>
  bytes.every((byte) => byte === 0);

/** The size to shrink a picture to so its long side fits; never enlarged. */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_SIDE
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
