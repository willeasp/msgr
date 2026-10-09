/** A message box line that does something instead of being sent. */
export type Command = { type: 'join'; channel: string };

/** IRC-style: "/join #general". Anything else is an ordinary message. */
export function parseCommand(text: string): Command | null {
  const join = /^\/join\s+#?(\S.*)$/i.exec(text.trim());
  return join?.[1] ? { type: 'join', channel: join[1].trim() } : null;
}
