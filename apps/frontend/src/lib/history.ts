/*
 * A chat's history as its window holds it: pages fetched as the viewer
 * reaches the top, and what arrives below while they read further up.
 */

/** How many messages a page of history holds. */
export const HISTORY_PAGE = 50;

interface Identified {
  readonly id: string;
}

/**
 * The chat's first message, if the page asked for before `before` reached
 * it: a page short of a whole one has nothing before it.
 */
export function firstFrom(
  page: readonly Identified[],
  before: string
): string | undefined {
  if (page.length >= HISTORY_PAGE) return undefined;
  return page[0]?.id ?? before;
}

/**
 * Whether there may be messages before those held: there are a whole page
 * or more, and they don't start at the chat's `first` message, once known.
 */
export function hasEarlier(
  messages: readonly Identified[],
  first: string | undefined
): boolean {
  return messages.length >= HISTORY_PAGE && messages[0]?.id !== first;
}

/**
 * How many messages from others came after `seenId`, the newest when the
 * viewer left the end of the history: what's waiting below them.
 */
export function arrivedSince(
  messages: readonly (Identified & { readonly sender: Identified })[],
  seenId: string,
  viewerId: string | undefined
): number {
  const seenAt = messages.findIndex(({ id }) => id === seenId);
  if (seenAt === -1) return 0;
  return messages
    .slice(seenAt + 1)
    .filter(({ sender }) => sender.id !== viewerId).length;
}
