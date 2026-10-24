import * as React from 'react';
import * as Utilities from '../common/utilities';

import styles from './Input.module.css';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  caretChars?: React.ReactNode;
  label?: React.ReactNode;
  isBlink?: boolean;
};

// Where the browser's selection was, in which text: see TextArea. Some
// inputs (email) have none to read; their caret is drawn at the end.
interface Selection {
  start: number;
  end: number;
  text: string;
}

function Input({ caretChars, isBlink = true, label, placeholder, onChange, type, id, defaultValue, ...rest }: InputProps) {
  const generatedId = React.useId();
  const inputId = id || generatedId;

  const [typed, setTyped] = React.useState<string>(defaultValue?.toString() || '');
  const [isFocused, setIsFocused] = React.useState<boolean>(false);
  const [selection, setSelection] = React.useState<Selection>({ start: typed.length, end: typed.length, text: typed });

  const lastFocusDirectionRef = React.useRef<'up' | 'down' | null>(null);

  const text = rest.value !== undefined ? rest.value.toString() : typed;
  const at = selection.text === text ? selection : { start: text.length, end: text.length };

  const follow = (inputEl: HTMLInputElement) => {
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const next = { start, end: inputEl.selectionEnd ?? start, text: inputEl.value };
    setSelection((now) => (now.start === next.start && now.end === next.end && now.text === next.text ? now : next));
  };

  const onHandleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTyped(e.target.value);
    follow(e.target);
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
    follow(inputEl);
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

  const isPlaceholderVisible = !text && placeholder;
  // A selection shows as the browser's own, inverted by the skin; the
  // insertion point is drawn only when nothing is selected.
  const isCollapsed = at.start === at.end;
  const containerClasses = Utilities.classNames(styles.root, isFocused && styles.focused);

  const maskText = (t: string) => (type === 'password' ? '•'.repeat(t.length) : t);

  const beforeCaretText = isPlaceholderVisible ? placeholder ?? '' : maskText(isCollapsed ? text.substring(0, at.start) : text);
  const afterCaretText = isPlaceholderVisible || !isCollapsed ? '' : maskText(text.substring(at.start));

  return (
    <div className={containerClasses}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.inputContainer}>
        <div className={Utilities.classNames(styles.displayed, isPlaceholderVisible && styles.placeholder)}>
          {beforeCaretText}
          {!isPlaceholderVisible && isCollapsed && <span className={Utilities.classNames(styles.block, isBlink && styles.blink)}>{caretChars || ''}</span>}
          {afterCaretText}
        </div>
        <input id={inputId} className={styles.hidden} value={text} aria-placeholder={placeholder} type={type} onFocus={onHandleFocus} onBlur={onHandleBlur} onChange={onHandleChange} onSelect={(e) => follow(e.currentTarget)} onKeyDown={onHandleKeyDown} {...rest} />
      </div>
    </div>
  );
}

export default Input;
