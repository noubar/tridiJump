// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrintablesRuntime } from './helpers/printables-runtime';
import { createPrintablesProvider } from '../src/providers/printables';
import { printablesRuntime, type PrintablesReply } from '../src/providers/printables-messages';
import fixture from './fixtures/printables/search.json';

let messaging: ReturnType<typeof mockPrintablesRuntime>;
const valid = { type: 'printables.search', query: 'cap', limit: 20, offset: 0 };
beforeEach(() => { messaging = mockPrintablesRuntime(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('trusted Printables background boundary', () => {
  it('prefers the Firefox promise-based browser runtime when available', () => {
    const firefoxRuntime = { ...messaging.runtime, id: 'firefox-extension' };
    vi.stubGlobal('browser', { runtime: firefoxRuntime });
    expect(printablesRuntime()).toBe(firefoxRuntime);
  });

  it('registers the actual worker entry synchronously and keeps asynchronous response channels open', async () => {
    messaging = mockPrintablesRuntime(false); vi.resetModules();
    await import('../src/background');
    expect(messaging.runtime.onMessage.addListener).toHaveBeenCalledOnce();
    const request = vi.fn(async () => new Response(JSON.stringify(fixture))); vi.stubGlobal('fetch', request);
    const respond = vi.fn();
    expect(messaging.listener()(valid, messaging.sender, respond)).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    const reply = respond.mock.calls[0]![0] as PrintablesReply;
    expect(reply.ok).toBe(true);
    if (reply.ok) {
      expect(reply.page.results[0]).toMatchObject({ providerId: 'printables', title: 'Fixture cap', downloads: 42 });
      expect(reply.page.results[0]!.url).toBe('https://www.printables.com/model/999999981-fixture-cap');
    }
    expect(reply).not.toHaveProperty('headers'); expect(reply).not.toHaveProperty('data');
  });

  it.each([
    null, [], {}, { ...valid, type: 'fetch' }, { ...valid, type: 'printables.other' },
    { ...valid, query: '' }, { ...valid, query: '   ' }, { ...valid, query: ' cap ' },
    { ...valid, query: 12 }, { ...valid, query: 'x'.repeat(201) },
    { ...valid, limit: 0 }, { ...valid, limit: -1 }, { ...valid, limit: 21 }, { ...valid, limit: 1.5 }, { ...valid, limit: '20' },
    { ...valid, offset: -1 }, { ...valid, offset: 0.5 }, { ...valid, offset: '0' }, { ...valid, offset: 2_147_483_648 },
    { ...valid, url: 'https://evil.example' }, { ...valid, origin: 'https://evil.example' },
    { ...valid, hostname: 'evil.example' }, { ...valid, headers: { Authorization: 'FAKE-HEADER' } },
    { ...valid, Authorization: 'FAKE-HEADER' }, { ...valid, method: 'DELETE' },
    { ...valid, operation: '{ mutation { guessed } }' },
  ])('rejects invalid/unknown/proxy message %j without network access', (message) => {
    const request = vi.fn(); vi.stubGlobal('fetch', request); const respond = vi.fn();
    expect(messaging.listener()(message, messaging.sender, respond)).toBe(false);
    expect(respond).toHaveBeenCalledExactlyOnceWith({ ok: false, error: { kind: 'invalid-request' } });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    {}, { id: 'another-extension', url: 'chrome-extension://test-extension/src/results/index.html' },
    { id: 'test-extension', url: 'https://www.printables.com/search/models?q=cap' },
    { id: 'test-extension', url: 'chrome-extension://other/src/results/index.html' },
    { id: 'test-extension', url: 'chrome-extension://test-extension/src/settings/index.html' },
    { id: 'test-extension', url: 'chrome-extension://test-extension/src/results/index.html.evil' },
    { id: 'test-extension', url: 'invalid' },
  ])('ignores non-results-page sender %j', (sender) => {
    const request = vi.fn(); vi.stubGlobal('fetch', request); const respond = vi.fn();
    expect(messaging.listener()(valid, sender, respond)).toBe(false);
    expect(respond).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  });

  it('accepts bounded numeric inputs but fixes endpoint, method, headers and anonymity in worker code', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify(fixture))); vi.stubGlobal('fetch', request);
    const reply = await messaging.runtime.sendMessage({ type: 'printables.search', query: 'x'.repeat(200), limit: 1, offset: 25 });
    expect(reply).toMatchObject({ ok: true });
    const [endpoint, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(endpoint).toBe('https://api.printables.com/graphql/');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    expect(JSON.parse(init!.body as string).query).toContain('limit: 1, offset: 25');
    expect([...new Headers(init!.headers).keys()].map((key) => key.toLowerCase()).sort()).toEqual(['accept', 'content-type']);
    expect(JSON.stringify([endpoint, init])).not.toMatch(/Authorization|Bearer|Basic|Cookie|FAKE-/);
  });

  it.each([
    { payload: fixture, status: 403, kind: 'http' },
    { payload: { errors: [{ message: 'UNTRUSTED-ERROR-BODY' }], data: fixture.data }, status: 200, kind: 'graphql' },
    { payload: { data: 'UNTRUSTED-ERROR-BODY' }, status: 200, kind: 'invalid-response' },
  ])('returns only a sanitized $kind category over messaging', async ({ payload, status, kind }) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status })));
    const reply = await messaging.runtime.sendMessage(valid as typeof valid & { type: 'printables.search' });
    expect(reply).toEqual({ ok: false, error: { kind, ...(kind === 'http' ? { status } : {}) } });
    expect(JSON.stringify(reply)).not.toContain('UNTRUSTED-ERROR-BODY');
  });

  it.each([null, {}, { ok: true, page: { results: 'bad' } }, { ok: true, page: { results: [{}] } },
    { ok: true, page: { results: [], nextCursor: 'https://evil.example' } },
    { ok: false, error: { kind: 'GUESS', message: 'FAKE-SECRET' } }])('sanitizes malformed transport replies %j', async (reply) => {
    vi.spyOn(messaging.runtime, 'sendMessage').mockResolvedValue(reply);
    const error = await createPrintablesProvider().search('cap').catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error); expect(String(error)).toContain('background transport is unavailable');
    expect(String(error)).not.toContain('FAKE-SECRET');
  });
  it('does not fall back to page fetch when the message channel is missing or fails', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    vi.spyOn(messaging.runtime, 'sendMessage').mockRejectedValue(new Error('FAKE-SECRET chrome message error'));
    await expect(createPrintablesProvider().search('cap')).rejects.toThrow('background transport is unavailable');
    vi.stubGlobal('chrome', undefined);
    await expect(createPrintablesProvider().search('cap')).rejects.toThrow('background transport is unavailable');
    expect(request).not.toHaveBeenCalled();
  });
  it('immediately rejects cancellation while a worker response remains pending', async () => {
    vi.spyOn(messaging.runtime, 'sendMessage').mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController(); const task = createPrintablesProvider().search('cap', controller.signal);
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
  });
});
