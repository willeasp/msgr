// The subset of sacred's common/utilities.ts that the vendored components use.

const hasOwn = {}.hasOwnProperty;

export function isEmpty(text: unknown) {
  //NOTE(jimmylee): Zero is a valid value, not empty.
  if (text === 0) {
    return false;
  }

  if (!text) {
    return true;
  }

  if (typeof text === 'object') {
    return true;
  }

  return !String(text).trim();
}

type ClassValue = string | number | null | undefined | false | ClassValue[] | Record<string, unknown>;

export function classNames(...args: ClassValue[]): string {
  const classes: string[] = [];

  for (const arg of args) {
    if (!arg) continue;

    if (typeof arg === 'string' || typeof arg === 'number') {
      classes.push(String(arg));
    } else if (Array.isArray(arg)) {
      const inner = classNames(...arg);
      if (inner) {
        classes.push(inner);
      }
    } else if (arg.toString !== Object.prototype.toString) {
      classes.push(arg.toString());
    } else {
      for (const key in arg) {
        if (hasOwn.call(arg, key) && arg[key]) {
          classes.push(key);
        }
      }
    }
  }

  return classes.join(' ');
}

const FOCUSABLE_SELECTORS = ['a[href]', 'button', 'input', 'select', 'textarea', '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]'].join(', ');

export const findNextFocusable = (element: Element | null, direction: 'next' | 'previous' = 'next'): HTMLElement | null => {
  if (!element) return null;

  const focusableElements = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));

  const currentIndex = focusableElements.indexOf(element as HTMLElement);

  if (currentIndex !== -1) {
    const nextIndex = direction === 'next' ? (currentIndex + 1) % focusableElements.length : (currentIndex - 1 + focusableElements.length) % focusableElements.length;

    return focusableElements[nextIndex] ?? null;
  }

  return null;
};

export const findFocusableDescendant = (container: Element | null, currentFocused: Element | null = null, direction: 'next' | 'previous' = 'next'): HTMLElement | null => {
  if (!container) return null;

  const focusableElements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));

  if (focusableElements.length === 0) return null;

  let index = 0;
  if (currentFocused) {
    const currentIndex = focusableElements.indexOf(currentFocused as HTMLElement);
    if (currentIndex !== -1) {
      index = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    }
  }

  return focusableElements[index] ?? null;
};
