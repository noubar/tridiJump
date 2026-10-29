// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, it } from 'vitest';

it('production build emits the registered module worker and all its local static imports', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifests/chrome.json', import.meta.url), 'utf8'));
  const result = await build({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'silent', build: { write: false, minify: false },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const assets = outputs.flatMap((value) => 'output' in value ? value.output : []).filter((value) => value.type === 'asset');
  const license = assets.find((asset) => asset.fileName === 'LICENSE');
  expect(license).toBeDefined();
  expect(license!.source).toBe(readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'));
  expect(assets.find((asset) => asset.fileName === 'SOURCE.txt')?.source).toContain('https://github.com/noubar/tridiJump');
  const chunks = outputs.flatMap((value) => 'output' in value ? value.output : []).filter((value) => value.type === 'chunk');
  const entry = chunks.find((chunk) => chunk.fileName === manifest.background.service_worker);
  expect(manifest.background.type).toBe('module'); expect(entry?.isEntry).toBe(true);
  const reachable = new Set<string>();
  function inspect(name: string) {
    if (reachable.has(name)) return;
    reachable.add(name);
    const chunk = chunks.find((value) => value.fileName === name);
    expect(chunk, `Missing worker chunk ${name}`).toBeDefined();
    expect(chunk!.dynamicImports).toEqual([]);
    for (const dependency of chunk!.imports) inspect(dependency);
  }
  inspect(entry!.fileName);
  const code = chunks.filter((chunk) => reachable.has(chunk.fileName)).map((chunk) => chunk.code).join('\n');
  expect(code).toContain('onMessage.addListener'); expect(code).toContain('https://api.printables.com/graphql/');
  expect(code).toContain('printables.search'); expect(code).toContain('credentials: "omit"');
  expect(code).not.toContain('document.'); expect(code).not.toContain('storage.local');
  expect(manifest.host_permissions).toEqual(['https://cults3d.com/*', 'https://www.myminifactory.com/*', 'https://api.thingiverse.com/*', 'https://api.printables.com/*']);
  expect(manifest.permissions).toEqual(['storage']);
});

it('Firefox production build emits its event-page manifest and the shared background entry', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifests/firefox.json', import.meta.url), 'utf8'));
  const result = await build({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    mode: 'firefox', logLevel: 'silent', build: { write: false, minify: false },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const assets = outputs.flatMap((value) => 'output' in value ? value.output : []).filter((value) => value.type === 'asset');
  const generatedManifest = assets.find((asset) => asset.fileName === 'manifest.json');
  expect(JSON.parse(String(generatedManifest?.source))).toEqual(manifest);
  const chunks = outputs.flatMap((value) => 'output' in value ? value.output : []).filter((value) => value.type === 'chunk');
  const entry = chunks.find((chunk) => chunk.fileName === manifest.background.scripts[0]);
  expect(entry?.isEntry).toBe(true);
  expect(entry?.code).toContain('onMessage.addListener');
  expect(manifest.background.service_worker).toBeUndefined();
});
