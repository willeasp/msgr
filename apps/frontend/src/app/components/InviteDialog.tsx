import { useEffect, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import Button from '../../sacred/components/Button';
import { useModals } from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { LoadingState } from './LoadingState';
import { DialogButtons, MacDialog } from './MacDialog';
import { Muted } from './Muted';
import styles from './InviteDialog.module.css';

const CREATE_INVITE = gql(`
  mutation CreateInvite {
    createInvite {
      code
      expiresAt
    }
  }
`);

/** Makes a fresh single-use link as it opens. From File → Invite a Friend…. */
export function InviteDialog() {
  const { close } = useModals();
  const [copied, setCopied] = useState(false);
  const [createInvite, { data, error }] = useMutation(CREATE_INVITE);
  useHotkeys('Escape', () => close(), { enableOnFormTags: true });

  useEffect(() => {
    createInvite().catch(() => undefined);
  }, [createInvite]);

  const invite = data?.createInvite;
  const link = invite && `${window.location.origin}/invite/${invite.code}`;

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  return (
    <MacDialog title="Invite a Friend" modal>
      {error ? (
        <p>Could not make an invite. Try again in a moment.</p>
      ) : !link ? (
        <LoadingState label="Making a link" />
      ) : (
        <>
          <p>Send this link to one person. It works once.</p>
          <p className={styles.link}>{link}</p>
          <Muted>
            It expires on{' '}
            {new Date(invite.expiresAt).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
            .
          </Muted>
        </>
      )}
      <DialogButtons>
        {link && (
          <Button theme="SECONDARY" onClick={copy}>
            {copied ? 'Copied' : 'Copy Link'}
          </Button>
        )}
        <Button autoFocus onClick={() => close()}>
          Done
        </Button>
      </DialogButtons>
    </MacDialog>
  );
}
