// SPDX-License-Identifier: GPL-3.0-or-later
import type { Provider, ResultPage } from './provider';
import { nextOffset, offsetNumber } from './pagination';
import type { ModelResult } from '../shared/model-result';
import { normalizeQuery } from '../search/query';
import { credentialFreeResults, loadCredentials, SetupRequired } from './credentials';
import type { CredentialField } from './credentials';

export interface CultsCredentials { nickname: string; apiKey: string }
export const cultsCredentialFields: readonly CredentialField[] = [
  { name: 'nickname', label: 'Cults3D nickname', secret: false },
  { name: 'apiKey', label: 'Cults3D API key (not your password)', secret: true },
];
async function storedCredentials(): Promise<CultsCredentials | undefined> {
  const values = await loadCredentials('cults3d', cultsCredentialFields);
  return values ? { nickname: values.nickname!, apiKey: values.apiKey! } : undefined;
}
const ENDPOINT = 'https://cults3d.com/graphql';
const SEARCH = `query SearchModels($query: String!) {
  creationsSearchBatch(query: $query, limit: 20) {
    total
    results {
      name(locale: EN)
      url(locale: EN)
      illustrationImageUrl
      creator { nick }
      price(currency: EUR) { cents }
      downloadsCount
      likesCount
    }
  }
}`;
// Preserve the working first-page operation; continuation arguments are only sent on Load more.
const NEXT_SEARCH = SEARCH.replace('$query: String!', '$query: String!, $offset: Int!')
  .replace('limit: 20)', 'limit: 20, offset: $offset)');

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
function url(value: unknown, model = false): string | undefined {
  try {
    const parsed = new URL(text(value) ?? '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return;
    if (model && !['cults3d.com', 'www.cults3d.com'].includes(parsed.hostname)) return;
    return parsed.href;
  } catch { return undefined; }
}
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Search aborted', 'AbortError');
}

/** Accept only the documented search envelope; unknown optional metadata is omitted. */
export function normalizeCultsResults(payload: unknown, query: string): ModelResult[] {
  const root = record(payload);
  if (root?.errors !== undefined && (!Array.isArray(root.errors) || root.errors.length > 0)) {
    // Do not forward server messages that could echo credentials or request data.
    throw new Error('Cults3D API rejected the search. Try opening Cults3D directly.');
  }
  const batch = record(record(root?.data)?.creationsSearchBatch);
  if (!Array.isArray(batch?.results)) throw new Error('Cults3D returned an unexpected search response.');
  const results: ModelResult[] = [];
  for (const value of batch.results) {
    const item = record(value);
    const title = text(item?.name);
    const modelUrl = url(item?.url, true);
    if (!item || !title || !modelUrl) continue;
    const result: ModelResult = { title, url: modelUrl, providerId: 'cults3d', query };
    const thumbnail = url(item.illustrationImageUrl);
    const creator = text(record(item.creator)?.nick);
    const downloads = count(item.downloadsCount);
    const likes = count(item.likesCount);
    const cents = count(record(item.price)?.cents);
    if (thumbnail) result.thumbnail = thumbnail;
    if (creator) result.creator = creator;
    if (downloads !== undefined) result.downloads = downloads;
    if (likes !== undefined) result.popularity = likes;
    if (cents !== undefined) {
      result.price = { amount: cents / 100, currency: 'EUR' };
      result.isFree = cents === 0;
    }
    // Publication dates, file types, and star ratings are deliberately not inferred.
    results.push(result);
  }
  if (batch.results.length && !results.length) throw new Error('Cults3D returned no usable model records.');
  return results;
}

export function cultsSearchUrl(query: string): string {
  const target = new URL('https://cults3d.com/en/search');
  target.searchParams.set('q', normalizeQuery(query));
  return target.href;
}

function authorization(credentials: CultsCredentials): string {
  const nickname = credentials.nickname.trim();
  const key = credentials.apiKey.trim();
  if (!nickname || !key || /[:\r\n]/.test(nickname) || /[\r\n]/.test(key)) {
    throw new Error('A valid Cults3D nickname and API key are required. Use an API key, not your account password.');
  }
  const bytes = new TextEncoder().encode(`${nickname}:${key}`);
  return `Basic ${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`;
}

function retryTime(headers: Headers): number {
  const now = Date.now();
  const retry = headers.get('retry-after');
  const reset = Number(headers.get('x-ratelimit-reset')) * 1000;
  const candidate = retry
    ? (/^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry))
    : reset;
  // A local one-minute cooldown if the server supplies no usable reset time.
  return Number.isFinite(candidate) && candidate >= now ? candidate : now + 60_000;
}

/** Credentials are supplied by the caller; never bundled, logged, or persisted here. */
export function createCultsProvider(
  getCredentials: () => CultsCredentials | undefined | Promise<CultsCredentials | undefined> = storedCredentials,
): Provider {
  let blockedUntil = 0;
  async function searchPage(rawQuery: string, cursor?: string, signal?: AbortSignal): Promise<ResultPage> {
    const offset = offsetNumber(cursor);
    checkAbort(signal);
    const query = normalizeQuery(rawQuery);
    if (!query) return { results: [] };
    let credentials: CultsCredentials | undefined;
    try { credentials = await getCredentials(); }
    catch {
      checkAbort(signal);
      throw new Error('Cults3D configuration could not be loaded. Check extension local storage.');
    }
    // Extension storage cannot be aborted; never launch a request after a stale read.
    checkAbort(signal);
    if (!credentials?.nickname.trim() || !credentials.apiKey.trim()) throw new SetupRequired();
    const auth = authorization(credentials);
    if (Date.now() < blockedUntil) throw new Error('Cults3D rate limit reached. Please wait before searching again.');
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(cursor === undefined ? { query: SEARCH, variables: { query } }
          : { query: NEXT_SEARCH, variables: { query, offset } }),
      });
    } catch {
      checkAbort(signal);
      throw new Error('Could not reach Cults3D. Try opening Cults3D directly.');
    }
    checkAbort(signal);
    if (response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0') {
      blockedUntil = retryTime(response.headers);
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Cults3D denied access. Check your API key or open Cults3D directly.');
      if (response.status === 429) throw new Error('Cults3D rate limit reached. Please wait before searching again.');
      throw new Error(`Cults3D search failed (HTTP ${response.status}). Try opening Cults3D directly.`);
    }
    let payload: unknown;
    try { payload = await response.json(); }
    catch {
      checkAbort(signal);
      throw new Error('Cults3D returned an unreadable response.');
    }
    checkAbort(signal);
    const results = credentialFreeResults(normalizeCultsResults(payload, query), [credentials.apiKey.trim(), auth.slice('Basic '.length)]);
    const batch = record(record(record(payload)?.data)?.creationsSearchBatch)!;
    return { results, nextCursor: nextOffset(offset, (batch.results as unknown[]).length, batch.total) };
  }
  return {
    id: 'cults3d', credentialFields: cultsCredentialFields,
    search: async (query, signal) => (await searchPage(query, undefined, signal)).results,
    searchPage,
  };
}
