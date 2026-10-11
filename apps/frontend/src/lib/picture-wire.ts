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

export async function toWire(bits: Bits): Promise<WirePicture> {
  const deflated = new Blob([bits.bytes])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(deflated).arrayBuffer());
  return { width: bits.width, height: bits.height, bits: toBase64(bytes) };
}

/** The inflated bytes, or null once past `max` or if they aren't DEFLATE. */
async function inflate(
  deflated: Uint8Array<ArrayBuffer>,
  max: number
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = new Blob([deflated])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
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
  return new Uint8Array(await new Blob(chunks).arrayBuffer());
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
  const bytes = await inflate(deflated, size);
  return bytes?.length === size ? { width, height, bytes } : null;
}

// Each picture inflated once a session, keyed by its shape too: the same
// bytes can be 16×10 or 8×20.
// shortcut: never evicted; a few KB each, fine until chats hold thousands.
const inflated = new Map<string, Promise<Bits | null>>();

/** `fromWire`, remembered. Shared between callers: copy before changing it. */
export function pictureBits(picture: WirePicture): Promise<Bits | null> {
  const key = `${picture.width}x${picture.height}:${picture.bits}`;
  let bits = inflated.get(key);
  if (!bits) {
    bits = fromWire(picture);
    inflated.set(key, bits);
  }
  return bits;
}
