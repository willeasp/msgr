import { useQuery } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import {
  chatPlace,
  messageKind,
  messageName,
  messageSize,
  readers,
  type Reader,
} from '../../../lib/info';
import { formatStamp } from '../../../lib/time';
import Button from '../../../sacred/components/Button';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../../sacred/modules/hotkeys';
import { ME } from '../../data/me';
import { useClock } from '../../hooks/use-clock';
import { Face } from '../Face';
import {
  MOVIE_DOCUMENT,
  PICTURE_DOCUMENT,
  SOUND_DOCUMENT,
  TEXT_DOCUMENT,
} from '../icons';
import { LoadingState } from '../LoadingState';
import { DialogButtons, MacDialog } from '../MacDialog';
import { Muted } from '../Muted';
import { PixelIcon } from '../PixelIcon';
import { PixelText } from '../PixelText';
import styles from './GetInfoDialog.module.css';

// The picture's and movie's sizes and the sound's length only: the cache
// merges them, keeping the bits the history read.
const MESSAGE_INFO = gql(`
  query MessageInfo($id: ID!) {
    message(id: $id) {
      id
      content
      picture {
        width
        height
      }
      movie {
        width
        height
        frames
      }
      sound {
        frames
      }
      createdAt
      sender {
        id
        name
      }
      chat {
        id
        kind
        title
        counterpart {
          id
          name
        }
        participants {
          id
          name
          avatar {
            width
            height
            url
          }
        }
      }
    }
  }
`);

// Polled on its own, so the poll doesn't fetch the chat's people again.
const MESSAGE_READS = gql(`
  query MessageReads($id: ID!) {
    message(id: $id) {
      id
      readBy {
        at
        reader {
          id
          name
          avatar {
            width
            height
            url
          }
        }
      }
    }
  }
`);

/** While it's open, reads come in as people get to the message. */
const POLL_MS = 10_000;

/**
 * Get Info on a message, as Finder has it on a file: its kind and size,
 * where it was sent and when, and who has read it, and when.
 */
export function GetInfoDialog({ messageId }: { messageId: string }) {
  const { close } = useModals();
  useHotkeys('Escape', () => close(), { enableOnFormTags: true });
  const now = useClock();
  const { data: me } = useQuery(ME);
  const { data, loading } = useQuery(MESSAGE_INFO, {
    variables: { id: messageId },
    fetchPolicy: 'cache-and-network',
  });
  const { data: reads } = useQuery(MESSAGE_READS, {
    variables: { id: messageId },
    fetchPolicy: 'cache-and-network',
    pollInterval: POLL_MS,
  });
  const message = data?.message;

  return (
    <MacDialog title="Message Info" modal>
      {!message ? (
        loading ? (
          <LoadingState label="Getting info" />
        ) : (
          <p className={styles.gone}>This message can’t be found.</p>
        )
      ) : (
        <>
          <div className={styles.head}>
            <PixelIcon
              bitmap={
                message.movie
                  ? MOVIE_DOCUMENT
                  : message.sound
                  ? SOUND_DOCUMENT
                  : message.picture
                  ? PICTURE_DOCUMENT
                  : TEXT_DOCUMENT
              }
              scale={2}
            />
            <h3 className={styles.name}>
              <PixelText text={messageName(message)} />
            </h3>
          </div>
          <dl className={styles.facts}>
            <dt>Kind:</dt>
            <dd>{messageKind(message)}</dd>
            <dt>Size:</dt>
            <dd>{messageSize(message)}</dd>
            <dt>Where:</dt>
            <dd>
              <PixelText text={chatPlace(message.chat)} />
            </dd>
          </dl>
          <dl className={styles.facts}>
            <dt>From:</dt>
            <dd>
              <PixelText text={message.sender.name} />
            </dd>
            <dt>Sent:</dt>
            <dd>
              <time dateTime={message.createdAt}>
                {formatStamp(message.createdAt, now)}
              </time>
            </dd>
          </dl>
          <section className={styles.reads} aria-label="Read by">
            <h4 className={styles.heading}>Read by:</h4>
            {reads?.message ? (
              <ReadList
                readers={readers({
                  senderId: message.sender.id,
                  participants: message.chat.participants,
                  readBy: reads.message.readBy,
                })}
                viewerId={me?.me?.id}
                now={now}
              />
            ) : (
              <LoadingState label="Getting reads" />
            )}
          </section>
        </>
      )}
      <DialogButtons>
        <Button autoFocus onClick={() => close()}>
          OK
        </Button>
      </DialogButtons>
    </MacDialog>
  );
}

type Person = Parameters<typeof Face>[0]['person'] & { name: string };

function ReadList({
  readers,
  viewerId,
  now,
}: {
  readers: readonly Reader<Person>[];
  viewerId: string | undefined;
  now: Date;
}) {
  if (readers.length === 0) {
    return (
      <p className={styles.nobody}>
        <Muted>Nobody else is in this chat.</Muted>
      </p>
    );
  }
  return (
    <ul className={styles.list}>
      {readers.map(({ person, at }) => (
        <li key={person.id} className={styles.reader}>
          <Face person={person} />
          <span className={styles.who}>
            <PixelText
              text={
                person.id === viewerId ? `${person.name} (you)` : person.name
              }
            />
          </span>
          {at ? (
            <time className={styles.when} dateTime={at}>
              {formatStamp(at, now)}
            </time>
          ) : (
            <span className={styles.when}>
              <Muted>Not yet</Muted>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
