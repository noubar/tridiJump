// SPDX-License-Identifier: GPL-3.0-or-later
import type { Provider, ResultPage } from './provider';
import { nextPage, pageNumber, PAGE_SIZE } from './pagination';
import type { ModelResult } from '../shared/model-result';
import { credentialFreeResults, loadCredentials, SetupRequired } from './credentials';
import type { CredentialField } from './credentials';
import { normalizeQuery } from '../search/query';

export const thingiverseCredentialFields: readonly CredentialField[] = [
  { name: 'appToken', label: 'Thingiverse App Token (not client secret or password)', secret: true },
];
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
function url(value: unknown, model = false): string | undefined {
  try {
    const target = new URL(text(value) ?? '');
    if (target.protocol !== 'https:' || target.username || target.password) return;
    if (model && !['www.thingiverse.com', 'thingiverse.com'].includes(target.hostname)) return;
    return target.href;
  } catch { return; }
}
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Search aborted', 'AbortError');
}

/** The App Token uses the developer REST API, not a copied website view/session token. */
export function normalizeThingiverseResults(payload: unknown, query: string): ModelResult[] {
  const hits = record(payload)?.hits;
  if (!Array.isArray(hits)) throw new Error('Thingiverse returned an unexpected search response.');
  const results: ModelResult[] = [];
  for (const value of hits) {
    const item = record(value);
    const title = text(item?.name);
    const modelUrl = url(item?.public_url, true);
    if (!item || !title || !modelUrl) continue;
    // Normal Thingiverse model downloads are free by the platform's published policy.
    // This is not an inferred zero price or permission to sell/remix the model.
    const result: ModelResult = { title, url: modelUrl, providerId: 'thingiverse', query, isFree: true };
    const id = text(item.id) ?? (count(item.id) !== undefined ? String(item.id) : undefined);
    const thumbnail = url(item.thumbnail);
    const creator = text(record(item.creator)?.name);
    const popularity = count(item.like_count);
    const downloads = count(item.download_count);
    const createdAt = text(item.created_at);
    if (id !== undefined) result.id = id;
    if (thumbnail) result.thumbnail = thumbnail;
    if (creator) result.creator = creator;
    if (popularity !== undefined) result.popularity = popularity;
    if (downloads !== undefined) result.downloads = downloads;
    if (createdAt && /^\d{4}-\d{2}-\d{2}T/.test(createdAt) && Number.isFinite(Date.parse(createdAt))) result.createdAt = createdAt;
    // No numeric price/currency, rating or formats are invented from absent fields.
    results.push(result);
  }
  if (hits.length && !results.length) throw new Error('Thingiverse returned no usable model records.');
  return results;
}

export function createThingiverseProvider(): Provider {
  let blockedUntil = 0;
  async function searchPage(rawQuery: string, cursor?: string, signal?: AbortSignal): Promise<ResultPage> {
    const page = pageNumber(cursor);
    checkAbort(signal);
    const query = normalizeQuery(rawQuery);
    if (!query) return { results: [] };
    let values;
    try { values = await loadCredentials('thingiverse', thingiverseCredentialFields); }
    catch { checkAbort(signal); throw new Error('Thingiverse configuration could not be loaded. Check extension local storage.'); }
    checkAbort(signal);
    if (!values) throw new SetupRequired();
    const token = values.appToken!;
    if (/\s/.test(token)) throw new Error('Enter a valid Thingiverse App Token in Settings, not a password.');
    if (Date.now() < blockedUntil) throw new Error('Thingiverse rate limit reached. Please wait before searching again.');
    const endpoint = new URL(`https://api.thingiverse.com/search/${encodeURIComponent(query)}`);
    endpoint.search = new URLSearchParams({ page: String(page), per_page: String(PAGE_SIZE) }).toString();
    let response: Response;
    try {
      response = await fetch(endpoint.href, {
        method: 'GET', signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
        referrerPolicy: 'no-referrer', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
    } catch { checkAbort(signal); throw new Error('Could not reach Thingiverse. Open Thingiverse directly.'); }
    checkAbort(signal);
    if (response.status === 429) {
      const retry = response.headers.get('retry-after');
      const now = Date.now();
      const reset = retry && /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry ?? '');
      blockedUntil = Number.isFinite(reset) && reset >= now ? reset : now + 60_000;
      throw new Error('Thingiverse rate limit reached. Please wait before searching again.');
    }
    if (response.status === 401 || response.status === 403) throw new Error('Thingiverse denied access. Check your App Token in Settings or open the source directly.');
    if (!response.ok) throw new Error(`Thingiverse search failed (HTTP ${response.status}). Open the source directly.`);
    let payload: unknown;
    try { payload = await response.json(); }
    catch { checkAbort(signal); throw new Error('Thingiverse returned an unreadable response.'); }
    checkAbort(signal);
    const results = credentialFreeResults(normalizeThingiverseResults(payload, query), [token]);
    const envelope = record(payload)!;
    return { results, nextCursor: nextPage(page, (envelope.hits as unknown[]).length, envelope.total) };
  }
  return {
    id: 'thingiverse', mode: 'remote-api', tier: 'general', credentialFields: thingiverseCredentialFields,
    search: async (query, signal) => (await searchPage(query, undefined, signal)).results,
    searchPage,
  };
}
