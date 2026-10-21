import { describe, expect, it } from 'vitest';
import {
  firstMedia,
  firstPicture,
  isPicture,
  isSoundFile,
  isVideo,
  SOUND_FILES,
} from './files';

const file = (name: string, type = '') => ({ name, type });

describe('what files Msgr takes', () => {
  it('knows pictures and videos by their type', () => {
    expect(isPicture(file('a.png', 'image/png'))).toBe(true);
    expect(isVideo(file('a.mov', 'video/quicktime'))).toBe(true);
    expect(isPicture(file('a.png'))).toBe(false);
  });

  it('knows a sound by its type, or by its name when it has none', () => {
    expect(isSoundFile(file('song', 'audio/mpeg'))).toBe(true);
    expect(isSoundFile(file('memo.m4a', 'audio/x-m4a'))).toBe(true);
    expect(isSoundFile(file('Song.MP3'))).toBe(true);
    expect(isSoundFile(file('notes.txt'))).toBe(false);
    expect(isSoundFile(file('cover.mp3', 'image/png'))).toBe(false);
    expect(isSoundFile(file('clip.mp4', 'video/mp4'))).toBe(false);
  });

  it('asks a picker for sound files by name, never for every audio type', () => {
    expect(SOUND_FILES.split(',')).toEqual(
      expect.arrayContaining(['.mp3', '.m4a', '.wav'])
    );
    expect(SOUND_FILES).not.toContain('audio/');
  });

  it('picks the first it takes from dropped or pasted files', () => {
    const notes = file('notes.txt', 'text/plain');
    const song = file('song.mp3');
    const photo = file('photo.jpg', 'image/jpeg');
    expect(firstMedia([notes, song, photo])).toBe(song);
    expect(firstPicture([notes, song, photo])).toBe(photo);
    expect(firstMedia([notes])).toBeNull();
    expect(firstMedia(null)).toBeNull();
  });
});
