import {
  Component,
  createContext,
  lazy,
  Suspense,
  useContext,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { isLoadFailure } from '../../lib/loading';
import Button from '../../sacred/components/Button';
import {
  useModals,
  useModalStack,
} from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { BOMB } from './icons';
import { DialogButtons, DialogMessage, MacDialog } from './MacDialog';
import { Muted } from './Muted';

/*
 * Every dialog, loaded the first time it opens rather than with the app, so
 * a visit parses and runs only what draws the desktop. The shell still
 * fetches them all once, to keep on the device (public/sw.js); from it,
 * they're fetched again as soon as the page is idle (`prefetchDialogs`), so
 * opening one waits on nothing. Open them as ever:
 * `useModals().open(PaintDialog, props)`.
 */

const loaders: (() => Promise<unknown>)[] = [];

/** How deep in the stack of dialogs this one opened: the first is 1. */
const Depth = createContext(0);

/** Whether this dialog is the topmost open, which alone answers Escape. */
export function useOnTop(): boolean {
  return useModalStack().length === useContext(Depth);
}

/**
 * What a part of Msgr that couldn't be fetched shows instead. Most likely
 * it's from a version since replaced: a page the shell doesn't keep (the
 * first visit, a forced reload) asks the server, which has only the newest.
 * A browser keeps a failed fetch failed for the page, so only a reload helps.
 */
function CantLoad({ closable }: { closable: boolean }) {
  const { close } = useModals();
  const onTop = useOnTop();
  useHotkeys('Escape', () => close(), {
    enabled: closable && onTop,
    enableOnFormTags: true,
  });
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

/** Says when a part couldn't be loaded; any other error is a bug, and goes on up. */
type Loading = { failed: false } | { failed: true; error: unknown };

class LoadFailed extends Component<
  { children: ReactNode; closable: boolean },
  Loading
> {
  override state: Loading = { failed: false };
  static getDerivedStateFromError(error: unknown): Loading {
    return { failed: true, error };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    if (!isLoadFailure(this.state.error)) throw this.state.error;
    return <CantLoad closable={this.props.closable} />;
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

/** A dialog as it opens: its place in the stack, then itself once loaded. */
function Opening<P extends object>({
  dialog: Loaded,
  props,
}: {
  dialog: LazyExoticComponent<ComponentType<P>>;
  props: P;
}) {
  // Where it opened, however long it takes to load and whatever opens meanwhile.
  const [depth] = useState(useModalStack().length);
  return (
    <Depth.Provider value={depth}>
      <LoadFailed closable>
        <Suspense fallback={null}>
          <Loaded {...props} />
        </Suspense>
      </LoadFailed>
    </Depth.Provider>
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
  return (props: P) => <Opening dialog={Loaded} props={props} />;
}

export const AboutDialog = dialog(() =>
  import('./AboutDialog').then((m) => m.AboutDialog)
);
export const AddPeopleDialog = dialog(() =>
  import('./chat/AddPeopleDialog').then((m) => m.AddPeopleDialog)
);
export const ChatInfoDialog = dialog(() =>
  import('./chat/ChatInfoDialog').then((m) => m.ChatInfoDialog)
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

/**
 * Fetches every dialog, for when the page has nothing better to do: only
 * from the shell, since one that failed would stay failed for the page.
 */
export function prefetchDialogs(): void {
  for (const load of loaders) void load().catch(() => undefined);
}
