import { byteLength, isValidSize, toBase64, type Bits } from '@msgr/media';

/** A picture as the composer sends it: its bits raw-DEFLATEd, in base64. */
export interface WirePicture {
  readonly width: number;
  readonly height: number;
  readonly bits: string;
}

/** A picture as the server lists it: its size, and where its bytes are. */
export interface KeptPicture {
  readonly width: number;
  readonly height: number;
  readonly url: string;
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

/** The picture, or null if its bytes don't inflate to exactly its size. */
export async function fromBytes(
  { width, height }: { readonly width: number; readonly height: number },
  deflated: Uint8Array<ArrayBuffer>
): Promise<Bits | null> {
  if (!isValidSize(width, height)) return null;
  const size = byteLength(width, height);
  const bytes = await inflate(deflated, size);
  return bytes?.length === size ? { width, height, bytes } : null;
}
