import { invalidInput, type InvalidInput } from './errors.js';
import { err, ok, type Result } from './result.js';

/** A window into a newest-first history: skip `offset` items, take `limit`. */
export interface Page {
  readonly limit: number;
  readonly offset: number;
}

export const Page = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  /** Missing or `null` arguments fall back to defaults; out-of-range ones are rejected. */
  parse(args: {
    readonly limit?: number | null;
    readonly offset?: number | null;
  }): Result<Page, InvalidInput> {
    const limit = args.limit ?? Page.DEFAULT_LIMIT;
    const offset = args.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > Page.MAX_LIMIT) {
      return err(
        invalidInput('limit', `Must be an integer from 1 to ${Page.MAX_LIMIT}`)
      );
    }
    if (!Number.isInteger(offset) || offset < 0) {
      return err(invalidInput('offset', 'Must be a non-negative integer'));
    }
    return ok({ limit, offset });
  },
};
