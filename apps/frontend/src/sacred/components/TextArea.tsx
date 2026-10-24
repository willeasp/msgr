import styles from './TextArea.module.css';

import * as React from 'react';
import * as Utilities from '../common/utilities';
import { following, useFollowSelection, type Selection } from '../common/selection';

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  isBlink?: boolean;
};

// The block is held to the characters either side, in a span that doesn't
// wrap, so the copy never breaks a line at the caret where the field's text
// doesn't. Not to a space or a dash, which the field may break after: held,
// one would join the words around it into one too long for a line, which
// then breaks anywhere. So the copy can be taller than the field's text,
// never shorter.
const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const segments = (text: string) => (graphemes ? Array.from(graphemes.segment(text), ({ segment }) => segment) : Array.from(text));
const breaksBeside = /[\s\-\u00AD\u2010-\u2014]/;
// A whole character (an emoji and its joiners, a letter and its accents),
// or none, never part of one.
const held = (character: string | undefined) => (character && !breaksBeside.test(character) ? character : '');
const lastOf = (text: string) => held(segments(text.slice(-32)).at(-1));
const firstOf = (text: string) => held(segments(text.slice(0, 32))[0]);
// Gives a last empty line (after a newline) the height the field gives it.
const LAST_LINE = '\u200B';

function TextArea({ isBlink, placeholder, onChange, defaultValue, ...rest }: TextAreaProps) {
  const fieldRef = React.useRef<HTMLTextAreaElement | null>(null);
  const measurementRef = React.useRef<HTMLDivElement | null>(null);

  const [typed, setTyped] = React.useState<string>(defaultValue?.toString() || '');
  const [isFocused, setIsFocused] = React.useState<boolean>(false);
  const [selection, setSelection] = React.useState<Selection>({ start: 0, end: 0, text: typed });

  const text = rest.value !== undefined ? rest.value.toString() : typed;
  // A text someone else set (a parent's value) has its caret at the end,
  // where the browser puts it.
  const at = selection.text === text ? selection : { start: text.length, end: text.length, text };
  if (at !== selection) setSelection(at);

  useFollowSelection(fieldRef, setSelection);

  const onHandleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTyped(e.target.value);
    setSelection(following(e.target));
    if (onChange) {
      onChange(e);
    }
  };

  const onHandleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(true);
    setSelection(following(e.currentTarget));
  };

  const onHandleBlur = () => {
    setIsFocused(false);
  };

  // Lines are measured only when an arrow key asks, never while typing.
  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !measurementRef.current) return;

    const measurementEl = measurementRef.current;
    const lineHeightStr = window.getComputedStyle(measurementEl).lineHeight;
    const lineHeight = lineHeightStr.endsWith('px') ? parseFloat(lineHeightStr) : 20;
    const countLines = (content: string) => {
      measurementEl.textContent = content + LAST_LINE;
      return Math.round(measurementEl.offsetHeight / lineHeight);
    };
    const total = countLines(text || placeholder || '');
    const current = countLines(text.substring(0, e.currentTarget.selectionStart));
    measurementEl.textContent = '';

    if (e.key === 'ArrowUp' && current <= 1) {
      e.preventDefault();
      const previousFocusable = Utilities.findNextFocusable(document.activeElement, 'previous');
      previousFocusable?.focus();
    } else if (e.key === 'ArrowDown' && current >= total) {
      e.preventDefault();
      const nextFocusable = Utilities.findNextFocusable(document.activeElement, 'next');
      nextFocusable?.focus();
    }
  };

  const isPlaceholderVisible = !text && placeholder;
  const before = text.substring(0, at.start);
  const after = text.substring(at.end);
  const left = lastOf(before);
  const right = firstOf(after);

  const containerClasses = Utilities.classNames(styles.root, isFocused && styles.focused);

  // The textarea lies over this copy and takes its height. Every glyph shows
  // from the copy: the field's own text and selection are transparent, and
  // the copy draws the selection, inverted, or the block where nothing is.
  return (
    <div className={containerClasses}>
      <div className={Utilities.classNames(styles.displayed, isPlaceholderVisible && styles.placeholder)}>
        {isPlaceholderVisible ? (
          placeholder
        ) : (
          <>
            {at.start === at.end ? (
              <>
                {before.slice(0, before.length - left.length)}
                <span className={styles.caret}>
                  {left}
                  <span className={Utilities.classNames(styles.block, isBlink && styles.blink)}></span>
                  {right}
                </span>
                {after.slice(right.length)}
              </>
            ) : (
              <>
                {before}
                <span className={styles.selection}>{text.substring(at.start, at.end)}</span>
                {after}
              </>
            )}
            {text.endsWith('\n') && LAST_LINE}
          </>
        )}
      </div>

      <div ref={measurementRef} className={styles.hidden}></div>

      <textarea className={styles.hiddenElement} ref={fieldRef} value={text} aria-placeholder={placeholder} onFocus={onHandleFocus} onBlur={onHandleBlur} onKeyDown={onHandleKeyDown} onChange={onHandleChange} onSelect={(e) => setSelection(following(e.currentTarget))} {...rest} />
    </div>
  );
}

export default TextArea;
