import { fitWithin, type Bits } from '@msgr/media';
import { isPicture } from '../../lib/files';
import { ditherPhoto } from '../../lib/photo';

/**
 * A photo, shrunk to fit 320 on its long side and dithered, all on this
 * device: the original is never uploaded. With `square`, its middle square
 * instead, at that size. Null for a file this browser can't decode as a
 * picture.
 */
export async function pictureFromFile(
  file: Blob,
  { square }: { square?: number } = {}
): Promise<Bits | null> {
  if (!isPicture(file)) return null;
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    return null;
  }
  const { width, height } = square
    ? { width: square, height: square }
    : fitWithin(image.width, image.height);
  const side = Math.min(image.width, image.height);
  const [x, y, w, h] = square
    ? [(image.width - side) / 2, (image.height - side) / 2, side, side]
    : [0, 0, image.width, image.height];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, x, y, w, h, 0, 0, width, height);
  image.close();
  return ditherPhoto(
    context.getImageData(0, 0, width, height).data,
    width,
    height
  );
}

/**
 * The still of a GIF at `url` (one of this server's), its middle square
 * dithered at `side` pixels a side; null if it can't be fetched or decoded.
 */
export async function stillOf(
  url: string,
  side: number,
  signal: AbortSignal
): Promise<Bits | null> {
  const response = await fetch(url, { signal }).catch(() => null);
  const blob = response?.ok ? await response.blob().catch(() => null) : null;
  return blob && !signal.aborted
    ? pictureFromFile(blob, { square: side })
    : null;
}
