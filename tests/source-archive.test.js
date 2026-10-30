// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertRequiredInputsIncluded, collectSourceFiles, exclusionReason,
} from '../scripts/source-archive-helpers.mjs';

const temporaryDirectories = [];
async function repository(files) {
  const root = await mkdtemp(join(tmpdir(), 'tridijump-source-test-'));
  temporaryDirectories.push(root);
  for (const [path, content] of Object.entries(files)) {
    const destination = join(root, ...path.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('future-proof AMO source collection', () => {
  it('wires Firefox and combined releases to the AMO source command', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const releaseScript = await readFile(new URL('../scripts/release.mjs', import.meta.url), 'utf8');
    expect(packageJson.scripts['source:firefox']).toBe('node scripts/source-firefox.mjs');
    expect(releaseScript).toContain("selectedTargets.includes('firefox')");
    expect(releaseScript).toContain("'source:firefox'");
    expect(releaseScript).toContain('sourceArchive.hash');
  });

  it('recursively discovers a future nested source file', async () => {
    const root = await repository({ 'src/__source_archive_test__/nested/deeper/example.ts': 'export const example = true;\n' });
    expect((await collectSourceFiles(root)).map((file) => file.path)).toContain('src/__source_archive_test__/nested/deeper/example.ts');
  });

  it('automatically includes a future provider below src', async () => {
    const root = await repository({ 'src/providers/future-test-provider/example.ts': 'export const provider = "future";\n' });
    expect((await collectSourceFiles(root)).map((file) => file.path)).toContain('src/providers/future-test-provider/example.ts');
  });

  it('applies exclusions recursively at any depth', async () => {
    const root = await repository({
      'src/feature/keep.ts': 'export {};\n',
      'src/feature/temp/debug.log': 'local output',
      'src/feature/.env': 'LOCAL_ONLY=value',
    });
    expect((await collectSourceFiles(root)).map((file) => file.path)).toEqual(['src/feature/keep.ts']);
  });

  it('excludes screenshot-only assets and tooling', async () => {
    const root = await repository({
      'assets/branding/source.png': 'source',
      'assets/demo/screenshots/Demo-Printables.png': 'demo',
      'src/screenshots/fixture.ts': 'export {};\n',
    });
    expect((await collectSourceFiles(root)).map((file) => file.path)).toEqual(['assets/branding/source.png']);
    expect(exclusionReason('assets/demo/screenshots/Demo-Printables.png')).toBe('screenshot/demo assets');
  });

  it('fails clearly when a required build input uses an unapproved new root', () => {
    expect(() => assertRequiredInputsIncluded(['src/main.ts', 'shared/new-root.ts'], ['src/main.ts']))
      .toThrow(/SOURCE ARCHIVE CONFIGURATION INCOMPLETE[\s\S]*shared\/new-root\.ts/);
  });

  it('rejects an unmarked realistic secret below an approved root', async () => {
    const secret = 'a9X3mP7qR2vN8kL4cB6zT1wY5uD0sF';
    const root = await repository({ 'src/provider-config.ts': `export const apiKey = '${secret}';\n` });
    await expect(collectSourceFiles(root)).rejects.toThrow(/secret scan failed.*assigned secret/i);
  });
});
