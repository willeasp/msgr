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
const LAST_LINE = String.fromCharCode(0x200b);

let unmount: (() => void) | null = null;
afterEach(() => {
  unmount?.();
  unmount = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** Mounts a field whose value a parent holds, as msgr's are, with a button either side. */
function mount(field: 'input' | 'textarea', props: { type?: string } = {}) {
  let setValue: (value: string) => void = () => undefined;
  const Parent = () => {
    const [value, set] = useState('');
    setValue = set;
    const onChange = (e: { target: { value: string } }) => set(e.target.value);
    return createElement(
      'div',
      null,
      createElement('button', null, 'Before'),
      field === 'input' ? createElement(Input, { ...props, value, onChange }) : createElement(TextArea, { value, onChange }),
      createElement('button', null, 'After')
    );
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(Parent)));
  unmount = () => act(() => root.unmount());
  const element = host.querySelector(field) as Field;
  const copy = () => (field === 'input' ? element.previousElementSibling : element.parentElement?.firstElementChild);
  return {
    element,
    /** The drawn copy: `|` where the insertion point is, `[…]` a selection. */
    shown: () => drawn(copy()),
    /** What the insertion point is held to, either side. */
    held: () => copy()?.querySelector('[class*="block"]')?.parentElement?.textContent,
    setValue: (value: string) => act(() => setValue(value)),
  };
}

function drawn(node: Node | null | undefined): string {
  if (!node) return '';
  const name = node instanceof HTMLElement ? node.className : '';
  if (name.includes('block')) return '|';
  if (name.includes('selection')) return `[${node.textContent}]`;
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  return Array.from(node.childNodes, drawn).join('');
}

const valueSetter = (element: Field) => Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;

/** What a key press leaves: the browser's new value and caret, then its input event. */
function type(element: Field, value: string, caret = value.length) {
  act(() => {
    valueSetter(element)?.call(element, value);
    if (element.selectionStart !== null) element.setSelectionRange(caret, caret);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** The browser moving the caret or selecting by keys or the pointer, which React's onSelect hears. */
function select(element: Field, start: number, end = start) {
  act(() => {
    element.setSelectionRange(start, end);
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  });
}

const press = (element: Field, key: string) => act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

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

  it('keeps a selection whole, and draws it with no insertion point', () => {
    const { element, shown } = mount(field);
    act(() => element.focus());
    type(element, 'Replace me');
    select(element, 0, 10);
    expect([element.selectionStart, element.selectionEnd]).toEqual([0, 10]);
    expect(shown()).toBe('[Replace me]');

    type(element, 'X', 1);
    expect(shown()).toBe('X|');
  });

  it('follows a selection however it changes, told at the field or at the document', () => {
    // A menu's Select All, a phone's handles, an input method: no key, no click.
    const { element, shown } = mount(field);
    act(() => element.focus());
    type(element, 'alpha beta');
    act(() => {
      element.setSelectionRange(2, 2);
      element.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    });
    expect(shown()).toBe('al|pha beta');
    act(() => {
      element.setSelectionRange(6, 10);
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(shown()).toBe('alpha [beta]');
  });

  it('draws the caret where it is when focus comes', () => {
    const { element, shown, setValue } = mount(field, field === 'input' ? { type: 'text' } : {});
    setValue('Hello');
    act(() => element.setSelectionRange(2, 2));
    act(() => element.focus());
    expect(shown()).toBe('He|llo');
  });

  it('draws the insertion point at the end of a value its parent sets, the same one again too', () => {
    const { element, shown, setValue } = mount(field);
    act(() => element.focus());
    type(element, 'Draft');
    select(element, 2);
    expect(shown()).toBe('Dr|aft');
    setValue('');
    expect(shown()).toBe('|');
    setValue('Draft');
    expect(element.selectionStart).toBe(5);
    expect(shown()).toBe('Draft|');
  });

  it('reads no layout while someone types or moves the caret', () => {
    const { element } = mount(field);
    act(() => element.focus());
    const reads = [vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get'), vi.spyOn(Element.prototype, 'scrollHeight', 'get'), vi.spyOn(window, 'getComputedStyle')];
    let text = '';
    for (const key of 'The quick brown fox\njumps') {
      text += key;
      type(element, text);
      act(() => document.dispatchEvent(new Event('selectionchange')));
    }
    select(element, 4);
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });
});

describe('Sacred textarea', () => {
  it('holds the insertion point to whole characters either side, so no line breaks at it', () => {
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    const { element, held, shown } = mount('textarea');
    act(() => element.focus());
    type(element, 'abcd', 2);
    expect(held()).toBe('bc');
    type(element, `a${family}b`, 1 + family.length);
    expect(held()).toBe(`${family}b`);
    select(element, 1);
    expect(held()).toBe(`a${family}`);
    expect(shown()).toBe(`a|${family}b`);
    select(element, 0);
    expect(held()).toBe('a');

    // Not to a space or a dash, which the field may break a line after.
    type(element, 'ab cd', 3);
    expect(held()).toBe('c');
    select(element, 2);
    expect(held()).toBe('b');
    type(element, 'well-known', 5);
    expect(held()).toBe('k');
  });

  it('keeps the empty line after a last newline, so the field over it is as tall', () => {
    const { element, shown } = mount('textarea');
    act(() => element.focus());
    type(element, 'One\n', 4);
    expect(shown()).toBe(`One\n|${LAST_LINE}`);
    select(element, 0);
    expect(shown()).toBe(`|One\n${LAST_LINE}`);
  });

  it('leaves by the arrow keys only from its first and last lines, an empty last line counted', () => {
    // Lines laid out as a browser would: a last newline adds no line of its own.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      const lines = (this.textContent ?? '').split('\n');
      if (lines.length > 1 && lines.at(-1) === '') lines.pop();
      return 20 * lines.length;
    });
    const { element } = mount('textarea');
    act(() => element.focus());
    const at = (caret: number, key: string) => {
      act(() => element.focus());
      act(() => element.setSelectionRange(caret, caret));
      press(element, key);
      return document.activeElement === element ? 'stays' : document.activeElement?.textContent;
    };

    type(element, 'One\nTwo');
    expect(at(5, 'ArrowUp')).toBe('stays');
    expect(at(1, 'ArrowUp')).toBe('Before');
    expect(at(1, 'ArrowDown')).toBe('stays');
    expect(at(6, 'ArrowDown')).toBe('After');

    type(element, 'One\nTwo\n');
    expect(at(4, 'ArrowUp')).toBe('stays');
    expect(at(7, 'ArrowDown')).toBe('stays');
    expect(at(8, 'ArrowDown')).toBe('After');
  });
});

describe('Sacred input', () => {
  it('masks a password, the insertion point and a selection where they are', () => {
    const { element, shown } = mount('input', { type: 'password' });
    act(() => element.focus());
    type(element, 'secret', 3);
    expect(shown()).toBe('•••|•••');
    select(element, 1, 3);
    expect(shown()).toBe('•[••]•••');
  });

  it('comes back by the arrow keys to the end it left by, or the start', () => {
    const { element, shown, setValue } = mount('input', { type: 'text' });
    setValue('abcdef');
    act(() => element.focus());
    select(element, 3);
    press(element, 'ArrowDown');
    expect(document.activeElement?.textContent).toBe('After');
    act(() => element.focus());
    expect([element.selectionStart, shown()]).toEqual([6, 'abcdef|']);

    press(element, 'ArrowUp');
    expect(document.activeElement?.textContent).toBe('Before');
    act(() => element.focus());
    expect([element.selectionStart, shown()]).toEqual([0, '|abcdef']);
  });

  it('draws the caret of an email at the end, having none to read, and sets none coming back', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reported: unknown[] = [];
    const report = (e: ErrorEvent) => reported.push(e.error);
    window.addEventListener('error', report);
    const { element, shown } = mount('input', { type: 'email' });
    act(() => element.focus());
    type(element, 'ada@example.com');
    expect(element.selectionStart).toBeNull();
    expect(shown()).toBe('ada@example.com|');

    press(element, 'ArrowDown');
    expect(document.activeElement?.textContent).toBe('After');
    act(() => element.focus());
    window.removeEventListener('error', report);
    expect(shown()).toBe('ada@example.com|');
    expect(reported).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
  });
});
