// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import settingsHtml from '../src/settings/index.html?raw';
import resultsHtml from '../src/results/index.html?raw';
import popupHtml from '../src/popup/index.html?raw';
import cults from './fixtures/cults3d/search.json';
import mmf from './fixtures/myminifactory/search.json';
import thingiverse from './fixtures/thingiverse/search.json';
import { providerAvailability } from '../src/providers/availability';
import { credentialDisplay, loadCredentials, saveCredentials, clearCredentials } from '../src/providers/credentials';
import { readHistory, readPreferences, savePreferences, rememberSearch, readRepositories, repositoryEnabled, setRepositoryEnabled } from '../src/shared/preferences';
import { SearchOrchestrator } from '../src/search/orchestrator';
import type { SearchSnapshot } from '../src/search/orchestrator';
import { mockExtensionStorage } from './helpers/extension-storage';
const authenticated = providerAvailability.filter((source) => source.classification === 'B');
const fakeValues = { nickname: 'fixture-user', apiKey: 'FAKE-SETTINGS-KEY', appToken: 'FAKE-SETTINGS-TOKEN' };
const fixtures: Record<string, unknown> = { cults3d: cults, myminifactory: mmf, thingiverse };
const origins: Record<string, string> = { cults3d: 'https://cults3d.com', myminifactory: 'https://www.myminifactory.com', thingiverse: 'https://api.thingiverse.com' };
function page(html: string) { document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!; }
const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
function change(selector: string, value: boolean | string) {
  const input = element<HTMLInputElement>(selector);
  if (typeof value === 'boolean') input.checked = value; else input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
beforeEach(() => { vi.resetModules(); localStorage.clear(); mockExtensionStorage().data['tridijump.repositories'] = { printables: false }; });
afterEach(() => { window.dispatchEvent(new Event('pagehide')); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('credential-independent repository enablement', () => {
  it.each(authenticated)('$name searches only when enabled and configured, and retains credentials while disabled', async (source) => {
    const provider = source.createProvider();
    const request = vi.fn().mockImplementation(async () => new Response(JSON.stringify(fixtures[source.id])));
    vi.stubGlobal('fetch', request);
    let latest!: SearchSnapshot;
    const runner = new SearchOrchestrator((update) => { latest = update; });
    const search = async (expected: string) => {
      const choices = await readRepositories();
      runner.start('cap', [provider], { disabledProviderIds: new Set(repositoryEnabled(source, choices) ? [] : [source.id]) });
      await vi.waitFor(() => expect(latest.states[0]?.status).toBe(expected));
    };
    await search('setup-required');
    await setRepositoryEnabled(source.id, false);
    await search('disabled');
    expect(request).not.toHaveBeenCalled();
    await saveCredentials(source.id, provider.credentialFields!, fakeValues);
    await search('disabled');
    expect(request).not.toHaveBeenCalled();
    expect(await loadCredentials(source.id, provider.credentialFields!)).toBeDefined();
    await setRepositoryEnabled(source.id, true);
    await search('success');
    expect(latest.results.length).toBeGreaterThan(0);
    await setRepositoryEnabled(source.id, false);
    await search('disabled');
    await setRepositoryEnabled(source.id, true);
    await search('success');
    expect(request).toHaveBeenCalledTimes(2);
    runner.cancel();
  });
  it('retains independent selections when several repository switches change quickly', async () => {
    await Promise.all([setRepositoryEnabled('cults3d', false), setRepositoryEnabled('thingiverse', false)]);
    expect(await readRepositories()).toEqual({ printables: false, cults3d: false, thingiverse: false });
  });
});

describe('credential display and bundled authentication boundary', () => {
  it.each(authenticated)('$name ignores conflicting inert metadata and never exposes secrets through display/history/logs', async (source) => {
    const logs = ['log', 'info', 'warn', 'error', 'debug'].map((method) => vi.spyOn(console, method as 'log').mockImplementation(() => {}));
    const metadata = { ...source, apiOrigin: 'https://evil.example', authHeader: 'X-Redirect',
      credentialProviderId: 'other-provider', credentialFields: [{ name: 'otherSecret', secret: false }] };
    // Production uses only this packaged factory; descriptive data is never factory options.
    const provider = metadata.createProvider();
    await savePreferences({ theme: 'system', expandedDefault: false, historyEnabled: true });
    await saveCredentials(provider.id, provider.credentialFields!, fakeValues);
    const display = await credentialDisplay(provider.id, provider.credentialFields!);
    expect(display.configured).toBe(true);
    expect(display.publicValues).toEqual(source.id === 'cults3d' ? { nickname: fakeValues.nickname } : {});
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixtures[source.id])));
    vi.stubGlobal('fetch', fetchMock);
    await provider.search('cap');
    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(new URL(endpoint as string).origin).toBe(origins[source.id]);
    if (source.id === 'cults3d') expect((init as RequestInit).headers).toHaveProperty('Authorization', `Basic ${btoa(`${fakeValues.nickname}:${fakeValues.apiKey}`)}`);
    if (source.id === 'thingiverse') expect((init as RequestInit).headers).toHaveProperty('Authorization', `Bearer ${fakeValues.appToken}`);
    if (source.id === 'myminifactory') expect(new URL(endpoint as string).searchParams.get('key')).toBe(fakeValues.apiKey);
    expect(JSON.stringify(display)).not.toMatch(/FAKE-SETTINGS/);
    expect(JSON.stringify(providerAvailability)).not.toMatch(/FAKE-SETTINGS|fixture-user/);
    expect(await readHistory()).toEqual([]);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});

describe('production Settings and entry pages', () => {
  it('autosaves repositories, defaults and theme, retains history, and never redisplays saved secrets', async () => {
    page(settingsHtml);
    await import('../src/settings/main');
    await vi.waitFor(() => expect(element<HTMLInputElement>('#repository-cults3d').disabled).toBe(false));
    change('#repository-cults3d', false);
    change('#repository-thingiverse', false);
    change('#expanded-default', true);
    change('#history-enabled', true);
    change('#theme', 'dark');
    await vi.waitFor(async () => {
      expect(await readRepositories()).toMatchObject({ cults3d: false, thingiverse: false });
      expect(await readPreferences()).toEqual({ theme: 'dark', expandedDefault: true, historyEnabled: true });
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
    element<HTMLInputElement>('#credential-cults3d-nickname').value = fakeValues.nickname;
    element<HTMLInputElement>('#credential-cults3d-apiKey').value = fakeValues.apiKey;
    element('#provider-cults3d form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(element('#provider-cults3d [role="status"]').textContent).toContain('Configured'));
    expect(element<HTMLInputElement>('#credential-cults3d-apiKey').value).toBe('');
    expect(element<HTMLFormElement>('#provider-cults3d form').hidden).toBe(true);
    expect(element('#provider-cults3d').textContent).toContain('\u2022'.repeat(8));
    expect(document.body.innerHTML).not.toContain(fakeValues.apiKey);
    expect(document.querySelector('#provider-cults3d')!.textContent).toContain(fakeValues.nickname);
    await vi.waitFor(() => expect(element('#repository-cults3d').closest('li')!.textContent).toContain('Disabled / Configured'));
    element<HTMLButtonElement>('#provider-cults3d [data-action="replace"]').click();
    expect(element<HTMLInputElement>('#credential-cults3d-apiKey').value).toBe('');
    element<HTMLInputElement>('#credential-cults3d-apiKey').value = 'FAKE-CANCELLED';
    element<HTMLButtonElement>('#provider-cults3d [data-action="cancel"]').click();
    expect(element<HTMLInputElement>('#credential-cults3d-apiKey').value).toBe('');
    expect((await loadCredentials('cults3d', sourceFields('cults3d')))?.apiKey).toBe(fakeValues.apiKey);
  });
  it('applies new defaults to future popup searches without changing an ongoing results search', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    page(resultsHtml);
    window.history.replaceState(null, '', '/src/results/index.html?q=cap');
    await import('../src/results/main');
    await vi.waitFor(() => expect(element('#provider-status').textContent).toContain('Setup required'));
    const previous = element('#provider-status').textContent;
    await savePreferences({ theme: 'dark', expandedDefault: true, historyEnabled: false });
    expect(element<HTMLInputElement>('#expanded').checked).toBe(false);
    expect(element('#provider-status').textContent).toBe(previous);
    expect(fetchMock).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    page(popupHtml);
    await import('../src/popup/main');
    expect(element<HTMLInputElement>('#expanded').checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
  it('updates local history controls without reload and retains history when collection is disabled', async () => {
    page(settingsHtml);
    await import('../src/settings/main');
    await vi.waitFor(() => expect(element<HTMLInputElement>('#history-enabled').disabled).toBe(false));
    change('#history-enabled', true);
    await vi.waitFor(async () => expect((await readPreferences()).historyEnabled).toBe(true));
    await rememberSearch('<cap & bolt>');
    await vi.waitFor(() => expect(element('#history-list').textContent).toBe('<cap & bolt>'));
    expect(element('#history-list').querySelector('cap')).toBeNull();
    change('#history-enabled', false);
    await vi.waitFor(async () => expect((await readPreferences()).historyEnabled).toBe(false));
    await rememberSearch('not saved');
    expect(await readHistory()).toEqual(['<cap & bolt>']);
    element<HTMLButtonElement>('#clear-history').click();
    await vi.waitFor(async () => expect(await readHistory()).toEqual([]));
    expect(element('#history-list').textContent).toBe('');
  });
  it('uses changed repository choices and credential removal on subsequent searches in the same Results tab', async () => {
    for (const source of authenticated) await saveCredentials(source.id, source.createProvider().credentialFields!, fakeValues);
    await setRepositoryEnabled('thingiverse', false);
    const request = vi.fn(async (endpoint: string) => {
      const id = Object.entries(origins).find(([, origin]) => origin === new URL(endpoint).origin)![0];
      return new Response(JSON.stringify(fixtures[id]));
    });
    vi.stubGlobal('fetch', request);
    page(resultsHtml); window.history.replaceState(null, '', '/src/results/index.html?q=cap');
    await import('../src/results/main');
    await vi.waitFor(() => expect(document.querySelectorAll('.model-card')).toHaveLength(4));
    expect(element('#provider-status').textContent).toContain('Thingiverse: disabled');
    expect(document.querySelector('#native-searches [data-provider-id="thingiverse"]')).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
    await setRepositoryEnabled('thingiverse', true);
    element('#search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelectorAll('.model-card')).toHaveLength(6));
    expect(request).toHaveBeenCalledTimes(5);
    await clearCredentials('myminifactory');
    element('#search-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => {
      expect(element('#provider-status').textContent).toContain('MyMiniFactory: Setup required');
      expect(document.querySelectorAll('.model-card')).toHaveLength(4);
    });
    expect(request).toHaveBeenCalledTimes(7);
  });
  it('does not dispatch provider searches if repository preferences cannot be read', async () => {
    const { local } = mockExtensionStorage();
    local.get.mockImplementation(async (key) => {
      if (key === 'tridijump.repositories') throw new Error('unavailable');
      return {};
    });
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    page(resultsHtml); window.history.replaceState(null, '', '/src/results/index.html?q=cap');
    await import('../src/results/main');
    await vi.waitFor(() => expect(element('#storage-status').textContent).toContain('Search was not started'));
    expect(request).not.toHaveBeenCalled();
  });
});
function sourceFields(id: string) { return authenticated.find((source) => source.id === id)!.createProvider().credentialFields!; }
