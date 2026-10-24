// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELD_AFTER_MS, PRESSED_AFTER_MS, SLOP } from '../../lib/press';
import { useLongPress } from './use-long-press';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'performance'],
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A message with a link and a sound's controls in it, as MessageBubble draws one. */
function mount() {
  const clicks = vi.fn();
  const holds = vi.fn();
  const shown: boolean[] = [];
  const Bubble = () => {
    const { pressed, handlers } = useLongPress({
      onClick: clicks,
      onHold: holds,
    });
    shown.push(pressed);
    return createElement(
      'div',
      { id: 'bubble', ...handlers },
      createElement('span', { id: 'words' }, 'Hello'),
      createElement('a', { id: 'link', href: '#there' }, 'there'),
      createElement('div', { id: 'sound', 'data-own-clicks': '' }, '▶')
    );
  };
  act(() => root.render(createElement(Bubble)));
  return {
    clicks,
    holds,
    pressed: () => shown[shown.length - 1],
  };
}

const on = (id: string) => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`no #${id}`);
  return found;
};

/** A pointer event as a browser sends it; jsdom has no PointerEvent. */
function pointer(
  type: string,
  target: Element,
  {
    pointerType = 'touch',
    isPrimary = true,
    x = 10,
    y = 10,
  }: { pointerType?: string; isPrimary?: boolean; x?: number; y?: number } = {}
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  Object.assign(event, { pointerType, isPrimary });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

/** What follows a pointer's lifting, as browsers send it. */
function click(target: Element) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
}

function contextMenu(target: Element) {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('useLongPress', () => {
  it('opens on a mouse click, and a mouse never holds', () => {
    const bubble = mount();
    pointer('pointerdown', on('words'), { pointerType: 'mouse' });
    wait(HELD_AFTER_MS * 2);
    pointer('pointerup', on('words'), { pointerType: 'mouse' });
    click(on('words'));
    expect(bubble.clicks).toHaveBeenCalledTimes(1);
    expect(bubble.holds).not.toHaveBeenCalled();
    expect(bubble.pressed()).toBe(false);
  });

  it('opens on a pen’s click, as on a mouse’s', () => {
    const bubble = mount();
    pointer('pointerdown', on('words'), { pointerType: 'pen' });
    wait(HELD_AFTER_MS * 2);
    expect(bubble.pressed()).toBe(false);
    pointer('pointerup', on('words'), { pointerType: 'pen' });
    click(on('words'));
    expect(bubble.clicks).toHaveBeenCalledTimes(1);
    expect(bubble.holds).not.toHaveBeenCalled();
  });

  it('opens nothing on a tap', () => {
    const bubble = mount();
    pointer('pointerdown', on('words'));
    wait(80);
    pointer('pointerup', on('words'));
    click(on('words'));
    wait(HELD_AFTER_MS);
    expect(bubble.clicks).not.toHaveBeenCalled();
    expect(bubble.holds).not.toHaveBeenCalled();
    expect(bubble.pressed()).toBe(false);
  });

  it('shows pressed once a finger rests, and holds once, at half a second', () => {
    const bubble = mount();
    pointer('pointerdown', on('words'));
    wait(PRESSED_AFTER_MS - 1);
    expect(bubble.pressed()).toBe(false);
    wait(1);
    expect(bubble.pressed()).toBe(true);
    expect(bubble.holds).not.toHaveBeenCalled();
    wait(HELD_AFTER_MS - PRESSED_AFTER_MS);
    expect(bubble.holds).toHaveBeenCalledTimes(1);
    expect(bubble.pressed()).toBe(true);
    wait(HELD_AFTER_MS * 4);
    pointer('pointerup', on('words'));
    click(on('words'));
    expect(bubble.holds).toHaveBeenCalledTimes(1);
    expect(bubble.clicks).not.toHaveBeenCalled();
    expect(bubble.pressed()).toBe(false);
  });

  it('holds even when the clock reads a little early as the timer fires', () => {
    const bubble = mount();
    const start = performance.now();
    pointer('pointerdown', on('words'));
    vi.spyOn(performance, 'now').mockReturnValue(start);
    wait(HELD_AFTER_MS);
    expect(bubble.holds).toHaveBeenCalledTimes(1);
  });

  it('lets go when the finger moves further than a fingertip', () => {
    const bubble = mount();
    pointer('pointerdown', on('words'), { x: 10, y: 10 });
    wait(PRESSED_AFTER_MS);
    pointer('pointermove', on('words'), { x: 10, y: 10 + SLOP });
    expect(bubble.pressed()).toBe(true);
    pointer('pointermove', on('words'), { x: 10, y: 11 + SLOP });
    expect(bubble.pressed()).toBe(false);
    wait(HELD_AFTER_MS);
    expect(bubble.holds).not.toHaveBeenCalled();
  });

  it('lets go when the browser takes the finger to scroll', () => {
    const bubble = mount();
    pointer('pointerdown', on('words'));
    wait(PRESSED_AFTER_MS);
    pointer('pointercancel', on('words'));
    expect(bubble.pressed()).toBe(false);
    wait(HELD_AFTER_MS);
    expect(bubble.holds).not.toHaveBeenCalled();
  });

  it('leaves a link and a sound’s controls to themselves', () => {
    const bubble = mount();
    for (const id of ['link', 'sound']) {
      pointer('pointerdown', on(id));
      wait(HELD_AFTER_MS * 2);
      expect(bubble.pressed()).toBe(false);
      pointer('pointerup', on(id));
    }
    expect(bubble.holds).not.toHaveBeenCalled();
  });

  it('keeps a link’s own menu, and the browser’s menu from the rest of a touched message', () => {
    mount();
    pointer('pointerdown', on('link'));
    expect(contextMenu(on('link')).defaultPrevented).toBe(false);
    pointer('pointerup', on('link'));

    pointer('pointerdown', on('words'));
    expect(contextMenu(on('words')).defaultPrevented).toBe(true);
    pointer('pointerup', on('words'));

    pointer('pointerdown', on('words'), { pointerType: 'mouse' });
    expect(contextMenu(on('words')).defaultPrevented).toBe(false);
  });

  it('ignores a second finger', () => {
    const bubble = mount();
    pointer('pointerdown', on('words'), { isPrimary: false });
    wait(HELD_AFTER_MS * 2);
    expect(bubble.pressed()).toBe(false);
    expect(bubble.holds).not.toHaveBeenCalled();
  });

  it('holds nothing once it has gone', () => {
    const bubble = mount();
    pointer('pointerdown', on('words'));
    wait(PRESSED_AFTER_MS);
    act(() => root.render(null));
    wait(HELD_AFTER_MS);
    expect(bubble.holds).not.toHaveBeenCalled();
  });
});
