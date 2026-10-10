import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
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
import { GET_CHATS } from './ChatSidebar';
import styles from './NewChatModal.module.css';
import { PixelText } from '../PixelText';

export const SEARCH_USERS = gql(`
  query SearchUsers($query: String!) {
    users(query: $query) {
      id
      name
      email
    }
  }
`);

const FIND_OR_CREATE_CHAT = gql(`
  mutation FindOrCreateChat($participantId: ID!) {
    findOrCreateChat(participantId: $participantId) {
      id
      title
      participants {
        id
        name
      }
    }
  }
`);

const MIN_QUERY_LENGTH = 2;

/** Opened through Sacred's modal stack: `useModals().open(NewChatModal, {})`. */
export function NewChatModal() {
  const { close } = useModals();
  const navigate = useNavigate();
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const isSearching = userSearchQuery.length >= MIN_QUERY_LENGTH;

  const { data: searchData, loading: searching } = useQuery(SEARCH_USERS, {
    variables: { query: userSearchQuery },
    skip: !isSearching,
  });

  const [findOrCreateChat] = useMutation(FIND_OR_CREATE_CHAT, {
    refetchQueries: [{ query: GET_CHATS }],
    onCompleted: (data) => {
      close();
      navigate(`/${data.findOrCreateChat.id}`);
    },
  });

  useHotkeys('Escape', () => close(), { enableOnFormTags: true });

  const users = searchData?.users ?? [];

  return (
    <OutsideElementEvent onOutsideEvent={() => close()}>
      <MacDialog title="New Chat" modal>
        <Input
          label="Find someone to message"
          name="user_search"
          placeholder="Name or email"
          autoComplete="off"
          autoFocus
          value={userSearchQuery}
          onChange={(e) => setUserSearchQuery(e.target.value)}
        />
        <div className={styles.results}>
          {!isSearching ? (
            <Muted>
              Type at least {MIN_QUERY_LENGTH} letters, then press ↓ to choose.
            </Muted>
          ) : searching && !searchData ? (
            <LoadingState label="Searching" />
          ) : users.length > 0 ? (
            users.map((user) => (
              <ActionListItem
                key={user.id}
                onClick={() =>
                  findOrCreateChat({ variables: { participantId: user.id } })
                }
              >
                <RowSpaceBetween style={{ width: '100%', gap: '2ch' }}>
                  <span className={styles.name}>
                    <PixelText text={user.name} />
                  </span>
                  <Muted>{user.email}</Muted>
                </RowSpaceBetween>
              </ActionListItem>
            ))
          ) : (
            <Muted>No one matches “{userSearchQuery}”.</Muted>
          )}
        </div>
        <DialogButtons>
          <Button theme="SECONDARY" onClick={() => close()}>
            Cancel
          </Button>
        </DialogButtons>
      </MacDialog>
    </OutsideElementEvent>
  );
}
