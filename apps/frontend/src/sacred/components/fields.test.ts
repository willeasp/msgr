// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Input from './Input';
import TextArea from './TextArea';

// The browser owns the caret and the selection; Sacred's fields draw a copy
// of the text that follows them, and do no layout while someone types.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Field = HTMLInputElement | HTMLTextAreaElement;

let unmount: (() => void) | null = null;
afterEach(() => {
  unmount?.();
  unmount = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** Mounts a field whose value a parent holds, as msgr's are, with a button either side. */
function mount(field: 'input' | 'textarea', props: Record<string, unknown> = {}) {
  let setValue: (value: string) => void = () => undefined;
  const Parent = () => {
    const [value, set] = useState('');
    setValue = set;
    return createElement(
      'div',
      null,
      createElement('button', null, 'Before'),
      createElement(field === 'input' ? Input : TextArea, {
        ...props,
        value,
        onChange: (e: { target: { value: string } }) => set(e.target.value),
      }),
      createElement('button', null, 'After')
    );
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(Parent)));
  unmount = () => act(() => root.unmount());
  const element = host.querySelector(field) as Field;
  return {
    element,
    /** The drawn copy: its text, with `|` where the insertion point is drawn. */
    shown: () => {
      const drawn = field === 'input' ? element.previousElementSibling : element.parentElement?.firstElementChild;
      return Array.from(drawn?.childNodes ?? [])
        .map((node) => (node.nodeName === 'SPAN' ? '|' : node.textContent))
        .join('');
    },
    setValue: (value: string) => act(() => setValue(value)),
  };
}

const valueSetter = (element: Field) =>
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;

/** What a key press leaves: the browser's new value and caret, then its input event. */
function type(element: Field, value: string, caret = value.length) {
  act(() => {
    valueSetter(element)?.call(element, value);
    if (element.selectionStart !== null) element.setSelectionRange(caret, caret);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** The browser moving the caret or selecting, by keys or the pointer. */
function select(element: Field, start: number, end = start) {
  act(() => {
    element.setSelectionRange(start, end);
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  });
}

describe.each(['textarea', 'input'] as const)('Sacred %s', (field) => {
  it('draws the insertion point where the caret is, and leaves the caret there', () => {
    const { element, shown } = mount(field);
    act(() => element.focus());
    type(element, 'Hello world');
    expect(shown()).toBe('Hello world|');

    select(element, 5);
    expect(shown()).toBe('Hello| world');
    type(element, 'HelloX world', 6);
    type(element, 'HelloXY world', 7);
    expect(shown()).toBe('HelloXY| world');
    expect(element.selectionStart).toBe(7);
    expect(element.value).toBe('HelloXY world');
  });

  it('keeps a selection whole, drawing no insertion point over it', () => {
    const { element, shown } = mount(field);
    act(() => element.focus());
    type(element, 'Replace me');
    select(element, 0, 10);
    expect([element.selectionStart, element.selectionEnd]).toEqual([0, 10]);
    expect(shown()).toBe('Replace me');

    type(element, 'X', 1);
    expect(shown()).toBe('X|');
  });

  it('draws the insertion point at the end of a value its parent sets', () => {
    const { element, shown, setValue } = mount(field);
    act(() => element.focus());
    type(element, 'Sent', 2);
    setValue('');
    expect(shown()).toBe('|');
    setValue('Typed for you');
    expect(shown()).toBe('Typed for you|');
  });

  it('reads no layout while someone types', () => {
    const { element } = mount(field);
    act(() => element.focus());
    const reads = [
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get'),
      vi.spyOn(Element.prototype, 'scrollHeight', 'get'),
      vi.spyOn(window, 'getComputedStyle'),
    ];
    let text = '';
    for (const key of 'The quick brown fox\njumps') {
      text += key;
      type(element, text);
    }
    select(element, 4);
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });
});

describe('Sacred textarea', () => {
  it('keeps the empty line after a last newline, so the field over it is as tall', () => {
    const { element, shown } = mount('textarea');
    act(() => element.focus());
    type(element, 'One\n', 4);
    expect(shown()).toBe('One\n|​');
    select(element, 0);
    expect(shown()).toBe('|One\n​');
  });

  it('leaves the field by the arrow keys from its first and last lines', () => {
    const { element } = mount('textarea');
    act(() => element.focus());
    type(element, 'One line');
    act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement?.textContent).toBe('After');

    act(() => element.focus());
    act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    expect(document.activeElement?.textContent).toBe('Before');
  });
});

describe('Sacred input', () => {
  it('masks a password, the insertion point where the caret is', () => {
    const { element, shown } = mount('input', { type: 'password' });
    act(() => element.focus());
    type(element, 'secret', 3);
    expect(shown()).toBe('•••|•••');
  });

  it('draws the caret of an email at the end, having none to read, and comes back to it by arrow', () => {
    const { element, shown } = mount('input', { type: 'email' });
    act(() => element.focus());
    type(element, 'ada@example.com');
    expect(element.selectionStart).toBeNull();
    expect(shown()).toBe('ada@example.com|');

    act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement?.textContent).toBe('After');
    // Coming back after leaving downwards sets no caret it can't have.
    expect(() => act(() => element.focus())).not.toThrow();
    expect(shown()).toBe('ada@example.com|');
  });
});
