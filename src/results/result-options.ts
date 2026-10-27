// SPDX-License-Identifier: GPL-3.0-or-later
import type { ModelResult } from '../shared/model-result';

export type PriceFilter = 'all' | 'free' | 'paid';
export interface ResultFilters {
  providerIds: ReadonlySet<string>;
  price: PriceFilter;
  format: string;
}

export const SORTS = [
  ['best', 'Best match'], ['latest', 'Latest'], ['popularity', 'Popularity'],
  ['downloads', 'Most downloaded'], ['rating', 'Highest rated'],
  ['price-asc', 'Price low to high'], ['price-desc', 'Price high to low'],
] as const;
export type SortOrder = typeof SORTS[number][0];

export function knownPrice(result: ModelResult) {
  const price = result.price;
  return price && Number.isFinite(price.amount) && price.amount >= 0 && /^[A-Z]{3}$/.test(price.currency)
    ? price : undefined;
}

export function priceKind(result: ModelResult): 'free' | 'paid' | undefined {
  if (result.isFree !== undefined) return result.isFree ? 'free' : 'paid';
  const price = knownPrice(result);
  return price ? (price.amount === 0 ? 'free' : 'paid') : undefined;
}

export function priceLabel(result: ModelResult): string | undefined {
  if (priceKind(result) === 'free') return 'FREE';
  const price = knownPrice(result);
  if (price) return `${price.amount.toLocaleString(undefined, { maximumFractionDigits: 20 })} ${price.currency}`;
  return result.isFree === false ? 'PAID' : undefined;
}

export function filterResults(results: readonly ModelResult[], filters: ResultFilters): ModelResult[] {
  return results.filter((result) => filters.providerIds.has(result.providerId)
    && (filters.price === 'all' || priceKind(result) === filters.price)
    && (!filters.format || result.formats?.includes(filters.format)));
}

function sortValue(result: ModelResult, order: SortOrder): number | undefined {
  let value: number | undefined;
  switch (order) {
    case 'latest': value = result.createdAt ? Date.parse(result.createdAt) : undefined; break;
    case 'popularity': value = result.popularity; break;
    case 'downloads': value = result.downloads; break;
    case 'rating': value = result.rating; break;
    case 'price-asc': case 'price-desc': value = knownPrice(result)?.amount; break;
    default: return undefined;
  }
  if (value === undefined || !Number.isFinite(value)) return undefined;
  if (order !== 'latest' && value < 0) return undefined;
  if (order === 'rating' && value > 5) return undefined;
  return value;
}

export function canSort(results: readonly ModelResult[], order: SortOrder): boolean {
  if (order === 'best') return true;
  if (results.filter((result) => sortValue(result, order) !== undefined).length < 2) return false;
  if (order === 'popularity' && new Set(results.map((result) => result.providerId)).size > 1) return false;
  if (order.startsWith('price-')) {
    const currencies = new Set(results.flatMap((result) => {
      const price = knownPrice(result);
      return price ? [price.currency] : [];
    }));
    if (currencies.size !== 1) return false;
  }
  return true;
}

export function sortResults(results: readonly ModelResult[], order: SortOrder): ModelResult[] {
  if (!canSort(results, order) || order === 'best') return [...results];
  return [...results].sort((a, b) => {
    const left = sortValue(a, order);
    const right = sortValue(b, order);
    if (left === undefined) return right === undefined ? 0 : 1;
    if (right === undefined) return -1;
    return order === 'price-asc' ? left - right : right - left;
  });
}
