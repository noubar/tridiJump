// SPDX-License-Identifier: GPL-3.0-or-later
import type { ModelResult } from '../shared/model-result';
import { normalizeQuery } from '../search/query';
import { credentialFreeResults, loadCredentials, SetupRequired } from './credentials';
import type { CredentialField } from './credentials';
import { nextOffset, offsetNumber, PAGE_SIZE } from './pagination';
import type { Provider, ResultPage } from './provider';

const ENDPOINT = 'https://api.si.edu/openaccess/api/v1.0/search';
const PREVIEW_ORIGIN = 'https://3d-api.si.edu';
const FORMATS = new Set(['gltf', 'glb', 'obj', 'usdz', 'stl', 'ply', 'blend', 'f3z']);

export const smithsonianCredentialFields: readonly CredentialField[] = [
  { name: 'apiKey', label: 'Smithsonian Open Access API key from api.data.gov', secret: true },
];

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Search aborted', 'AbortError');
}

function fixedUrl(value: unknown, origin: string, prefix: string): string | undefined {
  try {
    const target = new URL(text(value) ?? '');
    if (target.protocol !== 'https:' || target.origin !== origin || target.username || target.password
      || target.search || target.hash || !target.pathname.startsWith(prefix)) return;
    return target.href;
  } catch { return; }
}

function labeled(values: unknown, labels: RegExp): string | undefined {
  for (const value of list(values)) {
    const item = record(value);
    if (labels.test(text(item?.label) ?? '')) {
      const content = text(item?.content);
      if (content) return content.replace(/<[^>]*>/g, '').trim() || undefined;
    }
  }
}

function threeDimensionalMedia(row: Record<string, unknown>): Record<string, unknown> | undefined {
  const content = record(row.content);
  const descriptive = record(content?.descriptiveNonRepeating);
  const online = record(descriptive?.online_media);
  return list(online?.media).map(record).find((media) => media?.type === '3d_voyager');
}

function formats(media: Record<string, unknown>): string[] | undefined {
  const found = new Set<string>();
  for (const resource of list(media.resources)) {
    const item = record(resource);
    for (const raw of list(item?.attributes)) {
      const attributes = record(raw);
      const format = (text(attributes?.MODEL_FILE_TYPE) ?? text(attributes?.FILE_TYPE))?.toLowerCase();
      if (format && FORMATS.has(format)) found.add(format);
    }
  }
  return found.size ? [...found] : undefined;
}

/** Normalize only official Open Access object and 3D Voyager media fields. */
export function normalizeSmithsonianPage(payload: unknown, query: string, offset = 0): ResultPage {
  const root = record(payload);
  const response = record(root?.response);
  const rows = response?.rows;
  if (!root || root.status !== 200 || !Array.isArray(rows)) throw new Error('Smithsonian returned an unexpected search response.');
  const results: ModelResult[] = [];
  for (const value of rows) {
    const row = record(value);
    if (!row) continue;
    const media = threeDimensionalMedia(row);
    const id = text(media?.voyagerId) ?? text(media?.id);
    const title = text(row.title);
    const url = fixedUrl(media?.content, PREVIEW_ORIGIN, '/voyager/3d_package:');
    if (!media || !id || !/^3d_package:[a-f0-9-]{36}$/i.test(id) || !title || !url) continue;
    const result: ModelResult = { id, title, url, providerId: 'smithsonian', query };
    const thumbnail = fixedUrl(media.thumbnail, PREVIEW_ORIGIN, '/content/document/3d_package:');
    const content = record(row.content);
    const freetext = record(content?.freetext);
    const descriptive = record(content?.descriptiveNonRepeating);
    const creator = labeled(freetext?.name, /^(artist|creator|designer|maker|sculptor|author|manufacturer|architect|model maker)$/i);
    const description = labeled(freetext?.notes, /^(summary|description|brief description)$/i);
    const collection = labeled(freetext?.setName, /^see more items in$/i);
    const museum = text(descriptive?.data_source) ?? text(row.unitCode);
    const access = text(record(media.usage)?.access);
    const knownFormats = formats(media);
    if (thumbnail) result.thumbnail = thumbnail;
    if (creator) result.creator = creator;
    if (description) result.description = description;
    if (collection) result.collection = collection;
    if (museum) result.museum = museum;
    if (access) { result.license = access; if (access.toUpperCase() === 'CC0') result.isFree = true; }
    if (knownFormats) result.formats = knownFormats;
    if (list(media.resources).length) result.isDownloadable = true;
    results.push(result);
  }
  if (rows.length && !results.length) throw new Error('Smithsonian returned no usable 3D object records.');
  return { results, nextCursor: nextOffset(offset, rows.length, response!.rowCount) };
}

export function smithsonianSearchUrl(rawQuery: string, apiKey: string, offset = 0): string {
  const query = normalizeQuery(rawQuery);
  const endpoint = new URL(ENDPOINT);
  endpoint.search = new URLSearchParams({
    q: `${query} AND online_media_type:"3D Models"`, start: String(offset), rows: String(PAGE_SIZE),
    sort: 'relevancy', type: 'edanmdm', row_group: 'objects', api_key: apiKey,
  }).toString();
  return endpoint.href;
}

function retryTime(headers: Headers): number {
  const now = Date.now();
  const retry = headers.get('retry-after');
  const candidate = retry ? (/^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry)) : Number.NaN;
  return Number.isFinite(candidate) && candidate >= now ? candidate : now + 60_000;
}

export function createSmithsonianProvider(): Provider {
  let blockedUntil = 0;
  async function searchPage(rawQuery: string, cursor?: string, signal?: AbortSignal): Promise<ResultPage> {
    const offset = offsetNumber(cursor);
    checkAbort(signal);
    const query = normalizeQuery(rawQuery);
    if (!query) return { results: [] };
    let values;
    try { values = await loadCredentials('smithsonian', smithsonianCredentialFields); }
    catch { checkAbort(signal); throw new Error('Smithsonian configuration could not be loaded. Check extension local storage.'); }
    checkAbort(signal);
    if (!values) throw new SetupRequired();
    if (/\s/.test(values.apiKey!)) throw new Error('Enter a valid Smithsonian API key in Settings.');
    if (Date.now() < blockedUntil) throw new Error('Smithsonian rate limit reached. Please wait before searching again.');
    const endpoint = smithsonianSearchUrl(query, values.apiKey!, offset);
    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'GET', signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
        referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
    } catch { checkAbort(signal); throw new Error('Could not reach Smithsonian. Open Smithsonian 3D directly.'); }
    checkAbort(signal);
    if (response.status === 429) { blockedUntil = retryTime(response.headers); throw new Error('Smithsonian rate limit reached. Please wait before searching again.'); }
    if (response.status === 401 || response.status === 403) throw new Error('Smithsonian denied access. Check your API key in Settings or open Smithsonian 3D directly.');
    if (response.status === 400) throw new Error('Smithsonian rejected the search query.');
    if (!response.ok) throw new Error(`Smithsonian search failed (HTTP ${response.status}). Open Smithsonian 3D directly.`);
    let payload: unknown;
    try { payload = await response.json(); }
    catch { checkAbort(signal); throw new Error('Smithsonian returned an unreadable response.'); }
    checkAbort(signal);
    const page = normalizeSmithsonianPage(payload, query, offset);
    page.results = credentialFreeResults(page.results, [values.apiKey!]);
    return page;
  }
  return { id: 'smithsonian', mode: 'remote-api', tier: 'specialist', credentialFields: smithsonianCredentialFields,
    search: async (query, signal) => (await searchPage(query, undefined, signal)).results, searchPage };
}
