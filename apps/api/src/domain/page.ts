import { invalidInput, type InvalidInput } from './errors.js';
import { MessageId } from './message.js';
import { err, ok, type Result } from './result.js';

/**
 * A window into a newest-first history: its newest `limit` items, or those
 * just older than `before`, or the newest `limit` of those newer than
 * `after`. `offset` skips that many of the newest first; `before` replaces
 * it, since a history that grows while it's read shifts every offset.
 */
export interface Page {
  readonly limit: number;
  readonly offset: number;
  readonly before: MessageId | null;
  readonly after: MessageId | null;
}

export const Page = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  /** Missing or `null` arguments fall back to defaults; out-of-range ones are rejected. */
  parse(args: {
    readonly limit?: number | null;
    readonly offset?: number | null;
    readonly before?: string | null;
    readonly after?: string | null;
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
    const before = args.before ?? null;
    const after = args.after ?? null;
    if (before !== null && after !== null) {
      return err(invalidInput('after', 'Ask for before or after, not both'));
    }
    if ((before !== null || after !== null) && offset !== 0) {
      return err(invalidInput('offset', 'A cursor and an offset never mix'));
    }
    return ok({
      limit,
      offset,
      before: before === null ? null : MessageId(before),
      after: after === null ? null : MessageId(after),
    });
  },
};
