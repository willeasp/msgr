import * as React from 'react';

// Where the browser's selection was, in which text. The browser owns the
// caret and the selection; the drawn copy only follows them.
export interface Selection {
  start: number;
  end: number;
  text: string;
}

/** The selection a field has now, or the one drawn if nothing moved, so nothing renders. */
export const following =
  (field: HTMLTextAreaElement | HTMLInputElement) =>
  (now: Selection): Selection => {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    return now.start === start && now.end === end && now.text === field.value ? now : { start, end, text: field.value };
  };

/**
 * Follows every change of a field's selection while it's focused, however
 * made: keys, the pointer, a menu's Select All, a phone's handles, an input
 * method. Browsers fire `selectionchange` at the field or at the document,
 * and React's `onSelect` hears only some of them; capturing at the document
 * hears both.
 */
export function useFollowSelection(ref: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>, setSelection: React.Dispatch<React.SetStateAction<Selection>>) {
  React.useEffect(() => {
    const onSelectionChange = () => {
      const field = ref.current;
      if (field && document.activeElement === field) setSelection(following(field));
    };
    document.addEventListener('selectionchange', onSelectionChange, true);
    return () => document.removeEventListener('selectionchange', onSelectionChange, true);
  }, [ref, setSelection]);
}
