import {
  byteLength,
  fromBase64,
  isValidSize,
  toBase64,
  type Bits,
} from '@msgr/bitmap';

/** A picture as GraphQL carries it: its bits raw-DEFLATEd, in base64. */
export interface WirePicture {
  readonly width: number;
  readonly height: number;
  readonly bits: string;
}

/** The stream's output, or null once it passes `max` bytes or turns out not to be DEFLATE. */
async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
  max = Infinity
): Promise<Uint8Array | null> {
  const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export async function toWire(bits: Bits): Promise<WirePicture> {
  const deflated = await pipe(
    new Uint8Array(bits.bytes),
    new CompressionStream('deflate-raw')
  );
  if (!deflated) throw new Error('Could not compress the picture');
  return { width: bits.width, height: bits.height, bits: toBase64(deflated) };
}

/** The picture, or null if its bits don't inflate to exactly its size. */
export async function fromWire({
  width,
  height,
  bits,
}: WirePicture): Promise<Bits | null> {
  if (!isValidSize(width, height)) return null;
  const deflated = fromBase64(bits);
  if (!deflated) return null;
  const size = byteLength(width, height);
  const bytes = await pipe(
    new Uint8Array(deflated),
    new DecompressionStream('deflate-raw'),
    size
  );
  return bytes?.length === size ? { width, height, bytes } : null;
}
