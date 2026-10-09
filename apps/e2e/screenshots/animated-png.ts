import { crc32 } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

interface Chunk {
  readonly type: string;
  readonly data: Buffer;
}

function chunksOf(png: Buffer): Chunk[] {
  const chunks: Chunk[] = [];
  for (let at = SIGNATURE.length; at < png.length; ) {
    const length = png.readUInt32BE(at);
    chunks.push({
      type: png.toString('latin1', at + 4, at + 8),
      data: png.subarray(at + 8, at + 8 + length),
    });
    at += 12 + length;
  }
  return chunks;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

const uint32 = (...values: number[]) => {
  const buffer = Buffer.alloc(4 * values.length);
  values.forEach((value, i) => buffer.writeUInt32BE(value, 4 * i));
  return buffer;
};

/**
 * Joins same-sized PNGs into one animated PNG that loops forever, each frame
 * shown for its `ms`. No re-encoding: every frame keeps its own compressed
 * image data, rewrapped as APNG frame chunks.
 */
export function animatedPng(
  frames: readonly { readonly png: Buffer; readonly ms: number }[]
): Buffer {
  const parsed = frames.map(({ png }) => chunksOf(png));
  const header = parsed[0]?.find(({ type }) => type === 'IHDR')?.data;
  if (!header) throw new Error('No frames, or the first is not a PNG');
  for (const chunks of parsed) {
    const own = chunks.find(({ type }) => type === 'IHDR')?.data;
    if (!own?.equals(header)) {
      throw new Error('Every frame must match the first in size and format');
    }
  }

  let sequence = 0;
  const control = (ms: number) => {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence++, 0);
    header.copy(data, 4, 0, 8); // width and height
    // x and y offsets stay 0; then the delay as a fraction of a second.
    data.writeUInt16BE(ms, 20);
    data.writeUInt16BE(1000, 22);
    // dispose and blend ops stay 0: replace the whole canvas.
    return chunk('fcTL', data);
  };

  const body = parsed.flatMap((chunks, i) => [
    control(frames[i]?.ms ?? 0),
    ...chunks
      .filter(({ type }) => type === 'IDAT')
      .map(({ data }) =>
        i === 0
          ? chunk('IDAT', data)
          : chunk('fdAT', Buffer.concat([uint32(sequence++), data]))
      ),
  ]);

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('acTL', uint32(frames.length, 0)),
    ...body,
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
