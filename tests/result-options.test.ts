// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { ModelResult } from '../src/shared/model-result';
import { canSort, filterResults, priceKind, priceLabel, sortResults } from '../src/results/result-options';
import type { SortOrder } from '../src/results/result-options';

const model = (title: string, metadata: Partial<ModelResult> = {}): ModelResult => ({
  title, providerId: 'a', url: `https://example.test/${title}`, ...metadata,
});
const unknown = model('Unknown');
const low = model('Low', { price: { amount: 2, currency: 'EUR' }, downloads: 0, rating: 3, popularity: 10, createdAt: '2026-01-01', formats: ['stl'] });
const high = model('High', { price: { amount: 5, currency: 'EUR' }, downloads: 100, rating: 5, popularity: 80, createdAt: '2026-10-01', formats: ['3mf'] });

describe('result filtering', () => {
  it.each([null, 'false', 'true', 0, 1, {}])('does not coerce malformed isFree metadata into free or paid: %j', (isFree) => {
    const malformed = { ...unknown, isFree } as unknown as ModelResult;
    expect(priceKind(malformed)).toBeUndefined();
    expect(priceLabel(malformed)).toBeUndefined();
  });
  it('mixes repositories by default and combines repository, price, and format selections', () => {
    const other = model('Other', { providerId: 'b', isFree: true, formats: ['stl'] });
    const results = [low, other, unknown, high];
    const all = { providerIds: new Set(['a', 'b']), price: 'all' as const, format: '' };
    expect(filterResults(results, all)).toEqual(results);
    expect(filterResults(results, { ...all, providerIds: new Set(['b']) })).toEqual([other]);
    expect(filterResults(results, { ...all, price: 'free', format: 'stl' })).toEqual([other]);
    expect(filterResults(results, { ...all, price: 'paid', format: 'stl' })).toEqual([low]);
    expect(filterResults(results, { ...all, providerIds: new Set() })).toEqual([]);
  });

  it('keeps unknown price and formats unknown rather than treating missing values as free', () => {
    expect(priceKind(unknown)).toBeUndefined();
    expect(priceLabel(unknown)).toBeUndefined();
    expect(priceKind(model('Free', { isFree: true }))).toBe('free');
    expect(priceKind(model('Zero', { price: { amount: 0, currency: 'EUR' } }))).toBe('free');
    expect(priceKind(model('Paid', { isFree: false }))).toBe('paid');
    expect(priceLabel(model('Paid', { isFree: false }))).toBe('PAID');
    expect(priceKind(model('Invalid', { price: { amount: NaN, currency: 'EUR' } }))).toBeUndefined();
    expect(priceKind(model('Invalid', { price: { amount: -1, currency: 'EUR' } }))).toBeUndefined();
  });
});

describe('honest sorting', () => {
  it('preserves arrival/native ordering for Best match without mutating the input', () => {
    const input = [unknown, low, high];
    expect(sortResults(input, 'best')).toEqual(input);
    expect(sortResults(input, 'price-desc')).toEqual([high, low, unknown]);
    expect(input).toEqual([unknown, low, high]);
  });

  it.each<SortOrder>(['latest', 'popularity', 'downloads', 'rating', 'price-desc'])('sorts %s with missing metadata last', (order) => {
    expect(canSort([unknown, low, high], order)).toBe(true);
    expect(sortResults([unknown, low, high], order)).toEqual([high, low, unknown]);
  });

  it('sorts ascending reported prices, keeps unknown prices last, and preserves ties', () => {
    const tie = model('Tie', { price: { amount: 2, currency: 'EUR' } });
    expect(sortResults([high, unknown, tie, low], 'price-asc')).toEqual([tie, low, high, unknown]);
  });

  it('disables unavailable sorts, mixed currencies, and incomparable popularity scores', () => {
    const usd = model('USD', { price: { amount: 3, currency: 'USD' }, popularity: 100, providerId: 'b' });
    expect(canSort([unknown, low], 'latest')).toBe(false);
    expect(canSort([unknown, low], 'downloads')).toBe(false);
    expect(canSort([low, usd], 'price-asc')).toBe(false);
    expect(sortResults([low, usd], 'price-desc')).toEqual([low, usd]);
    expect(canSort([low, usd], 'popularity')).toBe(false);
    expect(canSort([low, high], 'popularity')).toBe(true);
    expect(canSort([low, model('Bad', { createdAt: 'invalid', downloads: Infinity, rating: 7 })], 'latest')).toBe(false);
    expect(canSort([low, model('Bad', { downloads: Infinity })], 'downloads')).toBe(false);
    expect(canSort([low, model('Bad', { rating: 7 })], 'rating')).toBe(false);
  });
});
