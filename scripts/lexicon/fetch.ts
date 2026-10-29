// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './config.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const destination = resolve(root, 'lexical-source/archives');

for (const source of Object.values(SOURCES)) {
  const response = await fetch(source.url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Could not fetch ${source.name}: HTTP ${response.status}.`);
  const data = Buffer.from(await response.arrayBuffer());
  const actual = createHash('sha256').update(data).digest('hex');
  if (actual !== source.sha256) throw new Error(`${source.name} checksum mismatch: expected ${source.sha256}, received ${actual}. Nothing was installed.`);
  await mkdir(destination, { recursive: true });
  const finalPath = resolve(destination, source.file);
  const temporaryPath = `${finalPath}.tmp`;
  await rm(temporaryPath, { force: true });
  await writeFile(temporaryPath, data);
  await rename(temporaryPath, finalPath);
  console.log(`${source.name} ${source.version}: ${data.length} bytes, SHA-256 ${actual}`);
}
