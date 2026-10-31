// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NASA_SOURCE_REPOSITORY = 'https://github.com/nasa/NASA-3D-Resources';
export const NASA_SOURCE_COMMIT = '11ebb4ee043715aefbba6aeec8a61746fad67fa7';
export const NASA_SNAPSHOT_DATE = '2026-10-31';
export const NASA_CATALOG_SCHEMA_VERSION = 1;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_PATH = resolve(ROOT, 'providers/nasa/source.json');
const CATALOG_PATH = resolve(ROOT, 'src/providers/catalogs/nasa.json');
const SUPPORTED_FORMATS = new Set(['3ds', 'blend', 'fbx', 'glb', 'gltf', 'lwo', 'obj', 'openvsp', 'stl']);

export interface NasaTreeEntry { path: string; type: 'blob' | 'tree'; sha: string; size?: number }
export interface NasaSourceRecord {
  path: string;
  files: { path: string; sha: string; size: number }[];
  description?: string;
}
export interface NasaSourceSnapshot {
  provider: 'nasa'; schemaVersion: 1; source: string; sourceCommit: string; snapshotDate: string;
  records: NasaSourceRecord[];
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const containsSensitiveMaterial = (value: string) => /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bAKIA[0-9A-Z]{16}\b/u.test(value);
const encodedPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
const slug = (value: string) => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const format = (path: string) => {
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!extension) return;
  if (extension === 'vsp3') return 'openvsp';
  return SUPPORTED_FORMATS.has(extension) ? extension : undefined;
};

function cleanDescription(value: string): string | undefined {
  const cleaned = value.replace(/^\uFEFF/u, '').replace(/\r\n?/g, '\n').split('\n')
    .map((line) => line.trim()).filter((line) => line && !/^[-=]{3,}$/u.test(line)).join(' ')
    .replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 1000) : undefined;
}

export async function snapshotFromTree(entries: readonly NasaTreeEntry[], readText: (path: string) => Promise<string | undefined> = async () => undefined): Promise<NasaSourceSnapshot> {
  const roots = entries.filter((entry) => entry.type === 'tree' && /^(3D Models|3D Printing)\/[^/]+$/u.test(entry.path))
    .sort((a, b) => a.path.localeCompare(b.path, 'en'));
  if (!roots.length) throw new Error('NASA source tree contains no supported resource directories.');
  const records: NasaSourceRecord[] = [];
  for (const root of roots) {
    const prefix = `${root.path}/`;
    const files = entries.filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix))
      .map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size ?? 0 }))
      .sort((a, b) => a.path.localeCompare(b.path, 'en'));
    if (!files.length) throw new Error(`NASA resource has no files: ${root.path}`);
    const readme = files.find((file) => /\/readme\.txt$/iu.test(file.path));
    const description = readme ? cleanDescription(await readText(readme.path) ?? '') : undefined;
    records.push({ path: root.path, files, ...(description ? { description } : {}) });
  }
  return { provider: 'nasa', schemaVersion: 1, source: NASA_SOURCE_REPOSITORY,
    sourceCommit: NASA_SOURCE_COMMIT, snapshotDate: NASA_SNAPSHOT_DATE, records };
}

