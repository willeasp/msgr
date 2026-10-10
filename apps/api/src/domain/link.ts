import type { Brand } from './brand.js';

/** An absolute http(s) URL, normalised, at most MAX_LENGTH characters. */
export type Url = Brand<string, 'Url'>;
export const Url = {
  MAX_LENGTH: 2048,
  /** `raw`, resolved against `base` if given; null for anything else. */
  parse(raw: string, base?: string): Url | null {
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.href.length > Url.MAX_LENGTH) return null;
    return url.href as Url;
  },
};

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

/** The first http(s) link in text, as people write them in sentences. */
export function firstLink(text: string): Url | null {
  for (const [candidate] of text.matchAll(LINK)) {
    const url = Url.parse(trimLink(candidate));
    if (url) return url;
  }
  return null;
}
