import styles from './TextArea.module.css';

import * as React from 'react';
import * as Utilities from '../common/utilities';

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  isBlink?: boolean;
};

// Where the browser's selection was, in which text. The browser owns the
// caret: the drawn copy only follows it, and a text someone else set (a
// parent's value) has its caret at the end, where the browser puts it.
interface Selection {
  start: number;
  end: number;
  text: string;
}

function TextArea({ isBlink, placeholder, onChange, defaultValue, ...rest }: TextAreaProps) {
  const measurementRef = React.useRef<HTMLDivElement | null>(null);

  const [typed, setTyped] = React.useState<string>(defaultValue?.toString() || '');
  const [isFocused, setIsFocused] = React.useState<boolean>(false);
  const [selection, setSelection] = React.useState<Selection>({ start: 0, end: 0, text: typed });

  const text = rest.value !== undefined ? rest.value.toString() : typed;
  const at = selection.text === text ? selection : { start: text.length, end: text.length };

  const follow = (textarea: HTMLTextAreaElement) => {
    const next = { start: textarea.selectionStart, end: textarea.selectionEnd, text: textarea.value };
    setSelection((now) => (now.start === next.start && now.end === next.end && now.text === next.text ? now : next));
  };

  const onHandleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTyped(e.target.value);
    follow(e.target);
    if (onChange) {
      onChange(e);
    }
  };

  const onHandleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(true);
    follow(e.currentTarget);
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
      measurementEl.textContent = content || ' ';
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
  // A selection shows as the browser's own, inverted by the skin; the
  // insertion point is drawn only when nothing is selected.
  const isCollapsed = at.start === at.end;

  const containerClasses = Utilities.classNames(styles.root, isFocused && styles.focused);

  // The textarea lies over this copy and takes its height, so the copy must
  // be at least as tall as the textarea's text: an empty last line included.
  return (
    <div className={containerClasses}>
      <div className={Utilities.classNames(styles.displayed, isPlaceholderVisible && styles.placeholder)}>
        {isPlaceholderVisible ? placeholder : isCollapsed ? text.substring(0, at.start) : text}
        {!isPlaceholderVisible && isCollapsed && <span className={Utilities.classNames(styles.block, isBlink && styles.blink)}></span>}
        {!isPlaceholderVisible && isCollapsed && text.substring(at.start)}
        {text.endsWith('\n') && '​'}
      </div>

      <div ref={measurementRef} className={styles.hidden}></div>

      <textarea className={styles.hiddenElement} value={text} aria-placeholder={placeholder} onFocus={onHandleFocus} onBlur={onHandleBlur} onKeyDown={onHandleKeyDown} onChange={onHandleChange} onSelect={(e) => follow(e.currentTarget)} {...rest} />
    </div>
  );
}

export default TextArea;
