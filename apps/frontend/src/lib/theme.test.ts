import { describe, expect, it } from 'vitest';
import { parseTheme, serializeTheme, themeClasses } from './theme';

describe('parseTheme', () => {
  it('follows the system mode, untinted, when nothing is stored', () => {
    expect(parseTheme(null, true)).toEqual({ mode: 'dark', tint: null });
    expect(parseTheme(null, false)).toEqual({ mode: 'light', tint: null });
  });

  it('round-trips a stored choice', () => {
    const theme = { mode: 'dark', tint: 'green' } as const;

    expect(parseTheme(serializeTheme(theme), false)).toEqual(theme);
  });

  it('falls back to the system for anything it does not recognise', () => {
    for (const stored of [
      'not json',
      '{"mode":"sepia","tint":null}',
      '{"mode":"light","tint":"beige"}',
      '42',
    ]) {
      expect(parseTheme(stored, true)).toEqual({ mode: 'dark', tint: null });
    }
  });
});

describe('themeClasses', () => {
  it('names the mode, and the tint when there is one', () => {
    expect(themeClasses({ mode: 'light', tint: null })).toEqual([
      'theme-light',
    ]);
    expect(themeClasses({ mode: 'dark', tint: 'blue' })).toEqual([
      'theme-dark',
      'tint-blue',
    ]);
  });
});
