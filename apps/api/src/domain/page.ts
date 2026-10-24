import { invalidInput, type InvalidInput } from './errors.js';
import { MessageId } from './message.js';
import { err, ok, type Result } from './result.js';

/**
 * A window into a newest-first history, at most `limit` long: its newest
 * items, `offset` back; or those just older than one of its messages
 * (`before`); or the newest of those newer than one (`after`). A cursor
 * replaces the offset, since a history that grows while it's read shifts
 * every offset.
 */
export type Page = { readonly limit: number } & (
  | { readonly kind: 'newest'; readonly offset: number }
  | { readonly kind: 'before' | 'after'; readonly cursor: MessageId }
);

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
    if (before === null && after === null) {
      return ok({ limit, kind: 'newest', offset });
    }
    if (before !== null && after !== null) {
      return err(invalidInput('after', 'Ask for before or after, not both'));
    }
    if (offset !== 0) {
      return err(invalidInput('offset', 'A cursor and an offset never mix'));
    }
    const [kind, cursor] =
      before !== null
        ? (['before', before] as const)
        : (['after', after ?? ''] as const);
    if (cursor === '') return err(invalidInput(kind, 'Must be a message id'));
    return ok({ limit, kind, cursor: MessageId(cursor) });
  },
  /** The same for the same page, and different for any other. */
  key: (page: Page): string =>
    JSON.stringify(
      page.kind === 'newest'
        ? [page.limit, page.kind, page.offset]
        : [page.limit, page.kind, page.cursor]
    ),
};
