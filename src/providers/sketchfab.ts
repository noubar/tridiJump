// SPDX-License-Identifier: GPL-3.0-or-later
import type { ModelResult } from '../shared/model-result';
import { normalizeQuery } from '../search/query';
import type { Provider, ResultPage } from './provider';

const ENDPOINT = 'https://api.sketchfab.com/v3/search';
const API_ORIGIN = 'https://api.sketchfab.com';
const MEDIA_ORIGIN = 'https://media.sketchfab.com';
const THUMBNAIL_TARGET_WIDTH = 448;

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Search aborted', 'AbortError');
}

function trustedUrl(value: unknown, origin: string, pathPrefix?: string): string | undefined {
  try {
    const target = new URL(text(value) ?? '');
    if (target.protocol !== 'https:' || target.origin !== origin || target.username || target.password
      || target.search || target.hash || (pathPrefix && !target.pathname.startsWith(pathPrefix))) return;
    return target.href;
  } catch { return; }
}

function date(value: unknown): string | undefined {
  const candidate = text(value);
  return candidate && /^\d{4}-\d{2}-\d{2}T/.test(candidate) && Number.isFinite(Date.parse(candidate)) ? candidate : undefined;
}

function continuation(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9._~-]{1,512}$/.test(value) ? value : undefined;
}

export function sketchfabSearchUrl(rawQuery: string, cursor?: string): string {
  const query = normalizeQuery(rawQuery);
  const endpoint = new URL(ENDPOINT);
  endpoint.searchParams.set('type', 'models');
  endpoint.searchParams.set('q', query);
  if (cursor !== undefined) {
    const safeCursor = continuation(cursor);
    if (!safeCursor) throw new Error('Invalid Sketchfab continuation. Start a new search.');
    endpoint.searchParams.set('cursor', safeCursor);
  }
  return endpoint.href;
}

export function selectSketchfabThumbnail(value: unknown): string | undefined {
  const images = Array.isArray(record(value)?.images) ? (record(value)!.images as unknown[]) : [];
  const valid = images.flatMap((image) => {
    const item = record(image);
    const url = trustedUrl(item?.url, MEDIA_ORIGIN, '/models/');
    const width = count(item?.width);
    const height = count(item?.height);
    const size = count(item?.size);
    return url && width && height ? [{ url, width, height, size: size ?? Number.MAX_SAFE_INTEGER }] : [];
  });
  const adequate = valid.filter((image) => image.width >= THUMBNAIL_TARGET_WIDTH)
    .sort((a, b) => a.width - b.width || a.size - b.size || a.url.localeCompare(b.url));
  const candidate = adequate[0] ?? valid.sort((a, b) => b.width - a.width || a.size - b.size || a.url.localeCompare(b.url))[0];
  return candidate?.url;
}

function licenseLabel(value: unknown): string | undefined {
  const direct = text(value);
  if (direct) return direct;
  const item = record(value);
  return text(item?.label) ?? text(item?.uid);
}

function nextCursor(root: Record<string, unknown>, query: string): string | undefined {
  const cursors = record(root.cursors);
  const fromCursors = cursors?.next === null || cursors?.next === undefined ? undefined : continuation(cursors.next);
  if (cursors?.next !== null && cursors?.next !== undefined && !fromCursors) {
    throw new Error('Sketchfab returned an invalid pagination cursor.');
  }
  if (root.next === null || root.next === undefined) return fromCursors;
  if (typeof root.next !== 'string') throw new Error('Sketchfab returned invalid pagination metadata.');
  let target: URL;
  try { target = new URL(root.next); }
  catch { throw new Error('Sketchfab returned invalid pagination metadata.'); }
  const allowed = new Set(['type', 'q', 'cursor', 'count']);
  const next = continuation(target.searchParams.get('cursor'));
  if (target.origin !== API_ORIGIN || target.pathname !== '/v3/search' || target.username || target.password
    || target.hash || target.searchParams.get('type') !== 'models' || target.searchParams.get('q') !== query
    || [...target.searchParams.keys()].some((key) => !allowed.has(key)) || !next || (fromCursors && fromCursors !== next)) {
    throw new Error('Sketchfab returned invalid pagination metadata.');
  }
  return next;
}

