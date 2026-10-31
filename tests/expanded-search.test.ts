// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import html from '../src/results/index.html?raw';
import { SearchOrchestrator } from '../src/search/orchestrator';
import type { SearchSnapshot } from '../src/search/orchestrator';
import { mockExtensionStorage } from './helpers/extension-storage';
import { testLexicalEngine } from './helpers/lexicon';
import { mockPrintablesRuntime } from './helpers/printables-runtime';

let storage: ReturnType<typeof mockExtensionStorage>;
const requests: { query: string; offset: number }[] = [];
const lexicalRequests: string[] = [];
const lexicalEngine = testLexicalEngine();
const queries = await lexicalEngine.expand('gear');
const handyQueries = await lexicalEngine.expand('Handyhalter');
function position(options: RequestInit) {
  const operation: string = JSON.parse(options.body as string).query;
  return { query: JSON.parse(operation.match(/query: ("(?:\\.|[^"\\])*")/)![1]!) as string,
    offset: Number(operation.match(/offset: (\d+)/)![1]) };
}
function response(query: string, offset: number) {
  const index = Math.max(0, queries.indexOf(query));
  const ids = offset ? [100 + index] : [1, 10 + index];
  return new Response(JSON.stringify({ data: { searchPrints2: { totalCount: 3,
    items: ids.map((id) => ({ id: String(id), name: `${query} ${id}`, slug: `model-${id}` })),
  } } }));
}
function installFetch(delay?: (query: string, offset: number) => Promise<Response> | undefined) {
  const request = vi.fn(async (url: string, options: RequestInit = {}) => {
    if (url.startsWith('chrome-extension://test-extension/lexical-data/')) {
      lexicalRequests.push(url);
      const relative = new URL(url).pathname.replace(/^\//, '');
      return new Response(readFileSync(resolve(`public/${relative}`), 'utf8'), { status: 200 });
    }
    // Actual provider + worker handler: expansion may not introduce another destination.
    expect(url).toBe('https://api.printables.com/graphql/');
    const { query, offset } = position(options);
    requests.push({ query, offset });
    return delay?.(query, offset) ?? response(query, offset);
  });
  vi.stubGlobal('fetch', request);
  return request;
}
async function start(query = 'gear', expanded = true) {
  window.history.replaceState(null, '', `/src/results/index.html?${new URLSearchParams({ q: query, ...(expanded ? { expanded: '1' } : {}) })}`);
  await import('../src/results/main');
  await vi.advanceTimersByTimeAsync(0);
}
async function submit(query: string, expanded: boolean) {
  document.querySelector<HTMLInputElement>('#query')!.value = query;
  document.querySelector<HTMLInputElement>('#expanded')!.checked = expanded;
  document.querySelector<HTMLFormElement>('#search-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.advanceTimersByTimeAsync(0);
}
async function more() {
  const button = document.querySelector<HTMLButtonElement>('#load-more')!;
  expect(button.hidden).toBe(false);
  expect(button.disabled).toBe(false);
  button.click(); await vi.advanceTimersByTimeAsync(0);
}
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); localStorage.clear(); requests.length = 0; lexicalRequests.length = 0;
  storage = mockExtensionStorage(); storage.data['tridijump.repositories'] = { sketchfab: false }; mockPrintablesRuntime();
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
});
afterEach(() => {
  window.dispatchEvent(new Event('pagehide')); document.body.replaceChildren();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('OFF sends only the original query through the actual Results entry and worker', async () => {
  storage.data['tridijump.preferences'] = { theme: 'system', historyEnabled: false, expandedDefault: true };
  installFetch(); await start('gear', false);
  expect(requests).toEqual([{ query: 'gear', offset: 0 }]);
  expect(document.querySelectorAll('.model-card')).toHaveLength(2);
  expect(document.querySelector<HTMLElement>('#expanded-terms')!.hidden).toBe(true);
  expect(document.querySelector('#expanded-terms')!.textContent).toBe('');
  expect(lexicalRequests).toHaveLength(0);
});

it('uses the saved default on a new empty Results page and expands the next submitted query', async () => {
  storage.data['tridijump.preferences'] = { theme: 'system', historyEnabled: false, expandedDefault: true };
  installFetch(); window.history.replaceState(null, '', '/src/results/index.html');
  await import('../src/results/main'); await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector<HTMLInputElement>('#expanded')!.checked).toBe(true);
  expect(requests).toHaveLength(0);
  expect(document.querySelector<HTMLElement>('#expanded-terms')!.hidden).toBe(true);
  await submit('gear', true);
  expect(requests).toEqual(queries.map((query) => ({ query, offset: 0 })));
});

it('ON progressively inserts bounded variants, deduplicates cards, retains original history and native links, and skips unconfigured sources once', async () => {
  storage.data['tridijump.preferences'] = { theme: 'system', historyEnabled: true, expandedDefault: false };
  installFetch(); await start();
  expect(requests).toEqual(queries.map((query) => ({ query, offset: 0 })));
  expect(document.querySelectorAll('.model-card')).toHaveLength(5);
  expect(document.querySelector<HTMLElement>('#expanded-terms')!.hidden).toBe(false);
  expect(document.querySelector('#expanded-terms')!.textContent).toBe(`Additional search terms: ${queries.slice(1).join(' · ')}`);
  expect(storage.data['tridijump.history']).toEqual(['gear']);
  for (const id of ['cults3d', 'thingiverse', 'myminifactory']) {
    expect(storage.local.get.mock.calls.filter(([key]) => key === `tridijump.credentials.${id}`)).toHaveLength(1);
  }
  expect(document.querySelectorAll('[data-status="setup-required"]')).toHaveLength(3);
  const links = [...document.querySelectorAll<HTMLAnchorElement>('#native-searches a')];
  expect(links).toHaveLength(6);
  expect(links.every((link) => decodeURIComponent(link.href).includes('gear'))).toBe(true);
  expect(document.querySelector('#fallback-status')!.textContent).toContain('MakerWorld: direct search only');
  expect(document.querySelector('#fallback-status')!.textContent).toContain('Thangs: direct search only');
  await more();
  expect(requests).toHaveLength(5); // Exactly one continuation, not four.
  for (const id of ['cults3d', 'thingiverse', 'myminifactory']) {
    expect(storage.local.get.mock.calls.filter(([key]) => key === `tridijump.credentials.${id}`)).toHaveLength(1);
  }
});

it('keeps each variant cursor independent and loads at most one continuation per provider per click', async () => {
  installFetch(); await start();
  for (let i = 0; i < 4; i++) {
    await more();
    expect(requests).toHaveLength(5 + i);
    expect(requests.at(-1)).toEqual({ query: queries[i], offset: 2 });
  }
  expect(document.querySelectorAll('.model-card')).toHaveLength(9);
  expect(document.querySelector<HTMLButtonElement>('#load-more')!.hidden).toBe(true);
});

it('does not execute disabled providers or check their credentials even with actual useful variants', async () => {
  storage.data['tridijump.repositories'] = { printables: false, sketchfab: false, thingiverse: false };
  installFetch(); await start();
  expect(requests).toHaveLength(0);
  expect(document.querySelectorAll('[data-status="disabled"]')).toHaveLength(3);
  expect(storage.local.get.mock.calls.some(([key]) => key === 'tridijump.credentials.thingiverse')).toBe(false);
  expect(document.querySelector('#native-searches a[data-provider-id="printables"]')).toBeNull();
});

it.each(['variant first page', 'variant continuation'])('a new ordinary search invalidates a pending old %s and all old cursors', async (pending) => {
  let release!: (value: Response) => void;
  const delayedVariant = queries[1]!;
  installFetch((query, offset) => query === delayedVariant && offset === (pending === 'variant first page' ? 0 : 2)
    ? new Promise<Response>((resolve) => { release = resolve; }) : undefined);
  await start();
  if (pending === 'variant first page') {
    expect(document.querySelectorAll('.model-card')).toHaveLength(2);
    expect(document.querySelector('#result-count')!.textContent).toContain('Searching 1 repository');
  }
  if (pending === 'variant continuation') { await more(); await more(); }
  expect(release).toBeDefined();
  const oldCount = requests.length;
  await submit('xyzzy', false);
  expect(requests).toHaveLength(oldCount + 1);
  release(response(delayedVariant, pending === 'variant first page' ? 0 : 2));
  await vi.advanceTimersByTimeAsync(0);
  expect(requests).toHaveLength(oldCount + 1); // No remaining old variants dispatched.
  const cards = [...document.querySelectorAll('.model-card')];
  expect(cards).toHaveLength(2);
  expect(cards.every((card) => card.textContent!.includes('xyzzy'))).toBe(true);
  expect(document.querySelector('[data-provider-id="printables"]')?.getAttribute('href')).toContain('xyzzy');
  await more();
  expect(requests.at(-1)).toEqual({ query: 'xyzzy', offset: 2 });
  expect(document.querySelector('#provider-status')!.textContent).not.toContain('failed');
});

it('an unknown query stays original-only even with Expanded Search on', async () => {
  installFetch(); await start('xyzzy');
  expect(requests).toEqual([{ query: 'xyzzy', offset: 0 }]);
  expect(document.querySelector('#expanded-terms')!.textContent).toContain('Searching the original query only.');
});

it('updates displayed alternatives on resubmit and clears them when expansion is switched off', async () => {
  installFetch(); await start();
  await submit('Handyhalter', true);
  const terms = document.querySelector<HTMLElement>('#expanded-terms')!;
  expect(terms.textContent).toBe(`Additional search terms: ${handyQueries.slice(1).join(' · ')}`);
  expect(terms.textContent).not.toContain(queries[1]!);
  await submit('xyzzy', true);
  expect(terms.hidden).toBe(false);
  expect(terms.textContent).toContain('No useful related terms found');
  await submit('gear', false);
  expect(terms.hidden).toBe(true);
  expect(terms.textContent).toBe('');
});

it('renders untrusted alternative strings as text without injecting markup', async () => {
  installFetch(); await start('<img src=x onerror=alert(1)> gear');
  const terms = document.querySelector('#expanded-terms')!;
  expect(terms.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(terms.children).toHaveLength(0);
});

it('variant hits render before a later variant finishes, retaining first matched-query provenance', async () => {
  let latest!: SearchSnapshot;
  let release!: () => void;
  const runner = new SearchOrchestrator((update) => { latest = update; });
  const delayedVariant = queries[1]!;
  const search = vi.fn(async (query: string) => {
    if (query === delayedVariant) await new Promise<void>((resolve) => { release = resolve; });
    return [{ providerId: 'test', id: 'same', title: query, url: 'https://example.test/model' }];
  });
  runner.start('gear', [{ id: 'test', search }], { expandedQueries: queries.slice(1) });
  await vi.advanceTimersByTimeAsync(0);
  expect(latest.results).toHaveLength(1);
  expect(latest.results[0]?.query).toBe('gear');
  expect(latest.states[0]?.status).toBe('searching');
  release(); await vi.advanceTimersByTimeAsync(0);
  expect(search.mock.calls.map(([query]) => query)).toEqual(queries);
  expect(latest.results).toHaveLength(1);
  expect(latest.results[0]?.query).toBe('gear');
  runner.cancel();
});
