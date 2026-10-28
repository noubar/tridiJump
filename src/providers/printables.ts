// SPDX-License-Identifier: GPL-3.0-or-later
import type { Provider, ResultPage } from './provider';
import type { ModelResult } from '../shared/model-result';
import { normalizeQuery } from '../search/query';
import { nextOffset, offsetNumber, PAGE_SIZE } from './pagination';
import { PrintablesFailure, printablesRuntime } from './printables-messages';
import type { PrintablesErrorKind } from './printables-messages';

// Undocumented frontend interface. See docs/provider-printables.md for evidence
// and pending thumbnail verification. Never supplied by registry or credential data.
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Search aborted', 'AbortError');
}

/** Candidate cover mapping; remote data may supply a relative path, never an origin. */
function thumbnailUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.startsWith('/')) return;
  try {
    const decoded = decodeURIComponent(value);
    // Reject scheme syntax, backslashes, controls, URL suffixes and encoded traversal.
    // Reject remaining percent escapes too, so nested encodings cannot hide separators.
    if (/[:\\?#%\u0000-\u0020\u007f-\u009f]/.test(decoded)
      || decoded.split('/').some((part) => !part || part === '.' || part === '..')) return;
    const origin = 'https://media.printables.com';
    const target = new URL(value, `${origin}/`);
    if (target.origin !== origin || target.username || target.password || target.search || target.hash) return;
    return target.href;
  } catch { return; }
}

/** Minimal model fields plus the isolated cover-image candidate; unknowns stay optional. */
export function normalizePrintablesPage(payload: unknown, query: string, offset = 0): ResultPage {
  const root = record(payload);
  if (root?.errors !== undefined && (!Array.isArray(root.errors) || root.errors.length)) {
    // Do not expose remote error text, request details or returned HTML.
    throw new PrintablesFailure('graphql');
  }
  const batch = record(record(root?.data)?.searchPrints2);
  if (!Array.isArray(batch?.items) || count(batch.totalCount) === undefined) {
    throw new PrintablesFailure('invalid-response');
  }
  const results: ModelResult[] = [];
  for (const value of batch.items) {
    const item = record(value);
    const title = typeof item?.name === 'string' ? item.name.trim() : '';
    const id = typeof item?.id === 'string' ? item.id : count(item?.id) !== undefined ? String(item!.id) : '';
    const slug = typeof item?.slug === 'string' ? item.slug : '';
    // Construct a single trusted model path, never a response-controlled origin.
    if (!title || !/^[1-9][0-9]*$/.test(id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue;
    const result: ModelResult = {
      providerId: 'printables', id, title,
      url: `https://www.printables.com/model/${id}-${slug}`, query,
    };
    const downloads = count(item!.downloadCount);
    const popularity = count(item!.likesCount);
    if (downloads !== undefined) result.downloads = downloads;
    if (popularity !== undefined) result.popularity = popularity;
    const thumbnail = thumbnailUrl(record(item!.image)?.filePath);
    if (thumbnail) result.thumbnail = thumbnail;
    // No verified creator schema, rating scale, free/paid semantics or
    // creation timestamp. Publication date must not be relabeled as creation.
    results.push(result);
  }
  if (batch.items.length && !results.length) throw new PrintablesFailure('invalid-response');
  return { results, nextCursor: nextOffset(offset, batch.items.length, batch.totalCount) };
}

export function createPrintablesProvider(): Provider {
  async function searchPage(rawQuery: string, cursor?: string, signal?: AbortSignal): Promise<ResultPage> {
    const offset = offsetNumber(cursor);
    checkAbort(signal);
    const query = normalizeQuery(rawQuery);
    if (!query) return { results: [] };
    const runtime = printablesRuntime();
    if (!runtime) throw new PrintablesFailure('transport');
    // Abort the caller immediately. One-off messaging cannot cancel worker fetch;
    // both this guard and the orchestrator discard replies from superseded work.
    return new Promise<ResultPage>((resolve, reject) => {
      let settled = false;
      const finish = (complete: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', abort);
        complete();
      };
      const abort = () => finish(() => reject(new DOMException('Search aborted', 'AbortError')));
      signal?.addEventListener('abort', abort, { once: true });
      void Promise.resolve().then(() => {
        if (settled) return;
        return runtime.sendMessage({ type: 'printables.search', query, limit: PAGE_SIZE, offset });
      }).then((value) => finish(() => {
        const reply = record(value);
        const page = record(reply?.page);
        if (reply?.ok === true && Array.isArray(page?.results)
          && page.results.every((result) => {
            const model = record(result);
            return model?.providerId === 'printables' && typeof model.title === 'string' && typeof model.url === 'string';
          }) && (page.nextCursor === undefined || typeof page.nextCursor === 'string')) {
          if (page.nextCursor !== undefined) {
            try { offsetNumber(page.nextCursor as string); }
            catch { reject(new PrintablesFailure('transport')); return; }
          }
          resolve(page as unknown as ResultPage);
          return;
        }
        const error = record(reply?.error);
        const kinds = ['network', 'http', 'graphql', 'invalid-response', 'invalid-json', 'invalid-request', 'rate-limited', 'transport'];
        if (reply?.ok === false && typeof error?.kind === 'string' && kinds.includes(error.kind)
          && (error.kind !== 'http' || (typeof error.status === 'number' && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599))) {
          reject(new PrintablesFailure(error.kind as PrintablesErrorKind, error.kind === 'http' ? error.status as number : undefined));
        } else reject(new PrintablesFailure('transport'));
      }), () => finish(() => reject(new PrintablesFailure('transport'))));
    });
  }
  return {
    id: 'printables',
    search: async (query, signal) => (await searchPage(query, undefined, signal)).results,
    searchPage,
  };
}
