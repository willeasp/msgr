/** Text cut into plain runs and the links in it. */
export type LinkPiece = { readonly text: string } | { readonly link: string };

const LINK = /https?:\/\/[^\s<>"]+/gi;
const TRAILING = /[.,!?;:'"]+$/;
const count = (text: string, char: string) => text.split(char).length - 1;

/** Without trailing punctuation, or a closing parenthesis the link didn't open. */
function trimLink(candidate: string): string {
  let link = candidate.replace(TRAILING, '');
  while (link.endsWith(')') && count(link, '(') < count(link, ')')) {
    link = link.slice(0, -1).replace(TRAILING, '');
  }
  return link;
}

const isUrl = (link: string) => {
  try {
    return new URL(link).hostname !== '';
  } catch {
    return false;
  }
};

/** The http(s) links in text, the way the server finds them (domain/link.ts). */
export function splitLinks(text: string): LinkPiece[] {
  const pieces: LinkPiece[] = [];
  let at = 0;
  for (const match of text.matchAll(LINK)) {
    const link = trimLink(match[0]);
    if (!isUrl(link)) continue;
    if (match.index > at) pieces.push({ text: text.slice(at, match.index) });
    pieces.push({ link });
    at = match.index + link.length;
  }
  if (at < text.length) pieces.push({ text: text.slice(at) });
  return pieces;
}

export function firstLink(text: string): string | null {
  for (const piece of splitLinks(text)) if ('link' in piece) return piece.link;
  return null;
}
