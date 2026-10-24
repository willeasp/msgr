import { useQuery } from '@apollo/client/react';
import Button from '../../../sacred/components/Button';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../../sacred/modules/hotkeys';
import { ChatKind } from '../../../lib/__generated__/graphql';
import { GET_CHAT_DATA } from '../../data/chats';
import { useOnTop } from '../dialogs';
import { Face } from '../Face';
import { DialogButtons, MacDialog } from '../MacDialog';
import { Muted } from '../Muted';
import { PixelText } from '../PixelText';
import styles from './ChatInfoDialog.module.css';

export interface ChatInfoDialogProps {
  chatId: string;
  /** Given for channels, which can take more people. */
  onAddPeople?: () => void;
}

/** A chat's people, from Info in a phone's title bar, where the info line has no room for them. */
export function ChatInfoDialog({ chatId, onAddPeople }: ChatInfoDialogProps) {
  const { close } = useModals();
  // Add People opens over this; its Escape is its own.
  const onTop = useOnTop();
  useHotkeys('Escape', () => onTop && close(), { enableOnFormTags: true });
  const { data } = useQuery(GET_CHAT_DATA, { variables: { chatId } });
  const chat = data?.chat;
  const people = chat?.participants ?? [];
  const [one, many] =
    chat?.kind === ChatKind.Channel
      ? ['member', 'members']
      : ['person', 'people'];

  return (
    <MacDialog title={chat?.title ?? 'Chat'} modal>
      <Muted>
        {people.length} {people.length === 1 ? one : many}
      </Muted>
      <ul className={styles.people} aria-label="People">
        {people.map((person) => (
          <li key={person.id}>
            <Face person={person} />
            <PixelText text={person.name} />
          </li>
        ))}
      </ul>
      <DialogButtons>
        {onAddPeople && (
          <Button theme="SECONDARY" onClick={onAddPeople}>
            Add People…
          </Button>
        )}
        <Button autoFocus onClick={() => close()}>
          Done
        </Button>
      </DialogButtons>
    </MacDialog>
  );
}
