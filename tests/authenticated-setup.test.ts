// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import resultsHtml from '../src/results/index.html?raw';
import { providerAvailability } from '../src/providers/availability';
import { clearCredentials, saveCredentials } from '../src/providers/credentials';
import { readHistory, savePreferences } from '../src/shared/preferences';
import cults from './fixtures/cults3d/search.json';
import thingiverse from './fixtures/thingiverse/search.json';
import mmf from './fixtures/myminifactory/search.json';
import smithsonian from './fixtures/smithsonian/search.json';
import { mockExtensionStorage } from './helpers/extension-storage';
const sources = providerAvailability.filter((source) => source.classification === 'B');
const origins: Record<string, string> = { cults3d: 'https://cults3d.com', myminifactory: 'https://www.myminifactory.com', thingiverse: 'https://api.thingiverse.com', smithsonian: 'https://api.si.edu' };
const fixtures: Record<string, unknown> = { cults3d: cults, myminifactory: mmf, thingiverse, smithsonian };
const secrets: Record<string, string> = { cults3d: 'FAKE-SETUP-CULTS', myminifactory: 'FAKE-SETUP-MMF', thingiverse: 'FAKE-SETUP-THING', smithsonian: 'FAKE-SETUP-SMITHSONIAN' };
const basic = btoa(`setup-matrix-user:${secrets.cults3d}`);
let storage: ReturnType<typeof mockExtensionStorage>;
async function configure(id: string) {
  const source = sources.find((source) => source.id === id)!;
  await saveCredentials(id, source.createProvider().credentialFields!, { nickname: 'setup-matrix-user', apiKey: secrets[id]!, appToken: secrets[id]! });
}
function safe(value: unknown) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of [...Object.values(secrets), basic]) expect(serialized).not.toContain(secret);
}
function mockRequests(rejectId?: string, status = 401) {
  return vi.fn(async (endpoint: string, options: RequestInit) => {
    const url = new URL(endpoint);
    const id = sources.find((source) => origins[source.id] === url.origin)!.id;
    const auth = new Headers(options.headers).get('Authorization');
    if (id === 'cults3d') expect(auth).toBe(`Basic ${basic}`);
    else if (id === 'thingiverse') expect(auth).toBe(`Bearer ${secrets.thingiverse}`);
    else if (id === 'myminifactory') { expect(auth).toBeNull(); expect(url.searchParams.get('key')).toBe(secrets.myminifactory); }
    else { expect(auth).toBeNull(); expect(url.searchParams.get('api_key')).toBe(secrets.smithsonian); }
    expect(options).toMatchObject({ credentials: 'omit', redirect: 'error' });
    return new Response(JSON.stringify(id === rejectId ? { errors: [{ message: Object.values(secrets).join(' ') + basic }] } : fixtures[id]), { status: id === rejectId ? status : 200 });
  });
}
const providerRequests = (request: ReturnType<typeof mockRequests>) => request.mock.calls.filter(([url]) => /^https?:\/\//u.test(String(url)));
function submit() { document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); }
async function start(expanded = false) {
  document.body.innerHTML = resultsHtml.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
  window.history.replaceState(null, '', `/src/results/index.html?q=cap${expanded ? '&expanded=1' : ''}`);
  await import('../src/results/main');
  await vi.advanceTimersByTimeAsync(0);
}
function status(id: string) {
  return [...document.querySelectorAll('#provider-status li')].find((item) => item.textContent?.startsWith(`${sources.find((source) => source.id === id)!.name}:`))!.getAttribute('data-status');
}
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); localStorage.clear(); storage = mockExtensionStorage(); storage.data['tridijump.repositories'] = { printables: false, sketchfab: false, smithsonian: true }; });
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe.each(sources)('$name complete credential/setup flow', (source) => {
  it('missing credentials stays setup-required; saving fake configuration authenticates on the next search; removal restores setup-required', async () => {
    const request = mockRequests(); vi.stubGlobal('fetch', request);
    await start(); expect(status(source.id)).toBe('setup-required'); expect(request).not.toHaveBeenCalled();
    await configure(source.id); submit(); await vi.advanceTimersByTimeAsync(0);
    expect(status(source.id)).toBe('success'); expect(request).toHaveBeenCalledOnce();
    expect(new URL(request.mock.calls[0]![0]).origin).toBe(origins[source.id]);
    await clearCredentials(source.id); submit(); await vi.advanceTimersByTimeAsync(0);
    expect(status(source.id)).toBe('setup-required'); expect(request).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('.model-card')).toHaveLength(0);
  });

  it.each([401, 403])('HTTP %s failure is isolated while the other two authenticated sources return cards, without errors/log/history leaks', async (httpStatus) => {
    const logs = ['log', 'info', 'warn', 'error', 'debug'].map((method) => vi.spyOn(console, method as 'log').mockImplementation(() => {}));
    await savePreferences({ theme: 'system', expandedDefault: false, historyEnabled: true });
    for (const other of sources) await configure(other.id);
    const request = mockRequests(source.id, httpStatus); vi.stubGlobal('fetch', request);
    await start();
    expect(status(source.id)).toBe('failed');
    for (const other of sources.filter((other) => other.id !== source.id)) expect(status(other.id)).toBe('success');
    expect(document.querySelectorAll('.model-card')).toHaveLength((sources.length - 1) * 2);
    expect(request).toHaveBeenCalledTimes(sources.length);
    expect(document.querySelector('#provider-status')!.textContent).toContain('Check your');
    safe(document.body.innerHTML); safe(window.location.href);
    expect(await readHistory()).toEqual(['cap']); safe(await readHistory()); safe(providerAvailability);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it('conflicting registry-style metadata cannot alter bundled credential destination or authentication', async () => {
    await configure(source.id);
    const metadata = { ...source, endpoint: 'https://evil.example', apiOrigin: 'https://evil.example',
      authentication: { header: 'X-Stolen', destination: 'https://evil.example' },
      credentialProviderId: 'other-provider', credentialFields: [{ name: 'otherKey', secret: false }] };
    const request = mockRequests(); vi.stubGlobal('fetch', request);
    await metadata.createProvider().search('cap');
    expect(request).toHaveBeenCalledOnce();
    expect(new URL(request.mock.calls[0]![0]).origin).toBe(origins[source.id]);
    safe(providerAvailability);
  });

  it('Expanded Search checks a setup-required source once, skips its HTTP work, and still renders configured companions', async () => {
    for (const other of sources.filter((other) => other.id !== source.id)) await configure(other.id);
    const request = mockRequests(); vi.stubGlobal('fetch', request);
    await start(true);
    expect(document.querySelector<HTMLInputElement>('#expanded')!.checked).toBe(true);
    expect(status(source.id)).toBe('setup-required');
    expect(providerRequests(request)).toHaveLength(sources.length - 1);
    expect(providerRequests(request).every(([url]) => new URL(url).origin !== origins[source.id])).toBe(true);
    const reads = () => storage.local.get.mock.calls.filter(([key]) => key === `tridijump.credentials.${source.id}`).length;
    expect(reads()).toBe(1);
    document.querySelector<HTMLSelectElement>('#price')!.dispatchEvent(new Event('change'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reads()).toBe(1); expect(providerRequests(request)).toHaveLength(sources.length - 1);
    expect(document.querySelectorAll('.model-card')).toHaveLength((sources.length - 1) * 2);
    // Configuration becomes usable on a new explicit search, without page reload.
    await configure(source.id); submit(); await vi.advanceTimersByTimeAsync(0);
    expect(status(source.id)).toBe('success'); expect(providerRequests(request)).toHaveLength((sources.length - 1) + sources.length);
    expect(document.querySelectorAll('.model-card')).toHaveLength(sources.length * 2);
  });
});