/** Normalize only documented/live-observed public search fields. Unknown values stay absent. */
export function normalizeSketchfabPage(payload: unknown, query: string): ResultPage {
  const root = record(payload);
  if (!root || !Array.isArray(root.results)) throw new Error('Sketchfab returned an unexpected search response.');
  const results: ModelResult[] = [];
  for (const value of root.results) {
    const item = record(value);
    const id = text(item?.uid);
    const title = text(item?.name);
    const modelUrl = trustedUrl(item?.viewerUrl, 'https://sketchfab.com', '/3d-models/')
      ?? trustedUrl(item?.viewerUrl, 'https://www.sketchfab.com', '/3d-models/');
    if (!item || !id || !/^[a-f0-9]{32}$/i.test(id) || !title || !modelUrl) continue;
    const result: ModelResult = { providerId: 'sketchfab', id, title, url: modelUrl, query };
    const thumbnail = selectSketchfabThumbnail(item.thumbnails);
    const creator = text(record(item.user)?.username);
    const publishedAt = date(item.publishedAt);
    const popularity = count(item.likeCount);
    const views = count(item.viewCount);
    const comments = count(item.commentCount);
    const license = licenseLabel(item.license);
    if (thumbnail) result.thumbnail = thumbnail;
    if (creator) result.creator = creator;
    if (publishedAt) result.publishedAt = publishedAt;
    if (popularity !== undefined) result.popularity = popularity;
    if (views !== undefined) result.views = views;
    if (comments !== undefined) result.comments = comments;
    if (typeof item.isDownloadable === 'boolean') result.isDownloadable = item.isDownloadable;
    if (license) result.license = license;
    // Downloadability and license do not establish price or 3D-printability.
    results.push(result);
  }
  if (root.results.length && !results.length) throw new Error('Sketchfab returned no usable model records.');
  return { results, nextCursor: nextCursor(root, query) };
}

function retryTime(headers: Headers): number {
  const now = Date.now();
  const retry = headers.get('retry-after');
  const candidate = retry ? (/^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry)) : Number.NaN;
  return Number.isFinite(candidate) && candidate >= now ? candidate : now + 60_000;
}

export function createSketchfabProvider(): Provider {
  let blockedUntil = 0;
  async function searchPage(rawQuery: string, cursor?: string, signal?: AbortSignal): Promise<ResultPage> {
    checkAbort(signal);
    const query = normalizeQuery(rawQuery);
    if (!query) return { results: [] };
    if (Date.now() < blockedUntil) throw new Error('Sketchfab rate limit reached. Please wait before searching again.');
    const endpoint = sketchfabSearchUrl(query, cursor);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'GET', signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
        referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' },
      });
    } catch {
      checkAbort(signal);
      throw new Error('Could not reach Sketchfab. Open Sketchfab directly.');
    }
    checkAbort(signal);
    if (response.status === 429) {
      blockedUntil = retryTime(response.headers);
      throw new Error('Sketchfab rate limit reached. Please wait before searching again.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('Sketchfab denied anonymous public search. Open Sketchfab directly.');
    }
    if (response.status === 400) throw new Error('Sketchfab rejected the search query.');
    if (response.status === 404) throw new Error('Sketchfab search is unavailable. Open Sketchfab directly.');
    if (!response.ok) throw new Error(`Sketchfab search failed (HTTP ${response.status}). Open Sketchfab directly.`);
    let payload: unknown;
    try { payload = await response.json(); }
    catch {
      checkAbort(signal);
      throw new Error('Sketchfab returned an unreadable response.');
    }
    checkAbort(signal);
    return normalizeSketchfabPage(payload, query);
  }
  return {
    id: 'sketchfab', mode: 'remote-api', tier: 'general',
    search: async (query, signal) => (await searchPage(query, undefined, signal)).results,
    searchPage,
  };
}
