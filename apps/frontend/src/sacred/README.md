# Sacred Computer (vendored)

The frontend's UI kit: components from [Sacred Computer](https://www.sacred.computer/)
(`srcl`, MIT, see [LICENSE.md](LICENSE.md)), copied from
[internet-development/www-sacred](https://github.com/internet-development/www-sacred)
at `a288a847614f0a6736a796e4d837bdf5f6d0cdae` (2026-10-07). Sacred is not
published to npm; vendoring source is how it is meant to be consumed.
`https://www.sacred.computer/llm/components/AGENTS.md` catalogues every component.

Only the components msgr uses are here. To add one, copy its `.tsx` and
`.module.css` from upstream and apply the same mechanical edits.

## Local changes

Kept small so upstream diffs stay readable:

- `@components/…`, `@common/…` and `@modules/…` imports are relative paths.
- `'use client'` directives are gone (Next.js only; Vite warns about them).
- Fixes for this repo's strict TypeScript and lint: typed `Message` /
  `MessageViewer` props, `position.ts` rects, unused locals, empty types, and
  hooks hoisted above early returns (`BlockLoader`) or made unconditional
  (`DropdownMenuTrigger`).
- `DropdownMenuTrigger` returns focus to its trigger only if nothing else took
  it, so a menu item that opens a dialog leaves the dialog's field focused.
- `TextArea` and `Input` draw a copy of the text, with a block for the
  insertion point, over a transparent real field. Upstream's set the field's
  caret (`TextArea` from effects, `Input` on focus), which jumped it to the
  end when typing in the middle and collapsed every selection in a
  `TextArea`, followed the caret only on keys and clicks, and measured layout
  on every key. Here the browser owns the caret and the selection, and the
  copy follows every `selectionchange` (`common/selection.ts`), however made:
  a menu's Select All, a phone's handles, an input method. The copy draws
  every glyph, the selection inverted with no block over it; the field's own
  `::selection` is transparent (`skin.css`, which also keeps the field's text
  transparent in forced colours). Nothing reads layout while typing:
  `TextArea` counts lines only when ArrowUp or ArrowDown asks, and its field
  takes the copy's height from CSS. So that the copy is never shorter than the
  field's text, it keeps an empty last line, and the block is held in a span
  that doesn't wrap to the characters either side, except a space or a dash
  the field may break after. `Input`'s copy scrolls with its field.
  `TextArea`'s `autoPlay` is gone. `components/fields.test.ts` and
  `apps/e2e/tests/fields.spec.ts` hold them to it.
- `page/ModalContext.tsx` keeps the actions (`useModals`) and the stack
  (`useModalStack`) in contexts of their own, the actions made once, so
  opening a dialog re-renders only what shows the stack.
- `common/utilities.ts` keeps only the helpers these components call.
- `modules/hotkeys.ts` replaces upstream's vendored `react-hotkeys-hook` with
  the one call it needs, `useHotkeys(keys, callback, options)`.
- `global.css` drops the Next.js `#__next` rule. `fonts.css` self-hosts two
  faces from Sacred's font menu, Chicago FLF and Departure Mono, from
  `public/fonts`.

## The Macintosh skin

msgr dresses these components as a black-and-white Macintosh (System 1–6). The
look lives outside this folder, in `src/skin.css`, so the files here stay as
upstream shipped them:

- `vite.config.ts` names their CSS Modules classes `srcl-<Component>__<class>`,
  and the skin restyles them by those names, each selector led by `:root` to
  outrank the component's own rule.
- The skin reads only `--theme-text` and `--theme-background`, as ink and
  paper, so Sacred's themes still apply: Dark is the inverted screen, the tints
  are duotones. `src/app/browser/theme.ts` puts the `theme-*` and `tint-*` classes on
  `<body>`.
- Inversion is the only highlight: `--theme-focused-foreground` is ink.

When you update a component from upstream, check the skin's rules for it still
name real classes.

## Using it

- Most components spread `...rest` after their own `className`, so passing
  `className` replaces their styles. Wrap them, or pass `style`.
- `ActionButton`'s `hotkey` must be a string; it drops elements.
- `Avatar` puts `src` in an unquoted CSS `url()`, so a data URI must escape
  parentheses (see `identicon` in `src/lib/pixels.ts`).
- `TextArea` grows with its text by CSS: its `<textarea>` lies over the drawn
  copy and takes the copy's height, so `rows` changes nothing.
- `Input` draws its insertion point where the field's selection says, which
  an `email` input doesn't: use `type="text"` with `inputMode="email"`, as
  the login and sign-up pages do, or its block stays at the end.
- A handler you pass (`onKeyDown`, `onSelect`, `onFocus`…) replaces the field's
  own, which `...rest` overrides: `MessageInput`'s `onKeyDown` takes the place
  of `TextArea`'s ArrowUp and ArrowDown.
