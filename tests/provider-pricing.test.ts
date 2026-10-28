// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../src/results/index.html?raw';
import mmf from './fixtures/myminifactory/pricing.json';
import thingiverse from './fixtures/thingiverse/search.json';
import cults from './fixtures/cults3d/search.json';
import { normalizeMyMiniFactoryResults } from '../src/providers/myminifactory';
import { normalizeThingiverseResults } from '../src/providers/thingiverse';
import { normalizeCultsResults } from '../src/providers/cults3d';
import { filterResults, priceKind, priceLabel } from '../src/results/result-options';
import type { PriceFilter } from '../src/results/result-options';
import { createResultsView } from '../src/results/view';
import { providerAvailability } from '../src/providers/availability';
import { saveCredentials } from '../src/providers/credentials';
import { mockExtensionStorage } from './helpers/extension-storage';
const normalizeMmf = (items: unknown[]) => normalizeMyMiniFactoryResults({ items }, 'cap');
const thing = () => normalizeThingiverseResults({ hits: [thingiverse.hits[0]] }, 'cap');
const allFilters = { providerIds: new Set(['thingiverse', 'myminifactory', 'cults3d']), price: 'all' as PriceFilter, format: '' };
function mixed() { return [...thing(), ...normalizeMyMiniFactoryResults(mmf, 'cap'), ...normalizeCultsResults(cults, 'cap')]; }
beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('provider response to price state to filter', () => {
  it('keeps normal Thingiverse model results under Free without inventing a price or currency', () => {
    const results = thing();
    expect(results[0]?.isFree).toBe(true);
    expect(results[0]).not.toHaveProperty('price');
    expect(priceLabel(results[0]!)).toBe('FREE');
    expect(filterResults(results, allFilters)).toHaveLength(1);
    expect(filterResults(results, { ...allFilters, price: 'free' })).toHaveLength(1);
    expect(filterResults(results, { ...allFilters, price: 'paid' })).toHaveLength(0);
  });
  it('uses only explicit MMF store-license flags, preserving the distinction between false and missing', () => {
    const [free, paid, unknown] = normalizeMyMiniFactoryResults(mmf, 'cap');
    expect(free?.isFree).toBe(true); expect(paid?.isFree).toBe(false); expect(unknown?.isFree).toBeUndefined();
    expect(priceLabel(free!)).toBe('FREE'); expect(priceLabel(paid!)).toBe('PAID'); expect(priceLabel(unknown!)).toBeUndefined();
    for (const result of [free, paid, unknown]) expect(result).not.toHaveProperty('price');
    const all = normalizeMyMiniFactoryResults(mmf, 'cap');
    expect(filterResults(all, allFilters)).toEqual(all);
    expect(filterResults(all, { ...allFilters, price: 'free' })).toEqual([free]);
    expect(filterResults(all, { ...allFilters, price: 'paid' })).toEqual([paid]);
  });
  it.each([undefined, null, [], {}, [{ type: 'store' }], [{ type: 'store', value: 'false' }],
    [{ type: 'store', value: 0 }], [{ type: 'store', value: null }],
    [{ type: 'store', value: true }, { type: 'store', value: false }],
    [{ type: 'commercial-use', value: true }]])('does not guess MMF pricing from absent/malformed/conflicting flags: %j', (licenses) => {
    const [result] = normalizeMmf([{ name: 'Unknown', url: 'https://www.myminifactory.com/object/unknown', licenses }]);
    expect(priceKind(result!)).toBeUndefined();
  });
  it('does not infer MMF price from printing support, free-text licenses, permissions or undocumented numeric price shapes', () => {
    const [result] = normalizeMmf([{ name: 'Unknown', url: 'https://www.myminifactory.com/object/unknown',
      support_free: true, license: 'Creative Commons', price: 0, is_free: true }]);
    expect(priceKind(result!)).toBeUndefined();
    expect(result).not.toHaveProperty('price');
  });
  it('keeps Cults free/paid cents behavior and missing price unchanged', () => {
    const results = normalizeCultsResults(cults, 'cap');
    expect(results.map(priceKind)).toEqual(['free', 'paid']);
    expect(results.map((result) => result.price)).toEqual([{ amount: 0, currency: 'EUR' }, { amount: 3.25, currency: 'EUR' }]);
    expect(filterResults(results, { ...allFilters, price: 'free' })).toEqual([results[0]]);
    expect(filterResults(results, { ...allFilters, price: 'paid' })).toEqual([results[1]]);
    const unknown = normalizeCultsResults({ data: { creationsSearchBatch: { results: [{ name: 'Unknown', url: 'https://cults3d.com/en/3d-model/tool/unknown' }] } } }, 'cap');
    expect(priceKind(unknown[0]!)).toBeUndefined();
  });
  it('filters the six-result mixed set as All=6, Free=3, Paid=2 and retains unknown only under All', () => {
    const results = mixed();
    expect(results).toHaveLength(6);
    expect(filterResults(results, allFilters)).toHaveLength(6);
    expect(filterResults(results, { ...allFilters, price: 'free' }).map((result) => result.providerId)).toEqual(['thingiverse', 'myminifactory', 'cults3d']);
    expect(filterResults(results, { ...allFilters, price: 'paid' }).map((result) => result.providerId)).toEqual(['myminifactory', 'cults3d']);
  });
});

