import { describe, expect, it } from 'vitest';
import { isLoadFailure } from './loading';

describe('isLoadFailure', () => {
  it("knows every browser's way of saying a part couldn't be loaded", () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://msgr.test/assets/ProfileDialog-x.js',
      'error loading dynamically imported module: https://msgr.test/assets/a.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/ProfileDialog-x.css',
    ]) {
      expect([message, isLoadFailure(new TypeError(message))]).toEqual([
        message,
        true,
      ]);
    }
  });

  it('leaves a bug to be a bug', () => {
    expect(
      isLoadFailure(
        new TypeError("Cannot read properties of undefined (reading 'id')")
      )
    ).toBe(false);
    expect(isLoadFailure('Failed to fetch dynamically imported module')).toBe(
      false
    );
    expect(isLoadFailure(undefined)).toBe(false);
  });
});
