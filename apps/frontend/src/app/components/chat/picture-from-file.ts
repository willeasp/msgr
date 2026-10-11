import { fitWithin, type Bits } from '@msgr/bitmap';
import { ditherPhoto } from '../../../lib/photo';

/**
 * A photo, shrunk to fit 320 on its long side and dithered, all on this
 * device: the original is never uploaded. Null for a file this browser can't
 * decode as a picture.
 */
export async function pictureFromFile(file: Blob): Promise<Bits | null> {
  if (!file.type.startsWith('image/')) return null;
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    return null;
  }
  const { width, height } = fitWithin(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  image.close();
  return ditherPhoto(
    context.getImageData(0, 0, width, height).data,
    width,
    height
  );
}

/** The first picture among dropped or pasted files, if any. */
export const firstImage = (files: FileList | null | undefined) =>
  Array.from(files ?? []).find((file) => file.type.startsWith('image/')) ??
  null;
