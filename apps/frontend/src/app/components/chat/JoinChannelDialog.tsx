import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import ActionListItem from '../../../sacred/components/ActionListItem';
import AlertBanner from '../../../sacred/components/AlertBanner';
import Button from '../../../sacred/components/Button';
import Input from '../../../sacred/components/Input';
import RowSpaceBetween from '../../../sacred/components/RowSpaceBetween';
import OutsideElementEvent from '../../../sacred/components/detectors/OutsideElementEvent';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../../sacred/modules/hotkeys';
import { DialogButtons, MacDialog } from '../MacDialog';
import { Muted } from '../Muted';
import { useJoinChannel } from './use-join-channel';
import styles from './JoinChannelDialog.module.css';

const CHANNELS = gql(`
  query Channels {
    channels {
      name
      participantCount
      joined
    }
  }
`);

/** Browse channels, or name a new one. From File → Join Channel…. */
export function JoinChannelDialog() {
  const { close } = useModals();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery(CHANNELS, { fetchPolicy: 'cache-and-network' });
  const { join, joining } = useJoinChannel();
  useHotkeys('Escape', () => close(), { enableOnFormTags: true });

  const typed = name.trim().replace(/^#/, '').toLowerCase();
  const channels = (data?.channels ?? []).filter((channel) =>
    channel.name.includes(typed)
  );
  const isNew = typed !== '' && !channels.some((c) => c.name === typed);

  const joinAndClose = async (channel: string) => {
    setError(null);
    const failure = await join(channel);
    if (failure) setError(failure);
    else close();
  };

  return (
    <OutsideElementEvent onOutsideEvent={() => close()}>
      <MacDialog title="Join a Channel" modal>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (typed) joinAndClose(name);
          }}
        >
          <Input
            label="Channel"
            name="channel"
            placeholder="#general"
            autoComplete="off"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {error && (
            <div role="alert" className={styles.error}>
              <AlertBanner>{error}</AlertBanner>
            </div>
          )}
          <div className={styles.list}>
            {channels.map((channel) => (
              <ActionListItem
                key={channel.name}
                icon={channel.joined ? '✓' : ''}
                onClick={() => joinAndClose(channel.name)}
              >
                <RowSpaceBetween style={{ width: '100%', gap: '2ch' }}>
                  <span className={styles.name}>#{channel.name}</span>
                  <Muted>
                    {channel.participantCount}{' '}
                    {channel.participantCount === 1 ? 'member' : 'members'}
                  </Muted>
                </RowSpaceBetween>
              </ActionListItem>
            ))}
            {data && channels.length === 0 && !isNew && (
              <Muted>No channels yet. Type a name to start one.</Muted>
            )}
            {isNew && <Muted>Return starts #{typed}.</Muted>}
          </div>
          <DialogButtons>
            <Button theme="SECONDARY" type="button" onClick={() => close()}>
              Cancel
            </Button>
            {joining ? (
              <Button isDisabled>Joining</Button>
            ) : (
              <Button type="submit">Join</Button>
            )}
          </DialogButtons>
        </form>
      </MacDialog>
    </OutsideElementEvent>
  );
}
