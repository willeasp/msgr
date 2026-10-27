/*
 * What files Msgr takes, and how long they may run: pictures, videos and
 * sounds, known by their type, or a sound by its name when a phone doesn't
 * say. Reading them is for `app/browser/`; deciding is here.
 */

/** As much of a file as deciding needs; a `File` is one. */
export interface Named {
  readonly type: string;
  readonly name: string;
}

/** The longest video a movie can be cut from, in seconds. */
export const LONGEST_VIDEO = 10 * 60;

/** The longest file a sound can be cut from, in seconds. */
export const LONGEST_SOUND_FILE = 15 * 60;

/**
 * What sound files are called. Pickers ask for these by name: an iPhone
 * offers its photo library for `audio/*` and may grey out an MP3 in Files,
 * but opens Files for a list of extensions.
 */
export const SOUND_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.aif',
  '.aiff',
  '.caf',
  '.flac',
  '.ogg',
  '.oga',
  '.opus',
  '.weba',
  '.amr',
] as const;

/** For a sound file picker's `accept`. */
export const SOUND_FILES = SOUND_EXTENSIONS.join(',');

export const isPicture = ({ type }: Pick<Named, 'type'>) =>
  type.startsWith('image/');

export const isVideo = ({ type }: Named) => type.startsWith('video/');

/** A sound file, by its type or else its name: phones don't always say. */
export const isSoundFile = ({ type, name }: Named) =>
  type.startsWith('audio/') ||
  (!type &&
    SOUND_EXTENSIONS.some((extension) =>
      name.toLowerCase().endsWith(extension)
    ));

/** The first picture among dropped, pasted or picked files, if any. */
export const firstPicture = <F extends Named>(
  files: ArrayLike<F> | null | undefined
): F | null => Array.from(files ?? []).find(isPicture) ?? null;

/** The first picture, video or sound among them, if any. */
export const firstMedia = <F extends Named>(
  files: ArrayLike<F> | null | undefined
): F | null =>
  Array.from(files ?? []).find(
    (file) => isPicture(file) || isVideo(file) || isSoundFile(file)
  ) ?? null;
