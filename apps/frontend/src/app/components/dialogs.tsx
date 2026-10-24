import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';

/*
 * Every dialog, loaded the first time it opens rather than with the app, so
 * a first visit downloads only what draws the desktop. They're fetched as
 * soon as the page is idle anyway (`prefetchDialogs`), and the shell keeps
 * them all on the device (public/sw.js), so opening one doesn't wait on the
 * network. Open them as ever: `useModals().open(PaintDialog, props)`.
 */

const loaders: (() => Promise<unknown>)[] = [];

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
      <Suspense fallback={null}>
        <Loaded {...props} />
      </Suspense>
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
  for (const load of loaders) void load();
}
