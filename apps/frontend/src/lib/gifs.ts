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
