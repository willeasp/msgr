import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/*
 * public/sw.js, run as the browser would after a build wrote its VERSION and
 * SHELL in (vite.config.ts), against an in-memory CacheStorage and network.
 */
const SOURCE = readFileSync(
  new URL('../../../public/sw.js', import.meta.url),
  'utf8'
);
const ORIGIN = 'https://msgr.test';

/** The server: a path's body for each version deployed, or a network failure. */
type Network = { files: Map<string, string>; down: Set<string> };

function cacheStorage(network: Network) {
  const stores = new Map<string, Map<string, Response>>();
  const path = (key: string | Request) =>
    new URL(typeof key === 'string' ? key : key.url, ORIGIN).pathname;
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      async addAll(urls: string[]) {
        // Atomic, as in browsers: one failure stores nothing.
        const responses = await Promise.all(
          urls.map(async (url) => [path(url), await fetch(url)] as const)
        );
        for (const [at, response] of responses) store.set(at, response);
      },
      async put(key: string | Request, response: Response) {
        store.set(path(key), response);
      },
      match: async (key: string | Request) => store.get(path(key))?.clone(),
    };
  };
  const fetch = async (key: string | Request) => {
    const at = path(key);
    if (network.down.has(at)) throw new TypeError('Failed to fetch');
    const body = network.files.get(at);
    return new Response(body ?? 'not found', { status: body ? 200 : 404 });
  };
  return {
    stores,
    fetch,
    caches: {
      open,
      keys: async () => [...stores.keys()],
      has: async (name: string) => stores.has(name),
      delete: async (name: string) => stores.delete(name),
      match: async (key: string | Request) => {
        for (const store of stores.values()) {
          const hit = store.get(path(key));
          if (hit) return hit.clone();
        }
        return undefined;
      },
    },
  };
}

/** One build of the service worker, installed and (if that works) activated. */
async function deploy(
  env: ReturnType<typeof cacheStorage>,
  version: string,
  shell: string[]
) {
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      listeners.set(type, listener),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  runInNewContext(
    SOURCE.replace(
      "const VERSION = 'development';",
      `const VERSION = '${version}';`
    ).replace('const SHELL = [];', `const SHELL = ${JSON.stringify(shell)};`),
    { self, caches: env.caches, fetch: env.fetch, URL, Response }
  );
  const fire = (type: string, event: unknown) => {
    const listener = listeners.get(type);
    if (!listener) throw new Error(`sw.js listens for no ${type}`);
    listener(event);
  };
  const lifecycle = async (type: string) => {
    let work: Promise<unknown> = Promise.resolve();
    fire(type, { waitUntil: (p: Promise<unknown>) => (work = p) });
    await work;
  };
  await lifecycle('install');
  await lifecycle('activate');
  /** What the worker answers for a request: a body, or null when it lets it pass. */
  return async (url: string, init: { method?: string; mode?: string } = {}) => {
    let answer = null as Promise<Response> | null;
    fire('fetch', {
      request: {
        url: new URL(url, ORIGIN).href,
        method: init.method ?? 'GET',
        mode: init.mode ?? 'cors',
      },
      respondWith: (response: Promise<Response>) => (answer = response),
    });
    return answer ? (await answer).text() : null;
  };
}

const build = (network: Network, version: string) => {
  const shell = ['/index.html', `/assets/index-${version}.js`, '/boot.js'];
  network.files.set(
    '/index.html',
    `<script src="/assets/index-${version}.js">`
  );
  network.files.set(`/assets/index-${version}.js`, `app ${version}`);
  network.files.set('/boot.js', `boot ${version}`);
  return shell;
};

describe('the shell (public/sw.js)', () => {
  it('lets through everything only the server can answer', async () => {
    const network: Network = { files: new Map(), down: new Set() };
    const env = cacheStorage(network);
    const ask = await deploy(env, 'v1', build(network, 'v1'));

    for (const [url, init] of [
      ['/graphql', { method: 'POST' }],
      ['/graphql', { mode: 'navigate' }],
      ['/healthz', {}],
      ['/media/m1/picture', { mode: 'navigate' }],
      ['/avatars/u1/3', {}],
      ['/index.html', { method: 'HEAD' }],
      ['https://elsewhere.test/index.html', { mode: 'navigate' }],
    ] as const) {
      expect([url, await ask(url, init)]).toEqual([url, null]);
    }
  });

  it("opens every route from this version's index.html, with no network", async () => {
    const network: Network = { files: new Map(), down: new Set() };
    const env = cacheStorage(network);
    const ask = await deploy(env, 'v1', build(network, 'v1'));
    network.down = new Set(['/index.html', '/assets/index-v1.js']);

    for (const route of ['/', '/c123', '/invite/abc', '/login', '/admin']) {
      expect(await ask(route, { mode: 'navigate' })).toContain('index-v1.js');
    }
    expect(await ask('/assets/index-v1.js')).toBe('app v1');
  });

  it('keeps the shell an open page runs, even after an update failed to install', async () => {
    const network: Network = { files: new Map(), down: new Set() };
    const env = cacheStorage(network);
    await deploy(env, 'v1', build(network, 'v1')); // An open page runs v1.

    // v2 is deployed while the phone is between networks: its install fails.
    const v2 = build(network, 'v2');
    network.down = new Set(['/assets/index-v2.js']);
    await expect(deploy(env, 'v2', v2)).rejects.toThrow('Failed to fetch');
    network.down = new Set();

    // v3 installs and takes over the page still running v1.
    const ask = await deploy(env, 'v3', build(network, 'v3'));
    network.files.delete('/assets/index-v1.js'); // The server has only v3's.

    expect(await ask('/assets/index-v1.js')).toBe('app v1');
    expect(
      [...env.stores.keys()].filter((name) => name.includes('shell'))
    ).toEqual(['msgr-shell-v1', 'msgr-shell-v3']);
  });

  it('keeps the shell an open page runs after a rollback, and only that one', async () => {
    const network: Network = { files: new Map(), down: new Set() };
    const env = cacheStorage(network);
    await deploy(env, 'v1', build(network, 'v1'));
    await deploy(env, 'v2', build(network, 'v2'));
    await deploy(env, 'v1', build(network, 'v1')); // v2 is rolled back.
    const ask = await deploy(env, 'v3', build(network, 'v3'));
    network.files.delete('/assets/index-v1.js');

    expect(await ask('/assets/index-v1.js')).toBe('app v1');
    expect(
      [...env.stores.keys()].filter((name) => name.includes('shell'))
    ).toEqual(['msgr-shell-v1', 'msgr-shell-v3']);
  });
});
