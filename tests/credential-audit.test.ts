// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../src/results/index.html?raw';
import { providerAvailability } from '../src/providers/availability';
import { clearCredentials, credentialDisplay, saveCredentials } from '../src/providers/credentials';
import { readHistory, savePreferences } from '../src/shared/preferences';
import { createResultsView } from '../src/results/view';
import { mockExtensionStorage } from './helpers/extension-storage';
const sources = providerAvailability.filter((source) => source.classification === 'B');
const secrets: Record<string, string> = { cults3d: 'FAKE-AUDIT-CULTS-KEY', myminifactory: 'FAKE-AUDIT-MMF-KEY', thingiverse: 'FAKE-AUDIT-THING-TOKEN' };
const origins: Record<string, string> = { cults3d: 'https://cults3d.com', myminifactory: 'https://www.myminifactory.com', thingiverse: 'https://api.thingiverse.com' };
const encodedCults = btoa(`audit-test-user:${secrets.cults3d}`);
function assertNoSecrets(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of [...Object.values(secrets), encodedCults]) expect(text).not.toContain(secret);
}
beforeEach(async () => {
  mockExtensionStorage(); localStorage.clear();
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
  for (const source of sources) await saveCredentials(source.id, source.createProvider().credentialFields!, {
    nickname: 'audit-test-user', apiKey: secrets[source.id]!, appToken: secrets[source.id]!,
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('credential audit regressions', () => {
  it('scopes three distinct credentials to fixed origins even when a query looks like a different destination', async () => {
    const request = vi.fn(async (endpoint: string, options: RequestInit) => {
      const url = new URL(endpoint);
      const id = Object.keys(origins).find((id) => origins[id] === url.origin)!;
      expect(id).toBeDefined();
      expect(options).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
      const authorization = new Headers(options.headers).get('Authorization');
      if (id === 'cults3d') {
        expect(authorization).toBe(`Basic ${encodedCults}`);
        assertNoSecrets(endpoint);
        assertNoSecrets(options.body);
      } else if (id === 'thingiverse') {
        expect(authorization).toBe(`Bearer ${secrets.thingiverse}`);
        assertNoSecrets(endpoint);
      } else {
        expect(authorization).toBeNull();
        expect(url.searchParams.get('key')).toBe(secrets.myminifactory);
      }
      for (const [other, secret] of Object.entries(secrets)) {
        if (other !== id) expect(JSON.stringify([endpoint, options])).not.toContain(secret);
      }
      return new Response(JSON.stringify(id === 'cults3d' ? { data: { creationsSearchBatch: { results: [] } } }
        : id === 'thingiverse' ? { hits: [] } : { items: [] }));
    });
    vi.stubGlobal('fetch', request);
    const query = 'https://evil.example/redirect?destination=elsewhere';
    await Promise.all(sources.map((source) => source.createProvider().search(query)));
    expect(request).toHaveBeenCalledTimes(3);
    for (const source of providerAvailability) assertNoSecrets(source.searchUrl(query));
  });

  it.each(sources)('$name keeps network errors, status DOM, history and metadata secret-free through removal', async (source) => {
    const logs = ['log', 'info', 'warn', 'error', 'debug'].map((method) => vi.spyOn(console, method as 'log').mockImplementation(() => {}));
    await savePreferences({ theme: 'system', expandedDefault: false, historyEnabled: true });
    const request = vi.fn().mockRejectedValue(new Error(Object.values(secrets).join(' ') + encodedCults));
    vi.stubGlobal('fetch', request);
    const view = createResultsView(document.querySelector('main')!, [{ name: source.name, provider: source.createProvider(), searchUrl: source.searchUrl }]);
    view.search('cap');
    await vi.waitFor(() => expect(document.querySelector('#provider-status [data-status="failed"]')).not.toBeNull());
    assertNoSecrets(document.body.innerHTML);
    assertNoSecrets(window.location.href);
    assertNoSecrets(await readHistory());
    assertNoSecrets(await credentialDisplay(source.id, source.createProvider().credentialFields!));
    assertNoSecrets(providerAvailability);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    await clearCredentials(source.id);
    view.search('cap');
    await vi.waitFor(() => expect(document.querySelector('#provider-status [data-status="setup-required"]')).not.toBeNull());
    assertNoSecrets(document.body.innerHTML);
    expect(request).toHaveBeenCalledOnce();
    view.cancel();
  });

  it.each(sources)('$name sanitizes body parsing exceptions containing raw and encoded authentication', async (source) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(),
      json: async () => { throw new Error(`${secrets[source.id]} Basic ${encodedCults}`); } }));
    const message = await source.createProvider().search('cap').then(() => 'unexpected success', (error: unknown) => String(error));
    expect(message).toContain('unreadable response');
    assertNoSecrets(message);
  });

  it.each(sources)('$name rejects successful data echoing its secret before rendering or loading images', async (source) => {
    const secret = secrets[source.id]!;
    const thumbnail = `https://evil.example/image?key=${encodeURIComponent(secret)}`;
    const record = source.id === 'cults3d'
      ? { name: 'Cap', url: 'https://cults3d.com/en/3d-model/tool/cap', illustrationImageUrl: thumbnail }
      : source.id === 'thingiverse'
        ? { name: 'Cap', public_url: 'https://www.thingiverse.com/thing:1', thumbnail }
        : { name: 'Cap', url: 'https://www.myminifactory.com/object/cap', images: [{ thumbnail: { url: thumbnail } }] };
    const payload = source.id === 'cults3d' ? { data: { creationsSearchBatch: { results: [record] } } }
      : source.id === 'thingiverse' ? { hits: [record] } : { items: [record] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
    const view = createResultsView(document.querySelector('main')!, [{ name: source.name, provider: source.createProvider() }]);
    view.search('cap');
    await vi.waitFor(() => expect(document.querySelector('#provider-status [data-status="failed"]')).not.toBeNull());
    expect(document.querySelectorAll('.model-card, #results-grid img')).toHaveLength(0);
    assertNoSecrets(document.body.innerHTML);
    view.cancel();
  });
});
