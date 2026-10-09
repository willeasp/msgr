// Stands in for sacred's vendored react-hotkeys-hook (modules/hotkeys), keeping its
// `useHotkeys(keys, callback, options)` call shape. Covers what msgr needs: comma-separated
// combos such as 'Escape' or 'ctrl+k', ignored inside form fields unless opted in.

import * as React from 'react';

export interface Options {
  enabled?: boolean;
  enableOnFormTags?: boolean;
  preventDefault?: boolean;
}

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const MODIFIERS = ['ctrl', 'alt', 'shift', 'meta'] as const;

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (FORM_TAGS.has(target.tagName) || target.isContentEditable);
}

export function matchesHotkey(combo: string, event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts.pop();
  const pressed = { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey };

  return event.key.toLowerCase() === key && MODIFIERS.every((modifier) => pressed[modifier] === parts.includes(modifier));
}

export function useHotkeys(keys: string, callback: (event: KeyboardEvent) => void, { enabled = true, enableOnFormTags = false, preventDefault = false }: Options = {}) {
  const callbackRef = React.useRef(callback);

  React.useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  React.useEffect(() => {
    if (!enabled || !keys) return;

    const combos = keys.split(',').map((combo) => combo.trim());

    const onKeyDown = (event: KeyboardEvent) => {
      if (!enableOnFormTags && isTypingTarget(event.target)) return;
      if (!combos.some((combo) => matchesHotkey(combo, event))) return;

      if (preventDefault) event.preventDefault();
      callbackRef.current(event);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [keys, enabled, enableOnFormTags, preventDefault]);
}
