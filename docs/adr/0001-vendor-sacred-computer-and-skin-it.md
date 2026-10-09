# 1. Vendor Sacred Computer, and dress it with a skin

Date: 2026-10-09 · Status: accepted

## Context

The UI is built on [Sacred Computer](https://www.sacred.computer/) (`srcl`), a
React component library with a terminal look. It is not on npm; it is meant to
be copied into a project. We also wanted the app to look like a black-and-white
Macintosh, which Sacred's grey, accent-coloured themes don't.

## Decision

- Copy only the components we use into `apps/frontend/src/sacred`, with the
  smallest edits our strict TypeScript and lint need. Its README lists every
  local change and the upstream commit.
- Give their CSS Modules stable class names (`srcl-Button__root`, configured in
  `vite.config.ts`) and restyle them from one file, `src/skin.css`, rather than
  editing the vendored CSS.
- The skin reads only Sacred's `--theme-text` and `--theme-background`, as ink
  and paper, so every Sacred theme still works: Dark becomes the inverted
  screen and the tints become duotones.

## Consequences

- Updating a component from upstream is a copy and a diff; the skin's
  selectors for it may then need checking.
- The skin depends on the vendored components' internal class names. A renamed
  class upstream silently drops a style, so screenshot after updates.
- Prettier ignores the vendored folder so its formatting stays upstream's.
