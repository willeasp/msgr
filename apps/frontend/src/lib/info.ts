import { MOVIE_FPS } from '@msgr/media';
import { secondsOf } from './sound';

/** What Get Info needs to know of a message's body. */
export interface Body {
  readonly content?: string | null;
  readonly picture?: { readonly width: number; readonly height: number } | null;
  readonly movie?: {
    readonly width: number;
    readonly height: number;
    readonly frames: number;
  } | null;
  readonly sound?: { readonly frames: number } | null;
}

/** What it shows at the top, as Finder shows a file's name. */
export function messageName({ content, picture, movie, sound }: Body): string {
  const line = content?.split('\n')[0]?.trim();
  if (line) {
    const letters = [...line];
    const name =
      letters.length > 32
        ? `${letters.slice(0, 31).join('').trimEnd()}…`
        : line;
    return `“${name}”`;
  }
  return picture ? 'Picture' : movie ? 'Movie' : sound ? 'Sound' : 'Message';
}

/** "Text", "Picture", "Movie", "Sound", or "Text with a picture" and so on. */
export function messageKind({ content, picture, movie, sound }: Body): string {
  const attached = picture
    ? 'picture'
    : movie
    ? 'movie'
    : sound
    ? 'sound'
    : null;
  if (content) return attached ? `Text with a ${attached}` : 'Text';
  return attached ? attached[0].toUpperCase() + attached.slice(1) : 'Text';
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * "42 characters; 256 × 160 pixels", a movie's frames and how long it runs,
 * or how long a sound runs.
 */
export function messageSize({ content, picture, movie, sound }: Body): string {
  const parts: string[] = [];
  if (content) parts.push(plural([...content].length, 'character'));
  if (picture) parts.push(`${picture.width} × ${picture.height} pixels`);
  if (movie) {
    const seconds = Math.round((movie.frames / MOVIE_FPS) * 10) / 10;
    parts.push(
      movie.frames === 1
        ? `${movie.width} × ${movie.height} pixels, 1 frame`
        : `${movie.width} × ${movie.height} pixels, ${
            movie.frames
          } frames, ${plural(seconds, 'second')}`
    );
  }
  if (sound) {
    parts.push(plural(Math.round(secondsOf(sound.frames) * 10) / 10, 'second'));
  }
  return parts.join('; ');
}

/** Where it was sent: "#general", "Team", "Your chat with Ana". */
export function chatPlace(chat: {
  readonly kind: 'DIRECT' | 'GROUP' | 'CHANNEL';
  readonly title: string;
}): string {
  return chat.kind === 'DIRECT' ? `Your chat with ${chat.title}` : chat.title;
}

/** Someone a message was for, and when they read it; null until they have. */
export interface Reader<P> {
  readonly person: P;
  readonly at: string | null;
}

/**
 * Everyone a message was for: whoever has read it, first first, then the
 * participants who haven't yet. Never its sender.
 */
export function readers<P extends { readonly id: string }>({
  senderId,
  participants,
  readBy,
}: {
  readonly senderId: string;
  readonly participants: readonly P[];
  readonly readBy: readonly { readonly reader: P; readonly at: string }[];
}): Reader<P>[] {
  const read = readBy
    .filter(({ reader }) => reader.id !== senderId)
    .map(({ reader, at }) => ({ person: reader, at }));
  const unread = participants
    .filter(
      ({ id }) => id !== senderId && !read.some((r) => r.person.id === id)
    )
    .map((person) => ({ person, at: null }));
  return [...read, ...unread];
}
