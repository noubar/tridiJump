// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCredentials, credentialsConfigured, loadCredentials, saveCredentials } from '../src/providers/credentials';
import { cultsCredentialFields } from '../src/providers/cults3d';
import { mockExtensionStorage } from './helpers/extension-storage';

const fake = { nickname: 'test-only-user', apiKey: 'FAKE-NOT-A-REAL-KEY' };
afterEach(() => vi.unstubAllGlobals());

describe('provider-local credentials', () => {
  it('saves, reads, checks, replaces, and removes only declared fields in extension local storage', async () => {
    const { local, sync } = mockExtensionStorage();
    const webStorage = { setItem: vi.fn(), getItem: vi.fn() };
    vi.stubGlobal('localStorage', webStorage);
    expect(await credentialsConfigured('cults3d', cultsCredentialFields)).toBe(false);
    await saveCredentials('cults3d', cultsCredentialFields, { ...fake, unexpected: 'discard' });
    expect(await credentialsConfigured('cults3d', cultsCredentialFields)).toBe(true);
    expect(await loadCredentials('cults3d', cultsCredentialFields)).toEqual(fake);
    expect(local.set).toHaveBeenCalledWith({ 'tridijump.credentials.cults3d': fake });
    await saveCredentials('cults3d', cultsCredentialFields, { ...fake, apiKey: 'FAKE-REPLACEMENT' });
    expect((await loadCredentials('cults3d', cultsCredentialFields))?.apiKey).toBe('FAKE-REPLACEMENT');
    await clearCredentials('cults3d');
    expect(await credentialsConfigured('cults3d', cultsCredentialFields)).toBe(false);
    expect(sync.set).not.toHaveBeenCalled();
    expect(sync.get).not.toHaveBeenCalled();
    expect(sync.remove).not.toHaveBeenCalled();
    expect(webStorage.setItem).not.toHaveBeenCalled();
    expect(webStorage.getItem).not.toHaveBeenCalled();
  });

  it('separates provider values and does not clear another provider', async () => {
    mockExtensionStorage();
    await saveCredentials('cults3d', cultsCredentialFields, fake);
    await saveCredentials('other-test', cultsCredentialFields, { ...fake, apiKey: 'FAKE-OTHER-PROVIDER' });
    expect((await loadCredentials('cults3d', cultsCredentialFields))?.apiKey).toBe(fake.apiKey);
    await clearCredentials('cults3d');
    expect((await loadCredentials('other-test', cultsCredentialFields))?.apiKey).toBe('FAKE-OTHER-PROVIDER');
  });

  it.each([null, [], 'bad', {}, { nickname: 'test' }, { ...fake, apiKey: '  ' }, { ...fake, apiKey: 12 }])('treats incomplete or malformed stored values as unconfigured: %j', async (value) => {
    const { data } = mockExtensionStorage();
    data['tridijump.credentials.cults3d'] = value;
    expect(await loadCredentials('cults3d', cultsCredentialFields)).toBeUndefined();
  });

  it('does not expose raw storage errors or overwrite existing credentials with incomplete input', async () => {
    const { local } = mockExtensionStorage();
    await saveCredentials('cults3d', cultsCredentialFields, fake);
    await expect(saveCredentials('cults3d', cultsCredentialFields, { nickname: 'test' })).rejects.toThrow('Complete all');
    expect(local.set).toHaveBeenCalledOnce();
    local.get.mockRejectedValue(new Error(fake.apiKey));
    local.set.mockRejectedValue(new Error(fake.apiKey));
    local.remove.mockRejectedValue(new Error(fake.apiKey));
    for (const action of [
      loadCredentials('cults3d', cultsCredentialFields),
      saveCredentials('cults3d', cultsCredentialFields, fake), clearCredentials('cults3d'),
    ]) await expect(action).rejects.not.toThrow(fake.apiKey);
  });

  it('has no web-storage fallback when the extension API is unavailable', async () => {
    vi.stubGlobal('chrome', undefined);
    vi.stubGlobal('browser', undefined);
    await expect(loadCredentials('cults3d', cultsCredentialFields)).rejects.toThrow('could not be read');
  });
});
