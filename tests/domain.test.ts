// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Provider } from '../src/providers/provider';
import type { ProviderSearchState, ProviderSearchStatus } from '../src/search/provider-state';
import type { ModelResult } from '../src/shared/model-result';

describe('core domain contracts', () => {
  it('requires only title, URL, and provider identity on a result', () => {
    expectTypeOf<{ title: string; url: string; providerId: string }>().toExtend<ModelResult>();
    expectTypeOf<{ url: string; providerId: string }>().not.toExtend<ModelResult>();
    expectTypeOf<{ title: string; providerId: string }>().not.toExtend<ModelResult>();
    expectTypeOf<{ title: string; url: string }>().not.toExtend<ModelResult>();
  });

  it('supports optional metadata and expanded-query provenance without default values', () => {
    const result = {
      title: 'Gear', url: 'https://example.test/models/42', providerId: 'test',
      id: '42', thumbnail: 'https://example.test/gear.png', creator: 'Maker',
      price: { amount: 2.5, currency: 'EUR' }, isFree: false,
      formats: ['stl', '3mf'], createdAt: '2026-10-27',
      popularity: 100, downloads: 0, rating: 4.5, query: 'cog',
    } satisfies ModelResult;
    expectTypeOf(result).toExtend<ModelResult>();
    expectTypeOf<{ amount: number }>().not.toExtend<NonNullable<ModelResult['price']>>();
    expectTypeOf<{ currency: string }>().not.toExtend<NonNullable<ModelResult['price']>>();
  });

  it('accepts a provider with only an ID and an async search method', async () => {
    // Test-only implementation: no repository access or production registration.
    const provider: Provider = {
      id: 'test',
      async search(query, signal) {
        if (signal?.aborted) throw new DOMException('Search aborted', 'AbortError');
        return query ? [{ title: query, url: 'https://example.test/model', providerId: this.id, query }] : [];
      },
    };
    expectTypeOf<Provider['search']>().parameters.toEqualTypeOf<[string, AbortSignal?]>();
    expectTypeOf<Provider['search']>().returns.toEqualTypeOf<Promise<ModelResult[]>>();
    const [result] = await provider.search('cog');
    expect(result).toEqual({ title: 'cog', url: 'https://example.test/model', providerId: 'test', query: 'cog' });
    expect(result?.isFree).toBeUndefined();
    expect(await provider.search('')).toEqual([]);
    const controller = new AbortController();
    controller.abort();
    await expect(provider.search('gear', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('distinguishes all requested states and requires data only where relevant', () => {
    expectTypeOf<ProviderSearchStatus>().toEqualTypeOf<
      'idle' | 'searching' | 'success' | 'no-results' | 'failed' | 'timed-out' | 'disabled'
    >();
    expectTypeOf<{ providerId: string; status: 'idle' }>().toExtend<ProviderSearchState>();
    expectTypeOf<{ providerId: string; status: 'disabled' }>().toExtend<ProviderSearchState>();
    expectTypeOf<{ providerId: string; status: 'searching' }>().not.toExtend<ProviderSearchState>();
    expectTypeOf<{ providerId: string; status: 'success'; query: string }>().not.toExtend<ProviderSearchState>();
    expectTypeOf<{ providerId: string; status: 'failed'; query: string }>().not.toExtend<ProviderSearchState>();
    expectTypeOf<Extract<ProviderSearchState, { status: 'success' }>['results']>().toEqualTypeOf<ModelResult[]>();
    expectTypeOf<Extract<ProviderSearchState, { status: 'failed' }>['error']>().toEqualTypeOf<string>();
  });
});
