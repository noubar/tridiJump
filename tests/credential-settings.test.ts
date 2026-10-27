// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeCredentialSettings } from '../src/settings/provider-credentials';
import { cultsCredentialFields } from '../src/providers/cults3d';
import { loadCredentials, saveCredentials } from '../src/providers/credentials';
import { mockExtensionStorage } from './helpers/extension-storage';

const fake = { nickname: 'test-only-user', apiKey: 'FAKE-LOCAL-SECRET' };
const field = (name: string) => document.querySelector<HTMLInputElement>(`#credential-cults3d-${name}`)!;
const status = () => document.querySelector('[role="status"]')!.textContent;
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
beforeEach(() => { document.body.replaceChildren(document.createElement('section')); });
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe('credential Settings', () => {
  it('labels fields, saves locally, clears input, and never prefills an existing secret', async () => {
    mockExtensionStorage();
    const root = document.querySelector('section')!;
    await initializeCredentialSettings(root, 'cults3d', cultsCredentialFields);
    expect(status()).toBe('Not configured.');
    expect(field('apiKey').type).toBe('password');
    expect(field('apiKey').labels?.[0]?.textContent).toContain('API key');
    field('nickname').value = fake.nickname;
    field('apiKey').value = fake.apiKey;
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(await loadCredentials('cults3d', cultsCredentialFields)).toEqual(fake);
    expect(status()).toContain('Configured locally');
    expect(field('apiKey').value).toBe('');
    root.replaceChildren();
    await initializeCredentialSettings(root, 'cults3d', cultsCredentialFields);
    expect(status()).toBe('Configured locally.');
    expect(field('apiKey').value).toBe('');
    expect(root.outerHTML).not.toContain(fake.apiKey);
    document.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
    await flush();
    expect(status()).toContain('Not configured');
    expect(await loadCredentials('cults3d', cultsCredentialFields)).toBeUndefined();
  });

  it('keeps the saved key unchanged on failed replacement and hides raw errors', async () => {
    const { local } = mockExtensionStorage();
    await saveCredentials('cults3d', cultsCredentialFields, fake);
    await initializeCredentialSettings(document.querySelector('section')!, 'cults3d', cultsCredentialFields);
    local.set.mockRejectedValue(new Error(fake.apiKey));
    field('nickname').value = fake.nickname;
    field('apiKey').value = 'FAKE-REPLACEMENT';
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(status()).toContain('could not be saved');
    expect(document.body.textContent).not.toContain(fake.apiKey);
    expect(field('apiKey').value).toBe('');
    expect((await loadCredentials('cults3d', cultsCredentialFields))?.apiKey).toBe(fake.apiKey);
    local.remove.mockRejectedValue(new Error(fake.apiKey));
    document.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
    await flush();
    expect(status()).toContain('could not be removed');
    expect(document.body.textContent).not.toContain(fake.apiKey);
  });
});
