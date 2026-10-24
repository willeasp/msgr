import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { blank, isBlank, type Bits } from '@msgr/media';
import { gql } from '../../lib/__generated__';
import { identicon, pictureImage } from '../../lib/pixels';
import { toWire, type KeptPicture } from '../../lib/picture-wire';
import AlertBanner from '../../sacred/components/AlertBanner';
import Button from '../../sacred/components/Button';
import Input from '../../sacred/components/Input';
import {
  useModals,
  useModalStack,
} from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { pictures } from '../data/media';
import { ME } from '../data/me';
import { useInks } from '../hooks/use-inks';
import { usePicture } from '../hooks/use-picture';
import { PaintDialog } from './chat/PaintDialog';
import { firstPicture } from '../../lib/files';
import { pictureFromFile } from '../browser/picture-file';
import { DialogButtons, MacDialog } from './MacDialog';
import styles from './ProfileDialog.module.css';

const SIDE = 64;

/** The avatar as kept; a failure to read it is reported, never saved as none. */
async function kept(avatar: KeptPicture): Promise<Bits> {
  const bits = await pictures.at(avatar);
  if (!bits) throw new Error('Could not read your picture. Try again.');
  return bits;
}

const UPDATE_PROFILE = gql(`
  mutation UpdateProfile($name: String!, $avatar: PictureInput) {
    updateProfile(input: { name: $name, avatar: $avatar }) {
      id
      name
      avatar {
        width
        height
        url
      }
    }
  }
`);

/** Your name and picture, as everyone sees them. From File → Profile…. */
export function ProfileDialog() {
  const { open, close } = useModals();
  const modalStack = useModalStack();
  const { data } = useQuery(ME);
  const me = data?.me;
  const [name, setName] = useState(me?.name ?? '');
  // undefined until changed: the saved picture, inflated, stands.
  const [drawn, setDrawn] = useState<Bits | null | undefined>(undefined);
  const saved = usePicture(me?.avatar);
  const inks = useInks();
  const picture = drawn === undefined ? saved : drawn;
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [update] = useMutation(UPDATE_PROFILE);
  // From the click: reading the kept picture comes before the request.
  const [saving, setSaving] = useState(false);

  // Only while on top: Escape in the paint window above is the paint window's.
  const [depth] = useState(modalStack.length);
  useHotkeys('Escape', () => close(), {
    enableOnFormTags: true,
    enabled: modalStack.length === depth,
  });

  const take = (bits: Bits | null) => {
    setDrawn(bits);
    setError(null);
  };
  const draw = () =>
    open(PaintDialog, {
      title: 'Profile Picture',
      start: picture ?? blank(SIDE, SIDE),
      done: 'Use',
      onDone: take,
    });
  const choose = async (file: File) => {
    const bits = await pictureFromFile(file, { square: SIDE });
    if (!bits) setError('That file isn’t a picture this browser can open.');
    else if (isBlank(bits))
      setError('That picture comes out blank: nothing in it is dark.');
    else take(bits);
  };
  const save = () => {
    if (!me || saving) return;
    setError(null);
    setSaving(true);
    const send = async () => {
      // Saved together: an unchanged avatar is sent again as it is.
      const avatar =
        drawn === undefined ? me.avatar && (await kept(me.avatar)) : drawn;
      await update({
        variables: { name, avatar: avatar && (await toWire(avatar)) },
        // Kept before it's shown, so the viewer's new face never downloads.
        update: (_, { data }) => {
          const saved = data?.updateProfile.avatar;
          if (saved && avatar) pictures.keep(saved, avatar);
        },
      });
      close();
    };
    void send()
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not save. Try again.'
        )
      )
      .finally(() => setSaving(false));
  };

  return (
    <MacDialog title="Profile" modal>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className={styles.picture}>
          <img
            className={styles.preview}
            src={
              picture
                ? pictureImage(picture, inks.picture)
                : identicon(me?.id ?? '', inks.screen)
            }
            alt="Your face"
            data-picture={picture ? true : undefined}
            width={SIDE * 2}
            height={SIDE * 2}
          />
          <div className={styles.choices}>
            <Button theme="SECONDARY" type="button" onClick={draw}>
              Draw…
            </Button>
            <Button
              theme="SECONDARY"
              type="button"
              onClick={() => fileRef.current?.click()}
            >
              Picture…
            </Button>
            {picture ? (
              <Button
                theme="SECONDARY"
                type="button"
                onClick={() => take(null)}
              >
                Remove
              </Button>
            ) : (
              <Button theme="SECONDARY" type="button" isDisabled>
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className={styles.hidden}
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = firstPicture(e.target.files);
              e.target.value = '';
              if (file) void choose(file);
            }}
          />
        </div>
        <Input
          label="Name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <div role="alert" className={styles.error}>
            <AlertBanner>{error}</AlertBanner>
          </div>
        )}
        <DialogButtons>
          <Button theme="SECONDARY" type="button" onClick={() => close()}>
            Cancel
          </Button>
          {saving || !me ? (
            <Button isDisabled>Save</Button>
          ) : (
            <Button type="submit">Save</Button>
          )}
        </DialogButtons>
      </form>
    </MacDialog>
  );
}
