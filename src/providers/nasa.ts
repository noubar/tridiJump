// SPDX-License-Identifier: GPL-3.0-or-later
import catalogJson from './catalogs/nasa.json';
import { normalizeQuery } from '../search/query';
import type { ModelResult } from '../shared/model-result';
import { nextOffset, offsetNumber, PAGE_SIZE } from './pagination';
import type { Provider, ResultPage } from './provider';

export const NASA_CATALOG_SCHEMA_VERSION = 1;
const NASA_REPOSITORY = 'https://github.com/nasa/NASA-3D-Resources';
const FORMAT = /^[a-z0-9][a-z0-9-]{0,15}$/u;

export interface NasaCatalogRecord {
  id: string;
  title: string;
  assetType: '3d-model' | '3d-printable';
  description?: string;
  tags?: string[];
  is3DPrintable?: true;
  formats?: string[];
  canonicalUrl: string;
  license: string;
  attribution: string;
}
export interface NasaCatalog {
  metadata: { provider: 'nasa'; schemaVersion: number; source: string; sourceCommit: string;
    snapshotDate: string; sourceSha256: string; sourceRecordCount: number; recordCount: number };
  records: NasaCatalogRecord[];
}

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const string = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;

export function validateNasaCatalog(value: unknown): NasaCatalog {
  const root = object(value);
  const metadata = object(root?.metadata);
  const records = root?.records;
  const sourceCommit = string(metadata?.sourceCommit);
  if (metadata?.provider !== 'nasa' || metadata.schemaVersion !== NASA_CATALOG_SCHEMA_VERSION
    || metadata.source !== NASA_REPOSITORY || !/^[a-f0-9]{40}$/u.test(sourceCommit ?? '')
    || !/^\d{4}-\d{2}-\d{2}$/u.test(string(metadata.snapshotDate) ?? '')
    || !/^[a-f0-9]{64}$/u.test(string(metadata.sourceSha256) ?? '')
    || !Number.isSafeInteger(metadata.sourceRecordCount) || !Array.isArray(records)
    || metadata.sourceRecordCount !== records.length || metadata.recordCount !== records.length || records.length === 0) {
    throw new Error('NASA local catalog metadata is invalid or uses an unsupported schema.');
  }
  const ids = new Set<string>();
  for (const value of records) {
    const record = object(value);
    const id = string(record?.id);
    const title = string(record?.title);
    const description = record?.description === undefined ? undefined : string(record.description);
    const assetType = record?.assetType;
    const formats = record?.formats;
    const tags = record?.tags;
    let url: URL;
    try { url = new URL(string(record?.canonicalUrl) ?? ''); } catch { throw new Error('NASA local catalog contains an invalid canonical URL.'); }
    if (!record || !id || ids.has(id) || !/^(model|printable):[a-z0-9-]+$/u.test(id) || !title
      || (description !== undefined && description.length > 1000)
      || (assetType !== '3d-model' && assetType !== '3d-printable')
      || (record.is3DPrintable !== undefined && (record.is3DPrintable !== true || assetType !== '3d-printable'))
      || (formats !== undefined && (!Array.isArray(formats) || !formats.length || formats.some((item) => typeof item !== 'string' || !FORMAT.test(item))))
      || (tags !== undefined && (!Array.isArray(tags) || tags.some((item) => typeof item !== 'string' || !item.trim())))
      || url.origin !== 'https://github.com' || !url.pathname.startsWith(`/nasa/NASA-3D-Resources/tree/${sourceCommit}/`) || url.search || url.hash
      || record.license !== 'NASA Images and Media Usage Guidelines' || record.attribution !== 'NASA') {
      throw new Error(`NASA local catalog contains an invalid record${id ? ` (${id})` : ''}.`);
    }
    ids.add(id);
  }
  return value as NasaCatalog;
}

const searchable = (value: string) => value.normalize('NFKD').toLocaleLowerCase('en')
  .replace(/[^a-z0-9]+/gu, ' ').trim().replace(/\s+/gu, ' ');

function rank(records: readonly NasaCatalogRecord[], rawQuery: string): NasaCatalogRecord[] {
  const query = searchable(normalizeQuery(rawQuery));
  if (!query) return [];
  const tokens = [...new Set(query.split(' '))];
  return records.flatMap((record) => {
    const title = searchable(record.title);
    const description = searchable(record.description ?? '');
    const tags = searchable((record.tags ?? []).join(' '));
    const category = searchable(record.assetType);
    const combined = `${title} ${tags} ${category} ${description}`;
    if (!tokens.every((token) => combined.includes(token))) return [];
    let score = title === query ? 10_000 : title.startsWith(query) ? 7_500 : title.includes(query) ? 6_000 : 0;
    for (const token of tokens) {
      if (title.split(' ').includes(token)) score += 700;
      else if (title.includes(token)) score += 500;
      if (tags.includes(token)) score += 250;
      if (category.includes(token)) score += 150;
      if (description.includes(token)) score += 50;
    }
    return [{ record, score }];
  }).sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title, 'en') || a.record.id.localeCompare(b.record.id, 'en'))
    .map(({ record }) => record);
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Search aborted', 'AbortError');
}

function result(record: NasaCatalogRecord, query: string): ModelResult {
  return { providerId: 'nasa', id: record.id, title: record.title, url: record.canonicalUrl, query,
    ...(record.description ? { description: record.description } : {}), ...(record.formats ? { formats: [...record.formats] } : {}),
    ...(record.is3DPrintable ? { is3DPrintable: true } : {}), assetType: record.assetType,
    license: record.license, attribution: record.attribution, isFree: true, isDownloadable: true };
}

export function createNasaProvider(input: unknown = catalogJson): Provider {
  async function searchPage(rawQuery: string, cursor?: string, signal?: AbortSignal): Promise<ResultPage> {
    checkAbort(signal);
    const query = normalizeQuery(rawQuery);
    if (!query) return { results: [] };
    const offset = offsetNumber(cursor);
    const catalog = validateNasaCatalog(input);
    const matches = rank(catalog.records, query);
    checkAbort(signal);
    const page = matches.slice(offset, offset + PAGE_SIZE).map((record) => result(record, query));
    return { results: page, nextCursor: nextOffset(offset, page.length, matches.length) };
  }
  return { id: 'nasa', mode: 'local-catalog', tier: 'specialist',
    search: async (query, signal) => (await searchPage(query, undefined, signal)).results, searchPage };
}
