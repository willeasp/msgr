import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import ActionListItem from '../../../sacred/components/ActionListItem';
import Button from '../../../sacred/components/Button';
import Input from '../../../sacred/components/Input';
import RowSpaceBetween from '../../../sacred/components/RowSpaceBetween';
import OutsideElementEvent from '../../../sacred/components/detectors/OutsideElementEvent';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../../sacred/modules/hotkeys';
import { LoadingState } from '../LoadingState';
import { DialogButtons, MacDialog } from '../MacDialog';
import { Muted } from '../Muted';
import { GET_CHAT_DATA } from './ChatWindow';
import { SEARCH_USERS } from './NewChatModal';
import styles from './NewChatModal.module.css';
import { PixelText } from '../PixelText';

const ADD_TO_CHANNEL = gql(`
  mutation AddToChannel($chatId: ID!, $userIds: [ID!]!) {
    addToChannel(chatId: $chatId, userIds: $userIds) {
      id
      participants {
        id
        name
        email
      }
    }
  }
`);

const MIN_QUERY_LENGTH = 2;

/** Puts people in a channel; each is told who added them. From File → Add People…. */
export function AddPeopleDialog({ chatId }: { chatId: string }) {
  const { close } = useModals();
  const [query, setQuery] = useState('');
  const isSearching = query.length >= MIN_QUERY_LENGTH;
  useHotkeys('Escape', () => close(), { enableOnFormTags: true });

  const { data: chatData } = useQuery(GET_CHAT_DATA, {
    variables: { chatId },
  });
  const { data: searchData, loading: searching } = useQuery(SEARCH_USERS, {
    variables: { query },
    skip: !isSearching,
  });
  // The result updates the cached chat, so its window and the ✓ marks follow.
  const [addToChannel] = useMutation(ADD_TO_CHANNEL);

  const title = chatData?.chat?.title ?? 'the channel';
  const members = new Set(chatData?.chat?.participants.map(({ id }) => id));
  const users = searchData?.users ?? [];

  return (
    <OutsideElementEvent onOutsideEvent={() => close()}>
      <MacDialog title={`Add People to ${title}`} modal>
        <Input
          label="Find someone to add"
          name="add_people_search"
          placeholder="Name or email"
          autoComplete="off"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.results}>
          {!isSearching ? (
            <Muted>
              Type at least {MIN_QUERY_LENGTH} letters, then press ↓ to choose.
            </Muted>
          ) : searching && !searchData ? (
            <LoadingState label="Searching" />
          ) : users.length > 0 ? (
            users.map((user) => {
              const inChannel = members.has(user.id);
              return (
                <ActionListItem
                  key={user.id}
                  icon={inChannel ? '✓' : ''}
                  onClick={() => {
                    if (!inChannel) {
                      addToChannel({
                        variables: { chatId, userIds: [user.id] },
                      });
                    }
                  }}
                >
                  <RowSpaceBetween style={{ width: '100%', gap: '2ch' }}>
                    <span className={styles.name}>
                      <PixelText text={user.name} />
                    </span>
                    <Muted>{inChannel ? 'In the channel' : user.email}</Muted>
                  </RowSpaceBetween>
                </ActionListItem>
              );
            })
          ) : (
            <Muted>No one matches “{query}”.</Muted>
          )}
        </div>
        <DialogButtons>
          <Button onClick={() => close()}>Done</Button>
        </DialogButtons>
      </MacDialog>
    </OutsideElementEvent>
  );
}
