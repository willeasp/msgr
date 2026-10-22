// Theme the first paint, and the browser's bars around it. Mirrors loadTheme()
// and applyTheme() (src/app/browser/theme.ts), which validate and re-apply it
// once the app boots.
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
  const paper = getComputedStyle(document.body).getPropertyValue('--paper');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && paper) meta.setAttribute('content', paper.trim());
})();
