// Theme the first paint. Mirrors loadTheme() in src/lib/theme.ts, which
// validates and re-applies it once the app boots.
(function () {
  let theme = {};
  try {
    theme = JSON.parse(localStorage.getItem('theme')) || {};
  } catch {
    // Unreadable: use the system's mode.
  }
  const dark = theme.mode
    ? theme.mode === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.className =
    'theme-' +
    (dark ? 'dark' : 'light') +
    (theme.tint ? ' tint-' + theme.tint : '');
})();
