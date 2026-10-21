/** How long "is typing" shows after someone last said so. */
export const TYPING_SHOWS_MS = 6000;
/** How often someone writing says so again: well inside TYPING_SHOWS_MS. */
export const TYPING_REPEATS_MS = 3000;

/** Someone writing to a chat, shown until `until` (ms since the epoch). */
export interface Typist {
  readonly chatId: string;
  readonly id: string;
  readonly name: string;
  readonly until: number;
}

/** What the server says: someone is writing to a chat. */
export interface TypingEvent {
  readonly chatId: string;
  readonly user: { readonly id: string; readonly name: string };
}

/** Everyone still typing as of `now`. */
export const stillTyping = (
  typists: readonly Typist[],
  now: number
): Typist[] => typists.filter(({ until }) => until > now);

/** Someone said they're typing: they show a while longer, in their place in line. */
export function withTypist(
  typists: readonly Typist[],
  { chatId, user }: TypingEvent,
  now: number
): Typist[] {
  const typist = {
    chatId,
    id: user.id,
    name: user.name,
    until: now + TYPING_SHOWS_MS,
  };
  const current = stillTyping(typists, now);
  const known = current.some((t) => t.chatId === chatId && t.id === user.id);
  return known
    ? current.map((t) => (t.chatId === chatId && t.id === user.id ? typist : t))
    : [...current, typist];
}

/** Their message arrived: they've stopped typing to that chat. */
export const withoutTypist = (
  typists: readonly Typist[],
  chatId: string,
  userId: string
): Typist[] => typists.filter((t) => !(t.chatId === chatId && t.id === userId));

/** When the next of them stops showing; null when nobody's typing. */
export const nextExpiry = (typists: readonly Typist[]): number | null =>
  typists.length === 0 ? null : Math.min(...typists.map(({ until }) => until));

/** The names typing to a chat, first to start first. */
export const typingIn = (
  typists: readonly Typist[],
  chatId: string
): string[] =>
  typists.filter((t) => t.chatId === chatId).map(({ name }) => name);

/** "Ana is typing…", "Ana and Bo are typing…", "Ana and 2 others are typing…". */
export function typingLine(names: readonly string[]): string | null {
  const [first, second] = names;
  if (first === undefined) return null;
  if (second === undefined) return `${first} is typing…`;
  if (names.length === 2) return `${first} and ${second} are typing…`;
  return `${first} and ${names.length - 1} others are typing…`;
}

/**
 * Whether the composer should tell the chat its writer is typing: there's a
 * message under way, not a command, and it hasn't said so lately.
 */
export function shouldSayTyping(
  text: string,
  lastSaid: number | null,
  now: number
): boolean {
  const written = text.trim();
  if (written === '' || written.startsWith('/')) return false;
  return lastSaid === null || now - lastSaid >= TYPING_REPEATS_MS;
}
