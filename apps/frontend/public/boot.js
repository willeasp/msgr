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
  // As #rrggbb, which every browser's bars take: see paperHex().
  const pen = document
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!pen || !meta) return;
  pen.fillStyle = 'transparent';
  pen.fillStyle = getComputedStyle(document.body).backgroundColor;
  pen.fillRect(0, 0, 1, 1);
  const [r, g, b, alpha] = pen.getImageData(0, 0, 1, 1).data;
  if (alpha !== 255) return;
  meta.setAttribute(
    'content',
    '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
  );
})();
