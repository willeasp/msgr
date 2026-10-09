import { describe, expect, it } from 'vitest';
import { matchesHotkey } from './hotkeys';

const press = (key: string, modifiers: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...modifiers,
});

describe('matchesHotkey', () => {
  it('matches a bare key, case-insensitively', () => {
    expect(matchesHotkey('Escape', press('Escape'))).toBe(true);
    expect(matchesHotkey('escape', press('Escape'))).toBe(true);
  });

  it('matches a key with its modifiers', () => {
    expect(matchesHotkey('ctrl+k', press('k', { ctrlKey: true }))).toBe(true);
  });

  it('rejects missing or extra modifiers', () => {
    expect(matchesHotkey('ctrl+k', press('k'))).toBe(false);
    expect(matchesHotkey('ctrl+k', press('k', { ctrlKey: true, metaKey: true }))).toBe(false);
    expect(matchesHotkey('Escape', press('Escape', { shiftKey: true }))).toBe(false);
  });
});
