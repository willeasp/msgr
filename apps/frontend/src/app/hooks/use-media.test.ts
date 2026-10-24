// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromBase64, type Bits } from '@msgr/media';
import { toWire, type KeptPicture } from '../../lib/picture-wire';
import { pictures } from '../data/media';
import { useMediaRetry } from './use-media';
import { usePicture } from './use-picture';

// jsdom's Blob can't stream(), which inflating a picture needs.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, Blob: NodeBlob });

let n = 0;
const picture = (): KeptPicture => ({
  width: 8,
  height: 2,
  url: `/media/h${++n}/picture`,
});
const bits: Bits = { width: 8, height: 2, bytes: Uint8Array.of(0xa5, 0x5a) };
const ok = async () =>
  new Response(
    fromBase64((await toWire(bits)).bits) as Uint8Array<ArrayBuffer>,
    {
      headers: { 'Content-Type': 'application/octet-stream' },
    }
  );
const settle = () => act(() => new Promise((done) => setTimeout(done, 20)));
/** Settles until `check` holds, two seconds at most: however busy the machine. */
async function until(check: () => void) {
  for (let waited = 0; ; waited += 10) {
    try {
      check();
      return;
    } catch (error) {
      if (waited >= 2000) throw error;
    }
    await act(() => new Promise((done) => setTimeout(done, 10)));
  }
}

function mount() {
  let last: Bits | null = null;
  const Probe = ({ p, near }: { p: KeptPicture; near: boolean }) => {
    useMediaRetry();
    last = usePicture(p, near);
    return null;
  };
  const root = createRoot(document.createElement('div'));
  return {
    render: (p: KeptPicture, near = true) =>
      act(() =>
        root.render(
          createElement(StrictMode, null, createElement(Probe, { p, near }))
        )
      ),
    last: () => last,
    unmount: () => act(() => root.unmount()),
  };
}
afterEach(() => vi.unstubAllGlobals());

describe('usePicture', () => {
  it('shows a picture once fetched, under StrictMode, fetching it once', async () => {
    const fetch = vi.fn(ok);
    vi.stubGlobal('fetch', fetch);
    const view = mount();
    await view.render(picture());
    await until(() => expect(view.last()).toEqual(bits));
    expect(fetch).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("never shows the last address's picture while the next loads", async () => {
    vi.stubGlobal('fetch', vi.fn(ok));
    const view = mount();
    await view.render(picture());
    await until(() => expect(view.last()).toEqual(bits));
    let respond = (_: Response) => undefined as void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((done) => (respond = done)))
    );
    await view.render(picture());
    expect(view.last()).toBeNull();
    respond(await ok());
    await until(() => expect(view.last()).toEqual(bits));
    await view.unmount();
  });

  it('fetches nothing until near, but shows one already here at once', async () => {
    const fetch = vi.fn(ok);
    vi.stubGlobal('fetch', fetch);
    const far = picture();
    const view = mount();
    await view.render(far, false);
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    await view.render(far, true);
    await until(() => expect(view.last()).toEqual(bits));

    const kept = picture();
    pictures.keep(kept, bits);
    await view.render(kept, false);
    expect(view.last()).toBe(bits);
    await view.unmount();
  });

  it('shows the picture once the network is back, without a remount', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockImplementation(ok)
    );
    const p = picture();
    const view = mount();
    await view.render(p);
    await until(() => expect(pictures.now(p)).toEqual({ state: 'failed' }));
    expect(view.last()).toBeNull();
    await act(() => window.dispatchEvent(new Event('online')));
    await until(() => expect(view.last()).toEqual(bits));
    await view.unmount();
  });

  it('shows what the viewer sent as soon as it is kept', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined))
    );
    const p = picture();
    const view = mount();
    await view.render(p);
    await act(() => pictures.keep(p, bits));
    expect(view.last()).toBe(bits);
    await view.unmount();
  });
});
