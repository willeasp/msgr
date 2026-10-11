import type { CSSProperties } from 'react';
import { useQuery } from '@apollo/client/react';
import { fromBase64 } from '@msgr/bitmap';
import { gql } from '../../../lib/__generated__';
import { bitmapOf, svgMask } from '../../../lib/pixels';
import { DOCUMENT } from '../icons';
import { PixelIcon } from '../PixelIcon';
import { PixelText } from '../PixelText';
import styles from './LinkPreviewCard.module.css';

const LINK_PREVIEW = gql(`
  query LinkPreview($messageId: ID!) {
    linkPreview(messageId: $messageId) {
      url
      site
      title
      description
      thumbnail
    }
  }
`);

const THUMBNAIL_SIZE = 64;

/**
 * The card for the first link in a message, as our server read the page: its
 * picture as a dithered thumbnail, its site, title and description. Nothing
 * until it arrives, or when the page can't be previewed.
 */
export function LinkPreviewCard({ messageId }: { messageId: string }) {
  const { data } = useQuery(LINK_PREVIEW, { variables: { messageId } });
  const preview = data?.linkPreview;
  if (!preview) return null;

  return (
    <a
      className={styles.card}
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {preview.thumbnail ? (
        <span
          className={styles.thumbnail}
          style={
            {
              '--thumbnail': svgMask(
                bitmapOf({
                  width: THUMBNAIL_SIZE,
                  height: THUMBNAIL_SIZE,
                  bytes: fromBase64(preview.thumbnail) ?? new Uint8Array(),
                })
              ),
            } as CSSProperties
          }
          aria-hidden
        />
      ) : (
        <span className={styles.icon} aria-hidden>
          <PixelIcon bitmap={DOCUMENT} scale={4} />
        </span>
      )}
      <span className={styles.text}>
        <span className={styles.site}>
          <PixelText text={preview.site} />
        </span>
        <span className={styles.title}>
          <PixelText text={preview.title} />
        </span>
        {preview.description && (
          <span className={styles.description}>
            <PixelText text={preview.description} />
          </span>
        )}
      </span>
    </a>
  );
}
