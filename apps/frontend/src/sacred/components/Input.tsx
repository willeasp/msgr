import * as React from 'react';
import * as Utilities from '../common/utilities';
import { following, useFollowSelection, type Selection } from '../common/selection';

import styles from './Input.module.css';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  caretChars?: React.ReactNode;
  label?: React.ReactNode;
  isBlink?: boolean;
};

function Input({ caretChars, isBlink = true, label, placeholder, onChange, type, id, defaultValue, ...rest }: InputProps) {
  const generatedId = React.useId();
  const inputId = id || generatedId;

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const displayedRef = React.useRef<HTMLDivElement | null>(null);
  const blockRef = React.useRef<HTMLSpanElement | null>(null);
  const [typed, setTyped] = React.useState<string>(defaultValue?.toString() || '');
  const [isFocused, setIsFocused] = React.useState<boolean>(false);
  const [selection, setSelection] = React.useState<Selection>({ start: typed.length, end: typed.length, text: typed });

  const lastFocusDirectionRef = React.useRef<'up' | 'down' | null>(null);

  const text = rest.value !== undefined ? rest.value.toString() : typed;
  // A text someone else set has its caret at the end; so does one whose
  // input has no selection to read (email, which msgr doesn't use for that).
  const at = selection.text === text ? selection : { start: text.length, end: text.length, text };
  if (at !== selection) setSelection(at);

  useFollowSelection(inputRef, setSelection);

  const onHandleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTyped(e.target.value);
    setSelection(following(e.target));
    if (onChange) {
      onChange(e);
    }
  };

  const onHandleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    const inputEl = e.currentTarget;
    // Only inputs with a selection to set (not email) take one.
    if (lastFocusDirectionRef.current && inputEl.selectionStart !== null) {
      const caret = lastFocusDirectionRef.current === 'down' ? inputEl.value.length : 0;
      inputEl.setSelectionRange(caret, caret);
    }
    setSelection(following(inputEl));
  };

  const onHandleBlur = () => {
    setIsFocused(false);
  };

  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      lastFocusDirectionRef.current = 'up';
      const previousFocusable = Utilities.findNextFocusable(document.activeElement, 'previous');
      previousFocusable?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      lastFocusDirectionRef.current = 'down';
      const nextFocusable = Utilities.findNextFocusable(document.activeElement, 'next');
      nextFocusable?.focus();
    }
  };

  // A text longer than the field scrolls the input; the copy scrolls with it,
  // and on as far as its block, wider than the browser's caret, needs to show
  // whole. Measured only when the field scrolls.
  const onHandleScroll = (e: React.UIEvent<HTMLInputElement>) => {
    const displayed = displayedRef.current;
    if (!displayed) return;
    displayed.scrollLeft = e.currentTarget.scrollLeft;
    const past = (blockRef.current?.getBoundingClientRect().right ?? 0) - displayed.getBoundingClientRect().right;
    if (past > 0) displayed.scrollLeft += Math.ceil(past);
  };

  const isPlaceholderVisible = !text && placeholder;
  const containerClasses = Utilities.classNames(styles.root, isFocused && styles.focused);

  const maskText = (t: string) => (type === 'password' ? '•'.repeat(t.length) : t);

  // Every glyph shows from the copy, as in TextArea.
  return (
    <div className={containerClasses}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.inputContainer}>
        <div ref={displayedRef} className={Utilities.classNames(styles.displayed, isPlaceholderVisible && styles.placeholder)}>
          {isPlaceholderVisible ? (
            placeholder
          ) : (
            <>
              {maskText(text.substring(0, at.start))}
              {at.start === at.end ? (
                <span ref={blockRef} className={Utilities.classNames(styles.block, isBlink && styles.blink)}>
                  {caretChars || ''}
                </span>
              ) : (
                <span className={styles.selection}>{maskText(text.substring(at.start, at.end))}</span>
              )}
              {maskText(text.substring(at.end))}
            </>
          )}
        </div>
        <input id={inputId} ref={inputRef} className={styles.hidden} value={text} aria-placeholder={placeholder} type={type} onFocus={onHandleFocus} onBlur={onHandleBlur} onChange={onHandleChange} onSelect={(e) => setSelection(following(e.currentTarget))} onScroll={onHandleScroll} onKeyDown={onHandleKeyDown} {...rest} />
      </div>
    </div>
  );
}

export default Input;