describe('normalized results through orchestration, live filter controls and paginated cards', () => {
  it('carries real adapter HTTP responses through the store and cards for All, Free and Paid with no per-result requests', async () => {
    mockExtensionStorage();
    const sources = providerAvailability.filter((source) => source.classification === 'B');
    for (const source of sources) await saveCredentials(source.id, source.createProvider().credentialFields!, {
      nickname: 'pricing-test-user', apiKey: 'FAKE-PRICING-KEY', appToken: 'FAKE-PRICING-TOKEN',
    });
    const request = vi.fn(async (endpoint: string) => {
      const origin = new URL(endpoint).origin;
      const response = origin === 'https://cults3d.com' ? cults
        : origin === 'https://www.myminifactory.com' ? mmf : { hits: [thingiverse.hits[0]], total: 1 };
      return new Response(JSON.stringify(response));
    });
    vi.stubGlobal('fetch', request);
    const view = createResultsView(document.querySelector('main')!, sources.map((source) => ({ name: source.name, provider: source.createProvider() })));
    view.search('cap'); await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelectorAll('.model-card')).toHaveLength(6);
    const filter = document.querySelector<HTMLSelectElement>('#price')!;
    filter.value = 'free'; filter.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('.model-card')).toHaveLength(3);
    expect([...document.querySelectorAll('.price-badge')].map((item) => item.textContent)).toEqual(['FREE', 'FREE', 'FREE']);
    expect(document.querySelector('#price-help')!.textContent).toContain('MyMiniFactory (1)');
    filter.value = 'paid'; filter.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('.model-card')).toHaveLength(2);
    expect(document.querySelector('#results-grid')!.textContent).toContain('PAID');
    expect(document.querySelector('#results-grid')!.textContent).toMatch(/3[.,]25 EUR/);
    expect(document.querySelector('#results-grid')!.textContent).not.toContain('Thingiverse');
    filter.value = 'all'; filter.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('.model-card')).toHaveLength(6);
    expect(request).toHaveBeenCalledTimes(3);
    view.cancel();
  });
  it('renders Free/Paid from all three adapters and appends further qualifying MMF models without clearing existing cards', async () => {
    const initial = mixed();
    const next = normalizeMmf(mmf.items.slice(0, 2).map((item, i) => ({ ...item, id: 999999971 + i, name: `More ${item.name}`, url: `${item.url}-next` })));
    const pageRequest = vi.fn(async (_query: string, cursor?: string) => ({ results: cursor ? next : initial.filter((result) => result.providerId === 'myminifactory'), nextCursor: cursor ? undefined : 'next' }));
    const view = createResultsView(document.querySelector('main')!, [
      { name: 'Thingiverse', provider: { id: 'thingiverse', search: async () => thing() } },
      { name: 'MyMiniFactory', provider: { id: 'myminifactory', search: async () => [], searchPage: pageRequest } },
      { name: 'Cults3D', provider: { id: 'cults3d', search: async () => normalizeCultsResults(cults, 'cap') } },
    ]);
    view.search('cap'); await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelectorAll('.model-card')).toHaveLength(6);
    const filter = document.querySelector<HTMLSelectElement>('#price')!;
    const select = (value: PriceFilter) => { filter.value = value; filter.dispatchEvent(new Event('change')); };
    select('free'); expect(document.querySelectorAll('.model-card')).toHaveLength(3);
    expect([...document.querySelectorAll('.model-source')].map((node) => node.textContent)).toEqual(['Thingiverse', 'MyMiniFactory', 'Cults3D']);
    const first = document.querySelector('.model-card');
    const button = document.querySelector<HTMLButtonElement>('#load-more')!;
    expect(button.hidden).toBe(false); button.click(); await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelectorAll('.model-card')).toHaveLength(4); expect(document.querySelector('.model-card')).toBe(first);
    expect(pageRequest.mock.calls.map(([, cursor]) => cursor)).toEqual([undefined, 'next']);
    select('paid'); expect(document.querySelectorAll('.model-card')).toHaveLength(3);
    expect(document.querySelector('#provider-status')!.textContent).not.toContain('failed');
    select('all'); expect(document.querySelectorAll('.model-card')).toHaveLength(8);
    view.cancel();
  });
});
