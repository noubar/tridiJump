// SPDX-License-Identifier: GPL-3.0-or-later
import type { Provider, ResultPage } from './provider';
import { nextPage, pageNumber, PAGE_SIZE } from './pagination';
import type { ModelResult } from '../shared/model-result';
import { credentialFreeResults, loadCredentials, SetupRequired } from './credentials';
import type { CredentialField } from './credentials';
import { normalizeQuery } from '../search/query';

export const myMiniFactoryCredentialFields: readonly CredentialField[] = [
  { name: 'apiKey', label: 'MyMiniFactory API key (not client secret or password)', secret: true },
];
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
function url(value: unknown, model = false): string | undefined {
  try {
    const target = new URL(text(value) ?? '');
    if (target.protocol !== 'https:' || target.username || target.password) return;
    if (model && !['www.myminifactory.com', 'myminifactory.com'].includes(target.hostname)) return;
    return target.href;
  } catch { return; }
}
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Search aborted', 'AbortError');
}

/** The documented v2 store-license flag describes paid objects, not a numeric price. */
function freeStatus(licenses: unknown): boolean | undefined {
  if (!Array.isArray(licenses)) return;
  const store = licenses.map(record).filter((license) => license?.type === 'store');
  if (!store.length || store.some((license) => typeof license!.value !== 'boolean')) return;
  // Conflicting duplicate flags are insufficient evidence for either price class.
  if (new Set(store.map((license) => license!.value)).size !== 1) return;
  return store[0]!.value === false;
}

/** Official v2 search envelope. Price/publication date are not invented or relabeled. */
export function normalizeMyMiniFactoryResults(payload: unknown, query: string): ModelResult[] {
  const items = record(payload)?.items;
  if (!Array.isArray(items)) throw new Error('MyMiniFactory returned an unexpected search response.');
  const results: ModelResult[] = [];
  for (const value of items) {
    const item = record(value);
    const title = text(item?.name);
    const modelUrl = url(item?.url, true);
    if (!item || !title || !modelUrl) continue;
    const result: ModelResult = { title, url: modelUrl, providerId: 'myminifactory', query };
    const isFree = freeStatus(item.licenses);
    if (isFree !== undefined) result.isFree = isFree;
    const id = text(item.id) ?? (count(item.id) !== undefined ? String(item.id) : undefined);
    const creator = text(record(item.designer)?.username);
    const popularity = count(item.likes);
    const images = Array.isArray(item.images) ? item.images.map(record).filter((image) => image !== undefined) : [];
    images.sort((a, b) => Number(b.is_primary === true) - Number(a.is_primary === true));
    const thumbnail = images.map((image) => url(record(image.thumbnail)?.url) ?? url(record(image.standard)?.url)).find(Boolean);
    if (id !== undefined) result.id = id;
    if (creator) result.creator = creator;
    if (popularity !== undefined) result.popularity = popularity;
    if (thumbnail) result.thumbnail = thumbnail;
    if (Array.isArray(item.files)) {
      const formats = [...new Set(item.files.flatMap((file) => {
        const extension = text(record(file)?.filename)?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
        return extension && ['stl', 'obj', '3mf', 'step', 'stp', 'ply', 'amf', 'off', 'gcode'].includes(extension) ? [extension] : [];
      }))];
      if (formats.length) result.formats = formats;
    }
    results.push(result);
  }
  if (items.length && !results.length) throw new Error('MyMiniFactory returned no usable model records.');
  return results;
}

export function createMyMiniFactoryProvider(): Provider {
  let blockedUntil = 0;
  async function searchPage(rawQuery: string, cursor?: string, signal?: AbortSignal): Promise<ResultPage> {
    const page = pageNumber(cursor);
    checkAbort(signal);
    const query = normalizeQuery(rawQuery);
    if (!query) return { results: [] };
    let values;
    try { values = await loadCredentials('myminifactory', myMiniFactoryCredentialFields); }
    catch { checkAbort(signal); throw new Error('MyMiniFactory configuration could not be loaded. Check extension local storage.'); }
    checkAbort(signal);
    if (!values) throw new SetupRequired();
    if (Date.now() < blockedUntil) throw new Error('MyMiniFactory rate limit reached. Please wait before searching again.');
    // The official API specifies query-key auth. Never reuse this URL in UI,
    // history, errors or fallback links; the fixed HTTPS origin alone receives it.
    const endpoint = new URL('https://www.myminifactory.com/api/v2/search');
    endpoint.search = new URLSearchParams({ q: query, page: String(page), per_page: String(PAGE_SIZE), key: values.apiKey! }).toString();
    let response: Response;
    try {
      response = await fetch(endpoint.href, {
        method: 'GET', signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
        referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' },
      });
    } catch { checkAbort(signal); throw new Error('Could not reach MyMiniFactory. Open MyMiniFactory directly.'); }
    checkAbort(signal);
    if (response.status === 429) {
      const retry = response.headers.get('retry-after');
      const now = Date.now();
      const reset = retry && /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry ?? '');
      blockedUntil = Number.isFinite(reset) && reset >= now ? reset : now + 60_000;
      throw new Error('MyMiniFactory rate limit reached. Please wait before searching again.');
    }
    if (response.status === 401 || response.status === 403) throw new Error('MyMiniFactory denied access. Check your API key in Settings or open the source directly.');
    if (!response.ok) throw new Error(`MyMiniFactory search failed (HTTP ${response.status}). Open the source directly.`);
    let payload: unknown;
    try { payload = await response.json(); }
    catch { checkAbort(signal); throw new Error('MyMiniFactory returned an unreadable response.'); }
    checkAbort(signal);
    const results = credentialFreeResults(normalizeMyMiniFactoryResults(payload, query), [values.apiKey!]);
    const envelope = record(payload)!;
    return { results, nextCursor: nextPage(page, (envelope.items as unknown[]).length, envelope.total_count) };
  }
  return {
    id: 'myminifactory', credentialFields: myMiniFactoryCredentialFields,
    search: async (query, signal) => (await searchPage(query, undefined, signal)).results,
    searchPage,
  };
}
