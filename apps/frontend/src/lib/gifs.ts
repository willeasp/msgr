/*
 * GIFs from GIPHY, as the GIF dialog pages through them. GIPHY's pages can
 * overlap (what's trending moves while it's paged), so each GIF shows once.
 */

/** A page of GIFs, as the server sends it: whatever else it holds stays as it is. */
interface Paged {
  readonly gifs: readonly { readonly id: string }[];
}

/** The GIFs held with the page after them, each once, and the rest of that page (its cursor). */
export const withNextPage = <P extends Paged>(
  held: P,
  page: P
): Omit<P, 'gifs'> & { gifs: P['gifs'][number][] } => {
  const seen = new Set(held.gifs.map(({ id }) => id));
  return {
    ...page,
    gifs: [...held.gifs, ...page.gifs.filter(({ id }) => !seen.has(id))],
  };
};

/** What making a movie of a GIF says it's doing. */
export const makingLabel = ({
  stage,
  done,
  of,
}: {
  readonly stage: 'Fetching' | 'Reading' | 'Dithering';
  readonly done: number;
  readonly of: number;
}): string =>
  stage === 'Fetching'
    ? 'Fetching the GIF…'
    : of
    ? `${stage} frame ${done} of ${of}…`
    : `${stage}…`;
