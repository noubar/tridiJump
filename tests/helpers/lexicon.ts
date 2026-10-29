// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LexicalEngine } from '../../src/synonyms/lexical-engine';
import { PackagedLexicon } from '../../src/synonyms/packaged-lexicon';

export async function loadGeneratedChunk(kind: string, bucket: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(`public/lexical-data/${kind}/${bucket}.json`), 'utf8')) as unknown;
}

export function testLexicalEngine(): LexicalEngine {
  return new LexicalEngine(new PackagedLexicon(loadGeneratedChunk));
}
