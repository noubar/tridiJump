// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import settingsHtml from '../src/settings/index.html?raw';
import resultsHtml from '../src/results/index.html?raw';
import { providerAvailability } from '../src/providers/availability';
import { clearCredentials, saveCredentials } from '../src/providers/credentials';
import { resolveRepositoryState, resolveRepositoryStates } from '../src/providers/repository-state';
import { readRepositories, setRepositoryEnabled } from '../src/shared/preferences';
import { SearchOrchestrator } from '../src/search/orchestrator';
import type { SearchSnapshot } from '../src/search/orchestrator';
import { mockExtensionStorage } from './helpers/extension-storage';

const authenticated = providerAvailability.filter((source) => 'createProvider' in source
  && source.createProvider().credentialFields?.length);
const fakeValues = { nickname: 'fixture-user', apiKey: 'FAKE-AVAILABILITY-KEY', appToken: 'FAKE-AVAILABILITY-TOKEN' };
const page = (html: string) => { document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!; };

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('credential-aware repository state', () => {
  it('derives credential requirements from provider contracts and disables every unconfigured API on first install', async () => {
    mockExtensionStorage();
    const states = await resolveRepositoryStates(providerAvailability, {});
    expect(authenticated.map((source) => source.id).sort()).toEqual(['cults3d', 'myminifactory', 'smithsonian', 'thingiverse']);
    for (const source of authenticated) {
      expect(states.get(source.id)).toMatchObject({
        supported: true,
        requiresCredentials: true,
        credentialsConfigured: false,
        available: false,
        searchEnabled: false,
      });
    }
    expect(states.get('printables')).toMatchObject({ requiresCredentials: false, available: true, searchEnabled: true });
    expect(states.get('sketchfab')).toMatchObject({ requiresCredentials: false, available: true, searchEnabled: true });
  });

  it('preserves existing explicit preferences through configuration and removal', async () => {
    mockExtensionStorage();
    const source = providerAvailability.find((item) => item.id === 'cults3d')!;
    await setRepositoryEnabled(source.id, false);
    await saveCredentials(source.id, source.createProvider().credentialFields!, fakeValues);
    expect(await resolveRepositoryState(source, await readRepositories())).toMatchObject({
      credentialsConfigured: true, available: true, userEnabled: false, searchEnabled: false,
    });
    await setRepositoryEnabled(source.id, true);
    expect((await resolveRepositoryState(source, await readRepositories())).searchEnabled).toBe(true);
    await clearCredentials(source.id);
    expect(await readRepositories()).toMatchObject({ cults3d: true });
    expect(await resolveRepositoryState(source, await readRepositories())).toMatchObject({
      credentialsConfigured: false, available: false, userEnabled: true, searchEnabled: false,
    });
  });

  it('represents setup-required without dispatching the provider, including Expanded Search variants', async () => {
    const search = vi.fn();
    let latest!: SearchSnapshot;
    const runner = new SearchOrchestrator((snapshot) => { latest = snapshot; });
    runner.start('cap', [{ id: 'configured-api', search }], {
      disabledProviderIds: new Set(['configured-api']),
      setupRequiredProviderIds: new Set(['configured-api']),
      expandedQueries: ['hat', 'lid'],
    });
    expect(latest.states).toEqual([{ providerId: 'configured-api', status: 'setup-required' }]);
    expect(search).not.toHaveBeenCalled();
  });

  it('updates Settings immediately after credential removal while retaining the saved enable preference', async () => {
    const storage = mockExtensionStorage();
    storage.data['tridijump.repositories'] = { cults3d: true };
    const source = providerAvailability.find((item) => item.id === 'cults3d')!;
    await saveCredentials(source.id, source.createProvider().credentialFields!, fakeValues);
    page(settingsHtml);
    await import('../src/settings/main');
    const checkbox = document.querySelector<HTMLInputElement>('#repository-cults3d')!;
    await vi.waitFor(() => expect(checkbox.disabled).toBe(false));
    expect(checkbox.checked).toBe(true);
    document.querySelector<HTMLButtonElement>('#provider-cults3d [data-action="remove"]')!.click();
    await vi.waitFor(() => expect(checkbox.disabled).toBe(true));
    expect(checkbox.checked).toBe(false);
    expect(checkbox.closest('li')!.textContent).toContain('Setup required');
    expect(await readRepositories()).toMatchObject({ cults3d: true });
  });

  it('aborts an active authenticated search when its credentials are removed', async () => {
    const storage = mockExtensionStorage();
    storage.data['tridijump.repositories'] = Object.fromEntries(providerAvailability.map((source) => [source.id, source.id === 'cults3d']));
    const source = providerAvailability.find((item) => item.id === 'cults3d')!;
    await saveCredentials(source.id, source.createProvider().credentialFields!, fakeValues);
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetchMock);
    page(resultsHtml);
    window.history.replaceState(null, '', '/src/results/index.html?q=cap');
    await import('../src/results/main');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await clearCredentials('cults3d');
    await vi.waitFor(() => expect(requestSignal?.aborted).toBe(true));
    await vi.waitFor(() => expect(document.querySelector('#provider-status')!.textContent).toContain('Cults3D: Setup required'));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
