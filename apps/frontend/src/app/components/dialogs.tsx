import {
  Component,
  lazy,
  Suspense,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import Button from '../../sacred/components/Button';
import { useModals } from '../../sacred/components/page/ModalContext';
import { BOMB } from './icons';
import { DialogButtons, DialogMessage, MacDialog } from './MacDialog';
import { Muted } from './Muted';

/*
 * Every dialog, loaded the first time it opens rather than with the app, so
 * a first visit downloads only what draws the desktop. They're fetched as
 * soon as the page is idle anyway (`prefetchDialogs`), and the shell keeps
 * them all on the device (public/sw.js), so opening one doesn't wait on the
 * network. Open them as ever: `useModals().open(PaintDialog, props)`.
 */

const loaders: (() => Promise<unknown>)[] = [];

/**
 * What a part of Msgr that couldn't be fetched shows instead. Most likely
 * it's from a version since replaced: a page the shell doesn't keep (the
 * first visit, a forced reload) asks the server, which has only the newest.
 */
function CantLoad({ closable }: { closable: boolean }) {
  const { close } = useModals();
  return (
    <MacDialog title="Msgr" modal>
      <DialogMessage icon={BOMB}>
        <p>This couldn’t be opened.</p>
        <Muted>Msgr may have been updated since this page opened.</Muted>
      </DialogMessage>
      <DialogButtons>
        {closable && (
          <Button theme="SECONDARY" onClick={() => close()}>
            Cancel
          </Button>
        )}
        <Button autoFocus onClick={() => window.location.reload()}>
          Reload
        </Button>
      </DialogButtons>
    </MacDialog>
  );
}

class LoadFailed extends Component<
  { children: ReactNode; closable: boolean },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <CantLoad closable={this.props.closable} />
    ) : (
      this.props.children
    );
  }
}

/** A page that loads the first time it shows (`lazy`), or says it couldn't. */
export function Later({ children }: { children: ReactNode }) {
  return (
    <LoadFailed closable={false}>
      <Suspense fallback={null}>{children}</Suspense>
    </LoadFailed>
  );
}

/** A dialog that loads itself; a dialog opened over it never hides it. */
function dialog<P extends object>(
  load: () => Promise<ComponentType<P>>
): (props: P) => ReactElement {
  loaders.push(load);
  const Loaded = lazy(() =>
    load().then((component) => ({ default: component }))
  );
  return function Dialog(props: P) {
    return (
      <LoadFailed closable>
        <Suspense fallback={null}>
          <Loaded {...props} />
        </Suspense>
      </LoadFailed>
    );
  };
}

export const AboutDialog = dialog(() =>
  import('./AboutDialog').then((m) => m.AboutDialog)
);
export const AddPeopleDialog = dialog(() =>
  import('./chat/AddPeopleDialog').then((m) => m.AddPeopleDialog)
);
export const GetInfoDialog = dialog(() =>
  import('./chat/GetInfoDialog').then((m) => m.GetInfoDialog)
);
export const InviteDialog = dialog(() =>
  import('./InviteDialog').then((m) => m.InviteDialog)
);
export const JoinChannelDialog = dialog(() =>
  import('./chat/JoinChannelDialog').then((m) => m.JoinChannelDialog)
);
export const NewChatModal = dialog(() =>
  import('./chat/NewChatModal').then((m) => m.NewChatModal)
);
export const NotificationsBlockedDialog = dialog(() =>
  import('./NotificationsBlockedDialog').then(
    (m) => m.NotificationsBlockedDialog
  )
);
export const NotificationsDialog = dialog(() =>
  import('./NotificationsDialog').then((m) => m.NotificationsDialog)
);
export const PaintDialog = dialog(() =>
  import('./chat/PaintDialog').then((m) => m.PaintDialog)
);
export const ProfileDialog = dialog(() =>
  import('./ProfileDialog').then((m) => m.ProfileDialog)
);
export const SoundDialog = dialog(() =>
  import('./chat/SoundDialog').then((m) => m.SoundDialog)
);
export const TrimDialog = dialog(() =>
  import('./chat/TrimDialog').then((m) => m.TrimDialog)
);

/** Fetches every dialog, for when the page has nothing better to do. */
export function prefetchDialogs(): void {
  // One that fails is tried again when it's opened, and says so if it fails then.
  for (const load of loaders) void load().catch(() => undefined);
}
