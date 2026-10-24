/**
 * The number on Msgr's icon, where the browser draws one (an installed app's
 * Home Screen or Dock icon): how many messages wait unread. The service
 * worker sets it too, from each push (public/sw.js).
 */
export function showBadge(count: number): void {
  if (!('setAppBadge' in navigator)) return;
  (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(
    // Not an installed app, or not allowed: there's no icon to badge.
    () => undefined
  );
}