export function buildCatalog(source: NasaSourceSnapshot) {
  if (source.provider !== 'nasa' || source.schemaVersion !== 1 || source.sourceCommit !== NASA_SOURCE_COMMIT || !source.records.length) {
    throw new Error('NASA source snapshot metadata is invalid or unpinned.');
  }
  const ids = new Set<string>();
  const records = source.records.map((record) => {
    const match = record.path.match(/^(3D Models|3D Printing)\/([^/]+)$/u);
    if (!match) throw new Error(`Invalid NASA resource path: ${record.path}`);
    const printable = match[1] === '3D Printing';
    const title = match[2]!.trim();
    if (!title) throw new Error(`NASA resource has an empty title: ${record.path}`);
    const id = `${printable ? 'printable' : 'model'}:${slug(title)}`;
    if (!id.split(':')[1] || ids.has(id)) throw new Error(`Duplicate NASA catalog ID: ${id}`);
    ids.add(id);
    const formats = [...new Set(record.files.map((file) => format(file.path)).filter((value): value is string => Boolean(value)))].sort();
    const canonicalUrl = `${NASA_SOURCE_REPOSITORY}/tree/${source.sourceCommit}/${encodedPath(record.path)}`;
    return { id, title, assetType: printable ? '3d-printable' as const : '3d-model' as const,
      tags: [match[1]],
      ...(record.description ? { description: record.description } : {}), ...(printable ? { is3DPrintable: true as const } : {}),
      ...(formats.length ? { formats } : {}), canonicalUrl, license: 'NASA Images and Media Usage Guidelines', attribution: 'NASA' };
  }).sort((a, b) => a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id, 'en'));
  const sourceText = json(source);
  return { metadata: { provider: 'nasa' as const, schemaVersion: NASA_CATALOG_SCHEMA_VERSION,
    source: source.source, sourceCommit: source.sourceCommit, snapshotDate: source.snapshotDate,
    sourceSha256: sha256(sourceText), sourceRecordCount: source.records.length, recordCount: records.length }, records };
}

async function safelyWrite(path: string, contents: string) {
  if (containsSensitiveMaterial(contents)) throw new Error('NASA metadata contains credential-like material. Existing catalog was not changed.');
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, contents, 'utf8');
  JSON.parse(await readFile(temporary, 'utf8'));
  await rename(temporary, path);
}

async function fetchPinnedSnapshot() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'tridiJump-nasa-catalog-refresh' };
  const response = await fetch(`https://api.github.com/repos/nasa/NASA-3D-Resources/git/trees/${NASA_SOURCE_COMMIT}?recursive=1`, { headers });
  if (!response.ok) throw new Error(`NASA tree request failed (HTTP ${response.status}).`);
  const payload = await response.json() as { truncated?: boolean; tree?: NasaTreeEntry[] };
  if (payload.truncated || !Array.isArray(payload.tree)) throw new Error('NASA tree response is incomplete. Existing catalog was not changed.');
  return snapshotFromTree(payload.tree, async (path) => {
    const textResponse = await fetch(`https://raw.githubusercontent.com/nasa/NASA-3D-Resources/${NASA_SOURCE_COMMIT}/${encodedPath(path)}`, { headers: { 'User-Agent': headers['User-Agent'] } });
    if (!textResponse.ok) throw new Error(`NASA readme request failed for ${path} (HTTP ${textResponse.status}).`);
    const bytes = await textResponse.arrayBuffer();
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder('windows-1252').decode(bytes);
    }
  });
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const source = refresh ? await fetchPinnedSnapshot() : JSON.parse(await readFile(SOURCE_PATH, 'utf8')) as NasaSourceSnapshot;
  const catalog = buildCatalog(source);
  const sourceContents = json(source);
  const catalogContents = json(catalog);
  if (Buffer.byteLength(sourceContents) > 2 * 1024 * 1024 || Buffer.byteLength(catalogContents) > 512 * 1024) {
    throw new Error('NASA metadata exceeds the catalog safety limit. Existing catalog was not changed.');
  }
  if (refresh) await safelyWrite(SOURCE_PATH, sourceContents);
  await safelyWrite(CATALOG_PATH, catalogContents);
  console.log(`NASA source commit: ${source.sourceCommit}`);
  console.log(`Source records: ${source.records.length}`);
  console.log(`Normalized records: ${catalog.records.length}`);
  console.log(`Source snapshot: ${Buffer.byteLength(sourceContents)} bytes`);
  console.log(`Runtime catalog: ${Buffer.byteLength(catalogContents)} bytes`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'NASA catalog generation failed.'); process.exitCode = 1; });
}
